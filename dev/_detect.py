from PIL import Image, ImageDraw
import numpy as np, math, json
im = Image.open('assets/sprite.png').convert('RGB')
PF = (157, 364, 610, 1181)
pf = im.crop(PF); PW, PH = pf.size
a = np.asarray(pf).astype(np.float32)
r,g,b = a[:,:,0], a[:,:,1], a[:,:,2]
mx = a.max(axis=2); mn = a.min(axis=2)
sat = (mx-mn)
# "hot" pixels: bright AND colourful (the lamp lenses + starbursts)
hot = (mx > 165) & (sat > 60)
# also catch white starburst cores
core = (mn > 205)
mask = hot | core
# connected components (4-neighbour, iterative)
lab = np.zeros((PH,PW), np.int32); cur = 0
from collections import deque
comps = []
seen = np.zeros((PH,PW), bool)
ys, xs = np.where(mask)
for y0,x0 in zip(ys,xs):
    if seen[y0,x0]: continue
    cur += 1
    q = deque([(y0,x0)]); seen[y0,x0]=True; pts=[]
    while q:
        y,x = q.popleft(); pts.append((y,x))
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx = y+dy,x+dx
            if 0<=ny<PH and 0<=nx<PW and mask[ny,nx] and not seen[ny,nx]:
                seen[ny,nx]=True; q.append((ny,nx))
    if len(pts) < 90: continue
    arr = np.array(pts)
    cy, cx = arr[:,0].mean(), arr[:,1].mean()
    h = arr[:,0].max()-arr[:,0].min()+1; w = arr[:,1].max()-arr[:,1].min()+1
    area = len(pts)
    fill = area/float(w*h)
    ar = w/float(h)
    if not (0.55 < ar < 1.8): continue
    if fill < 0.42: continue
    if not (14 <= w <= 64): continue
    col = a[arr[:,0], arr[:,1]].mean(axis=0)
    comps.append(dict(cx=float(cx), cy=float(cy), w=int(w), h=int(h), area=int(area),
                      fill=round(fill,2), col=[int(c) for c in col]))
# merge overlapping
comps.sort(key=lambda c:-c['area'])
keep=[]
for c in comps:
    if all(math.hypot(c['cx']-k['cx'], c['cy']-k['cy']) > 0.62*max(c['w'],k['w']) for k in keep):
        keep.append(c)
keep.sort(key=lambda c:(c['cy'],c['cx']))
print('detected', len(keep), 'inserts of', PW, PH)
vis = pf.copy(); d = ImageDraw.Draw(vis)
for c in keep:
    d.ellipse([c['cx']-c['w']/2, c['cy']-c['h']/2, c['cx']+c['w']/2, c['cy']+c['h']/2], outline=(0,255,255), width=2)
    d.text((c['cx']-6, c['cy']-6), '', fill=(255,255,0))
vis.resize((int(PW*1.7), int(PH*1.7)), Image.LANCZOS).save('dev/crops/detect.png')
json.dump(keep, open('dev/inserts.json','w'), indent=0)
# print as percentage coords
print('x%  y%   size  colour')
for c in keep:
    print('%5.1f %5.1f  %3d  #%02x%02x%02x' % (c['cx']/PW*100, c['cy']/PH*100, c['w'], c['col'][0], c['col'][1], c['col'][2]))
