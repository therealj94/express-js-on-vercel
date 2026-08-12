#!/usr/bin/env python3
# Le pide a la cadena vieja que diga ella misma que ranuras toca.
#
# POR QUE ESTO Y NO ADIVINAR
#
# Adivinar se agoto: 1.125 direcciones por 25 ranuras, mapas numericos hasta
# 300.000, arreglos y claves bytes32 no resolvieron ni una de las 30 huellas.
#
# POR QUE ESTO Y NO EL BANCO
#
# El banco se monto creyendo que la cadena vieja no exponia debug_. Si lo
# expone. Y trazar sobre la cadena REAL es estrictamente mejor: el banco tiene
# el estado incompleto, la ejecucion se desvia y revela ranuras de otra
# historia. Aqui la maquina virtual recorre el estado de verdad.
#
# NO SE INVENTA NADA
#
# Una ranura descubierta solo se acepta si keccak(ranura) esta entre las
# huellas huerfanas del volcado. Si no esta, no pinta nada en el genesis.
import json, sys, time, urllib.request
from Crypto.Hash import keccak as _K
R='http://127.0.0.1:80'
def kc(b):
    k=_K.new(digest_bits=256); k.update(b); return k.digest()
def rpc(m,p,intentos=3):
    for i in range(intentos):
        try:
            b=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
            r=json.load(urllib.request.urlopen(urllib.request.Request(R,b,{'Content-Type':'application/json'}),timeout=180))
            if 'error' in r: return ('ERR', r['error'].get('message'))
            return ('OK', r['result'])
        except Exception as e:
            if i==intentos-1: return ('ERR', str(e))
            time.sleep(1)

e=json.load(open('/opt/migracion/estado-con-claves.json'))
huer={}
for c in e['cuentas']:
    d=c.get('direccion'); alm=c.get('almacen') or {}; cl=c.get('claves') or {}
    for h in set(alm)-set(cl): huer.setdefault(h,[]).append(d)
objetivo=set(huer)
print(f"huellas a resolver: {len(objetivo)}", flush=True)

ev=json.load(open('/opt/migracion/eventos-tx.json'))
txs=ev['txs']
print(f"transacciones a trazar: {len(txs)}", flush=True)

enc={}; trazadas=0; sinTraza=0; ranuras_vistas=set()
t0=time.time()
for n,tx in enumerate(txs):
    est,res=rpc('debug_traceTransaction',[tx,{"disableMemory":True,"disableStack":False,"disableStorage":False}])
    if est=='ERR':
        est,res=rpc('debug_traceTransaction',[tx])
    if est=='ERR':
        sinTraza+=1
        if sinTraza<=3: print(f"  sin traza {tx}: {str(res)[:90]}", flush=True)
        continue
    trazadas+=1
    for l in (res.get('structLogs') or []):
        if l.get('op') in ('SLOAD','SSTORE') and l.get('stack'):
            v=l['stack'][-1]
            b=bytes.fromhex((v[2:] if v.startswith('0x') else v).rjust(64,'0'))
            if b in ranuras_vistas: continue
            ranuras_vistas.add(b)
            h='0x'+kc(b).hex()
            if h in objetivo and h not in enc:
                enc[h]='0x'+b.hex()
                print(f"  RESUELTA {h} = ranura {'0x'+b.hex()}  ({len(enc)}/{len(objetivo)})", flush=True)
    if (n+1)%200==0:
        print(f"  {n+1}/{len(txs)} · resueltas {len(enc)}/{len(objetivo)} · ranuras vistas {len(ranuras_vistas)} · {time.time()-t0:.0f}s", flush=True)
    if len(enc)==len(objetivo): print("  todas resueltas", flush=True); break

json.dump(enc, open('/opt/migracion/ranuras-por-traza.json','w'), indent=1)
print(f"\ntrazadas {trazadas} · sin traza {sinTraza} · ranuras distintas vistas {len(ranuras_vistas)}")
print(f"RESULTADO: {len(enc)}/{len(objetivo)} huellas resueltas")
for h in objetivo:
    if h not in enc: print("   SIN RESOLVER", h, "en", huer[h][:2])
