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
#   AURA_ESCALAFON="50432136457/j.ordonez@ordenglobal.org:admin,
#                   50499999999:legal, 50488888888:tecnologico"
#
# Telefono o correo, dos puntos, tramo. Lo que no encaje se ignora — y se
# ignora ENTERO: un tramo mal escrito no degrada a la persona a otro tramo,
# la deja fuera. Degradar en silencio es como alguien termina con permisos
# que nadie le dio.
#
# ── UNA PERSONA, VARIOS SITIOS DONDE ESCRIBE: LA BARRA ─────────────────────
#
# La barra junta las formas de escribirle a la MISMA persona. Jose escribe
# desde su telefono y desde su correo, y son el.
#
# No es comodidad: es la regla 1. Sin la barra, poner el telefono y el correo
# como dos admin le daria DOS firmas — pediria desde el telefono y aprobaria
# desde el correo, y «nadie se aprueba a si mismo» quedaria en nada, saltado
# por escribirse dos veces en una lista.
#
# Asi que lo que cuenta para firmar no es el numero ni el correo: es LA
# PERSONA, y una persona es todo lo que va junto antes de los dos puntos.
#
# LA BARRA ES `/` Y NO `|` POR UNA RAZON CONCRETA. La primera version usaba
# `|`, y al escribirlo en el archivo de entorno del nodo sin comillas, la
# shell lo leyo como una TUBERIA: intento ejecutar `j.ordonez@...:admin` como
# un comando. Salio un «not found» y no paso nada, pero la forma del fallo es
# la mala — un separador que significa algo en la shell es un separador que
# algun dia ejecuta lo que lleva al lado.
#
# `/` no significa nada en una shell, no aparece en un telefono, y no es
# valido ni en el nombre ni en el dominio de un correo. No se puede confundir
# con nada.
_CRUDO = os.environ.get('AURA_ESCALAFON') or ''


def _leer(crudo):
    """`{persona: (tramo, [formas de escribirle])}`.

    La persona se llama como su PRIMERA forma — normalmente el telefono, que
    es por donde llega el aviso.
    """
    gente = {}
    for trozo in crudo.split(','):
        trozo = trozo.strip()
        if not trozo or ':' not in trozo:
            continue
        quienes, _, tramo = trozo.rpartition(':')
        tramo = tramo.strip().lower()
        formas = [x.strip().lower() for x in quienes.split('/') if x.strip()]
        if formas and tramo in TRAMOS:
            gente[formas[0]] = (tramo, formas)
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


def persona_de(quien):
    """QUIEN es, sin importar por donde escribio. `None` si no esta.

    Es lo unico que se puede comparar para decidir si dos mensajes son de la
    misma persona. Comparar el numero no sirve: el mismo la manda desde su
    correo y ya no cuadra.
    """
    q = normal(quien)
    if not q:
        return None
    for persona, (_tramo, formas) in GENTE.items():
        if any(normal(f) == q for f in formas):
            return persona
    return None


def formas_de(persona):
    """Todas las formas de escribirle a esa persona."""
    ficha = GENTE.get(normal_persona(persona))
    return list(ficha[1]) if ficha else []


def normal_persona(quien):
    p = persona_de(quien)
    return p if p is not None else normal(quien)


def tramo_de(quien):
    """El tramo de esa persona, o `None` si no esta en la lista."""
    p = persona_de(quien)
    return GENTE[p][0] if p else None


def es_admin(quien):
    return tramo_de(quien) == 'admin'


def admins():
    """Los admin, uno por PERSONA — no uno por telefono.

    Que devuelva personas y no formas es lo que hace que contarlas signifique
    algo: dos correos del mismo no son dos firmas.
    """
    return [p for p, (t, _f) in GENTE.items() if t == 'admin']


def hay_con_quien_aprobar(sin_contar=None):
    """¿Queda alguna PERSONA admin que pueda aprobar lo de esta?

    Con un solo admin —aunque figure con tres correos— nadie puede pedir lo
    que necesita firma: no hay quien se la de, y aprobarse solo esta
    prohibido. Es incomodo a proposito: la unica salida es sumar una SEGUNDA
    PERSONA, no una segunda forma de escribirle a la misma.
    """
    yo = persona_de(sin_contar) if sin_contar else None
    return any(a != yo for a in admins())


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
