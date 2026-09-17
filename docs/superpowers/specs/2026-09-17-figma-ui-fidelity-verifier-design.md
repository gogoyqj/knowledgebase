# Figma-to-DOM 节点级 UI 还原度验证工具

## 概述

构建一个自动化验证工具，通过 Figma node ID 建立设计稿节点与 AI Coding 生成的 DOM 节点的一一映射，逐节点对比视觉属性，输出还原度评分、可视化 diff 报告和修复建议。

### 核心思路

Figma 输出结构化 JSON（含 node ID），AI Coding 参考 node ID 生成带 `data-figma-id` 属性的 DOM 结构，验证工具按 ID 匹配后逐属性对比。

### 前提约束

- Figma 文件必须通过 `file_version` 或 `branch_sha` 锁定版本快照
- 喂给 AI Coding 的 Figma 数据必须与验证工具读取的是**同一份快照**
- Node ID 仅在单文件单版本内稳定；跨文件复制、Detach Instance 会导致 ID 重新生成

## 架构

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Figma API  │───▶│  Figma Parser    │───▶│  Reference JSON │
│  (设计稿)    │    │  (节点树提取)     │    │  (标准化)        │
└─────────────┘    └──────────────────┘    └────────┬────────┘
                                                     │
                                                     ▼
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  AI Coding  │───▶│  DOM Inspector   │───▶│  Actual JSON    │
│  (生成代码)  │    │  (DOM 属性提取)   │    │  (标准化)        │
└─────────────┘    └──────────────────┘    └────────┬────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────┐
                                          │   Diff Engine    │
                                          │   (逐节点比对)    │
                                          └────────┬────────┘
                                                     │
                                    ┌────────────────┼────────────────┐
                                    ▼                ▼                ▼
                              ┌──────────┐   ┌──────────┐   ┌──────────────┐
                              │  分数报告  │   │ 可视化Diff│   │  修复建议     │
                              │  (CI 门禁) │   │ (Overlay) │   │ (属性级)     │
                              └──────────┘   └──────────┘   └──────────────┘
