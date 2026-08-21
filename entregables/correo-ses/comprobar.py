#!/usr/bin/env python3
"""¿Está el correo listo para pedir el paso a producción?

Se corre ANTES de mandar la solicitud a AWS. Un segundo rechazo cuesta más que
el primero: el revisor ve el historial, y pedir dos veces con lo mismo mal
puesto deja la cuenta marcada.

Comprueba lo que un revisor de AWS mira de verdad, midiéndolo contra la cuenta
y contra el DNS público. Nada sale de la memoria de nadie.

    AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... python3 comprobar.py
o, si hay llaves guardadas en el scratchpad, sin variables.
"""
import json
import os
import sys
import urllib.request

import boto3

DOMINIO = 'ordenglobal.org'
REMITENTE = 'correo.ordenglobal.org'
REGION = 'us-east-1'
LLAVES = ('/tmp/claude-0/-home-user-express-js-on-vercel/'
          '0391d4fe-0c9f-53b0-b60e-0030ebf74708/scratchpad/aws_llaves.json')

fallos = []
avisos = []


def ok(que, cond, extra=''):
    print(f"{'  ok  ' if cond else ' FALTA'}  {que}" + (f'\n          {extra}' if extra else ''))
    if not cond:
        fallos.append(que)


def aviso(que, extra=''):
    print(f"  ojo   {que}" + (f'\n          {extra}' if extra else ''))
    avisos.append(que)


def sesion():
    """Las llaves del archivo mandan sobre las del entorno.

    Al revés parece más razonable y es una trampa: en este contenedor el proxy
    inyecta un `AWS_ACCESS_KEY_ID=proxy-injected` que no vale para nada, y
    boto3 lo toma por bueno. El resultado es un «token inválido» que parece un
    problema de permisos cuando en realidad es una variable de más.
    """
    try:
        k = json.load(open(LLAVES))
        return boto3.Session(aws_access_key_id=k['AccessKeyId'],
                             aws_secret_access_key=k['SecretAccessKey'], region_name=REGION)
    except (OSError, KeyError, ValueError):
        return boto3.Session(region_name=REGION)


def dns(nombre, tipo):
    """Se pregunta al DNS PUBLICO, no al panel del proveedor. Lo que importa es
    lo que ve el resto del mundo, que es lo que a veces no coincide."""
    try:
        url = f'https://dns.google/resolve?name={nombre}&type={tipo}'
        with urllib.request.urlopen(url, timeout=15) as x:
            return [a['data'] for a in json.load(x).get('Answer', [])]
    except Exception:
        return []


