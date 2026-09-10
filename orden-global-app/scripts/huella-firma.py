#!/usr/bin/env python3
"""
huella-firma.py — saca la huella del certificado con que está firmado un APK o
un App Bundle.

HAY DOS FORMAS DE FIRMAR, Y CADA FORMATO USA LA SUYA

Un APK moderno se firma con los esquemas v2/v3 de Android, que guardan la firma
en un bloque propio entre el contenido del zip y su directorio central. Ese
bloque es invisible para las herramientas de JAR, y por eso `keytool` responde
"Not a signed jar file" ante un APK que está perfectamente firmado.

Un `.aab` es al revés: lleva la firma vieja al estilo JAR (v1), que es
exactamente la que `keytool` sí entiende, y no tiene bloque v2.

Así que ninguna de las dos herramientas sola alcanza. Esto intenta primero el
bloque v2/v3 y, si no está, delega en `keytool`. Si fallan las dos, termina con
error — que es lo que tiene que pasar, porque una huella que no se pudo leer no
es una huella vacía: es una huella desconocida.

Comprobado contra los dos archivos reales de la 1.33.0, el APK de `preview` y el
`.aab` de `production`: devuelve la misma huella por los dos caminos, que es lo
que tenía que pasar porque los firma la misma llave.

La herramienta oficial es `apksigner`, del SDK de Android, que son cientos de
megas para leer veinte bytes, y aun asi no lee `.aab`.

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

    python3 huella-firma.py app.apk
    python3 huella-firma.py app.aab
"""

import hashlib
import struct
import subprocess
import sys

ID_V2 = 0x7109871A
ID_V3 = 0xF05368C0
MAGIC = b"APK Sig Block 42"


def bloque_de_firma(datos: bytes):
    """Devuelve los pares del APK Signing Block, o None si el archivo no trae."""
    pos = datos.rfind(MAGIC)
    if pos < 0:
        return None
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


def dosp(h: str) -> str:
    return ":".join(h[i:i + 2] for i in range(0, len(h), 2))


def por_keytool(ruta: str) -> bool:
    """La firma vieja al estilo JAR, que es la que llevan los `.aab`."""
    try:
        salida = subprocess.run(
            ["keytool", "-printcert", "-jarfile", ruta],
            capture_output=True, text=True, timeout=120,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return False

    lineas = [l.strip() for l in salida.splitlines()
              if l.strip().startswith(("SHA1:", "SHA256:", "Valid from:"))]
    if not any(l.startswith("SHA1:") for l in lineas):
        return False

    print("esquema v1 (firma al estilo JAR)")
    for l in lineas:
        print(f"  {l}")
    return True


def por_bloque(datos: bytes) -> bool:
    """Los esquemas v2/v3, que son los que llevan los APK."""
    bloque = bloque_de_firma(datos)
    if bloque is None:
        return False

    vistos = set()
    for ident, valor in pares(bloque):
        if ident not in (ID_V2, ID_V3):
            continue
        esquema = "v2" if ident == ID_V2 else "v3"
        for cert in certificados(valor):
            sha1 = hashlib.sha1(cert).hexdigest().upper()
            if sha1 in vistos:
                continue
            vistos.add(sha1)
            print(f"esquema {esquema}")
            print(f"  SHA1:   {dosp(sha1)}")
            print(f"  SHA256: {dosp(hashlib.sha256(cert).hexdigest().upper())}")
            print(f"  MD5:    {dosp(hashlib.md5(cert).hexdigest().upper())}")
    return bool(vistos)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("uso: huella-firma.py <archivo.apk|.aab>")

    ruta = sys.argv[1]
    with open(ruta, "rb") as f:
        datos = f.read()

    if por_bloque(datos):
        return
    if por_keytool(ruta):
        return

    # Terminar en error es lo correcto: una huella que no se pudo leer no es una
    # huella vacía, es una huella desconocida, y dejar pasar eso en silencio es
    # como se registra la llave equivocada en Google Cloud.
    raise SystemExit(
        f"No se pudo leer la firma de {ruta}. Ni bloque v2/v3 ni firma v1 legible "
        f"por keytool. ¿Es un archivo firmado?"
    )


if __name__ == "__main__":
    main()
