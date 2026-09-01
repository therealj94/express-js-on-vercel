# Un oficio por area: la misma AU-RA, hablando desde el sitio de cada uno.
#
# ── POR QUE NO SON CINCO BOTS ──────────────────────────────────────────────
#
# La idea era «un bot por area». Cinco bots serian cinco numeros de WhatsApp,
# cinco verificaciones de Meta, cinco modelos en una GPU que apenas sostiene
# uno, y —lo que de verdad importa— cinco sitios donde arreglar la misma cosa.
# El dia que haya que cambiar una regla, cuatro se quedan sin cambiar.
#
# Es la misma AU-RA. Lo que cambia es DESDE DONDE habla: quien le escribe de
# contabilidad recibe a alguien que sabe de contabilidad, con la memoria de
# contabilidad y las cautelas de contabilidad. La persona no nota la
# diferencia con tener cinco; nosotros no pagamos el precio de tenerlos.
#
# ── QUE ES UN OFICIO ───────────────────────────────────────────────────────
#
#   quien     como se presenta y de que se ocupa
#   sabe      lo que ese oficio tiene que tener presente siempre
#   cuida     lo que NO puede decir. Se suma a lo de la casa, no lo reemplaza
#   apunta    que clase de cosas vale la pena anotar de esa area
#
# ── LO QUE SE APRENDE VUELVE ───────────────────────────────────────────────
#
# «Vamos a ir aprendiendo la AI todo» — Jose, 1-sep. Cada area apunta lo que
# va a hacer y lo que le sale, y ese apunte va a dos sitios: al saber del area
# —que AU-RA lee la proxima vez que alguien de ahi le escribe— y a la cola de
# Claude, para que lo que se decidio en un WhatsApp no muera en ese WhatsApp.
#
# El apunte NO es una orden. Es memoria. Por eso `apunte` es riesgo «mira» y
# no necesita firma: anotar lo que uno ya sabe de su propia area no le da a
# nadie ningun permiso nuevo, y pedir firma para eso lo mataria en una semana.
#
# ── LO QUE UN OFICIO NO PUEDE CAMBIAR ──────────────────────────────────────
#
# Ni una sola de las reglas de la casa. `guardia.py` corre igual para los
# cinco, las prohibiciones de la Junta valen igual para los cinco, y ningun
# oficio puede darse a si mismo permisos: eso lo decide el escalafon, que no
# lee este archivo. Un oficio decide TONO Y MEMORIA, nunca permiso.

import json
import os
import stat
import time


# Cuanto del saber de un area entra en el turno. La ventana del modelo ya va
# al 80% con las fichas de la casa: esto es lo que cabe sin empujar fuera lo
# que ya estaba, que seria cambiar memoria nueva por memoria vieja sin que
# nadie lo decida.
TOPE_SABER = 900

# Cuantos apuntes se guardan por area. Los viejos se van por abajo.
TOPE_APUNTES = 200


OFICIOS = {
    'admin': {
        'quien': ('Sos la mano derecha de la dirección de Orden Global. Ves '
                  'todo: dinero, cadena, papeles, gente y máquina.'),
        'sabe': ('Lo que llega acá casi siempre es una decisión, no una '
                 'pregunta. Contestá con lo que hay medido y decí claramente '
                 'qué NO se está midiendo todavía.'),
        'cuida': ('Nunca des por hecho un número que no viniste de mirar. '
                  'Si una fuente no se pudo leer, decilo antes que el resto.'),
        'apunta': 'decisiones tomadas, y por qué',
    },
    'tecnologico': {
        'quien': ('Sos quien lleva la infraestructura de Orden Global: la '
                  'cadena 5550, el nodo, los despliegues y las apps.'),
        'sabe': ('Hablás con gente técnica: no hace falta explicar qué es una '
                 'billetera. Lo que hace falta es el dato exacto — bloque, '
                 'versión, código de error.'),
        'cuida': ('Nunca cuentes cómo está armada la infraestructura por '
                  'fuera del equipo: ni direcciones internas, ni nombres de '
                  'servicios, ni por dónde falla.'),
        'apunta': 'cambios de infraestructura y qué los motivó',
    },
    'legal': {
        'quien': ('Sos quien lleva el cumplimiento de Orden Global: registro, '
                  'plazos, papeles y lo que se puede decir.'),
        'sabe': ('Orden Global Blockchain Corp. está inscrita en Columbia '
                 'Británica (BC1422170, activa desde el 15-jun-2023). Estar '
                 'INSCRITA no es estar regulada ni licenciada, y esa '
                 'diferencia es justamente la que hay que cuidar.'),
        'cuida': ('Jamás digas que Orden Global está regulada, licenciada o '
                  'autorizada, ni nombres la regulación de ningún país. '
                  'ORIGEN, AUKA y AGKA no están respaldados: el oro es una '
                  'REFERENCIA. Solo ONDK está declarado respaldado, y se '
                  'nombra sin precio, sin revalorización y sin invitación.'),
        'apunta': 'plazos, presentaciones y qué quedó pendiente de firmar',
    },
    'mercadeo': {
        'quien': ('Sos quien lleva mercadeo y las relaciones de Orden Global: '
                  'la gente que llega, qué la trajo y cómo se le habla.'),
        'sabe': ('Lo que funciona es contar en qué anda la casa de verdad, no '
                 'prometer. La gente entra por curiosidad y se queda por '
                 'poder comprobar las cosas por su cuenta.'),
        'cuida': ('Nunca prometas ganancia, revalorización ni rendimiento, ni '
                  'con un «podría». Nada de urgencia inventada ni de fechas '
                  'que no estén decididas.'),
        'apunta': 'qué se probó, a quién se le habló y qué contestó',
    },
    'contable': {
        'quien': ('Sos quien lleva las cuentas de Orden Global: billeteras, '
                  'premios pagados, costos y lo que entra y sale.'),
        'sabe': ('Todo movimiento de la cadena se puede comprobar en '
                 'ordenscan.com con su hash. Un número sin comprobante es un '
                 'número que todavía no existe.'),
        'cuida': ('Nunca des un saldo de memoria: se lee de la cadena o se '
                  'dice que no se pudo leer. No repartas direcciones de '
                  'billeteras internas fuera del equipo.'),
        'apunta': 'movimientos, costos y de dónde salió cada cifra',
    },
    'operacion': {
        'quien': 'Sos quien lleva el día a día de Orden Global.',
        'sabe': 'Lo que no cae en ningún área es tuyo hasta que tenga dueño.',
        'cuida': 'Ante la duda, pasáselo al área que le toca.',
        'apunta': 'lo que se hizo y a quién le tocaba',
    },
}


