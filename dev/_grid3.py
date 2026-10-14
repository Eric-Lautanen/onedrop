from PIL import Image, ImageDraw, ImageFont
im = Image.open('assets/sprite.png').convert('RGB')
PF = (157, 364, 610, 1181)   # measured content rect  453 x 817
pf = im.crop(PF); PW, PH = pf.size
print('playfield px', PW, PH, 'aspect %.4f'%(PW/PH))
try: f = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 20)
except Exception: f = ImageFont.load_default()
def band(name, y0f, y1f, S=3.0, step=5):
    c = pf.crop((0, int(PH*y0f), PW, int(PH*y1f)))
    big = c.resize((int(c.width*S), int(c.height*S)), Image.LANCZOS)
    d = ImageDraw.Draw(big)
    n = 100//step
    for i in range(1, n):
        x = big.width*i/float(n)
        d.line([(x,0),(x,big.height)], fill=(0,255,255), width=1)
        d.text((x+2,3), str(i*step), fill=(0,255,255), font=f)
    for j in range(1, n):
        y = big.height*j/float(n)
        d.line([(0,y),(big.width,y)], fill=(255,140,0), width=1)
        d.text((3,y+2), str(round((y0f*100)+(y1f-y0f)*100*j/float(n))), fill=(255,160,0), font=f)
    big.save('dev/crops/g_%s.png'%name); print(name, big.size)
band('lmid', 0.48, 0.76, 3.0)
band('bot',  0.72, 1.00, 3.0)
