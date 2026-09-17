# Figma UI 还原度验证工具 — 实现计划

> 设计文档: `docs/superpowers/specs/2026-09-17-figma-ui-fidelity-verifier-design.md`
> 创建时间: 2026-09-17

## 项目初始化

```
figma-ui-verifier/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── src/
│   ├── index.ts                  # CLI 入口
│   ├── types.ts                  # 共享类型定义
│   ├── config.ts                 # 容差/权重配置
│   ├── figma/
│   │   ├── parser.ts             # Figma JSON → 标准节点树
│   │   ├── normalizer.ts         # 色彩/尺寸归一化
│   │   └── cache.ts              # Figma API 缓存
│   ├── dom/
│   │   ├── inspector.ts          # Puppeteer DOM 属性提取
│   │   ├── mock.ts               # 文本 Mock 归一化
│   │   └── normalizer.ts         # DOM 侧归一化
│   ├── diff/
│   │   ├── engine.ts             # Diff 主引擎
│   │   └── comparators/
│   │       ├── layout.ts         # 位置/尺寸/rotation
│   │       ├── color.ts          # fills/strokes/opacity (CIEDE2000)
│   │       ├── typography.ts     # 字体/字号/行高/字间距
│   │       ├── effects.ts        # shadow/blur/mask
│   │       └── auto-layout.ts    # flex 映射
│   ├── match/
│   │   └── matcher.ts            # 匈牙利算法兜底匹配
│   ├── score/
│   │   ├── scorer.ts             # 单断点评分
│   │   └── aggregator.ts         # 多断点木桶聚合
│   └── report/
│       ├── cli-report.ts         # JSON 输出 + exit code
│       ├── html-report.ts        # 可视化 Diff HTML
│       └── fix-suggestions.ts    # 修复建议生成
└── __tests__/
    ├── figma/
    │   ├── parser.test.ts
    │   └── normalizer.test.ts
    ├── dom/
    │   ├── inspector.test.ts
    │   ├── mock.test.ts
    │   └── normalizer.test.ts
    ├── diff/
    │   ├── engine.test.ts
    │   └── comparators/
    │       ├── layout.test.ts
    │       ├── color.test.ts
    │       ├── typography.test.ts
    │       ├── effects.test.ts
    │       └── auto-layout.test.ts
    ├── match/
    │   └── matcher.test.ts
    ├── score/
    │   ├── scorer.test.ts
    │   └── aggregator.test.ts
    └── report/
        ├── cli-report.test.ts
        └── fix-suggestions.test.ts
```

## 依赖

```json
{
  "dependencies": {
    "puppeteer": "^24.0.0",
    "pixelmatch": "^6.0.0",
    "ssim.js": "^3.5.0",
    "delta-e": "^0.0.8",
    "munkres-js": "^1.2.2",
    "pngjs": "^7.0.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0",
    "@types/pixelmatch": "^5.2.0",
    "@types/pngjs": "^6.0.0"
  }
}
```

---

## Phase 1: MVP — 结构化对比

### 1.1 项目脚手架

**Task**: 初始化项目结构、TypeScript 配置、Vitest 配置

- `package.json` — type: module, scripts: build/test
- `tsconfig.json` — target: ES2022, module: NodeNext
- `vitest.config.ts`
- `.gitignore`

**验证**: `npm test` 通过（空测试套件）

### 1.2 类型定义

**Task**: 定义核心数据结构

