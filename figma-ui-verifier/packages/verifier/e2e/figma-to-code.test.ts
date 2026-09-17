import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { readFile, rm, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser } from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { parseFigmaTree } from '../src/figma/parser.js';
import { normalizeFigmaNodes } from '../src/figma/normalizer.js';
import { inspectDOM, setupViewport } from '../src/dom/inspector.js';
import { mockTextContent } from '../src/dom/mock.js';
import { normalizeDOMNodes } from '../src/dom/normalizer.js';
import { diffNodes } from '../src/diff/engine.js';
import { comparePixels } from '../src/diff/pixel.js';
import { calculateScore } from '../src/score/scorer.js';
import { DEFAULT_CONFIG, DEFAULT_WEIGHTS } from '../src/config.js';

import { generateCode, generateCodeFallback, type Framework } from './helpers/code-gen.js';
import { startViteServer, waitForServer, stopViteServer, type ViteServer } from './helpers/vite-server.js';

// ── 配置 ──────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const FIGMA_JSON = join(ROOT, 'figma-data', 'h5-ecommerce.json');
const OUTPUT_DIR = join(ROOT, 'e2e', 'output');        // 截图、报告等持久输出
const TMP_DIR = join(ROOT, 'e2e', '.tmp');              // 构建产物，测试后清理

const USE_CLAUDE_CLI = !process.env.E2E_USE_FALLBACK;
const SCORE_THRESHOLD = USE_CLAUDE_CLI ? 40 : 25;

// 设计图路径（用户提供，放 figma-data/ 下）
const DESIGN_IMAGE = process.env.DESIGN_IMAGE
  || join(ROOT, 'figma-data', 'h5-ecommerce.png');

// ── 工具函数 ──────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

