#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Comprueba que una llave de validador respaldada es la que dice ser.

    python3 verificar-respaldo.py llave-node3.hex

Deriva la direccion a partir de la llave privada y la compara con las cuatro
direcciones publicadas de la cadena 5550. Si coincide, ese respaldo sirve.

No necesita conexion ni credenciales: es aritmetica sobre el archivo.
"""

import base64, subprocess, sys, tempfile, os

DIRECCIONES = {
    '0x69e8a7b25586511a0c14430b45100e9439aae36c': 'node3',
    '0x65f987264bd77c3a094badfd88e4ba84c0b36382': 'node5',
    '0xc548464725d5fd4a15b882a221da67b9cfd29514': 'node6',
    '0x48ccec9a54b9357623458f26afadcd7412a6a833': 'node4',
}


def keccak256(datos):
    try:
        from Crypto.Hash import keccak
        h = keccak.new(digest_bits=256)
        h.update(datos)
        return h.digest()
    except ImportError:
        pass
    try:
        import sha3          # pysha3
        return sha3.keccak_256(datos).digest()
    except ImportError:
        raise SystemExit('Falta una biblioteca de keccak. Instala una:\n'
                         '   pip3 install pycryptodome')


def direccion_de(privada_hex):
    """De la llave privada a la direccion, via openssl (curva secp256k1)."""
    d = bytes.fromhex(privada_hex)
    if len(d) != 32:
        raise SystemExit('La llave tiene %d bytes y deberia tener 32. '
                         'Revisa que el descifrado haya salido bien.' % len(d))
    # SEC1 minimo: cabecera + los 32 bytes + el identificador de la curva
    sec1 = (b'\x30\x2e\x02\x01\x01\x04\x20' + d +
            b'\xa0\x07\x06\x05\x2b\x81\x04\x00\x0a')
    pem = (b'-----BEGIN EC PRIVATE KEY-----\n' +
           base64.encodebytes(sec1) +
           b'-----END EC PRIVATE KEY-----\n')
    ruta = tempfile.mktemp(suffix='.pem')
    try:
        with open(ruta, 'wb') as f:
            f.write(pem)
        r = subprocess.run(['openssl', 'ec', '-in', ruta, '-pubout', '-outform', 'DER'],
                           capture_output=True)
        if r.returncode != 0:
            raise SystemExit('openssl no pudo leer la llave: %s'
                             % r.stderr.decode()[:200])
        publica = r.stdout[-64:]
    finally:
        if os.path.exists(ruta):
            with open(ruta, 'wb') as f:      # sobrescribir antes de borrar
                f.write(b'\x00' * len(pem))
            os.remove(ruta)
    return '0x' + keccak256(publica)[-20:].hex()


def main():
    if len(sys.argv) < 2:
        raise SystemExit('uso: verificar-respaldo.py <archivo con la llave en hex> [...]')
    bien = mal = 0
    for ruta in sys.argv[1:]:
        privada = open(ruta).read().strip().lower().removeprefix('0x')
        a = direccion_de(privada)
        quien = DIRECCIONES.get(a)
        if quien:
            print('%-28s %s  -> %s  CORRECTA' % (os.path.basename(ruta), a, quien))
            bien += 1
        else:
            print('%-28s %s  -> NO corresponde a ningun validador de la 5550' %
                  (os.path.basename(ruta), a))
            mal += 1
    print()
    if mal:
        print('HAY %d RESPALDO(S) QUE NO SIRVEN. No los guardes como buenos.' % mal)
        return 1
    print('Los %d respaldos comprobados son correctos.' % bien)
    if bien < 4:
        print('Faltan %d de los cuatro validadores.' % (4 - bien))
    return 0


if __name__ == '__main__':
    sys.exit(main())