```typescript
// src/types.ts

/** Figma 原始节点（从 API JSON 解析） */
export interface FigmaNode {
  id: string;
  name: string;
  type: string; // FRAME | TEXT | RECTANGLE | VECTOR | INSTANCE | COMPONENT | GROUP
  visible?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  fills?: FigmaFill[];
  strokes?: FigmaFill[];
  effects?: FigmaEffect[];
  clipsContent?: boolean;
  isMask?: boolean;
  // Auto-Layout
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutGrow?: number;
  layoutAlign?: string;
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  // Typography (TEXT nodes)
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  characters?: string;
  // Spacing
  padding?: { top: number; right: number; bottom: number; left: number };
  itemSpacing?: number;
  // Instance
  componentId?: string;
  overrides?: FigmaOverride[];
  componentPropertyReferences?: Record<string, string>;
  children?: FigmaNode[];
}

export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'IMAGE' | string;
  color?: { r: number; g: number; b: number; a: number };
  visible?: boolean;
  opacity?: number;
}

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  radius: number;
  offset?: { x: number; y: number };
  color?: { r: number; g: number; b: number; a: number };
}

export interface FigmaOverride {
  id: string;
  overriddenFields: string[];
}

/** 归一化后的标准节点 */
export interface NormalizedNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  // Position (相对父容器)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  // Colors (sRGB, 0-255)
  backgroundColor?: { r: number; g: number; b: number; a: number };
  borderColor?: { r: number; g: number; b: number; a: number };
  opacity?: number;
  // Border
  borderRadius?: number | [number, number, number, number];
  // Spacing
  padding?: { top: number; right: number; bottom: number; left: number };
  gap?: number;
  // Typography
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textContent?: string; // Mock 后的 "X..." 字符串
  // Effects
  boxShadow?: string;
  filter?: string;
  backdropFilter?: string;
  // Layout
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  overflow?: string;
  // Meta
  isComponent: boolean;
  isInstance: boolean;
  parentId?: string;
  children?: NormalizedNode[];
  instanceOverrides?: Record<string, unknown>;
}

export interface DiffResult {
  nodeId: string;
  nodeName: string;
  category: 'completeness' | 'position_size' | 'color_style' | 'typography' | 'layout_properties';
  property: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
  diff?: string;
  fix?: string;
}

export interface ScoreBreakdown {
  completeness: number;
  position_size: number;
  color_style: number;
  typography: number;
  layout_properties: number;
}

export interface VerifyResult {
  score: number;
  passed: boolean;
  threshold: number;
  breakdown: Record<string, { score: number; weight: number }>;
  viewport_scores?: Record<string, { score: number; ssim?: number; pixel_diff?: number }>;
  aggregated_score?: number;
  missing_nodes: number;
  extra_nodes: number;
  total_nodes: number;
  diffs: DiffResult[];
}
```

**验证**: TypeScript 编译通过

### 1.3 配置模块

**Task**: 容差配置 + 评分权重 + 默认配置

```typescript
// src/config.ts
export interface ToleranceConfig {
  position: { x: number; y: number };
  size: { width: number; height: number };
  color: {
    deltaE2000: number;
    r: number; g: number; b: number; a: number;
  };
  fontSize: number;
  borderRadius: number;
  spacing: number;
  opacity: number;
  rotation: number;
}

export interface WeightConfig {
  completeness: number;      // 0.10
  position_size: number;     // 0.25
  color_style: number;       // 0.20
  typography: number;        // 0.20
  layout_properties: number; // 0.25
}

export const DEFAULT_TOLERANCES: ToleranceConfig = {
  position: { x: 2, y: 2 },
  size: { width: 2, height: 2 },
  color: { deltaE2000: 3.0, r: 5, g: 5, b: 5, a: 0.02 },
  fontSize: 1,
  borderRadius: 1,
  spacing: 2,
  opacity: 0.02,
  rotation: 1,
};

export const DEFAULT_WEIGHTS: WeightConfig = {
  completeness: 0.10,
  position_size: 0.25,
  color_style: 0.20,
  typography: 0.20,
  layout_properties: 0.25,
};

export const DEFAULT_CONFIG = {
  tolerances: DEFAULT_TOLERANCES,
  weights: DEFAULT_WEIGHTS,
  threshold: 80,
  includeHiddenNodes: false,
  ciGateEnabled: true,
};
```

**验证**: 单元测试 — 默认配置值正确

### 1.4 Figma Parser

**Task**: 解析 Figma API JSON → 标准节点树

```typescript
// src/figma/parser.ts
export function parseFigmaTree(figmaJson: FigmaNode): FigmaNode[] {
  // 1. 递归遍历节点树
  // 2. 过滤 visible: false 的节点（根据配置）
  // 3. 对 TEXT 节点执行 Mock（characters → 等长 "X"）
  // 4. 展平为数组（保留 parentId 引用）
  // 5. 提取 auto-layout 属性
}
```

