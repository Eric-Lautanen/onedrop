from PIL import Image
import numpy as np
im = Image.open('assets/sprite.png').convert('RGB')
a = np.asarray(im).astype(np.float32)
H,W,_ = a.shape
lum = a.mean(axis=2)
# look at the vertical band containing the playfield: x 150..640, y 340..1200
sub = lum[330:1200, 140:660]
colmean = sub.mean(axis=0)
rowmean = sub.mean(axis=1)
def edges(arr, off, thr=22, minrun=8):
    on = arr > thr
    runs=[]; s=None
    for i,v in enumerate(on):
        if v and s is None: s=i
        elif not v and s is not None:
            if i-s>=minrun: runs.append((s+off, i+off))
            s=None
    if s is not None: runs.append((s+off, len(on)+off))
    return runs
print('col runs (x):', edges(colmean,140,thr=20,minrun=20))
print('row runs (y):', edges(rowmean,330,thr=20,minrun=20))
# finer: print colmean profile every 4 px
print('\ncol profile x=140..660 step8:')
print(' '.join('%d:%d'%(140+i,int(colmean[i])) for i in range(0,len(colmean),8)))
print('\nrow profile y=330..1200 step10:')
print(' '.join('%d:%d'%(330+i,int(rowmean[i])) for i in range(0,len(rowmean),10)))
