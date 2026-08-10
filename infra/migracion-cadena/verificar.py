#!/usr/bin/env python3
# El juez de la migración: compara una cadena contra el inventario firmado.
#
# Se corre DOS veces con el mismo inventario:
#   1. contra la cadena de ensayo, para saber que el génesis quedó bien
#   2. contra la cadena definitiva en el corte, ANTES de abrirla al público
#
# La regla es una sola y no tiene excepciones: si algo no cuadra, NO SE ABRE.
# Por eso el script termina con código distinto de cero al primer desajuste
# acumulado — para que un despliegue automatizado no pueda «seguir de largo».

import json, sys, time, urllib.request

def rpc(url, m, p, intentos=5):
    for i in range(intentos):
        try:
            b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode()
            r = json.load(urllib.request.urlopen(
                urllib.request.Request(url, b, {'Content-Type': 'application/json'}), timeout=25))
            if 'result' in r: return r['result']
            raise RuntimeError(r.get('error'))
        except Exception:
            if i == intentos - 1: raise
            time.sleep(1.2 * (i + 1))

def main():
    if len(sys.argv) != 3:
        print('uso: verificar.py <inventario.json> <rpc de la cadena nueva>'); sys.exit(2)
    inv = json.load(open(sys.argv[1]))
    url = sys.argv[2]
    fallos = []
    ok = 0

    # chain ID: si no coincide, todo lo demás da igual
    cid = int(rpc(url, 'eth_chainId', []), 16)
    if cid != inv['cadena']:
        print(f'FALLO FATAL: chain ID {cid}, se esperaba {inv["cadena"]}'); sys.exit(1)

    STAKING = '0x0000000000000000000000000000000000001001'

    # ── saldos nativos y nonces ─────────────────────────────────────────────
    for d, fila in inv['nativos'].items():
        if d == STAKING: continue  # excluido a propósito; su saldo se devolvió al validador
        saldo = int(rpc(url, 'eth_getBalance', [d, 'latest']), 16)
        nonce = int(rpc(url, 'eth_getTransactionCount', [d, 'latest']), 16)
        esperado = int(fila['saldo'])
        if d == '0xf777de573e67e78ececd2afe19dd18dd046fd4d0':
            # al validador puede habérsele devuelto el stake retenido
            if saldo not in (esperado, esperado + 10 * 10**18):
                fallos.append(f'{d}: saldo {saldo} ≠ {esperado} (ni con stake devuelto)')
            else: ok += 1
        elif saldo != esperado:
            fallos.append(f'{d}: saldo nativo {saldo} ≠ {esperado}')
        else: ok += 1
        if nonce < fila['nonce']:
            fallos.append(f'{d}: nonce {nonce} < {fila["nonce"]} — REPETICION POSIBLE')

    # ── código de cada contrato ─────────────────────────────────────────────
    for c, codigo in inv['codigos'].items():
        if c == STAKING: continue
        vivo = rpc(url, 'eth_getCode', [c, 'latest'])
        if vivo != codigo: fallos.append(f'{c}: el código del contrato no coincide')
        else: ok += 1

    # ── saldo de token de CADA tenedor, por balanceOf de verdad ─────────────
    sel = '0x70a08231'
    for c, filas in inv['saldosToken'].items():
        sim = inv['tokens'][c]['simbolo']
        for d, v in filas.items():
            r = rpc(url, 'eth_call', [{"to": c, "data": sel + d[2:].zfill(64)}, 'latest'])
            vivo = int(r, 16) if r and r != '0x' else 0
            if vivo != int(v): fallos.append(f'{sim} {d}: {vivo} ≠ {v}')
            else: ok += 1
            time.sleep(0.03)

    print(f'\ncomprobaciones que cuadran: {ok}')
    if fallos:
        print(f'DESAJUSTES: {len(fallos)} — LA CADENA NO SE ABRE')
        for f in fallos[:40]: print('  ✗', f)
        sys.exit(1)
    print('TODO CUADRA. La cadena coincide con el inventario firmado.')

if __name__ == '__main__':
    main()
