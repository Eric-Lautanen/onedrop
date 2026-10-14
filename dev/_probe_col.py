"""dev/_probe_col.py -- sample the sprite's colour at a list of
art-percent points, and scan a small neighbourhood for the strongest
saturated disc, so a layout position can be checked against the art.

  python dev/_probe_col.py "42,30" "55,30" "48.5,36"
"""
import sys

import numpy as np
from PIL import Image

im = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
A = np.asarray(im).astype(np.float32)
H, W = A.shape[:2]


def name(rgb):
    r, g, b = rgb
    mx = max(rgb)
    if mx < 55:
        return "dark"
    if r > g + 30 and r > b + 30:
        return "RED"
    if g > r + 18 and g > b + 10:
        return "GREEN"
    if b > r + 25 and b > g + 15:
        return "blue"
    if r > 140 and g > 110 and b < 120:
        return "GOLD"
    return "?"


def disc(ax, ay, rpct):
    cx, cy = ax / 100 * W, ay / 100 * H
    rr = rpct / 100 * W
    yy, xx = np.mgrid[0:H, 0:W]
    m = np.hypot(xx - cx, yy - cy) < rr
    if not m.any():
        return [0, 0, 0], 0
    return A[m].mean(axis=0), int(m.sum())


def saturation(rgb):
    mx, mn = max(rgb), min(rgb)
    return 0 if mx == 0 else (mx - mn) / mx


def best_near(ax, ay, span=3.0, step=0.25):
    """the most saturated disc centre within `span` art-percent"""
    best = None
    v = -1
    s = -span
    while s <= span:
        t = -span
        while t <= span:
            c, n = disc(ax + s, ay + t, 2.6)
            sat = saturation(c) * (sum(c) / 3 / 255) ** 0.5
            if sat > v:
                v = sat
                best = (ax + s, ay + t, c)
            t += step
        s += step
    return best


for arg in sys.argv[1:]:
    ax, ay = (float(v) for v in arg.split(","))
    c, n = disc(ax, ay, 2.6)
    print(f"art({ax:5.1f},{ay:5.1f})  disc rgb({c[0]:5.0f},{c[1]:5.0f},{c[2]:5.0f}) "
          f"{name(c):5s}  sat {saturation(c):.2f}")
    b = best_near(ax, ay)
    print(f"    strongest nearby: art({b[0]:5.2f},{b[1]:5.2f}) "
          f"rgb({b[2][0]:5.0f},{b[2][1]:5.0f},{b[2][2]:5.0f}) {name(b[2])}")