```

## 归一化流水线

对比前，两侧数据必须经过统一的归一化处理，消除渲染差异。

### 色彩空间归一化

- Figma API 返回的颜色为 Display P3 色域（0-1 浮点）
- 浏览器默认 sRGB 色域
- **归一化规则**：将 Figma 颜色从 P3 转换为 sRGB 后再对比
- 转换公式：`sRGB = P3_to_sRGB(figmaColor)` （使用标准 ICC 色彩配置文件）
- 所有颜色对比在 sRGB 空间下进行

### 尺寸归一化

- Figma 始终使用 border-box 语义（width 包含 padding + border）
- CSS 默认 content-box，但大多数现代项目使用 `box-sizing: border-box`
- **归一化规则**：DOM Inspector 必须读取 `computedStyle.box-sizing`
  - `border-box`：直接使用 `offsetWidth` / `offsetHeight`
  - `content-box`：`归一化宽度 = offsetWidth + paddingLeft + paddingRight + borderLeft + borderRight`（高度同理）
- 当检测到 box-sizing 不匹配时，修复建议中明确提示 "Add `box-sizing: border-box`"

### 文本 Mock 归一化

文本内容是变量，必须消除以确保对比的可重复性：

- **Figma 侧**：解析时将所有 TEXT 节点的字符替换为等长的 "X" 字符串（保留字符数以维持宽度）
- **DOM 侧**：运行时通过 `MutationObserver` 或遍历 `TreeWalker` 将所有文本节点替换为相同的 "X" 填充
- **多行文本**：保留换行符位置，每行独立填充
- **文本内容对比明确不在范围内**——只验证布局和样式

### 单位归一化

- DOM Inspector 通过 `getComputedStyle()` 获取已解析的 px 值（自动处理 rem/em/%/vw 等）
- 修复建议同时输出 computed px 值和原始 specified 值（如 `font-size: 14px (0.875rem)`），方便开发者定位源码

## 三层验证流水线

### Layer 1: 结构化属性对比（核心）

通过 `data-figma-id` 映射，逐节点对比以下属性类别：

#### 验证属性与映射规则

| Figma 属性 | CSS 属性 | 转换规则 |
|-----------|---------|---------|
| `fills[0].color` (首个可见 Solid Fill) | `background-color` | P3 → sRGB 归一化后 RGBA (0-1 → 0-255) |
| `strokes[0].color` | `border-color` | 同上 |
| `opacity` | `opacity` | 0-1 直接映射 |
| `cornerRadius` | `border-radius` | px 直接映射（统一值） |
| `rectangleCornerRadii[4]` | `border-radius` (四值) | `[tl, tr, br, bl]` → `border-radius: tl tr br bl` |
| `padding.*` | `padding-*` | px 直接映射 |
| `itemSpacing` | `gap` | flex/grid 场景下映射 |
| `fontSize` | `font-size` | px 直接映射 |
| `fontFamily` | `font-family` | 字符串匹配（忽略引号差异） |
| `fontWeight` | `font-weight` | 数值映射 |
| `lineHeight` | `line-height` | px 直接映射 |
| `letterSpacing` | `letter-spacing` | px 直接映射 |
| `effects[DROP_SHADOW]` | `box-shadow` | `offset.x offset.y radius 0px color`（spread 固定为 0，Figma 不支持 spread） |
| `effects[INNER_SHADOW]` | `box-shadow: inset ...` | 同上，加 `inset` 关键字 |
| `effects[LAYER_BLUR]` | `filter: blur()` | radius 映射 |
| `effects[BACKGROUND_BLUR]` | `backdrop-filter: blur()` | radius 映射 |
| `width/height` | `offsetWidth/Height` | 经 box-sizing 归一化后对比 |
| `x/y` | `getBoundingClientRect()` | DOM 视口坐标减去父元素 getBoundingClientRect() 转为相对坐标 |
| `rotation` | `transform: rotate()` | Figma 顺时针负值 → CSS `rotate(Xdeg)` |
| `clipsContent` | `overflow: hidden/visible` | `true` → `hidden`, `false` → `visible` |
| `isMask` | `clip-path` / `-webkit-mask` | mask 节点映射 |

#### Auto-Layout 属性映射（关键补充）

| Figma Auto-Layout 属性 | CSS 属性 | 转换规则 |
|----------------------|---------|---------|
| `layoutMode: "HORIZONTAL"` | `display: flex; flex-direction: row` | 布局模式 |
| `layoutMode: "VERTICAL"` | `display: flex; flex-direction: column` | 布局模式 |
| `primaryAxisAlignItems` | `justify-content` | `MIN`→`flex-start`, `CENTER`→`center`, `MAX`→`flex-end`, `SPACE_BETWEEN`→`space-between` |
| `counterAxisAlignItems` | `align-items` | `MIN`→`flex-start`, `CENTER`→`center`, `MAX`→`flex-end`, `BASELINE`→`baseline` |
| `layoutSizingHorizontal` | CSS width 模式 | `FIXED`→固定 px, `HUG`→`fit-content`, `FILL`→`flex: 1` 或 `width: 100%` |
| `layoutSizingVertical` | CSS height 模式 | 同上 |
| `layoutGrow` | `flex-grow` | 数值直接映射 |
| `layoutAlign` | `align-self` | 同 counterAxisAlignItems 映射 |
| `counterAxisSizingMode` | width/height 策略 | `FIXED`→固定尺寸, `AUTO`→`fit-content` |

#### 多 Fill/Stroke 处理

- Layer 1 只比较**第一个可见 Solid Fill** 的颜色
- 渐变 Fill、图片 Fill、多层叠加 Fill 不在 Layer 1 范围，交由 Layer 3 像素对比兜底
- 无可见 Fill 的节点跳过颜色对比

#### 容差配置

```yaml
tolerances:
  position:
    x: 2px
    y: 2px
  size:
    width: 2px
    height: 2px
  color:
    # 使用感知色差 CIEDE2000，阈值 3.0（JND=2.3，3.0 容纳渲染差异）
    deltaE2000: 3.0
    # 备选：放宽后的 RGB 容差（当 CIEDE2000 不可用时）
    r: 5      # 0-255 范围
    g: 5
    b: 5
    a: 0.02   # 0-1 范围
  fontSize: 1px
  borderRadius: 1px
  spacing: 2px  # padding/gap/margin
  opacity: 0.02
  rotation: 1   # 度
```

#### 评分模型

```
总分 = Σ (属性类别权重 × 类别得分)

权重分配（5 个类别）:
  完整性:    10%   (节点是否缺失/多余)
  位置尺寸:  25%   (x, y, width, height, rotation)
  颜色样式:  20%   (fills, strokes, opacity)
  字体排版:  20%   (fontSize, fontFamily, fontWeight, lineHeight, letterSpacing)
  布局属性:  25%   (auto-layout 映射, cornerRadius, padding, gap, effects, clipsContent)

类别得分 = 该类别下所有节点的属性通过率
通过率 = 容差内的属性数 / 总属性数

