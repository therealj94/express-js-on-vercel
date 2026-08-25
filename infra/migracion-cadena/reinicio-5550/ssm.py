#!/usr/bin/env python3
"""Correr un comando en un nodo por SSM y devolver su salida.

    python3 ssm.py <nodo|id> "<comando>"

Los nombres cortos (node1..node7, testnet2, testnet3) se resuelven a su id y
su region. Espera a que termine y devuelve el codigo de salida del comando,
no el de SSM: si el comando falla, este guion falla.
"""
import json, os, pathlib, sys, time
import boto3

# Donde vive la sesion temporal de AWS. No va en el repositorio: se pasa por
# OG_SECRETOS, y por eso este guion sirve igual desde otra maquina.
D = pathlib.Path(os.environ.get('OG_SECRETOS', pathlib.Path.home() / '.og-secretos'))

NODOS = {
    'node1': ('i-0260fc386a911acec', 'us-east-1'),
    'node2': ('i-095947b80eea9d321', 'us-east-2'),
    'node3': ('i-0d13f09e3fcce722a', 'us-east-1'),
    'node4': ('i-0e9e55a9df0cd6ce7', 'us-east-2'),
    'node5': ('i-0fddf5712376e5b2e', 'us-east-1'),
    'node6': ('i-0bf474425fe5e635b', 'us-east-1'),
    'node7': ('i-00fd699595da41ef4', 'us-east-1'),
    'testnet2': ('i-0aff688efc52ab8c8', 'us-east-1'),
    'testnet3': ('i-09a424b31734ddb48', 'us-east-1'),
}


def credenciales():
    s = json.loads((D / 'aws_temp_session.json').read_text())
    return dict(aws_access_key_id=s['AccessKeyId'],
                aws_secret_access_key=s['SecretAccessKey'],
                aws_session_token=s['SessionToken'])


def correr(nodo, comando, espera=180):
    iid, region = NODOS.get(nodo, (nodo, 'us-east-1'))
    ssm = boto3.client('ssm', region_name=region, **credenciales())
    r = ssm.send_command(InstanceIds=[iid],
                         DocumentName='AWS-RunShellScript',
                         Parameters={'commands': [comando],
                                     'executionTimeout': [str(espera)]})
    cid = r['Command']['CommandId']
    t0 = time.time()
    while time.time() - t0 < espera + 30:
        time.sleep(2)
        try:
            inv = ssm.get_command_invocation(CommandId=cid, InstanceId=iid)
        except ssm.exceptions.InvocationDoesNotExist:
            continue
        if inv['Status'] in ('Pending', 'InProgress', 'Delayed'):
            continue
        return inv['Status'], inv.get('StandardOutputContent', ''), \
            inv.get('StandardErrorContent', ''), inv.get('ResponseCode', -1)
    return 'Timeout', '', 'el comando no termino a tiempo', -1


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    est, out, err, cod = correr(sys.argv[1], sys.argv[2])
    if out:
        print(out, end='')
    if err:
        print('--- stderr ---', file=sys.stderr)
        print(err, end='', file=sys.stderr)
    if est != 'Success':
        print(f'[{sys.argv[1]}] estado={est} codigo={cod}', file=sys.stderr)
        sys.exit(1 if cod in (0, -1) else cod)