def existe(tramo):
    return tramo in OFICIOS


def _archivo(datos, tramo):
    return datos / f'saber-{tramo}.jsonl'


# ── Apuntar ─────────────────────────────────────────────────────────────────

def apuntar(datos, tramo, quien, texto):
    """Guarda un apunte del area. Devuelve el apunte.

    En modo «agregar» y 0600: dos personas del mismo area apuntando a la vez
    no se pisan, y lo apuntado lleva nombres — no es de lectura publica en la
    maquina.
    """
    a = {'cuando': int(time.time()), 'quien': quien,
         'tramo': tramo, 'texto': texto}
    f = _archivo(datos, tramo)
    fd = os.open(f, os.O_WRONLY | os.O_CREAT | os.O_APPEND,
                 stat.S_IRUSR | stat.S_IWUSR)
    with os.fdopen(fd, 'a', encoding='utf8') as fh:
        fh.write(json.dumps(a, ensure_ascii=False) + '\n')
    return a


def apuntes(datos, tramo, cuantos=TOPE_APUNTES):
    try:
        lineas = _archivo(datos, tramo).read_text(encoding='utf8').splitlines()
    except Exception:
        return []
    fuera = []
    for linea in lineas[-cuantos:]:
        try:
            fuera.append(json.loads(linea))
        except Exception:
            continue          # una línea rota no se lleva el resto por delante
    return fuera


# ── Lo que el motor lee ─────────────────────────────────────────────────────

def sistema(tramo, datos=None):
    """El trozo que se le suma al prompt de la casa para este oficio.

    Se SUMA. No reemplaza nada: el prompt de la casa y el guardia siguen
    corriendo igual para los cinco. Un oficio decide tono y memoria, nunca
    permiso — y hay una prueba que lo vigila.
    """
    o = OFICIOS.get(tramo)
    if not o:
        return ''
    partes = [o['quien'], o['sabe'], 'MUY IMPORTANTE: ' + o['cuida']]
    if datos is not None:
        recientes = _lo_ultimo(datos, tramo)
        if recientes:
            partes.append('Lo último que anotó tu área:\n' + recientes)
    return '\n'.join(partes)


def _lo_ultimo(datos, tramo, tope=TOPE_SABER):
    """Los apuntes mas nuevos que quepan, del mas nuevo al mas viejo.

    Del mas nuevo hacia atras a proposito: si algo se cae por el tope, que sea
    lo viejo. Lo contrario —recortar por el final— deja al modelo con la
    memoria de hace tres meses y sin la de ayer.
    """
    fuera, largo = [], 0
    for a in reversed(apuntes(datos, tramo)):
        linea = '• ' + (a.get('texto') or '').strip()
        if largo + len(linea) > tope:
            break
        fuera.append(linea)
        largo += len(linea) + 1
    return '\n'.join(reversed(fuera))


def resumen(datos):
    """Cuántos apuntes tiene cada área. Para el parte."""
    return {t: len(apuntes(datos, t)) for t in OFICIOS if apuntes(datos, t)}
