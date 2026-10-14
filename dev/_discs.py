"""dev/_discs.py -- find the painted discs on the playfield sprite.

  python dev/_discs.py [radius_pct] [x0 y0 x1 y1]

The field is covered in coloured discs, each with a pale figure on it.
A disc is a locally-uniform, strongly-saturated patch, so we score
every pixel by the mean colour of a disc of radius `r` centred on it
and keep the peaks.  That is objective and repeatable, unlike eyeballing
or Hough (which was far too noisy on this artwork).

Output is art-percent, comparable with dev/layout.json.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

RP = float(sys.argv[1]) if len(sys.argv) > 1 else 2.6
box = [float(v) for v in sys.argv[2:6]] if len(sys.argv) > 5 else [18, 18, 82, 46]

im = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
A = np.asarray(im).astype(np.float32)
H, W = A.shape[:2]

x0, y0, x1, y1 = box
px0, py0 = int(x0 / 100 * W), int(y0 / 100 * H)
px1, py1 = int(x1 / 100 * W), int(y1 / 100 * H)
sub = A[py0:py1, px0:px1]
sh, sw = sub.shape[:2]

rr = max(2, int(RP / 100 * W))
yy, xx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
ker = (np.hypot(xx, yy) <= rr).astype(np.float32)
ker /= ker.sum()


def box_mean(ch):
    return ndimage.convolve(ch, ker, mode="nearest")


mr, mg, mb = box_mean(sub[:, :, 0]), box_mean(sub[:, :, 1]), box_mean(sub[:, :, 2])
mx = np.maximum(np.maximum(mr, mg), mb)
mn = np.minimum(np.minimum(mr, mg), mb)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
val = mx / 255.0

score = sat * np.sqrt(np.maximum(val, 0))       # saturated AND not black

# keep only peaks that are separated by at least one disc diameter
size = 2 * rr + 1
localmax = (score == ndimage.maximum_filter(score, size=size))
ys, xs = np.nonzero(localmax & (score > 0.42))

rows = []
for Y, X in zip(ys, xs):
    c = sub[Y, X]
    r, g, b = float(mr[Y, X]), float(mg[Y, X]), float(mb[Y, X])
    if max(r, g, b) < 60:
        name = "dark"
    elif r > g + 30 and r > b + 30:
        name = "RED"
    elif g > r + 18 and g > b + 8:
        name = "GREEN"
    elif b > r + 25 and b > g + 15:
        name = "blue"
    elif r > 140 and g > 105 and b < 130:
        name = "GOLD"
    else:
        name = "?"
    rows.append((round((px0 + X) / W * 100, 1),
                 round((py0 + Y) / H * 100, 1),
                 name, int(r), int(g), int(b), round(float(score[Y, X]), 3)))

rows.sort(key=lambda k: (k[1], k[0]))
print(f"radius {RP}%  region {box}  -> {len(rows)} discs")
for a in rows:
    print(f"  art({a[0]:5.1f},{a[1]:5.1f})  {a[2]:5s} rgb({a[3]:3d},{a[4]:3d},{a[5]:3d})  {a[6]}")
