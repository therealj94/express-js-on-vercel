#!/usr/bin/env python3
"""
huella-apk.py — saca la huella del certificado con que está firmado un APK.

POR QUÉ NO SE USA `keytool`

`keytool -printcert -jarfile` responde "Not a signed jar file" ante cualquier
APK moderno, y no porque el archivo esté mal: entiende sólo la firma vieja al
estilo JAR (esquema v1), y desde hace años los APK se firman con los esquemas
v2/v3 de Android, que guardan la firma en un bloque propio entre el contenido
del zip y su directorio central. Ese bloque es invisible para las herramientas
de JAR.

La herramienta oficial es `apksigner`, del SDK de Android, que son cientos de
megas para leer veinte bytes. Este archivo lee el bloque directamente.

CÓMO ESTÁ ARMADO EL BLOQUE

    ... contenido del zip ...
    [ tamaño del bloque      8 bytes ]  ← APK Signing Block
    [ pares id→valor                 ]
    [ tamaño del bloque      8 bytes ]     (repetido, para poder leerlo al revés)
    [ "APK Sig Block 42"    16 bytes ]
    ... directorio central del zip ...

Dentro, el par con identificador 0x7109871a es el esquema v2 y el 0xf05368c0 el
v3. Los dos llevan, anidada, la lista de certificados del firmante. El primer
certificado es el del firmante, y su huella SHA-1 —sobre el DER tal cual— es lo
que pide Google Cloud.

    python3 huella-apk.py app.apk
"""

import hashlib
import struct
import sys

ID_V2 = 0x7109871A
ID_V3 = 0xF05368C0
MAGIC = b"APK Sig Block 42"


def bloque_de_firma(datos: bytes) -> bytes:
    """Devuelve los pares del APK Signing Block."""
    pos = datos.rfind(MAGIC)
    if pos < 0:
        raise SystemExit(
            "Este archivo no trae APK Signing Block: o no está firmado, o está "
            "firmado sólo con el esquema v1 y entonces sí sirve keytool."
        )
    # Los 8 bytes justo antes del magic repiten el tamaño del bloque; el bloque
    # empieza esos bytes más atrás, contando desde donde termina ese tamaño.
    tam = struct.unpack_from("<Q", datos, pos - 8)[0]
    inicio = pos + len(MAGIC) - 8 - tam
    if inicio < 0 or struct.unpack_from("<Q", datos, inicio)[0] != tam:
        raise SystemExit("El APK Signing Block está mal formado.")
    return datos[inicio + 8: pos - 8]


def pares(bloque: bytes):
    i = 0
    while i + 12 <= len(bloque):
        largo = struct.unpack_from("<Q", bloque, i)[0]
        ident = struct.unpack_from("<I", bloque, i + 8)[0]
        yield ident, bloque[i + 12: i + 8 + largo]
        i += 8 + largo


def secuencia(datos: bytes):
    """Recorre una secuencia de elementos con prefijo de longitud de 4 bytes."""
    i = 0
    while i + 4 <= len(datos):
        largo = struct.unpack_from("<I", datos, i)[0]
        yield datos[i + 4: i + 4 + largo]
        i += 4 + largo


def certificados(valor: bytes):
    """Saca los certificados X.509 de un bloque de firma v2 o v3.

    El anidamiento es: lista de firmantes → firmante → datos firmados →
    [digests, certificados, ...]. Los certificados son el segundo elemento.
    """
    for lista in secuencia(valor):          # lista de firmantes
        for firmante in secuencia(lista):   # cada firmante
            partes = list(secuencia(firmante))
            if not partes:
                continue
            firmados = partes[0]            # los datos firmados
            trozos = list(secuencia(firmados))
            if len(trozos) < 2:
                continue
            for cert in secuencia(trozos[1]):
                if cert[:1] == b"\x30":     # una SECUENCIA DER: es un X.509
                    yield cert


def main():
    if len(sys.argv) != 2:
        raise SystemExit("uso: huella-apk.py <archivo.apk>")

    with open(sys.argv[1], "rb") as f:
        datos = f.read()

    vistos = set()
    for ident, valor in pares(bloque_de_firma(datos)):
        if ident not in (ID_V2, ID_V3):
            continue
        esquema = "v2" if ident == ID_V2 else "v3"
        for cert in certificados(valor):
            sha1 = hashlib.sha1(cert).hexdigest().upper()
            if sha1 in vistos:
                continue
            vistos.add(sha1)
            dosp = lambda h: ":".join(h[i:i + 2] for i in range(0, len(h), 2))
            print(f"esquema {esquema}")
            print(f"  SHA1:   {dosp(sha1)}")
            print(f"  SHA256: {dosp(hashlib.sha256(cert).hexdigest().upper())}")
            print(f"  MD5:    {dosp(hashlib.md5(cert).hexdigest().upper())}")

    if not vistos:
        raise SystemExit("No se encontró ningún certificado en el bloque de firma.")


if __name__ == "__main__":
    main()
