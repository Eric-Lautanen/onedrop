"""Measure the backbox face in the FRONT panel of assets/3dref.jpg.

Finds: backbox bbox, the glass/band split, the two speaker circles, the
DMD window, and the gold trim rows.  Everything in panel-local px.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

im = Image.open("assets/3dref.jpg").convert("RGB")
A = np.asarray(im).astype(np.float32)
# FRONT panel = sheet x 0..424, y 0..632
P = A[0:632, 0:424]
mx = P.max(axis=2)
mn = P.min(axis=2)
sat = mx - mn
val = mx
lum = P.mean(axis=2)

# ---- backbox silhouette: use the widest dark+colour blob in the top half
mask = (sat > 30) | (val < 100)
top = mask[0:300, :]
lab, n = ndimage.label(top, structure=np.ones((3, 3)))
sizes = ndimage.sum(top, lab, range(1, n + 1))
big = (lab == (int(np.argmax(sizes)) + 1))
ys, xs = np.where(big)
bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
print("backbox bbox  x %d..%d (%d px)   y %d..%d (%d px)"
      % (bx0, bx1, bx1 - bx0 + 1, by0, by1, by1 - by0 + 1))
W = bx1 - bx0 + 1
H = by1 - by0 + 1

# ---- rows that are mostly dark -> the score band
inner = lum[by0:by1 + 1, bx0 + 4:bx1 - 3]
darkfrac = (inner < 70).mean(axis=1)
rows = np.where(darkfrac > 0.90)[0]
# contiguous run nearest the bottom
if len(rows):
    runs = []
    s = rows[0]; p = rows[0]
    for r in rows[1:]:
        if r != p + 1:
            runs.append((s, p)); s = r
        p = r
    runs.append((s, p))
    runs = [r for r in runs if r[1] - r[0] > 12]
    print("dark band runs (panel-local y):", [(by0 + a, by0 + b) for a, b in runs])
    band = max(runs, key=lambda r: r[1] - r[0])
    btop, bbot = by0 + band[0], by0 + band[1]
    print("BAND y %d..%d  (%d px = %.2f u @k=0.12523)  aspect %.2f"
          % (btop, bbot, bbot - btop + 1, (bbot - btop + 1) * 0.12523, W / (bbot - btop + 1)))

# ---- speaker circles: search the band for ring/rim structure.
# The band is uniformly dark; the speakers add a slightly lighter recessed
# cone.  Blur then look for local maxima of brightness inside the band.
bandimg = lum[btop:bbot + 1, bx0:bx1 + 1]
sm = ndimage.gaussian_filter(bandimg, 3)
# column profile of the band's brightness
colp = sm.mean(axis=0)
rowp = sm.mean(axis=1)
print("band col profile peaks:",
      [(bx0 + i, round(float(colp[i]), 1))
       for i in range(3, len(colp) - 3) if colp[i] == max(colp[max(0, i - 18):i + 19])])
print("band row profile: min %.1f at y=%d   max %.1f at y=%d"
      % (rowp.min(), btop + int(np.argmin(rowp)), rowp.max(), btop + int(np.argmax(rowp))))

# ---- gold/bright pixels -> the DMD readout text + gold trim
gold = (P[:, :, 0] > 150) & (P[:, :, 1] > 110) & (P[:, :, 2] < 150) & (sat > 40)
g = gold[btop:bbot + 1, bx0:bx1 + 1]
cols = np.where(g.sum(axis=0) > 0)[0]
if len(cols):
    print("bright(gold) pixels inside band span x %d..%d" % (bx0 + cols.min(), bx0 + cols.max()))
    # column histogram, in 10 buckets across the band
    hist = g.sum(axis=0)
    step = max(1, W // 24)
    print("gold column histogram (x:count):")
    print("   " + " ".join("%d:%d" % (bx0 + i, int(hist[i])) for i in range(0, W, step)))

# ---- glass zone = the colourful art above the band
gtop = by0 + 4
glass = lum[gtop:btop, bx0 + 4:bx1 - 3]
print("glass zone y %d..%d  (%d px = %.2f u)  aspect %.2f"
      % (gtop, btop - 1, btop - gtop, (btop - gtop) * 0.12523, W / (btop - gtop)))
print("k_front = 27.8 / %d = %.5f" % (W, 27.8 / W))
