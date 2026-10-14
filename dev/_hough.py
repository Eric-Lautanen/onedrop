from PIL import Image, ImageDraw
import numpy as np, math, json
im = Image.open('assets/sprite.png').convert('RGB')
PF=(157,364,610,1181); pf=im.crop(PF); PW,PH=pf.size
a=np.asarray(pf).astype(np.float32)
lum=a.mean(axis=2)
# Sobel
gx=np.zeros_like(lum); gy=np.zeros_like(lum)
gx[:,1:-1]=lum[:,2:]-lum[:,:-2]; gy[1:-1,:]=lum[2:,:]-lum[:-2,:]
mag=np.hypot(gx,gy)
thr=np.percentile(mag,88)
ey,ex=np.where(mag>thr)
gxn=gx[ey,ex]/ (mag[ey,ex]+1e-6); gyn=gy[ey,ex]/(mag[ey,ex]+1e-6)
print('edge px', len(ey))
RMIN,RMAX=7,26
acc=np.zeros((PH,PW),np.float32)
for r in range(RMIN,RMAX+1):
    for s in (-1,1):
        cx=(ex+gxn*r*s).astype(np.int32); cy=(ey+gyn*r*s).astype(np.int32)
        ok=(cx>=0)&(cx<PW)&(cy>=0)&(cy<PH)
        np.add.at(acc,(cy[ok],cx[ok]),1.0/r)
# smooth
k=np.ones((5,5),np.float32); k/=k.sum()
pad=np.pad(acc,2,mode='edge')
sm=np.zeros_like(acc)
for dy in range(5):
    for dx in range(5):
        sm+=k[dy,dx]*pad[dy:dy+PH,dx:dx+PW]
# peaks
cand=[]
for y in range(8,PH-8):
    for x in range(8,PW-8):
        v=sm[y,x]
        if v<sm[y-6:y+7,x-6:x+7].max(): continue
        cand.append((v,x,y))
cand.sort(reverse=True)
keep=[]
for v,x,y in cand:
    if v<0.55*sm.max(): break
    if all(math.hypot(x-kx,y-ky)>16 for _,kx,ky in keep): keep.append((v,x,y))
print('peaks', len(keep))
# classify colour inside each circle
out=[]
for v,x,y in keep:
    rr=13
    yy,xx=np.ogrid[:PH,:PW]
    m=(xx-x)**2+(yy-y)**2 <= rr*rr
    col=a[m].mean(axis=0)
    mx_=col.max(); mn_=col.min(); s=mx_-mn_
    R,G,B=col
    if s<55 or mx_<110: continue
    kind='red' if (R>G*1.25 and R>B*1.25) else ('green' if (G>R*1.05 and G>B*1.05) else 'gold')
    out.append(dict(cx=float(x),cy=float(y),kind=kind,col=[int(c) for c in col],score=float(v)))
out.sort(key=lambda c:(c['cy'],c['cx']))
print('kept',len(out))
vis=pf.copy(); d=ImageDraw.Draw(vis)
for c in out:
    d.ellipse([c['cx']-13,c['cy']-13,c['cx']+13,c['cy']+13],outline=(0,255,255),width=2)
vis.resize((int(PW*1.7),int(PH*1.7)),Image.LANCZOS).save('dev/crops/detect3.png')
json.dump(out,open('dev/inserts.json','w'))
for c in out: print('%5.1f %5.1f %-5s #%02x%02x%02x'%(c['cx']/PW*100,c['cy']/PH*100,c['kind'],c['col'][0],c['col'][1],c['col'][2]))
