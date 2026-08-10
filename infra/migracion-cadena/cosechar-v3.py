#!/usr/bin/env python3
# Saca de la cadena vieja los argumentos REALES de Uniswap V3.
#
# POR QUE NO HACE FALTA EL CODIGO FUENTE
#
# Los pools y el gestor de posiciones resultaron ser Uniswap V3 de fabrica: se
# comprobo por sondeo (responden a slot0, tickSpacing, fee, maxLiquidityPerTick)
# y su disposicion de almacenamiento es publica y fija.
#
# Lo unico que faltaba eran las CLAVES: que ticks, que posiciones, que palabras
# del mapa de bits existen de verdad. Y eso no hay que adivinarlo — la cadena
# vieja lo dice si se le pregunta. positions(tokenId) en el gestor devuelve el
# dueno y los dos ticks de cada posicion; con eso la clave sale exacta.
#
# EL DETALLE QUE HACIA FALLAR TODO
#
# V3 forma la clave de una posicion con
#     keccak(abi.encodePacked(dueno, tickLower, tickUpper))
# que son VEINTISEIS bytes sin relleno: 20 de la direccion y 3 de cada tick.
# El emparejador rellenaba cada valor a treinta y dos, y eso da un hash que no
# se parece en nada. Por eso ni una sola posicion emparejaba.

import json, os, sys, time, urllib.request
from Crypto.Hash import keccak as _K

RPC = os.environ.get('OG_RPC', 'https://rpc.ordenglobal-rpc.com/')

def keccak(b: bytes) -> bytes:
    k = _K.new(digest_bits=256); k.update(b); return k.digest()

def rpc(m, p, intentos=4):
    for i in range(intentos):
        try:
            b = json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode()
            r = json.load(urllib.request.urlopen(
                urllib.request.Request(RPC, b, {'Content-Type': 'application/json'}), timeout=25))
            return r.get('result')
        except Exception:
            if i == intentos - 1: return None
            time.sleep(1.0 * (i + 1))

def llamar(to, sel, *args):
    datos = sel + ''.join('%064x' % (a % (1 << 256)) for a in args)
    return rpc('eth_call', [{"to": to, "data": datos}, 'latest'])

def palabras(hexs):
    if not hexs or hexs == '0x': return []
    b = bytes.fromhex(hexs[2:])
    return [int.from_bytes(b[i:i+32], 'big') for i in range(0, len(b) - 31, 32)]

def con_signo(v, bits=256):
    """Un int24 negativo llega extendido a 256 bits, no recortado a 24.

    Es la clase de detalle que no falla ruidosamente: sin esto, un tick -887272
    se lee como un numero de setenta y siete cifras y la clave que sale de ahi
    no coincide con nada, sin que nada avise."""
    return v - (1 << bits) if v >= (1 << (bits - 1)) else v

SEL = {
    'totalSupply': '0x18160ddd', 'tokenByIndex': '0x4f6ccce7', 'ownerOf': '0x6352211e',
    'positions_mgr': '0x99fbab88', 'tickSpacing': '0xd0c93a7c', 'slot0': '0x3850c7bd',
    'token0': '0x0dfe1681', 'token1': '0xd21220a7', 'fee': '0xddca3f43',
}

def main():
    gestores = sys.argv[1:] or ['0xaf25c9025ad8bbe86d9d8051afe0192002aec272']
    dirs, numericas, claves32 = set(), set(), set()

    for g in gestores:
        ts = llamar(g, SEL['totalSupply'])
        n = int(ts, 16) if ts and ts != '0x' else 0
        print(f'gestor {g}: {n} posiciones', flush=True)
        for i in range(n):
            t = llamar(g, SEL['tokenByIndex'], i)
            if not t or t == '0x': continue
            tid = int(t, 16)
            numericas.add(tid)
            due = llamar(g, SEL['ownerOf'], tid)
            if due and due != '0x':
                dirs.add('0x' + due[-40:])
            p = palabras(llamar(g, SEL['positions_mgr'], tid))
            if len(p) < 8:
                print(f'   posicion {tid}: sin datos', flush=True); continue
            # (nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, …)
            operador = '0x%040x' % p[1]
            t0 = '0x%040x' % p[2]; t1 = '0x%040x' % p[3]
            bajo = con_signo(p[5]); alto = con_signo(p[6])
            dirs.update([operador, t0, t1])
            numericas.update([bajo, alto, bajo >> 8, alto >> 8, (bajo >> 8) - 1, (alto >> 8) + 1])
            # La clave de la posicion DENTRO del pool. El dueno ahi es el gestor,
            # porque las posiciones acuñadas por NFT las tiene el gestor a su nombre.
            for dueno in {g.lower(), operador.lower()}:
                paquete = (bytes.fromhex(dueno[2:])
                           + (bajo & 0xFFFFFF).to_bytes(3, 'big')
                           + (alto & 0xFFFFFF).to_bytes(3, 'big'))
                claves32.add('0x' + keccak(paquete).hex())
            print(f'   posicion {tid}: ticks {bajo} … {alto}', flush=True)
            time.sleep(0.03)

    salida = {
        'direcciones': sorted(dirs),
        'numericas': sorted(numericas),
        'clavesBytes32': sorted(claves32),
    }
    json.dump(salida, open('candidatos-v3.json', 'w'), indent=1)
    print(f"\ndirecciones {len(dirs)} · claves numericas {len(numericas)} · "
          f"claves de posicion {len(claves32)}")
    print('escrito candidatos-v3.json')

if __name__ == '__main__':
    main()