缺失节点: 该节点在每个属性类别的得分为 0
多余节点: 按视觉面积比例扣分（见"未匹配节点处理"）
```

### Layer 2: 组件实例跳过

- **基础组件（Component）**：完整验证所有属性
- **组件实例（Instance）**：只验证以下内容，不穿透验证内部属性：
  - 位置和尺寸是否正确
  - 父容器是否正确（通过 `parent` 字段的 ID 链比对）
  - 外部覆盖属性是否生效——从 Figma API 的 `overrides` 数组提取，只验证被覆盖的属性
- **前提**：基础组件已通过 Layer 1 验证
- **提取逻辑**：Figma Parser 对 Instance 节点提取 `componentPropertyReferences` 和 `overrides`，Diff Engine 只对比 overrides 中列出的属性

### Layer 3: 像素级兜底

在结构化对比完成后，进行整页截图的像素级对比，捕捉 Layer 1 遗漏的视觉问题。

#### 渲染器差异说明

- Figma API 图片导出使用 Figma 自己的 Skia 渲染器，与 Chromium 的 Blink 引擎存在固有差异
- 字体渲染、抗锯齿、子像素定位在两个引擎间天然不同
- **本工具验证的是 Chromium 渲染结果**（Puppeteer 基于 Chromium）
- 跨浏览器验证（Firefox/WebKit）可选，通过 Playwright 多引擎支持实现

#### 对比方法

双指标组合：

| 指标 | 作用 | 工具 |
|------|------|------|
| SSIM (结构相似性) | 整体感知评估，抗渲染抖动 | ssim.js |
| Pixel Diff | 精确定位差异区域，生成热力图 | pixelmatch |

#### 判定标准

```
SSIM > 0.90 且 像素差异 < 2%   →  通过（已考虑渲染器固有差异）
SSIM < 0.80 或 像素差异 > 5%   →  明显问题，标红
中间区域                        →  标黄，人工复核

可选：文本遮罩 SSIM —— 排除文本区域后计算 SSIM，避免字体渲染差异干扰
```

## ID 保留策略（双保险）

### 主策略：Prompt 约束

在 AI Coding 的 system prompt 中注入规则：

```
为每个从 Figma 设计稿生成的 DOM 元素添加 data-figma-id 属性，
值为对应的 Figma 节点 ID。例如：
<div data-figma-id="123:456" class="button-primary">...</div>
```

### 兜底：后处理匈牙利匹配注入

当 AI 没有输出 `data-figma-id` 时，基于空间位置 + 元素类型匹配：

**前置条件**：Puppeteer 视口宽度必须锁定为当前验证断点的 Figma Frame 宽度。

**匹配算法**（替代简单 IoU 阈值）：

1. 构建成本矩阵：`cost(i,j) = 1 - (IoU × 0.6 + 类型匹配 × 0.4)`
2. 使用匈牙利算法（Hungarian Algorithm）求解全局最优匹配
3. 过滤：IoU < 0.5 的匹配对丢弃（避免强制匹配不相关元素）

```
元素类型映射:
  FRAME     → div/section/article
  TEXT      → span/p/h1-h6
  RECTANGLE → div (无子元素)
  VECTOR    → svg/img
  INSTANCE  → 对应组件名

类型不匹配的成本惩罚：cost × 1.5（不直接排除，允许位置极近的弱类型匹配）
```

文本内容已通过 Mock 归一化消除变量。

## 未匹配节点处理

### Figma 节点无对应 DOM（缺失元素）

- Figma 中存在节点，但 DOM 中找不到对应元素
- 标记为 **missing**
- 扣分：该节点在每个属性类别的得分为 0，拉低对应类别的通过率
- 过滤规则：`visible: false` 的 Figma 节点**默认排除**，不参与匹配（配置项 `includeHiddenNodes: true` 可覆盖）
- 报告中标注"设计稿中有但实现中缺失"

### DOM 元素无对应 Figma（多余元素）

- DOM 中存在元素，但 Figma 节点树中找不到对应节点
- 标记为 **extra**
- 扣分：按视觉面积比例扣分，而非固定值
  ```
  多余节点扣分 = min(该元素面积 / 页面总面积 × 100, 3)
  // 每个多余元素最多扣 3 分，面积越小扣分越少
  ```
- 过滤规则：纯结构节点（无视觉样式的 wrapper div，如 `role="group"`、无背景/边框/阴影的容器）自动排除
- 报告中标注"实现中有但设计稿中无"

### 节点评分汇总

```
完整性得分 = (匹配节点数 / Figma 总节点数) × 100 - 多余节点扣分
```

## 响应式验证

### 断点识别

- Viewport 宽度取 Figma 顶层 Frame（直接子节点 of Page/Canvas）的 `absoluteBoundingBox.width`
- 嵌套 Frame 不决定视口

### 多断点流程

```
Figma Desktop Frame (1440px)  →  Puppeteer viewport 1440px  →  对比
Figma Tablet Frame (768px)    →  Puppeteer viewport 768px   →  对比
Figma Mobile Frame (375px)    →  Puppeteer viewport 375px   →  对比
```

- Figma 定义了几个断点就验证几个
- 如果 Figma 只有一个 Frame，只验证该 Frame 对应的视口宽度

### 多断点评分聚合

```
最终分数 = 平均分 × (最低分 / 平均分)^0.3

