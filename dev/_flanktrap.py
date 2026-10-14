"""Trace the trapezoid outline of the sheet's cabinet-flank panel (the big
ONEDROP art, sheet label 'CABINET SIDE (R)' area) by finding, per column, the
topmost and bottommost non-background pixel."""
import numpy as np
from PIL import Image

A = np.asarray(Image.open('assets/sprite2.png').convert('RGB')).astype(np.int16)
mx = A.max(axis=2).astype(np.float32)
mn = A.min(axis=2).astype(np.float32)
sat = (mx - mn) / np.maximum(mx, 1.0)
lum = A.mean(axis=2)
bg = ((sat < 0.16) & (lum > 55) & (lum < 130)) | \
     ((sat > 0.22) & (lum > 85) & (A[:, :, 1] > A[:, :, 0]) & (A[:, :, 1] > A[:, :, 2]))
content = ~bg

Y0, Y1 = 228, 440
print('col   top   bot   h')
tops, bots = {}, {}
for x in range(14, 356):
    col = content[Y0:Y1, x]
    idx = np.where(col)[0]
    if len(idx) < 20:
        continue
    top, bot = Y0 + idx[0], Y0 + idx[-1]
    tops[x] = top; bots[x] = bot
    if x % 8 == 0:
        print('%3d  %4d  %4d  %4d' % (x, top, bot, bot - top + 1))

xs = sorted(tops)
print('\nleftmost col', xs[0], 'rightmost col', xs[-1])
# fit straight lines to the top edge, ignoring the first/last few columns
sel = [x for x in xs if xs[0] + 4 <= x <= xs[-1] - 4]
X = np.array(sel, dtype=float)
T = np.array([tops[x] for x in sel], dtype=float)
B = np.array([bots[x] for x in sel], dtype=float)
mt, ct = np.polyfit(X, T, 1)
mb, cb = np.polyfit(X, B, 1)
print('top edge    y = %.4f x + %.2f   angle %.2f deg' % (mt, ct, np.degrees(np.arctan(mt))))
print('bottom edge y = %.4f x + %.2f   angle %.2f deg' % (mb, cb, np.degrees(np.arctan(mb))))
for x in (xs[0], xs[-1]):
    print('  x=%3d  top=%7.1f  bot=%7.1f  h=%6.1f' % (x, mt * x + ct, mb * x + cb, (mb - mt) * x + cb - ct))
print('\nleft  col span', xs[0], '..', xs[-1], 'width', xs[-1] - xs[0] + 1)
