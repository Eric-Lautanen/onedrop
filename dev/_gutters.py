"""Find the true content rect of a sheet panel: strip the grey gutter and the
green rule so the sprite can be used edge-to-edge with its own black outline.

A "gutter" pixel is one that is desaturated and mid-to-light grey (the sheet's
paper background / green rule), i.e. low saturation and not near-black.
"""
import sys
from PIL import Image
import numpy as np

im = Image.open('assets/sprite2.png').convert('RGB')
A = np.asarray(im).astype(np.int16)
print('sheet', im.size)


def classify(name, x0, y0, x1, y1):
    p = A[y0:y1, x0:x1]
    mx = p.max(axis=2).astype(np.float32)
    mn = p.min(axis=2).astype(np.float32)
    sat = (mx - mn) / np.maximum(mx, 1.0)          # 0 grey .. 1 saturated
    lum = p.mean(axis=2)
    # gutter / rule = washed out (high sat AND light)  OR  very light grey
    rule = (sat > 0.25) & (lum > 90)               # the green rule
    paper = (sat <= 0.25) & (lum > 55)             # grey paper
    content = ~(rule | paper)
    return p, sat, lum, content


def edges(name, x0, y0, x1, y1):
    p, sat, lum, content = classify(name, x0, y0, x1, y1)
    h, w = content.shape
    colfrac = content.mean(axis=0)
    rowfrac = content.mean(axis=1)
    # first / last column with >60% content, first / last row with >60%
    cols = np.where(colfrac > 0.60)[0]
    rows = np.where(rowfrac > 0.60)[0]
    print('\n== %s  sheet rect %d,%d %dx%d' % (name, x0, y0, w, h))
    print('   col profile head', np.round(colfrac[:14], 2))
    print('   col profile tail', np.round(colfrac[-14:], 2))
    print('   row profile head', np.round(rowfrac[:14], 2))
    print('   row profile tail', np.round(rowfrac[-14:], 2))
    if len(cols) and len(rows):
        cx0, cx1 = cols[0], cols[-1]
        ry0, ry1 = rows[0], rows[-1]
        print('   content cols %d..%d  (trim L %d  R %d)' % (cx0, cx1, cx0, w - 1 - cx1))
        print('   content rows %d..%d  (trim T %d  B %d)' % (ry0, ry1, ry0, h - 1 - ry1))
        print('   -> sheet rect %d,%d %dx%d' % (x0 + cx0, y0 + ry0, cx1 - cx0 + 1, ry1 - ry0 + 1))
        print('   -> frac  x %.5f y %.5f w %.5f h %.5f' % (
            (x0 + cx0) / 843, (y0 + ry0) / 1264,
            (cx1 - cx0 + 1) / 843, (ry1 - ry0 + 1) / 1264))
    # print a strip of the left edge colours to see the gutter
    print('   left-edge cols RGB (mid row):', [tuple(int(v) for v in A[(y0 + y1) // 2, x0 + i]) for i in range(12)])
    print('   right-edge cols RGB (mid row):', [tuple(int(v) for v in A[(y0 + y1) // 2, x1 - 12 + i]) for i in range(12)])


edges('frontArt', 12, 440, 356, 610)
edges('cabSide', 10, 26, 370, 428)
edges('cabSideWord', 100, 230, 344, 398)
