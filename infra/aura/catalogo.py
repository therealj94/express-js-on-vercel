# QUE se puede pedir. Una lista cerrada, y nada fuera de ella.
#
# ── POR QUE UNA LISTA CERRADA Y NO UNA ORDEN LIBRE ─────────────────────────
#
# La forma comoda de hacer esto es dejar que la persona escriba lo que quiere
# y que el modelo lo convierta en un comando. Es comoda y es exactamente como
# se entrega la maquina: el modelo lee texto de desconocidos, y el dia que
# alguien escriba algo lo bastante bien armado, el comando lo escribe el
# desconocido.
#
# Aca no hay traduccion. Hay una lista de cosas que se pueden pedir, escritas
# por nosotros, y pedir es ELEGIR UNA. Lo que la persona escribe solo puede
# llenar huecos declarados, y cada hueco dice de que largo y de que forma.
#
# El unico encargo que lleva texto libre es `claude`, y por eso es el unico
# marcado `riesgo='ejecuta'`: no corre en el nodo, va a una sesion de Claude
# que tiene sus propios permisos, y el admin lo lee ENTERO antes de aprobar.
#
# ── LOS TRES RIESGOS ───────────────────────────────────────────────────────
#
#   mira      lee y cuenta. No cambia nada. No necesita aprobacion.
#   toca      cambia algo nuestro: despliega, reinicia, escribe.
#   ejecuta   corre trabajo con criterio propio en otra maquina.
#
# «mira» sale solo. «toca» y «ejecuta» esperan a que un admin diga que si.
# La cuenta la lleva `encargos.py`; aca solo se declara.

import re


def _texto(largo):
    """Un hueco de texto libre, acotado. El largo es parte de la seguridad:
    un encargo de sesenta mil caracteres no lo lee nadie antes de aprobarlo,
    y lo que no se lee se aprueba a ciegas."""
    return {'clase': 'texto', 'largo': largo}


def _una_de(opciones):
    return {'clase': 'una-de', 'opciones': tuple(opciones)}


# ── La lista ────────────────────────────────────────────────────────────────
#
# `quien`  qué tramos pueden pedirlo. 'admin' está en todos: quien aprueba
#          también puede pedir, y lo suyo lo aprueba OTRO admin.
# `pide`   los huecos, en orden. Vacío = no se pide nada más.

ENCARGOS = {
    # ── Mirar ───────────────────────────────────────────────────────────────
    'parte': {
        'titulo': 'El parte del día',
        'que_hace': 'Arma el parte de tu área y te lo manda acá mismo.',
        'riesgo': 'mira',
        'quien': ('admin', 'legal', 'tecnologico', 'mercadeo', 'contable',
                  'operacion'),
        'pide': [],
    },
    'cadena': {
        'titulo': 'Cómo va la cadena',
        'que_hace': 'Pregunta la altura, los validadores y el gas a los nodos.',
        'riesgo': 'mira',
        'quien': ('admin', 'tecnologico'),
        'pide': [],
    },
    'saldos': {
        'titulo': 'Saldos de la campaña',
        'que_hace': 'Lee de la cadena lo que queda en la billetera de premios.',
        'riesgo': 'mira',
        'quien': ('admin', 'contable', 'operacion'),
        'pide': [],
    },
    'gente': {
        'titulo': 'Cómo viene la gente',
        'que_hace': ('Cuánta gente nueva llegó, en qué idioma, cuántos '
                     'jugaron y cuántos pidieron hablar con el equipo.'),
        'riesgo': 'mira',
        'quien': ('admin', 'mercadeo'),
        'pide': [],
    },
    'apunte': {
        'titulo': 'Anotar lo que vamos a hacer',
        'que_hace': ('Lo guarda como memoria de tu área y se lo pasa a '
                     'Claude. AU-RA lo va a tener presente la próxima vez.'),
        # RIESGO «mira» A PROPOSITO. Anotar lo que uno ya sabe de su propia
        # area no le da a nadie ningun permiso nuevo — es memoria, no una
        # orden. Pedir firma para esto lo mataria en una semana, y una
        # memoria que nadie escribe es una memoria que no existe.
        'riesgo': 'mira',
        'quien': ('admin', 'legal', 'tecnologico', 'mercadeo', 'contable',
                  'operacion'),
        'pide': [('apunte', _texto(900))],
    },
    'papeles': {
        'titulo': 'Papeles y plazos',
        'que_hace': 'Qué vence, qué está sin firmar y qué falta presentar.',
        'riesgo': 'mira',
        'quien': ('admin', 'legal'),
        'pide': [],
    },

    # ── Tocar ───────────────────────────────────────────────────────────────
    'desplegar': {
        'titulo': 'Poner al día el nodo',
        'que_hace': 'Baja la última versión de AU-RA al nodo y la reinicia.',
        'riesgo': 'toca',
        'quien': ('admin', 'tecnologico'),
        'pide': [],
    },
    'reiniciar': {
        'titulo': 'Reiniciar un servicio',
        'que_hace': 'Apaga y prende un servicio del nodo.',
        'riesgo': 'toca',
        'quien': ('admin', 'tecnologico'),
        # No un nombre libre: la lista de servicios que se pueden tocar.
        # «reiniciá lo que te diga» es una orden remota con otro nombre.
        'pide': [('servicio', _una_de(('aura', 'ollama')))],
    },

    # ── Ejecutar ────────────────────────────────────────────────────────────
    'claude': {
        'titulo': 'Un encargo para Claude',
        'que_hace': ('Le pasa el trabajo a Claude, que lo hace en el '
                     'repositorio y deja los cambios listos para revisar.'),
        'riesgo': 'ejecuta',
        'quien': ('admin', 'legal', 'tecnologico', 'mercadeo', 'contable',
                  'operacion'),
        # 1200 caracteres: alcanza para explicar un encargo de verdad y se lee
        # entero en un teléfono antes de aprobarlo.
        'pide': [('trabajo', _texto(1200))],
    },
}

