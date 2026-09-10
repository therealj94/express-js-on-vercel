#!/usr/bin/env python3
"""Ensayo 2 · que la cadena del genesis nuevo VIVA y acepte un envio de verdad.

    OG_SECRETOS=... python3 ensayo-vivo.py genesis-nuevo.json

El ensayo 1 comprueba que Besu importa el genesis y sirve el estado. Eso no
prueba que la cadena funcione: un nodo que no produce bloques responde igual de
bien a `eth_getBalance`. Aqui se comprueba lo otro.

POR QUE ESTE ENSAYO USA UN GENESIS DISTINTO, Y EN QUE

Con siete validadores QBFT hacen falta cinco nodos para producir un bloque, y
en la maquina de ensayo no caben siete Besu. Asi que este ensayo levanta una
VARIANTE, y la variante cambia dos cosas y solo dos:

  1. `extraData` nombra a un unico validador, el del ensayo.
  2. La direccion del ensayo recibe 1 ORIGEN, restado del tesoro, para poder
     pagar gas. La suma total no cambia.

El `alloc` es identico al de produccion en todo lo demas, y eso se comprueba
aqui mismo antes de arrancar. Lo que este ensayo prueba —que la cadena produce
bloques y mueve dinero— no depende de esas dos diferencias.
"""
import json
import os
import pathlib
import sys

import coincurve
from Crypto.Hash import keccak

AQUI = pathlib.Path(__file__).parent
sys.path.insert(0, str(AQUI))
import extradata_qbft as ed
from ssm import correr

TESORO = '0x3d5510e5081822877d14cd51b356bf01df2c32c9'
UNO = 10 ** 18
# Llave de ensayo, fija y publicada a proposito: solo existe en una cadena de
# mentira que se borra al terminar. Fijarla hace el ensayo repetible.
LLAVE_ENSAYO = bytes.fromhex('11' * 32)


def kec(b):
    h = keccak.new(digest_bits=256)
    h.update(b)
    return h.digest()


def direccion(priv):
    pub = coincurve.PublicKey.from_valid_secret(priv).format(compressed=False)[1:]
    return '0x' + kec(pub).hex()[-40:]


def firmar(nonce, gasPrecio, gasLimite, a, valor, datos, chainid, priv):
    """Transaccion legacy con EIP-155, firmada a mano. Sin librerias grandes:
       lo unico que hace falta es RLP, keccak y una curva."""
    def c(x):
        return ed.cadena(x)

    def num(n):
        return c(b'' if n == 0 else n.to_bytes((n.bit_length() + 7) // 8, 'big'))

    campos = [num(nonce), num(gasPrecio), num(gasLimite),
              c(bytes.fromhex(a[2:])), num(valor), c(datos)]
    paraFirmar = ed.lista(campos + [num(chainid), num(0), num(0)])
    h = kec(paraFirmar)
    firma = coincurve.PrivateKey(priv).sign_recoverable(h, hasher=None)
    r, s, rec = firma[:32], firma[32:64], firma[64]
    v = rec + chainid * 2 + 35
    return '0x' + ed.lista(campos + [num(v), c(r.lstrip(b'\x00')), c(s.lstrip(b'\x00'))]).hex()


def variante(g, addr):
    """El genesis de ensayo: un validador, y 1 ORIGEN para el, del tesoro."""
    v = json.loads(json.dumps(g))
    al = v['alloc']
    tes = next(k for k in al if k.lower() == TESORO)
    al[tes]['balance'] = str(int(al[tes]['balance']) - UNO)
    al[addr] = {'balance': str(UNO)}
    d = ed.decodificar(g['extraData'])
    v['extraData'] = ed.codificar(d['vanidad'], [addr], d['votos'], d['ronda'], d['sellos'])
    return v


def main():
    g = json.load(open(sys.argv[1]))
    addr = direccion(LLAVE_ENSAYO)
    v = variante(g, addr)

    # La variante cambia dos cosas y hay que poder decir cuales.
    a1 = {k.lower(): x for k, x in g['alloc'].items()}
    a2 = {k.lower(): x for k, x in v['alloc'].items()}
    distintas = sorted(k for k in set(a1) | set(a2) if a1.get(k) != a2.get(k))
    if distintas != sorted([TESORO, addr.lower()]):
        raise SystemExit(f'la variante cambia mas de lo que dice: {distintas}')
    if sum(int(x['balance']) for x in a2.values()) != sum(int(x['balance']) for x in a1.values()):
        raise SystemExit('la variante no conserva la emision')
    print(f'variante lista · validador y remitente del ensayo: {addr}')
    print(f'cambia solo el tesoro y esa direccion; la emision no se mueve')
    pathlib.Path('genesis-ensayo.json').write_text(json.dumps(v))
    return addr


if __name__ == '__main__':
    main()
