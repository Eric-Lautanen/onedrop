"""Run-structured profiles of the reference FRONT ORTHO panel."""
import numpy as np
from PIL import Image

A = np.asarray(Image.open('assets/3dref.jpg').convert('RGB')).astype(np.int16)
x0, y0, x1, y1 = 0, 0, 424, 632
P = A[y0:y1, x0:x1]
mx = P.max(axis=2).astype(np.float32)
mn = P.min(axis=2).astype(np.float32)
sat = (mx - mn) / np.maximum(mx, 1.0)
lum = P.mean(axis=2)
content = (sat > 0.22) | (lum < 62)


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


print('-- FRONT ORTHO rows --')
for ry in range(0, P.shape[0], 6):
    rr = runs(content[ry])
    if not rr:
        continue
    print('y=%3d  %s' % (y0 + ry, '  '.join('[%d-%d w%d]' % (x0 + a, x0 + b, b - a + 1) for a, b in rr)))