**测试用例**:
- 嵌套 FRAME 节点树展平
- TEXT 节点 Mock 归一化
- hidden 节点过滤
- INSTANCE 节点提取 overrides
- 空节点树

### 1.5 Figma Normalizer

**Task**: Figma 属性 → 标准化值

```typescript
// src/figma/normalizer.ts
export function normalizeFigmaNode(node: FigmaNode): NormalizedNode {
  // 1. P3 → sRGB 色彩转换
  // 2. 坐标转相对（减去父节点 absoluteBoundingBox）
  // 3. 文本 Mock
  // 4. Auto-layout 属性映射
  // 5. Effects 转 CSS 字符串
}
```

**测试用例**:
- P3 白色 → sRGB (255, 255, 255)
- P3 红色 → sRGB 精确值验证
- 坐标相对化
- auto-layout HORIZONTAL → flex-direction: row
- DROP_SHADOW → box-shadow 字符串
- rotation 转换（负值 → CSS deg）

### 1.6 DOM Inspector

**Task**: Puppeteer 提取 DOM computed styles

```typescript
// src/dom/inspector.ts
export async function inspectDOM(page: Page): Promise<NormalizedNode[]> {
  // 1. 遍历所有带 data-figma-id 的元素
  // 2. 对每个元素：
  //    - getBoundingClientRect() → 位置/尺寸
  //    - getComputedStyle() → 所有样式属性
  //    - offsetWidth/Height（经 box-sizing 归一化）
  //    - 递归子元素
  // 3. 返回 NormalizedNode[]
}

export async function setupViewport(page: Page, width: number): Promise<void> {
  await page.setViewport({ width, height: 800 });
  // 锁定视口宽度为 Figma Frame 宽度
}
```

**测试用例**:
- 带 data-figma-id 的元素提取
- box-sizing: border-box 正确尺寸
- box-sizing: content-box 归一化尺寸
- getBoundingClientRect 相对坐标计算
- 无 data-figma-id 的元素跳过

### 1.7 DOM Mock

**Task**: 运行时文本替换

```typescript
// src/dom/mock.ts
export async function mockTextContent(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.trim()) {
        node.textContent = node.textContent.replace(/\S/g, 'X');
      }
    }
  });
}
```

**测试用例**:
- 单行文本 Mock
- 多行文本保留换行
- 空文本跳过
- 嵌套文本节点

### 1.8 DOM Normalizer

**Task**: DOM 属性标准化

```typescript
// src/dom/normalizer.ts
export function normalizeDOMNode(raw: RawDOMElement): NormalizedNode {
  // 1. box-sizing 检测 + 尺寸归一化
  // 2. getBoundingClientRect → 相对父元素坐标
  // 3. 颜色字符串 → {r, g, b, a} 对象
  // 4. border-radius 解析（单值/四值）
  // 5. padding 解析
  // 6. display/flex 属性提取
}
```

**测试用例**:
- `rgb(255, 255, 255)` → `{r:255, g:255, b:255, a:1}`
- `rgba(0,0,0,0.5)` → `{r:0, g:0, b:0, a:0.5}`
- border-box 尺寸直接用
- content-box 尺寸归一化
- `8px 12px 8px 12px` padding 解析

### 1.9 Diff Comparators

**Task**: 逐属性类别对比器

每个 comparator 接口：
```typescript
interface Comparator {
  compare(expected: NormalizedNode, actual: NormalizedNode, tolerances: ToleranceConfig): DiffResult[];
}
```

#### layout.ts — 位置/尺寸
```typescript
// 对比 x, y, width, height, rotation
// x/y 容差 2px, size 容差 2px, rotation 容差 1°
```

#### color.ts — 颜色
```typescript
// CIEDE2000 色差计算
// 对比 backgroundColor, borderColor, opacity
// 容差: deltaE2000 < 3.0

// import { diff } from 'delta-e';
// const deltaE = diff(
//   { L: labExpected.L, A: labExpected.A, B: labExpected.B },
//   { L: labActual.L, A: labActual.A, B: labActual.B }
// );
```

#### typography.ts — 字体排版
```typescript
// 对比 fontSize, fontFamily, fontWeight, lineHeight, letterSpacing
// fontSize 容差 1px, 其他精确匹配
```

