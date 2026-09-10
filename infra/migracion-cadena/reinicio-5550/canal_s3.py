#!/usr/bin/env python3
"""Subir un archivo desde un nodo a S3 sin darle permisos al nodo.

El rol de las maquinas (EC2-SSM-Core) no puede escribir en S3, y ampliarselo
para un respaldo seria dejar abierto lo que solo hace falta un rato. En vez de
eso se firma una URL aqui, con las credenciales de esta sesion, y el nodo
sube con un PUT a ciegas: no puede listar, ni leer, ni tocar otra clave.

    subir(nodo, ruta_en_el_nodo, clave_en_s3)  -> descarga tambien la copia
"""
import json, os, pathlib, sys
import boto3

# Donde vive la sesion temporal de AWS. No va en el repositorio: se pasa por
# OG_SECRETOS, y por eso este guion sirve igual desde otra maquina.
D = pathlib.Path(os.environ.get('OG_SECRETOS', pathlib.Path.home() / '.og-secretos'))
CUBO = 'og-5550-arranque-548380372606'
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from ssm import correr, credenciales


def cliente():
    return boto3.client('s3', region_name='us-east-1', **credenciales())


def subir(nodo, ruta, clave, espera=900):
    """El nodo sube `ruta` a s3://CUBO/clave. Devuelve (tamano, etag)."""
    s3 = cliente()
    url = s3.generate_presigned_url('put_object',
                                    Params={'Bucket': CUBO, 'Key': clave},
                                    ExpiresIn=3600)
    cmd = (f"curl -sS --fail-with-body -X PUT -T '{ruta}' '{url}' "
           f"-o /tmp/subida.log -w 'http=%{{http_code}} subidos=%{{size_upload}}\\n' "
           f"&& md5sum '{ruta}'")
    est, out, err, cod = correr(nodo, cmd, espera=espera)
    if est != 'Success':
        raise SystemExit(f'no subio: estado={est} codigo={cod}\n{out}\n{err}')
    print(out.strip())
    h = s3.head_object(Bucket=CUBO, Key=clave)
    return h['ContentLength'], h['ETag'].strip('"')


def bajar(clave, destino):
    p = pathlib.Path(destino)
    p.parent.mkdir(parents=True, exist_ok=True)
    cliente().download_file(CUBO, clave, str(p))
    return p.stat().st_size


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('uso: canal_s3.py <nodo> <ruta-en-el-nodo> <clave-s3>')
    tam, etag = subir(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f'en s3: {tam:,} bytes  etag={etag}')
