#!/usr/bin/env python3
# Etapa 1 de la migración: el inventario completo del estado de la cadena 8532.
#
# QUE PRODUCE
#
# Un archivo JSON con TODO lo que hay que trasladar y su huella SHA-256:
#   · cada evento Transfer/Approval de cada token, de toda la historia
#   · los tenedores de cada token con su saldo leído de balanceOf
#   · el saldo nativo de ORIGEN y el nonce de cada dirección vista
#   · el código de cada contrato y sus ranuras de almacenamiento estáticas
#   · la ranura del mapa de saldos de cada token, DETECTADA y comprobada
#
# Ese archivo es tres cosas a la vez: el documento de control que se firma, la
# materia prima del génesis nuevo, y la referencia contra la que se verifica
# la cadena nueva antes de abrirla. Si un solo saldo no cuadra, no se abre.
#
# COMO BARRE LA HISTORIA
#
# El RPC limita eth_getLogs a 1.000 bloques por consulta, así que se barre por
# tramos — sin filtro de contrato, para que un solo barrido traiga los eventos
# de los 14 tokens a la vez. Es reanudable: guarda el progreso cada tramo y,
# si el RPC se cae a mitad (le pasa bajo carga), se relanza y sigue donde iba.

import json, hashlib, os, sys, time, urllib.request

RPC = os.environ.get('OG_RPC', 'https://rpc.ordenglobal-rpc.com/')
SALIDA = os.environ.get('OG_SALIDA', 'inventario-8532.json')
PROGRESO = SALIDA + '.progreso'
TRAMO = 1000          # el límite del RPC
PAUSA = 0.04          # entre consultas; este RPC devuelve 502 si se le apura

TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'

TOKENS = {
  '0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1': 'ONDK',
  '0x6facc8df79cedc6c5065442ce27e915aa3a26b9b': 'AUKA',
  '0x961f798f998c7ff44d47d62c7fa1b572ef187a4b': 'AGKA',
  '0x18b6680cff71c11067bec312fc48786be2e54ead': 'MNKA',
  '0xf1498640b27a66c0dc505093d70911c060e04fb0': 'AUBEX',
  '0x7af11d3e94a174f6fc290a5b7791a6dee2718e62': 'IBS',
  '0x0fa04d11f28b28cbc9b98dd016f02023addb1923': 'HARV',
  '0x2a31ba919a5339fcb0f8aeeffce2c807b16007fe': 'AGRO',
  '0xae14db486872ac07d74ad69cc09590239b21ba2e': 'AIT',
  '0x69846ac960d45f9946c613dfce1b761d37faf098': 'ASL',
  '0x1ac12ebd7739003059d1e9ea2a4863c92d1505dd': 'REST',
  '0xaac6ae2e2037fc2e94d0b060792e7eb4e5fbfa66': 'SOL',
  '0x638f2ba0e3e1083d1ba570b449bd266f3860d164': 'LOVE',
  '0x92496e1848e001428a3495409a9a9f616bb6dd3b': 'POLITICAL',
}
# Direcciones que se inventarían aunque no aparezcan en ningún evento.
SIEMPRE = [
  '0xf777de573e67e78ececd2afe19dd18dd046fd4d0',  # validador
  '0xa07a2ba9735568b989378bbb3b1439ee9c5e5714',  # desplegador
  '0x697bc55e4c184f4c1f3e1e55d8a4090a66a61aa0',
  '0x8979d32c407e22073e258d27adc15b78afc91781',
  '0x0000000000000000000000000000000000001001',  # contrato de staking
]

def rpc(m, p, intentos=6):
    for i in range(intentos):
        try:
            b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode()
            r = json.load(urllib.request.urlopen(
                urllib.request.Request(RPC, b, {'Content-Type': 'application/json'}), timeout=30))
            if 'result' in r: return r['result']
            raise RuntimeError(r.get('error'))
        except Exception as e:
            if i == intentos - 1: raise
            time.sleep(1.5 * (i + 1))

def keccak(dato: bytes) -> str:
    from Crypto.Hash import keccak as K
    k = K.new(digest_bits=256); k.update(dato); return k.hexdigest()

def ranura_mapa(direccion: str, ranura: int) -> str:
    """La ranura donde un mapping guarda la entrada de una dirección."""
    return '0x' + keccak(bytes.fromhex(direccion[2:].zfill(64)) + ranura.to_bytes(32, 'big'))