#### effects.ts — 效果
```typescript
// 对比 boxShadow, filter, backdropFilter
// 字符串标准化后精确匹配
```

#### auto-layout.ts — 布局属性
```typescript
// 对比 display, flexDirection, justifyContent, alignItems, gap, overflow
// gap 容差 2px, 其他精确匹配
```

**测试用例（每个 comparator）**:
- 完全匹配 → pass
- 容差内偏差 → pass
- 容差外偏差 → fail + diff 值 + fix 建议
- 缺失属性 → fail
- 边界值（恰好等于容差）

### 1.10 Diff Engine

**Task**: 主引擎 — ID 匹配 + 调度 comparators

```typescript
// src/diff/engine.ts
export function diffNodes(
  figmaNodes: NormalizedNode[],
  domNodes: NormalizedNode[],
  config: typeof DEFAULT_CONFIG
): { matched: MatchedPair[]; missing: NormalizedNode[]; extra: NormalizedNode[] } {
  // 1. 按 data-figma-id / id 匹配
  // 2. 分类: matched / missing / extra
  // 3. 对每对 matched 节点调用 5 个 comparators
  // 4. 返回所有 DiffResult[]
}
```

**测试用例**:
- 完整匹配 — 所有节点对齐
- 部分缺失 — Figma 有 DOM 无
- 部分多余 — DOM 有 Figma 无
- 混合场景
- 空节点树

### 1.11 Scorer

**Task**: 计算类别分 + 总分

```typescript
// src/score/scorer.ts
export function calculateScore(
  diffs: DiffResult[],
  matched: MatchedPair[],
  missing: NormalizedNode[],
  extra: NormalizedNode[],
  weights: WeightConfig
): ScoreBreakdown & { overall: number } {
  // 1. 按 category 分组
  // 2. 类别得分 = pass 数 / 总属性数 × 100
  // 3. 缺失节点: 该节点在每个类别得 0
  // 4. 多余节点: 面积比例扣分（max 3 分/个）
  // 5. 总分 = Σ (权重 × 类别分)
}
```

**测试用例**:
- 全部通过 → 100 分
- 全部失败 → 0 分
- 混合场景验证权重计算
- 缺失节点扣分
- 多余节点面积扣分

### 1.12 CLI Report

**Task**: JSON 输出 + exit code

```typescript
// src/report/cli-report.ts
export function generateCLIReport(result: VerifyResult): string {
  return JSON.stringify({
    score: result.score,
    passed: result.passed,
    threshold: result.threshold,
    breakdown: result.breakdown,
    missing_nodes: result.missing_nodes,
    extra_nodes: result.extra_nodes,
    total_nodes: result.total_nodes,
  }, null, 2);
}
```

**Exit codes**:
- `process.exit(0)` — score >= threshold
- `process.exit(1)` — score < threshold
- `process.exit(2)` — 工具异常

**测试用例**:
- JSON 结构正确
- exit code 0/1 对应逻辑

### 1.13 CLI 入口

**Task**: Commander.js CLI

```typescript
// src/index.ts
import { Command } from 'commander';

const program = new Command();
program
  .name('figma-ui-verifier')
  .description('Figma-to-DOM UI fidelity verification')
  .requiredOption('--figma-json <path>', 'Figma API JSON file')
  .requiredOption('--url <url>', 'Local dev server URL')
  .option('--threshold <number>', 'CI gate threshold', '80')
  .option('--viewport <width>', 'Viewport width (px)', '1440')
  .option('--output <path>', 'Output report path', './figma-verify-report.json')
  .action(async (options) => {
    // 1. 读取 Figma JSON
    // 2. 启动 Puppeteer
    // 3. 设置视口
    // 4. Mock 文本
    // 5. 提取 DOM
    // 6. 归一化两侧
    // 7. Diff
    // 8. Score
    // 9. Report
    // 10. Exit
  });
```

**测试用例**:
- 正常运行输出 JSON
- 缺少必填参数报错
- threshold 自定义
- exit code 验证

### 1.14 集成测试

**Task**: 端到端测试用例

