"""Side-by-side: the sprite region vs the same region of the render."""
from PIL import Image, ImageDraw

# field rect in v4_pf_top.png (from dev/_rect.js: 450,28 .. 950,972)
FX0, FY0, FX1, FY1 = 450, 28, 950, 972
atlas = Image.open("dev/shots/_atlas_playfield.png").convert("RGB")
shot  = Image.open("dev/shots/v4_pf_top.png").convert("RGB")

def crop_art(x0, y0, x1, y1, z):
    a = atlas.crop((int(x0/100*atlas.width), int(y0/100*atlas.height),
                    int(x1/100*atlas.width), int(y1/100*atlas.height)))
    return a.resize((a.width*z, a.height*z), Image.LANCZOS)

def crop_shot(x0, y0, x1, y1, z):
    w, h = FX1-FX0, FY1-FY0
    b = shot.crop((int(FX0 + x0/100*w), int(FY0 + y0/100*h),
                   int(FX0 + x1/100*w), int(FY0 + y1/100*h)))
    return b.resize((b.width*z, b.height*z), Image.LANCZOS)

for tag, box in (("bumpers", (26, 16, 74, 48)), ("lower", (26, 44, 74, 78))):
    a = crop_art(*box, 4)
    s = crop_shot(*box, 4)
    s = s.resize(a.size, Image.LANCZOS)
    sheet = Image.new("RGB", (a.width*2 + 14, a.height), (20,20,20))
    sheet.paste(a, (0,0)); sheet.paste(s, (a.width+14, 0))
    d = ImageDraw.Draw(sheet)
    d.text((6,6), "SPRITE", fill=(0,255,255))
    d.text((a.width+20,6), "RENDER", fill=(255,80,80))
    sheet.save(f"dev/shots/_cmp_{tag}.png")
    print(tag, sheet.size)
