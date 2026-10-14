"""dev/_circles.py -- find the painted circles in the playfield artwork.

  python dev/_circles.py

Pure-numpy Hough (no OpenCV). Writes:
  dev/shots/_circles.png   the artwork with every circle it found drawn on
  dev/circles.json         x,y in art percent + radius in art-percent

Tuned for the 318x584 atlas: a pop bumper is about 16 px across, an
insert lens about 8, so the radius sweep covers 5..22.
"""
import json
import math

import numpy as np
from PIL import Image, ImageDraw

ATLAS = "dev/shots/_atlas_playfield.png"
RMIN, RMAX = 5, 22

im = Image.open(ATLAS).convert("RGB")
PW, PH = im.size
a = np.asarray(im).astype(np.float32)
lum = a.mean(axis=2)

gx = np.zeros_like(lum); gy = np.zeros_like(lum)
gx[:, 1:-1] = lum[:, 2:] - lum[:, :-2]
gy[1:-1, :] = lum[2:, :] - lum[:-2, :]
mag = np.hypot(gx, gy)
thr = np.percentile(mag, 86)
ey, ex = np.where(mag > thr)
gxn = gx[ey, ex] / (mag[ey, ex] + 1e-6)
gyn = gy[ey, ex] / (mag[ey, ex] + 1e-6)
print(f"edge pixels: {len(ey)}")

acc = np.zeros((PH, PW), np.float32)
for r in range(RMIN, RMAX + 1):
    for s in (-1, 1):
        cx = (ex + gxn * r * s).astype(np.int32)
        cy = (ey + gyn * r * s).astype(np.int32)
        ok = (cx >= 0) & (cx < PW) & (cy >= 0) & (cy < PH)
        np.add.at(acc, (cy[ok], cx[ok]), 1.0 / r)

k = np.ones((5, 5), np.float32); k /= k.sum()
pad = np.pad(acc, 2, mode="edge")
sm = np.zeros_like(acc)
for dy in range(5):
    for dx in range(5):
        sm += k[dy, dx] * pad[dy:dy + PH, dx:dx + PW]

# peaks with greedy non-max suppression
cand = []
for y in range(6, PH - 6):
    for x in range(6, PW - 6):
        v = sm[y, x]
        if v < sm[y - 5:y + 6, x - 5:x + 6].max():
            continue
        cand.append((v, x, y))
cand.sort(reverse=True)
keep = []
for v, x, y in cand:
    if v < 0.30 * sm.max():
        break
    if all(math.hypot(x - kx, y - ky) > 9 for _, kx, ky in keep):
        keep.append((v, x, y))
print(f"peaks: {len(keep)}")

# radius + colour per peak
out = []
yy, xx = np.ogrid[:PH, :PW]
for v, x, y in keep:
    best_r, best_s = 8, -1
    for r in range(RMIN, RMAX + 1):
        m = np.abs(np.hypot(xx - x, yy - y) - r) <= 1.0
        if m.sum() < 8:
            continue
        s = mag[m].mean()
        if s > best_s:
            best_s, best_r = s, r
    m = (xx - x) ** 2 + (yy - y) ** 2 <= max(3, best_r - 2) ** 2
    col = a[m].mean(axis=0)
    mx_, mn_ = col.max(), col.min()
    R, G, B = col
    if mx_ - mn_ < 34 or mx_ < 85:
        kind = "dark"
    elif R > G * 1.2 and R > B * 1.2:
        kind = "red"
    elif G > R * 1.05 and G > B * 1.05:
        kind = "green"
    else:
        kind = "gold"
    out.append({
        "x": round(x / PW * 100, 2), "y": round(y / PH * 100, 2),
        "rx": round(best_r / PW * 100, 2), "kind": kind,
        "col": [int(c) for c in col], "score": round(float(v), 1)
    })

out.sort(key=lambda c: -c["score"])
print(f"circles: {len(out)}")

vis = im.resize((PW * 3, PH * 3), Image.LANCZOS)
d = ImageDraw.Draw(vis, "RGBA")
for i, c in enumerate(out):
    x, y = c["x"] / 100 * PW * 3, c["y"] / 100 * PH * 3
    r = c["rx"] / 100 * PW * 3
    d.ellipse([x - r, y - r, x + r, y + r], outline=(0, 255, 255, 220), width=2)
    d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 0, 0, 255))
vis.resize((PW, PH), Image.LANCZOS).save("dev/shots/_circles.png")
json.dump(out, open("dev/circles.json", "w"), indent=1)

print(f"\n{'#':>3} {'x%':>6} {'y%':>6} {'r%':>6}  kind   colour")
for i, c in enumerate(out[:40]):
    print(f"{i:>3} {c['x']:>6.1f} {c['y']:>6.1f} {c['rx']:>6.2f}  {c['kind']:<6}"
          f" {c['col']}")
print(f"\nwrote dev/shots/_circles.png and dev/circles.json")
