"""dev/_tri.py -- sprite | sprite+layout | render, same art-percent window.

  python dev/_tri.py [x0 y0 x1 y1]

Three panels at identical framing, so a misalignment in either the
hardware positions or the artwork mapping is obvious.
"""
import json
import sys

from PIL import Image, ImageDraw

FX0, FY0, FX1, FY1 = 450, 28, 950, 972          # field rect in the shot
box = tuple(float(v) for v in sys.argv[1:5]) if len(sys.argv) > 4 else (26, 14, 74, 48)
x0, y0, x1, y1 = box

atlas = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
shot = Image.open("dev/shots/v4_pf_top.png").convert("RGB")
layout = json.load(open("dev/layout.json"))

Z = 5


def art_crop():
    a = atlas.crop((int(x0 / 100 * atlas.width), int(y0 / 100 * atlas.height),
                    int(x1 / 100 * atlas.width), int(y1 / 100 * atlas.height)))
    return a.resize((a.width * Z, a.height * Z), Image.LANCZOS)


def shot_crop():
    w, h = FX1 - FX0, FY1 - FY0
    b = shot.crop((int(FX0 + x0 / 100 * w), int(FY0 + y0 / 100 * h),
                   int(FX0 + x1 / 100 * w), int(FY0 + y1 / 100 * h)))
    return b.resize((b.width * Z, b.height * Z), Image.LANCZOS)


base = art_crop()
over = base.copy()
d = ImageDraw.Draw(over, "RGBA")


def P(p, im):
    return ((p[0] - x0) / (x1 - x0) * im.width, (p[1] - y0) / (y1 - y0) * im.height)


for c in layout["circles"]:
    cx, cy = P(c["c"], over)
    r = c["r"] / (x1 - x0) * over.width
    col = {"bumper": (0, 255, 90, 255), "toy": (255, 220, 0, 255),
           "post": (255, 255, 255, 255)}.get(c.get("type"), (0, 255, 90, 255))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=3)
    d.line([(cx - 6, cy), (cx + 6, cy)], fill=col, width=1)
    d.line([(cx, cy - 6), (cx, cy + 6)], fill=col, width=1)

for l in layout["lamps"]:
    lx, ly = P(l["c"], over)
    r = max(4, l["r"] / (x1 - x0) * over.width)
    d.ellipse([lx - r, ly - r, lx + r, ly + r], outline=(255, 0, 200, 235), width=2)

for g in layout["targets"]:
    d.line([P(g["a"], over), P(g["b"], over)], fill=(255, 140, 0, 255), width=5)

for s in layout["segments"]:
    if s["kind"] in ("rail", "arch"):
        d.line([P(s["a"], over), P(s["b"], over)], fill=(0, 200, 255, 200), width=2)

sc = shot_crop().resize(base.size, Image.LANCZOS)

sheet = Image.new("RGB", (base.width * 3 + 24, base.height), (18, 18, 18))
for i, (im, lab, col) in enumerate(((base, "SPRITE", (0, 255, 255)),
                                    (over, "SPRITE + LAYOUT", (255, 255, 0)),
                                    (sc, "RENDER", (255, 90, 90)))):
    x = i * (base.width + 12)
    sheet.paste(im, (x, 0))
    ImageDraw.Draw(sheet).text((x + 6, 6), lab, fill=col)

sheet.save("dev/shots/_tri.png")
print(f"wrote dev/shots/_tri.png  window x {x0}..{x1}  y {y0}..{y1}  {sheet.size}")
print("green = bumper, yellow = tiki shack, white = post, "
      "pink = insert lamp, orange = target, cyan = rail")
