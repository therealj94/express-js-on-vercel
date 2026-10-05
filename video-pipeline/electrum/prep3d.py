import cv2, numpy as np, json, math, heapq
from numba import njit
import heapq as hq
out='../codigo/t3d/'; import os; os.makedirs(out,exist_ok=True)
# ---------- nacional ----------
m=json.load(open('meta.json')); d=cv2.imread('dem16.png',-1).astype(np.float32)/65535*m['hmax']
H,W=d.shape; nw,nh=W//4+1,H//4+1
dn=cv2.resize(d,(nw,nh),interpolation=cv2.INTER_AREA); dn.astype('<f4').tofile(out+'h9.bin')
def shade(dem, px_m, az=315, alt=40, z=1.0):
    gy,gx=np.gradient(dem*z, px_m)
    sl=np.arctan(np.hypot(gx,gy)); asp=np.arctan2(-gx,gy)
    a=math.radians(az); al=math.radians(alt)
    s=np.sin(al)*np.cos(sl)+np.cos(al)*np.sin(sl)*np.cos(a-asp)
    return np.clip(s,0,1)
s9=0.6*shade(d,295,315,38,1.6)+0.4*shade(d,295,20,55,1.6)
cv2.imwrite(out+'shade9.jpg',(s9*255).astype(np.uint8),[1,92])
mk=cv2.imread('mask.png',0).astype(np.float32)/255
bl=cv2.GaussianBlur(mk,(0,0),18); bl2=cv2.GaussianBlur(mk,(0,0),3)
cv2.imwrite(out+'mask9.png',np.dstack([np.zeros_like(mk),(bl*255),(bl2*255)]).astype(np.uint8))  # BGR -> R=bl2 G=bl
sat=cv2.imread('sat.jpg'); cv2.imwrite(out+'sat9.jpg',sat,[1,90])
# ---------- local ----------
m2=json.load(open('meta12.json')); d2=cv2.imread('dem12_16.png',-1).astype(np.float32)/65535*(m2['hi']-m2['lo'])+m2['lo']
N=d2.shape[0]; ln=600
dl=cv2.resize(d2,(ln+1,ln+1),interpolation=cv2.INTER_AREA); dl.astype('<f4').tofile(out+'h12.bin')
s12=0.6*shade(d2,36.9,315,35,1.3)+0.4*shade(d2,36.9,30,55,1.3)
cv2.imwrite(out+'shade12.jpg',(s12*255).astype(np.uint8),[1,92])
cv2.imwrite(out+'sat12.jpg',cv2.imread('sat12.jpg'),[1,92])
# drenaje real (D8 con relleno de pozos) a 896
n=896; e=cv2.resize(d2,(n,n),interpolation=cv2.INTER_AREA).astype(np.float64)
@njit
def fill_and_flow(e):
    n=e.shape[0]; f=e.copy(); vis=np.zeros((n,n),np.bool_)

    h=[(0.0,0,0)][:0]
    for i in range(n):
        for j in range(n):
            if i==0 or j==0 or i==n-1 or j==n-1:
                h.append((f[i,j],i,j)); vis[i,j]=True
    hq.heapify(h)
    order=np.zeros((n*n,2),np.int64); k=0
    rec=np.full((n,n,2),-1,np.int64)
    while len(h)>0:
        z,i,j=hq.heappop(h); order[k,0]=i; order[k,1]=j; k+=1
        for di in (-1,0,1):
            for dj in (-1,0,1):
                a=i+di; b=j+dj
                if (di or dj) and 0<=a<n and 0<=b<n and not vis[a,b]:
                    vis[a,b]=True
                    if f[a,b]<=z: f[a,b]=z+1e-4
                    rec[a,b,0]=i; rec[a,b,1]=j
                    hq.heappush(h,(f[a,b],a,b))
    acc=np.ones((n,n))
    for q in range(n*n-1,-1,-1):
        i=order[q,0]; j=order[q,1]; a=rec[i,j,0]; b=rec[i,j,1]
        if a>=0: acc[a,b]+=acc[i,j]
    return acc,rec,order
