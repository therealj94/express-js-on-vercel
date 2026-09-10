#!/usr/bin/env python3
"""Sube la voz grabada al servidor y la deja servida SIN contraseña.

Dos cosas que hace aparte de copiar ficheros, y las dos importan:

1. ABRE /voz/* EN EL CADDYFILE. Sin esto, un invitado en /demo pide el audio,
   recibe un 401 con `WWW-Authenticate` y el navegador le saca su ventana de
   usuario y contraseña encima de la presentación. Ese fallo exacto ya pasó
   dos veces --primero con los temporizadores, después con /img/*-- y no va
   a pasar una tercera.

2. NO TOCA EL CADDYFILE A CIEGAS. Se guarda copia, se edita, se valida con
   `caddy validate` y solo entonces se recarga; si la validación falla, se
   restaura la copia. En ese archivo viven los hash de las contraseñas de la
   Junta: dejarlo roto deja a cuatro personas fuera.

    python3 desplegar-voz.py <directorio-con-los-mp3>
"""
import os
import json, os, sys, tarfile, time, hashlib, io, boto3

# EL SCRATCHPAD SE BUSCA, no se escribe.
#
# Aca habia una ruta absoluta con el identificador de UNA sesion de trabajo
# metido dentro. Fuera de esa sesion no existe, asi que este guion se rompia
# solo en cuanto la sesion terminaba. Lo que vive ahi son credenciales, que no
# pueden estar en el repositorio; asi que se busca donde suele estar, o se dice
# a mano con OG_SCRATCHPAD.
import glob as _glob

S = os.environ.get('OG_SCRATCHPAD') or next(
    iter(sorted(_glob.glob('/tmp/claude-*/*/*/scratchpad'))), '')
if not S:
    raise SystemExit('No encuentro la carpeta de trabajo. Pasala en OG_SCRATCHPAD.')
CUBO = 'og-5550-arranque-548380372606'
NODO = 'i-0aff688efc52ab8c8'


def espera(ssm, cid):
    for _ in range(90):
        time.sleep(4)
        o = ssm.get_command_invocation(CommandId=cid, InstanceId=NODO)
        if o['Status'] not in ('Pending', 'InProgress', 'Delayed'):
            return o
    return o


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    origen = sys.argv[1].rstrip('/')
    man = origen + '/manifiesto.json'
    if not os.path.exists(man):
        print('no hay manifiesto en', origen)
        return 1
    entradas = json.load(open(man))
    faltan = [v['f'] for v in entradas.values()
              if not os.path.exists(origen + '/' + v['f'])]
    if faltan:
        print('AVISO: %d ficheros del manifiesto no están grabados todavía.' % len(faltan))
        print('       El cerebro volverá solo a la voz del navegador en esas frases.')

    # ── el paquete
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as t:
        t.add(man, arcname='manifiesto.json')
        for v in entradas.values():
            r = origen + '/' + v['f']
            if os.path.exists(r):
                t.add(r, arcname=v['f'])
    datos = buf.getvalue()
    print('paquete: %.1f MB, %d ficheros' % (len(datos) / 1e6, len(entradas) - len(faltan)))

    k = json.load(open(S + '/aws_llaves.json'))
    ses = boto3.Session(aws_access_key_id=k['AccessKeyId'],
                        aws_secret_access_key=k['SecretAccessKey'],
                        region_name='us-east-1')
    s3, ssm = ses.client('s3'), ses.client('ssm')
    s3.put_object(Bucket=CUBO, Key='cerebro/voz.tar.gz', Body=datos)
    url = s3.generate_presigned_url('get_object',
                                    Params={'Bucket': CUBO, 'Key': 'cerebro/voz.tar.gz'},
                                    ExpiresIn=3600)

    cmds = [
        'set -e',
        'mkdir -p /srv/cerebro/voz',
        "curl -fsS '%s' -o /tmp/voz.tar.gz" % url,
        'tar xzf /tmp/voz.tar.gz -C /srv/cerebro/voz',
        'rm -f /tmp/voz.tar.gz',
        'chmod -R a+rX /srv/cerebro/voz',
        'ls /srv/cerebro/voz/*.mp3 2>/dev/null | wc -l',
        # ── el Caddyfile, con red debajo
        'cp -n /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-de-la-voz || true',
        'cp /etc/caddy/Caddyfile /tmp/Caddyfile.previo',
        'if ! grep -q "/voz/\\*" /etc/caddy/Caddyfile; then '
        '  sed -i "s|@interno not path /demo |@interno not path /voz/* /demo |" /etc/caddy/Caddyfile; '
        'fi',
        'grep -n "@interno" /etc/caddy/Caddyfile',
        'if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/tmp/val.log 2>&1; then '
        '  systemctl reload caddy && echo CADDY_OK; '
        'else '
        '  cp /tmp/Caddyfile.previo /etc/caddy/Caddyfile; echo CADDY_RESTAURADO; cat /tmp/val.log; '
        'fi',
        # ── y se comprueba de verdad, sin contraseña
        'echo -n "manifiesto sin clave: "; '
        'curl -s -o /dev/null -w "%{http_code}\\n" https://cerebro.ordenscan.com/voz/manifiesto.json',
        'echo -n "algo interno sigue cerrado: "; '
        'curl -s -o /dev/null -w "%{http_code}\\n" https://cerebro.ordenscan.com/partes.json',
    ]
    r = ssm.send_command(InstanceIds=[NODO], DocumentName='AWS-RunShellScript',
                         Parameters={'commands': cmds})
    o = espera(ssm, r['Command']['CommandId'])
    print('servidor:', o['Status'])
    print(o['StandardOutputContent'])
    if o['StandardErrorContent']:
        print('errores:', o['StandardErrorContent'][:800])

    sal = o['StandardOutputContent']
    bien = ('CADDY_OK' in sal or '/voz/*' in sal) and 'manifiesto sin clave: 200' in sal
    ok_cerrado = 'algo interno sigue cerrado: 401' in sal
    print('\nvoz pública:', 'sí' if bien else 'NO — revísalo antes de enseñar nada')
    print('lo interno sigue cerrado:', 'sí' if ok_cerrado else 'NO — PARA Y REVISA')
    return 0 if (bien and ok_cerrado) else 1


if __name__ == '__main__':
    sys.exit(main())