def main():
    alt = int(rpc('eth_blockNumber', []), 16)
    print(f'altura de referencia: {alt:,}', flush=True)

    # ── 1. Barrido de eventos, reanudable ────────────────────────────────────
    desde, eventos = 0, []
    if os.path.exists(PROGRESO):
        p = json.load(open(PROGRESO))
        desde, eventos = p['hasta'], p['eventos']
        print(f'reanudando desde el bloque {desde:,} ({len(eventos)} eventos ya guardados)', flush=True)

    ultimo_aviso = time.time()
    while desde <= alt:
        hasta = min(desde + TRAMO - 1, alt)
        logs = rpc('eth_getLogs', [{"fromBlock": hex(desde), "toBlock": hex(hasta)}])
        for l in logs:
            eventos.append({
                'bloque': int(l['blockNumber'], 16), 'contrato': l['address'].lower(),
                'temas': l['topics'], 'datos': l['data'], 'tx': l['transactionHash'],
            })
        desde = hasta + 1
        if time.time() - ultimo_aviso > 20:
            json.dump({'hasta': desde, 'eventos': eventos}, open(PROGRESO, 'w'))
            print(f'  … bloque {desde:,} de {alt:,} · {len(eventos)} eventos', flush=True)
            ultimo_aviso = time.time()
        time.sleep(PAUSA)
    json.dump({'hasta': desde, 'eventos': eventos}, open(PROGRESO, 'w'))
    print(f'barrido completo: {len(eventos)} eventos en toda la historia', flush=True)

    # ── 2. Tenedores por token, y todas las direcciones vistas ───────────────
    tenedores = {a: set() for a in TOKENS}
    direcciones = set(SIEMPRE)
    for e in eventos:
        c = e['contrato']
        if c in TOKENS and e['temas'] and e['temas'][0] == TRANSFER and len(e['temas']) >= 3:
            de = '0x' + e['temas'][1][-40:]; a = '0x' + e['temas'][2][-40:]
            for d in (de, a):
                if int(d, 16) != 0:
                    tenedores[c].add(d.lower()); direcciones.add(d.lower())
        direcciones.add(c)

    # ── 3. Saldos de token, leídos de balanceOf a la altura de referencia ───
    sel_balance = '0x70a08231'
    saldos_token = {}
    for c, sim in TOKENS.items():
        filas = {}
        for d in sorted(tenedores[c]):
            r = rpc('eth_call', [{"to": c, "data": sel_balance + d[2:].zfill(64)}, hex(alt)])
            v = int(r, 16) if r and r != '0x' else 0
            if v: filas[d] = str(v)
            time.sleep(PAUSA)
        saldos_token[c] = filas
        print(f'  {sim}: {len(filas)} tenedores con saldo', flush=True)

    # ── 4. La ranura del mapa de saldos, detectada y COMPROBADA ─────────────
    #
    # Para escribir los saldos en el génesis nuevo hay que saber en qué ranura
    # guarda cada contrato su mapping de saldos. Se prueba con un tenedor real:
    # la ranura correcta es la que devuelve por getStorageAt el mismo número
    # que balanceOf. Sin esta comprobación el génesis se escribiría a ciegas.
    ranuras = {}
    for c, filas in saldos_token.items():
        if not filas: ranuras[c] = None; continue
        testigo, esperado = next(iter(filas.items()))
        hallada = None
        for i in range(12):
            v = rpc('eth_getStorageAt', [c, ranura_mapa(testigo, i), hex(alt)])
            if v and int(v, 16) == int(esperado):
                hallada = i; break
            time.sleep(PAUSA)
        ranuras[c] = hallada
        print(f'  {TOKENS[c]}: mapa de saldos en la ranura {hallada}', flush=True)

    # ── 5. Ranuras estáticas de cada contrato (nombre, símbolo, dueño…) ─────
    estaticas = {}
    for c in list(TOKENS) + ['0x0000000000000000000000000000000000001001']:
        filas = {}
        for i in range(20):
            v = rpc('eth_getStorageAt', [c, hex(i), hex(alt)])
            if v and int(v, 16) != 0: filas[hex(i)] = v
            time.sleep(PAUSA)
        estaticas[c] = filas

    # ── 6. Código de cada contrato ──────────────────────────────────────────
    codigos = {}
    for c in list(TOKENS) + ['0x0000000000000000000000000000000000001001']:
        codigos[c] = rpc('eth_getCode', [c, hex(alt)])

    # ── 7. Saldo nativo y nonce de cada dirección vista ─────────────────────
    nativos = {}
    for d in sorted(direcciones):
        bal = int(rpc('eth_getBalance', [d, hex(alt)]), 16)
        non = int(rpc('eth_getTransactionCount', [d, hex(alt)]), 16)
        if bal or non:
            nativos[d] = {'saldo': str(bal), 'nonce': non}
        time.sleep(PAUSA)

    inventario = {
        'cadena': 8532, 'altura': alt, 'tomado': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'tokens': {c: {'simbolo': s, 'ranuraSaldos': ranuras[c]} for c, s in TOKENS.items()},
        'saldosToken': saldos_token,
        'ranurasEstaticas': estaticas,
        'codigos': codigos,
        'nativos': nativos,
        'eventos': eventos,
    }
    cuerpo = json.dumps(inventario, sort_keys=True, separators=(',', ':')).encode()
    huella = hashlib.sha256(cuerpo).hexdigest()
    inventario['huellaSHA256'] = huella
    json.dump(inventario, open(SALIDA, 'w'), indent=1)
    print(f'\ninventario escrito en {SALIDA}')
    print(f'SHA-256 del contenido: {huella}')
    print(f'direcciones con saldo o nonce: {len(nativos)}')

if __name__ == '__main__':
    main()
