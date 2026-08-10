#!/usr/bin/env python3
# Empareja el volcado del árbol de estado con direcciones y ranuras reales.
#
# EL PROBLEMA
#
# El árbol de Merkle-Patricia no guarda claves: guarda keccak(clave). Al
# volcarlo se obtienen los valores exactos de todo el estado, pero indexados
# por hash. Para escribir un génesis hacen falta las claves reales.
#
# LA SOLUCION, Y POR QUE ES HONESTA
#
# Se prueban candidatos: direcciones vistas en la cadena, ranuras fijas 0..N,
# y las ranuras que produce un mapping — keccak(clave ++ ranura) — y un mapping
# anidado — keccak(gastador ++ keccak(dueño ++ ranura)) — con todas las
# direcciones conocidas. Cada candidato se hashea y se busca en el volcado.
#
# Lo que NO se empareja no se descarta ni se supone: se CUENTA y se lista. Un
# génesis sólo puede construirse cuando ese resto es cero. Esa cuenta es la
# diferencia entre «el estado viaja entero» y «creemos que viaja entero».

import json, sys, argparse
from Crypto.Hash import keccak as _K

def keccak(b: bytes) -> str:
    k = _K.new(digest_bits=256); k.update(b); return '0x' + k.hexdigest()

def pad(x) -> bytes:
    if isinstance(x, str):
        return bytes.fromhex(x[2:].rjust(64, '0')) if x.startswith('0x') else bytes.fromhex(x.rjust(64, '0'))
    return int(x).to_bytes(32, 'big')

# EL DOBLE KECCAK, QUE ES LO QUE HACE FALTA ENTENDER AQUI
#
# Hay dos cosas distintas y se confunden con facilidad:
#
#   · la RANURA — dónde el contrato guarda el dato. Para un campo suelto es un
#     número (0, 1, 2…); para un mapping es keccak(clave ++ ranuraDelMapa).
#   · la CLAVE DEL ARBOL — cómo la encuentra el árbol de Merkle-Patricia, que
#     es siempre keccak(ranura).
#
# O sea que una entrada de mapping lleva keccak DOS VECES: una para calcular la
# ranura y otra para indexarla en el árbol. La primera versión de este archivo
# aplicaba sólo la primera, y por eso emparejaba los campos sueltos —donde la
# ranura es un número y basta un keccak— y no emparejaba ni un solo saldo.
# El síntoma fue delator: sumar 110 direcciones candidatas no movió el
# resultado ni en uno.

def clave_arbol(ranura: bytes) -> str:
    """De la ranura a la clave con la que el árbol la guarda."""
    return keccak(ranura)

