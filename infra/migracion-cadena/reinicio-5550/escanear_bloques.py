#!/usr/bin/env python3
# Recorre TODA la cadena y anota cada bloque que tenga transacciones, ademas
# de quien cobro la comision. Va en lotes de JSON-RPC porque 92.000 llamadas
# sueltas tardan de mas; el nodo aguanta lotes grandes contra 127.0.0.1.
#
# No supone nada: mira los 92.000 bloques, no una muestra.
import json, urllib.request, sys, time

R = 'http://127.0.0.1:8545'
LOTE = 400

def rpc_lote(peticiones):
    b = json.dumps(peticiones).encode()
    q = urllib.request.Request(R, b, {'Content-Type': 'application/json'})
    for intento in range(4):
        try:
            return json.load(urllib.request.urlopen(q, timeout=180))
        except Exception as e:
            if intento == 3:
                raise
            time.sleep(2)

alt = int(json.load(urllib.request.urlopen(urllib.request.Request(
    R, json.dumps({"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}).encode(),
    {'Content-Type':'application/json'}), timeout=60))['result'], 16)

print(f'altura: {alt}', flush=True)

con_tx = []
mineros = {}
vistos = 0
t0 = time.time()
n = 0
while n <= alt:
    fin = min(n + LOTE - 1, alt)
    pet = [{"jsonrpc":"2.0","id":i,"method":"eth_getBlockByNumber",
            "params":[hex(i), False]} for i in range(n, fin + 1)]
    for r in rpc_lote(pet):
        b = r.get('result')
        if not b:
            continue
        vistos += 1
        m = b.get('miner', '').lower()
        mineros[m] = mineros.get(m, 0) + 1
        txs = b.get('transactions') or []
        if txs:
            con_tx.append({'n': int(b['number'], 16), 'tx': txs,
                           'gasUsed': b.get('gasUsed'),
                           'miner': m, 'time': int(b['timestamp'], 16)})
    n = fin + 1
    if n % 20000 < LOTE:
        print(f'  ...{n} ({time.time()-t0:.0f}s)', flush=True)

print(f'bloques mirados: {vistos} de {alt+1}')
print(f'bloques con transacciones: {len(con_tx)}')
print('proponentes distintos:', len(mineros))
for m, c in sorted(mineros.items(), key=lambda x: -x[1]):
    print(f'   {m}  {c}')
print('--- bloques con transacciones ---')
print(json.dumps(con_tx, indent=1))
