# 如何验证 AI 生成的 UI 是否忠实于设计稿

## 问题：AI 写的页面，到底像不像？

用 Claude / Cursor / Copilot 生成前端代码已经不是新鲜事了。给一段 Figma 设计稿的 JSON 描述，AI 几秒钟就能吐出一个完整的 React 或 Vue 页面。

快是快了。但有一个问题一直悬着——

**生成的 UI 和设计稿，到底差多少？**

肉眼看一遍？一个页面几十个节点，颜色差 3 个色阶你未必看得出来。让设计师 review？设计师的时间不该花在逐像素比对上。写单元测试？传统测试断言的是功能逻辑，不是"这个按钮的颜色应该是 #FF6B35 而不是 #FF7043"。

我们需要一个自动化的方案：输入设计稿和生成的代码，输出一个可信的保真度分数。

---

## 方案概述：三层验证

整个验证分三层，从粗到细：

1. **结构化 Diff**——按节点 ID 逐属性对比（颜色、排版、布局、间距），输出每个属性的 pass/fail
2. **像素级对比**——用 SSIM（结构相似性）和 pixelmatch 做截图级别的视觉对比
3. **综合评分**——把两层结果加权合并为一个 0-100 的分数

先说核心的设计决策。

---

## 锚点：data-figma-id

验证的前提是能**匹配**设计稿节点和 DOM 元素。

没有锚点的话，匹配就退化成"猜"——靠空间位置、节点类型、子节点数量去推断谁对应谁。这种模糊匹配在节点少的时候还行，节点一多就崩了。

所以方案的第一步是在生成代码时要求 AI 给每个 DOM 元素加一个 `data-figma-id` 属性，值就是 Figma 节点的原始 ID：

```html
<div data-figma-id="3:4" class="header">
  <div data-figma-id="3:5" class="search-box">
    <span data-figma-id="3:6">9:41</span>
  </div>
</div>
```

有了这个锚点，匹配就是 O(1) 的 Map 查找，不存在歧义。

但万一 AI 漏加了某些 `data-figma-id` 呢？这时候启用**匈牙利算法兜底**——对未匹配的节点，按空间位置（x, y, width, height）和节点类型计算代价矩阵，跑一遍 O(n³) 的最优匹配。不完美，但比丢弃不匹配要好。

---

## 归一化：在同一个坐标系下比较

Figma 和浏览器用的不是同一套坐标系。

Figma 的颜色是 P3 色域、0~1 浮点数；浏览器是 sRGB、0~255 整数。Figma 的布局可能是绝对定位（absoluteBoundingBox），浏览器可能是 flex 布局。Figma 的文本节点记录的是 `characters` 字段，浏览器是 DOM textContent。

所以对比之前必须做归一化：

- **颜色**：Figma API 返回的颜色值是归一化浮点数（0~1），乘以 255 转为整数（0~255）即可，不需要色域空间转换
- **位置**：绝对坐标 → 相对父容器的偏移
- **文本**：统一替换为等长 "X" 字符串（文本内容不影响布局验证，但长度必须一致）

归一化之后，两边的节点在同一个"坐标系"下，才能做有意义的对比。

---

## 结构化 Diff：五个维度，逐属性过

Diff 引擎对每对匹配节点跑 5 个 Comparator：

| 维度 | 对比属性 | 容差 |
|------|---------|------|
| position_size | x, y, width, height | ±2px |
| color_style | background-color, border-color, opacity, effects | CIEDE2000 ≤ 3.0 |
| typography | fontSize, fontFamily, fontWeight, lineHeight, letterSpacing | fontSize ±1px, lineHeight/letterSpacing ±2px |
| layout_properties | display, flexDirection, justifyContent, alignItems, gap, padding | 布局方向精确匹配, gap/padding ±2px |

颜色用的不是简单的 RGB 差值，而是 **CIEDE2000**——CIE 在 2001 年发布的感知色差标准。它模拟人眼对颜色的感知：同样差 10 个 RGB 值，深蓝色区域的感知差异比浅灰色区域大得多。阈值设为 3.0，在这个范围内人眼基本看不出区别。

```typescript
// 颜色匹配：优先 CIEDE2000，降级到放宽的 RGB
export function colorMatch(expected, actual, tolerances): boolean {
  if (Math.abs(expected.a - actual.a) > tolerances.a) return false;
  const de = deltaE2000(expected, actual);
  if (de <= tolerances.deltaE2000) return true;
  // 降级：放宽的 RGB
  return Math.abs(expected.r - actual.r) <= tolerances.r &&
         Math.abs(expected.g - actual.g) <= tolerances.g &&
         Math.abs(expected.b - actual.b) <= tolerances.b;
}
```

