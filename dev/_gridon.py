"""dev/_gridon.py -- draw a TRUE art-percent grid on a capture written by
dev/_region.js, so feature positions can be read off exactly.

  python dev/_gridon.py x0 y0 x1 y1 [src] [out]

src defaults to dev/shots/_reg_bare.png
out defaults to dev/shots/_reg_grid.png
"""
import sys

from PIL import Image, ImageDraw

x0, y0, x1, y1 = (float(v) for v in sys.argv[1:5])
src = sys.argv[5] if len(sys.argv) > 5 else "dev/shots/_reg_bare.png"
out = sys.argv[6] if len(sys.argv) > 6 else "dev/shots/_reg_grid.png"

im = Image.open(src).convert("RGB")
W, H = im.size
ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)

px = W / (x1 - x0)
py = H / (y1 - y0)

gx = int(x0)
while gx <= x1:
    X = (gx - x0) * px
    major = (gx % 5 == 0)
    d.line([(X, 0), (X, H)], fill=(0, 255, 255, 210 if major else 60),
           width=2 if major else 1)
    if major:
        d.text((X + 3, 3), str(gx), fill=(0, 255, 255, 255))
    gx += 1

gy = int(y0)
while gy <= y1:
    Y = (gy - y0) * py
    major = (gy % 5 == 0)
    d.line([(0, Y), (W, Y)], fill=(0, 255, 255, 210 if major else 60),
           width=2 if major else 1)
    if major:
        d.text((3, Y + 3), str(gy), fill=(0, 255, 255, 255))
    gy += 1

Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB").save(out)
print("wrote", out, im.size, f"art {x0},{y0} .. {x1},{y1}")
