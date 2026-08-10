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

# LAS DIRECCIONES DE CONTRATO NO SE ADIVINAN: SE CALCULAN
#
# Un contrato creado con CREATE vive en keccak(rlp([creador, nonce]))[12:]. O
# sea que conociendo a los creadores y hasta qué nonce llegaron, se genera la
# lista EXACTA de todo lo que desplegaron — incluidos los contratos que nunca
# emitieron un evento ni aparecieron en una transacción, que son justamente los
# que el barrido no puede ver.

def rlp_creacion(direccion: str, nonce: int) -> bytes:
    d = bytes.fromhex(direccion[2:])
    cuerpo = b'\x94' + d
    if nonce == 0:
        cuerpo += b'\x80'
    elif nonce < 0x80:
        cuerpo += bytes([nonce])
    else:
        b = nonce.to_bytes((nonce.bit_length() + 7) // 8, 'big')
        cuerpo += bytes([0x80 + len(b)]) + b
    return bytes([0xc0 + len(cuerpo)]) + cuerpo

def direccion_creada(creador: str, nonce: int) -> str:
    return '0x' + keccak(rlp_creacion(creador, nonce))[-40:]

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
    ap.add_argument('--numericas', type=int, default=2048,
                    help='rango de claves numéricas de mapping; se prueba en positivo y negativo')
    ap.add_argument('--campos', type=int, default=8,
                    help='cuántos campos seguidos puede tener una estructura guardada en un mapa')
    ap.add_argument('--arreglo', type=int, default=1024, help='cuántos elementos de arreglo probar')
    a = ap.parse_args()

    est = json.load(open(a.estado))
    cand = json.load(open(a.candidatos))
    dirs = sorted({d.lower() for d in cand['direcciones']})

    # Claves cosechadas de la propia cadena, no inventadas. `cosechar-v3.py`
    # pregunta a Uniswap V3 por sus posiciones reales y devuelve los ticks que
    # existen y las claves de posición ya formadas —con el empaquetado de 26
    # bytes que usa V3, distinto del relleno a 32 de todo lo demás—.
    extraNum = [int(x) for x in cand.get('numericas', [])]
    extra32 = [x for x in cand.get('clavesBytes32', [])]
    if extraNum or extra32:
        print(f"claves cosechadas de la cadena: {len(extraNum)} numéricas · {len(extra32)} de posición")

    # ── 1. direcciones: keccak(dirección de 20 bytes) ────────────────────────
    #
    # Dos rondas. La primera con las direcciones observadas. La segunda genera
    # las que se pueden CALCULAR: por cada dirección ya identificada, todos los
    # contratos que pudo desplegar según su nonce. Y se repite, porque una
    # factoría desplegada así puede a su vez haber desplegado más.
    porHash = {keccak(bytes.fromhex(d[2:])): d for d in dirs}
    faltan = {c['hashDireccion'] for c in est['cuentas'] if c['hashDireccion'] not in porHash}
    nonces = {c['hashDireccion']: c['nonce'] for c in est['cuentas']}
    for vuelta in range(6):
        if not faltan:
            break
        nuevas = 0
        conocidas = [(h, d) for h, d in porHash.items() if h in nonces]
        for h, d in conocidas:
            # +2 de margen: el nonce del volcado es el final, y un despliegue
            # que revirtió igual consumió el número.
            for n in range(nonces[h] + 2):
                hija = direccion_creada(d, n)
                hh = keccak(bytes.fromhex(hija[2:]))
                if hh in faltan and hh not in porHash:
                    porHash[hh] = hija; faltan.discard(hh); nuevas += 1
        print(f"  vuelta {vuelta + 1} de direcciones calculadas: +{nuevas} (faltan {len(faltan)})")
        if not nuevas:
            break

    cuentas, sinDireccion = [], []
    for c in est['cuentas']:
        d = porHash.get(c['hashDireccion'])
        if d is None:
            sinDireccion.append(c)
        c['direccion'] = d
        cuentas.append(c)
    dirs = sorted(set(dirs) | set(porHash.values()))
    print(f"cuentas en el árbol: {len(cuentas)}")
    print(f"  con dirección conocida: {len(cuentas) - len(sinDireccion)}")
    print(f"  SIN dirección conocida: {len(sinDireccion)}")

    # ── 2. ranuras ───────────────────────────────────────────────────────────
    # Tabla de candidatos, construida una vez y reutilizada para cada contrato.
    # Campos sueltos: la ranura es el número, y la clave del árbol su keccak.
    tabla = {clave_arbol(pad(i)): ('fija', i) for i in range(a.ranuras)}

    # Cuando el valor de un mapa es una ESTRUCTURA, sus campos no comparten
    # ranura: ocupan la ranura base y las siguientes. Una posición de Uniswap
    # V3 son cuatro o cinco campos seguidos. Sin este desplazamiento se empareja
    # el primer campo de cada estructura y se pierden todos los demás.
    def sembrar(base: bytes, etiqueta):
        n = int.from_bytes(base, 'big')
        for j in range(a.campos):
            tabla[clave_arbol(((n + j) % (1 << 256)).to_bytes(32, 'big'))] = etiqueta + (j,)

    # Entradas de mapping con clave de dirección: doble keccak.
    for d in dirs:
        for i in range(32):
            sembrar(ranura_mapa(d, i), ('mapa', d, i))
    # Entradas de mapping con clave numérica: identificadores de NFT, índices y
    # ticks. Los ticks de un pool son enteros CON SIGNO, así que el rango tiene
    # que cubrir los negativos: un tick -200 se codifica en complemento a dos y
    # no se parece en nada a 200.
    rango = list(range(a.numericas)) + [-x for x in range(1, a.numericas)] + extraNum
    for n in rango:
        clave = (n % (1 << 256)).to_bytes(32, 'big')
        for i in range(32):
            sembrar(bytes.fromhex(keccak(clave + pad(i))[2:]), ('mapa-num', n, i))
    # Claves de posición de V3: ya vienen formadas, sólo falta el mapa que las
    # contiene. Se prueban como clave de mapping en cada ranura base.
    for k in extra32:
        for i in range(32):
            sembrar(bytes.fromhex(keccak(pad(k) + pad(i))[2:]), ('posicion', k, i))
    # Arreglos dinámicos: el elemento k vive en keccak(ranura) + k.
    for i in range(a.ranuras):
        base = int(keccak(pad(i)), 16)
        for k in range(a.arreglo):
            tabla[clave_arbol(((base + k) % (1 << 256)).to_bytes(32, 'big'))] = ('arreglo', i, k)
    # Control de acceso por roles (el AccessControl de OpenZeppelin). Guarda
    # _roles[rol].members[cuenta], que es un mapa anidado cuya PRIMERA clave no
    # es una dirección sino el hash del nombre del rol.
    #
    # PROBADO EN LA CADENA 8532: no emparejó ni una ranura. Se conserva porque
    # la familia es correcta y barata, pero queda dicho para que nadie vuelva a
    # gastar una tarde en ella: lo que le falta a ONDK y AUKA no es esto. Ahí
    # se acabó lo que rinde generar candidatos a ciegas — lo que sigue es leer
    # la disposición real de esos dos contratos.
    ROLES = ['0x' + '00' * 32] + [keccak(n.encode()) for n in (
        'MINTER_ROLE', 'PAUSER_ROLE', 'BURNER_ROLE', 'SNAPSHOT_ROLE',
        'DEFAULT_ADMIN_ROLE', 'ADMIN_ROLE', 'OPERATOR_ROLE', 'UPGRADER_ROLE',
        'BLACKLISTER_ROLE', 'FREEZER_ROLE', 'GOVERNOR_ROLE', 'TREASURY_ROLE')]
    for rol in ROLES:
        for i in range(32):                        # el mapa de roles vive bajo
            interno = ranura_mapa(rol, i)          # _roles[rol]
            for d in dirs:
                # .members[cuenta] — y el campo members puede no ser el primero
                base = int(keccak(pad(d) + interno), 16)
                for j in range(a.campos):
                    tabla[clave_arbol(((base + j) % (1 << 256)).to_bytes(32, 'big'))] = \
                        ('rol', rol, d, i, j)
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
