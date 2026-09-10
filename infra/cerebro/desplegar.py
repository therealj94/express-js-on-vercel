#!/usr/bin/env python3
# Sube el cerebro al servidor y COMPRUEBA que llego.
#
# Lee desde /home/user/express-js-on-vercel, el repositorio principal, no desde
# el arbol de trabajo temporal: ese se ha borrado cinco veces en esta sesion.
import os
import json, time, boto3, hashlib

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
REPO = '/home/user/express-js-on-vercel/infra/cerebro'
CUBO = 'og-5550-arranque-548380372606'
NODO = 'i-0aff688efc52ab8c8'

k = json.load(open(S + '/aws_llaves.json'))
ses = boto3.Session(aws_access_key_id=k['AccessKeyId'],
                    aws_secret_access_key=k['SecretAccessKey'],
                    region_name='us-east-1')
s3, ssm = ses.client('s3'), ses.client('ssm')

cmds, esperado = [], {}
for f in ('index.html', 'informe.json'):
    datos = open(REPO + '/' + f, 'rb').read()
    esperado[f] = hashlib.md5(datos).hexdigest()
    print('%-14s md5 local %s' % (f, esperado[f]))
    s3.put_object(Bucket=CUBO, Key='cerebro/' + f, Body=datos)
    url = s3.generate_presigned_url('get_object',
                                    Params={'Bucket': CUBO, 'Key': 'cerebro/' + f},
                                    ExpiresIn=1800)
    cmds.append("curl -fsS '%s' -o /srv/cerebro/%s" % (url, f))
cmds.append('md5sum /srv/cerebro/index.html /srv/cerebro/informe.json')

r = ssm.send_command(InstanceIds=[NODO], DocumentName='AWS-RunShellScript',
                     Parameters={'commands': cmds})
cid = r['Command']['CommandId']
for _ in range(30):
    time.sleep(4)
    o = ssm.get_command_invocation(CommandId=cid, InstanceId=NODO)
    if o['Status'] not in ('Pending', 'InProgress', 'Delayed'):
        break

salida = o['StandardOutputContent'] or ''
print('servidor:', o['Status'])
faltan = [f for f, h in esperado.items() if h not in salida]
print('coinciden' if not faltan else 'NO COINCIDEN: ' + ', '.join(faltan))
