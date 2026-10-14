"""Exact content rects on sprite2.png.

The sheet's paper is a flat mid grey (80,80,80); the panels are framed by a
green rule. Everything that is neither is panel art. A column/row counts as
content only when a large fraction of it is art, which rejects the rule and
any stray outline pixels.
"""
import numpy as np
from PIL import Image

A = np.asarray(Image.open('assets/sprite2.png').convert('RGB')).astype(np.int16)
mx = A.max(axis=2).astype(np.float32)
mn = A.min(axis=2).astype(np.float32)
sat = (mx - mn) / np.maximum(mx, 1.0)
lum = A.mean(axis=2)

paper = (sat < 0.18) & (lum > 55) & (lum < 130)
rule = (sat > 0.20) & (lum > 80)
art = ~(paper | rule)
# also drop the sheet's own thin dark frame lines (isolated dark pixels)
print('paper %.3f rule %.3f art %.3f' % (paper.mean(), rule.mean(), art.mean()))


def rect(name, x0, y0, x1, y1, colmin=0.55, rowmin=0.55):
    p = art[y0:y1, x0:x1]
    h, w = p.shape
    cf = p.mean(axis=0)
    rf = p.mean(axis=1)
    cols = np.where(cf > colmin)[0]
    rows = np.where(rf > rowmin)[0]
    if not len(cols) or not len(rows):
        print(name, 'NO CONTENT'); return
    cx0, cx1, ry0, ry1 = cols[0], cols[-1], rows[0], rows[-1]
    print('\n%-12s window %d,%d %dx%d' % (name, x0, y0, w, h))
    print('  content sheet rect  x %d..%d (%d)   y %d..%d (%d)' % (
        x0 + cx0, x0 + cx1, cx1 - cx0 + 1, y0 + ry0, y0 + ry1, ry1 - ry0 + 1))
    print('  frac  x %.5f  y %.5f  w %.5f  h %.5f' % (
        (x0 + cx0) / 843, (y0 + ry0) / 1264,
        (cx1 - cx0 + 1) / 843, (ry1 - ry0 + 1) / 1264))
    print('  aspect %.4f' % ((cx1 - cx0 + 1) / (ry1 - ry0 + 1)))
    return (x0 + cx0, y0 + ry0, cx1 - cx0 + 1, ry1 - ry0 + 1)


rect('frontArt', 8, 436, 362, 616, 0.75, 0.75)
rect('cabSide', 8, 26, 165, 260, 0.75, 0.75)
rect('bbSide', 344, 30, 440, 280, 0.75, 0.75)

# --- the flank trapezoid: per-column top/bottom of the art, x 150..356 where
#     nothing else is above it
print('\n-- flank trapezoid, per-column top/bottom --')
tops, bots = {}, {}
for x in range(150, 360):
    col = art[236:432, x]
    idx = np.where(col)[0]
    if len(idx) < 40:
        continue
    tops[x] = 236 + idx[0]; bots[x] = 236 + idx[-1]
for x in sorted(tops):
    if x % 10:
        continue
    print('  x=%3d  top=%3d  bot=%3d  h=%3d' % (x, tops[x], bots[x], bots[x] - tops[x] + 1))
xs = np.array(sorted(tops), dtype=float)
T = np.array([tops[int(x)] for x in xs]); B = np.array([bots[int(x)] for x in xs])
mt, ct = np.polyfit(xs, T, 1)
mb, cb = np.polyfit(xs, B, 1)
print('  top  y=%.4f x + %.2f  (%.2f deg)' % (mt, ct, np.degrees(np.arctan(mt))))
print('  bot  y=%.4f x + %.2f  (%.2f deg)' % (mb, cb, np.degrees(np.arctan(mb))))
print('  at x=150: top %.1f bot %.1f h %.1f' % (mt * 150 + ct, mb * 150 + cb, (mb - mt) * 150 + cb - ct))
print('  at x=356: top %.1f bot %.1f h %.1f' % (mt * 356 + ct, mb * 356 + cb, (mb - mt) * 356 + cb - ct))