def ranura_mapa(clave, ranura_base: int) -> bytes:
    """La ranura de mapa[clave], según el esquema de Solidity."""
    return bytes.fromhex(keccak(pad(clave) + pad(ranura_base))[2:])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('estado', help='estado.json de volcar-estado.go')
    ap.add_argument('candidatos', help='JSON con {"direcciones": [...]}')
    ap.add_argument('--salida', default='estado-con-claves.json')
    ap.add_argument('--ranuras', type=int, default=128, help='cuántas ranuras fijas probar')
    ap.add_argument('--numericas', type=int, default=4096, help='rango de claves numéricas de mapping')
    ap.add_argument('--arreglo', type=int, default=1024, help='cuántos elementos de arreglo probar')
    a = ap.parse_args()

    est = json.load(open(a.estado))
    cand = json.load(open(a.candidatos))
    dirs = sorted({d.lower() for d in cand['direcciones']})

    # ── 1. direcciones: keccak(dirección de 20 bytes) ────────────────────────
    porHash = {keccak(bytes.fromhex(d[2:])): d for d in dirs}
    cuentas, sinDireccion = [], []
    for c in est['cuentas']:
        d = porHash.get(c['hashDireccion'])
        if d is None:
            sinDireccion.append(c)
        c['direccion'] = d
        cuentas.append(c)
    print(f"cuentas en el árbol: {len(cuentas)}")
    print(f"  con dirección conocida: {len(cuentas) - len(sinDireccion)}")
    print(f"  SIN dirección conocida: {len(sinDireccion)}")

    # ── 2. ranuras ───────────────────────────────────────────────────────────
    # Tabla de candidatos, construida una vez y reutilizada para cada contrato.
    # Campos sueltos: la ranura es el número, y la clave del árbol su keccak.
    tabla = {clave_arbol(pad(i)): ('fija', i) for i in range(a.ranuras)}
    # Entradas de mapping con clave de dirección: doble keccak.
    for d in dirs:
        for i in range(32):
            tabla[clave_arbol(ranura_mapa(d, i))] = ('mapa', d, i)
    # Entradas de mapping con clave numérica: identificadores de NFT, ticks,
    # índices. Aparecen en el gestor de posiciones de Uniswap V3 y en cualquier
    # colección. Se prueba un rango corto, que es donde caen en la práctica.
    for n in range(a.numericas):
        for i in range(32):
            tabla[clave_arbol(ranura_mapa(n, i))] = ('mapa-num', n, i)
    # Arreglos dinámicos: el elemento k vive en keccak(ranura) + k.
    for i in range(a.ranuras):
        base = int(keccak(pad(i)), 16)
        for k in range(a.arreglo):
            tabla[clave_arbol(((base + k) % (1 << 256)).to_bytes(32, 'big'))] = ('arreglo', i, k)
    print(f"candidatos de ranura: {len(tabla):,}")

    total, resueltas, huerfanas = 0, 0, []
    for c in cuentas:
        alm = c.get('almacen') or {}
        claves = {}
        for h, v in alm.items():
            total += 1
            m = tabla.get(h)
            if m:
                claves[h] = m; resueltas += 1
            else:
                huerfanas.append((c.get('direccion') or c['hashDireccion'], h, v))
        c['claves'] = claves
    print(f"ranuras totales: {total} · resueltas en la primera pasada: {resueltas} · huérfanas: {len(huerfanas)}")

    # ── 3. segunda pasada: mappings anidados (allowances) ───────────────────
    # keccak(gastador ++ keccak(dueño ++ ranura)). Sólo se prueba sobre las
    # huérfanas, que son pocas: el producto completo sería inabordable.
    if huerfanas:
        internos = {}
        for d in dirs:
            for i in range(32):
                internos[ranura_mapa(d, i)] = (d, i)
        anidados = {}
        for interno, (dueno, i) in internos.items():
            for g in dirs:
                # ranura = keccak(gastador ++ keccak(dueño ++ base));
                # clave del árbol = keccak(ranura). Tres keccak en total.
                r = bytes.fromhex(keccak(pad(g) + interno)[2:])
                anidados[clave_arbol(r)] = ('anidado', dueno, g, i)
        print(f"candidatos anidados: {len(anidados):,}")
        quedan = []
        for dirc, h, v in huerfanas:
            m = anidados.get(h)
            if m:
                for c in cuentas:
                    if (c.get('direccion') or c['hashDireccion']) == dirc:
                        c['claves'][h] = m; break
                resueltas += 1
            else:
                quedan.append((dirc, h, v))
        huerfanas = quedan

    print(f"\nRESULTADO: {resueltas}/{total} ranuras identificadas · {len(huerfanas)} sin identificar")
    if sinDireccion:
        print(f"AVISO: {len(sinDireccion)} cuentas sin dirección conocida — hay que ampliar la lista de candidatos.")
    for dirc, h, v in huerfanas[:25]:
        print(f"   huérfana {dirc} {h} = {v}")

    json.dump({'raiz': est['raiz'], 'cuentas': cuentas,
               'huerfanas': huerfanas, 'sinDireccion': [c['hashDireccion'] for c in sinDireccion]},
              open(a.salida, 'w'), indent=1)
    print(f"escrito {a.salida}")
    if huerfanas or sinDireccion:
        print("\nNO se puede construir el génesis todavía: falta identificar lo de arriba.")
        sys.exit(3)

if __name__ == '__main__':
    main()
