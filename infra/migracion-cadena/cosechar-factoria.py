#!/usr/bin/env python3
# Las claves de la factoria de Uniswap V3, sacadas de los propios pools.
#
# QUE SE DESCUBRIO Y COMO
#
# Siete contratos resistian a todo: mas argumentos no movian el resultado, ni
# mapas simples, ni anidados de dos direcciones, ni indices numericos. Lo que
# destrabo el asunto no fue otra familia a ciegas sino MIRAR LOS VALORES de las
# ranuras huerfanas: eran direcciones de pools.
#
# Eso identifica la forma sin margen de duda. La factoria guarda
#
#     getPool[token0][token1][fee] -> direccion del pool
#
# que es un mapa anidado de TRES niveles, con una comision numerica en el
# ultimo. El emparejador generaba hasta dos, y por eso ninguna entrada de la
# factoria encajaba nunca.
#
# Y las claves tampoco hay que adivinarlas. Cada pool sabe decir su token0, su
# token1 y su comision, asi que los tres valores salen exactos de la cadena:
# treinta pools, treinta tripletas, sin combinatoria.

import json, os, sys, time, urllib.request
from Crypto.Hash import keccak as _K

RPC = os.environ.get('OG_RPC', 'https://rpc.ordenglobal-rpc.com/')

def kc(b):
    k = _K.new(digest_bits=256); k.update(b); return k.digest()

def pad(x):
    if isinstance(x, str):
        return bytes.fromhex(x[2:].rjust(64, '0'))
    return (int(x) % (1 << 256)).to_bytes(32, 'big')

def call(to, sel):
    try:
        b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                        "params": [{"to": to, "data": sel}, "latest"]}).encode()
        return json.load(urllib.request.urlopen(
            urllib.request.Request(RPC, b, {'Content-Type': 'application/json'}), timeout=20)).get('result')
    except Exception:
        return None

SEL = {'token0': '0x0dfe1681', 'token1': '0xd21220a7', 'fee': '0xddca3f43',
       'slot0': '0x3850c7bd', 'factory': '0xc45a0155'}

def main():
    est = json.load(open(sys.argv[1]))
    salida = sys.argv[2] if len(sys.argv) > 2 else 'candidatos-factoria.json'

    pools = []
    for c in est['cuentas']:
        d = c.get('direccion')
        if not d or not c.get('codigo'):
            continue
        s0 = call(d, SEL['slot0'])
        if not s0 or s0 == '0x':
            continue                      # no es un pool
        t0 = call(d, SEL['token0']); t1 = call(d, SEL['token1']); f = call(d, SEL['fee'])
        if not (t0 and t1 and f) or t0 == '0x':
            continue
        pools.append({'pool': d, 'token0': '0x' + t0[-40:], 'token1': '0x' + t1[-40:],
                      'fee': int(f, 16)})
        time.sleep(0.02)
    print(f'pools encontrados: {len(pools)}', flush=True)

    # La clave del arbol para getPool[a][b][fee], en cada ranura base posible.
    # Se emiten los dos ordenes: la factoria de V3 guarda el par en las dos
    # direcciones para que la consulta funcione sin importar como se pida.
    claves = {}
    comisiones = sorted({p['fee'] for p in pools} | {100, 500, 3000, 10000})
    for p in pools:
        for a, b in ((p['token0'], p['token1']), (p['token1'], p['token0'])):
            for base in range(32):
                interno = kc(pad(a) + pad(base))
                medio = kc(pad(b) + interno)
                for fee in comisiones:
                    r = kc(pad(fee) + medio)
                    claves['0x' + kc(r).hex()] = ['triple', a, b, fee, base]
    print(f'claves de factoria generadas: {len(claves):,} '
          f'({len(comisiones)} comisiones: {comisiones})')

    json.dump({'clavesArbol': claves,
               'pools': pools,
               'direcciones': sorted({p['pool'] for p in pools} |
                                     {p['token0'] for p in pools} |
                                     {p['token1'] for p in pools})},
              open(salida, 'w'), indent=1)
    print(f'escrito {salida}')

if __name__ == '__main__':
    main()
