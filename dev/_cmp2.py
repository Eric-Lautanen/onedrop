"""dev/_cmp2.py -- SPRITE | BLEND | RENDER at identical framing, with an
art-percent grid, from the straight-down orthographic captures written
by dev/_top.js.

  python dev/_cmp2.py [name]

The ortho camera fits a square window of world size max(wWorld,hWorld)
centred on the region, so the art-percent span each capture covers is
knowable exactly and the sprite crop lines up pixel for pixel.  The
BLEND panel is the strongest test: if a bumper sits on its painted
circle the two images coincide and the ring goes crisp.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

W = 25.94          # playfield width, world
H = 48.94          # playfield height, world

LAYOUT = json.load(open("dev/layout.json"))

REGIONS = {
    "_top_bumpers.png": (33, 21, 63, 45),
    "_top_shack.png":   (39, 7, 61, 27),
    "_top_lower.png":   (18, 72, 82, 100),
    "_top_upper.png":   (4, 0, 96, 30),
    "_top_full.png":    (0, 0, 100, 100),
}

atlas = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
AW, AH = atlas.size
Z = int(os.environ.get("Z", "2"))
GRID = 5           # art-percent between grid lines
SPRITE_ONLY = bool(os.environ.get("SPRITE_ONLY"))


def art_window(x0, y0, x1, y1):
    wWorld = abs(x1 - x0) / 100 * W
    hWorld = abs(y1 - y0) / 100 * H
    span = max(wWorld, hWorld)
    xSpan = span / W * 100
    ySpan = span / H * 100
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return cx - xSpan / 2, cy - ySpan / 2, cx + xSpan / 2, cy + ySpan / 2


def crop_art(win, size):
    x0, y0, x1, y1 = win
    b = atlas.crop((int(x0 / 100 * AW), int(y0 / 100 * AH),
                    int(x1 / 100 * AW), int(y1 / 100 * AH)))
    return b.resize(size, Image.LANCZOS)


def draw_layout(im, win):
    """paint the live layout over the panel, in the same art-percent frame.

    A layout circle is stored as [artX, artY, r] where r is a percentage
    of the playfield WIDTH, so it converts to a true world radius first --
    the two art axes have different world scales.
    """
    x0, y0, x1, y1 = win
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    spanW = (x1 - x0) / 100 * W          # world width the panel covers
    px = im.width / spanW                # pixels per world unit

    def P(ax, ay):
        return ((ax - x0) / (x1 - x0) * im.width,
                (ay - y0) / (y1 - y0) * im.height)

    def R(ra):
        return ra / 100 * W * px

    for s in LAYOUT["segments"]:
        col = (0, 200, 255, 190) if s["kind"] in ("rail", "arch") else (120, 120, 255, 140)
        d.line([P(*s["a"]), P(*s["b"])], fill=col, width=2)

    for g in LAYOUT["targets"]:
        d.line([P(*g["a"]), P(*g["b"])], fill=(255, 140, 0, 255), width=4)

    for l in LAYOUT["lamps"]:
        cx, cy = P(*l["c"])
        r = max(3, R(l["r"]))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 0, 200, 220), width=2)

    for c in LAYOUT["circles"]:
        cx, cy = P(*c["c"])
        r = R(c["r"])
        col = {"bumper": (0, 255, 90, 255), "toy": (255, 220, 0, 255),
               "post": (255, 255, 255, 255)}.get(c.get("type"), (0, 255, 90, 255))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=3)
        d.line([(cx - 7, cy), (cx + 7, cy)], fill=col, width=2)
        d.line([(cx, cy - 7), (cx, cy + 7)], fill=col, width=2)
        if c.get("label"):
            d.text((cx + r + 2, cy - 5), c["label"], fill=col)

    return Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")


def grid(im, win):
    x0, y0, x1, y1 = win
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    px = im.width / (x1 - x0)
    py = im.height / (y1 - y0)
    gx = int(x0 // GRID * GRID)
    while gx <= x1:
        if gx >= x0:
            X = (gx - x0) * px
            d.line([(X, 0), (X, im.height)], fill=(0, 255, 255, 90), width=1)
            d.text((X + 2, 2), str(gx), fill=(0, 255, 255, 230))
        gx += GRID
    gy = int(y0 // GRID * GRID)
    while gy <= y1:
        if gy >= y0:
            Y = (gy - y0) * py
            d.line([(0, Y), (im.width, Y)], fill=(0, 255, 255, 90), width=1)
            d.text((2, Y + 2), str(gy), fill=(0, 255, 255, 230))
        gy += GRID
    return Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")


want = sys.argv[1] if len(sys.argv) > 1 else None

for name, box in REGIONS.items():
    if want and want not in name:
        continue
    p = os.path.join("dev/shots", name)
    if not os.path.exists(p):
        print("missing", p, "- run: node dev/_top.js")
        continue

    shot = Image.open(p).convert("RGB")
    win = art_window(*box)
    if SPRITE_ONLY:
        size = (shot.width * 2, shot.height * 2)
        a = draw_layout(crop_art(win, size), win)
        out = "dev/shots/_spr_" + name.replace("_top_", "")
        grid(a, win).save(out)
        print("wrote", out, a.size, "art %.1f,%.1f..%.1f,%.1f" % win)
        continue
    size = (shot.width // Z, shot.height // Z)

    a = crop_art(win, size)
    s = shot.resize(size, Image.LANCZOS)
    blend = Image.blend(a, s, 0.5)

    a = draw_layout(a, win)
    s = draw_layout(s, win)
    blend = grid(blend, win)

    a = grid(a, win)
    s = grid(s, win)

    sheet = Image.new("RGB", (size[0] * 3 + 24, size[1]), (18, 18, 18))
    for i, (im, lab, col) in enumerate(((a, "SPRITE + LAYOUT", (0, 255, 255)),
                                        (blend, "BLEND 50/50", (255, 255, 0)),
                                        (s, "RENDER + LAYOUT", (255, 90, 90)))):
        x = i * (size[0] + 12)
        sheet.paste(im, (x, 0))
        ImageDraw.Draw(sheet).text((x + 6, size[1] - 14), lab, fill=col)

    out = "dev/shots/_cmp_" + name.replace("_top_", "")
    sheet.save(out)
    print("wrote", out, sheet.size,
          "art %.1f,%.1f..%.1f,%.1f" % win)
