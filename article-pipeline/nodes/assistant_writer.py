"""
辅助写作节点 - 大纲生成与扩写

核心理念: AI 生成 + 人工审核，而非全自动。
大纲阶段让用户确认方向，避免 AI 跑偏。
"""

import json


class AssistantWriter:
    """辅助写作器"""

    def __init__(self, config: dict):
        self.config = config
        self.writing_config = config.get("writing", {})
        self.outline_count = self.writing_config.get("outline_count", 3)

    def _build_outline_prompt(self, idea: str, style: dict = None,
                               hotspots: str = None) -> str:
        """构建大纲生成 prompt"""
        prompt_parts = [
            "你是一位资深公众号文章策划师。根据以下灵感，生成{count}个不同角度的文章大纲。".format(
                count=self.outline_count
            ),
            "",
            "## 灵感/念头",
            idea,
        ]

        if hotspots:
            prompt_parts.extend(["", "## 相关热点", hotspots])

        if style:
            hints = style.get("prompt_hints", "")
            if hints:
                prompt_parts.extend(["", "## 写作风格要求", hints])

            # 开头结尾偏好
            oc = style.get("opening_closing", {})
            if oc.get("opening_type"):
                prompt_parts.append(f"- 开头偏好: {oc['opening_type']}")
            if oc.get("closing_type"):
                prompt_parts.append(f"- 结尾偏好: {oc['closing_type']}")

        prompt_parts.extend([
            "",
            "## 输出格式 (JSON 数组)",
            "```json",
            "[",
            "  {",
            '    "title": "文章标题（吸引眼球但不标题党）",',
            '    "hook": "开头第一段（50-100字，抓住读者）",',
            '    "sections": [',
            '      {"heading": "小标题1", "key_points": ["要点1", "要点2"]},',
            '      {"heading": "小标题2", "key_points": ["要点1", "要点2"]},',
            '      ...',
            "    ],",
            '    "closing": "结尾方向（1-2句话描述）",',
            '    "target_audience": "目标读者画像",',
            '    "estimated_words": 2500',
            "  },",
            "  ...",
            "]",
            "```",
            "",
            "要求：",
            "1. 三个大纲分别从不同角度切入（如：故事型、干货型、观点型）",
            "2. 每个大纲 4-6 个小节",
            "3. 标题要有吸引力但不低俗",
            "4. 内容要有深度，不是泛泛而谈",
        ])

        return "\n".join(prompt_parts)

    def _build_expand_prompt(self, outline: dict, style: dict = None,
                              target_words: int = 2500) -> str:
        """构建扩写 prompt"""
        outline_json = json.dumps(outline, ensure_ascii=False, indent=2)

        prompt_parts = [
            "你是一位优秀的公众号文章作者。根据以下大纲，撰写一篇完整的公众号文章。",
            "",
            "## 大纲",
            outline_json,
            "",
            f"## 要求",
            f"- 目标字数: {target_words} 字左右",
            f"- 使用 Markdown 格式",
            f"- 保留大纲中的小标题结构",
            f"- 开头用大纲中的 hook",
            f"- 结尾按大纲中的 closing 方向收束",
            f"- 内容要有观点、有案例、有深度",
            f'- 不要使用「首先、其次、最后」这种模板化结构',
        ]

        if style:
            hints = style.get("prompt_hints", "")
            if hints:
                prompt_parts.extend(["", "## 风格要求（模仿以下特征）", hints])

            # 用词特征
            vocab = style.get("vocabulary", {})
            if vocab.get("voice") == "conversational":
                prompt_parts.append("- 保持口语化、对话感")
                prompt_parts.append("- 可以使用语气词（嗯、啊、呢、吧）")
            else:
                prompt_parts.append("- 使用书面语，保持专业感")

            # 段落节奏
            rhythm = style.get("paragraph_rhythm", {})
            avg_len = rhythm.get("avg_length", 100)
            if avg_len < 80:
                prompt_parts.append("- 段落短小精悍，每段不超过3-4句")
            elif avg_len > 150:
                prompt_parts.append("- 段落可以稍长，展开充分论述")

        prompt_parts.extend([
            "",
            "## 重要：去AI味",
            "避免以下 AI 常见写法：",
            "- ❌ "在这个...的时代"",
            "- ❌ "不仅...而且..."",
            "- ❌ "一方面...另一方面..."",
            "- ❌ 过度使用"值得注意的是"",
            "- ❌ 每段开头都是"首先/其次/最后"",
            "- ❌ 过于工整的排比句",
            "✅ 用自然的、像真人说话一样的方式写",
        ])

        return "\n".join(prompt_parts)

    async def generate_outlines(self, idea: str, style: dict = None,
                                hotspots: str = None) -> list[dict]:
        """生成候选大纲

        Returns:
            list[dict]: 候选大纲列表
        """
        # 这里返回 prompt，实际的 LLM 调用由 pipeline 层处理
        # 在 skill 模式下，prompt 会传给 LLM 让它生成
        prompt = self._build_outline_prompt(idea, style, hotspots)

        # TODO: 接入 LLM API
        # 目前返回 prompt，由外部 LLM 处理
        return [{
            "title": idea,
            "hook": f"关于「{idea}」，我想聊聊我的看法。",
            "sections": [
                {"heading": "为什么聊这个", "key_points": ["背景引入"]},
                {"heading": "核心观点", "key_points": ["主要论点"]},
                {"heading": "怎么做", "key_points": ["行动建议"]},
            ],
            "closing": "留个开放性思考",
            "_prompt": prompt,  # 包含完整 prompt 供 LLM 使用
        }]

    async def expand(self, outline: dict, style: dict = None,
                     target_words: int = 2500) -> str:
        """将大纲扩写为完整文章

        Returns:
            str: 文章 markdown 内容
        """
        prompt = self._build_expand_prompt(outline, style, target_words)

        # TODO: 接入 LLM API
        # 目前返回 prompt，由外部 LLM 处理
        return prompt
