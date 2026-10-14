"""Landmarks of the reference FRONT ORTHO (top-left panel), in sheet px.

Gives the numbers the head and the legs are built from: the head's width
against the body's, the leg length below the front face, and the overall
height. Run-structured so the two legs are never read as one span.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

A = np.asarray(Image.open('assets/3dref.jpg').convert('RGB')).astype(np.int16)
P = A[0:632, 0:424]
mx = P.max(axis=2).astype(np.float32)
mn = P.min(axis=2).astype(np.float32)
sat = (mx - mn) / np.maximum(mx, 1.0)
lum = P.mean(axis=2)
m = (sat > 0.22) | (lum < 62)
m = ndimage.binary_closing(m, np.ones((5, 5)))
lab, n = ndimage.label(m)
sizes = ndimage.sum(m, lab, range(1, n + 1))
m = lab == (int(np.argmax(sizes)) + 1)
ys, xs = np.where(m)
top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
print('silhouette x %d..%d (w %d)  y %d..%d (h %d)'
      % (left, right, right - left + 1, top, bot, bot - top + 1))


def runs(row, minw=3):
    out, s = [], None
    for i, v in enumerate(row):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append((s, i - 1)); s = None
    if s is not None:
        out.append((s, len(row) - 1))
    return [r for r in out if r[1] - r[0] + 1 >= minw]


print('\nrow profile every 6 px')
for ry in range(top, bot + 1, 6):
    rr = runs(m[ry])
    if rr:
        print('y=%4d  %s' % (ry, '  '.join('[%d-%d w%d]' % (a, b, b - a + 1) for a, b in rr)))
