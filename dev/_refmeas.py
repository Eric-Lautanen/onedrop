"""Independent measurement pass over assets/3dref.jpg.

Splits the 843x1264 sheet into its four panels and reports the machine
silhouette for each, so the numbers in dev/3dref-match.md can be checked
against a fresh scan rather than trusted.

Mask rule: the panels sit on a smooth grey gradient with faint grid lines,
so "machine" = pixels that are either SATURATED (colour art) or DARK
(black cabinet / legs).  Grey background and grid lines are neither.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else "assets/3dref.jpg"
im = Image.open(SRC).convert("RGB")
A = np.asarray(im).astype(np.int16)
H, W, _ = A.shape
print("sheet %dx%d" % (W, H))

mx = A.max(axis=2)
mn = A.min(axis=2)
sat = mx - mn
val = mx

# panel split (from the markdown's divider claim) -- we re-derive it here too
def find_divider(axis):
    """darkest full-length line -> the panel divider"""
    if axis == 0:  # vertical divider -> scan columns
        prof = A[:, :, :].mean(axis=(0, 2))
    else:
        prof = A[:, :, :].mean(axis=(1, 2))
    return int(np.argmin(prof))

vd = find_divider(0)
hd = find_divider(1)
print("re-derived dividers: x=%d  y=%d" % (vd, hd))

PANELS = {
    "FRONT   (top-L)": (0, 0, vd, hd),
    "TOPDOWN (top-R)": (vd + 1, 0, W - vd - 1, hd),
    "SIDE    (bot-L)": (0, hd + 1, vd, H - hd - 1),
    "PERSP   (bot-R)": (vd + 1, hd + 1, W - vd - 1, H - hd - 1),
}


def mask_of(P):
    satm = sat[P[1]:P[1] + P[3], P[0]:P[0] + P[2]]
    valm = val[P[1]:P[1] + P[3], P[0]:P[0] + P[2]]
    return (satm > 30) | (valm < 100)


for name, P in PANELS.items():
    m = mask_of(P)
    # biggest connected blob
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n == 0:
        print("\n%s: empty" % name)
        continue
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    big = int(np.argmax(sizes)) + 1
    blob = lab == big
    ys, xs = np.where(blob)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    print("\n%s  panel %dx%d" % (name, P[2], P[3]))
    print("  blob bbox x %d..%d (%d px)  y %d..%d (%d px)  area %d"
          % (x0, x1, x1 - x0 + 1, y0, y1, y1 - y0 + 1, int(sizes[big - 1])))
    print("  aspect w/h = %.4f" % ((x1 - x0 + 1) / (y1 - y0 + 1)))
    # horizontal extent per row, every 10% of the blob height
    print("  row profile (y: x0..x1 width):")
    for f in np.linspace(0, 1, 21):
        yy = int(y0 + f * (y1 - y0))
        r = np.where(blob[yy])[0]
        if len(r):
            print("    y=%3d  x %3d..%3d  w=%3d" % (yy, r.min(), r.max(), r.max() - r.min() + 1))
