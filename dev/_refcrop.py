"""Crop + magnify regions of assets/3dref.jpg for eyeball verification.

usage: _refcrop.py x0 y0 x1 y1 out.png [scale]
coords are SHEET coordinates (843x1264).
"""
import sys
from PIL import Image

SRC = "assets/3dref.jpg"
x0, y0, x1, y1 = (int(v) for v in sys.argv[1:5])
out = sys.argv[5]
scale = int(sys.argv[6]) if len(sys.argv) > 6 else 3

im = Image.open(SRC).convert("RGB")
c = im.crop((x0, y0, x1, y1))
c = c.resize((c.width * scale, c.height * scale), Image.NEAREST)
c.save(out)
print("%s  %dx%d -> %dx%d" % (out, x1 - x0, y1 - y0, c.width, c.height))
