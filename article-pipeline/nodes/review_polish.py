"""
审查润色节点 - 去AI味、查重、风险检测

三个子步骤:
1. deai_rewrite - 去AI味改写
2. check_plagiarism - 与已有文章查重
3. check_risk - 敏感词/合规红线检测
"""

import re
from difflib import SequenceMatcher


# AI 常见表达模式（用于去AI味检测）
AI_PATTERNS = [
    (r"在这个.*的时代", "过于模板化的开头"),
    (r"不仅.*而且", "滥用递进结构"),
    (r"一方面.*另一方面", "滥用对比结构"),
    (r"值得注意的是", "过度使用过渡语"),
    (r"需要指出的是", "过度使用过渡语"),
    (r"不可否认", "AI 常用开头"),
    (r"毫无疑问", "AI 常用开头"),
    (r"总的来说", "过于模板化的总结"),
    (r"总而言之", "过于模板化的总结"),
    (r"综上所述", "过于模板化的总结"),
    (r"首先.*其次.*最后", "模板化结构"),
    (r"在当今社会", "AI 常用开头"),
    (r"随着.*的发展", "AI 常用开头"),
    (r"越来越多的人", "AI 常用表述"),
    (r"发挥着.*作用", "AI 常用表述"),
    (r"具有.*意义", "AI 常用表述"),
    (r"至关重要", "AI 常用表述"),
    (r"不容忽视", "AI 常用表述"),
    (r"与此同时", "AI 常用过渡"),
    (r"在此基础上", "AI 常用过渡"),
]

# 高风险敏感词（简化版，实际应用需要更完整的词库）
SENSITIVE_PATTERNS = [
    (r"政府|国家领导|政治", "政治相关"),
    (r"暴力|杀|死|血腥", "暴力内容"),
    (r"色情|性|裸体", "色情内容"),
    (r"赌博|博彩|赌", "赌博相关"),
    (r"假货|诈骗|传销", "欺诈相关"),
]


