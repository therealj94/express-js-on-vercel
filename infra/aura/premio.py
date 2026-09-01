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
# ── LO QUE ESTO NO HACE: PAGAR ──────────────────────────────────────────────
#
# Este modulo comprueba, deduplica y deja el pago LISTO. No lo manda, y hay
# una prueba que vigila que aqui no entre nada que firme.
#
# El que paga es `pagador.py`, un PROCESO APARTE que Jose autorizo el 30-ago:
# no conversa con nadie, no importa el motor, y firma con una billetera
# dedicada que se fondea con lo justo — el peor fallo imaginable pierde lo que
# hay en ella y ni un gramin mas. La separacion es la seguridad: el proceso
# que habla no puede pagar, y el proceso que paga no escucha a nadie.
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

# LA QUE PAGA DE VERDAD, que desde el 30-ago es la del pagador automatico y no
# la de mercadeo.
#
# La distincion no es cosmetica y ya mordio: el parte vigilaba el saldo de
# MERCADEO —296 ORIGEN— mientras la que de verdad manda los premios tenia 205.
# Si esa se vaciara, el parte habria seguido diciendo 296 tan tranquilo
# mientras cada premio fallaba por falta de fondos. Lo que se vigila tiene que
# ser lo que se gasta.
#
# Es publica —una direccion siempre lo es— y esta aqui para dos cosas: para
# saber de donde sale el dinero, y para RECHAZARLA si alguien la manda como
# suya.
BILLETERA_PREMIOS = os.environ.get(
    'AURA_BILLETERA_PREMIOS',
    '0x51279aa19dff9820158b461998e213b93759c861').lower()

# NUESTRAS billeteras, todas. No solo la que paga hoy.
#
# La de premios ya cambio DOS veces —0x7462… y luego mercadeo— y esas
# direcciones andan circulando: estan en mensajes, en notas y en versiones
# anteriores de este archivo. Alguien puede pegar una de buena fe creyendo que
# es la suya, o no tan de buena fe. Si solo se rechazara la que paga hoy,
# mandarnos una vieja seria un premio pagado a una cuenta nuestra, y en una
# cadena eso no se deshace.
#
# Una direccion que entra a esta lista no sale: quitar una de aqui es abrir
# exactamente ese agujero.
BILLETERAS_INTERNAS = {
    BILLETERA_PREMIOS,
    '0x746268404cc9ca2ef0ac344f02b236db232c3ad8',   # la primera de premios
    '0xdb11c06794d779eaf8aac59f099ae32ef493bdd4',   # mercadeo, que la fondea
}

