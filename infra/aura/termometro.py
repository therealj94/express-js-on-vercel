# El termometro: si AU-RA tuvo un buen dia o uno malo.
#
# ── LO QUE FALTABA DE VERDAD, QUE NO ERA MEDIR ──────────────────────────────
#
# Dije que no se medía nada y era falso. `respuesta.ms` esta anotado desde
# antes, `registro.resumen(24)` lo lee, y el parte ya dice «Ns la respuesta
# tipica». Los numeros estaban.
#
# Lo que ninguno de esos numeros contesta es la unica pregunta que importa:
# ¿le sirvio a la persona? Todo lo que se mide es MECANICA —cuantas respuestas,
# cuanto tardaron, cuantas corto el guardia— y la mecanica puede ir perfecta
# mientras la gente se va.
#
# Este archivo mira lo otro, con lo que ya esta guardado:
#
#   · ¿VOLVIERON?  Es la unica nota que no se puede fingir. Quien vuelve al
#     dia siguiente recibio algo que valia; quien no vuelve, no. No hace falta
#     preguntarle nada a nadie.
#   · ¿DONDE SE QUEDARON?  El ultimo nodo de cada uno es el sitio exacto por
#     donde se escapan. Con eso, «mejorar el embudo» deja de ser una opinion.
#   · ¿CUANTAS NO LAS SUPO EL GUION?  El tamaño del hueco de conocimiento.
#
# ── LO QUE NO SE GUARDA, Y NO ES UN DESCUIDO ────────────────────────────────
#
# Las PREGUNTAS no. El registro dice, con todas sus letras, que el texto de una
# respuesta normal no viaja ahi — porque si viajara, esto seria una
# transcripcion de todas las conversaciones para siempre, justo lo que el plazo
# de treinta dias vino a evitar.
#
# Asi que aqui se dice CUANTAS no supo el guion, no CUALES. Saber el tamaño del
# hueco alcanza para decidir; saber las palabras exactas de cada desconocido no
# hace falta para eso, y una vez guardadas ya no se pueden desguardar.

import time

DIA = 86400


def _perfiles_de_gente(perfiles):
    """Los de personas de verdad, sin los de la web caducada ni los vacios."""
    return {q: p for q, p in (perfiles or {}).items()
            if isinstance(p, dict) and p.get('visto')}


def volvieron(perfiles, ahora=None, dias=7):
    """`(volvieron, total, indice)` de los ultimos `dias`.

    «Volvio» es: se le vio en dos dias distintos. Es la unica nota que no se
    puede fingir — nadie vuelve a hablar con algo que no le sirvio.
    """
    ahora = ahora if ahora is not None else time.time()
    corte = ahora - dias * DIA
    gente = [p for p in _perfiles_de_gente(perfiles).values()
             if (p.get('visto') or 0) >= corte]
    if not gente:
        return 0, 0, None
    # `dias_vistos` lo lleva el asistente, en un solo sitio: la envoltura de
    # `atender`. Quien no lo tenga cuenta como que no volvio, que es lo
    # correcto — es gente de antes de que esto existiera, no gente que volvio.
    vueltos = sum(1 for p in gente if len(p.get('dias_vistos') or []) > 1)
    return vueltos, len(gente), vueltos / len(gente)


def donde_se_quedaron(perfiles, ahora=None, dias=7, tope=5):
    """Los nodos donde la gente dejo de contestar, el peor primero.

    Es el sitio exacto por donde se escapan. Con esto, «mejorar el embudo» deja
    de ser una opinion contra otra.
    """
    ahora = ahora if ahora is not None else time.time()
    corte = ahora - dias * DIA
    cuenta = {}
    for p in _perfiles_de_gente(perfiles).values():
        # Solo quien lleva un rato callado: quien hablo hace diez minutos no
        # «se quedo» ahi, esta en medio de la conversacion.
        if (p.get('visto') or 0) > ahora - 3600:
            continue
        if (p.get('visto') or 0) < corte:
            continue
        n = p.get('nodo')
        if n:
            cuenta[n] = cuenta.get(n, 0) + 1
    return sorted(cuenta.items(), key=lambda x: -x[1])[:tope]


def cuanto_no_supo(registro, horas=24):
    """`(al_motor, total, parte)`: que fraccion no supo contestar el guion.

    Es el tamaño del hueco de conocimiento. NO se guarda cual era la pregunta
    —ver la cabecera— porque para decidir alcanza con el tamaño.
    """
    r = registro.resumen(horas) if registro else {}
    ev = (r or {}).get('por_evento') or {}
    motor = ev.get('respuesta') or 0
    guion = ev.get('guion') or 0
    total = motor + guion
    if not total:
        return 0, 0, None
    return motor, total, motor / total


def texto(perfiles, registro=None, ahora=None):
    """El termometro, en renglones para el parte. Nunca lanza.

    Va en el parte y no en un panel: un numero que hay que ir a buscar es un
    numero que nadie mira. Este llega al telefono con lo demas.
    """
    try:
        lineas = []
        v, tot, idx = volvieron(perfiles, ahora)
        # ── UN CERO QUE SIGNIFICA «TODAVIA NO SE» NO SE ESCRIBE COMO CERO ──
        #
        # `dias_vistos` empieza a llenarse desde que existe. La primera semana
        # NADIE puede tener dos dias, asi que el indice daria 0% — y un 0% de
        # gente que vuelve se lee como una catastrofe cuando lo unico que pasa
        # es que el dato todavia no existe.
        #
        # Es la misma regla del precio: un numero que no se sabe no se rellena
        # con algo que parece un numero.
        if not tot:
            lineas.append('🔁 nadie escribió esta semana')
        elif not v:
            # SIN PORCENTAJE. «0%» se lee como un veredicto medido, y con cero
            # vueltas no hay nada medido: puede ser que nadie vuelva, o que el
            # dato sea mas joven que un dia. Las dos cosas se escriben igual y
            # significan cosas opuestas.
            #
            # «Ninguna volvio todavia» es cierto en los dos casos, y el dia que
            # vuelva una, el renglon cambia solo.
            lineas.append(f'🔁 {tot} personas · ninguna volvió todavía')
        else:
            lineas.append(f'🔁 {v} de {tot} volvieron ({idx * 100:.0f}%)')

        caidas = donde_se_quedaron(perfiles, ahora)
        if caidas:
            peor = ', '.join(f'{n} ({c})' for n, c in caidas[:3])
            lineas.append(f'📍 se quedaron en: {peor}')

        motor, total, parte = cuanto_no_supo(registro)
        if total:
            lineas.append(f'🧠 {parte * 100:.0f}% fue al motor '
                          f'({motor} de {total}) — lo que el guión no supo')
        return lineas
    except Exception:
        # Un termometro roto no puede tumbar el parte: el parte lleva cosas
        # mas importantes que este.
        return []