```typescript
// __tests__/integration.test.ts
describe('E2E verification', () => {
  it('should score 100 for perfect match', async () => {
    // 准备 Figma JSON + 匹配的 HTML
    // 运行验证
    // 断言 score = 100
  });

  it('should detect missing nodes', async () => {
    // Figma 有 3 个节点，DOM 只有 2 个
    // 断言 missing_nodes = 1
  });

  it('should detect color mismatch', async () => {
    // 颜色偏差超出 CIEDE2000 容差
    // 断言 color_style 分数降低
  });

  it('should exit 1 when below threshold', async () => {
    // 设置高 threshold
    // 断言 exit code = 1
  });
});
```

---

## Phase 2: 可视化 + 像素级

### 2.1 像素级对比

**Task**: SSIM + Pixel Diff

```typescript
// src/diff/pixel.ts
export async function pixelCompare(
  figmaImage: Buffer,   // Figma 导出截图
  domScreenshot: Buffer, // Puppeteer 截图
  options?: { textMask?: boolean }
): Promise<{ ssim: number; pixelDiffPercent: number; diffImage: Buffer }> {
  // 1. 尺寸对齐（resize 较小者）
  // 2. SSIM 计算（ssim.js）
  // 3. Pixel Diff（pixelmatch）
  // 4. 可选：文本遮罩（排除文本区域）
  // 5. 生成 diff 热力图 PNG
}
```

**判定标准**:
- SSIM > 0.90 且 pixel_diff < 2% → 通过
- SSIM < 0.80 或 pixel_diff > 5% → 标红
- 中间区域 → 标黄

### 2.2 HTML 报告

**Task**: 可视化 Diff 报告生成

```typescript
// src/report/html-report.ts
export function generateHTMLReport(
  result: VerifyResult,
  figmaScreenshot: Buffer,
  domScreenshot: Buffer,
  diffImage: Buffer
): string {
  // 返回完整 HTML 字符串
  // 左右对比 | Overlay 模式 | 热力图
  // 节点详情面板（点击显示属性 diff）
  // 分数仪表盘
}
```

### 2.3 修复建议生成

**Task**: 属性级修复建议

```typescript
// src/report/fix-suggestions.ts
export function generateFixSuggestions(diffs: DiffResult[]): FixSuggestion[] {
  // 对每个 failed diff:
  // - 计算 expected px 和 actual px
  // - 尝试推断 specified 值（rem/em）
  // - 生成英文修复指令
}

interface FixSuggestion {
  nodeId: string;
  nodeName: string;
  property: string;
  expectedPx: string;
  actualPx: string;
  actualSpecified?: string;
  diff: string;
  fix: string;
}
```

---

## Phase 3: 智能化

### 3.1 匈牙利匹配（兜底）

**Task**: 当无 data-figma-id 时，基于空间+类型匹配

```typescript
// src/match/matcher.ts
export function hungarianMatch(
  figmaNodes: NormalizedNode[],
  domNodes: NormalizedNode[]
): MatchedPair[] {
  // 1. 构建成本矩阵: cost(i,j) = 1 - (IoU × 0.6 + 类型匹配 × 0.4)
  // 2. 匈牙利算法求解
  // 3. 过滤 IoU < 0.5 的匹配
}
```

### 3.2 响应式多断点

**Task**: 多视口验证 + 木桶聚合

```typescript
// src/score/aggregator.ts
export function aggregateScores(scores: number[]): number {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  return avg * Math.pow(min / avg, 0.3);
}
```

### 3.3 组件实例处理

**Task**: Instance 只验证 overrides

### 3.4 隐藏节点 + 无样式 wrapper 过滤

### 3.5 CI/CD 集成模板 + Figma API 缓存

---

## Phase 4: 增强

- 行为层验证（Figma Prototype）
- Vision AI 辅助评估
- Design Token 名称校验
- 跨浏览器验证（Playwright Firefox/WebKit）
- 团队 dashboard + 历史趋势

---

## 执行顺序

```
Phase 1 按依赖顺序执行:
  1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9 → 1.10 → 1.11 → 1.12 → 1.13 → 1.14

Phase 2 依赖 Phase 1:
  2.1 → 2.2 → 2.3

Phase 3 依赖 Phase 2:
  3.1 → 3.2 → 3.3 → 3.4 → 3.5

Phase 4 独立，可并行
```
