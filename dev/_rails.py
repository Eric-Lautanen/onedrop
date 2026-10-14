"""dev/_rails.py -- measure where the painted rasta side rails actually
sit in the sprite, to test the art->table mapping.

  python dev/_rails.py

The rails are the most reliable landmark on the painting: two tall,
strongly saturated vertical strips near the left and right edges.  If
their measured x disagrees with table.js's X(7) / X(92), the mapping is
offset or scaled, which would make EVERY item look "not lined up" --
exactly the complaint.
"""
import json

import numpy as np
from PIL import Image

im = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
A = np.asarray(im).astype(np.float32)
H, W = A.shape[:2]

mx = A.max(axis=2)
mn = A.min(axis=2)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
lum = 0.299 * A[:, :, 0] + 0.587 * A[:, :, 1] + 0.114 * A[:, :, 2]

# look only at the middle band of the field, away from the top and the apron
band = slice(int(0.20 * H), int(0.80 * H))
col = (sat[band] * (lum[band] > 45)).mean(axis=0)

print("per-column mean saturated-ness, x in art-percent")
step = 1
for x in range(0, 100, step):
    px = int(x / 100 * W)
    bar = "#" * int(col[px] * 90)
    print(f"  x={x:3d}  {col[px]:.3f}  {bar}")

# peaks in the left and right thirds
left = np.argmax(col[:int(0.30 * W)])
right = np.argmax(col[int(0.70 * W):]) + int(0.70 * W)
print()
print(f"strongest left  strip: px {left}  -> art x {left / W * 100:.2f}")
print(f"strongest right strip: px {right} -> art x {right / W * 100:.2f}")

lay = json.load(open("dev/layout.json"))
rails = [s for s in lay["segments"] if s["kind"] in ("rail", "arch")]
xs = [p for s in rails for p in (s["a"][0], s["b"][0])]
print(f"layout rail x range: {min(xs):.1f} .. {max(xs):.1f}")
