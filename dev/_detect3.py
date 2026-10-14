from PIL import Image
import numpy as np
from collections import deque
im = Image.open('assets/sprite.png').convert('RGB')
pf = im.crop((157,364,610,1181)); PW,PH = pf.size
a = np.asarray(pf).astype(np.float32)
R,G,B = a[:,:,0],a[:,:,1],a[:,:,2]
mx=a.max(axis=2); mn=a.min(axis=2); sat=mx-mn
red=(R>120)&(R>G*1.5)&(R>B*1.5); green=(G>100)&(G>R*1.25)&(G>B*1.25)
yellow=(R>130)&(G>110)&(B<G*0.75)
mask=(sat>70)&(mx>120)&(red|green|yellow)
print('mask frac %.3f'%mask.mean(), 'red %.3f green %.3f yellow %.3f'%(red.mean(),green.mean(),yellow.mean()))
seen=np.zeros((PH,PW),bool); sizes=[]
ys,xs=np.where(mask)
for y0,x0 in zip(ys,xs):
    if seen[y0,x0]: continue
    q=deque([(y0,x0)]); seen[y0,x0]=True; n=0
    miny=maxy=y0; minx=maxx=x0
    while q:
        y,x=q.popleft(); n+=1
        miny=min(miny,y);maxy=max(maxy,y);minx=min(minx,x);maxx=max(maxx,x)
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                ny,nx=y+dy,x+dx
                if 0<=ny<PH and 0<=nx<PW and mask[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True;q.append((ny,nx))
    sizes.append((n,maxx-minx+1,maxy-miny+1))
sizes.sort(key=lambda s:-s[0])
print('top comps (area,w,h):', sizes[:18])
print('count total', len(sizes))
