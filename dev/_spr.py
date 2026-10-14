"""dev/_spr.py -- clean, high-zoom crop of the playfield SPRITE, with an
optional art-percent grid, for reading painted feature positions.

  python dev/_spr.py x0 y0 x1 y1 [zoom] [--grid] [--marks]
"""
import sys

from PIL import Image, ImageDraw

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = {a for a in sys.argv[1:] if a.startswith("--")}
x0, y0, x1, y1 = (float(v) for v in args[:4])
Z = int(args[4]) if len(args) > 4 else 4

atlas = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
AW, AH = atlas.size

crop = atlas.crop((int(x0 / 100 * AW), int(y0 / 100 * AH),
                   int(x1 / 100 * AW), int(y1 / 100 * AH)))
crop = crop.resize((crop.width * Z, crop.height * Z), Image.LANCZOS)

if "--grid" in flags:
    ov = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    step = 1
    gx = int(x0)
    while gx <= x1:
        X = (gx - x0) / (x1 - x0) * crop.width
        major = (gx % 5 == 0)
        d.line([(X, 0), (X, crop.height)],
               fill=(0, 255, 255, 200 if major else 70), width=2 if major else 1)
        if major:
            d.text((X + 3, 3), str(gx), fill=(0, 255, 255, 255))
        gx += step
    gy = int(y0)
    while gy <= y1:
        Y = (gy - y0) / (y1 - y0) * crop.height
        major = (gy % 5 == 0)
        d.line([(0, Y), (crop.width, Y)],
               fill=(0, 255, 255, 200 if major else 70), width=2 if major else 1)
        if major:
            d.text((3, Y + 3), str(gy), fill=(0, 255, 255, 255))
        gy += step
    crop = Image.alpha_composite(crop.convert("RGBA"), ov).convert("RGB")

out = "dev/shots/_spr_clean.png"
crop.save(out)
print("wrote", out, crop.size, f"art {x0},{y0} .. {x1},{y1}  zoom {Z}")
