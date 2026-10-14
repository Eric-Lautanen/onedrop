"""Row/column profiles of the reference SIDE ELEVATION panel with run structure,
so the two legs are not read as one full-width span."""
import numpy as np
from PIL import Image

im = Image.open('assets/3dref.jpg').convert('RGB')
A = np.asarray(im).astype(np.int16)
H, W = A.shape[:2]
print('sheet', W, H)

# SIDE ELEVATION panel = bottom-left quadrant
x0, y0, x1, y1 = 0, 632, 424, 1264
P = A[y0:y1, x0:x1]
mx = P.max(axis=2).astype(np.float32)
mn = P.min(axis=2).astype(np.float32)
sat = (mx - mn) / np.maximum(mx, 1.0)
lum = P.mean(axis=2)
# background of the panel is a mid grey/blue; the machine is either saturated
# art or near-black. content = saturated OR dark
content = (sat > 0.22) | (lum < 62)
print('content fraction %.3f' % content.mean())


def runs(row):
    """list of (start,end) inclusive runs of True"""
    out = []
    s = None
    for i, v in enumerate(row):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append((s, i - 1)); s = None
    if s is not None:
        out.append((s, len(row) - 1))
    return [r for r in out if r[1] - r[0] >= 2]


print('\n-- rows (sheet y), runs as sheet x, run width >= 3 --')
for ry in range(0, P.shape[0], 10):
    rr = runs(content[ry])
    if not rr:
        continue
    print('y=%4d  %s' % (y0 + ry, '  '.join('[%d-%d w%d]' % (x0 + a, x0 + b, b - a + 1) for a, b in rr)))
