#!/usr/bin/env python3
# LA FOTO DEL ESTADO, a una altura fija y comprobada contra el genesis.
#
# No se fia de "solo hubo unas pocas transacciones": lee las 331 cuentas del
# alloc y las 1.375 ranuras, una por una, y ademas las direcciones que las
# transacciones tocaron. Lo que salga distinto sale en el informe; lo que no
# aparezca aqui es que no cambio.
#
# Se lee todo a UNA altura fija. Leer a "latest" mientras la cadena avanza
# produce una foto que nunca existio.
import json, sys, urllib.request, time

R = 'http://127.0.0.1:8545'
LOTE = 300

def rpc1(m, p):
    b = json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
    return json.load(urllib.request.urlopen(urllib.request.Request(
        R, b, {'Content-Type':'application/json'}), timeout=120))['result']

def rpc_lote(pet):
    for i in range(4):
        try:
            b = json.dumps(pet).encode()
            r = json.load(urllib.request.urlopen(urllib.request.Request(
                R, b, {'Content-Type':'application/json'}), timeout=240))
            return {x['id']: x.get('result') for x in r}
        except Exception:
            if i == 3: raise
            time.sleep(2)

def en_lotes(pet):
    out = {}
    for i in range(0, len(pet), LOTE):
        out.update(rpc_lote(pet[i:i+LOTE]))
    return out

gen = json.load(open('/opt/og5550-real/genesis.json'))
alloc = {a.lower(): v for a, v in gen['alloc'].items()}
tocadas = json.load(open('/tmp/direcciones-tocadas.json'))
validadores = json.load(open('/tmp/validadores.json'))

todas = sorted(set(list(alloc) + [a.lower() for a in tocadas] +
                   [a.lower() for a in validadores]))

ALT = int(rpc1('eth_blockNumber', []), 16)
BLQ = hex(ALT)
cab = rpc1('eth_getBlockByNumber', [BLQ, False])
print(json.dumps({'altura': ALT, 'hashBloque': cab['hash'],
                  'raizEstado': cab['stateRoot'], 'sello': cab['timestamp']}))

# --- cuentas ---
pet, mapa = [], {}
for i, a in enumerate(todas):
    for k, m in ((0,'eth_getBalance'), (1,'eth_getTransactionCount'), (2,'eth_getCode')):
        idd = i*3 + k
        pet.append({"jsonrpc":"2.0","id":idd,"method":m,"params":[a, BLQ]})
        mapa[idd] = (a, m)
res = en_lotes(pet)
cuentas = {}
for idd, (a, m) in mapa.items():
    cuentas.setdefault(a, {})[m] = res.get(idd)

# --- ranuras del genesis ---
pares = [(a, r) for a, v in alloc.items() for r in (v.get('storage') or {})]
pet, mapa = [], {}
for i, (a, r) in enumerate(pares):
    pet.append({"jsonrpc":"2.0","id":i,"method":"eth_getStorageAt","params":[a, r, BLQ]})
    mapa[i] = (a, r)
res = en_lotes(pet) if pet else {}
ranuras = {}
for i, (a, r) in mapa.items():
    ranuras.setdefault(a, {})[r] = res.get(i)

json.dump({'altura': ALT, 'hashBloque': cab['hash'], 'raizEstado': cab['stateRoot'],
           'cuentas': cuentas, 'ranuras': ranuras},
          open('/tmp/foto-estado.json', 'w'))
print('cuentas leidas:', len(cuentas), '· ranuras leidas:', sum(len(v) for v in ranuras.values()))
