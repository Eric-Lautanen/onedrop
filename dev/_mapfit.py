"""dev/_mapfit.py -- does the playfield surface map the atlas correctly?

  python dev/_mapfit.py

Renders the bare surface top-down (dev/_map.js) and the atlas panel,
puts both in the same frame, and searches over shift + scale for the
alignment that best matches.  A non-zero answer means the art -> table
mapping is offset or scaled, which would make EVERY piece of hardware
look "not lined up" with the painting -- and a zero answer means the
mapping is fine and any mismatch is in the layout numbers.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

W, H = 25.94, 48.94

shot = Image.open("dev/shots/_map.png").convert("L")
atl = Image.open("dev/shots/_atlas_playfield.png").convert("L")

# both panels represent the whole playfield, so normalise to one size
GW, GH = 318, 584
S = np.asarray(shot.resize((GW, GH), Image.LANCZOS)).astype(np.float32)
A = np.asarray(atl.resize((GW, GH), Image.LANCZOS)).astype(np.float32)

# work on gradients: the render is shaded and colour-graded, so absolute
# brightness will not match, but edges land in the same place
Sg = ndimage.gaussian_gradient_magnitude(S, 1.4)
Ag = ndimage.gaussian_gradient_magnitude(A, 1.4)


def ncc(a, b):
    a = a - a.mean()
    b = b - b.mean()
    d = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / d) if d else 0.0


base = ncc(Sg, Ag)
print(f"aligned NCC = {base:.4f}")

best = (base, 0, 0)
for dy in range(-8, 9):
    for dx in range(-6, 7):
        b = np.roll(np.roll(Ag, dy, axis=0), dx, axis=1)
        v = ncc(Sg, b)
        if v > best[0]:
            best = (v, dx, dy)

print(f"best shift  dx={best[1]} px  dy={best[2]} px  NCC={best[0]:.4f}")
print(f"  -> art offset {best[1] / GW * 100:+.2f} art% in x, "
      f"{best[2] / GH * 100:+.2f} art% in y")
print(f"  -> world offset {best[1] / GW * W:+.3f} u in x, {best[2] / GH * H:+.3f} u in y")

# scale test: resample the atlas by a few percent and see if it fits better
print()
for k in (0.96, 0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03, 1.04):
    w2, h2 = int(GW * k), int(GH * k)
    Ar = np.asarray(atl.resize((w2, h2), Image.LANCZOS)).astype(np.float32)
    Ag2 = ndimage.gaussian_gradient_magnitude(Ar, 1.4)
    # centre-crop / pad back to GW x GH
    y0 = max(0, (h2 - GH) // 2)
    x0 = max(0, (w2 - GW) // 2)
    Ag2 = Ag2[y0:y0 + GH, x0:x0 + GW]
    if Ag2.shape != (GH, GW):
        pad = np.zeros((GH, GW), np.float32)
        pad[:Ag2.shape[0], :Ag2.shape[1]] = Ag2
        Ag2 = pad
    print(f"  atlas scale {k:.2f} -> NCC {ncc(Sg, Ag2):.4f}")
