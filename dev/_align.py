"""dev/_align.py -- do the lamps sit on the painting's own inserts?

  python dev/_align.py

Detects the circular inserts painted in the playfield artwork (numpy
Hough, no OpenCV needed), converts both the inserts and the live lamp
positions into art percent, and matches them up. Reports:

  * how far each lamp is from the nearest painted insert
  * painted inserts with no lamp on them (dark inserts)
  * lamps sitting on bare artwork (lights in the wrong place)
"""
import json
import math

import numpy as np
from PIL import Image, ImageDraw

ATLAS = "dev/shots/_atlas_playfield.png"
OUT = "dev/shots/_align.png"

# the painting's inserts are ~2-4 art-percent across
RMIN, RMAX = 5, 22
MAX_OFF = 3.2          # art-percent: beyond this a lamp is "off insert"

im = Image.open(ATLAS).convert("RGB")
PW, PH = im.size
a = np.asarray(im).astype(np.float32)
lum = a.mean(axis=2)

# ---- edge field ----------------------------------------------------
gx = np.zeros_like(lum); gy = np.zeros_like(lum)
gx[:, 1:-1] = lum[:, 2:] - lum[:, :-2]
gy[1:-1, :] = lum[2:, :] - lum[:-2, :]
mag = np.hypot(gx, gy)
thr = np.percentile(mag, 88)
ey, ex = np.where(mag > thr)
gxn = gx[ey, ex] / (mag[ey, ex] + 1e-6)
gyn = gy[ey, ex] / (mag[ey, ex] + 1e-6)
print(f"edge pixels: {len(ey)}")

# ---- Hough accumulator ---------------------------------------------
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

cand = []
for y in range(8, PH - 8):
    for x in range(8, PW - 8):
        v = sm[y, x]
        if v < sm[y - 6:y + 7, x - 6:x + 7].max():
            continue
        cand.append((v, x, y))
cand.sort(reverse=True)
keep = []
for v, x, y in cand:
    if v < 0.55 * sm.max():
        break
    if all(math.hypot(x - kx, y - ky) > 14 for _, kx, ky in keep):
        keep.append((v, x, y))

# ---- keep the ones that are actually coloured inserts ---------------
ins = []
yy, xx = np.ogrid[:PH, :PW]
for v, x, y in keep:
    rr = 11
    m = (xx - x) ** 2 + (yy - y) ** 2 <= rr * rr
    col = a[m].mean(axis=0)
    mx_, mn_ = col.max(), col.min()
    if mx_ - mn_ < 50 or mx_ < 105:
        continue                      # grey / too dark to be an insert
    R, G, B = col
    if R > G * 1.25 and R > B * 1.25:
        kind = "red"
    elif G > R * 1.05 and G > B * 1.05:
        kind = "green"
    else:
        kind = "gold"
    ins.append({"x": x / PW * 100, "y": y / PH * 100, "kind": kind})

print(f"painted inserts detected: {len(ins)}")

# ---- the live lamps -------------------------------------------------
lamps = json.load(open("dev/layout.json"))["lamps"]
print(f"lamps in the layout:      {len(lamps)}")

# ---- match ----------------------------------------------------------
pairs, orphans = [], []
for l in lamps:
    lx, ly = l["c"]
    best, bd = None, 1e9
    for c in ins:
        dd = math.hypot(c["x"] - lx, c["y"] - ly)
        if dd < bd:
            bd, best = dd, c
    rec = {"lamp": [round(lx, 1), round(ly, 1)], "kind": l["kind"],
           "off": round(bd, 2), "insert": [round(best["x"], 1), round(best["y"], 1)]}
    (pairs if bd <= MAX_OFF else orphans).append(rec)

used = set()
for p in pairs:
    used.add(tuple(p["insert"]))
dark = [c for c in ins if (round(c["x"], 1), round(c["y"], 1)) not in used]

offs = sorted(p["off"] for p in pairs)
print()
print(f"lamps ON an insert (<= {MAX_OFF}%): {len(pairs)}")
if offs:
    print(f"  offset  median {offs[len(offs)//2]:.2f}%   worst {offs[-1]:.2f}%")
print(f"lamps NOT on any insert:        {len(orphans)}")
for o in orphans[:20]:
    print(f"   lamp at {o['lamp']} ({o['kind']}) is {o['off']}% from "
          f"the nearest insert {o['insert']}")
print(f"painted inserts with no lamp:   {len(dark)}")

# ---- draw -----------------------------------------------------------
vis = im.resize((PW * 2, PH * 2), Image.LANCZOS)
d = ImageDraw.Draw(vis, "RGBA")
for c in ins:
    x, y = c["x"] / 100 * PW * 2, c["y"] / 100 * PH * 2
    d.ellipse([x - 11, y - 11, x + 11, y + 11], outline=(0, 255, 255, 230), width=2)
for p in pairs:
    lx, ly = p["lamp"][0] / 100 * PW * 2, p["lamp"][1] / 100 * PH * 2
    d.ellipse([lx - 3, ly - 3, lx + 3, ly + 3], fill=(255, 255, 255, 255))
for o in orphans:
    lx, ly = o["lamp"][0] / 100 * PW * 2, o["lamp"][1] / 100 * PH * 2
    d.ellipse([lx - 7, ly - 7, lx + 7, ly + 7], outline=(255, 40, 40, 255), width=3)
vis.resize((PW, PH), Image.LANCZOS).save(OUT)
print(f"\nwrote {OUT}   cyan = painted insert, white dot = lamp on it, "
      f"red ring = lamp off insert")
