"""Binary map of faint structure inside a dark region."""
import sys
import numpy as np
from PIL import Image

im = Image.open("assets/3dref.jpg").convert("RGB")
A = np.asarray(im).astype(np.float32)
lum = A.mean(axis=2)

x0, y0, x1, y1 = (int(v) for v in sys.argv[1:5])
lo = float(sys.argv[5]) if len(sys.argv) > 5 else 22.0
hi = float(sys.argv[6]) if len(sys.argv) > 6 else 46.0

print("region x %d..%d  y %d..%d   band %.0f..%.0f" % (x0, x1, y0, y1, lo, hi))
print("     " + "".join(("%d" % ((x0 + i) // 10 % 10)) if (x0 + i) % 10 == 0 else " "
                       for i in range(0, x1 - x0)))
for y in range(y0, y1):
    s = ""
    for x in range(x0, x1):
        v = lum[y, x]
        if v < lo:
            s += " "
        elif v < lo + (hi - lo) * 0.35:
            s += "."
        elif v < lo + (hi - lo) * 0.7:
            s += "+"
        else:
            s += "#"
    print("%4d %s" % (y, s))
