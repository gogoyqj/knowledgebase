# 公众号文章辅助写作流水线 v2.0

> 基于 article_pipeline 扩展，覆盖从风格提取到发布的完整工作流。

## 🎯 核心理念

**AI 辅助，而非 AI 替代。**

- 风格提取：让 AI 学习你的写作风格
- 辅助写作：AI 生成大纲 → 人工确认 → AI 扩写
- 审查润色：去 AI 味、查重、风险检测
- 封面生成：自动匹配文章风格
- 一键发布：微信公众号草稿/发布

## 📁 项目结构

```
article-pipeline/
├── pipeline.py              # 主编排器
├── config.yaml              # 配置文件
├── nodes/                   # 各节点实现
│   ├── __init__.py
│   ├── style_extractor.py   # ① 风格提取
│   ├── assistant_writer.py  # ② 辅助写作
│   ├── review_polish.py     # ③ 审查润色
│   ├── cover_generator.py   # ④ 封面图生成
│   └── publisher.py         # ⑤ 微信发布 + 飞书通知
├── prompts/                 # Prompt 模板
│   ├── style_extraction.md
│   ├── deai_rewrite.md
│   ├── gen_outline.md
│   └── expand_outline.md
├── output/                  # 输出目录
│   ├── articles/            # 文章 markdown
│   ├── covers/              # 封面图
│   └── styles/              # 风格画像
└── styles/                  # 作者风格画像模板
```

## 🚀 使用流程

### Step 1: 提取风格（一次性，可复用）

```python
from pipeline import ArticlePipeline

pipe = ArticlePipeline()

# 提取你的写作风格（3-10篇已有文章）
style = await pipe.extract_style([
    "my_article_1.md",
    "my_article_2.md",
    "my_article_3.md",
], author_name="skia")

# 风格画像保存在 output/styles/ 下
# 包含: 句式偏好、用词风格、段落节奏、情感基调、开头结尾模式
```

### Step 2: 辅助写作

```python
# 生成 3 个候选大纲
outlines = await pipe.gen_outline(
    idea="前端工程师在 AI 时代的创业方向",
    style=style,
    hotspots="AI 冲击前端就业市场"
)

# → 展示给用户，让用户选择/修改
# → 用户确认后，扩写

draft = await pipe.expand_outline(
    outline=confirmed_outline,
    style=style,
    word_count=2500
)
```

### Step 3: 审查润色

```python
result = await pipe.review_polish(
    draft=draft,
    style=style,
    reference_articles=["my_article_1.md", "my_article_2.md"]
)

# result 包含:
# - content: 改写后的文章
# - ai_patterns: AI 套话检测结果
# - plagiarism: 查重结果
# - risks: 风险检测结果
# - prompts: 各步骤的完整 prompt（供 LLM 使用）
```

### Step 4: 生成封面

```python
cover = pipe.generate_cover(
    title="前端工程师的 AI 创业指南",
    keywords=["前端", "AI", "创业"],
    style=style  # 可选，自动匹配风格
)
```

### Step 5: 发布

```python
# 创建草稿（不发布）
result = await pipe.publish(
    title="前端工程师的 AI 创业指南",
    article_path="output/articles/final_xxx.md",
    cover_path=cover,
    dry_run=True
)

# 发布
result = await pipe.publish(
    title="前端工程师的 AI 创业指南",
    article_path="output/articles/final_xxx.md",
    cover_path=cover,
    dry_run=False
)
```

## ⚙️ 配置

编辑 `config.yaml`：

```yaml
# 风格提取
style:
  weights:
    sentence_pattern: 0.25
    vocabulary: 0.20
    paragraph_rhythm: 0.15
    emotional_tone: 0.15
    rhetoric: 0.10
    opening_closing: 0.15

# 写作
writing:
  outline_count: 3
  target_words: 2500

# 审查
review:
  deai_intensity: "moderate"  # light / moderate / aggressive
  plagiarism_threshold: 0.3
  blocked_topics:
    - "政治敏感"
    - "宗教极端"

# 微信公众号
wechat:
  app_id: "your_app_id"
  app_secret: "your_app_secret"
  author: "skia"
  design_theme: "economist"
```

