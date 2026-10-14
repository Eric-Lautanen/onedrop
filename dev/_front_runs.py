"""FRONT panel row profile with RUN structure (so legs don't read as one span)."""
import numpy as np
from PIL import Image

im = Image.open("assets/3dref.jpg").convert("RGB")
A = np.asarray(im).astype(np.float32)
P = A[0:632, 0:424]
mx = P.max(axis=2); mn = P.min(axis=2)
sat = mx - mn; val = mx
mask = (sat > 30) | (val < 100)


def runs(row, minlen=3):
    r = np.where(row)[0]
    if not len(r):
        return []
    out = []
    s = p = r[0]
    for x in r[1:]:
        if x != p + 1:
            if p - s + 1 >= minlen:
                out.append((s, p))
            s = x
        p = x
    if p - s + 1 >= minlen:
        out.append((s, p))
    return out


print("FRONT panel runs (x ranges with width>=3):")
for y in range(45, 632, 5):
    rr = runs(mask[y])
    if rr:
        txt = " ".join("%d-%d" % r for r in rr[:8])
        print("  y=%3d  %s" % (y, txt))
