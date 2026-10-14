from PIL import Image
im = Image.open('assets/sprite.png').convert('RGB')
W,H = im.size
pf = im.crop((158, 356, 622, 1187))   # 464 x 831
def crop(name, x0f,y0f,x1f,y1f, z=3.0):
    c = pf.crop((int(464*x0f), int(831*y0f), int(464*x1f), int(831*y1f)))
    c = c.resize((int(c.width*z), int(c.height*z)), Image.LANCZOS)
    c.save('dev/crops/z_%s.png'%name); print(name, c.size)
crop('hut',      0.28,0.00,0.78,0.22, 3.4)   # top shack
crop('bumpers',  0.18,0.14,0.88,0.42, 3.0)   # bumper cluster
crop('leftmid',  0.00,0.18,0.34,0.62, 3.0)   # left vertical text + inserts
crop('rightmid', 0.62,0.18,1.00,0.62, 3.0)   # right vertical text + inserts
crop('lionzone', 0.22,0.40,0.80,0.68, 3.0)   # ONEDROP wordmark + lion
crop('flippers', 0.00,0.62,1.00,1.00, 2.6)   # bottom
