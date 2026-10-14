"""dev/_sheet2.py -- measure the panel boxes on the new sprite sheet.

The sheet frames each panel with a thin green rule on a grey gutter, so
the panels can be found by masking that green and taking connected
components. Prints each box in pixels and as sheet fractions, ready to
paste into assets.js REGIONS.

  python dev/_sheet2.py
"""
import numpy as np
from PIL import Image
from collections import deque

SRC = "assets/sprite2.png"
im = Image.open(SRC).convert("RGB")
W, H = im.size
a = np.asarray(im, dtype=np.int16)
print(f"sheet {W} x {H}  aspect {W/H:.4f}\n")

R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
# the frame rule: a mid/light green, clearly greener than it is red or blue
green = (G > R + 22) & (G > B + 22) & (G > 70)

print(f"green-rule pixels: {int(green.sum())}  ({100*green.mean():.2f}% of sheet)")

# --- collapse the mask to runs so we can find long straight rules ---
def long_runs(mask, axis, min_len):
    """rows (axis=1) or cols (axis=0) that contain a run of >= min_len"""
    hits = []
    n = mask.shape[1 - axis]
    for i in range(mask.shape[axis]):
        line = mask[i, :] if axis == 0 else mask[:, i]
        run = best = 0
        for v in line:
            run = run + 1 if v else 0
            if run > best:
                best = run
        if best >= min_len:
            hits.append((i, best))
    return hits

# horizontal rules: a row with a long horizontal green run
rows = long_runs(green, 0, W * 0.06)
cols = long_runs(green, 1, H * 0.04)

def group(hits, gap=4):
    out = []
    for i, ln in hits:
        if out and i - out[-1][-1][0] <= gap:
            out[-1].append((i, ln))
        else:
            out.append([(i, ln)])
    return [max(g, key=lambda t: t[1])[0] for g in out]

print(f"\nhorizontal rule rows ({len(rows)} raw):")
print("  ", group(rows))
print(f"vertical rule cols ({len(cols)} raw):")
print("  ", group(cols))

# --- connected components of the green mask, to get panel rectangles ---
# dilate a touch so a 1px dashed rule still connects
m = green.copy()
for _ in range(2):
    m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)

seen = np.zeros_like(m, dtype=bool)
boxes = []
ys, xs = np.nonzero(m)
step = 1
for y0, x0 in zip(ys[::step], xs[::step]):
    if seen[y0, x0]:
        continue
    q = deque([(y0, x0)])
    seen[y0, x0] = True
    minx = maxx = x0
    miny = maxy = y0
    n = 0
    while q:
        y, x = q.popleft()
        n += 1
        if x < minx: minx = x
        if x > maxx: maxx = x
        if y < miny: miny = y
        if y > maxy: maxy = y
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True
                q.append((yy, xx))
    if n > 900:
        boxes.append((minx, miny, maxx - minx + 1, maxy - miny + 1, n))

boxes.sort(key=lambda b: (b[1] // 40, b[0]))
print(f"\n{len(boxes)} panel boxes (x, y, w, h, px), fractions to 5dp:")
for x, y, w, h, n in boxes:
    print(f"  px {x:4d},{y:4d} {w:4d}x{h:4d}   "
          f"frac {{ x: {x/W:.5f}, y: {y/H:.5f}, w: {w/W:.5f}, h: {h/H:.5f} }}"
          f"   aspect {w/h:.3f}")
