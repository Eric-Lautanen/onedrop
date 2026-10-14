"""Crop a region of an image with a labelled pixel ruler so the exact content
edge (where the grey (80,80,80) paper / green rule ends and the art begins)
can be read off directly.

  python dev/_ruler.py x0 y0 x1 y1 out scale [src]
"""
import sys
from PIL import Image, ImageDraw

x0, y0, x1, y1 = (int(v) for v in sys.argv[1:5])
out = sys.argv[5]
scale = int(sys.argv[6])
SRC = sys.argv[7] if len(sys.argv) > 7 else 'assets/sprite2.png'
im = Image.open(SRC).convert('RGB')
c = im.crop((x0, y0, x1, y1))
w, h = c.size
c = c.resize((w * scale, h * scale), Image.NEAREST)
d = ImageDraw.Draw(c)

step = 10
for sx in range(x0 - x0 % step + step, x1, step):
    px = (sx - x0) * scale
    major = sx % 50 == 0
    d.line([(px, 0), (px, c.height)], fill=(0, 200, 255) if major else (0, 90, 120), width=1)
    if major:
        d.text((px + 2, 2), str(sx), fill=(0, 220, 255))
for sy in range(y0 - y0 % step + step, y1, step):
    py = (sy - y0) * scale
    major = sy % 50 == 0
    d.line([(0, py), (c.width, py)], fill=(255, 80, 200) if major else (120, 40, 100), width=1)
    if major:
        d.text((2, py + 2), str(sy), fill=(255, 120, 220))

c.save(out)
print('wrote', out, c.size, 'crop', x0, y0, x1, y1)
