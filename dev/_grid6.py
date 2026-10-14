from PIL import Image, ImageDraw, ImageFont
im = Image.open('assets/sprite.png').convert('RGB')
PF = (157, 364, 610, 1181)
pf = im.crop(PF); PW, PH = pf.size
try: f = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 24)
except Exception: f = ImageFont.load_default()
def crop(name, x0f,y0f,x1f,y1f, S=4.0, step=5):
    c = pf.crop((int(PW*x0f), int(PH*y0f), int(PW*x1f), int(PH*y1f)))
    big = c.resize((int(c.width*S), int(c.height*S)), Image.LANCZOS)
    d = ImageDraw.Draw(big); xr=(x1f-x0f)*100; yr=(y1f-y0f)*100
    n=int(xr//step)
    for i in range(1,n):
        x=big.width*i/float(n); d.line([(x,0),(x,big.height)],fill=(0,255,255),width=1)
        d.text((x+2,3),str(round(x0f*100+i*step)),fill=(0,255,255),font=f)
    n2=int(yr//step)
    for j in range(1,n2):
        y=big.height*j/float(n2); d.line([(0,y),(big.width,y)],fill=(255,140,0),width=1)
        d.text((3,y+2),str(round(y0f*100+j*step)),fill=(255,160,0),font=f)
    big.save('dev/crops/q_%s.png'%name); print(name, big.size)
crop('bump', 0.20,0.14,0.80,0.46, 3.2, step=5)
crop('edgeL',0.00,0.00,0.20,0.55, 4.0, step=5)
