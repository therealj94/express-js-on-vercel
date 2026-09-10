# Recoge las transacciones reales dirigidas a los contratos que faltan.
#
# Adivinar argumentos se agoto: las claves de esos mapas no estan entre las
# direcciones conocidas. Pero no hay que adivinarlas — cada entrada de mapa la
# escribio una transaccion, y esas transacciones estan en la cadena con sus
# datos exactos. Con el calldata real, la ranura que calcule la maquina virtual
# es la ranura real.
import json, urllib.request, sys, time
RPC='http://localhost:10002'
OBJ=set(x.lower() for x in json.load(open('/home/ec2-user/volcado/pendientes.json')))
def lote(p):
    b=json.dumps(p).encode()
    return json.load(urllib.request.urlopen(urllib.request.Request(RPC,b,{'Content-Type':'application/json'}),timeout=60))
alt=int(json.load(urllib.request.urlopen(urllib.request.Request(RPC,
    json.dumps({"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}).encode(),
    {'Content-Type':'application/json'})))['result'],16)
print('altura',alt,'· contratos objetivo:',len(OBJ),flush=True)
txs=[]; desde=0; N=100
t0=time.time()
while desde<=alt:
    hasta=min(desde+N-1,alt)
    pet=[{"jsonrpc":"2.0","id":i,"method":"eth_getBlockByNumber","params":[hex(i),True]} for i in range(desde,hasta+1)]
    try: res=lote(pet)
    except Exception as ex:
        time.sleep(2); continue
    if not isinstance(res,list):
        N=max(10,N//2); continue
    for r in res:
        if not isinstance(r,dict): continue
        b=r.get('result')
        if not b: continue
        for t in b.get('transactions') or []:
            to=(t.get('to') or '').lower()
            if to in OBJ:
                txs.append({'to':to,'from':t.get('from'),'input':t.get('input'),'bloque':int(b['number'],16)})
    desde=hasta+1
    if desde % 200000 < N:
        print(f'  bloque {desde:,}/{alt:,} · {len(txs)} tx a contratos objetivo · {desde/max(1,time.time()-t0):.0f} bloq/s',flush=True)
        json.dump(txs,open('/home/ec2-user/volcado/tx-pendientes.json','w'))
json.dump(txs,open('/home/ec2-user/volcado/tx-pendientes.json','w'))
print(f'TERMINADO: {len(txs)} transacciones dirigidas a los contratos que faltan',flush=True)
