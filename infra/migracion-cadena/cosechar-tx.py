#!/usr/bin/env python3
# Guarda que transaccion escribio cada evento, para poder trazarla despues.
# La cadena vieja SI expone debug_traceTransaction; el banco se monto creyendo
# que no. Trazando sobre la cadena real la ejecucion no se desvia, porque el
# estado es el de verdad.
import json, time, urllib.request
R='http://127.0.0.1:80'
def rpc(m,p,intentos=4):
    for i in range(intentos):
        try:
            b=json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
            r=json.load(urllib.request.urlopen(urllib.request.Request(R,b,{'Content-Type':'application/json'}),timeout=120))
            if 'error' in r: return ('ERR',r['error'].get('message'))
            return ('OK',r['result'])
        except Exception as e:
            if i==intentos-1: return ('ERR',str(e))
            time.sleep(1)
alt=int(rpc('eth_blockNumber',[])[1],16)
regs=[]; PASO=1000; ini=0; tramos=0; fallos=0; t0=time.time()
while ini<=alt:
    fin=min(ini+PASO-1,alt)
    est,res=rpc('eth_getLogs',[{"fromBlock":hex(ini),"toBlock":hex(fin)}])
    if est=='ERR':
        fallos+=1
        if PASO>100: PASO//=2; continue
        ini=fin+1; continue
    tramos+=1
    for l in res:
        regs.append({"c":l['address'].lower(),"tx":l['transactionHash'],"b":int(l['blockNumber'],16)})
    ini=fin+1
    if tramos%1000==0: print(f"  {fin}/{alt} · {len(regs)} eventos · {time.time()-t0:.0f}s", flush=True)
txs=sorted({r['tx'] for r in regs})
print(f"TERMINADO tramos={tramos} fallos={fallos} eventos={len(regs)} transacciones={len(txs)}")
json.dump({"eventos":regs,"txs":txs}, open('/opt/migracion/eventos-tx.json','w'))
