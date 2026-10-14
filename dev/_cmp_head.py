"""Build a reference-vs-live comparison strip for the backbox face.

Reference: FRONT panel of assets/3dref.jpg, sheet x 101..323, y 51..252.
Live:      dev/shots/_head.png, orthographic head-on capture.
Both are scaled to a common width so the proportions can be compared.
"""
import numpy as np
from PIL import Image

REF = (101, 51, 324, 253)
OUTW = 560

ref = Image.open("assets/3dref.jpg").convert("RGB").crop(REF)
ref = ref.resize((OUTW, round(ref.height * OUTW / ref.width)), Image.LANCZOS)

live = Image.open("dev/shots/_head.png").convert("RGB")
A = np.asarray(live).astype(int)
# background is the flat grey set by the capture (0x6a6e74, tone-mapped)
bg = np.array([58, 61, 66])
d = np.abs(A - bg).sum(axis=2)
mask = d > 24
ys, xs = np.where(mask)
print("live silhouette bbox x %d..%d (%d)  y %d..%d (%d)  aspect %.4f"
      % (xs.min(), xs.max(), xs.max() - xs.min() + 1,
         ys.min(), ys.max(), ys.max() - ys.min() + 1,
         (xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1)))
live = live.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
live = live.resize((OUTW, round(live.height * OUTW / live.width)), Image.LANCZOS)

gap = 16
H = ref.height + live.height + gap * 3
out = Image.new("RGB", (OUTW + gap * 2, H), (32, 34, 38))
out.paste(ref, (gap, gap))
out.paste(live, (gap, gap * 2 + ref.height))
out.save("dev/shots/_cmp_head.png")
print("ref  %dx%d  live %dx%d" % (ref.width, ref.height, live.width, live.height))
print("ref aspect  %.4f" % (ref.width / ref.height))
print("live aspect %.4f" % (live.width / live.height))
print("wrote dev/shots/_cmp_head.png")
