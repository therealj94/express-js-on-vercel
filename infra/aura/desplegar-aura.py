#!/usr/bin/env python3
"""Sube AU-RA a su maquina y la deja corriendo.

Mismo molde que `desplegar-mensajes.py`: S3 con URL firmada + SSM. El nodo no
tiene permisos de S3 y no los necesita — la firma viaja en la URL y muere en
media hora.

SE SUBEN LOS CUATRO ARCHIVOS, SIEMPRE. `asistente.py` importa `candado`, `oido`
y `whatsapp` arriba del todo: si uno se queda viejo o falta, el servicio no
arranca y revienta con ImportError antes de la primera linea util. Subir solo
el que cambio es la clase de atajo que deja el servicio caido un domingo.

LA CLAVE DE WHATSAPP SE LEE DEL ENTORNO Y NUNCA DEL REPOSITORIO:

    ZERNIO_CLAVE=sk_... ZERNIO_CUENTA=... python3 desplegar-aura.py

Va a parar a /etc/aura-whatsapp.env con permisos 600, y la unidad la lee desde
ahi con `EnvironmentFile=-`. No se escribe dentro del `.service` a proposito:
`systemctl cat aura` imprime la unidad entera y la lee cualquiera que entre a
la maquina.

Si no se pasa la clave, se despliega el codigo igual y WhatsApp queda como
este: lo que ya hubiera en /etc/aura-whatsapp.env no se toca. Asi un despliegue
de rutina no apaga WhatsApp por olvido.
"""
import glob as _glob
import json
import os
import sys
import time

import boto3

# El scratchpad se BUSCA, no se escribe: ahi viven credenciales y no pueden
# estar en el repositorio. Misma nota que en desplegar-mensajes.py.
S = os.environ.get('OG_SCRATCHPAD') or next(
    iter(sorted(_glob.glob('/tmp/claude-*/*/*/scratchpad'))), '')
if not S:
    raise SystemExit('No encuentro la carpeta de trabajo. Pasala en OG_SCRATCHPAD.')

AQUI = os.path.dirname(os.path.abspath(__file__))
CUBO = 'og-5550-arranque-548380372606'
NODO = 'i-02653feadc919d3a4'          # aura-gpu, us-east-1
ARCHIVOS = ['asistente.py', 'candado.py', 'oido.py', 'whatsapp.py',
            'guardia.py', 'registro.py', 'guion.py']

# El prompt y las fichas viajan con el codigo, y no es un detalle: la voz de
# AU-RA y lo que SABE se cambian ahi, no en el codigo. Subir solo los .py
# dejaba el arreglo de una alucinacion sin desplegar — que fue exactamente lo
# que paso con lo de la SEC. Las fichas no viven en esta carpeta: son las
# mismas que usa el cerebro.
LADO = {
    'PROMPT-AURA.md': os.path.join(AQUI, 'PROMPT-AURA.md'),
    'saber.json': os.path.abspath(
        os.path.join(AQUI, '..', 'cerebro', 'conocimiento', 'saber.json')),
}

# El complemento de la unidad. Se pone como drop-in y no reescribiendo el
# `.service`: el original lo escribio `instalar-en-nodo.sh` y pisarlo desde
# aqui haria que dos sitios distintos manden sobre lo mismo.
DROPIN = """[Service]
EnvironmentFile=-/etc/aura-whatsapp.env
"""


def espera(ssm, cid):
    o = None
    for _ in range(45):
        time.sleep(4)
        o = ssm.get_command_invocation(CommandId=cid, InstanceId=NODO)
        if o['Status'] not in ('Pending', 'InProgress', 'Delayed'):
            return o
    return o


