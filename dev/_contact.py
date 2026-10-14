"""dev/_contact.py -- contact sheet of candidate sprite regions.

Crops each candidate box at 1:1, labels it with its pixel rect, and
lays them out on one page so the framing can be checked and corrected
in a single pass.

  python dev/_contact.py
"""
import os
from PIL import Image, ImageDraw

SRC = "assets/sprite2.png"
OUT = "dev/crops"

# name: (x, y, w, h) in sheet pixels
BOXES = {
    "cabSide":      (16, 22, 70, 248),
    "backglass":    (100, 22, 245, 160),
    "bbSide":       (350, 22, 66, 250),
    "playfield":    (500, 26, 318, 586),
    "sideLong":     (16, 278, 300, 150),
    "dmdPanel":     (355, 280, 100, 90),
    "instructions": (355, 400, 100, 90),
    "cabFront":     (16, 440, 330, 150),
    "priceCard":    (355, 500, 100, 60),
    "tiki":         (16, 660, 90, 130),
    "popBumpers":   (205, 660, 215, 70),
    "multiFrames":  (205, 730, 215, 70),
    "targetStrips": (430, 660, 210, 70),
    "targetStrips2": (430, 745, 210, 70),
    "dmdPixel":     (650, 660, 190, 130),
    "ramps":        (16, 790, 190, 200),
    "flippers":     (205, 790, 215, 130),
    "playInserts":  (205, 920, 215, 100),
    "slingshots":   (650, 790, 190, 120),
    "scoreReel":    (650, 900, 190, 120),
    "pinball":      (16, 1000, 190, 200),
    "wireform":     (205, 1000, 215, 200),
    "rasta":        (430, 1000, 215, 200),
    "leg":          (650, 1000, 60, 200),
    "textures":     (700, 1140, 130, 90),
    "foot":         (700, 1040, 130, 80),
}

im = Image.open(SRC).convert("RGB")
W, H = im.size

COLS = 5
CELL = 250
PAD = 10
rows = (len(BOXES) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * (CELL + PAD) + PAD, rows * (CELL + PAD) + PAD), (18, 18, 20))
d = ImageDraw.Draw(sheet)

for i, (name, (x, y, w, h)) in enumerate(BOXES.items()):
    cx = PAD + (i % COLS) * (CELL + PAD)
    cy = PAD + (i // COLS) * (CELL + PAD)
    tile = im.crop((x, y, x + w, y + h))
    k = min(CELL / tile.width, (CELL - 26) / tile.height)
    tile = tile.resize((max(1, int(tile.width * k)), max(1, int(tile.height * k))), Image.LANCZOS)
    sheet.paste(tile, (cx, cy + 22))
    d.text((cx + 2, cy + 4), f"{name}", fill=(120, 255, 150))
    d.text((cx + 2, cy + 14),
           f"{x},{y} {w}x{h} a={w/h:.3f} f={x/W:.4f},{y/H:.4f},{w/W:.4f},{h/H:.4f}",
           fill=(230, 220, 120))

sheet.save(f"{OUT}/_contact.png")
print(f"wrote {OUT}/_contact.png  ({sheet.size})")
for name, (x, y, w, h) in BOXES.items():
    print(f"  {name:<15} {x:4d},{y:4d} {w:4d}x{h:4d}  aspect {w/h:.3f}   "
          f"frac {{ x: {x/W:.5f}, y: {y/H:.5f}, w: {w/W:.5f}, h: {h/H:.5f} }}")