class ReviewPolisher:
    """审查润色器"""

    def __init__(self, config: dict):
        self.config = config
        self.review_config = config.get("review", {})
        self.deai_intensity = self.review_config.get("deai_intensity", "moderate")
        self.plagiarism_threshold = self.review_config.get("plagiarism_threshold", 0.3)

    def _build_deai_prompt(self, draft: str, style: dict = None) -> str:
        """构建去AI味改写 prompt"""
        intensity_desc = {
            "light": "轻微调整，只修改明显的AI套话和模板化表达",
            "moderate": "中度改写，调整句式结构、用词和节奏，保留核心内容",
            "aggressive": "深度改写，大幅调整表达方式，让文章完全像人写的",
        }

        prompt = f"""你是一位文章润色专家。请对以下文章进行"去AI味"改写。

## 改写强度: {intensity_desc.get(self.deai_intensity, intensity_desc["moderate"])}

## 改写原则:
1. 保留文章核心观点和论据不变
2. 删除或替换所有 AI 套话（如"在这个时代"、"值得注意的是"）
3. 打破过于工整的排比和递进结构
4. 增加个人化的表达（"我觉得"、"说实话"、"你想想"）
5. 让句式长短不一，不要太均匀
6. 适当加入口语化表达，让文章更自然
7. 段落长度要有变化，不要每段都差不多长

## 禁止事项:
- 不要改变文章的主题和核心论点
- 不要删除具体的数据和案例
- 不要添加原文没有的观点

"""
        if style:
            hints = style.get("prompt_hints", "")
            if hints:
                prompt += f"## 风格参考\n{hints}\n\n"

        prompt += f"## 原文\n\n{draft}"

        return prompt

    def _build_plagiarism_prompt(self, draft: str,
                                  references: list[str]) -> str:
        """构建查重 prompt"""
        ref_text = "\n---\n".join(
            f"### 参考文章 {i+1}\n{ref[:2000]}" for i, ref in enumerate(references[:3])
        )

        return f"""请对比以下文章与参考文章的相似度，找出重复或高度相似的段落。

## 待检查文章
{draft[:3000]}

## 参考文章
{ref_text}

## 输出格式 (JSON)
```json
{{
  "overall_similarity": 0.15,
  "duplicated_segments": [
    {{
      "original": "原文中的相似段落...",
      "match": "参考文章中的对应段落...",
      "similarity": 0.85,
      "source": "参考文章1"
    }}
  ],
  "recommendation": "需要改写以下段落以降低相似度"
}}
```
"""

    def _build_risk_prompt(self, draft: str) -> str:
        """构建风险检测 prompt"""
        blocked = self.review_config.get("blocked_topics", [])
        blocked_str = "、".join(blocked) if blocked else "无"

        return f"""请检查以下文章是否存在风险内容。

## 风险检测维度:
1. **敏感词检测**: 检查是否包含政治敏感、色情暴力、虚假信息等
2. **合规红线**: 检查是否涉及以下禁止话题: {blocked_str}
3. **事实风险**: 检查是否有未经验证的数据、引用、名人言论
4. **版权风险**: 检查是否有大段引用他人内容
5. **法律风险**: 检查是否有诽谤、侵权等内容

## 输出格式 (JSON)
```json
{{
  "risk_level": "low/medium/high",
  "issues": [
    {{
      "type": "sensitive_word/compliance/fact/copyright/legal",
      "severity": "low/medium/high",
      "content": "问题段落",
      "suggestion": "修改建议"
    }}
  ],
  "overall_assessment": "总体评估"
}}
```

## 待检查文章
{draft[:5000]}
"""

    def _detect_ai_patterns(self, text: str) -> list[dict]:
        """本地检测 AI 套话"""
        findings = []
        for pattern, desc in AI_PATTERNS:
            matches = re.findall(pattern, text)
            if matches:
                findings.append({
                    "pattern": pattern,
                    "description": desc,
                    "count": len(matches),
                    "examples": matches[:3],
                })
        return findings

    def _local_similarity(self, text1: str, text2: str) -> float:
        """本地文本相似度计算（基于滑动窗口）"""
        # 取文本的 n-gram 进行比较
        def get_ngrams(text, n=4):
            return set(text[i:i+n] for i in range(len(text) - n + 1))

        ngrams1 = get_ngrams(text1)
        ngrams2 = get_ngrams(text2)

        if not ngrams1 or not ngrams2:
            return 0.0

        intersection = ngrams1 & ngrams2
        union = ngrams1 | ngrams2
        return len(intersection) / len(union) if union else 0.0

    def _local_risk_check(self, text: str) -> list[dict]:
        """本地风险词检测"""
        issues = []
        for pattern, desc in SENSITIVE_PATTERNS:
            matches = re.findall(pattern, text)
            if matches:
                issues.append({
                    "type": "sensitive_word",
                    "severity": "medium",
                    "description": desc,
                    "count": len(matches),
                })
        return issues

    async def review(self, draft: str, style: dict = None,
                     references: list[str] = None) -> dict:
        """执行完整的审查流程

        Returns:
            dict: {
                "content": str,        # 改写后的内容
                "ai_patterns": list,   # AI套话检测结果
                "plagiarism": list,    # 查重结果
                "risks": list,         # 风险检测结果
                "report": dict,        # 综合报告
            }
        """
        # Step 1: 本地 AI 套话检测
        ai_patterns = self._detect_ai_patterns(draft)

        # Step 2: 本地查重（如果有参考文章）
        plagiarism = []
        if references:
            for i, ref in enumerate(references):
                sim = self._local_similarity(draft, ref)
                if sim > self.plagiarism_threshold:
                    plagiarism.append({
                        "reference_index": i,
                        "similarity": round(sim, 3),
                        "warning": f"与参考文章{i+1}相似度 {sim:.1%}，超过阈值 {self.plagiarism_threshold:.0%}",
                    })

        # Step 3: 本地风险词检测
        risks = self._local_risk_check(draft)

        # Step 4: 生成去AI味改写 prompt
        deai_prompt = self._build_deai_prompt(draft, style)

        # Step 5: 生成查重 prompt（供 LLM 使用）
        plagiarism_prompt = None
        if references:
            plagiarism_prompt = self._build_plagiarism_prompt(draft, references)

        # Step 6: 生成风险检测 prompt（供 LLM 使用）
        risk_prompt = self._build_risk_prompt(draft)

        return {
            "content": draft,  # 初始为原文，LLM 改写后替换
            "ai_patterns": ai_patterns,
            "plagiarism": plagiarism,
            "risks": risks,
            "prompts": {
                "deai": deai_prompt,
                "plagiarism": plagiarism_prompt,
                "risk": risk_prompt,
            },
            "report": {
                "ai_pattern_count": len(ai_patterns),
                "plagiarism_issues": len(plagiarism),
                "risk_issues": len(risks),
                "needs_deai": len(ai_patterns) > 3,
                "needs_plagiarism_fix": len(plagiarism) > 0,
                "has_risks": len(risks) > 0,
            },
        }
