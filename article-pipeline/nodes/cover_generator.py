"""
封面图生成器 - 使用 Pillow 生成公众号封面图

公众号封面图规格:
- 首图: 900x383 (2.35:1)
- 尾图: 200x200 (1:1)
"""

import os
import math
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


# 预设主题
THEMES = {
    "tech": {
        "bg_colors": [(26, 26, 46), (45, 45, 80)],
        "accent": (103, 80, 164),
        "text_color": (255, 255, 255),
        "pattern": "dots",
    },
    "warm": {
        "bg_colors": [(255, 243, 224), (255, 224, 178)],
        "accent": (230, 81, 0),
        "text_color": (62, 39, 35),
        "pattern": "waves",
    },
    "nature": {
        "bg_colors": [(232, 245, 233), (200, 230, 201)],
        "accent": (46, 125, 50),
        "text_color": (27, 94, 32),
        "pattern": "leaves",
    },
    "minimal": {
        "bg_colors": [(255, 255, 255), (245, 245, 245)],
        "accent": (33, 33, 33),
        "text_color": (33, 33, 33),
        "pattern": "none",
    },
    "gradient": {
        "bg_colors": [(103, 80, 164), (125, 82, 96)],
        "accent": (255, 216, 228),
        "text_color": (255, 255, 255),
        "pattern": "gradient",
    },
}


def _hex_to_rgb(hex_color: str) -> tuple:
    """将 hex 颜色转为 RGB 元组"""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def _draw_gradient(draw, width, height, color1, color2):
    """绘制渐变背景"""
    for y in range(height):
        ratio = y / height
        r = int(color1[0] + (color2[0] - color1[0]) * ratio)
        g = int(color1[1] + (color2[1] - color1[1]) * ratio)
        b = int(color1[2] + (color2[2] - color1[2]) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))


def _draw_dots(draw, width, height, color, spacing=30):
    """绘制装饰性圆点"""
    for x in range(0, width, spacing):
        for y in range(0, height, spacing):
            if (x + y) % (spacing * 2) == 0:
                draw.ellipse(
                    [x-2, y-2, x+2, y+2],
                    fill=(*color, 40)
                )


def _wrap_text(text: str, font, max_width: int) -> list[str]:
    """文本自动换行"""
    lines = []
    current_line = ""
    for char in text:
        test_line = current_line + char
        try:
            bbox = font.getbbox(test_line)
            line_width = bbox[2] - bbox[0]
        except:
            line_width = len(test_line) * font.size // 2
        if line_width <= max_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = char
    if current_line:
        lines.append(current_line)
    return lines


class CoverGenerator:
    """封面图生成器"""

    def __init__(self, config: dict):
        self.config = config
        self.cover_config = config.get("cover", {})
        self.width = self.cover_config.get("width", 900)
        self.height = self.cover_config.get("height", 383)
        self.font_family = self.cover_config.get("font_family", "PingFang SC")

        output_dir = config.get("output_dir", "./output")
        self.covers_dir = Path(output_dir) / "covers"
        self.covers_dir.mkdir(parents=True, exist_ok=True)

    def _get_font(self, size: int, bold: bool = False):
        """获取字体"""
        font_name = self.font_family
        if bold:
            font_name += "-Bold"

        # 尝试多种字体路径
        font_paths = [
            f"/System/Library/Fonts/{font_name}.ttc",
            f"/System/Library/Fonts/{font_name}.ttf",
            f"/System/Library/Fonts/PingFang.ttc",
            f"/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            f"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        ]

        for path in font_paths:
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except:
                    continue

        # 回退到默认字体
        return ImageFont.load_default()

    def generate(self, title: str, keywords: list[str] = None,
                 style: dict = None, theme: str = None) -> str:
        """生成封面图

        Args:
            title: 文章标题
            keywords: 关键词（用于装饰元素）
            style: 风格画像（影响配色选择）
            theme: 主题名称（覆盖自动选择）

        Returns:
            str: 封面图文件路径
        """
        if not HAS_PIL:
            raise ImportError("需要安装 Pillow: pip install Pillow")

        # 选择主题
        if theme and theme in THEMES:
            colors = THEMES[theme]
        elif style:
            tone = style.get("emotional_tone", {}).get("tone", "balanced")
            tone_theme_map = {
                "positive": "warm",
                "negative": "tech",
                "balanced": "gradient",
            }
            colors = THEMES.get(tone_theme_map.get(tone, "gradient"), THEMES["gradient"])
        else:
            colors = THEMES["gradient"]

        # 创建画布
        img = Image.new("RGBA", (self.width, self.height), (255, 255, 255, 255))
        draw = ImageDraw.Draw(img, "RGBA")

        # 绘制渐变背景
        _draw_gradient(draw, self.width, self.height,
                      colors["bg_colors"][0], colors["bg_colors"][1])

        # 绘制装饰图案
        if colors.get("pattern") == "dots":
            _draw_dots(draw, self.width, self.height, colors["accent"])

        # 绘制标题
        title_font = self._get_font(42, bold=True)
        margin = 60
        max_text_width = self.width - margin * 2
        title_lines = _wrap_text(title, title_font, max_text_width)

        # 计算标题位置（垂直居中偏上）
        line_height = 56
        total_text_height = len(title_lines) * line_height
        start_y = (self.height - total_text_height) // 2 - 20

        for i, line in enumerate(title_lines):
            bbox = title_font.getbbox(line)
            text_width = bbox[2] - bbox[0]
            x = (self.width - text_width) // 2
            y = start_y + i * line_height

            # 文字阴影
            draw.text((x+2, y+2), line, fill=(0, 0, 0, 60), font=title_font)
            draw.text((x, y), line, fill=colors["text_color"], font=title_font)

        # 绘制关键词标签
        if keywords:
            tag_font = self._get_font(16)
            tag_y = start_y + total_text_height + 20
            tag_x = margin

            for kw in keywords[:5]:
                tag_text = f" # {kw}"
                tag_bbox = tag_font.getbbox(tag_text)
                tag_w = tag_bbox[2] - tag_bbox[0] + 16
                tag_h = tag_bbox[3] - tag_bbox[1] + 12

                # 标签背景
                draw.rounded_rectangle(
                    [tag_x, tag_y, tag_x + tag_w, tag_y + tag_h],
                    radius=4,
                    fill=(*colors["accent"], 180)
                )
                draw.text(
                    (tag_x + 8, tag_y + 4),
                    tag_text,
                    fill=colors["text_color"],
                    font=tag_font
                )
                tag_x += tag_w + 8

        # 绘制底部装饰线
        draw.line(
            [(margin, self.height - 30), (self.width - margin, self.height - 30)],
            fill=(*colors["accent"], 100),
            width=2
        )

        # 保存
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_title = "".join(c for c in title if c.isalnum() or c in "一二三四五六七八九十")[:20]
        filename = f"cover_{safe_title}_{timestamp}.png"
        filepath = self.covers_dir / filename

        img.save(filepath, "PNG", quality=95)
        return str(filepath)
