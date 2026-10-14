"""ASCII luminance map of a sheet region, to locate circular features."""
import sys
import numpy as np
from PIL import Image

im = Image.open("assets/3dref.jpg").convert("RGB")
A = np.asarray(im).astype(np.float32)
lum = A.mean(axis=2)

x0, y0, x1, y1 = (int(v) for v in sys.argv[1:5])
step = int(sys.argv[5]) if len(sys.argv) > 5 else 2
ramp = " .:-=+*#%@"

seg = lum[y0:y1, x0:x1]
# column header every 10 sheet px
hdr = "     " + "".join(("%d" % ((x0 + i) // 10 % 10)) if (x0 + i) % 10 == 0 else " "
                       for i in range(0, x1 - x0, step))
print(hdr)
for j in range(0, y1 - y0, step):
    row = seg[j:j + step]
    s = ""
    for i in range(0, x1 - x0, step):
        blk = row[:, i:i + step]
        v = blk.mean()
        s += ramp[min(9, max(0, int(v / 25.6)))]
    print("%4d %s" % (y0 + j, s))
