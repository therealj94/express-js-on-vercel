# «Quiero ganar 1 ORIGEN»: el juego que enseña a usar la billetera.
#
# ── LA IDEA, Y POR QUE FUNCIONA ─────────────────────────────────────────────
#
# La pidio Jose: tres preguntas, quien las contesta bien gana 1 ORIGEN, tiene
# que abrir su Veta Wallet y mandar su direccion, y no se puede repetir.
#
# Lo bueno de esta idea no es el regalo: es que el regalo PAGA LA ATENCION de
# alguien durante tres minutos, y en esos tres minutos aprende a usar el
# producto. Las preguntas no son el peaje — son el contenido.
#
# ── EL EXAMEN NO ES UN FILTRO. ES UNA CLASE ─────────────────────────────────
#
# Una equivocacion no descalifica: se explica y se vuelve a preguntar. Suena a
# regalar el premio, y lo es a proposito.
#
#   · Lo escaso es UNO POR PERSONA, no uno por listo. Filtrar por dificultad no
#     ahorra premios —las respuestas circulan por WhatsApp en veinte minutos—
#     y en cambio deja afuera justo a quien mas necesitaba la clase.
#   · Un juego que te reprueba se abandona, y un abandono es el dinero de
#     captacion tirado con la persona ya enganchada.
#
# Y la tercera pregunta es la que justifica todo esto sola: A QUIEN LE PODES
# DAR TU FRASE DE RESPALDO. La respuesta es «a nadie, ni a AU-RA». Es la unica
# leccion que evita que a alguien le vacien la billetera, y aqui se aprende
# cobrando en vez de perdiendo.
#
# ── LO QUE ESTO NO HACE: PAGAR SOLO ─────────────────────────────────────────
#
# Este modulo comprueba, deduplica y deja el pago LISTO. No lo manda.
#
# Mandarlo solo obligaria a poner la llave privada de una billetera con fondos
# en la misma maquina que corre un modelo de lenguaje y habla con internet. Un
# fallo de logica o una entrada rara ahi no es una respuesta fea: es la
# billetera vacia. Esa es una decision de Jose, no una que se toma escribiendo
# codigo, y mientras tanto revisar y pagar es un boton.
#
# ── LAS DOS LLAVES, QUE SON DE JOSE Y SON LAS CORRECTAS ─────────────────────
#
# No se puede repetir por TELEFONO ni por BILLETERA, y hacen falta las dos:
#
#   · Solo por telefono: una persona con dos numeros cobra dos veces.
#   · Solo por billetera: la misma persona con dos billeteras cobra dos veces.
#
# Con las dos, repetir cuesta un numero nuevo Y una billetera nueva. No es
# imposible —nada lo es— pero deja de salir a cuenta por un gramo de oro
# dividido entre cincuenta y cinco.

import json
import os
import re
import stat
import threading
import time
import unicodedata

DATOS = None                  # lo pone `preparar()`
PREMIO = '1 ORIGEN'

# ── EL TOPE ────────────────────────────────────────────────────────────────
#
# Doscientos premios y se acaba. Lo puso Jose el 30-ago-2026.
#
# Un regalo sin tope no es una campaña: es una cuenta abierta. Doscientos son
# doscientos gramos de oro entre cincuenta y cinco, y eso se sabe de antemano
# — que es justo lo que un tope compra: saber cuanto vas a gastar ANTES.
#
# Y se comprueba en DOS sitios, igual que las dos llaves:
#
#   · Antes de preguntar. Hacer tres preguntas para despues decir «se acabo»
#     es la peor forma posible de decirlo, y ademas queda como una estafa
#     aunque no lo sea.
#   · Al anotar. Entre que alguien empieza y manda su direccion pueden entrar
#     otros veinte; sin esta segunda comprobacion se pagarian doscientos
#     veinte.
TOPE_PREMIOS = int(os.environ.get('AURA_TOPE_PREMIOS', '200'))

