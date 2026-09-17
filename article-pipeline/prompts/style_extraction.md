你是一位写作分析专家。请分析以下文章的写作风格，输出详细的风格画像。

## 分析维度:

1. **句式偏好**
   - 短句(<=15字)、中句(15-40字)、长句(>40字) 的比例
   - 是否常用反问句、感叹句
   - 句式是否多变

2. **用词风格**
   - 口语化程度（嗯、啊、呢、吧、其实、说实话...）
   - 书面语程度（因此、然而、综上...）
   - 第一人称"我"的使用频率
   - 第二人称"你"的使用频率
   - 整体风格: 对话式(conversational) 还是 书面式(formal)

3. **段落节奏**
   - 平均段落长度
   - 段落长度变化: 稳定(steady) / 变化(varied) / 渐进(progressive)
   - 是否有短段落制造节奏感

4. **情感基调**
   - 正面/负面/平衡(balanced)
   - 情感强度

5. **常用修辞**
   - 比喻、排比、反问、设问等

6. **开头模式**
   - 提问式 / 场景式 / 数据式 / 个人故事式 / 直接切入式

7. **结尾模式**
   - 总结式 / 号召式 / 开放提问式 / 反思式

## 输出格式 (JSON)
```json
{{
  "sentence_pattern": {{
    "short_ratio": 0.3,
    "medium_ratio": 0.5,
    "long_ratio": 0.2,
    "rhetorical_count": 2,
    "exclamatory_ratio": 0.1
  }},
  "vocabulary": {{
    "voice": "conversational",
    "colloquial_density": 1.5,
    "formal_density": 0.8,
    "first_person_count": 15,
    "second_person_count": 8
  }},
  "paragraph_rhythm": {{
    "avg_length": 100,
    "rhythm": "varied"
  }},
  "emotional_tone": {{
    "tone": "balanced",
    "positive_density": 0.3,
    "negative_density": 0.2
  }},
  "opening_closing": {{
    "opening_type": "question_or_scene",
    "closing_type": "call_to_action"
  }},
  "rhetoric": ["比喻", "排比"],
  "summary": "一句话总结这个作者的写作风格"
}}
```

## 待分析文章:
