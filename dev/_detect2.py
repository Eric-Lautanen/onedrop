from PIL import Image, ImageDraw
import numpy as np, math, json
from collections import deque
im = Image.open('assets/sprite.png').convert('RGB')
PF = (157, 364, 610, 1181)
pf = im.crop(PF); PW, PH = pf.size
a = np.asarray(pf).astype(np.float32)
R,G,B = a[:,:,0], a[:,:,1], a[:,:,2]
mx = a.max(axis=2); mn = a.min(axis=2); sat = mx-mn
# colour classes: the lens rings are strongly saturated
red    = (R > 120) & (R > G*1.5) & (R > B*1.5)
green  = (G > 100) & (G > R*1.25) & (G > B*1.25)
yellow = (R > 130) & (G > 110) & (B < G*0.75) & (abs(R-G) < 110)
mask = (sat > 70) & (mx > 120) & (red | green | yellow)
seen = np.zeros((PH,PW), bool); comps=[]
ys,xs = np.where(mask)
for y0,x0 in zip(ys,xs):
    if seen[y0,x0]: continue
    q=deque([(y0,x0)]); seen[y0,x0]=True; pts=[]
    while q:
        y,x=q.popleft(); pts.append((y,x))
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                ny,nx=y+dy,x+dx
                if 0<=ny<PH and 0<=nx<PW and mask[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True; q.append((ny,nx))
    if len(pts)<120: continue
    arr=np.array(pts); cy,cx=arr[:,0].mean(),arr[:,1].mean()
    h=arr[:,0].max()-arr[:,0].min()+1; w=arr[:,1].max()-arr[:,1].min()+1
    fill=len(pts)/float(w*h); ar=w/float(h)
    if not (0.7<ar<1.45): continue
    if fill<0.6: continue
    if not (16<=w<=52): continue
    if not (16<=h<=52): continue
    col=a[arr[:,0],arr[:,1]].mean(axis=0)
    comps.append(dict(cx=float(cx),cy=float(cy),w=int(w),h=int(h),fill=round(fill,2),col=[int(c) for c in col]))
comps.sort(key=lambda c:-c['w']*c['h'])
keep=[]
for c in comps:
    if all(math.hypot(c['cx']-k['cx'],c['cy']-k['cy'])>0.75*max(c['w'],k['w']) for k in keep): keep.append(c)
keep.sort(key=lambda c:(c['cy'],c['cx']))
print('detected',len(keep))
vis=pf.copy(); d=ImageDraw.Draw(vis)
for c in keep:
    d.ellipse([c['cx']-c['w']/2,c['cy']-c['h']/2,c['cx']+c['w']/2,c['cy']+c['h']/2],outline=(0,255,255),width=2)
vis.resize((int(PW*1.7),int(PH*1.7)),Image.LANCZOS).save('dev/crops/detect2.png')
json.dump(keep, open('dev/inserts.json','w'))
for c in keep:
    print('%5.1f %5.1f  %2dx%-2d #%02x%02x%02x'%(c['cx']/PW*100,c['cy']/PH*100,c['w'],c['h'],c['col'][0],c['col'][1],c['col'][2]))
