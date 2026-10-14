from PIL import Image
im = Image.open('assets/sprite.png').convert('RGB')
W,H = im.size
print('sheet', W, H)
# playfield region per assets.js
r = dict(x=0.155, y=0.232, w=0.453, h=0.541)
box = (int(r['x']*W), int(r['y']*H), int((r['x']+r['w'])*W), int((r['y']+r['h'])*H))
print('pf box', box, 'size', box[2]-box[0], box[3]-box[1])
pf = im.crop(box)
pf.save('dev/crops/playfield_full.png')
# upscale whole thing 1.4x for reading
big = pf.resize((int(pf.width*1.4), int(pf.height*1.4)), Image.LANCZOS)
big.save('dev/crops/playfield_1p4x.png')
# thirds upscaled 2.2x
for name,(y0f,y1f) in {'top':(0.0,0.36),'mid':(0.32,0.70),'bot':(0.64,1.0)}.items():
    c = pf.crop((0, int(pf.height*y0f), pf.width, int(pf.height*y1f)))
    c = c.resize((int(c.width*2.2), int(c.height*2.2)), Image.LANCZOS)
    c.save('dev/crops/pf_%s.png' % name)
    print(name, c.size)