# De donde salen los premios: la billetera de mercadeo. Es publica —una
# direccion siempre lo es— y esta aqui para dos cosas: para que quien pague
# sepa de donde, y para RECHAZARLA si alguien la manda como suya.
BILLETERA_PREMIOS = os.environ.get(
    'AURA_BILLETERA_PREMIOS',
    '0xdb11c06794d779eaf8aac59f099ae32ef493bdd4').lower()

# NUESTRAS billeteras, todas. No solo la que paga hoy.
#
# La de premios cambio —antes era la 0x7462…— y esa direccion vieja anduvo
# circulando: esta en mensajes, en notas y en la version anterior de este
# archivo. Alguien puede pegarla de buena fe creyendo que es la suya, o no tan
# de buena fe. Si solo se rechazara la que paga hoy, mandarnos la vieja seria
# un premio pagado a una cuenta nuestra, y en una cadena eso no se deshace.
#
# Una direccion que sale de esta lista no vuelve a entrar: quitar una de aqui
# es abrir exactamente ese agujero.
BILLETERAS_INTERNAS = {
    BILLETERA_PREMIOS,
    '0x746268404cc9ca2ef0ac344f02b236db232c3ad8',   # la anterior de premios
}

_candado = threading.Lock()

DIRECCION = re.compile(r'0x[0-9a-fA-F]{40}')


def preparar(carpeta):
    global DATOS
    DATOS = carpeta


def _archivo():
    return None if DATOS is None else DATOS / 'premios.json'


def _llano(t):
    n = unicodedata.normalize('NFD', (t or '').lower().strip())
    return ''.join(c for c in n if unicodedata.category(c) != 'Mn')


# ── Las preguntas ───────────────────────────────────────────────────────────
#
# Cada una: lo que se pregunta, lo que cuenta como acierto, y QUE SE APRENDE si
# no se acierta. Lo tercero es lo que convierte el examen en clase.
PREGUNTAS = [
    {
        'pregunta': (
            'Primera, la más fácil.\n\n'
            '¿A qué sigue el precio de ORIGEN?'),
        'acierta': re.compile(r'\b(oro|gold|metal)\b'),
        'ensena': (
            'Casi. Sigue al ORO — no al dólar ni a la moneda de tu país. Por '
            'eso lo que guardás no se achica cuando tu moneda se devalúa.'),
        'bien': '¡Eso! Al oro. Ni al dólar ni a tu moneda local.',
    },
    {
        'pregunta': (
            'Segunda.\n\n'
            'Un ORIGEN equivale a un gramo de oro dividido entre… ¿cuánto?'),
        'acierta': re.compile(r'\b(55|cincuenta y cinco|cincuenta ?y ?cinco)\b'),
        'ensena': (
            'Entre cincuenta y cinco. Se le dice «un gramin». Y la fórmula es '
            'pública: podés rehacer el precio con una calculadora cuando '
            'quieras, sin preguntarle a nadie.'),
        'bien': (
            '¡Exacto! Entre cincuenta y cinco. Un «gramin». Y esa fórmula es '
            'pública: la podés rehacer vos con una calculadora.'),
    },
    {
        # LA PREGUNTA QUE JUSTIFICA EL PREMIO ENTERO. Se aprende cobrando en
        # vez de perdiendo, que es la unica forma buena de aprender esto.
        'pregunta': (
            'Última, y es la que más me importa.\n\n'
            'Tu frase de respaldo —esas palabras que te da la billetera—, '
            '¿a quién se la podés dar?'),
        'acierta': re.compile(r'\b(a nadie|nadie|ninguno|ninguna|a ninguno|'
                              r'solo yo|solo a mi|nadie mas|a mi)\b'),
        'ensena': (
            'A NADIE. Ni a mí, ni a nadie que diga que es de Orden Global. '
            'Quien te la pida te está robando, sin excepción. Es lo único que '
            'abre tu dinero.'),
        'bien': (
            '¡Esa es! A nadie. Ni a mí. Quien te la pida te está robando, '
            'aunque diga que es de la casa.'),
    },
]


