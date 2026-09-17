"""
Article Pipeline v2.0 - Main Orchestrator
公众号文章辅助写作流水线

Usage:
    from pipeline import ArticlePipeline

    pipe = ArticlePipeline()

    # Step 1: 提取风格（一次性，可复用）
    style = await pipe.extract_style(["article1.md", "article2.md"])

    # Step 2: 辅助写作（每次写文章）
    outline = await pipe.gen_outline("我的灵感/念头", style)
    # → 人工审核大纲
    draft = await pipe.expand_outline(outline, style)

    # Step 3: 审查去重
    final = await pipe.review_polish(draft, style)

    # Step 4: 封面图
    cover = pipe.generate_cover("文章标题", ["关键词1", "关键词2"])

    # Step 5: 发布
    result = await pipe.publish("文章标题", final, cover)
"""

import os
import yaml
from pathlib import Path
from datetime import datetime


class ArticlePipeline:
    """公众号文章辅助写作流水线"""

    def __init__(self, config_path: str = "config.yaml"):
        self.config = self._load_config(config_path)
        self.output_dir = Path(self.config.get("output_dir", "./output"))
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # 子目录
        self.styles_dir = self.output_dir / "styles"
        self.articles_dir = self.output_dir / "articles"
        self.covers_dir = self.output_dir / "covers"
        for d in [self.styles_dir, self.articles_dir, self.covers_dir]:
            d.mkdir(parents=True, exist_ok=True)

    def _load_config(self, path: str) -> dict:
        """加载配置文件"""
        config_path = Path(path)
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        return {}

    def _timestamp(self) -> str:
        return datetime.now().strftime("%Y%m%d_%H%M%S")

    # ── Step 1: 风格提取 ──────────────────────────────────

    async def extract_style(self, article_paths: list[str], author_name: str = "default"):
        """从已有文章中提取写作风格画像

        Args:
            article_paths: 文章文件路径列表 (3-10篇效果最佳)
            author_name: 作者名称，用于保存风格画像

        Returns:
            StyleProfile dict
        """
        from nodes.style_extractor import StyleExtractor
        extractor = StyleExtractor(self.config)

        # 读取所有文章内容
        articles = []
        for path in article_paths:
            with open(path, "r", encoding="utf-8") as f:
                articles.append(f.read())

        # 提取风格
        profile = await extractor.extract(articles, author_name)

        # 保存到文件
        profile_path = self.styles_dir / f"{author_name}_{self._timestamp()}.yaml"
        with open(profile_path, "w", encoding="utf-8") as f:
            yaml.dump(profile, f, allow_unicode=True, default_flow_style=False)

        print(f"✅ 风格画像已保存: {profile_path}")
        return profile

    # ── Step 2: 辅助写作 ──────────────────────────────────

    async def gen_outline(self, idea: str, style: dict = None, hotspots: str = None):
        """根据灵感生成候选大纲

        Args:
            idea: 用户的灵感/念头/关键词
            style: 风格画像 (可选)
            hotspots: 热点信息 (可选)

        Returns:
            list[dict]: 候选大纲列表，每个包含 title, sections, hook
        """
        from nodes.assistant_writer import AssistantWriter
        writer = AssistantWriter(self.config)
        outlines = await writer.generate_outlines(idea, style, hotspots)
        return outlines

    async def expand_outline(self, outline: dict, style: dict = None,
                             word_count: int = None):
        """将大纲扩写为完整文章

        Args:
            outline: 确认的大纲 (含 title, sections, hook)
            style: 风格画像
            word_count: 目标字数

        Returns:
            str: 文章 markdown 内容
        """
        from nodes.assistant_writer import AssistantWriter
        writer = AssistantWriter(self.config)
        target = word_count or self.config.get("writing", {}).get("target_words", 2500)
        content = await writer.expand(outline, style, target)

        # 保存初稿
        article_path = self.articles_dir / f"draft_{self._timestamp()}.md"
        with open(article_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ 初稿已保存: {article_path}")
        return content

    async def assisted_write(self, idea: str, style: dict = None,
                             hotspots: str = None, word_count: int = None):
        """一键辅助写作（生成大纲 + 扩写）

        注意：跳过了人工审核大纲的步骤，适合快速草稿。
        推荐分开调用 gen_outline → 人工确认 → expand_outline。

        Returns:
            dict: {"outline": outline, "content": content, "path": str}
        """
        outlines = await self.gen_outline(idea, style, hotspots)
        # 取第一个大纲
        outline = outlines[0] if outlines else {"title": idea, "sections": [], "hook": ""}
        content = await self.expand_outline(outline, style, word_count)
        return {"outline": outline, "content": content}

    # ── Step 3: 审查去重 ──────────────────────────────────

    async def review_polish(self, draft: str, style: dict = None,
                            reference_articles: list[str] = None):
        """审查、去AI味、去重、风险检测

        Args:
            draft: 文章初稿 markdown
            style: 风格画像 (用于去AI味时保持风格一致)
            reference_articles: 作者已有文章路径 (用于查重)

        Returns:
            dict: {
                "content": str,        # 定稿内容
                "report": dict,        # 审查报告
                "deai_score": float,   # 去AI味评分 (0-1, 越高越好)
                "plagiarism": list,    # 查重结果
                "risks": list,         # 风险项
            }
        """
        from nodes.review_polish import ReviewPolisher
        polisher = ReviewPolisher(self.config)

        # 读取参考文章
        references = []
        if reference_articles:
            for path in reference_articles:
                with open(path, "r", encoding="utf-8") as f:
                    references.append(f.read())

        result = await polisher.review(draft, style, references)

        # 保存定稿
        article_path = self.articles_dir / f"final_{self._timestamp()}.md"
        with open(article_path, "w", encoding="utf-8") as f:
            f.write(result["content"])
        print(f"✅ 定稿已保存: {article_path}")
        result["path"] = str(article_path)
        return result

    # ── Step 4: 封面图 ────────────────────────────────────

    def generate_cover(self, title: str, keywords: list[str] = None,
                       style: dict = None):
        """生成文章封面图

        Args:
            title: 文章标题
            keywords: 关键词列表
            style: 风格画像 (可选，用于选择封面风格)

        Returns:
            str: 封面图文件路径
        """
        from nodes.cover_generator import CoverGenerator
        gen = CoverGenerator(self.config)
        cover_path = gen.generate(title, keywords, style)
        print(f"✅ 封面图已生成: {cover_path}")
        return cover_path

    # ── Step 5: 发布 ──────────────────────────────────────

    async def publish(self, title: str, article_path: str,
                      cover_path: str = None, dry_run: bool = True):
        """发布到微信公众号

        Args:
            title: 文章标题
            article_path: 文章 markdown 文件路径
            cover_path: 封面图路径 (可选)
            dry_run: True=仅创建草稿不发布, False=发布

        Returns:
            dict: {"media_id": str, "draft_only": bool, ...}
        """
        from nodes.publisher import WeChatPublisher
        publisher = WeChatPublisher(self.config)
        result = await publisher.publish(title, article_path, cover_path, dry_run)
        return result

    async def notify(self, title: str, summary: str, platform: str = "wechat",
                     article_url: str = None):
        """发送飞书通知"""
        from nodes.publisher import FeishuNotifier
        notifier = FeishuNotifier(self.config)
        return await notifier.notify(title, summary, platform, article_url)
