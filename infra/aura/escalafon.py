# Quien es quien. La unica fuente sobre que puede pedir cada persona.
#
# ── POR QUE ESTE ARCHIVO EXISTE, Y POR QUE ESTA SOLO ────────────────────────
#
# Hasta ahora habia UNA lista —`vistazo.JEFES`— y una sola pregunta: «¿es Jose
# o no?». Con eso alcanzaba mientras lo unico que AU-RA hacia por encargo era
# mandar el parte.
#
# Deja de alcanzar en cuanto AU-RA puede EJECUTAR. Ahi la pregunta ya no es
# quien mira, sino quien puede pedir que, y quien tiene que decir que si. Y esa
# respuesta no puede vivir desparramada en catorce `if` por el codigo: el dia
# que alguien agregue un `if` mas y se olvide de otro, la puerta queda abierta
# sin que nadie lo note.
#
# Asi que vive aqui, en un archivo que no hace nada mas. Se puede leer entero
# en dos minutos y saber exactamente quien puede que.
#
# ── LOS TRAMOS ─────────────────────────────────────────────────────────────
#
#   admin        aprueba lo de los demas. Es el unico tramo que desbloquea.
#   legal        cumplimiento, plazos, papeles.
#   tecnologico  la cadena, el nodo, los despliegues.
#   mercadeo     la gente que llega, las campanas, lo que se dice afuera.
#   contable     el dinero: billeteras, premios pagados, cuentas.
#   operacion    el dia a dia que no cae en ninguno de los otros.
#   (nadie)      todo el mundo que no este en la lista. No puede pedir NADA.
#
# El tramo por omision es «nadie», y eso es lo correcto: una lista mal escrita
# tiene que dejar a la gente AFUERA, nunca adentro. Si esto se cae, se cae
# cerrado.
#
# ── LO QUE UN ADMIN NO PUEDE ───────────────────────────────────────────────
#
# Aprobarse a si mismo. Ni siquiera Jose. No es desconfianza — es que una firma
# que se puede poner solo no es una firma: si un dia alguien entra en un
# telefono de admin, la aprobacion deja de existir como control. Con dos
# personas, hay que entrar en dos.
#
# La cuenta esta en `encargos.py`, que es quien la aplica; aca solo se dice.

import os


TRAMOS = ('admin', 'legal', 'tecnologico', 'mercadeo', 'contable', 'operacion')

# Como se escribe la lista:
#
#   AURA_ESCALAFON="50432136457:admin, j.ordonez@ordenglobal.org:admin,
#                   50499999999:legal, 50488888888:tecnologico"
#
# Telefono o correo, dos puntos, tramo. Lo que no encaje se ignora — y se
# ignora ENTERO: un tramo mal escrito no degrada a la persona a otro tramo,
# la deja fuera. Degradar en silencio es como alguien termina con permisos
# que nadie le dio.
_CRUDO = os.environ.get('AURA_ESCALAFON') or ''


def _leer(crudo):
    gente = {}
    for trozo in crudo.split(','):
        trozo = trozo.strip()
        if not trozo or ':' not in trozo:
            continue
        quien, _, tramo = trozo.rpartition(':')
        quien, tramo = quien.strip().lower(), tramo.strip().lower()
        if quien and tramo in TRAMOS:
            gente[quien] = tramo
    return gente


GENTE = _leer(_CRUDO)


def recargar(crudo=None):
    """Vuelve a leer la lista. Existe para las pruebas y para un reinicio en
    caliente; en marcha normal se lee una vez y no se toca."""
    global GENTE
    GENTE = _leer(_CRUDO if crudo is None else crudo)
    return GENTE


def normal(quien):
    """Un telefono o un correo, siempre igual escrito.

    Sin esto, «+504 3213-6457» y «50432136457» son dos personas distintas para
    la lista, y la de la derecha tiene permisos que la de la izquierda no. Es
    la clase de diferencia que nadie ve hasta que falla.
    """
    q = str(quien or '').strip().lower()
    if '@' in q:
        return q
    return ''.join(c for c in q if c.isdigit())


def tramo_de(quien):
    """El tramo de esa persona, o `None` si no esta en la lista."""
    q = normal(quien)
    if not q:
        return None
    for clave, tramo in GENTE.items():
        if normal(clave) == q:
            return tramo
    return None


def es_admin(quien):
    return tramo_de(quien) == 'admin'


def admins():
    """Los admin, tal como estan escritos en la lista — que es como hay que
    escribirles."""
    return [q for q, t in GENTE.items() if t == 'admin']


def hay_con_quien_aprobar(sin_contar=None):
    """¿Queda algun admin que pueda aprobar lo de esta persona?

    Con UN solo admin en la lista, ese admin no puede pedir nada que necesite
    aprobacion: no hay quien se la de, y aprobarse solo esta prohibido. Es
    incomodo a proposito — que la unica salida sea sumar un segundo admin, y
    no saltarse la regla.
    """
    yo = normal(sin_contar) if sin_contar else None
    return any(normal(a) != yo for a in admins())


def como_se_dice(tramo):
    """El nombre del tramo para una persona, no para el codigo."""
    return {
        'admin': 'administración',
        'legal': 'legal',
        'tecnologico': 'tecnología',
        'mercadeo': 'mercadeo',
        'contable': 'contabilidad',
        'operacion': 'operación',
    }.get(tramo, 'sin tramo')