# ── Los estados del juego ───────────────────────────────────────────────────
#
# Viven en el perfil de la persona, asi que se van con ella cuando se cumple el
# mes de olvido. Un juego a medias no es un dato que valga la pena guardar mas
# que eso.

def arrancar():
    return {'paso': 0, 'desde': int(time.time())}


def pregunta_de(estado):
    i = (estado or {}).get('paso', 0)
    return PREGUNTAS[i]['pregunta'] if i < len(PREGUNTAS) else None


def responder(estado, dicho):
    """Mira lo que contestaron. Devuelve `(texto, terminado)`.

    Nunca deja a nadie afuera: si se equivoca, se le explica y se pasa a la
    siguiente igual. Ver la cabecera — el examen es una clase, no un filtro.
    """
    i = estado.get('paso', 0)
    if i >= len(PREGUNTAS):
        return None, True
    q = PREGUNTAS[i]
    acerto = bool(q['acierta'].search(_llano(dicho)))
    estado['paso'] = i + 1
    estado.setdefault('aciertos', 0)
    if acerto:
        estado['aciertos'] += 1
    texto = q['bien'] if acerto else q['ensena']

    if estado['paso'] < len(PREGUNTAS):
        return texto + '\n\n' + PREGUNTAS[estado['paso']]['pregunta'], False
    return texto, True


PIDE_BILLETERA = (
    'Listo, terminaste. Ya sabés más de tu plata que la mayoría. 🌱\n\n'
    'Ahora lo tuyo: abrí tu Veta Wallet, copiá la dirección de tu billetera '
    '—empieza con 0x— y pegámela por acá.\n\n'
    'Ahí te mando tu ORIGEN.')


# ── La direccion que mandan ─────────────────────────────────────────────────

def leer_direccion(dicho):
    """Saca una direccion del mensaje, o `None`.

    Se busca DENTRO del texto y no se exige que venga sola: la gente pega la
    direccion con un «esta es» adelante, o con un emoji detras, y rechazarla
    por eso seria perder a alguien en el ultimo paso.
    """
    m = DIRECCION.search(dicho or '')
    return m.group(0).lower() if m else None


def problema_con(direccion):
    """Por que NO se puede pagar a esa direccion. `None` si esta bien."""
    if not direccion:
        return None
    if direccion.lower() in BILLETERAS_INTERNAS:
        # Alguien mandando una billetera nuestra. No es necesariamente picardia
        # —la vieja de premios anduvo circulando y se puede copiar de buena fe—
        # pero pagarnos a nosotros mismos no tiene ningun sentido.
        return 'Esa es una billetera nuestra. Mandame la tuya.'
    return None


# ── El registro, que es lo que impide repetir ───────────────────────────────

class RegistroIlegible(Exception):
    """El archivo de reclamos existe y no se puede leer.

    Existe para poder FALLAR CERRADO. Si un archivo corrupto se leyera como «no
    hay reclamos», todo el mundo podria volver a cobrar — y en una cadena eso
    no se deshace. Negarse a pagar se arregla arreglando el archivo; pagar dos
    veces no se arregla.
    """


def _cargar():
    f = _archivo()
    if f is None or not f.exists():
        return {'reclamos': []}       # el primer reclamo: no es un fallo
    try:
        d = json.loads(f.read_text(encoding='utf8'))
    except Exception as e:
        raise RegistroIlegible(str(e)) from e
    if not isinstance(d, dict) or not isinstance(d.get('reclamos'), list):
        raise RegistroIlegible('el archivo no tiene la forma esperada')
    return d


def _guardar(d):
    f = _archivo()
    if f is None:
        return
    tmp = f.with_suffix('.tmp')
    # 600 desde el primer byte: aqui hay telefonos y direcciones de billetera
    # de personas de verdad.
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                 stat.S_IRUSR | stat.S_IWUSR)
    with os.fdopen(fd, 'w', encoding='utf8') as fh:
        json.dump(d, fh, ensure_ascii=False, indent=1)
    tmp.replace(f)


