#!/usr/bin/env python3
# Las claves de enumeracion del ERC-721, sacadas de los dueños reales.
#
# EL FALLO QUE ESTO ARREGLA, Y COMO APARECIO
#
# Las 31 posiciones de liquidez coincidian en dueño y en datos entre las dos
# cadenas, asi que parecia cerrado. No lo estaba: al comprobar si cada dueño
# podia LISTAR sus posiciones, la lista salia distinta. El saldo era correcto
# —19 y 12 posiciones— pero tokenOfOwnerByIndex devolvia otra cosa.
#
# Eso es visible para el usuario. Una billetera muestra "mis posiciones"
# recorriendo ese indice; sin el, la posicion existe, la liquidez esta, y la
# persona no la ve.
#
# POR QUE NO LO ENCONTRABA EL EMPAREJADOR
#
# La familia estaba —mapa[direccion][indice]— pero el paso anidado se acota a
# unos cientos de direcciones para no agotar la memoria, y estos dos dueños no
# entraban en el recorte. La leccion es la de siempre en este trabajo: cuando se
# conocen las claves reales, no hay que generarlas a ciegas. Aqui se conocen —
# los dueños salen de ownerOf y los indices de balanceOf— asi que son unas pocas
# miles de claves exactas en vez de millones de candidatos.

import json, os, sys, time, urllib.request
from Crypto.Hash import keccak as _K

RPC = os.environ.get('OG_RPC', 'https://rpc.ordenglobal-rpc.com/')
BASES = int(os.environ.get('OG_BASES', '160'))

def kc(b):
    k = _K.new(digest_bits=256); k.update(b); return k.digest()

def pad(x):
    if isinstance(x, str):
        return bytes.fromhex(x[2:].rjust(64, '0'))
    return (int(x) % (1 << 256)).to_bytes(32, 'big')

def call(to, sel, *args):
    try:
        d = sel + ''.join('%064x' % (int(a, 16) if isinstance(a, str) and a.startswith('0x') else int(a))
                          for a in args)
        b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                        "params": [{"to": to, "data": d}, "latest"]}).encode()
        return json.load(urllib.request.urlopen(
            urllib.request.Request(RPC, b, {'Content-Type': 'application/json'}), timeout=20)).get('result')
    except Exception:
        return None

def main():
    gestores = sys.argv[1:-1] or ['0xaf25c9025ad8bbe86d9d8051afe0192002aec272']
    salida = sys.argv[-1] if len(sys.argv) > 1 else 'candidatos-posiciones.json'

    claves, dirs = {}, set()
    for g in gestores:
        ts = call(g, '0x18160ddd')
        n = int(ts, 16) if ts and ts.startswith('0x') and ts != '0x' else 0
        if not n:
            continue
        fichas, duenos = [], {}
        for i in range(n):
            t = call(g, '0x4f6ccce7', i)          # tokenByIndex
            if not t or not t.startswith('0x'):
                continue
            tid = int(t, 16); fichas.append(tid)
            o = call(g, '0x6352211e', tid)        # ownerOf
            if o and o.startswith('0x'):
                d = '0x' + o[-40:]
                duenos.setdefault(d.lower(), []).append(tid)
            time.sleep(0.02)
        print(f'{g}: {len(fichas)} fichas · {len(duenos)} dueños', flush=True)
        dirs |= set(duenos)

        for base in range(BASES):
            # _allTokens[i] — arreglo: keccak(base) + i
            raiz = int.from_bytes(kc(pad(base)), 'big')
            for i in range(len(fichas)):
                claves['0x' + kc(((raiz + i) % (1 << 256)).to_bytes(32, 'big')).hex()] = \
                    ['arreglo', base, i]
            for d, tids in duenos.items():
                interno = kc(pad(d) + pad(base))
                # _ownedTokens[dueño][i] — el indice que hace fallar la lista
                for i in range(len(tids) + 4):
                    r = kc(pad(i) + interno)
                    claves['0x' + kc(r).hex()] = ['anidado-num', d, i, base, 0]
            for tid in fichas:
                # _ownedTokensIndex[ficha] y _allTokensIndex[ficha]
                r = kc(pad(tid) + pad(base))
                claves['0x' + kc(r).hex()] = ['mapa-num', tid, base, 0]

    json.dump({'clavesArbol': claves, 'direcciones': sorted(dirs)}, open(salida, 'w'))
    print(f'claves de enumeracion generadas: {len(claves):,} sobre {BASES} ranuras base')
    print(f'escrito {salida}')

if __name__ == '__main__':
    main()
