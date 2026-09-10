#!/usr/bin/env python3
# Junta TODAS las direcciones que la cadena vieja ha visto alguna vez.
#
# El emparejador se quedo sin claves porque su lista de direcciones venia de
# las cuentas del arbol y de unos pocos eventos. Pero un tenedor que nunca
# movio ORIGEN no es una cuenta del arbol: solo existe dentro del
# almacenamiento de un token. Su direccion hay que sacarla de los eventos.
#
# Se recorren los logs de toda la cadena en tramos de 1.000 bloques --el nodo
# no admite mas-- y se recoge cualquier palabra de 32 bytes que tenga forma de
# direccion, venga de un topic o de los datos.
import json, sys, time, urllib.request
R='http://127.0.0.1:80'
def rpc(m,p,intentos=4):
    for i in range(intentos):
        try:
            b=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
            r=json.load(urllib.request.urlopen(urllib.request.Request(R,b,{'Content-Type':'application/json'}),timeout=120))
            if 'error' in r: return ('ERR', r['error'].get('message'))
            return ('OK', r['result'])
        except Exception as e:
            if i==intentos-1: return ('ERR', str(e))
            time.sleep(1)
def dir_de(pal):
    # Una palabra de 32 bytes es una direccion si los 12 primeros son cero y
    # los 20 siguientes no lo son todos.
    h=pal[2:] if pal.startswith('0x') else pal
    if len(h)!=64: return None
    if h[:24]!='0'*24: return None
    if h[24:]=='0'*40: return None
    return '0x'+h[24:]
alt=int(rpc('eth_blockNumber',[])[1],16)
dirs=set(); contratos=set(); topics=set(); tramos=0; fallos=0; nlogs=0
PASO=1000
ini=0
t0=time.time()
while ini<=alt:
    fin=min(ini+PASO-1,alt)
    est,res=rpc('eth_getLogs',[{"fromBlock":hex(ini),"toBlock":hex(fin)}])
    if est=='ERR':
        fallos+=1
        # Un tramo fallido NO se cuenta como mirado: se reduce y se reintenta.
        if PASO>100: PASO//=2; continue
        print(f"  tramo {ini}-{fin} imposible: {res}", flush=True)
        ini=fin+1; continue
    tramos+=1; nlogs+=len(res)
    for l in res:
        contratos.add(l['address'].lower())
        for t in l.get('topics') or []:
            topics.add(t)
            d=dir_de(t)
            if d: dirs.add(d)
        datos=l.get('data') or '0x'
        h=datos[2:]
        for i in range(0,len(h)-63,64):
            d=dir_de('0x'+h[i:i+64])
            if d: dirs.add(d)
    ini=fin+1
    if tramos%500==0:
        print(f"  {fin}/{alt} · {len(dirs)} direcciones · {nlogs} eventos · {time.time()-t0:.0f}s", flush=True)
print(f"TERMINADO tramos={tramos} fallos={fallos} eventos={nlogs}")
print(f"direcciones: {len(dirs)} · contratos emisores: {len(contratos)} · topics: {len(topics)}")
json.dump({"direcciones":sorted(dirs),"contratos":sorted(contratos),"topics":sorted(topics)},
          open('/opt/migracion/universo.json','w'))
