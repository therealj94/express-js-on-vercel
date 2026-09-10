# El mismo nodo, mirado desde cinco sitios distintos.
#
# ── POR QUE CINCO PARTES Y NO UNO ──────────────────────────────────────────
#
# El parte de las 7:30 lo lee Jose y lleva de todo: la cadena, el disco, Meta,
# los premios, el correo. Para el esta bien — es el dueño y le toca todo.
#
# Para los demas no. A quien lleva lo legal, «el disco al 71%» no le dice nada
# y le corre hacia abajo lo unico que le importaba. Un parte con cosas que no
# son tuyas no se lee a medias: se deja de leer entero, y entonces el dia que
# SI traiga algo tuyo tampoco lo vas a ver.
#
# Asi que cada tramo mira las mismas fuentes y se lleva lo suyo.
#
# ── LO QUE NO SE PUEDE VER TODAVIA, SE DICE ────────────────────────────────
#
# Es la misma regla del vistazo —una fuente que falla se dice, no se omite—
# llevada un paso mas: si un tramo necesita algo que este nodo todavia no mide,
# el parte lo declara en vez de callarlo.
#
# Sin eso, «todo en orden» significaria tambien «no lo estoy mirando», que es
# la forma mas cara de estar tranquilo. Contabilidad, sobre todo: hoy se ve la
# billetera de la campaña y NADA de los costos de la nube. Callarlo seria
# decirle a quien lleva las cuentas que las cuentas estan miradas.

import os

import termometro
import vistazo

# Cada mirada devuelve `{pendientes, lineas, rotas}` — la misma forma que
# `vistazo.juntar`, para que `vistazo.texto` la pinte sin cambiar nada.

TRAMOS = ('admin', 'tecnologico', 'legal', 'mercadeo', 'contable')

TITULOS = {
    'admin': 'Parte de administración',
    'tecnologico': 'Parte de tecnología',
    'legal': 'Parte legal',
    'mercadeo': 'Parte de mercadeo',
    'contable': 'Parte contable',
}

# Lo que este nodo TODAVIA no mide, por tramo. Vacío = no le falta nada.
#
# Esta lista es una deuda escrita, no un adorno: cada línea es algo que alguien
# cree que está vigilado y no lo está. Se saca de aquí el día que se mide de
# verdad, no antes.
CIEGO = {
    'admin': (),
    'tecnologico': (),
    'legal': ('los vencimientos de papeles no están cargados: hoy solo se '
              'mira el registro de BC y el estado de Meta',),
    'mercadeo': ('no se mide de dónde llega la gente: se ve cuánta, no por qué',),
    'contable': ('los costos de la nube no se miran desde acá: esto es la '
                 'billetera de la campaña, no las cuentas de la casa',),
}


def _mirar(fuentes):
    """Corre las fuentes que le tocan a un tramo. Ninguna puede tumbar al
    resto: lo que revienta pasa a «no se pudo mirar», igual que en el vistazo.
    """
    lineas, pendientes, rotas = [], [], []
    for nombre, fn in fuentes:
        try:
            ls, ps = fn()
            lineas.extend(ls)
            pendientes.extend(ps)
        except Exception as e:
            rotas.append(f'{nombre} no se pudo mirar ({type(e).__name__})')
    return lineas, pendientes, rotas


def _del_registro(registro, quiere):
    """Cuentas del registro, filtradas por lo que le interesa a este tramo.

    `quiere` son nombres de evento. El registro anota `idioma`, `equipo`,
    `juego`, `pago`, `guardia`, `respuesta` y `guion` — cuentas, nunca texto:
    nadie lee conversaciones de nadie desde un parte.
    """
    if registro is None:
        return [], []
    r = registro.resumen(24)
    ev = r.get('por_evento') or {}
    lineas, pend = [], []
    comose = {
        'equipo': 'persona(s) pidieron hablar con el equipo',
        'idioma': 'persona(s) nuevas eligieron idioma',
        'juego': 'persona(s) jugaron por el premio',
        'pago': 'premio(s) pagados',
        'respuesta': 'respuestas del motor',
    }
    for clave in quiere:
        n = ev.get(clave)
        if not n:
            continue
        if clave == 'guardia':
            pend.append(f'el guardia cortó {n} respuesta(s)')
        else:
            lineas.append(f'{n} {comose.get(clave, clave)}')
    if 'respuesta' in quiere and r.get('mediana_ms'):
        lineas.append(f'{r["mediana_ms"] / 1000:.0f}s la respuesta típica')
    return lineas, pend


