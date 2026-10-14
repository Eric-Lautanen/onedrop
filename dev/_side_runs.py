"""SIDE panel: body quad + legs, with run structure."""
import numpy as np
from PIL import Image

im = Image.open("assets/3dref.jpg").convert("RGB")
A = np.asarray(im).astype(np.float32)
S = A[632:1264, 0:424]
mx = S.max(axis=2); mn = S.min(axis=2)
sat = mx - mn; val = mx
mask = (sat > 30) | (val < 100)


def runs(row, minlen=2):
    r = np.where(row)[0]
    if not len(r):
        return []
    out = []; s = p = r[0]
    for x in r[1:]:
        if x != p + 1:
            if p - s + 1 >= minlen:
                out.append((s, p))
            s = x
        p = x
    if p - s + 1 >= minlen:
        out.append((s, p))
    return out


print("SIDE panel runs:")
for y in range(240, 600, 6):
    rr = runs(mask[y])
    if rr:
        print("  y=%3d  %s" % (y, " ".join("%d-%d" % r for r in rr[:6])))