// 示例：Desktop 95, Tablet 80, Mobile 60
// 平均 = 78.3, 最低 = 60
// 最终 = 78.3 × (60/78.3)^0.3 = 78.3 × 0.921 = 72.1
// 木桶效应：最低分越低，最终分数惩罚越大
```

## 输出物

### 1. CI 门禁报告 (JSON)

```json
{
  "score": 72,
  "passed": false,
  "threshold": 80,
  "breakdown": {
    "completeness": { "score": 90, "weight": 0.10 },
    "position_size": { "score": 92, "weight": 0.25 },
    "color_style": { "score": 85, "weight": 0.20 },
    "typography": { "score": 88, "weight": 0.20 },
    "layout_properties": { "score": 78, "weight": 0.25 }
  },
  "viewport_scores": {
    "1440": { "score": 78, "ssim": 0.93, "pixel_diff": 1.8 },
    "768": { "score": 70, "ssim": 0.91, "pixel_diff": 2.3 },
    "375": { "score": 65, "ssim": 0.88, "pixel_diff": 3.1 }
  },
  "aggregated_score": 72,
  "missing_nodes": 2,
  "extra_nodes": 1,
  "total_nodes": 45
}
```

**CLI Exit Codes**：
- `exit 0`：得分 >= 阈值，验证通过
- `exit 1`：得分 < 阈值，验证失败（CI 门禁拦截）
- `exit 2`：工具错误（Figma API 失败、Puppeteer 崩溃等）

### 2. 可视化 Diff 报告 (HTML)

- 左右对比：设计稿 vs 实现
- Overlay 模式：半透明叠加
- 差异热力图：标红区域为偏差位置
- 点击节点显示属性级 diff 详情

### 3. 修复建议

```json
{
  "node_id": "123:456",
  "node_name": "Button/Primary",
  "issues": [
    {
      "property": "padding-top",
      "expected_px": "12px",
      "actual_px": "8px",
      "actual_specified": "0.5rem",
      "diff": "-4px",
      "fix": "set padding-top to 12px (0.75rem)"
    },
    {
      "property": "border-radius",
      "expected_px": "8px",
      "actual_px": "6px",
      "actual_specified": "6px",
      "diff": "-2px",
      "fix": "set border-radius to 8px"
    },
    {
      "property": "box-sizing",
      "expected": "border-box",
      "actual": "content-box",
      "fix": "add box-sizing: border-box"
    }
  ]
}
```

修复建议使用英文模板，支持 i18n 配置覆盖。

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| Figma API 交互 | @figma/rest-api-spec + 自定义 parser | 官方类型定义，结构化提取 |
| DOM 属性提取 | Puppeteer / Playwright | 无头浏览器，可设置视口，获取 computed styles |
| 像素对比 | pixelmatch + ssim.js | 成熟、轻量、Node.js 原生 |
| 色差计算 | delta-e (CIEDE2000) | 感知色差，比 RGB 欧氏距离更准确 |
| 匈牙利匹配 | munkres / hungarian-algorithm | 后备 ID 注入的全局最优匹配 |
| 截图 | Puppeteer screenshot | 支持全页截图、指定元素截图 |
| 报告生成 | 自定义 HTML 模板 | 可定制化程度高 |
| CI 集成 | CLI 工具 + exit code | 通用，可接入任意 CI 系统 |
| Figma 缓存 | 基于 file_key + version hash 的本地缓存 | 避免高频 CI 触发 API 限流（60 req/min） |

## 实现阶段

### Phase 1: MVP — 结构化对比
- Figma Parser: 提取节点树 + 标准化属性（含 auto-layout、rotation、clipsContent）
- DOM Inspector: Puppeteer 提取 computed styles + box-sizing 归一化 + 文本 Mock
- Diff Engine: ID 映射 + 逐属性对比 + CIEDE2000 色差 + 容差
- CLI 输出: JSON 分数报告 + exit code

### Phase 2: 可视化 + 像素级
- 像素级对比: SSIM + Pixel Diff（含文本遮罩模式）
- 可视化报告: HTML diff 报告
- 修复建议生成（含 specified 值 + i18n）

### Phase 3: 智能化
- 后处理匈牙利匹配注入 (兜底策略)
- 响应式多断点验证 + 木桶聚合
- 组件实例 overrides 提取 + 跳过逻辑
- 隐藏节点过滤 + 无样式 wrapper 过滤
- CI/CD 集成模板 + Figma API 缓存

### Phase 4: 增强
- 行为层验证 (基于 Figma Prototype 交互定义)
- Vision AI 辅助评估 (作为可选增强层)
- Design Token 变量名校验 (Figma Variable → CSS custom property)
- 跨浏览器验证 (Playwright Firefox/WebKit)
- 团队 dashboard + 历史趋势

## 已知限制 / 不在范围

1. **渐变/图片/多层 Fill**：Layer 1 不对比，交由 Layer 3 像素级兜底
2. **跨浏览器一致性**：默认只验证 Chromium 渲染，Safari/Firefox 差异不在范围内
3. **Figma Prototype 交互行为**：Phase 4 才支持
4. **Node ID 跨文件稳定性**：不保证，必须锁定同一版本快照
5. **文本内容正确性**：不在范围内，只验证布局和样式
6. **CSS 动画/过渡**：不在范围内
7. **Figma Variables 设计 Token 名称**：v1 对比解析后的值，不校验 Token 名称

## 端到端示例

以一个包含嵌套 auto-layout、文字、图标、阴影和圆角的卡片组件为例：

### Figma 输入

```jsonc
{
  "id": "10:1",
  "name": "Card",
  "type": "FRAME",
  "layoutMode": "VERTICAL",
  "primaryAxisAlignItems": "MIN",
  "counterAxisAlignItems": "CENTER",
  "itemSpacing": 12,
  "padding": { "top": 16, "right": 16, "bottom": 16, "left": 16 },
  "cornerRadius": 12,
  "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 1, "b": 1, "a": 1 } }],
  "effects": [{ "type": "DROP_SHADOW", "offset": { "x": 0, "y": 2 }, "radius": 8, "color": { "r": 0, "g": 0, "b": 0, "a": 0.1 } }],
  "width": 320, "height": 200,
  "children": [
    {
      "id": "10:2", "name": "Title", "type": "TEXT",
      "fontSize": 18, "fontWeight": 700, "fontFamily": "Inter",
      "fills": [{ "type": "SOLID", "color": { "r": 0.11, "g": 0.11, "b": 0.11, "a": 1 } }],
      "characters": "Hello World",  // Mock → "XXXXXXXXXX"
      "width": 288, "height": 24
    },
    {
      "id": "10:3", "name": "Body", "type": "TEXT",
      "fontSize": 14, "fontWeight": 400, "fontFamily": "Inter",
      "fills": [{ "type": "SOLID", "color": { "r": 0.42, "g": 0.42, "b": 0.42, "a": 1 } }],
      "characters": "Some description text here",  // Mock → "XXXXXXXXXXXXXXXXXXXXXXXXX"
      "width": 288, "height": 40
    }
  ]
}
```

### AI 生成的 DOM

```html
<div data-figma-id="10:1" class="card">
  <h2 data-figma-id="10:2" class="title">XXXXXXXXXX</h2>
  <p data-figma-id="10:3" class="body">XXXXXXXXXXXXXXXXXXXXXXXXX</p>
</div>
```

### Diff 结果

```jsonc
{
  "node": "10:1 (Card)",
  "comparisons": [
    { "property": "cornerRadius", "expected": "12px", "actual": "12px", "pass": true },
    { "property": "padding-top", "expected": "16px", "actual": "16px", "pass": true },
    { "property": "itemSpacing/gap", "expected": "12px", "actual": "8px", "pass": false, "fix": "set gap to 12px" },
    { "property": "background-color", "expected": "rgb(255,255,255)", "actual": "rgb(255,255,255)", "pass": true },
    { "property": "box-shadow-offsetY", "expected": "2px", "actual": "2px", "pass": true },
    { "property": "box-shadow-radius", "expected": "8px", "actual": "4px", "pass": false, "fix": "set box-shadow blur to 8px" },
    { "property": "layoutMode/flex-direction", "expected": "column", "actual": "column", "pass": true },
    { "property": "counterAxisAlignItems/align-items", "expected": "center", "actual": "flex-start", "pass": false, "fix": "set align-items to center" }
  ],
  "score": { "layout_properties": 62.5, "color_style": 100, "overall": 81 }
}
```