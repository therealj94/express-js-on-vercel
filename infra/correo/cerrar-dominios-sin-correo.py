#!/usr/bin/env python3
"""Cerrar por correo los dominios que NO mandan correo.

══ POR QUE ═══════════════════════════════════════════════════════════════════

Un dominio sin SPF ni DMARC no dice nada sobre quien puede escribir en su
nombre, y el que recibe no tiene con que rechazar a un impostor. Cualquiera
puede mandar un correo que diga venir de ordenscan.com pidiendo una semilla,
una clave o un pago, y le llega a la bandeja de entrada de la gente como si
fuera nuestro.

El 26 de agosto ocho de nuestros diez dominios estaban asi. Solo DOS mandan
correo de verdad —son las unicas identidades verificadas en SES—:

    ordenglobal.org   manda (info@ordenglobal.org)   → NO SE TOCA
    vetawallet.com    recibe, no manda               → ya estaba cerrado

vetawallet.com es el modelo a copiar: «v=spf1 -all» dice «de aqui no sale
correo, ninguno», y «p=reject» le pide al que recibe que tire lo que se haga
pasar por el. Un dominio que no manda correo no pierde NADA con eso; solo se
vuelve inutil para suplantarlo.

ordenglobal.org queda fuera a proposito: SI manda correo, y endurecerle el
DMARC puede tumbar correo legitimo. Esa decision es de Jose, no mia.

══ VOLVER ATRAS ══════════════════════════════════════════════════════════════

Cada registro se crea con UPSERT. Para deshacerlo se borra el TXT del dominio
y el de _dmarc.<dominio> en Route53; no hay nada mas.

    python3 cerrar-dominios-sin-correo.py           # solo dice que haria
    python3 cerrar-dominios-sin-correo.py --aplicar # lo hace
"""
import json, os, pathlib, sys
import boto3

D = pathlib.Path(os.environ.get('OG_SECRETOS', pathlib.Path.home() / '.og-secretos'))

# Los que SI mandan correo. Tocarles el SPF puede dejar a gente sin recibir lo
# que le mandamos, asi que este guion no los mira siquiera.
MANDAN_CORREO = {'ordenglobal.org'}

SPF = '"v=spf1 -all"'
DMARC = '"v=DMARC1; p=reject; sp=reject; rua=mailto:admin@ordenglobal.org; fo=1"'


def credenciales():
    s = json.loads((D / 'aws_temp_session.json').read_text())
    return dict(aws_access_key_id=s['AccessKeyId'],
                aws_secret_access_key=s['SecretAccessKey'],
                aws_session_token=s['SessionToken'])


def main(aplicar):
    r53 = boto3.client('route53', **credenciales())
    for z in r53.list_hosted_zones()['HostedZones']:
        dom, zid = z['Name'].rstrip('.'), z['Id']
        if dom in MANDAN_CORREO:
            print(f'{dom}: manda correo — no se toca')
            continue

        # Se mira lo que YA hay. Si un dominio tiene un SPF puesto es porque
        # alguien lo puso por algo, y pisarlo a ciegas podria cortarle el
        # correo a algo que no conozco.
        tiene = {'spf': None, 'dmarc': None}
        for rr in r53.list_resource_record_sets(HostedZoneId=zid, MaxItems='200')['ResourceRecordSets']:
            if rr['Type'] != 'TXT':
                continue
            val = ' '.join(x['Value'] for x in rr.get('ResourceRecords', []))
            if rr['Name'].rstrip('.') == dom and 'spf1' in val:
                tiene['spf'] = val
            if rr['Name'].startswith('_dmarc'):
                tiene['dmarc'] = val

        faltan = []
        if not tiene['spf']:
            faltan.append(('TXT', dom, SPF))
        if not tiene['dmarc']:
            faltan.append(('TXT', f'_dmarc.{dom}', DMARC))

        if not faltan:
            print(f'{dom}: ya estaba cerrado')
            continue

        print(f'{dom}: falta ' + ', '.join(n for _, n, _ in faltan))
        if not aplicar:
            continue

        r53.change_resource_record_sets(HostedZoneId=zid, ChangeBatch={
            'Comment': 'cerrar dominio que no manda correo',
            'Changes': [{'Action': 'UPSERT',
                         'ResourceRecordSet': {'Name': n, 'Type': t, 'TTL': 3600,
                                               'ResourceRecords': [{'Value': v}]}}
                        for t, n, v in faltan]})
        print(f'   puesto')


if __name__ == '__main__':
    main('--aplicar' in sys.argv)
