#!/usr/bin/env python3
# El juez: compara el genesis construido contra la cadena vieja, sin arrancar
# nada. Lo que TIENE que ser identico: el codigo de cada contrato, el nonce de
# cada cuenta, y el valor de TODAS las ranuras de almacenamiento.
#
# Los saldos NO se comparan en general, porque la consolidacion los cambia a
# proposito. Si se comparan los de los contratos y los de las tres billeteras
# preservadas, que la consolidacion no toca.
import json, sys, urllib.request, hashlib

RPC = sys.argv[2] if len(sys.argv) > 2 else 'https://ordenglobal-rpc.com'
LOTE = 20   # este nodo no admite lotes mas grandes

PRESERVADAS = {'0xacc03b7fe0c658cb3872726d05da24d0554f44b8',
               '0x50219186545980b35912adc89550522e63667f74',
               '0x3011f7f9d263d7f73a1ac2130ac7afe426495718'}

def lote(peticiones):
    """Manda como mucho LOTE peticiones y devuelve las respuestas ordenadas."""
    salida = {}
    for i in range(0, len(peticiones), LOTE):
        trozo = peticiones[i:i+LOTE]
        cuerpo = json.dumps([{'jsonrpc':'2.0','id':j,'method':m,'params':p}
                             for j,(m,p) in enumerate(trozo)]).encode()
        pet = urllib.request.Request(RPC, data=cuerpo,
                                     headers={'content-type':'application/json'})
        r = json.load(urllib.request.urlopen(pet, timeout=60))
        if isinstance(r, dict):
            raise SystemExit('el nodo contesto un error al lote: %r' % r)
        for x in r:
            salida[i + x['id']] = x.get('result')
    return [salida.get(k) for k in range(len(peticiones))]

g = json.load(open(sys.argv[1]))
alloc = g['alloc']
print('genesis: %d cuentas · %d ranuras' % (len(alloc), sum(len(v.get('storage',{})) for v in alloc.values())))
print('config: chainId %s · shanghaiTime %s' % (g['config']['chainId'], g['config'].get('shanghaiTime')))
print('extraData: %s' % g['extraData'][:20] + '…')
print()

igual = dist = 0
fallos = []

# ---- codigo y nonce de cada cuenta -----------------------------------------
dirs = list(alloc)
pet = []
for d in dirs:
    pet.append(('eth_getCode', [d, 'latest']))
    pet.append(('eth_getTransactionCount', [d, 'latest']))
res = lote(pet)
for i, d in enumerate(dirs):
    cod_v = (res[2*i] or '0x').lower()
    non_v = int(res[2*i+1] or '0x0', 16)
    cod_n = (alloc[d].get('code') or '0x').lower()
    non_n = int(alloc[d]['nonce'], 16)
    if cod_v != cod_n:
        dist += 1; fallos.append(('codigo', d, hashlib.sha256(cod_v.encode()).hexdigest()[:12],
                                  hashlib.sha256(cod_n.encode()).hexdigest()[:12]))
    else: igual += 1
    if non_v != non_n:
        dist += 1; fallos.append(('nonce', d, non_v, non_n))
    else: igual += 1

print('codigo y nonce: %d iguales, %d distintos' % (igual, dist))

# ---- saldo de contratos y preservadas --------------------------------------
intocables = [d for d in dirs if 'code' in alloc[d] or d in PRESERVADAS]
res = lote([('eth_getBalance', [d, 'latest']) for d in intocables])
si = sd = 0
for d, v in zip(intocables, res):
    if int(v or '0x0', 16) == int(alloc[d]['balance'], 16): si += 1
    else:
        sd += 1; fallos.append(('saldo', d, int(v or '0x0',16), int(alloc[d]['balance'],16)))
print('saldos que la consolidacion NO toca: %d iguales, %d distintos' % (si, sd))

# ---- TODAS las ranuras ------------------------------------------------------
pares = [(d, r) for d in dirs for r in (alloc[d].get('storage') or {})]
res = lote([('eth_getStorageAt', [d, r, 'latest']) for d, r in pares])
ri = rd = 0
for (d, r), v in zip(pares, res):
    esperado = int(alloc[d]['storage'][r], 16)
    visto = int(v or '0x0', 16)
    if visto == esperado: ri += 1
    else:
        rd += 1
        if len(fallos) < 400: fallos.append(('ranura', '%s %s' % (d, r), hex(visto), hex(esperado)))
print('ranuras de almacenamiento: %d iguales, %d distintas' % (ri, rd))

print()
if fallos:
    print('DIFERENCIAS (%d):' % len(fallos))
    for f in fallos[:25]: print('  ', f)
    if len(fallos) > 25: print('   … y %d mas' % (len(fallos)-25))
    sys.exit(1)
print('EL JUEZ NO ENCUENTRA NI UNA DIFERENCIA.')
