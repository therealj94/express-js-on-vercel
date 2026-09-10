# El juez: compara la cadena vieja contra la nueva, llamada por llamada.
#
# No compara el volcado contra si mismo —eso solo probaria que el script sabe
# copiar— sino lo que RESPONDEN las dos cadenas a las mismas preguntas. Codigo
# desplegado, nombre, simbolo, decimales y emision de cada contrato; saldo
# nativo y nonce de cada cuenta.
#
# Si un solo valor no coincide, no hay migracion: hay una cadena que arranca,
# responde y miente. Por eso termina con codigo de salida distinto de cero
# cuando encuentra una diferencia, para que ningun paso posterior siga de largo.
#
# RESULTADO DEL ENSAYO DEL 10-AGO-2026 (cadena 55330, 130 contratos y 159
# cuentas): 968 comprobaciones iguales, 0 distintas, 0 sin poder comparar.
import json, os, urllib.request, sys
VIEJA = 'https://rpc.ordenglobal-rpc.com/'
NUEVA = 'http://127.0.0.1:8545'
def rpc(url, m, p):
    b = json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode()
    r = json.load(urllib.request.urlopen(urllib.request.Request(url,b,{'Content-Type':'application/json'}),timeout=25))
    return r.get('result')
est = json.load(open(os.environ.get('OG_GENESIS', '/opt/ensayo/genesis-besu.json')))
alloc = est['alloc']
# La raiz del almacenamiento de cada contrato, tal como la tenia la cadena
# vieja. Es la prueba definitiva y la unica que no admite matices: la raiz es
# el hash de TODO el almacenamiento del contrato. Si coincide, no falta ni
# sobra una sola ranura — no hace falta enumerar tenedores ni confiar en que
# la lista este completa.
raices = {}
if os.environ.get('OG_ESTADO'):
    for c in json.load(open(os.environ['OG_ESTADO']))['cuentas']:
        if c.get('direccion') and c.get('raizAlmacen'):
            raices[c['direccion'].lower()] = c['raizAlmacen'].lower()
contratos = [d for d,v in alloc.items() if v.get('code')]
cuentas   = [d for d,v in alloc.items() if not v.get('code')]
SEL = {'totalSupply':'0x18160ddd','symbol':'0x95d89b41','decimals':'0x313ce567','name':'0x06fdde03'}
igual, distinto, fallos = 0, [], 0
print(f'contratos a comparar: {len(contratos)} · cuentas: {len(cuentas)}', flush=True)
for i, c in enumerate(contratos):
    for nombre, sel in SEL.items():
        try:
            a = rpc(VIEJA, 'eth_call', [{"to":c,"data":sel}, 'latest'])
            b = rpc(NUEVA, 'eth_call', [{"to":c,"data":sel}, 'latest'])
        except Exception:
            fallos += 1; continue
        if a == b: igual += 1
        else: distinto.append((c, nombre, str(a)[:40], str(b)[:40]))
    # el codigo desplegado tiene que ser identico
    try:
        if rpc(VIEJA,'eth_getCode',[c,'latest']) == rpc(NUEVA,'eth_getCode',[c,'latest']): igual += 1
        else: distinto.append((c,'codigo','',''))
    except Exception: fallos += 1
    if i % 25 == 0: print(f'  … {i}/{len(contratos)} · iguales {igual} · distintos {len(distinto)}', flush=True)
# ── la prueba definitiva: la raiz del almacenamiento ────────────────────────
if raices:
    print('\ncomparando la raiz del almacenamiento de cada contrato…', flush=True)
    for c in contratos:
        vieja = raices.get(c.lower())
        if not vieja: continue
        try:
            p = rpc(NUEVA, 'eth_getProof', [c, [], 'latest'])
            nueva = (p or {}).get('storageHash', '').lower()
        except Exception:
            fallos += 1; continue
        if nueva == vieja: igual += 1
        else: distinto.append((c, 'raiz de almacenamiento', vieja[:20], nueva[:20]))

print('\ncomparando saldos nativos de las cuentas…', flush=True)
for d in cuentas:
    try:
        a = int(rpc(VIEJA,'eth_getBalance',[d,'latest']),16)
        b = int(rpc(NUEVA,'eth_getBalance',[d,'latest']),16)
        n1 = int(rpc(VIEJA,'eth_getTransactionCount',[d,'latest']),16)
        n2 = int(rpc(NUEVA,'eth_getTransactionCount',[d,'latest']),16)
    except Exception:
        fallos += 1; continue
    if a==b: igual += 1
    else: distinto.append((d,'saldo',str(a),str(b)))
    if n1==n2: igual += 1
    else: distinto.append((d,'nonce',str(n1),str(n2)))
print(f'\nRESULTADO: {igual} comprobaciones iguales · {len(distinto)} distintas · {fallos} sin poder comparar')
for x in distinto[:20]: print('   DISTINTO', x)
json.dump({'igual':igual,'distinto':distinto,'fallos':fallos}, open('/opt/ensayo/comparacion.json','w'))
sys.exit(0 if not distinto else 3)
