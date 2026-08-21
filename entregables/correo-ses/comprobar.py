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
import socket
import struct
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


def _preguntar(ip, nombre, tipo):
    """Una consulta DNS a mano contra un servidor concreto.

    Se arma el paquete a pelo porque en este contenedor no hay `dig` ni
    `nslookup`, y meter una dependencia para tres campos de una cabecera sería
    peor. Solo entiende TXT, MX y CNAME, que es lo que hace falta.
    """
    cab = struct.pack('>HHHHHH', 0x1234, 0x0100, 1, 0, 0, 0)
    q = b''.join(bytes([len(p)]) + p.encode() for p in nombre.split('.')) + b'\x00'
    tipos = {'TXT': 16, 'MX': 15, 'CNAME': 5}
    m = cab + q + struct.pack('>HH', tipos[tipo], 1)
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(8)
    try:
        s.sendto(m, (ip, 53))
        d, _ = s.recvfrom(4096)
    finally:
        s.close()
    n = struct.unpack('>H', d[6:8])[0]
    i, fuera = len(m), []
    for _ in range(n):
        while d[i] != 0:
            if d[i] & 0xC0:
                i += 2
                break
            i += 1 + d[i]
        else:
            i += 1
        t, _c, _ttl, dl = struct.unpack('>HHIH', d[i:i + 10])
        i += 10
        if t == 16:                       # TXT
            j, txt = i, b''
            while j < i + dl:
                lon = d[j]
                txt += d[j + 1:j + 1 + lon]
                j += 1 + lon
            fuera.append(txt.decode('utf8', 'replace'))
        elif t == 15:                     # MX
            pref = struct.unpack('>H', d[i:i + 2])[0]
            fuera.append(f'{pref} (respuesta del servidor autoritativo)')
        elif t == 5:                      # CNAME
            fuera.append('(cname presente)')
        i += dl
    return fuera


def autoritativo(nombre, tipo):
    """Le pregunta a los servidores que MANDAN en la zona, no a un caché.

    Un resolutor público guarda la copia vieja hasta que vence su TTL, que acá
    son cuatro horas. Sin esto, un registro recién puesto aparece como si
    faltara y se pierde media tarde buscando un problema que no existe.
    """
    raiz = '.'.join(nombre.split('.')[-2:])
    ns = []
    try:
        u = f'https://dns.google/resolve?name={raiz}&type=NS'
        with urllib.request.urlopen(u, timeout=15) as x:
            ns = [a['data'].rstrip('.') for a in json.load(x).get('Answer', [])]
    except Exception:
        return []
    for n in ns:
        try:
            u = f'https://dns.google/resolve?name={n}&type=A'
            with urllib.request.urlopen(u, timeout=15) as x:
                a = json.load(x).get('Answer', [])
            if not a:
                continue
            r = _preguntar(a[0]['data'], nombre, tipo)
            if r:
                return r
        except Exception:
            continue
    return []


def dns(nombre, tipo):
    """Se pregunta al DNS PUBLICO, no al panel del proveedor. Lo que importa es
    lo que ve el resto del mundo, que es lo que a veces no coincide.

    Con `cd=1` y sin caché: un resolutor público puede tener guardada la copia
    vieja hasta que venza su TTL, y entonces un registro recién puesto aparece
    como si faltara. Eso hace perder media hora buscando un problema que no
    existe, así que se pregunta con el indicador de no-caché y, si hay dudas,
    se repite una vez.
    """
    for intento in (0, 1):
        try:
            url = (f'https://dns.google/resolve?name={nombre}&type={tipo}'
                   f'&cd=1&do=0&_={intento}')
            with urllib.request.urlopen(url, timeout=15) as x:
                r = [a['data'] for a in json.load(x).get('Answer', [])]
            if r:
                return r
        except Exception:
            pass
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
    # Si el caché público todavía sirve la copia vieja, se le pregunta a quien
    # manda en la zona antes de decir que falta algo.
    if not any('amazonses.com' in s for s in spf):
        aut = [t for t in autoritativo(DOMINIO, 'TXT') if 'v=spf1' in t]
        if aut:
            if any('amazonses.com' in a for a in aut):
                print('  ojo   el resolutor público todavía tiene la copia vieja en caché;')
                print('        el servidor autoritativo ya sirve la nueva. Se toma esa.')
            spf = aut
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
    if DOMINIO in web:
        print(f'  ok    la web declarada es del mismo dominio que firma\n          {web}')
    else:
        aviso('AL LLENAR EL FORMULARIO: poné https://www.ordenglobal.org en «Website URL»',
              f"la vez pasada decía {web or '(nada)'}, y el correo sale de @{DOMINIO}. "
              f"Es el campo que más pesa en un rechazo.")
    ok('el uso declarado es transaccional', det.get('MailType') == 'TRANSACTIONAL',
       f"declarado: {det.get('MailType')}")

    # ── EL VEREDICTO ──────────────────────────────────────────────────────
    #
    # Una lista de cosas no es una respuesta. La única decisión que hay que
    # tomar es «¿pido ya o espero?», y eso es lo que tiene que contestar esto.
    # Un comprobador que enumera y no concluye deja el trabajo a medias.
    print('\n' + '─' * 62)
    if prod:
        print('\n  YA ESTA. La cuenta manda correo a cualquiera.\n')
        return 0

    # Lo que de verdad impide pedir, separado de lo que solo suma.
    bloquea = [f for f in fallos if 'verificado por AWS' not in f]
    espera = [f for f in fallos if 'verificado por AWS' in f]

    if bloquea:
        print('\n  TODAVIA NO PIDAS. Falta esto:\n')
        for f in bloquea:
            print(f'    · {f}')
    elif espera:
        print('\n  CASI. El DNS está puesto y AWS todavía no lo revisó.')
        print('  Su revisión es automática y puede tardar horas.')
        print('\n  Se puede pedir igual, pero conviene esperar a que el remitente')
        print('  propio diga SUCCESS: con eso la solicitud llega más fuerte, y un')
        print('  segundo rechazo cuesta más que esperar una tarde.')
    else:
        print('\n  LISTO PARA PEDIR. Todo lo comprobable está en su sitio.')
        print('  Seguí los pasos de solicitud-produccion.md.')

    if avisos:
        print('\n  Avisos que no bloquean:')
        for a in avisos:
            print(f'    · {a}')
    print()
    return 1 if bloquea else 0


if __name__ == '__main__':
    sys.exit(main())
