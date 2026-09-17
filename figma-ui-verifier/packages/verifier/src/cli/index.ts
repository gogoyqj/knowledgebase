#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import puppeteer from 'puppeteer';
import { parseFigmaTree } from '../figma/parser.js';
import { normalizeFigmaNodes } from '../figma/normalizer.js';
import { inspectDOM, setupViewport } from '../dom/inspector.js';
import { mockTextContent } from '../dom/mock.js';
import { normalizeDOMNodes } from '../dom/normalizer.js';
import { diffNodes } from '../diff/engine.js';
import { calculateScore } from '../score/scorer.js';
import { aggregateScores } from '../score/aggregator.js';
import { generateCLIReport } from '../report/cli-report.js';
import { DEFAULT_CONFIG } from '../config.js';
import type { FigmaNode, VerifyResult } from '../types.js';

const program = new Command();

program
  .name('figma-verify')
  .description('Figma-to-DOM UI fidelity verification tool')
  .requiredOption('--figma-json <path>', 'Path to Figma API JSON file')
  .requiredOption('--url <url>', 'Local dev server URL to verify against')
  .option('--threshold <number>', 'CI gate score threshold', '80')
  .option('--viewport <width>', 'Viewport width in px (single breakpoint)', '1440')
  .option('--viewports <widths>', 'Comma-separated viewport widths for responsive verification')
  .option('--output <path>', 'Output report file path', './figma-verify-report.json')
  .option('--include-hidden', 'Include hidden Figma nodes', false)
  .action(async (opts) => {
    let exitCode = 0;
    try {
      const figmaJson: FigmaNode = JSON.parse(
        readFileSync(resolve(opts.figmaJson), 'utf-8'),
      );

      const config = {
        ...DEFAULT_CONFIG,
        threshold: parseInt(opts.threshold, 10),
        includeHiddenNodes: opts.includeHidden,
      };

      // 解析 Figma 节点树
      const figmaNodes = parseFigmaTree(figmaJson, {
        includeHiddenNodes: config.includeHiddenNodes,
      });
      const figmaNormalized = normalizeFigmaNodes(figmaNodes);

      // 视口列表
      const viewports = opts.viewports
        ? opts.viewports.split(',').map((v: string) => parseInt(v.trim(), 10))
        : [parseInt(opts.viewport, 10)];

      // 启动 Puppeteer
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      // 访问页面
      await page.goto(opts.url, { waitUntil: 'networkidle0' });

      const viewportScores: Record<string, { score: number }> = {};

      for (const vp of viewports) {
        // 设置视口
        await setupViewport(page, vp);
        await page.goto(opts.url, { waitUntil: 'networkidle0' });

        // Mock 文本
        await mockTextContent(page);

        // 提取 DOM
        const rawDom = await inspectDOM(page);
        const domNormalized = normalizeDOMNodes(rawDom);

        // Diff
        const diffResult = diffNodes(figmaNormalized, domNormalized, config);

        // Score
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

      // 聚合分数
      const scores = Object.values(viewportScores).map(v => v.score);
      const aggregatedScore = aggregateScores(scores);
      const passed = aggregatedScore >= config.threshold;

      const result: VerifyResult = {
        score: aggregatedScore,
        passed,
        threshold: config.threshold,
        breakdown: {}, // 单断点时填入，多断点时聚合
        viewport_scores: viewportScores,
        aggregated_score: aggregatedScore,
        missing_nodes: 0,
        extra_nodes: 0,
        total_nodes: figmaNodes.length,
        diffs: [],
        missing: [],
        extra: [],
      };

      // 输出报告
      const report = generateCLIReport(result);
      writeFileSync(resolve(opts.output), report, 'utf-8');
      console.log(report);

      exitCode = passed ? 0 : 1;
    } catch (err) {
      console.error('Verification error:', err);
      exitCode = 2;
    }

    process.exit(exitCode);
  });

program.parse();
