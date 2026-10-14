"""Reference panel next to the live capture, both scaled to the same height,
so the cabinet can be judged against the drawing by eye rather than by
numbers.

  python dev/_sidebyside.py front
  python dev/_sidebyside.py side
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

MODE = sys.argv[1] if len(sys.argv) > 1 else 'front'
H = 1000
REFBOX = (0, 0, 424, 632) if MODE == 'front' else (0, 632, 424, 1264)
LIVE = 'dev/shots/_mach_%s.png' % ('left' if MODE == 'side' else MODE)


def biggest(m):
    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit('empty mask')
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


A = np.asarray(Image.open('assets/3dref.jpg').convert('RGB'))
x0, y0, x1, y1 = REFBOX
P = A[y0:y1, x0:x1].astype(np.int16)
mx = P.max(axis=2).astype(np.float32)
mn = P.min(axis=2).astype(np.float32)
sat = (mx - mn) / np.maximum(mx, 1.0)
m = (sat > 0.22) | (P.mean(axis=2) < 62)
m = biggest(ndimage.binary_closing(m, np.ones((5, 5))))
ys, xs = np.where(m)
ref = Image.fromarray(A[y0 + ys.min():y0 + ys.max() + 1,
                        x0 + xs.min():x0 + xs.max() + 1])

L = np.asarray(Image.open(LIVE).convert('RGB')).astype(np.int16)
bg = L[2:6, 2:6].reshape(-1, 3).mean(axis=0).astype(np.int16)
lm = biggest(ndimage.binary_closing(
    np.abs(L - bg).sum(axis=2) > 26, np.ones((5, 5))))
ys, xs = np.where(lm)
live = Image.fromarray(np.asarray(Image.open(LIVE).convert('RGB'))[
    ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def scale(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


r, l = scale(ref, H), scale(live, H)
W = r.width + l.width + 40
out = Image.new('RGB', (W, H + 40), (18, 20, 24))
out.paste(r, (10, 30))
out.paste(l, (r.width + 30, 30))
out.save('dev/shots/_sbs_%s.png' % MODE)
print('ref %dx%d  live %dx%d -> dev/shots/_sbs_%s.png'
      % (r.width, r.height, l.width, l.height, MODE))
