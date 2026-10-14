"""dev/_overlay.py -- draw the live playfield layout onto the sprite.

  python dev/_overlay.py

The layout is authored in art percent (x 0..100 across the painting,
y 0 at the arch and 100 at the drain), so it can be drawn straight onto
the playfield region of the sprite. This is how you check that the
hardware actually sits on the features the painting draws.
"""
import json
from PIL import Image, ImageDraw

ATLAS = "dev/shots/_atlas_playfield.png"
OUT = "dev/shots/_layout_overlay.png"

d = json.load(open("dev/layout.json"))
im = Image.open(ATLAS).convert("RGB")
W, H = im.size
S = 2                                   # supersample, then downscale
im = im.resize((W * S, H * S), Image.LANCZOS)
dr = ImageDraw.Draw(im, "RGBA")


def P(p):
    return (p[0] / 100.0 * W * S, p[1] / 100.0 * H * S)


def R(r):
    return r / 100.0 * W * S


# ---- walls / rails -------------------------------------------------
for s in d["segments"]:
    kind = s.get("kind")
    col = {"rail": (0, 200, 255, 220), "arch": (255, 0, 255, 220),
           "floor": (255, 255, 0, 200)}.get(kind, (0, 200, 255, 220))
    dr.line([P(s["a"]), P(s["b"])], fill=col, width=3)

# ---- targets -------------------------------------------------------
for g in d["targets"]:
    col = (255, 140, 0, 235) if g.get("drop") else (255, 60, 60, 235)
    dr.line([P(g["a"]), P(g["b"])], fill=col, width=6)

# ---- circles: bumpers, the shack, posts ----------------------------
for c in d["circles"]:
    x, y = P(c["c"]); r = R(c["r"])
    col = {"bumper": (0, 255, 90, 235), "toy": (255, 220, 0, 235),
           "post": (255, 255, 255, 235)}.get(c.get("type"), (0, 255, 90, 235))
    dr.ellipse([x - r, y - r, x + r, y + r], outline=col, width=4)

# ---- lamps ---------------------------------------------------------
for l in d["lamps"]:
    x, y = P(l["c"]); r = max(3, R(l["r"]))
    col = (255, 0, 140, 230) if l.get("big") else (255, 255, 255, 210)
    dr.ellipse([x - r, y - r, x + r, y + r], outline=col, width=3)

im = im.resize((W, H), Image.LANCZOS)
im.save(OUT)

# report where each thing lands, for the eye to check
print(f"wrote {OUT}  ({W}x{H})")
print(f"{'what':<22}{'x%':>8}{'y%':>8}")
for c in d["circles"]:
    print(f"{'circle ' + str(c.get('label') or c.get('type')):<22}"
          f"{c['c'][0]:>8.1f}{c['c'][1]:>8.1f}")
for g in d["targets"]:
    print(f"{'target ' + str(g.get('label')):<22}"
          f"{g['a'][0]:>8.1f}{g['a'][1]:>8.1f}")
print(f"lamps: x {min(l['c'][0] for l in d['lamps']):.1f}"
      f"..{max(l['c'][0] for l in d['lamps']):.1f}"
      f"   y {min(l['c'][1] for l in d['lamps']):.1f}"
      f"..{max(l['c'][1] for l in d['lamps']):.1f}")
