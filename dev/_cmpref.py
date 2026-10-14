"""Compare the live cabinet captures against the reference panels.

Both silhouettes are reduced to their largest connected blob (which drops the
panel's caption text and the faint ground reflections), normalised to the same
height, and then printed as a row-width profile plus an overlay.

  python dev/_cmpref.py front
  python dev/_cmpref.py side
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

MODE = sys.argv[1] if len(sys.argv) > 1 else 'front'
H = 900
REF = ('assets/3dref.jpg', (0, 0, 424, 632) if MODE == 'front' else (0, 632, 424, 1264))
# the reference's SIDE ELEVATION is drawn with the head on the LEFT, so it has
# to be compared against the left-flank capture -- 'side' (the right flank,
# head on the right) is its mirror and every row width reads back to front.
LIVE = 'dev/shots/_mach_%s.png' % ('left' if MODE == 'side' else MODE)


def biggest(m):
    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit('empty mask')
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def ref_mask():
    A = np.asarray(Image.open(REF[0]).convert('RGB')).astype(np.int16)
    x0, y0, x1, y1 = REF[1]
    P = A[y0:y1, x0:x1]
    mx = P.max(axis=2).astype(np.float32)
    mn = P.min(axis=2).astype(np.float32)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = P.mean(axis=2)
    m = (sat > 0.22) | (lum < 62)
    m = ndimage.binary_closing(m, np.ones((5, 5)))
    return biggest(m)


def live_mask():
    A = np.asarray(Image.open(LIVE).convert('RGB')).astype(np.int16)
    bg = A[2:6, 2:6].reshape(-1, 3).mean(axis=0).astype(np.int16)
    m = np.abs(A - bg).sum(axis=2) > 26
    m = ndimage.binary_closing(m, np.ones((5, 5)))
    return biggest(m)


def crop(m):
    ys, xs = np.where(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def fit(m, h, xs=1.0):
    im = Image.fromarray((m * 255).astype(np.uint8))
    w = max(1, round(im.width * xs * h / im.height))
    return np.asarray(im.resize((w, h), Image.NEAREST)) > 127


def profile(m, label):
    h, w = m.shape
    wid = np.array([(np.where(r)[0][-1] - np.where(r)[0][0] + 1) if r.any() else 0
                    for r in m])
    print('%-5s  box %dx%d  aspect %.4f' % (label, w, h, w / h))
    print('       y%%   ' + ' '.join('%6d' % round(y / h * 100) for y in
                                     np.linspace(0, h - 1, 14)))
    print('       w%%   ' + ' '.join('%6.1f' % (wid[int(y)] / w * 100) for y in
                                     np.linspace(0, h - 1, 14)))
    return wid / w


# The side elevation's HORIZONTALS are drawn compressed relative to its own
# verticals -- and those verticals match the front panel's exactly (the same
# 100 px front face appears in both), so the compression is measurable: the
# body is 336 px long where the front panel's own 0.1397 u/px would need
# ~1.08x that to span the 50.8 u cabinet. Without this the side comparison
# reports a phantom ~21% "too wide" on every row.
XS = 1.08 if MODE == 'side' else 1.0

a = fit(crop(ref_mask()), H, XS)
b = fit(crop(live_mask()), H)
wa = profile(a, 'REF')
wb = profile(b, 'LIVE')
print('       diff ' + ' '.join('%+6.1f' % ((wb[i] - wa[i]) * 100) for i in
                                np.linspace(0, H - 1, 14).astype(int)))

W = max(a.shape[1], b.shape[1]) + 20


def pad(m):
    out = np.zeros((H, W), bool)
    x = (W - m.shape[1]) // 2
    out[:, x:x + m.shape[1]] = m
    return out


a, b = pad(a), pad(b)
rgb = np.zeros((H, W, 3), np.uint8)
rgb[..., 0] = np.where(a & ~b, 235, np.where(a & b, 205, 0))
rgb[..., 1] = np.where(b & ~a, 235, np.where(a & b, 205, 0))
rgb[..., 2] = np.where(a & b, 70, 0)
Image.fromarray(rgb).save('dev/shots/_cmp_%s_overlay.png' % MODE)

side = Image.new('RGB', (W * 2 + 30, H), (20, 22, 26))
side.paste(Image.fromarray((a * 255).astype(np.uint8)).convert('RGB'), (10, 0))
side.paste(Image.fromarray((b * 255).astype(np.uint8)).convert('RGB'), (W + 20, 0))
side.save('dev/shots/_cmp_%s_masks.png' % MODE)
print('wrote dev/shots/_cmp_%s_overlay.png / _masks.png' % MODE)