def _de_los_premios(premio, con_billetera):
    if premio is None:
        return [], [], []
    lineas, pend, rotas = [], [], []
    try:
        p = premio.resumen()
    except Exception as e:
        return [], [], [f'los premios no se pudieron leer ({type(e).__name__})']
    if p.get('por_pagar'):
        pend.append(f'{p["por_pagar"]} premio(s) por pagar')
    if p.get('quedan') is not None:
        lineas.append(f'quedan {p["quedan"]} de {p["tope"]} premios')
    if con_billetera:
        try:
            ls, ps = vistazo._billetera(
                getattr(premio, 'BILLETERA_PREMIOS', ''), p.get('quedan') or 0)
            lineas.extend(ls)
            pend.extend(ps)
        except Exception as e:
            rotas.append(f'la billetera de premios no se pudo mirar '
                         f'({type(e).__name__})')
    return lineas, pend, rotas


def para(tramo, registro=None, premio=None, clave_wa='', cuenta_wa='',
         encargos=None, perfiles=None):
    """Lo que le toca ver. `tramo` puede ser uno o varios. Nunca levanta.

    Con varios se JUNTAN las miradas, sin repetir: Melany lleva legal,
    contabilidad y mercadeo, y quiere UN parte con las tres cosas — no tres
    partes, ni el mismo aviso escrito tres veces.
    """
    if not isinstance(tramo, str):
        suyos = list(dict.fromkeys(tramo or ['admin']))
        if len(suyos) > 1:
            junta = {'pendientes': [], 'lineas': [], 'rotas': []}
            for uno in suyos:
                d = para(uno, registro, premio, clave_wa, cuenta_wa,
                         encargos, perfiles)
                for k in junta:
                    for x in d[k]:
                        if x not in junta[k]:      # sin repetir
                            junta[k].append(x)
            return junta
        tramo = suyos[0] if suyos else 'admin'
    wa = lambda: vistazo._whatsapp(clave_wa, cuenta_wa)   # noqa: E731

    if tramo == 'tecnologico':
        fuentes = [('el motor', vistazo._motor),
                   ('la cadena', vistazo._cadena),
                   ('el disco', vistazo._disco),
                   ('los reinicios', vistazo._reinicios)]
        quiere = ('respuesta', 'guardia')
        premios, billetera = False, False
    elif tramo == 'legal':
        fuentes = [('Genesis ID', vistazo._genesis), ('Meta', wa)]
        quiere = ('guardia',)
        premios, billetera = False, False
    elif tramo == 'mercadeo':
        fuentes = []
        quiere = ('idioma', 'equipo', 'juego', 'pago')
        premios, billetera = True, False
    elif tramo == 'contable':
        fuentes = []
        quiere = ('pago',)
        premios, billetera = True, True
    else:                                  # admin: le toca todo
        fuentes = [('el motor', vistazo._motor),
                   ('Genesis ID', vistazo._genesis),
                   ('la cadena', vistazo._cadena),
                   ('Meta', wa),
                   ('el correo', vistazo._correo),
                   ('los reinicios', vistazo._reinicios),
                   ('el disco', vistazo._disco)]
        quiere = ('respuesta', 'guardia', 'equipo', 'idioma')
        premios, billetera = True, True

    lineas, pendientes, rotas = _mirar(fuentes)

    try:
        ls, ps = _del_registro(registro, quiere)
        lineas.extend(ls)
        pendientes.extend(ps)
    except Exception as e:
        rotas.append(f'el registro no se pudo leer ({type(e).__name__})')

    # ── EL TERMOMETRO ────────────────────────────────────────────────────
    #
    # Va a mercadeo y a admin: son los que deciden que hacer con esto. Al
    # tramo tecnologico no le sirve saber cuanta gente volvio, y meterselo
    # seria una linea mas que aprende a saltarse — y el dia que saltandola se
    # salte una que importa, el parte dejo de servir.
    #
    # En el parte y no en un panel aparte: un numero que hay que ir a buscar
    # es un numero que nadie mira.
    if tramo in ('mercadeo', 'admin') and perfiles is not None:
        lineas.extend(termometro.texto(perfiles, registro))

    if premios:
        ls, ps, rs = _de_los_premios(premio, billetera)
        lineas.extend(ls)
        pendientes.extend(ps)
        rotas.extend(rs)

    # Lo que espera una firma va ARRIBA y solo para quien puede firmar: un
    # encargo parado porque nadie lo mira es el fallo más probable de todo
    # esto, y el que menos se nota.
    if tramo == 'admin' and encargos is not None:
        try:
            esperan = encargos.esperando()
            if esperan:
                pendientes.insert(0, f'{len(esperan)} encargo(s) esperando tu '
                                     'firma: ' + ', '.join(e['id'] for e in esperan[:6]))
        except Exception as e:
            rotas.append(f'los encargos no se pudieron leer ({type(e).__name__})')

    if tramo == 'admin':
        try:
            import mayordomo
            n = mayordomo.en_cola()
            if n:
                pendientes.append(f'{n} encargo(s) esperando que Claude los lea')
        except Exception:
            pass          # sin mayordomo a mano no es un fallo del parte

    for falta in CIEGO.get(tramo, ()):
        rotas.append(falta)

    return {'pendientes': pendientes, 'lineas': lineas, 'rotas': rotas}


