"""SIDE panel: head, body and leg geometry."""
import numpy as np
from PIL import Image
from scipy import ndimage

im = Image.open("assets/3dref.jpg").convert("RGB")
A = np.asarray(im).astype(np.float32)
# SIDE panel: sheet x 0..424, y 632..1264 -> panel-local
S = A[632:1264, 0:424]
mx = S.max(axis=2); mn = S.min(axis=2)
sat = mx - mn; val = mx; lum = S.mean(axis=2)

art = sat > 30                       # colourful painted panels
dark = (val < 95) & (sat <= 30)      # black cabinet / legs

print("=== SIDE panel (panel-local px) ===")

# ---- body = biggest colourful blob
lab, n = ndimage.label(art, structure=np.ones((3, 3)))
sizes = ndimage.sum(art, lab, range(1, n + 1))
order = np.argsort(sizes)[::-1]
for k in order[:3]:
    b = lab == (k + 1)
    ys, xs = np.where(b)
    print("  art blob #%d  area %6d  x %d..%d (%d)  y %d..%d (%d)"
          % (k + 1, sizes[k], xs.min(), xs.max(), xs.max() - xs.min() + 1,
             ys.min(), ys.max(), ys.max() - ys.min() + 1))

# ---- body quad: per-row art extent, every 8 px
print("\n  body row extents:")
for y in range(250, 500, 10):
    r = np.where(art[y])[0]
    if len(r):
        print("    y=%3d  x %3d..%3d  w=%3d" % (y, r.min(), r.max(), r.max() - r.min() + 1))

# ---- legs: dark blob below the body
legs = dark.copy()
legs[:470, :] = False                 # only below the body
lab2, n2 = ndimage.label(legs, structure=np.ones((3, 3)))
if n2:
    sz2 = ndimage.sum(legs, lab2, range(1, n2 + 1))
    print("\n  leg blobs:")
    for k in np.argsort(sz2)[::-1][:4]:
        if sz2[k] < 200:
            break
        b = lab2 == (k + 1)
        ys, xs = np.where(b)
        print("    area %6d  x %3d..%3d  y %3d..%3d   cx %.1f"
              % (sz2[k], xs.min(), xs.max(), ys.min(), ys.max(), (xs.min() + xs.max()) / 2))

# ---- head (top of the panel)
head = art.copy()
head[260:, :] = False
lab3, n3 = ndimage.label(head, structure=np.ones((3, 3)))
sz3 = ndimage.sum(head, lab3, range(1, n3 + 1))
b = lab3 == (int(np.argmax(sz3)) + 1)
ys, xs = np.where(b)
print("\n  HEAD art  x %d..%d (%d)  y %d..%d (%d)"
      % (xs.min(), xs.max(), xs.max() - xs.min() + 1, ys.min(), ys.max(), ys.max() - ys.min() + 1))
print("  head row extents (front face = min x):")
for y in range(int(ys.min()), int(ys.max()) + 1, 20):
    r = np.where(b[y])[0]
    if len(r):
        print("    y=%3d  x %3d..%3d  depth=%3d" % (y, r.min(), r.max(), r.max() - r.min() + 1))

# ---- dark head shell (the backbox's black frame) -> true outer box
sh = dark.copy(); sh[260:, :] = False
lab4, n4 = ndimage.label(sh, structure=np.ones((3, 3)))
sz4 = ndimage.sum(sh, lab4, range(1, n4 + 1))
b4 = lab4 == (int(np.argmax(sz4)) + 1)
ys, xs = np.where(b4)
print("\n  HEAD shell (dark) x %d..%d (%d)  y %d..%d (%d)"
      % (xs.min(), xs.max(), xs.max() - xs.min() + 1, ys.min(), ys.max(), ys.max() - ys.min() + 1))
for y in range(int(ys.min()), int(ys.max()) + 1, 24):
    r = np.where(b4[y])[0]
    if len(r):
        print("    y=%3d  x %3d..%3d  depth=%3d" % (y, r.min(), r.max(), r.max() - r.min() + 1))

# ---- k_side
print("\n  k_side = 50.8 / body_length_px")
