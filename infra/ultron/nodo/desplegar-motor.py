#!/usr/bin/env python3
"""Pone (o actualiza) el motor de ULTRON en el nodo de AU-RA, y le da a ULTRON
en Heroku lo que necesita para hablarle: la URL, el certificado y el secreto.

  python3 infra/ultron/nodo/desplegar-motor.py

Igual que desplegar-aura.py: los archivos suben al cubo, el nodo los baja con
una URL firmada de 30 minutos, y todo corre por SSM — sin SSH, sin puertos
nuevos para nosotros. Lo único que se abre en el grupo de seguridad es el
puerto del motor (8443), que exige TLS y secreto.

El SECRETO nunca se imprime: se lee del nodo por SSM y se escribe en Heroku
por la API, y de una a otra pasa solo por la memoria de este proceso.
"""

import json
import os
import sys
import time
import urllib.request

import boto3

S = os.environ.get('OG_SCRATCHPAD') or next(
    (p for p in [os.path.expanduser('~/scratchpad'),
                 '/tmp/claude-0/-home-user-express-js-on-vercel/0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad']
     if os.path.exists(os.path.join(p, 'aws_llaves.json'))), None)
if not S:
    sys.exit('no encuentro aws_llaves.json (OG_SCRATCHPAD)')

AQUI = os.path.dirname(os.path.abspath(__file__))
NODO = 'i-06530893af0dd0638'          # aura-gpu-a10g, us-east-1
CUBO = 'og-5550-arranque-548380372606'
PUERTO = 8443
MODELO = os.environ.get('ULTRON_MOTOR_MODELO', 'qwen2.5:14b')
CTX = os.environ.get('ULTRON_MOTOR_CTX', '12288')
HEROKU_APP = os.environ.get('HEROKU_APP', 'ultron-fp')
ARCHIVOS = ['ultron-motor.py', 'ultron-motor.service', 'instalar-motor.sh']


def espera(ssm, cid, tope=240):
    t0 = time.time()
    while time.time() - t0 < tope:
        time.sleep(3)
        o = ssm.get_command_invocation(CommandId=cid, InstanceId=NODO)
        if o['Status'] not in ('Pending', 'InProgress', 'Delayed'):
            return o
    return o


def main():
    k = json.load(open(S + '/aws_llaves.json'))
    ses = boto3.Session(aws_access_key_id=k['AccessKeyId'], aws_secret_access_key=k['SecretAccessKey'],
                        region_name='us-east-1')
    s3, ssm, ec2 = ses.client('s3'), ses.client('ssm'), ses.client('ec2')

    inst = ec2.describe_instances(InstanceIds=[NODO])['Reservations'][0]['Instances'][0]
    ip = inst['PublicIpAddress']
    sg = inst['SecurityGroups'][0]['GroupId']
    print(f'nodo {NODO} · ip {ip} · grupo {sg}')

    # 1. el puerto del motor, abierto (idempotente)
    try:
        ec2.authorize_security_group_ingress(GroupId=sg, IpPermissions=[{
            'IpProtocol': 'tcp', 'FromPort': PUERTO, 'ToPort': PUERTO,
            'IpRanges': [{'CidrIp': '0.0.0.0/0', 'Description': 'ULTRON motor (TLS + secreto)'}]}])
        print(f'puerto {PUERTO} abierto en {sg}')
    except ec2.exceptions.ClientError as e:
        if 'InvalidPermission.Duplicate' not in str(e):
            raise
        print(f'puerto {PUERTO} ya estaba abierto')

    # 2. los archivos, al cubo y de ahí al nodo
    urls = {}
    for n in ARCHIVOS:
        clave = 'ultron/' + n
        s3.put_object(Bucket=CUBO, Key=clave, Body=open(os.path.join(AQUI, n), 'rb').read())
        urls[n] = s3.generate_presigned_url('get_object', Params={'Bucket': CUBO, 'Key': clave}, ExpiresIn=1800)
        print('subido', n)

    cmds = ['set -e', 'mkdir -p /tmp/ultron-motor']
    for n in ARCHIVOS:
        cmds.append(f'curl -sS --fail -o /tmp/ultron-motor/{n} "{urls[n]}"')
    cmds += [f'bash /tmp/ultron-motor/instalar-motor.sh {ip} {MODELO} {CTX}',
             'rm -rf /tmp/ultron-motor']
    r = ssm.send_command(InstanceIds=[NODO], DocumentName='AWS-RunShellScript',
                         Parameters={'commands': cmds})
    o = espera(ssm, r['Command']['CommandId'])
    salida = o.get('StandardOutputContent', '')
    print('== instalación:', o['Status'], '==')
    print('\n'.join(l for l in salida.split('\n') if 'BEGIN CERT' not in l and 'END CERT' not in l and not l.startswith('M') and len(l) < 120)[-1200:])
    if o['Status'] != 'Success':
        print(o.get('StandardErrorContent', '')[-1500:])
        sys.exit(1)

    # el certificado, del texto que imprimió el instalador
    ini, fin = salida.find('-----BEGIN CERTIFICATE-----'), salida.find('-----END CERTIFICATE-----')
    if ini < 0 or fin < 0:
        sys.exit('el instalador no imprimió el certificado')
    cert = salida[ini:fin + len('-----END CERTIFICATE-----')] + '\n'

    # 3. el secreto, del nodo a Heroku sin pasar por ninguna pantalla
    r = ssm.send_command(InstanceIds=[NODO], DocumentName='AWS-RunShellScript',
                         Parameters={'commands': ["grep '^ULTRON_MOTOR_SECRETO=' /etc/ultron-motor.env | cut -d= -f2-"]})
    o = espera(ssm, r['Command']['CommandId'], 60)
    secreto = o.get('StandardOutputContent', '').strip()
    if len(secreto) < 24:
        sys.exit('no pude leer el secreto del nodo')

    llave_heroku = (os.environ.get('HEROKU_API_KEY') or '').strip()
    if not llave_heroku:
        print('sin HEROKU_API_KEY: no toco Heroku. Poné a mano ULTRON_NODO_URL, ULTRON_NODO_CERT y ULTRON_NODO_SECRETO.')
    else:
        vars_ = {'ULTRON_NODO_URL': f'https://{ip}:{PUERTO}', 'ULTRON_NODO_CERT': cert,
                 'ULTRON_NODO_SECRETO': secreto, 'ULTRON_CEREBRO': os.environ.get('ULTRON_CEREBRO', 'nodo')}
        req = urllib.request.Request(f'https://api.heroku.com/apps/{HEROKU_APP}/config-vars', method='PATCH',
                                     data=json.dumps(vars_).encode(),
                                     headers={'Accept': 'application/vnd.heroku+json; version=3',
                                              'Authorization': 'Bearer ' + llave_heroku,
                                              'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            puestas = json.load(resp)
        print('Heroku:', ' '.join(sorted(k for k in puestas if k.startswith('ULTRON_NODO') or k == 'ULTRON_CEREBRO')))

    # 4. ¿contesta desde afuera, con el certificado y el secreto?
    import ssl
    ctx = ssl.create_default_context(cadata=cert)
    req = urllib.request.Request(f'https://{ip}:{PUERTO}/salud', headers={'x-ultron-secreto': secreto})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        print('/salud desde afuera:', resp.read().decode()[:300])
    print(f'\nmotor listo en https://{ip}:{PUERTO}')


if __name__ == '__main__':
    main()
