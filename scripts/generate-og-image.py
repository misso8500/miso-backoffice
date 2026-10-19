"""Render our typography/shape-based sharing card. Requires Pillow and Korean fonts.

macOS: python3 scripts/generate-og-image.py
Other systems: pass --font /path/to/KoreanFont.ttf --latin-font /path/to/Bold.ttf
The finished PNG is committed; application builds do not need Python or these fonts.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--font', default='/System/Library/Fonts/AppleSDGothicNeo.ttc')
parser.add_argument('--latin-font', default='/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
scale = 2
width, height = 1200, 630
canvas = Image.new('RGB', (width * scale, height * scale), '#f8f6fc')
draw = ImageDraw.Draw(canvas)


def box(bounds, fill, radius=0, outline=None):
    draw.rounded_rectangle(tuple(round(v * scale) for v in bounds),
                           radius=radius * scale, fill=fill, outline=outline,
                           width=scale if outline else 1)


def text(x, y, value, size, color, latin=False):
    font = ImageFont.truetype(args.latin_font if latin else args.font, size * scale)
    draw.text((x * scale, y * scale), value, font=font, fill=color)


def line(points, color, thickness=2):
    draw.line([(x * scale, y * scale) for x, y in points], fill=color,
              width=thickness * scale, joint='curve')


# Purple frame, generous safe space, and abstract cards rather than private screenshots.
box((24, 24, 1176, 606), '#eee7f7', 30)
box((46, 46, 1154, 584), '#f8f6fc', 22)
box((78, 79, 174, 109), '#e9e0f4', 15)
text(95, 82, 'MISO', 15, '#71558f', latin=True)
text(76, 123, 'miso', 86, '#57416e', latin=True)
text(80, 247, '미소 백오피스', 46, '#43324f')
text(80, 321, '센터의 업무와 기록을', 32, '#796a88')
text(80, 368, '한곳에.', 32, '#796a88')
box((80, 483, 328, 522), '#eee7f7', 19)
text(99, 490, '수급자 · 근로계약 관리', 19, '#71558f')

shadow = Image.new('RGBA', canvas.size)
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle((650 * scale, 147 * scale, 1098 * scale, 519 * scale),
                     radius=24 * scale, fill=(89, 65, 119, 28))
shadow = shadow.filter(ImageFilter.GaussianBlur(18 * scale))
canvas = Image.alpha_composite(canvas.convert('RGBA'), shadow)
draw = ImageDraw.Draw(canvas)
box((640, 126, 1090, 502), '#ffffff', 22, '#e4dbea')
box((640, 126, 758, 502), '#e9e1f5', 22)
box((735, 127, 758, 501), '#e9e1f5')
text(663, 151, 'miso', 24, '#604a79', latin=True)
box((655, 209, 744, 248), '#ffffff', 8)
text(672, 219, '수급자', 15, '#6f5a9f')
text(666, 268, '근로계약', 15, '#8a789d')
text(784, 154, '센터 운영 관리', 22, '#5a466d')
text(784, 190, '필요한 정보를 한눈에', 13, '#95869e')
for row, title in enumerate(['수급자 관리', '근로계약 관리']):
    y = 231 + row * 111
    box((781, y, 1064, y + 91), '#fbf9fe', 12, '#ece5f2')
    box((797, y + 19, 831, y + 53), '#ede5f7', 10)
    if row == 0:
        draw.ellipse((809 * scale, (y + 25) * scale, 819 * scale, (y + 35) * scale),
                     fill='#9d85b8')
        draw.arc((803 * scale, (y + 36) * scale, 825 * scale, (y + 53) * scale),
                 start=180, end=360, fill='#9d85b8', width=3 * scale)
    else:
        box((806, y + 25, 822, y + 46), '#ffffff', 3, '#ac97c4')
        line([(810, y + 32), (818, y + 32)], '#ac97c4', 1)
        line([(810, y + 38), (818, y + 38)], '#ac97c4', 1)
    text(845, y + 18, title, 18, '#6d587f')
    box((845, y + 51, 1026, y + 57), '#e9e3f0', 3)
    box((845, y + 65, 976, y + 71), '#f0ebf5', 3)

output = root / 'public' / 'og' / 'miso-backoffice-v1.png'
output.parent.mkdir(parents=True, exist_ok=True)
canvas.convert('RGB').resize((width, height), Image.Resampling.LANCZOS).save(output, optimize=True)
print(f'Generated {output.relative_to(root)} ({width}x{height})')
