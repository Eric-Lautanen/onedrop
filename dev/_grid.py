from PIL import Image, ImageDraw, ImageFont
im = Image.open('assets/sprite.png').convert('RGB')
pf = im.crop((158, 356, 622, 1187))   # 464 x 831
S = 2.0
big = pf.resize((int(pf.width*S), int(pf.height*S)), Image.LANCZOS)
d = ImageDraw.Draw(big)
try:
    f = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 20)
except Exception:
    f = ImageFont.load_default()
# grid every 5% of width/height
for i in range(1,20):
    x = pf.width*S*i/20.0
    y = pf.height*S*i/20.0
    d.line([(x,0),(x,big.height)], fill=(0,255,255), width=1)
    d.line([(0,y),(big.width,y)], fill=(0,255,255), width=1)
    d.text((x+2,4), str(i*5), fill=(0,255,255), font=f)
    d.text((4,y+2), str(i*5), fill=(255,120,0), font=f)
big.save('dev/crops/grid.png')
print(big.size)
