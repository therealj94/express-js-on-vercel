#!/usr/bin/env python3
"""Sube el vigia del parte a Lambda y le pone sus dos disparos.

Idempotente: correrlo dos veces no duplica nada.

    ZERNIO_CLAVE=sk_... ZERNIO_CUENTA=... AURA_PARTE_PARA=504... \\
    AVISAR_A=correo@dominio python3 desplegar-vigia.py

LA CLAVE NO SE ESCRIBE EN EL REPOSITORIO. Viaja del entorno a la configuracion
de la funcion, que AWS cifra en reposo. Si no se pasa, se despliega el codigo
igual y no se toca la configuracion que ya hubiera — asi un redespliegue de
rutina no apaga el vigia por olvido.
"""
import glob as _glob
import io
import json
import os
import sys
import zipfile

import boto3
from botocore.exceptions import ClientError

S = os.environ.get('OG_SCRATCHPAD') or next(
    iter(sorted(_glob.glob('/tmp/claude-*/*/*/scratchpad'))), '')
AQUI = os.path.dirname(os.path.abspath(__file__))
REGION = 'us-east-1'
FUNCION = 'aura-vigia-parte'
ROL = 'aura-vigia-lambda'
TEMA = 'aura-vigia-avisos'

# 14:15 y 02:15 UTC = 08:15 y 20:15 de Honduras: 45 minutos despues de cada
# parte. Suficiente para que un reintento lento haya terminado, y lo bastante
# cerca para enterarse la misma manana.
DISPAROS = {'aura-vigia-manana': 'cron(15 14 * * ? *)',
            'aura-vigia-noche': 'cron(15 2 * * ? *)'}

CONFIANZA = {"Version": "2012-10-17", "Statement": [{
    "Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"}]}


def paquete():
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('vigia.py', open(os.path.join(AQUI, 'vigia.py'), 'rb').read())
    return b.getvalue()


def main():
    k = json.load(open(S + '/aws_llaves.json'))
    ses = boto3.Session(aws_access_key_id=k['AccessKeyId'],
                        aws_secret_access_key=k['SecretAccessKey'],
                        region_name=REGION)
    iam, lam = ses.client('iam'), ses.client('lambda')
    sns, ev = ses.client('sns'), ses.client('events')
    cuenta = ses.client('sts').get_caller_identity()['Account']

    tema = sns.create_topic(Name=TEMA)['TopicArn']
    print('tema de avisos:', TEMA)
    avisar_a = (os.environ.get('AVISAR_A') or '').strip()
    if avisar_a:
        ya = [s['Endpoint'] for s in
              sns.list_subscriptions_by_topic(TopicArn=tema)['Subscriptions']]
        if avisar_a not in ya:
            sns.subscribe(TopicArn=tema, Protocol='email', Endpoint=avisar_a)
            print(f'  -> {avisar_a} tiene que confirmar por correo')
        else:
            print(f'  -> {avisar_a} ya estaba')

    try:
        arn_rol = iam.get_role(RoleName=ROL)['Role']['Arn']
    except ClientError:
        arn_rol = iam.create_role(RoleName=ROL,
                                  AssumeRolePolicyDocument=json.dumps(CONFIANZA),
                                  Description='El vigia del parte de AU-RA'
                                  )['Role']['Arn']
        print('rol creado:', ROL)
    # Solo escribir su propio registro y publicar en SU tema. Nada mas: el
    # vigia no necesita leer S3, ni tocar la instancia, ni mandar correo suelto.
    iam.put_role_policy(RoleName=ROL, PolicyName='vigia-minimo',
        PolicyDocument=json.dumps({"Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Action": ["logs:CreateLogGroup",
                                           "logs:CreateLogStream", "logs:PutLogEvents"],
             "Resource": f"arn:aws:logs:{REGION}:{cuenta}:*"},
            {"Effect": "Allow", "Action": "sns:Publish", "Resource": tema}]}))

    entorno = {k2: v for k2, v in {
        'ZERNIO_CLAVE': os.environ.get('ZERNIO_CLAVE', ''),
        'ZERNIO_CUENTA': os.environ.get('ZERNIO_CUENTA', ''),
        'AURA_PARTE_PARA': os.environ.get('AURA_PARTE_PARA', ''),
        'SNS_TEMA': tema}.items() if v}

    try:
        lam.get_function(FunctionName=FUNCION)
        lam.update_function_code(FunctionName=FUNCION, ZipFile=paquete())
        lam.get_waiter('function_updated').wait(FunctionName=FUNCION)
        if entorno.get('ZERNIO_CLAVE'):
            lam.update_function_configuration(FunctionName=FUNCION,
                                              Environment={'Variables': entorno})
            lam.get_waiter('function_updated').wait(FunctionName=FUNCION)
            print('función actualizada, con configuración')
        else:
            print('función actualizada; sin ZERNIO_CLAVE no se toca lo que ya había')
    except ClientError:
        import time
        for intento in range(6):     # el rol recien creado tarda en propagarse
            try:
                lam.create_function(
                    FunctionName=FUNCION, Runtime='python3.12', Role=arn_rol,
                    Handler='vigia.handler', Code={'ZipFile': paquete()},
                    Timeout=60, MemorySize=128,
                    Environment={'Variables': entorno},
                    Description='Avisa cuando el parte de AU-RA deja de llegar')
                print('función creada:', FUNCION)
                break
            except ClientError as e:
                if intento == 5:
                    raise
                time.sleep(5)
    arn_fn = lam.get_function(FunctionName=FUNCION)['Configuration']['FunctionArn']

    for nombre, cron in DISPAROS.items():
        ev.put_rule(Name=nombre, ScheduleExpression=cron, State='ENABLED',
                    Description='Dispara el vigia del parte de AU-RA')
        try:
            lam.add_permission(FunctionName=FUNCION, StatementId=nombre + '-permiso',
                               Action='lambda:InvokeFunction',
                               Principal='events.amazonaws.com',
                               SourceArn=f'arn:aws:events:{REGION}:{cuenta}:rule/{nombre}')
        except ClientError:
            pass                      # ya estaba
        ev.put_targets(Rule=nombre, Targets=[{'Id': '1', 'Arn': arn_fn}])
        print('disparo:', nombre, cron)
    return 0


if __name__ == '__main__':
    sys.exit(main())