为什么要降级？因为 CIEDE2000 在极端颜色（接近纯黑、纯白）下偶尔会给出偏大的色差值，放宽的 RGB 作为安全网兜底。

---

## 像素级对比：SSIM + pixelmatch

结构化 Diff 能告诉你"字号差了 2px"、"背景色不对"，但它看不到渲染层面的东西——抗锯齿差异、图片加载失败、字体 fallback 导致的行高变化。

所以第二层是截图级别的像素对比。

两张图的比较用了两个算法：

**SSIM（Structural Similarity）**——结构相似性指数。它把图片分成局部窗口，从亮度、对比度、结构三个维度打分，输出 0~1 的值。0.95 以上通常认为是"几乎一样"。它对全局亮度偏移比较敏感，但对局部像素错位比较宽容。

**pixelmatch**——逐像素对比。它会标记出每一对不同的像素，输出 mismatch 比例和差异区域。对"某块区域完全画错了"这种问题特别敏感。

两者互补：SSIM 看整体结构是否一致，pixelmatch 看具体哪里不一样。测试中会生成一张差异热力图，红色区域就是 mismatch 的地方——一眼就能看出问题出在哪。

```
[e2e:react] SSIM: 0.4931 (pass: false)
[e2e:react] Pixel mismatch: 25.78% (pass: false)
[e2e:react] Mismatch regions: 190
```

这里 SSIM 0.49 是 fallback 模板生成器的结果（不是 AI 生成的），分数偏低是预期的。真实 AI 生成的代码通常在 0.6~0.8 之间。

---

## 评分模型

五个维度的得分按权重加权：

```typescript
const weights = {
  completeness:   0.10,  // 节点覆盖率
  position_size:  0.25,  // 位置和尺寸
  color_style:    0.20,  // 颜色和样式
  typography:     0.20,  // 排版
  layout_properties: 0.25,  // 布局属性
};
```

completeness 的计算比较有意思——它不是简单的 "匹配数 / 总数"，还要扣分：每个多余的 DOM 节点按面积占比扣分，单个节点上限 3 分。为什么按面积？因为一个 100x100 的多余 div 比一个 10x10 的多余 span 影响大得多。

最终的综合分数 = 结构化分数 × 0.5 + 像素分数 × 0.5。如果没提供设计图，就只用结构化分数。

当存在多个视口断点时（比如同时验证 375px 和 768px），各断点的分数会通过木桶效应公式聚合：`avg × (min/avg)^0.3`——最低分的断点会拉低最终分数，避免"一个断点 90 分另一个 30 分，平均 60 分及格"的虚假通过。

---

## E2E 测试：从 Figma 到分数

整个流程串起来是这样：

```
Figma JSON + 设计图
       ↓
  Claude CLI 生成代码（React / Vue）
       ↓
  npm install → Vite dev server
       ↓
  Puppeteer 渲染 + 截图 + DOM 提取
       ↓
  归一化 → Diff → 评分
       ↓
  输出：分数 + diff 热力图 + 生成的源码
```

测试里有一个 fallback 模板生成器，不依赖 Claude CLI，用于 CI 环境或快速验证流水线本身是否工作。它读取 Figma JSON 的节点树和 mock.json 的数据，直接生成带 `data-figma-id` 的 React/Vue 代码。

视口宽度从设计图自动读取——PNG 文件的 IHDR chunk 里就有宽高，不需要额外配置：

```typescript
async function getImageSize(path: string): Promise<{ width: number; height: number }> {
  const buf = await readFile(path);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}
```

---

## Auto-Layout 映射

Figma 的 auto-layout 和 CSS flexbox 有对应关系，但不完全一致：

| Figma | CSS |
|-------|-----|
| layoutMode: HORIZONTAL | flex-direction: row |
| layoutMode: VERTICAL | flex-direction: column |
| primaryAxisAlignItems: MIN | justify-content: flex-start |
| primaryAxisAlignItems: CENTER | justify-content: center |
| primaryAxisAlignItems: MAX | justify-content: flex-end |
| primaryAxisAlignItems: SPACE_BETWEEN | justify-content: space-between |
| counterAxisAlignItems: MIN | align-items: flex-start |
| counterAxisAlignItems: CENTER | align-items: center |
| counterAxisAlignItems: MAX | align-items: flex-end |
| counterAxisAlignItems: BASELINE | align-items: baseline |

