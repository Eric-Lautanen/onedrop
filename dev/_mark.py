"""dev/_mark.py -- draw labelled circles on a crop of the playfield art.

  python dev/_mark.py x0 y0 x1 y1 zoom  "label:ax,ay,r"  ...

Used to settle, on the painting itself, which painted feature a piece of
hardware is supposed to sit on.
"""
import sys

from PIL import Image, ImageDraw

x0, y0, x1, y1 = (float(v) for v in sys.argv[1:5])
Z = int(sys.argv[5])
marks = sys.argv[6:]

atlas = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
AW, AH = atlas.size
crop = atlas.crop((int(x0 / 100 * AW), int(y0 / 100 * AH),
                   int(x1 / 100 * AW), int(y1 / 100 * AH)))
crop = crop.resize((crop.width * Z, crop.height * Z), Image.LANCZOS)
d = ImageDraw.Draw(crop)
W, H = 25.94, 48.94

COLORS = [(0, 255, 90), (255, 80, 80), (255, 220, 0), (0, 200, 255), (255, 0, 220)]


def P(ax, ay):
    return ((ax - x0) / (x1 - x0) * crop.width, (ay - y0) / (y1 - y0) * crop.height)


for i, m in enumerate(marks):
    lab, rest = m.split(":", 1)
    ax, ay, r = (float(v) for v in rest.split(","))
    col = COLORS[i % len(COLORS)]
    cx, cy = P(ax, ay)
    # r is a percentage of the playfield WIDTH, so it maps through world units
    rpx = r / 100 * W / (x1 - x0) * W * (crop.width / (AW * (x1 - x0) / 100)) * 0
    # simpler: pixels per art-percent in x
    ppx = crop.width / (x1 - x0)
    rpx = r * ppx
    d.ellipse([cx - rpx, cy - rpx, cx + rpx, cy + rpx], outline=col, width=3)
    d.line([(cx - 9, cy), (cx + 9, cy)], fill=col, width=2)
    d.line([(cx, cy - 9), (cx, cy + 9)], fill=col, width=2)
    d.text((cx + rpx + 3, cy - 6), lab, fill=col)

crop.save("dev/shots/_marked.png")
print("wrote dev/shots/_marked.png", crop.size)
