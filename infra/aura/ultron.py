"""El puente de AU-RA hacia ULTRON FP, el asistente de la junta.

── POR QUE AU-RA Y NO UN WEBHOOK ────────────────────────────────────────────

AU-RA es la unica que sondea la bandeja de WhatsApp (ver `whatsapp.py`: se
eligio sondear y no abrir una puerta publica). ULTRON no tiene bandeja propia
ni la va a tener: seria una segunda cosa preguntando por la misma linea, y dos
que preguntan es dos que se pisan.

Asi que cuando a AU-RA le escribe alguien, ANTES de pensar le pregunta a
ULTRON si ese numero es de la junta. ULTRON lo decide —la lista vive alli, en
`ULTRON_JUNTA`, y aqui no se copia— y si lo es, contesta el, con todo lo que
sabe de la casa, y AU-RA solo pone la boca. Si no lo es, ULTRON dice 403 y
AU-RA sigue como siempre, sin enterarse de nada.

── LO QUE NO PUEDE PASAR ────────────────────────────────────────────────────

  · Que ULTRON caido deje a la junta sin respuesta. Si no contesta, AU-RA
    atiende como a cualquiera y lo apunta. Peor una respuesta de AU-RA que un
    silencio.
  · Que cada «hola» de las miles de personas que le escriben a AU-RA sea una
    peticion a ULTRON. Un numero que ULTRON dijo que NO es de la junta se
    recuerda diez minutos y no se vuelve a preguntar.
  · Que se hable con ULTRON sin secreto. Sin `ULTRON_URL` y
    `ULTRON_SECRETO_AURA` el puente no existe; con secreto equivocado ULTRON
    dice 401 y se trata igual que un 403: AU-RA atiende y se apunta el fallo.
"""

import json
import os
import threading
import time
import urllib.error
import urllib.request

URL = (os.environ.get('ULTRON_URL') or '').strip().rstrip('/')
SECRETO = (os.environ.get('ULTRON_SECRETO_AURA') or '').strip()

# Los numeros que ULTRON ya dijo que no son de la junta, con la hora en que lo
# dijo. Diez minutos: si José mete a alguien nuevo en la junta, en diez minutos
# le contesta ULTRON sin que nadie reinicie nada.
OLVIDO_S = 600
_no_son = {}
_candado = threading.Lock()


def encendido():
    return bool(URL and SECRETO)


def _solo_digitos(n):
    return ''.join(c for c in str(n or '') if c.isdigit())


def atender(de, texto, timeout=90):
    """La respuesta de ULTRON, o None si este mensaje NO es para el.

    None significa «seguí como siempre»: no es de la junta, el puente esta
    apagado, o ULTRON no contesto. Lo ultimo se apunta con `registrar` si se
    pasa, para que un ULTRON caido se vea en el registro y no en el silencio.
    Lanza solo si ULTRON contesto 5xx o no contesto: `atender_charla` lo
    reintenta como cualquier otro fallo, y al tercero lo salta con ruido.
    """
    if not encendido():
        return None
    numero = _solo_digitos(de)
    if not numero:
        return None
    with _candado:
        desde = _no_son.get(numero)
        if desde and time.time() - desde < OLVIDO_S:
            return None
    cuerpo = json.dumps({'de': numero, 'texto': (texto or '')[:4000]}).encode()
    req = urllib.request.Request(
        URL + '/whatsapp/entrada', data=cuerpo, method='POST',
        headers={'Content-Type': 'application/json',
                 'x-ultron-secreto': SECRETO,
                 'User-Agent': 'AU-RA/1 (puente ULTRON)'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.loads(r.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            # No es de la junta (o el secreto no cuadra, que para AU-RA es lo
            # mismo: no le toca contestar a ella por ULTRON). Se recuerda.
            with _candado:
                _no_son[numero] = time.time()
            return None
        # 503 con CEREBRO_APAGADO o SIN junta: ULTRON existe pero no puede
        # pensar. Para la persona es igual que si no existiera: AU-RA atiende.
        if e.code == 503:
            return None
        raise
    respuesta = (d.get('respuesta') or '').strip()
    if not respuesta:
        return None
    return respuesta


def olvidar_negativos():
    """Para las pruebas y para cuando se cambia la junta a mano."""
    with _candado:
        _no_son.clear()
