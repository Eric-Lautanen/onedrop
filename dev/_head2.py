"""Backbox face measurement, region-constrained to the head only."""
import numpy as np
from PIL import Image
from scipy import ndimage

im = Image.open("assets/3dref.jpg").convert("RGB")
A = np.asarray(im).astype(np.float32)
P = A[0:632, 0:424]
mx = P.max(axis=2); mn = P.min(axis=2)
sat = mx - mn; val = mx; lum = P.mean(axis=2)

# ---- find the head/body split: the row where the silhouette narrows
mask = (sat > 30) | (val < 100)
widths = []
for y in range(45, 300):
    r = np.where(mask[y, 60:380])[0]
    widths.append((y, (r.max() - r.min() + 1) if len(r) else 0))
head_rows = [y for y, w in widths if w >= 215]
print("full-width rows y %d..%d" % (min(head_rows), max(head_rows)))
HY0, HY1 = min(head_rows), max(head_rows)
HX0, HX1 = 101, 323
W = HX1 - HX0 + 1
print("HEAD  x %d..%d (%d px)   y %d..%d (%d px)" % (HX0, HX1, W, HY0, HY1, HY1 - HY0 + 1))

# ---- per-row dark fraction inside the head
print("\nrow  darkfrac  meanlum")
for y in range(HY0, HY1 + 1, 3):
    seg = lum[y, HX0 + 5:HX1 - 4]
    print("  %3d   %.2f     %5.1f" % (y, (seg < 70).mean(), seg.mean()))

# ---- glass / band split = last row of colourful art
colourfrac = []
for y in range(HY0, HY1 + 1):
    seg = sat[y, HX0 + 5:HX1 - 4]
    colourfrac.append((y, (seg > 40).mean()))
art_rows = [y for y, f in colourfrac if f > 0.30]
print("\nart rows (sat>40 on >30%% of width): y %d..%d" % (min(art_rows), max(art_rows)))
GTOP, GBOT = min(art_rows), max(art_rows)
print("GLASS  y %d..%d  (%d px = %.2f u)  aspect %.2f"
      % (GTOP, GBOT, GBOT - GTOP + 1, (GBOT - GTOP + 1) * 0.12466, W / (GBOT - GTOP + 1)))
print("BAND   y %d..%d  (%d px = %.2f u)  aspect %.2f"
      % (GBOT + 1, HY1, HY1 - GBOT, (HY1 - GBOT) * 0.12466, W / (HY1 - GBOT)))

# ---- speaker circles: in the band, the cone is a slightly LIGHTER disc.
BT, BB = GBOT + 2, HY1 - 1
band = lum[BT:BB + 1, HX0:HX1 + 1]
sm = ndimage.gaussian_filter(band, 2.0)
# local contrast: subtract a heavy blur, keep positive bumps
bg = ndimage.gaussian_filter(sm, 14)
bump = sm - bg
print("\nband bump map (x: peak value), every 4 px:")
prof = bump.max(axis=0)
print("   " + " ".join("%d:%d" % (HX0 + i, int(prof[i])) for i in range(0, W, 4)))
# find the two strongest separated peaks
order = np.argsort(prof)[::-1]
peaks = []
for i in order:
    if all(abs(i - j) > 20 for j in peaks):
        peaks.append(int(i))
    if len(peaks) == 4:
        break
peaks.sort()
print("bump peaks at x:", [HX0 + p for p in peaks], " vals:", [int(prof[p]) for p in peaks])
