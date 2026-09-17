"""
风格提取器 - 从已有文章中提取写作风格画像

分析维度:
1. 句式偏好 - 长短句比例、句式结构
2. 用词风格 - 口语/书面、专业术语密度、生僻词使用
3. 段落节奏 - 段落长度分布、段落结构
4. 情感基调 - 正面/负面/中性、情感强度
5. 常用修辞 - 比喻、排比、反问等
6. 开头结尾 - 开篇模式、收尾方式
"""

import re
from typing import Optional


class StyleExtractor:
    """写作风格提取器"""

    def __init__(self, config: dict):
        self.config = config
        self.style_config = config.get("style", {})

    def _count_chars(self, text: str) -> dict:
        """统计基础字符特征"""
        sentences = re.split(r'[。！？；]', text)
        sentences = [s.strip() for s in sentences if s.strip()]

        paragraphs = text.split('\n')
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        words = len(re.findall(r'\u4e00-\u9fff', text))  # 中文字数

        return {
            "total_chars": len(text),
            "chinese_chars": words,
            "sentence_count": len(sentences),
            "paragraph_count": len(paragraphs),
            "avg_sentence_length": words / max(len(sentences), 1),
            "avg_paragraph_length": words / max(len(paragraphs), 1),
        }

    def _analyze_sentence_patterns(self, text: str) -> dict:
        """分析句式偏好"""
        sentences = re.split(r'[。！？；]', text)
        sentences = [s.strip() for s in sentences if s.strip()]

        if not sentences:
            return {"short_ratio": 0, "long_ratio": 0, "rhetorical_count": 0}

        short = sum(1 for s in sentences if len(s) <= 15)
        medium = sum(1 for s in sentences if 15 < len(s) <= 40)
        long_ = sum(1 for s in sentences if len(s) > 40)
        total = len(sentences)

        # 反问句检测
        rhetorical = sum(1 for s in sentences if any(w in s for w in ["难道", "岂不", "何尝", "不是吗", "对吧"]))

        # 感叹句检测
        exclamatory = sum(1 for s in sentences if "！" in s or "!" in s)

        return {
            "short_ratio": round(short / total, 2),      # <=15字
            "medium_ratio": round(medium / total, 2),     # 15-40字
            "long_ratio": round(long_ / total, 2),        # >40字
            "rhetorical_count": rhetorical,
            "exclamatory_ratio": round(exclamatory / total, 2),
        }

    def _analyze_vocabulary(self, text: str) -> dict:
        """分析用词风格"""
        # 口语化词汇
        colloquial_words = ["嗯", "啊", "呢", "吧", "嘛", "噢", "嘿", "哈",
                           "其实", "说实话", "老实说", "不得不说", "你想想"]
        # 书面语词汇
        formal_words = ["因此", "然而", "此外", "综上", "鉴于", "诸如",
                       "不言而喻", "由此可见", "显而易见", "毋庸置疑"]

        colloquial_count = sum(text.count(w) for w in colloquial_words)
        formal_count = sum(text.count(w) for w in formal_words)
        total_words = max(len(text), 1)

        # 第一人称使用频率
        first_person = len(re.findall(r'我[们是认为想要]?', text))
        # 第二人称
        second_person = len(re.findall(r'你[们是认为想要]?', text))

        return {
            "colloquial_density": round(colloquial_count / total_words * 100, 2),
            "formal_density": round(formal_count / total_words * 100, 2),
            "first_person_count": first_person,
            "second_person_count": second_person,
            "voice": "conversational" if colloquial_count > formal_count else "formal",
        }

    def _analyze_paragraph_rhythm(self, text: str) -> dict:
        """分析段落节奏"""
        paragraphs = text.split('\n')
        paragraphs = [p.strip() for p in paragraphs if p.strip() and len(p.strip()) > 5]

        if not paragraphs:
            return {"avg_length": 0, "rhythm": "unknown"}

        lengths = [len(p) for p in paragraphs]
        avg = sum(lengths) / len(lengths)
        variance = sum((l - avg) ** 2 for l in lengths) / len(lengths)

        # 节奏判断
        if variance < 200:
            rhythm = "steady"      # 稳定节奏
        elif any(l > avg * 2 for l in lengths):
            rhythm = "varied"      # 变化节奏（长短交替）
        else:
            rhythm = "progressive" # 渐进节奏

        return {
            "avg_paragraph_length": round(avg, 1),
            "max_paragraph_length": max(lengths),
            "min_paragraph_length": min(lengths),
            "paragraph_count": len(paragraphs),
            "rhythm": rhythm,
        }

    def _analyze_emotional_tone(self, text: str) -> dict:
        """分析情感基调"""
        positive_words = ["好", "棒", "赞", "喜欢", "开心", "快乐", "优秀",
                         "精彩", "美好", "希望", "期待", "温暖", "感动"]
        negative_words = ["差", "糟", "烂", "讨厌", "难过", "失望", "焦虑",
                         "担忧", "可怕", "危险", "问题", "困境", "挑战"]
        neutral_markers = ["但是", "不过", "然而", "另一方面", "客观来说"]

        pos = sum(text.count(w) for w in positive_words)
        neg = sum(text.count(w) for w in negative_words)
        neutral = sum(text.count(w) for w in neutral_markers)

        total = max(pos + neg + neutral, 1)

        if pos > neg * 1.5:
            tone = "positive"
        elif neg > pos * 1.5:
            tone = "negative"
        else:
            tone = "balanced"

        return {
            "positive_density": round(pos / total, 2),
            "negative_density": round(neg / total, 2),
            "neutral_density": round(neutral / total, 2),
            "tone": tone,
        }

    def _analyze_opening_closing(self, text: str) -> dict:
        """分析开头结尾模式"""
        paragraphs = [p.strip() for p in text.split('\n') if p.strip() and len(p.strip()) > 5]
        if not paragraphs:
            return {"opening_type": "unknown", "closing_type": "unknown"}

        opening = paragraphs[0][:100]
        closing = paragraphs[-1][:100]

        # 开头模式
        if any(w in opening for w in ["你有没有", "不知道你", "最近", "今天"]):
            opening_type = "question_or_scene"  # 提问/场景式
        elif any(w in opening for w in ["所谓", "根据", "数据显示", "研究表明"]):
            opening_type = "data_or_definition"  # 数据/定义式
        elif any(w in opening for w in ["我", "我们"]):
            opening_type = "personal_story"  # 个人故事式
        else:
            opening_type = "direct"  # 直接切入

        # 结尾模式
        if any(w in closing for w in ["总之", "最后", "总而言之", "综上"]):
            closing_type = "summary"  # 总结式
        elif any(w in closing for w in ["你", "我们", "希望", "期待"]):
            closing_type = "call_to_action"  # 号召式
        elif any(w in closing for w in ["？", "?", "对吧", "不是吗"]):
            closing_type = "open_question"  # 开放式提问
        else:
            closing_type = "reflective"  # 反思式

        return {
            "opening_type": opening_type,
            "closing_type": closing_type,
            "opening_preview": opening[:50],
            "closing_preview": closing[:50],
        }

    def _generate_prompt_hints(self, profile: dict) -> str:
        """根据风格画像生成写作 prompt 提示"""
        hints = []

        # 句式
        sp = profile.get("sentence_pattern", {})
        if sp.get("short_ratio", 0) > 0.4:
            hints.append("多用短句，节奏明快")
        if sp.get("long_ratio", 0) > 0.3:
            hints.append("适当使用长句展开论述")
        if sp.get("exclamatory_ratio", 0) > 0.1:
            hints.append("适当使用感叹句增强感染力")

        # 用词
        vocab = profile.get("vocabulary", {})
        if vocab.get("voice") == "conversational":
            hints.append("保持口语化、对话感的语气")
            hints.append("适当使用语气词（嗯、啊、呢、吧）增加亲和力")
        else:
            hints.append("使用书面语，保持专业感")

        if vocab.get("first_person_count", 0) > 5:
            hints.append('多用第一人称「我」讲述，增强个人色彩')
        if vocab.get("second_person_count", 0) > 5:
            hints.append('多用「你」与读者对话，增强互动感')

        # 段落
        rhythm = profile.get("paragraph_rhythm", {})
        if rhythm.get("rhythm") == "steady":
            hints.append("段落长度均匀，保持稳定节奏")
        elif rhythm.get("rhythm") == "varied":
            hints.append("长短段落交替，制造阅读节奏感")

        # 情感
        emotional = profile.get("emotional_tone", {})
        if emotional.get("tone") == "positive":
            hints.append("整体基调偏正面积极")
        elif emotional.get("tone") == "negative":
            hints.append("可以适当表达担忧和批判")
        else:
            hints.append("保持客观平衡的论述基调")

        # 开头结尾
        oc = profile.get("opening_closing", {})
        opening_map = {
            "question_or_scene": "开头用提问或场景描写引入",
            "data_or_definition": "开头引用数据或定义切入",
            "personal_story": "开头讲一个个人故事或经历",
            "direct": "开头直接切入主题",
        }
        closing_map = {
            "summary": "结尾用总结性语句收束",
            "call_to_action": "结尾号召读者行动",
            "open_question": "结尾留下开放性问题",
            "reflective": "结尾引发读者思考",
        }
        if oc.get("opening_type") in opening_map:
            hints.append(opening_map[oc["opening_type"]])
        if oc.get("closing_type") in closing_map:
            hints.append(closing_map[oc["closing_type"]])

        return "；".join(hints)

    async def extract(self, articles: list[str], author_name: str = "default") -> dict:
        """从多篇文章中提取综合风格画像

        Args:
            articles: 文章内容列表
            author_name: 作者名称

        Returns:
            style_profile dict
        """
        # 逐篇分析
        all_profiles = []
        for i, article in enumerate(articles):
            profile = {
                "index": i,
                "char_stats": self._count_chars(article),
                "sentence_pattern": self._analyze_sentence_patterns(article),
                "vocabulary": self._analyze_vocabulary(article),
                "paragraph_rhythm": self._analyze_paragraph_rhythm(article),
                "emotional_tone": self._analyze_emotional_tone(article),
                "opening_closing": self._analyze_opening_closing(article),
            }
            all_profiles.append(profile)

        # 汇总（取平均值）
        def avg_field(profiles, *keys):
            values = []
            for p in profiles:
                obj = p
                for k in keys:
                    obj = obj.get(k, {}) if isinstance(obj, dict) else {}
                if isinstance(obj, (int, float)):
                    values.append(obj)
            return round(sum(values) / max(len(values), 1), 2)

        def dominant_value(profiles, key_path):
            """取众数"""
            values = []
            for p in profiles:
                obj = p
                for k in key_path:
                    obj = obj.get(k, {}) if isinstance(obj, dict) else {}
                if isinstance(obj, str):
                    values.append(obj)
            if not values:
                return "unknown"
            return max(set(values), key=values.count)

        # 统计平均字符特征
        avg_chars = {
            "avg_sentence_length": avg_field(all_profiles, "char_stats", "avg_sentence_length"),
            "avg_paragraph_length": avg_field(all_profiles, "char_stats", "avg_paragraph_length"),
        }

        # 综合风格画像
        profile = {
            "author": author_name,
            "article_count": len(articles),
            "avg_chars": avg_chars,
            "sentence_pattern": {
                "short_ratio": avg_field(all_profiles, "sentence_pattern", "short_ratio"),
                "medium_ratio": avg_field(all_profiles, "sentence_pattern", "medium_ratio"),
                "long_ratio": avg_field(all_profiles, "sentence_pattern", "long_ratio"),
                "exclamatory_ratio": avg_field(all_profiles, "sentence_pattern", "exclamatory_ratio"),
            },
            "vocabulary": {
                "voice": dominant_value(all_profiles, ["vocabulary", "voice"]),
                "colloquial_density": avg_field(all_profiles, "vocabulary", "colloquial_density"),
                "formal_density": avg_field(all_profiles, "vocabulary", "formal_density"),
                "first_person_count": avg_field(all_profiles, "vocabulary", "first_person_count"),
                "second_person_count": avg_field(all_profiles, "vocabulary", "second_person_count"),
            },
            "paragraph_rhythm": {
                "avg_length": avg_field(all_profiles, "paragraph_rhythm", "avg_paragraph_length"),
                "rhythm": dominant_value(all_profiles, ["paragraph_rhythm", "rhythm"]),
            },
            "emotional_tone": {
                "tone": dominant_value(all_profiles, ["emotional_tone", "tone"]),
                "positive_density": avg_field(all_profiles, "emotional_tone", "positive_density"),
                "negative_density": avg_field(all_profiles, "emotional_tone", "negative_density"),
            },
            "opening_closing": {
                "opening_type": dominant_value(all_profiles, ["opening_closing", "opening_type"]),
                "closing_type": dominant_value(all_profiles, ["opening_closing", "closing_type"]),
            },
            "prompt_hints": "",  # 稍后填充
        }

        # 生成 prompt 提示
        profile["prompt_hints"] = self._generate_prompt_hints(profile)

        return profile