def main():
    ses = sesion().client('sesv2')

    print('\n── LA CUENTA\n')
    cuenta = ses.get_account()
    prod = cuenta.get('ProductionAccessEnabled')
    if prod:
        print('  ok    LA CUENTA YA ESTA EN PRODUCCION. No hace falta pedir nada.')
    else:
        rev = cuenta.get('Details', {}).get('ReviewDetails', {})
        print(f"  ojo   sigue en el cajón de arena · solicitud anterior: "
              f"{rev.get('Status', 'ninguna')} {rev.get('CaseId', '')}")
        print('        En el cajón de arena solo se puede escribir a direcciones')
        print('        verificadas una por una. A un usuario de verdad no le llega nada.')
    q = cuenta.get('SendQuota', {})
    print(f"        cupo: {q.get('Max24HourSend'):.0f} al día · {q.get('MaxSendRate'):.0f} por segundo")

    print('\n── EL DOMINIO QUE FIRMA\n')
    d = ses.get_email_identity(EmailIdentity=DOMINIO)
    ok('el dominio está verificado', d.get('VerifiedForSendingStatus'))
    dk = d.get('DkimAttributes', {})
    ok('DKIM verificado y firmando',
       dk.get('Status') == 'SUCCESS' and dk.get('SigningEnabled'),
       f"estado {dk.get('Status')}")
    for t in dk.get('Tokens', []):
        r = dns(f'{t}._domainkey.{DOMINIO}', 'CNAME')
        ok(f'CNAME de DKIM publicado ({t[:12]}…)', bool(r), r[0] if r else 'no resuelve')

    print('\n── EL REMITENTE PROPIO (lo que más pesa en la solicitud)\n')
    mf = d.get('MailFromAttributes', {})
    ok('configurado en SES', mf.get('MailFromDomain') == REMITENTE,
       f"hoy: {mf.get('MailFromDomain') or 'ninguno'}")
    ok('verificado por AWS', mf.get('MailFromDomainStatus') == 'SUCCESS',
       f"estado: {mf.get('MailFromDomainStatus')} · se pone en SUCCESS solo cuando el DNS está")
    mx = dns(REMITENTE, 'MX')
    ok('MX del remitente publicado', any('amazonses' in m for m in mx),
       mx[0] if mx else 'no resuelve')
    txt = dns(REMITENTE, 'TXT')
    ok('SPF del remitente publicado', any('amazonses' in t for t in txt),
       txt[0] if txt else 'no resuelve')
    if mf.get('BehaviorOnMxFailure') != 'USE_DEFAULT_VALUE':
        aviso('si falta el DNS, SES RECHAZA el correo',
              'con USE_DEFAULT_VALUE volvería solo a amazonses.com y seguiría saliendo')

    print('\n── SPF, DMARC Y LO QUE VE EL MUNDO\n')
    spf = [t.strip('"') for t in dns(DOMINIO, 'TXT') if 'v=spf1' in t]
    ok('hay UN solo registro SPF', len(spf) == 1,
       f'hay {len(spf)}. Con dos, SPF falla en todos' if len(spf) != 1 else spf[0][:90])
    ok('el SPF incluye a Amazon SES', any('amazonses.com' in s for s in spf),
       spf[0][:90] if spf else 'no hay SPF')
    dmarc = [t.strip('"') for t in dns(f'_dmarc.{DOMINIO}', 'TXT') if 'DMARC1' in t]
    ok('hay DMARC', bool(dmarc), dmarc[0][:90] if dmarc else 'no hay')
    if dmarc and 'p=none' in dmarc[0]:
        aviso('DMARC está en p=none (solo observa, no protege)',
              'está bien para empezar. Se sube a p=quarantine cuando los informes salgan limpios')

    print('\n── REBOTES Y QUEJAS (sin esto no dan producción)\n')
    sup = cuenta.get('SuppressionAttributes', {}).get('SuppressedReasons', [])
    ok('la lista de supresión atrapa rebotes y quejas',
       'BOUNCE' in sup and 'COMPLAINT' in sup, f'activa para: {sup}')
    conj = ses.list_configuration_sets().get('ConfigurationSets', [])
    ok('hay conjunto de configuración', bool(conj), ', '.join(conj) or 'ninguno')
    avisa = False
    for c in conj:
        ev = ses.get_configuration_set_event_destinations(
            ConfigurationSetName=c).get('EventDestinations', [])
        for e in ev:
            if e.get('Enabled') and {'BOUNCE', 'COMPLAINT'} & set(e.get('MatchingEventTypes', [])):
                avisa = True
    ok('los rebotes y las quejas van a alguna parte', avisa)

    print('\n── LO QUE SE MANDA EN LA SOLICITUD\n')
    det = cuenta.get('Details', {})
    web = det.get('WebsiteURL', '')
    # El revisor comprueba que la web tenga que ver con el dominio que firma.
    # Poner una y firmar con otra es de los motivos de rechazo mas comunes.
    ok('la web declarada es del mismo dominio que firma', DOMINIO in web,
       f"declarada: {web or '(ninguna)'} · el correo sale de @{DOMINIO}")
    ok('el uso declarado es transaccional', det.get('MailType') == 'TRANSACTIONAL',
       f"declarado: {det.get('MailType')}")

    print()
    if fallos:
        print(f'{len(fallos)} cosas por resolver antes de volver a pedir:')
        for f in fallos:
            print(f'  · {f}')
    else:
        print('Todo lo que se puede comprobar desde acá está en su sitio.')
    if avisos:
        print(f'\n{len(avisos)} avisos que no bloquean:')
        for a in avisos:
            print(f'  · {a}')
    return 1 if fallos else 0


if __name__ == '__main__':
    sys.exit(main())