/** 读取 PNG 图片宽高（只解析 IHDR chunk，不加载全图） */
async function getImageSize(path: string): Promise<{ width: number; height: number }> {
  const buf = await readFile(path);
  // PNG IHDR: 8-byte signature + 4-byte length + "IHDR" + 4-byte width + 4-byte height
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// ── 测试 ──────────────────────────────────────────────────

describe('E2E: Figma → AI Code → Verification', () => {
  let browser: Browser;
  let figmaNodes: ReturnType<typeof parseFigmaTree>;
  let hasDesignImage: boolean;
  let viewportWidth = 375; // 默认移动端宽度

  beforeAll(async () => {
    // 读取 Figma JSON
    const figmaJson = await readFile(FIGMA_JSON, 'utf-8');
    const apiResponse = JSON.parse(figmaJson);
    const nodeKey = Object.keys(apiResponse.nodes)[0];
    figmaNodes = parseFigmaTree(apiResponse.nodes[nodeKey].document);
    console.log(`[e2e] Figma nodes: ${figmaNodes.length}`);

    // 检查设计图，读取尺寸以设定视口宽度
    hasDesignImage = await fileExists(DESIGN_IMAGE);
    if (hasDesignImage) {
      const imgSize = await getImageSize(DESIGN_IMAGE);
      viewportWidth = imgSize.width;
      console.log(`[e2e] Design image: ${imgSize.width}x${imgSize.height}, viewport width set to ${viewportWidth}px`);
    } else {
      console.warn(`[e2e] ⚠ Design image not found: ${DESIGN_IMAGE}`);
      console.warn('[e2e]   Pixel comparison will be skipped. Save the Figma design PNG to enable it.');
    }

    // 准备输出目录
    await mkdir(OUTPUT_DIR, { recursive: true });
    await mkdir(TMP_DIR, { recursive: true });

    // 启动浏览器
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    // 只清理构建产物，保留截图输出
    await rm(TMP_DIR, { recursive: true, force: true });
  });

  // ── 核心流程（React + Vue 共用） ──

  async function runVerification(framework: Framework) {
    const buildDir = join(TMP_DIR, framework);
    const screenshotPath = join(OUTPUT_DIR, `${framework}-screenshot.png`);
    let server: ViteServer | undefined;

    try {
      // Step 1: 生成代码
      console.log(`[e2e:${framework}] Generating code...`);
      if (USE_CLAUDE_CLI) {
        await generateCode(FIGMA_JSON, framework, buildDir);
      } else {
        await generateCodeFallback(FIGMA_JSON, framework, buildDir);
      }

      // 保存生成的源码到 output/
      const codeOutputDir = join(OUTPUT_DIR, `${framework}-code`);
      const { cp } = await import('node:fs/promises');
      await cp(buildDir, codeOutputDir, {
        recursive: true,
        filter: (src) => !src.includes('node_modules'),
      });
      console.log(`[e2e:${framework}] Code saved: ${codeOutputDir}`);

      // Step 2: npm install
      console.log(`[e2e:${framework}] Installing dependencies...`);
      const { execSync } = await import('node:child_process');
      execSync('npm install --registry=https://registry.npmjs.org', {
        cwd: buildDir,
        stdio: 'pipe',
        timeout: 120_000,
      });

      // Step 3: 启动 Vite dev server
      console.log(`[e2e:${framework}] Starting Vite server...`);
      server = await startViteServer(buildDir);
      await waitForServer(server.url);
      console.log(`[e2e:${framework}] Server ready at ${server.url}`);

      // Step 4: Puppeteer 渲染
      const page = await browser.newPage();
      await setupViewport(page, viewportWidth);
      await page.goto(server.url, { waitUntil: 'networkidle0', timeout: 30_000 });
      await mockTextContent(page);

      // Step 5: 截图（持久保存到 output/）
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`[e2e:${framework}] Screenshot saved: ${screenshotPath}`);

      // Step 6: 提取 DOM
      const codeElements = await inspectDOM(page);
      console.log(`[e2e:${framework}] DOM elements with data-figma-id: ${codeElements.length}`);

      // Step 7: 结构化 Diff + 评分
      const normalizedFigma = normalizeFigmaNodes(figmaNodes, {
        viewportWidth,
        textMock: true,
      });
      const normalizedCode = normalizeDOMNodes(codeElements);
      const diffResult = diffNodes(normalizedFigma, normalizedCode, DEFAULT_CONFIG);
      const scoreResult = calculateScore(
        diffResult.diffs,
        diffResult.matched,
        diffResult.missing,
        diffResult.extra,
        DEFAULT_WEIGHTS,
        normalizedFigma.length,
      );

      console.log(`[e2e:${framework}] Score: ${scoreResult.overall}`);
      console.log(`[e2e:${framework}] Breakdown:`, scoreResult.breakdown);

      // Step 8: 像素级对比（如果有设计图）
      let pixelScore = 0;
      if (hasDesignImage) {
        console.log(`[e2e:${framework}] Running pixel comparison...`);
        const designBuffer = await readFile(DESIGN_IMAGE);
        const screenshotBuffer = await readFile(screenshotPath);
        const pixelResult = await comparePixels(designBuffer, screenshotBuffer);

        // 像素分数 = SSIM × 100（SSIM 0~1 → 0~100）
        pixelScore = Math.round(pixelResult.ssimScore * 100 * 10) / 10;

        console.log(`[e2e:${framework}] SSIM: ${pixelResult.ssimScore.toFixed(4)} (pass: ${pixelResult.ssimPass})`);
        console.log(`[e2e:${framework}] Pixel mismatch: ${(pixelResult.pixelMismatchRatio * 100).toFixed(2)}% (pass: ${pixelResult.pixelPass})`);
        console.log(`[e2e:${framework}] Mismatch regions: ${pixelResult.mismatchRegions.length}`);
        console.log(`[e2e:${framework}] Pixel score: ${pixelScore}`);

        // 保存 diff 图片
        if (pixelResult.diffImageBuffer) {
          const diffPath = join(OUTPUT_DIR, `${framework}-diff.png`);
          const { writeFile } = await import('node:fs/promises');
          await writeFile(diffPath, pixelResult.diffImageBuffer);
          console.log(`[e2e:${framework}] Diff image saved: ${diffPath}`);
        }
      }

      // Step 9: 综合评分
      // 结构化分数 × 0.5 + 像素分数 × 0.5（无设计图时像素分=0，退化为纯结构化）
      const structuralScore = scoreResult.overall;
      const finalScore = hasDesignImage
        ? Math.round((structuralScore * 0.5 + pixelScore * 0.5) * 10) / 10
        : structuralScore;

      // ── 评分报告 ──
      console.log('');
      console.log(`╔══════════════════════════════════════════════╗`);
      console.log(`║  ${framework.toUpperCase()} Verification Report`);
      console.log(`╠══════════════════════════════════════════════╣`);
      console.log(`║  Structural score:  ${structuralScore}`);
      for (const [k, v] of Object.entries(scoreResult.breakdown)) {
        console.log(`║    ${k}: ${v}`);
      }
      if (hasDesignImage) {
        console.log(`║  Pixel score (SSIM): ${pixelScore}`);
      }
      console.log(`║  ────────────────────────`);
      console.log(`║  FINAL SCORE: ${finalScore}`);
      console.log(`╚══════════════════════════════════════════════╝`);
      console.log('');

      // Step 10: 断言
      expect(finalScore).toBeGreaterThanOrEqual(SCORE_THRESHOLD);
      expect(diffResult.matched.length).toBeGreaterThan(0);
      if (hasDesignImage) {
        // fallback 模板生成的代码像素分较低，阈值放宽松
        const pixelThreshold = USE_CLAUDE_CLI ? 40 : 10;
        expect(pixelScore).toBeGreaterThanOrEqual(pixelThreshold);
      }

    } finally {
      if (server) await stopViteServer(server);
    }
  }

  // ── 测试用例 ──

  test('React: generate → render → verify', () => runVerification('react'), 300_000);
  test('Vue: generate → render → verify', () => runVerification('vue'), 300_000);
});
