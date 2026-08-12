#!/usr/bin/env python3
"""
verificar-firma.py — comprueba una prueba de control de billetera.

Recibe la dirección, el texto firmado y la firma, y responde si esa firma sólo
pudo haberla producido la llave de esa dirección.

    python3 verificar-firma.py --direccion 0x... --firma 0x... --fecha 2026-08-12

POR QUÉ SE RECONSTRUYE EL TEXTO EN VEZ DE ACEPTARLO

El texto no se pide como argumento: se arma aquí con la dirección y la fecha,
igual que lo arma la página. Si se aceptara el texto tal como lo manda quien
firma, bastaría con firmar «hola» y presentarlo como prueba de otra cosa.

QUÉ DEMUESTRA Y QUÉ NO

Demuestra que quien firmó tenía la llave privada de esa dirección en el momento
de firmar. No demuestra quién es esa persona, ni que la llave esté a salvo, ni
que no exista una copia en otras manos.

Sin dependencias: la recuperación de clave pública sobre secp256k1 va escrita
aquí. Son ochenta líneas y evitan arrastrar una biblioteca entera para esto.
"""

import argparse
import re
import sys
from hashlib import sha3_256 as _no  # noqa: F401  (aviso: NO es keccak, ver abajo)

# La curva secp256k1
P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8


def keccak256(datos: bytes) -> bytes:
    """Keccak-256 el de Ethereum, que NO es el SHA3-256 estándar.

    Se diferencian en un solo byte de relleno (0x01 en vez de 0x06). Confundirlos
    da hashes plausibles y completamente equivocados, y es de los errores que no
    se ven hasta que algo no valida.
    """
    RC = [0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
          0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
          0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
          0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
          0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
          0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008]
    ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
           [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
    M = (1 << 64) - 1
    rl = lambda x, n: ((x << n) | (x >> (64 - n))) & M

    tasa = 136
    relleno = bytearray(datos) + b"\x01"
    while len(relleno) % tasa != 0:
        relleno.append(0)
    relleno[-1] |= 0x80

    A = [[0] * 5 for _ in range(5)]
    for b in range(0, len(relleno), tasa):
        bloque = relleno[b:b + tasa]
        for i in range(tasa // 8):
            A[i % 5][i // 5] ^= int.from_bytes(bloque[i * 8:i * 8 + 8], "little")
        for r in range(24):
            C = [A[x][0] ^ A[x][1] ^ A[x][2] ^ A[x][3] ^ A[x][4] for x in range(5)]
            D = [C[(x - 1) % 5] ^ rl(C[(x + 1) % 5], 1) for x in range(5)]
            for x in range(5):
                for y in range(5):
                    A[x][y] ^= D[x]
            B = [[0] * 5 for _ in range(5)]
            for x in range(5):
                for y in range(5):
                    B[y][(2 * x + 3 * y) % 5] = rl(A[x][y], ROT[x][y])
            for x in range(5):
                for y in range(5):
                    A[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y] & M) & B[(x + 2) % 5][y])
            A[0][0] ^= RC[r]

    salida = b"".join(A[i % 5][i // 5].to_bytes(8, "little") for i in range(25))
    return salida[:32]


def inv(a, m=P):
    return pow(a, m - 2, m)


def suma(p, q):
    if p is None: return q
    if q is None: return p
    if p[0] == q[0] and (p[1] + q[1]) % P == 0: return None
    if p == q:
        l = (3 * p[0] * p[0]) * inv(2 * p[1]) % P
    else:
        l = (q[1] - p[1]) * inv(q[0] - p[0]) % P
    x = (l * l - p[0] - q[0]) % P
    return (x, (l * (p[0] - x) - p[1]) % P)


def mul(k, p):
    r = None
    while k:
        if k & 1: r = suma(r, p)
        p = suma(p, p)
        k >>= 1
    return r


def recuperar(hash32: bytes, r: int, s: int, v: int) -> str:
    """Devuelve la dirección que produjo esa firma."""
    if not (1 <= r < N and 1 <= s < N): raise ValueError("r o s fuera de rango")
    x = r
    alfa = (pow(x, 3, P) + 7) % P
    beta = pow(alfa, (P + 1) // 4, P)
    y = beta if (beta % 2 == v % 2) else P - beta
    if (y * y - alfa) % P != 0: raise ValueError("el punto no está en la curva")
    R = (x, y)
    e = int.from_bytes(hash32, "big")
    Q = mul(inv(r, N), suma(mul(s, R), mul(N - (e % N), (GX, GY))))
    if Q is None: raise ValueError("no se pudo recuperar la clave")
    bruto = Q[0].to_bytes(32, "big") + Q[1].to_bytes(32, "big")
    return "0x" + keccak256(bruto)[-20:].hex()


def texto_esperado(direccion: str, fecha: str) -> str:
    # Idéntico al que arma la página. Cualquier diferencia, hasta un salto de
    # línea, cambia el hash y la comprobación falla.
    return (f"Orden Global · prueba de control de esta billetera\n"
            f"Dirección: {direccion}\n"
            f"Fecha: {fecha}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--direccion", required=True)
    ap.add_argument("--firma", required=True)
    ap.add_argument("--fecha", required=True, help="AAAA-MM-DD, la que muestra la página")
    a = ap.parse_args()

    dir_ = a.direccion.strip()
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", dir_):
        raise SystemExit("La dirección no tiene forma de dirección.")

    firma = a.firma.strip()
    if firma.startswith("0x"): firma = firma[2:]
    if len(firma) != 130:
        raise SystemExit(f"La firma debería tener 130 caracteres tras el 0x, tiene {len(firma)}.")

    b = bytes.fromhex(firma)
    r, s, v = int.from_bytes(b[:32], "big"), int.from_bytes(b[32:64], "big"), b[64]
    if v >= 27: v -= 27

    texto = texto_esperado(dir_, a.fecha)
    # El prefijo lo exige el propio estándar: impide que una firma obtenida para
    # un texto sirva como firma de una transacción.
    crudo = f"\x19Ethereum Signed Message:\n{len(texto.encode())}".encode() + texto.encode()

    try:
        recuperada = recuperar(keccak256(crudo), r, s, v)
    except Exception as e:
        raise SystemExit(f"No se pudo verificar: {e}")

    print("Texto comprobado:")
    for l in texto.split("\n"): print("   ", l)
    print()
    print("  Dirección declarada:", dir_.lower())
    print("  Dirección que firmó:", recuperada)
    print()
    if recuperada.lower() == dir_.lower():
        print("  ✓ VÁLIDA — quien firmó tiene la llave de esa dirección.")
        sys.exit(0)
    print("  ✗ NO VÁLIDA — esa firma no salió de esa dirección.")
    sys.exit(1)


if __name__ == "__main__":
    main()