## 🔧 各节点详解

### ① 风格提取 (StyleExtractor)

从已有文章中提取 6 维度风格画像：

| 维度 | 分析内容 |
|------|---------|
| 句式偏好 | 短/中/长句比例，反问/感叹句频率 |
| 用词风格 | 口语化程度，人称使用，整体调性 |
| 段落节奏 | 段落长度分布，节奏类型 |
| 情感基调 | 正面/负面/平衡，情感强度 |
| 开头模式 | 提问式/场景式/数据式/故事式 |
| 结尾模式 | 总结式/号召式/开放式/反思式 |

### ② 辅助写作 (AssistantWriter)

- **gen_outline()**: 生成 3 个候选大纲，从不同角度切入
- **expand_outline()**: 根据确认的大纲 + 风格画像扩写全文
- **assisted_write()**: 一键生成（跳过人工审核）

### ③ 审查润色 (ReviewPolisher)

三重检查 + 去 AI 味：

1. **AI 套话检测**: 本地正则匹配 20+ 种 AI 常见表达
2. **查重**: 与已有文章的 n-gram 相似度对比
3. **风险检测**: 敏感词、合规红线、事实风险
4. **去 AI 味改写**: 生成改写 prompt，保留核心内容，调整表达

### ④ 封面生成 (CoverGenerator)

- 5 种预设主题: tech / warm / nature / minimal / gradient
- 自动匹配文章情感基调选择配色
- 标题自动换行 + 关键词标签
- 900x383 公众号首图规格

### ⑤ 发布 (Publisher)

- 微信公众号草稿/发布
- 飞书通知（支持个人/群组）
- Markdown → HTML 转换
- 封面图自动上传

## 📊 与现有 article_pipeline 的关系

| 功能 | 原 pipeline | v2.0 扩展 |
|------|------------|-----------|
| 热点追踪 | ✅ track_hotspots | 保留 |
| 风格提取 | ❌ | ✨ 新增 |
| 大纲生成 | ❌ (gen_prompt) | ✨ 3 候选大纲 |
| 人工审核 | ❌ | ✨ 大纲确认节点 |
| 扩写 | ❌ (手动) | ✨ 风格驱动扩写 |
| 去 AI 味 | ❌ | ✨ 新增 |
| 查重 | ❌ | ✨ 新增 |
| 风险检测 | ✅ check_compliance | 🔧 增强 |
| 封面图 | ✅ generate_cover_image | 🔧 风格匹配 |
| 微信发布 | ✅ save_craft_to_wechat | 保留 |
| 飞书通知 | ✅ notify | 保留 |

## 🎯 产品化方向

如果要将此工具做成独立产品：

### 技术栈选择

| 层 | 方案 |
|----|------|
| 前端 | Vue 3 + Tailwind CSS（Chrome 插件 / 独立 Web） |
| 后端 | Python FastAPI |
| AI | Claude API / OpenAI API |
| 存储 | SQLite（本地）/ PostgreSQL（云端） |
| 部署 | Vercel (前端) + Railway/Fly.io (后端) |

### 变现模式

| 模式 | 定价 | 目标用户 |
|------|------|---------|
| 免费版 | ¥0/月 | 3 次/月风格提取 + 5 次/月写作 |
| 专业版 | ¥49/月 | 无限风格 + 30 篇/月 + 去AI味 |
| 团队版 | ¥199/月 | 多账号 + 团队协作 + API |
| 企业版 | 定制 | 私有部署 + 定制开发 |

### 增长策略

1. **自用即推广**: 用这个工具写公众号文章，文章本身就是广告
2. **社区推广**: 即刻、V2EX、掘金、小红书
3. **SEO**: 发布"AI 写作工具对比"类文章
4. **KOL 合作**: 找自媒体博主免费试用，换取推荐

## 📝 TODO

- [ ] 接入 Claude/OpenAI API，实现 prompt → LLM 调用
- [ ] 前端界面（Chrome 插件 or Web）
- [ ] 微信公众号文章抓取（用于风格提取）
- [ ] 更精细的去 AI 味算法
- [ ] 多平台支持（小红书、百家号、头条）
- [ ] 数据统计面板（阅读量、互动率）
