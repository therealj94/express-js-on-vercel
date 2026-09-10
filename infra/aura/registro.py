# El registro de lo que AU-RA hace, y el aviso cuando algo va mal.
#
# ── POR QUE EXISTE ──────────────────────────────────────────────────────────
#
# Porque nadie podia ver lo que AU-RA le decia a la gente, y nadie se enteraba
# cuando fallaba. La mentira de la SEC estuvo horas saliendo a personas de
# verdad, y el unico detector fue Jose preguntando por casualidad. Todo lo demas
# que hay que arreglar en AU-RA es mas facil que esto, y menos importante.
#
# ── LA TENSION CON EL OLVIDO, Y COMO SE RESUELVE ────────────────────────────
#
# El mismo dia se decidio que a los treinta dias sin escribir se borra todo lo
# de una persona. Un registro que guarde cada respuesta seria exactamente lo
# contrario: una transcripcion de todo, para siempre, esquivando el plazo por
# la puerta de atras.
#
# Asi que el registro NO guarda las conversaciones. De una respuesta normal
# anota cuatro numeros —cuando, cuanto tardo, cuanto ocupaba, por que puerta
# salio— y NADA de lo que se dijo.
#
# El texto se guarda SOLO cuando el guardia corta. Ahi el texto es justamente lo
# que hace falta ver: es lo que AU-RA estuvo a punto de decirle a alguien, y sin
# leerlo no se puede arreglar. Es raro, es el caso que importa, y no es una
# transcripcion de nadie.
#
# ── A QUIEN LLEGA EL AVISO ──────────────────────────────────────────────────
#
# Por el relevo, al buzon de una persona (`AURA_AVISAR_A`). Sin infraestructura
# nueva: AU-RA ya sabe mandar mensajes, y el aviso aparece donde esa persona ya
# esta mirando. Un correo mas seria un sitio mas que nadie abre.
#
# Y con freno: si el guardia corta cincuenta veces en una hora, el aviso numero
# cincuenta no informa de nada que el primero no dijera, y en cambio convierte
# el buzon en ruido — que es como se deja de mirar un aviso.

import json
import os
import stat
import threading
import time

DATOS = None            # lo pone `preparar()`; sin eso el registro no escribe
AVISAR_A = (os.environ.get('AURA_AVISAR_A') or '').strip().lower()

# Cuantas lineas se guardan. Con una respuesta cada pocos minutos, dos mil son
# varios dias — suficiente para mirar que paso ayer, y poco para que el archivo
# crezca sin control en una maquina que tambien tiene el modelo.
TOPE_LINEAS = 2000

# Un aviso del mismo motivo cada media hora, no mas.
FRENO_AVISO = float(os.environ.get('AURA_FRENO_AVISO', '1800'))

_candado = threading.Lock()
_ultimo_aviso = {}


def preparar(carpeta):
    """Se llama una vez, al arrancar, con la carpeta de datos."""
    global DATOS
    DATOS = carpeta


def _archivo():
    return None if DATOS is None else DATOS / 'registro.jsonl'


def anotar(evento, **datos):
    """Una linea por cosa que pasa. Nunca lanza.

    Es un registro de OPERACION, no de conversacion: quien llama decide que
    campos pasa, y la regla —escrita arriba y sostenida por una prueba— es que
    el texto de una respuesta normal no viaja aqui.
    """
    f = _archivo()
    if f is None:
        return
    linea = {'t': int(time.time()), 'e': evento, **datos}
    try:
        with _candado:
            # Se crea con 600 desde el primer byte: aunque lo normal sea que no
            # haya texto de nadie, cuando el guardia corta SI lo hay.
            fd = os.open(f, os.O_WRONLY | os.O_CREAT | os.O_APPEND,
                         stat.S_IRUSR | stat.S_IWUSR)
            with os.fdopen(fd, 'a', encoding='utf8') as fh:
                fh.write(json.dumps(linea, ensure_ascii=False) + '\n')
            _recortar(f)
    except Exception:
        pass        # un registro que tumba el servicio es peor que no tenerlo


def _recortar(f):
    """Deja las ultimas TOPE_LINEAS. Barato porque el archivo es chico."""
    try:
        if f.stat().st_size < 400_000:
            return
        lineas = f.read_text(encoding='utf8').splitlines()[-TOPE_LINEAS:]
        tmp = f.with_suffix('.tmp')
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                     stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, 'w', encoding='utf8') as fh:
            fh.write('\n'.join(lineas) + '\n')
        tmp.replace(f)
    except Exception:
        pass


def avisar(rel, motivo, texto):
    """Le dice a una persona que el guardia corto algo. Nunca lanza.

    `motivo` agrupa el freno: dos cortes por lo legal en la misma media hora
    son un aviso, no dos. Dos cortes por motivos distintos son dos.
    """
    if not AVISAR_A or rel is None:
        return False
    ahora = time.time()
    with _candado:
        if ahora - _ultimo_aviso.get(motivo, 0) < FRENO_AVISO:
            return False
        _ultimo_aviso[motivo] = ahora
    try:
        rel.enviar(AVISAR_A,
                   f'⚠ El guardia cortó una respuesta ({motivo}).\n\n'
                   f'Esto es lo que estuve a punto de decir:\n\n'
                   f'{texto[:700]}')
        return True
    except Exception:
        return False


def resumen(desde_horas=24):
    """Lo que paso en las ultimas horas, para poder mirarlo sin abrir el
    archivo a mano. Devuelve cuentas, nunca texto."""
    f = _archivo()
    if f is None or not f.exists():
        return {'lineas': 0}
    corte = time.time() - desde_horas * 3600
    cuentas, tardanzas = {}, []
    try:
        for linea in f.read_text(encoding='utf8').splitlines():
            try:
                d = json.loads(linea)
            except Exception:
                continue
            if d.get('t', 0) < corte:
                continue
            cuentas[d.get('e', '?')] = cuentas.get(d.get('e', '?'), 0) + 1
            if isinstance(d.get('ms'), (int, float)):
                tardanzas.append(d['ms'])
    except Exception:
        return {'lineas': 0}
    tardanzas.sort()
    return {
        'lineas': sum(cuentas.values()),
        'por_evento': cuentas,
        'mediana_ms': tardanzas[len(tardanzas) // 2] if tardanzas else None,
        'mas_lenta_ms': tardanzas[-1] if tardanzas else None,
    }
