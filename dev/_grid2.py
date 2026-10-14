"""dev/_grid2.py -- labelled pixel-grid overlays for measuring the sheet.

Writes a full-sheet view plus 2.5x tiles, each with a labelled pixel
grid, so panel edges can be read off to the pixel.

  python dev/_grid2.py
"""
import os
from PIL import Image, ImageDraw

SRC = "assets/sprite2.png"
OUT = "dev/crops"
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGB")
W, H = im.size
print(f"sheet {W} x {H}")


def overlay(img, ox, oy, step, label_every):
    """draw a pixel grid on a copy; ox/oy are the tile's sheet origin"""
    c = img.copy()
    d = ImageDraw.Draw(c)
    w, h = c.size
    for x in range(0, w, step):
        sx = ox + x
        major = sx % label_every == 0
        d.line([(x, 0), (x, h)], fill=(255, 60, 60) if major else (255, 255, 255), width=1)
        if major:
            d.text((x + 2, 2), str(sx), fill=(255, 240, 0))
            d.text((x + 2, h - 14), str(sx), fill=(255, 240, 0))
    for y in range(0, h, step):
        sy = oy + y
        major = sy % label_every == 0
        d.line([(0, y), (w, y)], fill=(255, 60, 60) if major else (255, 255, 255), width=1)
        if major:
            d.text((2, y + 2), str(sy), fill=(0, 255, 255))
            d.text((w - 44, y + 2), str(sy), fill=(0, 255, 255))
    return c


overlay(im, 0, 0, 50, 100).save(f"{OUT}/s2_full.png")

tiles = {
    "s2_tl": (0, 0, 440, 460),
    "s2_tr": (420, 0, 843, 460),
    "s2_ml": (0, 430, 440, 700),
    "s2_mr": (420, 430, 843, 700),
    "s2_bl": (0, 660, 440, 1010),
    "s2_bm": (0, 990, 440, 1264),
    "s2_br": (420, 660, 843, 1010),
    "s2_brb": (420, 990, 843, 1264),
}
for name, (x0, y0, x1, y1) in tiles.items():
    t = im.crop((x0, y0, x1, y1))
    t = t.resize((int(t.width * 2.5), int(t.height * 2.5)), Image.LANCZOS)
    t = overlay(t, x0, y0, 50, 100)            # 50 tile-px == 20 sheet-px
    t.save(f"{OUT}/{name}.png")
    print(f"{name}: sheet {x0},{y0} .. {x1},{y1}")

print("done")