def texto(tramo, datos):
    """El parte de ese tramo, listo para mandar. `tramo` puede ser varios.

    ── POR QUE SE PINTA AQUI Y NO SE USA `vistazo.texto` ──────────────────

    El del vistazo esta hecho para caber en el hueco de una plantilla: tres
    bloques pegados, sin aire, y se lee de corrido. Para el parte de las 7:30
    en un telefono eso es un muro — y un muro se mira, no se lee.

    Lo que cambia es poco y es todo: cuantas cosas necesitan a alguien va
    ARRIBA y en numero, para saber en un segundo si hay que hacer algo hoy;
    los tres bloques llevan titulo con su marca; y si no hay nada, lo dice en
    una linea en vez de dejar un parte vacio que parece un error.
    """
    if isinstance(tramo, str):
        titulo = TITULOS.get(tramo, 'Parte')
    else:
        suyos = list(dict.fromkeys(tramo or []))
        titulo = (TITULOS.get(suyos[0], 'Parte') if len(suyos) == 1
                  else 'Tu parte del día')

    pend, rotas, lineas = (datos['pendientes'], datos['rotas'], datos['lineas'])
    cabeza = f'*{titulo}* · {vistazo.cuando()}'
    if pend:
        # Sin el «(s)»: es la primera línea del parte y se lee todos los días.
        # Un plural mal puesto ahí lo hace parecer generado, y lo que parece
        # generado se lee con menos atención.
        cabeza += ('\n1 cosa te necesita a vos.' if len(pend) == 1
                   else f'\n{len(pend)} cosas te necesitan a vos.')
    elif not rotas:
        cabeza += '\nNada te necesita hoy.'

    partes = [cabeza]
    if pend:
        partes.append('🔴 *NECESITA VOS*\n'
                      + '\n'.join('• ' + p for p in pend))
    if rotas:
        partes.append('⚠️ *NO SE PUDO MIRAR*\n'
                      + '\n'.join('• ' + r for r in rotas))
    if lineas:
        partes.append('📋 *COMO VA TODO*\n'
                      + '\n'.join('• ' + x for x in lineas))
    if not (pend or rotas or lineas):
        partes.append('Todo en orden, y todo se pudo mirar.')
    return '\n\n'.join(partes)
