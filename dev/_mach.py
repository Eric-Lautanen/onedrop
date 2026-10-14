from PIL import Image
im = Image.open('assets/machine.png').convert('RGB')
W,H = im.size
print('machine', W, H)
# playfield area in the machine render: roughly x 0.10-0.95, y 0.28-0.72
c = im.crop((int(W*0.06), int(H*0.26), int(W*0.98), int(H*0.74)))
c = c.resize((int(c.width*1.6), int(c.height*1.6)), Image.LANCZOS)
c.save('dev/crops/mach_pf.png'); print(c.size)