acc,rec,order=fill_and_flow(e)
np.save('acc.npy',acc); np.save('rec.npy',rec)
lon0=m2['x0']*256/2**12/256*360-180
def pix2ll(px,py,z=12,x0=m2['x0'],y0=m2['y0'],s=n/N):
    X=px/s+x0*256; Y=py/s+y0*256; lon=X/(2**z*256)*360-180
    lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*Y/(2**z*256))))); return lon,lat
def ll2pix(lon,lat,s=n/N):
    z=12; X=(lon+180)/360*2**z*256-m2['x0']*256; r=math.radians(lat)
    Y=(1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**z*256-m2['y0']*256; return X*s,Y*s
# cuenca: salida con área 20-40 km2 cerca del centro-oeste del objetivo
cell_km2=(36.9*N/n/1000)**2
tx,ty=ll2pix(-86.87,14.66)
best=None
for i in range(n):
    for j in range(n):
        a=acc[i,j]*cell_km2
        if 18<a<35:
            dd=(j-tx)**2+(i-ty)**2
            if best is None or dd<best[0]: best=(dd,i,j,a)
_,oi,oj,area=best; print('salida',pix2ll(oj,oi),area,'km2')
# máscara de cuenca: celdas cuyo camino llega a la salida
cu=np.zeros((n,n),np.uint8); cu[oi,oj]=1
for q in range(n*n):  # orden de relleno: desde bordes hacia adentro -> receptor antes que donante
    i,j=order[q]; a,b=rec[i,j]
    if a>=0 and cu[a,b]: cu[i,j]=1
print('cuenca celdas',cu.sum(),cu.sum()*cell_km2)
# textura de drenaje (ríos) a 1792
riv=np.clip((np.log(acc)-np.log(250))/(np.log(acc.max())-np.log(250)),0,1)
riv=cv2.resize(riv.astype(np.float32),(N,N),interpolation=cv2.INTER_LINEAR)
cu2=cv2.resize(cu.astype(np.float32),(N,N),interpolation=cv2.INTER_LINEAR)
cv2.imwrite(out+'agua12.png',np.dstack([np.zeros((N,N)),cu2*255,riv*255]).astype(np.uint8)) # R=rio G=cuenca
# contorno de cuenca en lon/lat para dibujar
cs,_=cv2.findContours((cu*255).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
c=max(cs,key=cv2.contourArea)[:,0,:]
cuenca=[pix2ll(x,y) for x,y in c]
# ríos principales como polilíneas (acc > umbral) — sólo para referencia
ys,xs=np.where(cu>0); cx,cy=xs.mean(),ys.mean()
info={'cuenca':cuenca,'centro_cuenca':pix2ll(cx,cy),'salida':pix2ll(oj,oi),'area_km2':float(cu.sum()*cell_km2),
 'meta12':m2,'meta9':m,'n9':[nw,nh],'n12':ln+1}
json.dump(info,open(out+'info.json','w'))
# litología estilizada siguiendo el relieve (10 km alrededor del objetivo)
rng=np.random.default_rng(7)
def ruido(sz,sig): r=rng.standard_normal((N,N)).astype(np.float32); r=cv2.GaussianBlur(r,(0,0),sig); return r/r.std()
q=ruido(N,60)*0.8+ruido(N,22)*0.35+(d2-d2.mean())/d2.std()*0.9
cls=np.digitize(q,np.quantile(q,[.16,.32,.48,.62,.78,.9]))
pal=np.array([[140,74,50],[200,145,58],[95,127,67],[122,78,143],[176,106,62],[154,138,74],[107,90,58]],np.float32)
lit=pal[cls]
bx,by=ll2pix(-86.85,14.62,1)
yy,xx=np.mgrid[0:N,0:N]
ang=np.arctan2(yy-by+30,xx-bx-60)
rr=np.hypot((xx-bx-60)/1.2,(yy-by+30))
intr=rr<(70+18*np.sin(ang*4)+ruido(N,6)*6)
lit[intr]=[214,80,110]
edge=cv2.morphologyEx(cls.astype(np.uint8),cv2.MORPH_GRADIENT,np.ones((3,3)))>0
lit[edge]*=0.55
cv2.imwrite(out+'lito12.png',cv2.cvtColor(lit.astype(np.uint8),cv2.COLOR_RGB2BGR))
print('listo')