def main():
    k = json.load(open(S + '/aws_llaves.json'))
    ses = boto3.Session(aws_access_key_id=k['AccessKeyId'],
                        aws_secret_access_key=k['SecretAccessKey'],
                        region_name='us-east-1')
    s3, ssm = ses.client('s3'), ses.client('ssm')

    urls = {}
    fuentes = {n: os.path.join(AQUI, n) for n in ARCHIVOS}
    fuentes.update(LADO)
    for nombre, ruta in fuentes.items():
        clave = 'aura/' + nombre
        s3.put_object(Bucket=CUBO, Key=clave, Body=open(ruta, 'rb').read())
        urls[nombre] = s3.generate_presigned_url(
            'get_object', Params={'Bucket': CUBO, 'Key': clave}, ExpiresIn=1800)
        print('subido', nombre)

    s3.put_object(Bucket=CUBO, Key='aura/whatsapp.conf', Body=DROPIN.encode())
    url_dropin = s3.generate_presigned_url(
        'get_object', Params={'Bucket': CUBO, 'Key': 'aura/whatsapp.conf'},
        ExpiresIn=1800)

    cmds = ['set -e', 'mkdir -p /srv/aura']

    # El prompt y las fichas primero, con su propia comprobacion: un JSON roto
    # o un prompt sin su bloque dejan a AU-RA sin arrancar, y es mejor que se
    # note aqui que en el reinicio.
    cmds += [
        f'curl -sS --fail -o /srv/aura/saber.json.nuevo "{urls["saber.json"]}"',
        'python3 -c "import json,sys; json.load(open(\'/srv/aura/saber.json.nuevo\'))"',
        'mv /srv/aura/saber.json.nuevo /srv/aura/saber.json',
        f'curl -sS --fail -o /srv/aura/PROMPT-AURA.md.nuevo "{urls["PROMPT-AURA.md"]}"',
        'grep -q \'```\' /srv/aura/PROMPT-AURA.md.nuevo',
        'mv /srv/aura/PROMPT-AURA.md.nuevo /srv/aura/PROMPT-AURA.md',
    ]

    for nombre in ARCHIVOS:
        # A un temporal primero y se mueve: si la descarga se corta a la mitad,
        # el archivo bueno sigue en su sitio y el servicio sigue de pie.
        cmds += [f'curl -sS --fail -o /srv/aura/{nombre}.nuevo "{urls[nombre]}"',
                 f'python3 -c "import ast,sys; ast.parse(open(\'/srv/aura/{nombre}.nuevo\').read())"',
                 f'mv /srv/aura/{nombre}.nuevo /srv/aura/{nombre}']

    cmds += ['mkdir -p /etc/systemd/system/aura.service.d',
             f'curl -sS --fail -o /etc/systemd/system/aura.service.d/whatsapp.conf "{url_dropin}"']

    clave = (os.environ.get('ZERNIO_CLAVE') or '').strip()
    cuenta = (os.environ.get('ZERNIO_CUENTA') or '').strip()
    if clave and cuenta:
        # `install -m 600` crea el archivo YA con los permisos puestos. Escribir
        # primero y hacer chmod despues deja una ventana en la que la clave es
        # legible por cualquiera que este en la maquina.
        cmds += [
            'install -m 600 /dev/null /etc/aura-whatsapp.env',
            f"printf 'ZERNIO_CLAVE=%s\\nZERNIO_CUENTA=%s\\n' '{clave}' '{cuenta}'"
            ' > /etc/aura-whatsapp.env',
        ]
        print('la clave de WhatsApp se escribe en el nodo (600)')
    else:
        print('sin ZERNIO_CLAVE en el entorno: no se toca lo que ya haya en el nodo')

    cmds += [
        'systemctl daemon-reload',
        'systemctl restart aura',
        'sleep 8',
        'systemctl is-active aura',
        # Lo que de verdad se quiere ver: que arranco y que dice de WhatsApp.
        'journalctl -u aura -n 12 --no-pager | tail -12',
    ]

    r = ssm.send_command(InstanceIds=[NODO], DocumentName='AWS-RunShellScript',
                         Parameters={'commands': cmds})
    o = espera(ssm, r['Command']['CommandId'])
    print('\n== estado:', o['Status'], '==')
    print(o.get('StandardOutputContent', '')[-2500:])
    err = o.get('StandardErrorContent', '')
    if err.strip():
        print('== errores ==')
        print(err[-1500:])
    return 0 if o['Status'] == 'Success' else 1


if __name__ == '__main__':
    sys.exit(main())
