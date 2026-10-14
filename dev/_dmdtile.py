from PIL import Image, ImageDraw
names = ["attract_0_logo","attract_1_marquee","attract_2_howto","attract_3_tiki",
         "attract_4_high","attract_5_irie","ready","play","multiball","wizard",
         "bonus","gameover","gameover_high","tilt"]
ims = [(n, Image.open(f"dev/shots/dmd_{n}.png").convert("RGB")) for n in names]
w = max(i.width for _, i in ims); gap = 6
h = sum(i.height for _, i in ims) + gap*(len(ims)-1)
sheet = Image.new("RGB", (w, h), (25,25,25))
d = ImageDraw.Draw(sheet)
y = 0
for n, i in ims:
    sheet.paste(i, (0, y))
    d.rectangle([0, y, w-1, y+i.height-1], outline=(60,60,60))
    y += i.height + gap
sheet.save("dev/shots/_dmd_all.png")
print("tiled", sheet.size, len(ims))
