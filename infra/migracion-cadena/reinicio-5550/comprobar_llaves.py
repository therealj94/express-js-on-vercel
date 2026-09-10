#!/usr/bin/env python3
"""Comprueba que las siete llaves respaldadas son las de los siete validadores.

Deriva la direccion de cada copia de S3 y la compara con el conjunto QBFT que
la cadena publica. NUNCA imprime la llave ni ninguna huella de ella: solo la
direccion, que es publica.

La leccion del corte anterior: un respaldo que no se comprueba no es un
respaldo. Aquella vez las llaves salieron truncadas a 62 caracteres y nadie
lo habria sabido hasta necesitarlas.
"""
import io, json, pathlib, sys
import boto3, coincurve
from Crypto.Hash import keccak

D = pathlib.Path(__file__).parent
sys.path.insert(0, str(D))
from ssm import credenciales

CUBO = 'og-5550-llaves-validadores-548380372606'
PREFIJO = '2026-08-20/'

VALIDADORES = {
    '0x453493fcf778f133c51505cb81397f08850fc12e': 'node7',
    '0x48ccec9a54b9357623458f26afadcd7412a6a833': 'node4',
    '0x4c03eb38c7dc49eed7784c323089a4af2c698036': 'node2',
    '0x65f987264bd77c3a094badfd88e4ba84c0b36382': 'node5',
    '0x69e8a7b25586511a0c14430b45100e9439aae36c': 'node3',
    '0xbc820391f2a8ae402d00ef8bf4d0ec09ea0caf2a': 'node1',
    '0xc548464725d5fd4a15b882a221da67b9cfd29514': 'node6',
}


def direccion_de(privada_bytes):
    pub = coincurve.PublicKey.from_valid_secret(privada_bytes).format(compressed=False)[1:]
    h = keccak.new(digest_bits=256); h.update(pub)
    return '0x' + h.hexdigest()[-40:]


def normalizar(crudo):
    """El respaldo trae dos formatos: con 0x y sin el. Los dos son validos;
       lo que NO seria valido es que no midan 32 bytes."""
    t = crudo.decode('ascii', 'ignore').strip()
    if t.startswith('0x') or t.startswith('0X'):
        t = t[2:]
    b = bytes.fromhex(t)
    if len(b) != 32:
        raise ValueError(f'la llave mide {len(b)} bytes, deberia medir 32')
    return b


s3 = boto3.client('s3', region_name='us-east-1', **credenciales())
print(f"{'archivo':<14} {'bytes':>6}  {'direccion derivada':<44} veredicto")
bien = 0
for n in range(1, 8):
    clave = f'{PREFIJO}node{n}.key'
    buf = io.BytesIO()
    s3.download_fileobj(CUBO, clave, buf)
    crudo = buf.getvalue()
    try:
        d = direccion_de(normalizar(crudo))
    except Exception as e:
        print(f'node{n}.key      {len(crudo):>6}  {"-":<44} NO SIRVE: {e}')
        continue
    quien = VALIDADORES.get(d)
    ok = quien == f'node{n}'
    bien += ok
    print(f'node{n}.key      {len(crudo):>6}  {d:<44} '
          f'{"OK, es " + quien if ok else ("es " + quien if quien else "NO ES NINGUN VALIDADOR")}')
print(f'\nllaves que sirven: {bien} de 7')
sys.exit(0 if bien == 7 else 1)
