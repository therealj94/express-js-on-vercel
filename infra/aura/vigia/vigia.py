# El vigia del parte. Corre en Lambda, fuera del nodo, dos veces al dia.
#
# ── POR QUE EXISTE ──────────────────────────────────────────────────────────
#
# `vistazo` esta escrito para que una fuente rota se DIGA en vez de callarse.
# Pero eso solo funciona si el parte llega. Si el nodo se muere, o se llena el
# disco, o systemd no dispara el temporizador, o la clave de WhatsApp caduca,
# no hay parte — y el silencio se lee exactamente igual que «no habia nada que
# contar». Es el mismo fallo que el modulo evita, un piso mas arriba.
#
# ── POR QUE MIRA LO QUE MIRA ────────────────────────────────────────────────
#
# No pregunta si la maquina esta viva, ni si el servicio esta «active». Mira SI
# EL MENSAJE LLEGO, leyendo la charla de WhatsApp igual que la leeria una
# persona. Es la unica comprobacion que no se puede pasar por casualidad: da
# igual por que falto el parte —maquina, red, systemd, cupo de Meta, una
# excepcion nueva—, la respuesta es la misma y es la que importa.
#
# Un vigia que comprueba «el proceso corre» habria dado verde toda la noche con
# `Restart=always` reiniciando cada media hora.
#
# ── POR QUE VIVE FUERA DEL NODO ─────────────────────────────────────────────
#
# Una maquina caida no puede avisar de que esta caida. Si el vigia corriera
# junto a AU-RA, el unico fallo que no detectaria seria justo el peor.
#
# ── POR QUE AVISA POR DOS CAMINOS ───────────────────────────────────────────
#
# Avisar por WhatsApp de que WhatsApp fallo es un chiste. Se intenta primero
# porque es donde Jose mira, y si no sale se manda por correo (SNS), que no
# comparte ni una pieza con el camino que se esta vigilando.

import json
import os
import time
import urllib.error
import urllib.request

import boto3

ZERNIO = os.environ.get('ZERNIO_BASE', 'https://zernio.com/api/v1')
CLAVE = os.environ.get('ZERNIO_CLAVE', '')
CUENTA = os.environ.get('ZERNIO_CUENTA', '')
PARA = [x.strip() for x in os.environ.get('AURA_PARTE_PARA', '').split(',') if x.strip()]
TEMA = os.environ.get('SNS_TEMA', '')

# Cuantas horas sin parte son demasiadas. Los partes salen cada 12h, asi que 14
# deja margen para un `RandomizedDelaySec` y un reintento sin dar un falso
# aviso. Un vigia que se queja sin motivo se termina ignorando, y entonces no
# vigila nada.
HORAS = float(os.environ.get('AURA_VIGIA_HORAS', '14'))


def _pedir(ruta):
    req = urllib.request.Request(ZERNIO + ruta,
                                 headers={'Authorization': 'Bearer ' + CLAVE})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read() or b'{}')


def _ms(iso):
    if not iso:
        return 0
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(str(iso).replace('Z', '+00:00'))
                   .timestamp() * 1000)
    except Exception:
        return 0


def ultimo_parte(numero):
    """Cuando salio el ultimo parte hacia ese numero, en ms. 0 si nunca.

    Se busca un mensaje SALIENTE que empiece por «Parte de». Saliente y no
    entrante: lo que se comprueba es que AU-RA hablo, no que alguien escribio.
    """
    d = _pedir(f'/inbox/conversations?platform=whatsapp&accountId={CUENTA}'
               f'&limit=50&sortOrder=desc')
    hilo = None
    for c in d.get('data') or []:
        if (c.get('participantId') or '') == numero:
            hilo = c.get('id')
            break
    if not hilo:
        # Ni charla hay. No es «todavia no toca»: es que nunca salio ninguno.
        return 0
    m = _pedir(f'/inbox/conversations/{hilo}/messages'
               f'?accountId={CUENTA}&limit=100&sortOrder=desc')
    for msg in m.get('messages') or []:
        if (msg.get('direction') or '') != 'outgoing':
            continue
        if str(msg.get('message') or '').startswith('Parte de'):
            return _ms(msg.get('sentAt'))
    return 0


def _avisar_whatsapp(numero, texto):
    d = _pedir(f'/inbox/conversations?platform=whatsapp&accountId={CUENTA}'
               f'&limit=50&sortOrder=desc')
    hilo = next((c.get('id') for c in d.get('data') or []
                 if (c.get('participantId') or '') == numero), None)
    if not hilo:
        raise RuntimeError('sin charla abierta')
    req = urllib.request.Request(
        f'{ZERNIO}/inbox/conversations/{hilo}/messages',
        data=json.dumps({'accountId': CUENTA, 'message': texto}).encode(),
        method='POST',
        headers={'Authorization': 'Bearer ' + CLAVE,
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=25) as r:
        r.read()


def _avisar_correo(asunto, texto):
    if not TEMA:
        raise RuntimeError('sin tema de SNS configurado')
    boto3.client('sns').publish(TopicArn=TEMA, Subject=asunto[:99], Message=texto)


def handler(evento=None, contexto=None):
    ahora = time.time() * 1000
    callados = []
    for numero in PARA:
        try:
            ultimo = ultimo_parte(numero)
        except Exception as e:
            # No poder MIRAR tambien es motivo de aviso. Si el vigia se traga su
            # propio fallo, deja de vigilar y nadie se entera de las dos cosas.
            callados.append((numero, None, f'no pude comprobarlo ({type(e).__name__})'))
            continue
        horas = (ahora - ultimo) / 3600000 if ultimo else None
        if ultimo == 0:
            callados.append((numero, None, 'no encuentro NINGÚN parte'))
        elif horas > HORAS:
            callados.append((numero, horas, f'el último fue hace {horas:.0f} horas'))

    if not callados:
        return {'ok': True, 'revisados': len(PARA)}

    lineas = ['El parte de AU-RA no está llegando.', '']
    lineas += [f'• …{n[-4:]}: {motivo}' for n, _, motivo in callados]
    lineas += ['', 'Suele ser el nodo caído, el disco lleno, el temporizador, '
                   'o la clave de WhatsApp. Mirá `systemctl list-timers` y '
                   '`journalctl -u aura-parte`.']
    texto = '\n'.join(lineas)

    salio, fallos = [], []
    for numero, _, _ in callados:
        try:
            _avisar_whatsapp(numero, texto)
            salio.append('whatsapp')
        except Exception as e:
            fallos.append(f'whatsapp: {type(e).__name__}')
    if not salio:
        # WhatsApp no pudo. Es el caso para el que existe el segundo camino:
        # avisar por WhatsApp de que WhatsApp fallo no sirve de nada.
        try:
            _avisar_correo('AU-RA: el parte no está llegando',
                           texto + '\n\n(no se pudo avisar por WhatsApp: '
                           + '; '.join(fallos) + ')')
            salio.append('correo')
        except Exception as e:
            fallos.append(f'correo: {type(e).__name__}')

    return {'ok': False, 'avisado_por': salio, 'fallos': fallos,
            'callados': [n for n, _, _ in callados]}
