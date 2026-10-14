"""Reference FRONT panel vs the live orthographic front capture.

Both silhouettes are normalised to the same height so the proportions can be
compared directly. Prints the key ratios either side of the image.
"""
import numpy as np
from PIL import Image

REF_BOX = (101, 51, 324, 612)          # full machine in the FRONT panel
OUTH = 760

ref = Image.open("assets/3dref.jpg").convert("RGB").crop(REF_BOX)

live = Image.open("dev/shots/_mach_front.png").convert("RGB")
A = np.asarray(live).astype(int)
bg = A[2, 2]
d = np.abs(A - bg).sum(axis=2)
mask = d > 22
ys, xs = np.where(mask)
lb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
print("live silhouette bbox x %d..%d (%d)  y %d..%d (%d)  aspect %.4f"
      % (lb[0], lb[2] - 1, lb[2] - lb[0], lb[1], lb[3] - 1, lb[3] - lb[1],
         (lb[2] - lb[0]) / (lb[3] - lb[1])))
live = live.crop(lb)

ref = ref.resize((round(ref.width * OUTH / ref.height), OUTH), Image.LANCZOS)
live = live.resize((round(live.width * OUTH / live.height), OUTH), Image.LANCZOS)

print("ref  %dx%d  aspect %.4f" % (ref.width, ref.height, ref.width / ref.height))
print("live %dx%d  aspect %.4f" % (live.width, live.height, live.width / live.height))

gap = 20
out = Image.new("RGB", (ref.width + live.width + gap * 3, OUTH + gap * 2), (30, 32, 36))
out.paste(ref, (gap, gap))
out.paste(live, (gap * 2 + ref.width, gap))
out.save("dev/shots/_cmp_front.png")
print("wrote dev/shots/_cmp_front.png")
