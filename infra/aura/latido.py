# El latido: darse cuenta de que AU-RA se quedo muda, y avisar.
#
# ── EL INCIDENTE QUE LO PIDE ────────────────────────────────────────────────
#
# 1-sep. AU-RA estuvo CUATRO HORAS Y MEDIA sin contestarle a nadie, con
# `systemctl status aura` diciendo «active (running)» todo el rato. Un
# `UnboundLocalError` reventaba cada mensaje, el bucle seguia girando, y nadie
# se entero hasta que Jose escribio «escribi al whatsapp hola y ni me
# contesto».
#
# Systemd vigila que el proceso EXISTA. Nadie vigilaba que CONTESTARA. Son dos
# preguntas distintas y la segunda es la unica que le importa a la persona que
# esta esperando.
#
# ── LAS DOS MANERAS DE QUEDARSE MUDA ────────────────────────────────────────
#
# Hacen falta las dos comprobaciones porque son averias distintas:
#
#   1 · EL BUCLE SE COLGO. Deja de dar vueltas: una peticion sin timeout, un
#       candado que no se suelta, la red que traga. El proceso vive y no hace
#       nada. Se ve porque el latido deja de refrescarse.
#
#   2 · EL BUCLE GIRA Y TODO FALLA. Lo del 1-sep. El latido se refresca
#       tan campante — por eso un latido a secas no habria cazado el incidente
#       que origino este archivo. Se ve porque se acumulan mensajes saltados.
#
# ── POR QUE NO ES UN HILO DENTRO DEL ASISTENTE ──────────────────────────────
#
# Porque lo que hay que vigilar es justamente al asistente. Un vigilante que
# vive dentro de lo vigilado se muere con ello: si el proceso se cuelga entero,
# el hilo que iba a avisar esta colgado tambien.
#
# Asi que el asistente solo ESCRIBE su latido —una linea, sin pensar— y quien
# mira es otro proceso, arrancado por un temporizador de systemd. La misma
# forma que el mayordomo.

import json
import os
import time

# El archivo del latido. Lo escribe el asistente en cada vuelta; lo lee el
# vigilante desde otro proceso.
NOMBRE = 'latido.json'

# Cuanto puede pasar sin una vuelta antes de que sea una averia.
#
# El bucle da una vuelta cada `PASO` (1,2 s) mas lo que tarde en atender. Una
# respuesta del motor puede llevarse medio minuto y varias en fila, mas. Tres
# minutos es holgado a proposito: un vigilante que grita por cada vuelta lenta
# se convierte en ruido, y a un vigilante ruidoso se le deja de hacer caso —
# que es la unica manera de que falle de verdad.
CALLADA = 180

# Mensajes saltados que se toleran antes de avisar. UNO YA ES AVISO: un
# mensaje saltado es una persona que escribio y no recibio nada.
SALTADOS_QUE_AVISAN = 1

# Como mucho un aviso por hora y por motivo. Si algo se rompe de verdad, se
# rompe seguido, y llenarle el telefono a los admin con lo mismo termina en
# que silencian el chat — justo el chat por el que va a llegar el aviso bueno.
FRENO = 3600


def _f(datos):
    return os.path.join(str(datos), NOMBRE)


# Vueltas seguidas del buzon fallando que ya son un aviso. A dos segundos por
# vuelta son unos diez minutos: mas que un tropiezo de red, menos que una
# noche entera sin que nadie se entere — que es lo que paso con Render.
BUZON_FALLOS_QUE_AVISAN = 300


def latir(datos, saltados=0, contestados=0, buzon_fallos=0):
    """Lo llama el asistente en cada vuelta. Nunca lanza.

    Escribe y ya. No mira, no decide y no avisa: si esta funcion pensara,
    seria codigo que puede fallar dentro del bucle que intenta proteger.
    """
    try:
        tmp = _f(datos) + '.tmp'
        with open(tmp, 'w', encoding='utf8') as fh:
            json.dump({'cuando': int(time.time()), 'saltados': saltados,
                       'contestados': contestados,
                       'buzon_fallos': buzon_fallos}, fh)
        os.replace(tmp, _f(datos))       # de una pieza: nunca medio archivo
    except Exception:
        pass


def leer(datos):
    try:
        with open(_f(datos), encoding='utf8') as fh:
            return json.load(fh)
    except Exception:
        return None


def revisar(datos, ahora=None):
    """`(motivo, texto)` si hay que avisar, o `(None, None)`.

    No manda nada: quien avisa es el vigilante. Asi esto se puede probar sin
    telefono y sin red.
    """
    ahora = ahora if ahora is not None else time.time()
    d = leer(datos)

    if d is None:
        # Sin latido y con el asistente supuestamente de pie. Puede ser que
        # acabe de arrancar y todavia no haya dado una vuelta; el vigilante
        # corre cada cinco minutos, asi que si esto persiste es de verdad.
        return 'sin-latido', ('No encuentro el latido de AU-RA. O acaba de '
                              'arrancar, o el bucle no llegó a dar una vuelta.')

    callada = ahora - (d.get('cuando') or 0)
    if callada > CALLADA:
        return 'colgada', (
            f'AU-RA lleva *{int(callada // 60)} minutos* sin dar una vuelta.\n\n'
            'El proceso puede estar vivo y colgado: systemd no distingue eso.')

    # El buzon caido no es «saltar mensajes» —no hay mensajes que saltar,
    # porque no llegan— y por eso el latido de antes no lo veia: con Render
    # inexistente el nodo giraba perfecto, contaba cero saltados, y toda
    # visita de la web recibia «no se» durante semanas.
    buzon = d.get('buzon_fallos') or 0
    if buzon >= BUZON_FALLOS_QUE_AVISAN:
        return 'buzon-caido', (
            f'El *buzón* de AU-RA lleva *{buzon} vueltas seguidas* sin contestar.\n\n'
            'AU-RA gira, WhatsApp y el chat siguen, pero la burbuja de la web '
            'no llega a ninguna parte: cada visita recibe «no sé».')

    saltados = d.get('saltados') or 0
    if saltados >= SALTADOS_QUE_AVISAN:
        return 'saltando', (
            f'AU-RA está *saltando mensajes*: {saltados} en la última hora.\n\n'
            'El bucle gira, contesta el registro, pero hay gente escribiendo '
            'que no recibe nada. Es la forma exacta del 1-sep.')

    return None, None
