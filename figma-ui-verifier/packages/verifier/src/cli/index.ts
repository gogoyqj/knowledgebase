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
import { generateHTMLReport } from '../report/html.js';
import { generateFixSuggestions } from '../report/fix-suggestions.js';
import { DEFAULT_CONFIG } from '../config.js';
import type { FigmaNode, VerifyResult, DiffResult } from '../types.js';

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
  .option('--html <path>', 'Output HTML visualization report path')
  .option('--include-hidden', 'Include hidden Figma nodes', false)
  .option('--skip-instance-children', 'Skip children of INSTANCE nodes (component internals)', false)
  .option('--pixel', 'Enable pixel-level comparison (SSIM + Pixel Diff)', false)
  .option('--figma-token <token>', 'Figma API token for screenshots')
  .option('--figma-file-key <key>', 'Figma file key for screenshots')
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
        skipInstanceChildren: opts.skipInstanceChildren,
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

      const viewportScores: Record<string, { score: number; ssim?: number; pixel_diff?: number }> = {};
      const allDiffs: DiffResult[] = [];

      // 截图存储
      let figmaScreenshot: Buffer | undefined;
      let domScreenshot: Buffer | undefined;
      let diffScreenshot: Buffer | undefined;
      let pixelResult: Awaited<ReturnType<typeof import('../diff/pixel.js').comparePixels>> | undefined;

      for (const vp of viewports) {
        // 设置视口
        await setupViewport(page, vp);
        await page.goto(opts.url, { waitUntil: 'networkidle0' });

        // Mock 文本
        await mockTextContent(page);

        // 截图 DOM
        if (opts.pixel || opts.html) {
          domScreenshot = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;
        }

        // 提取 DOM
        const rawDom = await inspectDOM(page);
        const domNormalized = normalizeDOMNodes(rawDom);

        // Diff
        const diffResult = diffNodes(figmaNormalized, domNormalized, config);
        allDiffs.push(...diffResult.diffs);

        // Score
        const scoreResult = calculateScore(
          diffResult.diffs,
          diffResult.matched,
          diffResult.missing,
          diffResult.extra,
          config.weights,
          figmaNodes.length,
        );

        // 像素级对比
        if (opts.pixel && domScreenshot) {
          try {
            const { comparePixels } = await import('../diff/pixel.js');
            // Figma 截图（需要 API token 和 file key）
            if (opts.figmaToken && opts.figmaFileKey) {
              const { FigmaAPI } = await import('../figma/cache.js');
              const figmaAPI = new FigmaAPI(opts.figmaToken);
              figmaScreenshot = (await figmaAPI.getScreenshot(opts.figmaFileKey, figmaJson.id, vp)) ?? undefined;

              if (figmaScreenshot) {
                pixelResult = comparePixels(figmaScreenshot, domScreenshot);
                viewportScores[String(vp)] = {
                  score: scoreResult.overall,
                  ssim: pixelResult.ssimScore,
                  pixel_diff: pixelResult.pixelMismatchRatio,
                };
              } else {
                viewportScores[String(vp)] = { score: scoreResult.overall };
              }
            } else {
              console.warn('⚠ Pixel comparison requires --figma-token and --figma-file-key');
              viewportScores[String(vp)] = { score: scoreResult.overall };
            }
          } catch (err) {
            console.warn('⚠ Pixel comparison failed:', err);
            viewportScores[String(vp)] = { score: scoreResult.overall };
          }
        } else {
          viewportScores[String(vp)] = { score: scoreResult.overall };
        }
      }

      await browser.close();

      // 聚合分数
      const scores = Object.values(viewportScores).map(v => v.score);
      const aggregatedScore = aggregateScores(scores);
      const passed = aggregatedScore >= config.threshold;

      // 生成修复建议
      const fixSuggestions = generateFixSuggestions(allDiffs);

      const result: VerifyResult = {
        score: aggregatedScore,
        passed,
        threshold: config.threshold,
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

      // JSON 报告
      const report = generateCLIReport(result);
      writeFileSync(resolve(opts.output), report, 'utf-8');
      console.log(report);

      // HTML 报告
      if (opts.html) {
        // 生成 diff 截图（如果有像素对比）
        if (pixelResult?.diffImageBuffer) {
          diffScreenshot = pixelResult.diffImageBuffer;
        }

        const htmlReport = generateHTMLReport({
          result,
          fixSuggestions,
          screenshot: figmaScreenshot && domScreenshot ? {
            figma: `data:image/png;base64,${figmaScreenshot.toString('base64')}`,
            dom: `data:image/png;base64,${domScreenshot.toString('base64')}`,
            diff: diffScreenshot ? `data:image/png;base64,${diffScreenshot.toString('base64')}` : '',
          } : undefined,
          pixelResult: pixelResult ? {
            ssimScore: pixelResult.ssimScore,
            pixelMismatchRatio: pixelResult.pixelMismatchRatio,
            mismatchRegions: pixelResult.mismatchRegions,
          } : undefined,
        });
        writeFileSync(resolve(opts.html), htmlReport, 'utf-8');
        console.log(`\n📄 HTML report: ${resolve(opts.html)}`);
      }

      exitCode = passed ? 0 : 1;
    } catch (err) {
      console.error('Verification error:', err);
      exitCode = 2;
    }

    process.exit(exitCode);
  });

program.parse();