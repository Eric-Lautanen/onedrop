"""Overlay every declared REGIONS box from assets.js onto the sheet, so each
box can be checked against the art it is supposed to capture."""
import re, sys
from PIL import Image, ImageDraw

src = open('src/js/assets.js', encoding='utf-8').read()
body = src[src.index('var REGIONS = {'):src.index('var image = null;')]
pat = re.compile(r"(\w+):\s*\{ x: ([\d.]+), y: ([\d.]+), w: ([\d.]+), h: ([\d.]+) \}")
boxes = []
for m in pat.finditer(body):
    n, x, y, w, h = m.group(1), *[float(v) for v in m.groups()[1:]]
    boxes.append((n, x * 843, y * 1264, w * 843, h * 1264))

im = Image.open('assets/sprite2.png').convert('RGB')
c = im.copy()
d = ImageDraw.Draw(c)
for n, x, y, w, h in boxes:
    d.rectangle([x, y, x + w - 1, y + h - 1], outline=(0, 255, 255))
    d.text((x + 2, y + 1), n, fill=(0, 255, 255))
c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
c.save('dev/crops/_regions_overlay.png')
print('boxes:', len(boxes))
for n, x, y, w, h in boxes:
    print('  %-14s %6.1f %6.1f %6.1f %6.1f' % (n, x, y, w, h))
