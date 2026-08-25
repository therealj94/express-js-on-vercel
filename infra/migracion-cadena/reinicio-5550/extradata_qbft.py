#!/usr/bin/env python3
"""Leer y escribir el extraData de QBFT, que es RLP.

El extraData de un genesis QBFT es RLP de cinco cosas:

    [ vanidad(32 bytes), [validadores], votos, ronda, sellos ]

Aqui hace falta para armar el genesis DE ENSAYO: el mismo alloc que el de
produccion pero con un solo validador, el del ensayo, porque un QBFT de siete
no produce bloques si solo levantas uno.

No se escribe a ciegas. `probarse()` decodifica el extraData de produccion, lo
vuelve a codificar y exige que salga byte a byte igual. Si el codificador no
sabe reproducir lo que Besu ya acepto, no sirve para fabricar uno nuevo.
"""


def _largo(n, base):
    if n < 56:
        return bytes([base + n])
    lb = n.to_bytes((n.bit_length() + 7) // 8, 'big')
    return bytes([base + 55 + len(lb)]) + lb


def cadena(b):
    if len(b) == 1 and b[0] < 0x80:
        return b
    return _largo(len(b), 0x80) + b


def lista(items):
    cuerpo = b''.join(items)
    return _largo(len(cuerpo), 0xc0) + cuerpo


def entero(n):
    if n == 0:
        return cadena(b'')
    return cadena(n.to_bytes((n.bit_length() + 7) // 8, 'big'))


def _leer(b, i):
    """Devuelve (valor, siguiente). El valor es bytes, o una lista de valores."""
    p = b[i]
    if p < 0x80:
        return b[i:i + 1], i + 1
    if p < 0xb8:
        n = p - 0x80
        return b[i + 1:i + 1 + n], i + 1 + n
    if p < 0xc0:
        nl = p - 0xb7
        n = int.from_bytes(b[i + 1:i + 1 + nl], 'big')
        return b[i + 1 + nl:i + 1 + nl + n], i + 1 + nl + n
    if p < 0xf8:
        n = p - 0xc0
        fin = i + 1 + n
        j = i + 1
    else:
        nl = p - 0xf7
        n = int.from_bytes(b[i + 1:i + 1 + nl], 'big')
        fin = i + 1 + nl + n
        j = i + 1 + nl
    out = []
    while j < fin:
        v, j = _leer(b, j)
        out.append(v)
    return out, fin


def decodificar(extradata_hex):
    b = bytes.fromhex(extradata_hex[2:] if extradata_hex.startswith('0x') else extradata_hex)
    v, _ = _leer(b, 0)
    vanidad, validadores, votos, ronda, sellos = v
    return {
        'vanidad': vanidad,
        'validadores': ['0x' + x.hex() for x in validadores],
        'votos': votos,
        'ronda': ronda,
        'sellos': sellos,
    }


def codificar(vanidad, validadores, votos=None, ronda=b'', sellos=None):
    return '0x' + lista([
        cadena(vanidad),
        lista([cadena(bytes.fromhex(v[2:])) for v in validadores]),
        lista(votos or []),
        cadena(ronda if isinstance(ronda, bytes) else entero(ronda)[1:]),
        lista(sellos or []),
    ]).hex()


def probarse(extradata_produccion):
    """El codificador tiene que saber reproducir lo que Besu ya acepto."""
    d = decodificar(extradata_produccion)
    otra = codificar(d['vanidad'], d['validadores'], d['votos'], d['ronda'], d['sellos'])
    igual = otra.lower() == extradata_produccion.lower()
    return igual, d


if __name__ == '__main__':
    import json
    import sys
    g = json.load(open(sys.argv[1]))
    igual, d = probarse(g['extraData'])
    print('vuelve a salir identico:', 'SI' if igual else 'NO')
    print('validadores:', len(d['validadores']))
    for v in d['validadores']:
        print('   ', v)
    if not igual:
        sys.exit(1)
