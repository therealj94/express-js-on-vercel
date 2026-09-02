# El recadero: va al buzon, recoge lo que dejo la web, contesta y vuelve.
#
# ── LA TERCERA PUERTA ───────────────────────────────────────────────────────
#
# AU-RA ya tenia dos: el chat de la casa y WhatsApp. Esta es la de la burbuja
# del ecosistema, y tiene la misma forma que las otras dos a proposito — una
# `vuelta()` que el bucle de `main` llama con su propio ritmo y su propio
# `try`, para que una puerta caida no cierre las demas.
#
# ── POR QUE VA EN EL MISMO PROCESO Y NO EN UN SERVICIO APARTE ───────────────
#
# Por `perfiles.json`. El asistente lo tiene en memoria y lo guarda entero, de
# una pieza, con `CANDADO_PERFILES`. Un segundo proceso escribiendo ese mismo
# archivo no es «un poco arriesgado»: son dos escrituras completas pisandose,
# y el que pierde se lleva por delante la memoria de todos.
#
# Aqui dentro, en cambio, es el mismo diccionario y el mismo candado que ya
# funcionan. Un servicio aparte habria sido mas ordenado de dibujar y una
# fuente de corrupcion de datos.
#
# ── EL NODO SALE, NADIE ENTRA ───────────────────────────────────────────────
#
# Todo lo de aqui son peticiones SALIENDO. El grupo de seguridad del nodo sigue
# sin aceptar una sola entrada de internet, que es la razon de que el buzon
# exista. Si esto alguna vez se cambia por «que el buzon nos llame», se pierde
# la unica propiedad que hace segura a esta maquina, donde vive la llave que
# firma los pagos.

import json
import os
import time
import urllib.error
import urllib.request

import portal

# El buzon y su llave. Sin las dos, la puerta no existe y no se avisa como
# fallo: es una boca mas que puede estar puesta o no, igual que WhatsApp.
DONDE = (os.environ.get('AURA_BUZON') or '').rstrip('/')
LLAVE = os.environ.get('AURA_BUZON_LLAVE') or ''

PASO = 2.0            # segundos entre visitas al buzon
ESPERA_RED = 8        # segundos que se aguanta una peticion
POR_VUELTA = 10       # recados de una tacada, el mismo tope que sirve el buzon


def encendido():
    return bool(DONDE and LLAVE)


def _pedir(ruta, datos=None):
    p = urllib.request.Request(
        DONDE + ruta,
        data=json.dumps(datos).encode() if datos is not None else None,
        headers={'Authorization': 'Bearer ' + LLAVE,
                 'Content-Type': 'application/json'},
        method='POST' if datos is not None else 'GET')
    with urllib.request.urlopen(p, timeout=ESPERA_RED) as r:
        return json.loads(r.read() or b'{}')


def salud():
    """Le pregunta al buzon si esta vivo. `/healthz` es publico: sin llave.

    Existe porque el arranque decia «Buzon encendido» con solo tener la
    direccion configurada, y el buzon de Render NO EXISTIA: el nodo dio 1.400
    vueltas contra un 404 y en el registro solo quedo una linea cada cien
    fallos. Decir «encendido» sin haber preguntado es la forma exacta de
    «el servicio dice activo y no hace nada».

    Devuelve el dict del buzon, o None si no contesta o contesta mal.
    """
    if not DONDE:
        return None
    try:
        p = urllib.request.Request(DONDE + '/healthz', method='GET')
        with urllib.request.urlopen(p, timeout=ESPERA_RED) as r:
            d = json.loads(r.read() or b'{}')
        return d if isinstance(d, dict) and d.get('ok') else None
    except Exception:
        return None


def vuelta(sistema, perfiles, tanda=None, registrar=print):
    """Una visita al buzon. Devuelve cuantos recados se atendieron.

    `tanda` es el mismo `ThreadPoolExecutor` del asistente. Se usa si esta,
    porque una respuesta del motor tarda segundos y de otro modo el segundo de
    la cola espera al primero; pero funciona sin el.
    """
    if not encendido():
        return 0
    recados = (_pedir('/cola') or {}).get('recados') or []
    if not recados:
        return 0

    def atender(r):
        # Cada recado con su propio `try`: uno que reviente no puede dejar sin
        # contestar a los demas de la misma tacada, que es justo lo que pasaba
        # antes en la vuelta de WhatsApp.
        try:
            respuesta, sesion = portal.hablar(
                sistema, perfiles, r.get('sesion'),
                r.get('texto') or '', toco=r.get('toco'))
        except Exception as e:
            registrar('recado fallido:', type(e).__name__, str(e)[:140])
            # SE CONTESTA IGUAL. Un silencio deja a la persona mirando tres
            # puntos hasta que se aburre; esto al menos le dice que pasó y por
            # donde seguir. Lo que no se hace nunca es contarle QUE fallo.
            respuesta, sesion = {
                'texto': 'Se me trabó algo. Probá otra vez, y si sigue igual '
                         'escribinos: wa.me/50432136457',
                'botones': []}, portal.valida(r.get('sesion'))
        try:
            _pedir('/contesta', {'ticket': r.get('ticket'),
                                 'texto': respuesta.get('texto') or '',
                                 'botones': respuesta.get('botones') or [],
                                 'sesion': sesion})
        except Exception as e:
            registrar('no pude dejar la respuesta:', type(e).__name__,
                      str(e)[:140])

    if tanda is not None:
        list(tanda.map(atender, recados[:POR_VUELTA]))
    else:
        for r in recados[:POR_VUELTA]:
            atender(r)
    return len(recados[:POR_VUELTA])
