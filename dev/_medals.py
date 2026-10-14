"""dev/_medals.py -- find every painted medallion on the playfield sprite.

  python dev/_medals.py [minarea]

A medallion is a coloured disc with a bright near-white figure standing
in it.  The figure is by far the brightest thing on the field, so a
white-blob detector finds the medallion centres objectively -- no
eyeballing, and no Hough noise.  For each hit we also sample the ring
around it, which gives the disc's colour, so a hit can be matched to a
bumper by colour as well as by position.

Output is art-percent (x 0..100 left->right, y 0..100 arch->drain),
directly comparable with dev/layout.json.
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

MIN_AREA = int(sys.argv[1]) if len(sys.argv) > 1 else 12

im = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
A = np.asarray(im).astype(np.float32)
H, W = A.shape[:2]

r, g, b = A[:, :, 0], A[:, :, 1], A[:, :, 2]
lum = 0.299 * r + 0.587 * g + 0.114 * b
# near-white AND bright: the figures are drawn as pale cream
mask = (lum > 190) & (np.abs(r - b) < 55) & (np.abs(r - g) < 55)

lab, n = ndimage.label(mask)
print(f"atlas {W}x{H}, {n} raw white blobs")

objs = ndimage.find_objects(lab)
hits = []
for i, sl in enumerate(objs, start=1):
    ys, xs = sl
    h = ys.stop - ys.start
    w = xs.stop - xs.start
    area = int((lab[sl] == i).sum())
    if area < MIN_AREA:
        continue
    if h < 3 or w < 2:
        continue
    if h > 40 or w > 30:          # a figure, not a letter or a rail
        continue
    cy = (ys.start + ys.stop) / 2
    cx = (xs.start + xs.stop) / 2
    ax, ay = cx / W * 100, cy / H * 100

    # sample the disc colour in an annulus around the figure
    rr = 0.030 * W
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot(xx - cx, yy - cy)
    ring = (d > rr * 0.75) & (d < rr * 1.25)
    col = A[ring].mean(axis=0) if ring.any() else [0, 0, 0]

    hits.append({
        "art": [round(ax, 1), round(ay, 1)],
        "area": area,
        "wh": [w, h],
        "rgb": [int(v) for v in col],
    })

hits.sort(key=lambda k: (k["art"][1], k["art"][0]))
print(f"{len(hits)} medallions (area >= {MIN_AREA})")
for k in hits:
    rr, gg, bb = k["rgb"]
    # crude hue name so the list is readable
    mx = max(k["rgb"])
    if mx < 60:
        name = "dark"
    elif rr > gg + 35 and rr > bb + 35:
        name = "RED"
    elif gg > rr + 25 and gg > bb + 15:
        name = "GREEN"
    elif bb > rr + 25 and bb > gg + 15:
        name = "blue"
    elif rr > 150 and gg > 120 and bb < 110:
        name = "GOLD"
    else:
        name = "?"
    print(f"  art({k['art'][0]:5.1f},{k['art'][1]:5.1f})  {name:5s} "
          f"rgb({rr:3d},{gg:3d},{bb:3d})  area {k['area']:3d}  {k['wh']}")

json.dump(hits, open("dev/medals.json", "w"), indent=1)
print("wrote dev/medals.json")