def ya_reclamo(telefono=None, direccion=None):
    """`'telefono'`, `'billetera'` o `None`. Las dos llaves, no una.

    Solo por telefono: una persona con dos numeros cobra dos veces.
    Solo por billetera: la misma persona con dos billeteras cobra dos veces.
    """
    with _candado:
        try:
            reclamos = _cargar()['reclamos']
        except RegistroIlegible:
            # FALLA CERRADO: no se puede comprobar, asi que se contesta que si
            # reclamo. Nadie cobra hasta que una persona mire el archivo. Es
            # molesto y recuperable; lo contrario no.
            return 'ilegible'
        for r in reclamos:
            if telefono and r.get('quien') == telefono:
                return 'telefono'
            if direccion and r.get('direccion') == (direccion or '').lower():
                return 'billetera'
    return None


def anotar(quien, direccion, aciertos):
    """Deja el pago LISTO para que una persona lo mande. No paga.

    Devuelve `(ok, motivo)`. `ok` en falso cuando alguien ya cobro — y eso se
    vuelve a comprobar AQUI y no solo antes de preguntar, porque entre que
    empezo el juego y mando la direccion pudo haber cobrado por otro lado.
    """
    direccion = (direccion or '').lower()
    with _candado:
        try:
            d = _cargar()
        except RegistroIlegible:
            return False, 'ilegible'       # ver `ya_reclamo`: se falla cerrado
        # El tope, DENTRO del candado y con la lista ya leida: comprobarlo
        # fuera dejaria pasar a dos a la vez justo en el ultimo premio.
        if len(d['reclamos']) >= TOPE_PREMIOS:
            return False, 'agotado'
        for r in d['reclamos']:
            if r.get('quien') == quien:
                return False, 'telefono'
            if r.get('direccion') == direccion:
                return False, 'billetera'
        d['reclamos'].append({
            'quien': quien,
            'direccion': direccion,
            'aciertos': aciertos,
            'de': len(PREGUNTAS),
            'cuando': int(time.time()),
            'premio': PREMIO,
            'pagado': False,          # lo pone una persona al mandarlo
            'tx': None,
        })
        _guardar(d)
    return True, None


def cuantos_van():
    """Reclamos hechos. `None` si el registro no se puede leer."""
    with _candado:
        try:
            return len(_cargar()['reclamos'])
        except RegistroIlegible:
            return None


def quedan():
    """Cuantos premios sobran. Cero si se acabaron o si no se puede saber.

    Que un registro ilegible devuelva cero es a proposito: es la misma regla
    de fallar cerrado. Si no se puede contar, no se reparte.
    """
    van = cuantos_van()
    return 0 if van is None else max(0, TOPE_PREMIOS - van)


def agotado():
    return quedan() <= 0


def por_pagar():
    """Lo que espera que alguien lo mande. Para el panel o para un vistazo."""
    with _candado:
        try:
            return [r for r in _cargar()['reclamos'] if not r.get('pagado')]
        except RegistroIlegible:
            return []


def marcar_pagado(direccion, tx):
    """Cuando ya se mandó de verdad, con el hash de la transacción."""
    direccion = (direccion or '').lower()
    with _candado:
        try:
            d = _cargar()
        except RegistroIlegible:
            return False
        for r in d['reclamos']:
            if r.get('direccion') == direccion and not r.get('pagado'):
                r['pagado'], r['tx'] = True, tx
                _guardar(d)
                return True
    return False


def resumen():
    with _candado:
        try:
            rs = _cargar()['reclamos']
        except RegistroIlegible:
            return {'reclamos': None, 'por_pagar': None, 'pagados': None,
                    'ilegible': True}
    return {'reclamos': len(rs),
            'por_pagar': sum(1 for r in rs if not r.get('pagado')),
            'pagados': sum(1 for r in rs if r.get('pagado')),
            'tope': TOPE_PREMIOS,
            'quedan': max(0, TOPE_PREMIOS - len(rs))}