# ── EL CANDADO ES DOBLE, Y DESDE EL PAGO AUTOMATICO TIENE QUE SERLO ─────────
#
# El `threading.Lock` protege entre hilos DEL MISMO proceso. Pero desde que el
# pagador corre como servicio aparte, hay DOS procesos leyendo y escribiendo
# `premios.json`: el asistente anota reclamos y el pagador los marca pagados.
# Un candado de hilos no ve al otro proceso, y la carrera perdida es la peor
# posible: el pagador marca «pagado», el asistente pisa el archivo con su copia
# vieja, el reclamo vuelve a «sin pagar» — y se paga DOS VECES. En una cadena
# eso no se deshace.
#
# Por eso ademas del lock de hilos se toma un `flock` sobre un archivo de
# traba: ese si lo ven los dos procesos, y el sistema lo suelta solo si el
# proceso muere — no queda trabado para siempre por un crash.
class _CandadoDoble:
    def __init__(self):
        self._hilos = threading.Lock()
        self._fd = None

    def __enter__(self):
        self._hilos.acquire()
        if DATOS is not None:
            import fcntl
            self._fd = os.open(DATOS / 'premios.traba',
                               os.O_WRONLY | os.O_CREAT,
                               stat.S_IRUSR | stat.S_IWUSR)
            fcntl.flock(self._fd, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        if self._fd is not None:
            import fcntl
            fcntl.flock(self._fd, fcntl.LOCK_UN)
            os.close(self._fd)
            self._fd = None
        self._hilos.release()
        return False


_candado = _CandadoDoble()

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
# ── LAS TRES PREGUNTAS, EN LOS DOS IDIOMAS ─────────────────────────────────
#
# Quien elige English y despues recibe las preguntas en espanol se va, y con
# razon: le prometimos algo en su idioma y se lo dimos en otro. El juego es el
# gancho de todo el embudo — romperlo ahi es romperlo entero.
#
# `acierta` es UNA SOLA expresion para los dos idiomas, no una por idioma. La
# gente contesta como le sale: alguien en el camino en ingles escribe «gold» y
# alguien en el camino en espanol escribe «oro», pero tambien pasa al reves —y
# quien contesta bien en el otro idioma acerto igual. Partirlas seria inventar
# un error que no existe.

PREGUNTAS = [
    {
        'pregunta': {
            'es': ('Primera, la más fácil.\n\n'
                   '¿A qué sigue el precio de ORIGEN?'),
            'en': ('First one, the easy one.\n\n'
                   'What does the price of ORIGEN follow?'),
        },
        'acierta': re.compile(r'\b(oro|gold|metal)\b'),
        'ensena': {
            'es': ('Casi. Sigue al ORO — no al dólar ni a la moneda de tu país. '
                   'Por eso lo que guardás no se achica cuando tu moneda se '
                   'devalúa.'),
            'en': ('Close. It follows GOLD — not the dollar, not your country '
                   'currency. That is why what you keep does not shrink when '
                   'your currency does.'),
        },
        'bien': {
            'es': '¡Eso! Al oro. Ni al dólar ni a tu moneda local.',
            'en': 'That is it! Gold. Not the dollar, not your local currency.',
        },
    },
    {
        'pregunta': {
            'es': ('Segunda.\n\n'
                   'Un ORIGEN equivale a un gramo de oro dividido entre… '
                   '¿cuánto?'),
            'en': ('Second.\n\n'
                   'One ORIGEN equals a gram of gold divided by… how much?'),
        },
        'acierta': re.compile(r'\b(55|cincuenta y cinco|cincuenta ?y ?cinco|'
                              r'fifty ?five|fifty-five)\b'),
        'ensena': {
            'es': ('Entre cincuenta y cinco. Se le dice «un gramin». Y la '
                   'fórmula es pública: podés rehacer el precio con una '
                   'calculadora cuando quieras, sin preguntarle a nadie.'),
            'en': ('By fifty-five. We call it «a gramin». And the formula is '
                   'public: you can redo the price with a calculator whenever '
                   'you want, without asking anyone.'),
        },
        'bien': {
            'es': ('¡Exacto! Entre cincuenta y cinco. Un «gramin». Y esa '
                   'fórmula es pública: la podés rehacer vos con una '
                   'calculadora.'),
            'en': ('Exactly! By fifty-five. A «gramin». And that formula is '
                   'public: you can redo it yourself with a calculator.'),
        },
    },
    {
        # LA PREGUNTA QUE JUSTIFICA EL PREMIO ENTERO. Se aprende cobrando en
        # vez de perdiendo, que es la unica forma buena de aprender esto.
        'pregunta': {
            'es': ('Última, y es la que más me importa.\n\n'
                   'Tu frase de respaldo —esas palabras que te da la '
                   'billetera—, ¿a quién se la podés dar?'),
            'en': ('Last one, and the one I care about most.\n\n'
                   'Your recovery phrase —those words the wallet gives you—, '
                   'who can you give it to?'),
        },
        'acierta': re.compile(r'\b(a nadie|nadie|ninguno|ninguna|a ninguno|'
                              r'solo yo|solo a mi|nadie mas|a mi|'
                              r'no ?one|nobody|only me|myself)\b'),
        'ensena': {
            'es': ('A NADIE. Ni a mí, ni a nadie que diga que es de Orden '
                   'Global. Quien te la pida te está robando, sin excepción. '
                   'Es lo único que abre tu dinero.'),
            'en': ('NOBODY. Not me, not anyone claiming to be Orden Global. '
                   'Whoever asks for it is robbing you, no exceptions. It is '
                   'the only thing that opens your money.'),
        },
        'bien': {
            'es': ('¡Esa es! A nadie. Ni a mí. Quien te la pida te está '
                   'robando, aunque diga que es de la casa.'),
            'en': ('That is the one! Nobody. Not even me. Whoever asks for it '
                   'is robbing you, even if they say they are us.'),
        },
    },
]

IDIOMAS = ('es', 'en')
POR_OMISION = 'es'


def _en(valor, idioma):
    """Un campo en el idioma pedido, con el espanol de respaldo."""
    if not isinstance(valor, dict):
        return valor
    return valor.get(idioma) or valor.get(POR_OMISION)


# ── Los estados del juego ───────────────────────────────────────────────────
#
# Viven en el perfil de la persona, asi que se van con ella cuando se cumple el
# mes de olvido. Un juego a medias no es un dato que valga la pena guardar mas
# que eso.

def arrancar():
    return {'paso': 0, 'desde': int(time.time())}


def pregunta_de(estado, idioma=POR_OMISION):
    i = (estado or {}).get('paso', 0)
    return _en(PREGUNTAS[i]['pregunta'], idioma) if i < len(PREGUNTAS) else None


def responder(estado, dicho, idioma=POR_OMISION):
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
    texto = _en(q['bien'] if acerto else q['ensena'], idioma)

    if estado['paso'] < len(PREGUNTAS):
        siguiente = _en(PREGUNTAS[estado['paso']]['pregunta'], idioma)
        return texto + '\n\n' + siguiente, False
    return texto, True


PIDE_BILLETERA = {
    'es': ('Listo, terminaste. Ya sabés más de tu plata que la mayoría. 🌱\n\n'
           'Ahora lo tuyo: abrí tu Veta Wallet en app.vetawallet.com, copiá la '
           'dirección de tu billetera —empieza con 0x— y pegámela por acá.\n\n'
           'Ahí te mando tu ORIGEN.'),
    'en': ('Done, you finished. You now know more about your money than most '
           'people. 🌱\n\n'
           'Your turn: open your Veta Wallet at app.vetawallet.com, copy your '
           'wallet address —it starts with 0x— and paste it here.\n\n'
           'That is where I send your ORIGEN.'),
}


def pide_billetera(idioma=POR_OMISION):
    return _en(PIDE_BILLETERA, idioma)


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


def quienes(cuantos=10):
    """Los ultimos premios, CON NOMBRE. `None` si el archivo no se puede leer.

    ── POR QUE HIZO FALTA ──────────────────────────────────────────────────

    Jose, 1-sep: «queria saber a quien se le envio 1 ORIGEN, no se me notifico
    y pregunte y no supo contestar».

    Tenia razon en las dos mitades. `resumen()` cuenta —cuantos reclamados,
    cuantos pagados, cuantos quedan— y NUNCA dice a quien. Asi que aunque
    preguntara, no habia de donde sacarlo: no era que AU-RA no entendiera la
    pregunta, es que el dato no estaba a mano en ninguna parte.

    Un contador de premios que no puede decir a quien se le pago es un
    contador, no un registro.

    Lo devuelve en crudo; quien lo ensene decide cuanto recorta. Aqui no se
    formatea porque este modulo tiene prohibido saber de WhatsApp.
    """
    with _candado:
        try:
            rs = _cargar()['reclamos']
        except RegistroIlegible:
            return None
    ordenados = sorted(rs, key=lambda r: r.get('cuando') or 0, reverse=True)
    return [{'quien': r.get('quien') or '',
             'direccion': r.get('direccion') or '',
             'pagado': bool(r.get('pagado')),
             'tx': r.get('tx'),
             'cuando': r.get('cuando') or 0}
            for r in ordenados[:cuantos]]


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
