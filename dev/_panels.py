"""Map the sprite sheet's panel layout: the grey (80,80,80) paper + green rules
are background; everything else is a panel. Report the panel rectangles."""
import numpy as np
from PIL import Image
from scipy import ndimage

A = np.asarray(Image.open('assets/sprite2.png').convert('RGB')).astype(np.int16)
H, W = A.shape[:2]
mx = A.max(axis=2).astype(np.float32)
mn = A.min(axis=2).astype(np.float32)
sat = (mx - mn) / np.maximum(mx, 1.0)
lum = A.mean(axis=2)

# the paper is a flat mid grey with a tiny colour cast; sample it
paper = (sat < 0.16) & (lum > 55) & (lum < 130)
print('paper fraction %.3f' % paper.mean())
# the green rule separating panels
rule = (sat > 0.22) & (lum > 85) & (A[:, :, 1] > A[:, :, 0]) & (A[:, :, 1] > A[:, :, 2])
print('rule fraction %.3f' % rule.mean())
bg = paper | rule

# close small holes so text/art inside a panel doesn't split it
content = ~bg
content[:6, :] = False; content[-6:, :] = False
content[:, :6] = False; content[:, -6:] = False
content = ndimage.binary_closing(content, structure=np.ones((5, 5)))
content = ndimage.binary_opening(content, structure=np.ones((3, 3)))

lab, n = ndimage.label(content)
print('components', n)
objs = ndimage.find_objects(lab)
items = []
for i, sl in enumerate(objs, 1):
    if sl is None:
        continue
    ys, xs = sl
    h = ys.stop - ys.start
    w = xs.stop - xs.start
    area = int((lab[sl] == i).sum())
    if area < 400:
        continue
    fill = area / float(w * h)
    items.append((area, xs.start, ys.start, w, h, fill))
items.sort(key=lambda t: (t[2], t[1]))
print('\narea   x    y    w    h    fill')
for a, x, y, w, h, f in items:
    if x > 430:
        continue
    print('%6d %4d %4d %4d %4d  %.2f   %s' % (a, x, y, w, h, f,
          'PORTRAIT' if h > w * 1.2 else ('landscape' if w > h * 1.2 else 'squareish')))
