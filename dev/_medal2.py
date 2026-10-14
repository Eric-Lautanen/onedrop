"""dev/_medal2.py -- find the painted medallions on the playfield sprite.

  python dev/_medal2.py [x0 y0 x1 y1]

A medallion is a bright pale FIGURE sitting inside a saturated coloured
DISC.  So the signature is: high luminance in a small core, surrounded
by an annulus that is strongly saturated.  Scoring that and taking the
peaks is far more stable than Hough (which returned hundreds of
spurious circles) or a plain white-blob search (the figures are only a
few pixels at this atlas resolution).

Also writes dev/shots/_medals_marked.png so the hits can be eyeballed.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

box = [float(v) for v in sys.argv[1:5]] if len(sys.argv) > 4 else [20, 18, 80, 46]

im = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
A = np.asarray(im).astype(np.float32)
H, W = A.shape[:2]

x0, y0, x1, y1 = box
px0, py0 = int(x0 / 100 * W), int(y0 / 100 * H)
px1, py1 = int(x1 / 100 * W), int(y1 / 100 * H)
sub = A[py0:py1, px0:px1]

lum = 0.299 * sub[:, :, 0] + 0.587 * sub[:, :, 1] + 0.114 * sub[:, :, 2]
mx = sub.max(axis=2)
mn = sub.min(axis=2)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)


def disc_kernel(rad):
    r = max(1, int(round(rad)))
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    k = (np.hypot(xx, yy) <= r).astype(np.float32)
    return k / k.sum()


core = ndimage.convolve(lum, disc_kernel(1.1 / 100 * W), mode="nearest")
ring_sat = ndimage.convolve(sat, disc_kernel(2.4 / 100 * W), mode="nearest")
ring_lum = ndimage.convolve(lum, disc_kernel(2.4 / 100 * W), mode="nearest")

# the figure is brighter than the disc it stands on
score = (core - ring_lum) * ring_sat

sep = int(round(5.0 / 100 * W))          # keep peaks one disc apart
peak = (score == ndimage.maximum_filter(score, size=2 * sep + 1)) & (score > 0.30)

ys, xs = np.nonzero(peak)
hits = []
for Y, X in zip(ys, xs):
    hits.append((
        round((px0 + X) / W * 100, 1),
        round((py0 + Y) / H * 100, 1),
        int(sub[Y, X, 0]), int(sub[Y, X, 1]), int(sub[Y, X, 2]),
        round(float(score[Y, X]), 3),
    ))
hits.sort(key=lambda k: (k[1], k[0]))


def name(rgb):
    r, g, b = rgb
    if max(rgb) < 55:
        return "dark"
    if r > g + 30 and r > b + 30:
        return "RED"
    if g > r + 15 and g > b + 5:
        return "GREEN"
    if b > r + 25 and b > g + 15:
        return "blue"
    if r > 150 and g > 120 and b < 140:
        return "GOLD"
    return "?"


print(f"region {box} -> {len(hits)} medallions")
for h in hits:
    print(f"  art({h[0]:5.1f},{h[1]:5.1f})  {name(h[2:5]):5s} "
          f"rgb({h[2]:3d},{h[3]:3d},{h[4]:3d})  {h[5]}")

# mark them on the sprite so the list can be trusted
ov = im.copy()
d = ImageDraw.Draw(ov)
for h in hits:
    cx, cy = h[0] / 100 * W, h[1] / 100 * H
    r = 3.4 / 100 * W
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(0, 255, 255), width=1)
    d.line([(cx - 4, cy), (cx + 4, cy)], fill=(255, 0, 255), width=1)
    d.line([(cx, cy - 4), (cx, cy + 4)], fill=(255, 0, 255), width=1)
c = ov.crop((px0, py0, px1, py1))
c = c.resize((c.width * 6, c.height * 6), Image.LANCZOS)
c.save("dev/shots/_medals_marked.png")
print("wrote dev/shots/_medals_marked.png", c.size)