# Lo que no necesita que nadie diga que sí.
SALEN_SOLOS = ('mira',)


def existe(clave):
    return clave in ENCARGOS


def _tramos(tramo):
    """Uno o varios, siempre como conjunto. Quien lleva tres sombreros puede
    pedir lo de los tres."""
    if not tramo:
        return set()
    return {tramo} if isinstance(tramo, str) else set(tramo)


def puede(tramo, clave):
    """¿Puede pedir este encargo? `tramo` puede ser uno o una lista."""
    e = ENCARGOS.get(clave)
    return bool(e) and bool(_tramos(tramo) & set(e['quien']))


def para(tramo):
    """Lo que puede pedir, EN EL ORDEN DE LA LISTA y sin repetir.

    El orden sale de aquí y no de sus tramos: quien lleva tres sombreros
    tiene que ver un menú, no tres menús pegados con las mismas filas
    repetidas.
    """
    suyos = _tramos(tramo)
    return [(k, v) for k, v in ENCARGOS.items() if suyos & set(v['quien'])]


def necesita_permiso(clave):
    e = ENCARGOS.get(clave)
    return bool(e) and e['riesgo'] not in SALEN_SOLOS


# ── Los huecos ──────────────────────────────────────────────────────────────
#
# Todo lo que escribe una persona pasa por aqui antes de guardarse. Devuelve
# `(valor_limpio, motivo_del_no)`: o una cosa o la otra, nunca las dos.

# Los caracteres de control se sacan siempre. Llegan pegados desde otro sitio,
# no se ven, y en un texto que despues se muestra para aprobar son justamente
# lo que se usa para esconder media orden debajo de una linea en blanco.
_CONTROL = re.compile(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]')


def limpiar(hueco, crudo):
    forma = hueco[1]
    if forma['clase'] == 'una-de':
        v = str(crudo or '').strip().lower()
        if v not in forma['opciones']:
            return None, ('tiene que ser una de éstas: '
                          + ', '.join(forma['opciones']))
        return v, None
    v = _CONTROL.sub('', str(crudo or '')).strip()
    if not v:
        return None, 'quedó vacío'
    if len(v) > forma['largo']:
        return None, (f'son {len(v)} caracteres y el tope es '
                      f'{forma["largo"]}: partilo en dos encargos')
    return v, None


def limpiar_todo(clave, dados):
    """Los huecos de un encargo, limpios. `(valores, motivo_del_no)`."""
    e = ENCARGOS.get(clave)
    if not e:
        return None, 'ese encargo no existe'
    fuera = {}
    for hueco in e['pide']:
        nombre = hueco[0]
        valor, mal = limpiar(hueco, (dados or {}).get(nombre))
        if mal:
            return None, f'«{nombre}» {mal}'
        fuera[nombre] = valor
    return fuera, None


def como_se_lee(clave, valores):
    """El encargo escrito para una persona, que es lo que va a leer el admin
    antes de decir que sí. Lo que no se entiende no se aprueba bien."""
    e = ENCARGOS.get(clave)
    if not e:
        return clave
    partes = [e['titulo']]
    for nombre, _forma in e['pide']:
        v = (valores or {}).get(nombre)
        if v is not None:
            partes.append(f'{nombre}: {v}')
    return '\n'.join(partes)
