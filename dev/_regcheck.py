"""Measure the backbox-side panel, then render every cabinet region at the
size the game will use, so a gutter leak is obvious."""
import re
import numpy as np
from PIL import Image

SHEET = Image.open('assets/sprite2.png').convert('RGB')
A = np.asarray(SHEET).astype(np.int16)
mx = A.max(axis=2).astype(np.float32)
mn = A.min(axis=2).astype(np.float32)
sat = (mx - mn) / np.maximum(mx, 1.0)
lum = A.mean(axis=2)
paper = (sat < 0.18) & (lum > 55) & (lum < 130)
rule = (sat > 0.20) & (lum > 80)
art = ~(paper | rule)


def rect(name, x0, y0, x1, y1):
    p = art[y0:y1, x0:x1]
    cf = p.mean(axis=0); rf = p.mean(axis=1)
    cols = np.where(cf > 0.7)[0]; rows = np.where(rf > 0.7)[0]
    if not len(cols):
        print(name, 'none'); return
    cx0, cx1, ry0, ry1 = cols[0], cols[-1], rows[0], rows[-1]
    print('%-10s sheet %d,%d %dx%d   frac x %.5f y %.5f w %.5f h %.5f   aspect %.4f' % (
        name, x0 + cx0, y0 + ry0, cx1 - cx0 + 1, ry1 - ry0 + 1,
        (x0 + cx0) / 843, (y0 + ry0) / 1264,
        (cx1 - cx0 + 1) / 843, (ry1 - ry0 + 1) / 1264,
        (cx1 - cx0 + 1) / (ry1 - ry0 + 1)))


rect('bbSide', 348, 20, 448, 270)

# ---- render each cabinet region at the plane size the game uses ----
src = open('src/js/assets.js', encoding='utf-8').read()
body = src[src.index('var REGIONS = {'):src.index('/* The cabinet')]
REG = {}
for m in re.finditer(r"(\w+):\s*\{ x: ([\d.]+), y: ([\d.]+), w: ([\d.]+), h: ([\d.]+) \}", body):
    REG[m.group(1)] = [float(v) for v in m.groups()[1:]]

tiles = [
    ('frontArt', 1024, 461, 'the front face  27.8 x 12.5'),
    ('bbSide', 200, 560, 'head flank      8.0 x 22.4 (cover)'),
]
out = Image.new('RGB', (1200, 620), (22, 24, 28))
x = 10
for name, w, h, note in tiles:
    r = REG[name]
    sx, sy = r[0] * 843, r[1] * 1264
    sw, sh = r[2] * 843, r[3] * 1264
    c = Image.new('RGB', (w, h), (7, 8, 10))
    k = max(w / sw, h / sh) if name == 'bbSide' else min(w / sw, h / sh)
    dw, dh = sw * k, sh * k
    piece = SHEET.crop((round(sx), round(sy), round(sx + sw), round(sy + sh)))
    piece = piece.resize((max(1, round(dw)), max(1, round(dh))), Image.LANCZOS)
    c.paste(piece, (round((w - dw) / 2), round((h - dh) / 2)))
    out.paste(c, (x, 30))
    x += w + 20
out.save('dev/crops/_regions_check.png')
print('wrote dev/crops/_regions_check.png')

# ---- the rectified flank ----
Q = dict(x=24, y=232, w=318, h=174, drop=80)
FW, FH = 1024, 560
fl = Image.new('RGB', (FW, FH), (10, 11, 13))
for i in range(FW):
    t = i / (FW - 1)
    sx = Q['x'] + t * (Q['w'] - 1)
    top = Q['y'] + (sx - Q['x']) / (Q['w'] - 1) * Q['drop']
    sh = Q['y'] + Q['h'] - top
    col = SHEET.crop((round(sx), round(top), max(round(sx) + 1, round(sx + 1)),
                      round(Q['y'] + Q['h'])))
    fl.paste(col.resize((1, FH), Image.LANCZOS), (i, 0))
fl.save('dev/crops/_flank_rectified.png')
print('wrote dev/crops/_flank_rectified.png', fl.size)
