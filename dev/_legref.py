"""Profile the reference's legs (front ortho, sheet region x 0..424, y 0..632).

Prints a per-row run profile of dark (leg) pixels, so the foot under each leg
and the width of each flange can be read off numerically without a viewer.
"""
from PIL import Image

im = Image.open('assets/3dref.jpg').convert('RGB')
px = im.load()

X0, X1 = 0, 424
print('row profile: dark runs (lum < 45) every 3 px, y 440..632')
for y in range(440, 632, 3):
    runs = []
    s = None
    p = None
    for x in range(X0, X1):
        r, g, b = px[x, y]
        v = (r + g + b) / 3.0
        dark = v < 45
        if dark and s is None:
            s = x; p = x
        elif dark and x <= p + 2:
            p = x
        elif not dark and s is not None:
            if p - s >= 2:
                runs.append((s, p, p - s + 1))
            s = None
    if s is not None and p - s >= 2:
        runs.append((s, p, p - s + 1))
    print('y=%4d  %s' % (y, '  '.join('[%d-%d w%d]' % t for t in runs)))
