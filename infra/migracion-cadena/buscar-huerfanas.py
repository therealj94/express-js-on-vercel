#!/usr/bin/env python3
# Le busca la clave real a cada ranura huerfana.
#
# La huella del arbol es keccak(ranura). Asi que basta con generar ranuras
# candidatas, hashearlas y ver cual cae. No se inventa nada: una candidata
# solo vale si su huella esta en el volcado.
import json, sys, time
from Crypto.Hash import keccak as _K
def kc(b):
    k=_K.new(digest_bits=256); k.update(b); return k.digest()
def pad(x):
    if isinstance(x,str): return bytes.fromhex(x[2:].rjust(64,'0'))
    return (int(x)%(1<<256)).to_bytes(32,'big')

e=json.load(open('/opt/migracion/estado-con-claves.json'))
huer={}
for c in e['cuentas']:
    d=c.get('direccion'); alm=c.get('almacen') or {}; cl=c.get('claves') or {}
    for h in set(alm)-set(cl): huer.setdefault(h,[]).append(d)
objetivo=set(huer)
print(f"huellas huerfanas: {len(objetivo)} en {sum(len(v) for v in huer.values())} ranuras", flush=True)

u=json.load(open('/opt/migracion/universo.json'))
dirs=u['direcciones']
# Las cuentas del arbol tambien, por si acaso
dirs=sorted(set(dirs) | {c['direccion'] for c in e['cuentas'] if c.get('direccion')})
print(f"direcciones candidatas: {len(dirs)}", flush=True)

enc={}
def anota(h, etq):
    if h in objetivo and h not in enc:
        enc[h]=etq
        print(f"  ENCONTRADA {h} = {etq}", flush=True)

t0=time.time()
# 1. mapa(direccion, ranura) con desplazamiento, que cubre structs cortos
for a in dirs:
    pa=pad(a)
    for s in range(0,25):
        base=int.from_bytes(kc(pa+pad(s)),'big')
        for off in range(0,4):
            anota('0x'+kc(((base+off)%(1<<256)).to_bytes(32,'big')).hex(), ["mapa",a,s,off])
    if len(enc)==len(objetivo): break
print(f"tras mapas de direccion: {len(enc)}/{len(objetivo)} · {time.time()-t0:.0f}s", flush=True)

# 2. mapa con clave numerica (identificadores de posicion, indices)
if len(enc)<len(objetivo):
    for n in range(0,300000):
        pn=pad(n)
        for s in range(0,12):
            base=int.from_bytes(kc(pn+pad(s)),'big')
            for off in range(0,4):
                anota('0x'+kc(((base+off)%(1<<256)).to_bytes(32,'big')).hex(), ["mapa-num",n,s,off])
        if len(enc)==len(objetivo): break
print(f"tras mapas numericos: {len(enc)}/{len(objetivo)} · {time.time()-t0:.0f}s", flush=True)

# 3. arreglos: keccak(ranura) + indice
if len(enc)<len(objetivo):
    for s in range(0,60):
        base=int.from_bytes(kc(pad(s)),'big')
        for i in range(0,20000):
            anota('0x'+kc(((base+i)%(1<<256)).to_bytes(32,'big')).hex(), ["arreglo",s,i])
print(f"tras arreglos: {len(enc)}/{len(objetivo)} · {time.time()-t0:.0f}s", flush=True)

# 4. mapa con clave bytes32 vista en los topics (identificadores de rol, hashes)
if len(enc)<len(objetivo):
    for t in u['topics']:
        pt=pad(t)
        for s in range(0,25):
            base=int.from_bytes(kc(pt+pad(s)),'big')
            for off in range(0,3):
                anota('0x'+kc(((base+off)%(1<<256)).to_bytes(32,'big')).hex(), ["mapa-b32",t,s,off])
        if len(enc)==len(objetivo): break
print(f"tras claves bytes32: {len(enc)}/{len(objetivo)} · {time.time()-t0:.0f}s", flush=True)

json.dump({h:enc[h] for h in enc}, open('/opt/migracion/huerfanas-resueltas.json','w'), indent=1)
faltan=[h for h in objetivo if h not in enc]
print(f"\nRESULTADO: {len(enc)}/{len(objetivo)} huellas resueltas · {len(faltan)} sin resolver")
for h in faltan: print("   SIN RESOLVER", h, "en", huer[h][:3], "..." if len(huer[h])>3 else "")
