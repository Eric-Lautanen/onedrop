"""dev/_vibe.py -- is the rendered playfield as vibrant as the sprite?

Compares the painted playfield as it lands on screen against the same
region of assets/sprite.png, in HSV. The screen crop is derived from the
shot camera's known framing (fov 40, distance chosen so the field fills
1.06 of the frame height), so no detection is needed.

  python dev/_vibe.py
"""
import colorsys
import numpy as np
from PIL import Image

SHOT = "dev/shots/v4_pf_top.png"
PURE = "dev/shots/v4_pf_pure.png"
BARE = "dev/shots/v4_pf_bare.png"
ATLAS = "dev/shots/_atlas_playfield.png"
VIEW_W, VIEW_H = 1400, 1000
FOV = 40.0
# must track PB.PF_SIZE in table.js -- the field fills the cabinet's
# inner opening, which machine.js currently makes 25.94 x 48.94
TABLE_W, TABLE_H = 25.94, 48.94


def hsv_stats(rgb):
    """mean saturation, mean value, and 95th-percentile saturation"""
    a = np.asarray(rgb.convert("RGB"), dtype=np.float32) / 255.0
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    return sat.mean(), mx.mean(), np.percentile(sat, 95)


def screen_rect():
    d = (TABLE_H * 1.06 / 2.0) / np.tan(np.radians(FOV / 2.0))
    cover_h = 2.0 * d * np.tan(np.radians(FOV / 2.0))
    cover_w = cover_h * (VIEW_W / VIEW_H)
    w = TABLE_W / cover_w * VIEW_W
    h = TABLE_H / cover_h * VIEW_H
    return (int(VIEW_W / 2 - w / 2), int(VIEW_H / 2 - h / 2),
            int(VIEW_W / 2 + w / 2), int(VIEW_H / 2 + h / 2))


def crop_centre(im, frac):
    w, h = im.size
    dx, dy = int(w * (1 - frac) / 2), int(h * (1 - frac) / 2)
    return im.crop((dx, dy, w - dx, h - dy))


shot = Image.open(SHOT)
pure = Image.open(PURE)
bare = Image.open(BARE)
x0, y0, x1, y1 = screen_rect()
shot.crop((x0, y0, x1, y1)).save("dev/shots/_vibe_screen_crop.png")

atlas = Image.open(ATLAS)

# every candidate is a FULL frame; the field rect is applied exactly once
RENDERS = (
    (pure, "art only (no hardware, no lacquer)"),
    (bare, "art + lacquer"),
    (shot, "full render (hardware on top)"),
)

for frac, label in ((1.0, "whole field"), (0.55, "centre 55%")):
    print(f"--- {label} ---")
    a_sat, a_val, _ = hsv_stats(crop_centre(atlas, frac))
    print(f"  sprite reference      sat={a_sat:.3f}  val={a_val:.3f}")
    for im, name in RENDERS:
        field = im.crop((x0, y0, x1, y1))
        s_sat, s_val, _ = hsv_stats(crop_centre(field, frac))
        print(f"  {name:<34} sat={s_sat:.3f}  val={s_val:.3f}"
              f"   x{s_sat/a_sat:.2f} sat  x{s_val/a_val:.2f} val")
    print()

# ---- where is any loss? horizontal thirds, art-only render ----
# The bottom third is partly covered by the cabinet's APRON, which sits
# over the front of the playfield exactly as it does on a real machine.
# That is geometry, not a colour problem, so it is called out rather
# than averaged into the headline number.
print("--- by band, art only (no hardware, no lacquer) ---")
ah = atlas.size[1]
fh = pure.crop((x0, y0, x1, y1)).size[1]
ref = atlas.resize((x1 - x0, fh), Image.LANCZOS)
field = pure.crop((x0, y0, x1, y1))
for i, name in enumerate(("top / far", "middle", "bottom / near (apron)")):
    r = ref.crop((0, i * fh // 3, x1 - x0, (i + 1) * fh // 3))
    f = field.crop((0, i * fh // 3, x1 - x0, (i + 1) * fh // 3))
    r_sat, r_val, _ = hsv_stats(r)
    f_sat, f_val, _ = hsv_stats(f)
    print(f"  {name:<26} sat={f_sat:.3f} vs {r_sat:.3f}"
          f"   x{f_sat/r_sat:.2f}    val x{f_val/r_val:.2f}")
print()

print(f"screen rect in the {VIEW_W}x{VIEW_H} shot: {x0},{y0} .. {x1},{y1}")
print("(sat = colourfulness 0..1, val = brightness 0..1; 1.00x means the "
      "render matches the sprite)")
