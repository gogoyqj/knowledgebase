#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

import {
  parseFigmaTree,
  normalizeFigmaNodes,
  inspectDOM,
  setupViewport,
  mockTextContent,
  normalizeDOMNodes,
  diffNodes,
  calculateScore,
  aggregateScores,
  generateCLIReport,
  generateHTMLReport,
  generateFixSuggestions,
  DEFAULT_CONFIG,
  FigmaAPI,
} from '@figma-ui-verifier/verifier';

import type {
  FigmaNode,
  VerifyResult,
  DiffResult,
  FixSuggestion,
} from '@figma-ui-verifier/verifier';

/**
 * Figma UI Verifier MCP Server
 * Exposes verification tools for AI coding integration
 */
class FigmaVerifyServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'figma-verify', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'verify',
          description: 'Run Figma UI verification against a live URL',
          inputSchema: {
            type: 'object',
            properties: {
              figma_json_path: {
                type: 'string',
                description: 'Path to Figma API JSON file',
              },
              url: {
                type: 'string',
                description: 'Local dev server URL to verify against',
              },
              threshold: {
                type: 'number',
                description: 'CI gate score threshold (0-100)',
                default: 80,
              },
              viewports: {
                type: 'array',
                items: { type: 'number' },
                description: 'Viewport widths for responsive verification',
                default: [1440],
              },
              skip_instance_children: {
                type: 'boolean',
                description: 'Skip children of INSTANCE nodes',
                default: false,
              },
            },
            required: ['figma_json_path', 'url'],
          },
        },
        {
          name: 'get_report',
          description: 'Get the latest verification report',
          inputSchema: {
            type: 'object',
            properties: {
              format: {
                type: 'string',
                enum: ['json', 'html'],
                description: 'Report format',
                default: 'json',
              },
            },
          },
        },
        {
          name: 'get_fix_suggestions',
          description: 'Get fix suggestions for failed verification',
          inputSchema: {
            type: 'object',
            properties: {
              figma_json_path: {
                type: 'string',
                description: 'Path to Figma API JSON file',
              },
              url: {
                type: 'string',
                description: 'Local dev server URL',
              },
            },
            required: ['figma_json_path', 'url'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const safeArgs = args ?? {};

      try {
        switch (name) {
          case 'verify':
            return await this.handleVerify(safeArgs);
          case 'get_report':
            return await this.handleGetReport(safeArgs);
          case 'get_fix_suggestions':
            return await this.handleGetFixSuggestions(safeArgs);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleVerify(args: Record<string, unknown>) {
    const figmaJsonPath = args.figma_json_path as string;
    const url = args.url as string;
    const threshold = (args.threshold as number) ?? 80;
    const viewports = (args.viewports as number[]) ?? [1440];
    const skipInstanceChildren = (args.skip_instance_children as boolean) ?? false;

    const figmaJson: FigmaNode = JSON.parse(
      readFileSync(resolve(figmaJsonPath), 'utf-8'),
    );

    const config = {
      ...DEFAULT_CONFIG,
      threshold,
      includeHiddenNodes: false,
    };

    // Parse Figma tree
    const figmaNodes = parseFigmaTree(figmaJson, {
      includeHiddenNodes: config.includeHiddenNodes,
      skipInstanceChildren,
    });
    const figmaNormalized = normalizeFigmaNodes(figmaNodes);

    // Launch Puppeteer
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });

    const viewportScores: Record<string, { score: number }> = {};
    const allDiffs: DiffResult[] = [];

    for (const vp of viewports) {
      await setupViewport(page, vp);
      await page.goto(url, { waitUntil: 'networkidle0' });
      await mockTextContent(page);

      const rawDom = await inspectDOM(page);
      const domNormalized = normalizeDOMNodes(rawDom);

      const diffResult = diffNodes(figmaNormalized, domNormalized, config);
      allDiffs.push(...diffResult.diffs);

      const scoreResult = calculateScore(
        diffResult.diffs,
        diffResult.matched,
        diffResult.missing,
        diffResult.extra,
        config.weights,
        figmaNodes.length,
      );

      viewportScores[String(vp)] = { score: scoreResult.overall };
    }

    await browser.close();

    const scores = Object.values(viewportScores).map(v => v.score);
    const aggregatedScore = aggregateScores(scores);
    const passed = aggregatedScore >= threshold;

    const result: VerifyResult = {
      score: aggregatedScore,
      passed,
      threshold,
      breakdown: {},
      viewport_scores: viewportScores,
      aggregated_score: aggregatedScore,
      missing_nodes: 0,
      extra_nodes: 0,
      total_nodes: figmaNodes.length,
      diffs: allDiffs,
      missing: [],
      extra: [],
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            score: result.score,
            passed: result.passed,
            threshold: result.threshold,
            viewport_scores: result.viewport_scores,
            total_diffs: result.diffs.length,
            failed_diffs: result.diffs.filter(d => !d.pass).length,
          }, null, 2),
        },
      ],
    };
  }

  private async handleGetReport(args: Record<string, unknown>) {
    const format = (args.format as string) ?? 'json';

    // For now, return a placeholder
    // In production, this would return the last stored report
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            message: 'Report retrieval not yet implemented. Use verify tool first.',
            format,
          }),
        },
      ],
    };
  }

  private async handleGetFixSuggestions(args: Record<string, unknown>) {
    const figmaJsonPath = args.figma_json_path as string;
    const url = args.url as string;

    const figmaJson: FigmaNode = JSON.parse(
      readFileSync(resolve(figmaJsonPath), 'utf-8'),
    );

    const config = DEFAULT_CONFIG;
    const figmaNodes = parseFigmaTree(figmaJson);
    const figmaNormalized = normalizeFigmaNodes(figmaNodes);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });
    await mockTextContent(page);

    const rawDom = await inspectDOM(page);
    const domNormalized = normalizeDOMNodes(rawDom);

    const diffResult = diffNodes(figmaNormalized, domNormalized, config);
    await browser.close();

    const fixSuggestions = generateFixSuggestions(diffResult.diffs);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            total_suggestions: fixSuggestions.length,
            suggestions: fixSuggestions.slice(0, 20), // Limit to top 20
          }, null, 2),
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Figma Verify MCP server running on stdio');
  }
}

const server = new FigmaVerifyServer();
server.run().catch(console.error);