Diff 引擎的 auto-layout comparator 就是检查这些映射是否正确。AI 生成的代码经常在 `justify-content` 和 `align-items` 上搞混——这在视觉上会导致子元素排列方向错误，但不看代码可能不容易发现。

---

## Component Instance 处理

Figma 的 INSTANCE 节点是从 COMPONENT 复制来的，它的 children 来自组件定义，不是实例自己定义的。如果不过滤，一个按钮组件被用了 10 次，就会多出 10 倍的子节点去匹配——全部 miss。

所以 parser 有一个 `skipInstanceChildren` 选项：遇到 INSTANCE 节点时，跳过它的 children，只记录 INSTANCE 本身。匹配时就不会被组件内部结构干扰。

---

## 接入方式

工具提供了三种接入方式，覆盖不同的使用场景：

**CLI**——命令行直接跑，适合本地开发和 CI：

```bash
figma-verify --figma-json design.json --url http://localhost:5173 \
  --threshold 80 --pixel --html report.html
```

**MCP Server**——暴露 `verify`、`get_report`、`get_fix_suggestions` 三个 tool，AI coding 工具（Claude Code、Cursor）可以直接调用。生成代码后立刻验证，验证不过就自动修。

**Claude Code Skill**——`/figma-verify` 命令，引导式流程：自动检测 Figma JSON → 选择框架 → 生成代码 → 验证 → 查看报告。

---

## Mock 数据：像素对比的前提

像素级对比（SSIM + pixelmatch）比较的是两张截图——设计图和渲染结果。如果两张图里的文字、图片不一样，SSIM 必然很低，但这个低分反映的不是"布局还原差"，而是"内容不一样"。

所以像素对比有一个隐含前提：**设计图和代码必须使用同一份数据**。

具体来说，Figma JSON 只记录了节点树的结构（frame 尺寸、auto-layout 配置），不包含具体的文案和图片内容。那些内容在 Figma 设计图的 PNG 导出里，但不在 JSON 里。如果生成的代码读取一份独立的 mock.json（产品名、图片 URL 都不一样），渲染出来的页面和设计图必然"长得不一样"——不是因为布局错了，而是因为内容完全不同。

解法有两种路径：

**路径 A：mock 数据驱动设计图**。先定义 mock.json，再用这份数据在 Figma 里填充设计稿，导出设计图。这样设计图和代码用的是同一份内容，像素对比才有意义。

**路径 B：结构级对比为主，像素对比为辅**。把像素对比的定位从"保真度主指标"调整为"布局一致性参考"——结构化 diff 负责精确的属性级验证，像素对比只看整体布局骨架是否一致，对具体内容差异做降权处理。实际 e2e 测试中，fallback 模板生成器走的就是这条路：它渲染 mock 数据，但像素阈值设得很低（SSIM ≥ 0.1），只要求"大致像"而不是"一模一样"。

当前方案采用路径 B。如果要做到路径 A 的精度，需要在 Figma 端集成 mock 数据注入——用 Figma API 或插件把 mock.json 的内容写入设计节点，再导出截图。这是后续可以探索的方向。

---

## 现实的分数

用 fallback 模板生成器跑出来的分数大概在 30~50 之间——因为它只是机械地把 Figma 节点转成 HTML，不做任何设计还原。AI 生成的代码通常在 60~80 之间，取决于设计稿的复杂度和 prompt 的质量。

分数不是越高越好——如果一个页面只有几个大色块，AI 很容易拿 90+；如果是一个复杂的电商首页，60 分已经算不错了。关键不是分数本身，而是 diff 报告里列出的具体问题："background-color 差了 deltaE2000=4.2"、"flex-direction 应该是 column 但实际是 row"——这些才是能指导 AI 迭代的信息。

---

## 待解的问题

当前方案有几个已知的局限：

图片对比的 SSIM 对页面高度很敏感——如果设计图 1650px 高但渲染出来只有 1200px，光是底部空白就会拉低 SSIM。需要做高度对齐后再比。

响应式布局的验证还是个空白。当前只验证固定视口宽度下的保真度，没有覆盖"在 375px 和 768px 下分别应该长什么样"。

Behavioral verification（hover、active、focus 状态）和 Vision AI（用多模态模型做主观评估）已经实现了接口，但在 e2e 测试里还没有端到端串联起来。

这些是下一步要解的。
