#!/usr/bin/env python3
"""AU-RA dentro de PULSE2CHAT: el asistente que atiende por el chat.

══ QUE ES ════════════════════════════════════════════════════════════════════

Una ficha mas del chat. Se llama AU-RA, tiene su gid, y las personas del
grupo de prueba le escriben como a cualquier contacto: solicitud de amistad,
la acepta, y conversan. Por dentro, cada pregunta viaja al motor (Ollama, en
esta misma maquina) con el prompt de la casa, las fichas del saber y lo que
la persona conto de si misma al empezar.

No hay app nueva que instalar ni pantalla nueva que aprender: el chat que ya
existe ES la interfaz. Los grupos, las notificaciones y la identidad ya
estaban construidos; el asistente solo se sienta a la mesa.

══ EL CIFRADO, DICHO SIN RODEOS ══════════════════════════════════════════════

El chat es cifrado de punta a punta ENTRE PERSONAS, y eso no se toca. Este
asistente funciona porque nunca publica llaves de aparato: el cliente, al ver
que el destinatario no tiene llaves (`cerrarPara` devuelve null si `aparatos`
esta vacio, chat.js:257), manda el texto en claro para el. O sea:

  · persona ↔ persona   sigue cerrado de punta a punta, como siempre
  · persona ↔ AU-RA     viaja por TLS y lo lee este proceso en el servidor

Eso es un intercambio, no un truco, y el asistente lo dice en su primer
mensaje. La gente decide sabiendo.

══ LO QUE EL PANEL DE REVISION ENCONTRO, Y COMO QUEDO ════════════════════════

Antes de producción, tres revisores independientes leyeron este archivo
contra el relevo real y un verificador refuto cada hallazgo contra el codigo.
Los confirmados mandan sobre el diseño de este archivo:

  · El «esta pensando» tragaba mensajes. La puerta era `sinLeer` del relevo,
    y /leido sella la hora ACTUAL: un mensaje mandado mientras el motor
    generaba (hasta 90s) quedaba detras del sello y no se contestaba nunca.
    Ahora la puerta es NUESTRA: se compara el `cuando` del ultimo mensaje de
    la charla contra el tope local, y el tope solo avanza con lo procesado.
  · El «visto» avanzaba aunque el envio fallara: el mensaje de la persona se
    consumia en silencio. Ahora solo avanza cuando atender() termino bien; un
    mensaje que falla se reintenta, y al tercer fallo se salta CON RUIDO en
    el registro (un mensaje venenoso no puede ciclar para siempre).
  · Un perfil perdido disparaba una avalancha: con visto=0 la bandeja entera
    (hasta 200 mensajes) se recontestaba a medio minuto de motor cada una.
    Ahora una charla sin tope conocido arranca EN EL PRESENTE: se salta lo
    viejo y se atiende solo lo que llegue desde ahora.
  · Una respuesta lenta bloqueaba a los otros catorce: el bucle era monohilo
    y el motor tarda 15-90s. Ahora cada charla se atiende en su hilo (pocos,
    con candado por charla y por estado); el motor en CPU igual atiende de a
    uno, pero nadie espera a que OTRA persona termine para que la suya entre
    a la cola.
  · Los perfiles se guardaban solo al final de la vuelta entera: una caida a
    mitad perdia lo avanzado. Ahora se guardan al cerrar cada charla.
  · Dos instancias a la vez contestarian doble: candado de archivo al
    arrancar; la segunda instancia se despide sola.
  · Si el saludo fallaba tras aceptar la amistad, la primera respuesta de la
    persona se comia como si fuera de la entrevista. Ahora `saludado` se
    marca solo con el saludo ENVIADO, y un mensaje de alguien sin saludar
    dispara el saludo en vez de consumirse.

══ CONFIGURACION (variables de entorno) ══════════════════════════════════════

  AURA_RELEVO    https://cerebro.ordenscan.com/mensajes  (sin barra final)
  AURA_CORREO    aura@ordenglobal.org
  AURA_DATOS     /srv/aura   — llave.txt, perfiles.json, probadores.txt,
                               PROMPT-AURA.md, saber.json
  AURA_MOTOR     http://127.0.0.1:11434
  AURA_MODELO    llama3.2
  AURA_PASO      segundos entre vueltas (1.2)

En el primer arranque, si no hay llave.txt, se da de alta solo en el relevo y
guarda la llave con permisos 600. La llave NUNCA va al repositorio.
"""
import base64
import fcntl
import json
import os
import pathlib
import re as _re
import stat
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

RELEVO = os.environ.get('AURA_RELEVO', 'https://cerebro.ordenscan.com/mensajes').rstrip('/')
CORREO = os.environ.get('AURA_CORREO', 'aura@ordenglobal.org').lower()
DATOS = pathlib.Path(os.environ.get('AURA_DATOS', '/srv/aura'))
MOTOR = os.environ.get('AURA_MOTOR', 'http://127.0.0.1:11434').rstrip('/')
# Las dos formas de pensar. La rapida contesta al vuelo; la pensadora es un
# modelo mas grande que tarda el doble o el triple y razona mejor. La persona
# cambia diciendo «modo pensador» / «modo rapido» — sin menus ni protocolo
# nuevo: palabras, que es lo que un chat ya sabe llevar.
MODELO_RAPIDA = os.environ.get('AURA_MODELO', 'llama3.2')
MODELO_PENSADORA = os.environ.get('AURA_MODELO_PENSADOR', 'llama3.1:8b')
# La voz vive en la misma maquina, en 127.0.0.1. No sale a internet ni por
# error: un modelo de voz abierto al mundo es una fabrica de audio gratis
# para el primero que la encuentre, y ademas una forma comoda de dejar la
# GPU ocupada para siempre.
VOZ = os.environ.get('AURA_VOZ', 'http://127.0.0.1:8123').rstrip('/')
# Los tres registros que entiende el servicio de voz. El nombre que ve la
# persona vive alla; aca solo viajan las llaves.
REGISTROS = ('calida', 'sobria', 'agil')
# La cadena, para leer el saldo PUBLICO de la persona (es dato de cadena, no
# un secreto: cualquiera con la direccion lo ve en el explorador).
RPC = os.environ.get('AURA_RPC', 'https://ordenglobal-rpc.com')
# Cada cuanto mira el relevo. Estaba en 4 segundos, y con eso un mensaje
# esperaba hasta cuatro segundos ANTES de que AU-RA se enterara de que
# existia — espera muerta, sin nadie trabajando, encima de los cinco
# segundos que cuesta pensar la respuesta. Con quince probadores el relevo
# no se despeina por mirarlo cada segundo, y esos tres segundos son la
# diferencia entre «contesta» y «se tarda».
PASO = float(os.environ.get('AURA_PASO', '1.2'))

# La maquina es un t2.large sin GPU: una respuesta puede tardar medio minuto.
# El timeout corto tipico (10s) mataria respuestas perfectamente sanas.
TIMEOUT_MOTOR = int(os.environ.get('AURA_TIMEOUT', '90'))

# Techo de respuestas DEL MOTOR por persona por dia. La entrevista no cuenta:
# no gasta motor. Sin techo, una persona con un bucle deja al motor ocupado
# para los otros catorce.
TECHO_DIA = int(os.environ.get('AURA_TECHO', '60'))

# Cuantos turnos de memoria lleva cada charla al motor. Mas historial empuja
# las fichas fuera de la ventana del modelo, y sin fichas el modelo inventa.
MEMORIA = 8

# Cuantos mensajes de una misma persona se atienden por vuelta. No se pierde
# ninguno —el tope no avanza sobre lo no procesado—, solo se les pone paso.
POR_VUELTA = 4

# Cuantas charlas a la vez. El motor en CPU atiende de a una igual (Ollama
# las encola), pero asi nadie espera a que la charla de OTRO termine para
# que la suya entre a la cola.
HILOS = 3

# Al tercer fallo seguido atendiendo el mismo mensaje, se salta con ruido.
# Un mensaje venenoso no puede dejar la charla ciclando para siempre.
REINTENTOS = 3


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ── hablar con el relevo ─────────────────────────────────────────────────────

def _post(ruta, cuerpo, timeout=20):
    req = urllib.request.Request(
        RELEVO + ruta, method='POST',
        data=json.dumps(cuerpo).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b'{}')


class Relevo:
    """El asistente como cliente del chat: mismas rutas que usa la app."""

    def __init__(self, correo, llave):
        self.correo, self.llave = correo, llave

    def _f(self, extra):
        return {'correo': self.correo, 'llave': self.llave, **extra}

    def solicitudes(self):
        return _post('/amistad/lista', self._f({})).get('recibidas', [])

    def aceptar(self, de):
        return _post('/amistad/responder', self._f({'de': de, 'aceptar': True}))

    def conversaciones(self):
        return _post('/conversaciones', self._f({})).get('conversaciones', [])

    def bandeja(self, desde):
        return _post('/bandeja', self._f({'desde': desde})).get('mensajes', [])

    def leido(self, de):
        try:
            _post('/leido', self._f({'de': de}), timeout=8)
        except Exception:
            pass   # el doble check es cortesia; no puede tumbar nada

    def escribiendo(self, para):
        # Con respuestas que tardan medio minuto, este aviso es la diferencia
        # entre «esta pensando» y «murio».
        try:
            _post('/escribiendo', self._f({'para': para}), timeout=6)
        except Exception:
            pass

    def enviar(self, para, texto):
        return _post('/enviar', self._f({'para': para, 'texto': texto}))

    def subir(self, datos, mime, nombre, tipo='voz'):
        """Sube un adjunto y devuelve su id.

        El binario NO viaja dentro del mensaje: primero se sube y despues se
        manda el id. Asi un reintento no duplica megas en el hilo.
        """
        d = _post('/subir', self._f({
            'tipo': tipo, 'mime': mime, 'nombre': nombre,
            'datos': base64.b64encode(datos).decode()}), timeout=60)
        return d.get('id', '')

    def enviar_voz(self, para, archivo):
        return _post('/enviar', self._f({
            'para': para, 'texto': '', 'tipo': 'voz', 'archivo': archivo}))

    def ficha(self, de):
        try:
            return _post('/ficha', self._f({'de': de}), timeout=8)
        except Exception:
            return {}


# ── el alta, una sola vez ────────────────────────────────────────────────────

def llave_del_asistente():
    DATOS.mkdir(parents=True, exist_ok=True)
    f = DATOS / 'llave.txt'
    if f.exists():
        return f.read_text().strip()
    d = _post('/alta', {'correo': CORREO, 'nombre': 'AU-RA', 'gid': 'AURA'})
    llave = d.get('llave')
    if not llave:
        raise SystemExit(f'el relevo no dio llave: {d}')
    f.write_text(llave)
    f.chmod(stat.S_IRUSR | stat.S_IWUSR)   # 600: la llave es la identidad
    log('cuenta creada en el relevo:', CORREO)
    return llave


def instancia_unica():
    """Dos asistentes a la vez contestarian todo doble. El candado vive en un
    archivo: si otro proceso lo tiene, este se despide sin drama."""
    f = open(DATOS / 'candado.pid', 'w')
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        raise SystemExit('ya hay un asistente corriendo; me voy')
    f.write(str(os.getpid()))
    f.flush()
    return f   # se devuelve para que viva lo que viva el proceso


# ── quien puede hablarle ─────────────────────────────────────────────────────

def probadores():
    """Un correo por linea; # comenta. Se relee en cada vuelta a proposito:
    agregar a alguien es editar el archivo, sin reiniciar nada."""
    f = DATOS / 'probadores.txt'
    if not f.exists():
        return set()
    return {l.strip().lower() for l in f.read_text().splitlines()
            if l.strip() and not l.strip().startswith('#')}


# ── la memoria del asistente ─────────────────────────────────────────────────

CANDADO_PERFILES = threading.Lock()


def cargar_perfiles():
    f = DATOS / 'perfiles.json'
    if f.exists():
        try:
            return json.loads(f.read_text())
        except Exception:
            # Un JSON roto no puede tumbar el servicio; se aparta y se empieza
            # de nuevo. Perder perfiles es malo; quedarse mudo es peor. Las
            # charlas afectadas arrancan EN EL PRESENTE (ver tope abajo): no
            # hay avalancha de recontestar lo viejo.
            f.rename(DATOS / f'perfiles.roto.{int(time.time())}.json')
    return {}


def guardar_perfiles(p):
    with CANDADO_PERFILES:
        tmp = DATOS / 'perfiles.tmp'
        tmp.write_text(json.dumps(p, ensure_ascii=False, indent=1))
        tmp.replace(DATOS / 'perfiles.json')   # atomico: nunca medio archivo


# ── quien es, y cuanto tiene en la cadena ────────────────────────────────────

_SALDOS = {}   # correo -> (epoca, texto)


def origen_de(addr):
    """El saldo PUBLICO de una direccion en la 5550. Es lo mismo que ve
    cualquiera en el explorador: no hay secreto ninguno en juego. Si el RPC no
    contesta, se devuelve None y el prompt simplemente no lo lleva — AU-RA
    tiene prohibido inventarlo."""
    cuerpo = json.dumps({'jsonrpc': '2.0', 'method': 'eth_getBalance',
                         'params': [addr, 'latest'], 'id': 1}).encode()
    req = urllib.request.Request(RPC, data=cuerpo, method='POST',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.loads(r.read())
    return int(j['result'], 16) / 1e18


# ── CUANDO EL SALDO VIAJA, Y CUANDO NO ────────────────────────────────────
#
# El saldo viajaba en CADA pregunta, y eso rompio la conversacion de una forma
# que no se ve venir. Ante un «Hola» o un «¿qué podés hacer?» el modelo no
# tiene nada concreto a lo que agarrarse, asi que recita lo unico concreto que
# tiene delante: «Tengo notado que tu billetera tiene 20.9918 ORIGEN». Y como
# esa respuesta queda en el historial, en el turno siguiente se copia a si
# misma. Dos preguntas distintas, la misma respuesta palabra por palabra —
# pasado en produccion, con captura.
#
# Asi que el saldo solo viaja cuando la pregunta es DE PLATA. Si alguien
# pregunta cuanto tiene, lo tiene; si saluda, no le recitan su cuenta.
DE_PLATA = _re.compile(
    r'\b(saldo|cuanto|cuánto|plata|dinero|billetera|wallet|origen|balance|'
    r'tengo|ten[eé]s|monto|transferi|envi|mand[aá]|cobr|pag|deposit|retir)',
    _re.IGNORECASE)


def quien_es(rel, correo, perfil, dicho=''):
    """La linea de contexto de la persona: nombre, gid, y el saldo SOLO si
    viene al caso. Con cache de cinco minutos — el saldo no cambia tan rapido
    como para pagar un RPC por pregunta."""
    ahora = time.time()
    con_saldo = bool(DE_PLATA.search(dicho or ''))
    en_cache = _SALDOS.get(correo)
    if en_cache and ahora - en_cache[0] < 300:
        base, saldo = en_cache[1], en_cache[2]
        return f'{base}; {saldo}' if (con_saldo and saldo) else base
    f = rel.ficha(correo)
    partes = []
    nombre = (f.get('nombre') or '').strip()
    if nombre:
        partes.append(f"se llama {nombre.split()[0]}")
    if (f.get('gid') or '').strip():
        partes.append(f"su Genesis ID declarado es {f['gid'].strip()[:40]}")
    saldo = ''
    addr = (f.get('addr') or '').strip()
    if addr.startswith('0x') and len(addr) == 42:
        try:
            saldo = f"su billetera tiene {origen_de(addr):,.4f} ORIGEN en la cadena"
        except Exception:
            pass   # sin dato no hay linea; inventar esta prohibido
    base = ('; '.join(partes)) if partes else ''
    _SALDOS[correo] = (ahora, base, saldo)
    return f'{base}; {saldo}' if (con_saldo and saldo and base) else (
        saldo if (con_saldo and saldo) else base)


# ── la entrevista de entrada ─────────────────────────────────────────────────
#
# Las preguntas de conocer a la persona NO las hace el modelo: las hace este
# codigo, en orden fijo. Un modelo al que se le pide «preguntale cosas» un dia
# pregunta de mas, otro dia no pregunta, y otro dia pregunta algo indebido.
# La entrevista es la primera impresion del producto: va escrita, no
# improvisada. Y no gasta motor: contesta al instante.

SALUDO = (
    "Hola, soy AU-RA, la inteligencia de Orden Global. Estás en el grupo de "
    "prueba, así que bienvenido dos veces.\n\n"
    "Una cosa primero, porque acá se dice todo: esta conversación conmigo la "
    "procesa nuestro servidor para poder contestarte. Tus chats con otras "
    "personas siguen cifrados de punta a punta y ahí no entra nadie — yo "
    "tampoco.\n\n"
    "Para ayudarte mejor me gustaría conocerte un poco. ¿A qué te dedicás?")

PREGUNTAS = [
    ('trabajo', None),   # la hace el saludo
    ('estudios', "Buenísimo. ¿Y qué estudiaste, o dónde se formó tu experiencia?"),
    ('interes', "Última y te dejo tranquilo: ¿qué te gustaría lograr con "
                "Orden Global — ahorrar, pagar, entender la cadena, otra cosa?"),
]

CIERRE = (
    "Gracias — con eso ya te conozco. Preguntame lo que quieras del "
    "ecosistema: ORIGEN, la cadena, tu Genesis ID, la tarjeta, lo que venga. "
    "Y si algo no lo sé, te lo digo derecho.")

# Se avisa que la PRIMERA tarda mas, y no por cortesia: al cambiar de modo la
# maquina descarga un modelo y carga el otro, y eso solo es un minuto. Sin el
# aviso, ese minuto se lee como que se colgo, y la persona escribe de nuevo —
# lo que pone otra pregunta en la cola y lo empeora.
CAMBIO_PENSADORA = (
    "Listo — modo pensador. Razono con más fondo, y tardo más por respuesta. "
    "La primera va a tardar un poco extra mientras acomodo el motor. Para "
    "volver, decime «modo rápido».")
CAMBIO_RAPIDA = (
    "Listo — modo rápido. Contesto al vuelo; si querés más fondo, decime "
    "«modo pensador».")

# La voz se apaga con una palabra y se enciende con una palabra. Por defecto
# viene APAGADA: una nota de voz en cada respuesta es un regalo para quien la
# quiere y una molestia para quien no, y en la duda no se elige por la
# persona. Quien la quiere, la pide.
CAMBIO_VOZ = {
    'calida': 'Listo, te hablo con la voz cálida. Te sigo escribiendo igual, '
              'la nota va aparte por si preferís escuchar.',
    'sobria': 'Listo, voz sobria: más lenta y más clara, la que uso para los '
              'montos.',
    'agil':   'Listo, voz ágil: más rápida y con más energía.',
}
VOZ_APAGADA = 'Listo, dejo de mandarte notas de voz. Para volver, decime «con voz».'
VOZ_NO_ESTA = ('Ahora mismo no puedo grabarte la nota, pero el texto lo tenés '
               'arriba completo.')

MOTOR_CAIDO = (
    "Ahora mismo no puedo pensar: mi motor está apagado. Ya avisé a la casa — "
    "probá de nuevo en un rato.")

# Cuando el motor SI contesto pero no quedo nada util. No es lo mismo que
# estar caido, y decir «mi motor está apagado» ahi es dos errores en una
# frase: es mentira, y habla de las tripas de la casa, que el prompt le
# prohibe. Se pide de otra manera, que es lo que hace una persona que no
# entendio la pregunta.
NO_SALIO = (
    "Se me enredó la respuesta. Preguntámelo de otra forma y te la doy bien.")

# Un saludo se contesta saludando, y sin gastar motor. Van varios porque
# alguien que saluda tres veces y recibe tres veces la misma frase exacta
# descubre la maquina en el acto — que es justo lo que se esta tratando de
# que no pase. El ultimo se repite: a la cuarta ya no importa.
SALUDO_CORTO = (
    "Hola. ¿En qué andás? Preguntame lo que quieras del ecosistema.",
    "Acá estoy. Contame qué necesitás.",
    "Hola de nuevo. ¿Qué querés saber?",
)

TECHO_MSG = (
    "Por hoy llegamos al tope de preguntas que puedo atender por persona — "
    "estamos en prueba y el motor es uno solo. Mañana seguimos.")


# ── el motor ─────────────────────────────────────────────────────────────────

def _sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s).lower())
                   if unicodedata.category(c) != 'Mn')


def cargar_saber():
    d = json.loads((DATOS / 'saber.json').read_text())
    fichas = d if isinstance(d, list) else d.get('fichas', [])
    return [f for f in fichas if f.get('publico') is not False]


def cargar_prompt():
    md = (DATOS / 'PROMPT-AURA.md').read_text()
    i = md.index('```')
    j = md.index('```', i + 3)
    return md[i + 3:j].strip()


def todo_el_saber(saber):
    """TODAS las fichas, siempre igual, byte por byte.

    Antes se elegian las fichas que tocaban la pregunta, y sonaba sensato:
    menos texto, menos trabajo. En esta maquina resulto ser lo contrario.

    Ollama cachea el principio del prompt cuando NO CAMBIA entre llamadas
    («cached n_tokens» en su registro). Con las fichas variando por pregunta,
    el prompt de sistema era distinto cada vez: cero cache, y a 22 tokens por
    segundo eso son casi dos minutos leyendo antes de escribir una palabra —
    exactamente lo que le paso a Jose con «¿que puedes hacer?», que no
    enganchaba con ninguna ficha y se llevaba las quince.

    Con el sistema FIJO, la primera pregunta paga el precio una vez y todas
    las siguientes solo procesan lo nuevo. Lo que la persona pregunta y quien
    es viajan en el turno de usuario, que es corto y cambia sin costo.
    """
    return '\n'.join(f"— {f['tema']}: {f.get('es', '')}" for f in saber)



FUGAS = _re.compile(
    r"(^\s*(seg[uú]n|de acuerdo (a|con)|conforme a)\s+(las?\s+)?fichas?,?\s*)"
    r"|(\b(seg[uú]n|en|de)\s+(las?\s+)?fichas?,?\s*)",
    _re.IGNORECASE)


# El saludo de cortesia al principio de CADA respuesta. El prompt lo prohibe
# con todas las letras («CONTESTA DESDE LA PRIMERA PALABRA») y el modelo lo
# pone igual: «Hola Tere,» / «¡Gracias por confiar en AU-RA!». En una charla
# ya empezada, saludar en cada turno no es amable, es raro — nadie que
# conversa dice «hola» ocho veces. Y peor: hablar de si misma en tercera
# persona rompe el personaje entero.
#
# El patron EXIGE un separador al final (coma, punto, salto). Sin esa
# exigencia, «Hola, ¿en qué te ayudo?» se comia entero y quedaba «?» — el
# limpiador destruyendo la respuesta que venia a limpiar. Un saludo es un
# saludo cuando esta cerrado; si sigue de largo, es la frase.
SALUDITO = _re.compile(
    r'^\s*(?:¡?\s*(?:hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|'
    r'gracias por (?:confiar|preguntar|escribir|contactar)(?:\s+[\w-]+){0,5}|'
    r'claro que s[ií]|por supuesto|excelente pregunta|qu[eé] buena pregunta)'
    # [\w-] y no \w: su propio nombre lleva guion. Con \w el patron cortaba
    # en «AU» y dejaba «-RA!» suelto en la respuesta.
    r'(?:\s+[\w-]+){0,3}\s*[,.!¡\n]+\s*)+', _re.IGNORECASE)

# El preambulo que le repite a la persona su propia vida: «Me alegra que
# tengas una tienda de abarrotes y estés buscando proteger tus ahorros.»
# Salio en TODAS las respuestas del nodo el 28-ago. No informa nada — se lo
# conto ella misma— y repetido en cada turno se siente vigilada. Come hasta
# el primer punto porque es siempre una oracion entera de relleno.
# ── DOS CLASES DE PREAMBULO, Y NO SE TRATAN IGUAL ─────────────────────────
#
# La diferencia no es de estilo, es de qué pasa si se llevan todo el mensaje.
#
#   CORTESIA — «me alegra que tengas una tienda», «entiendo tu preocupación».
#   No informan nada. Si se llevan el mensaje entero, perfecto: ese mensaje
#   era relleno de punta a punta y no habia nada que salvar.
#
#   ANUNCIO — «vamos a ver cómo funciona tu Genesis ID», «te explico:».
#   Estos ANUNCIAN algo, asi que van ANTES de algo. Si al quitarlos no queda
#   nada, entonces no eran un anuncio: eran la respuesta. «Vamos a ver cómo
#   funciona tu Genesis ID y para qué te sirve.» se borraba entera y el
#   mensaje salia vacio.
#
# La cola comun lleva `(?!\s*(?:pero|sin embargo|aunque)\b)`, y no es estilo:
# sin eso, «Eso es una pregunta interesante, PERO no puedo predecir el
# precio.» se borraba ENTERA — el limpiador comiendose una negativa de
# seguridad. Donde aparece un «pero», ahi empieza lo que de verdad se dijo.
#
# Y la estructura importa: los arranques van juntos en su grupo y la cola se
# aplica a todos. Puestos en fila sin agrupar, la cola queda pegada solo a la
# ultima rama y las demas borran tres palabras dejando la oracion coja — «Me
# alegra que tengas una tienda» se convertia en «Tengas una tienda».
_COLA = r'(?:(?!\s*(?:pero|sin embargo|aunque)\b)[^.!?:\n]){0,160}[.!?:]\s*'

PREAMBULO_CORTESIA = _re.compile(
    r'^\s*(?:(?:'
    #   «me alegra SABER que»: hasta dos palabras entre medio. Sin eso el
    #   patron pedia el «que» pegado y se colaba por una sola palabra.
    r'(?:me alegra|me da gusto|qu[eé] bueno)(?:\s+\w+){0,2}\s+que'
    #   «Tengo notado que…» no es español de nadie, y ademas anuncia que va a
    #   decir un dato en vez de decirlo.
    r'|tengo notado que'
    #   «Entiendo, Tere.» / «Entiendo tu preocupación.» — sin el «que».
    r'|(?:entiendo|comprendo)\b'
    r')' + _COLA + r')+',
    _re.IGNORECASE)

PREAMBULO_ANUNCIO = _re.compile(
    # \w* al final del verbo: en español el pronombre se pega («explicarTE»,
    # «ayudarTE», «contarTE») y un \b ahi no cierra nunca.
    r'^\s*(?:vamos a (?:hablar|explicar|contar|ver|ayudar|revisar)\w*\b[^.!?:\n]{0,90}[.!?:]\s*'
    r'|(?:aqu[ií] te|te)\s+(?:explico|cuento|dejo)\b[^.!?:\n]{0,40}[.!?:]\s*)+',
    _re.IGNORECASE)

# El titulo que devuelve la pregunta antes de contestarla: «¿Qué es AUKA?»
# como encabezado. La pregunta la hizo ella hace un segundo; repetirsela es
# de folleto, no de conversacion.
ECO = _re.compile(r'^\s*¿[^?\n]{3,80}\?\s*\n+', _re.MULTILINE)

# El cierre de operadora: «¿Te gustaría saber más?» / «¿Hay algo más en lo
# que pueda ayudarte?». Si hay algo mas, lo van a preguntar.
CIERRE_HUECO = _re.compile(
    r'\s*¿\s*(?:te gustar[ií]a saber m[aá]s|hay algo m[aá]s|necesit[aá]s algo m[aá]s|'
    r'puedo ayudarte en algo m[aá]s)\b'
    r'[^?\n]{0,90}\?\s*$', _re.IGNORECASE)

# El markdown. El modelo escribe para una pagina web y esto es un CHAT: los
# asteriscos se ven como asteriscos en la burbuja, y la voz los LEE — «asterisco
# asterisco identidad unificada». Las vinetas y los numerales, igual.
MARCAS = [
    (_re.compile(r'\*\*(.+?)\*\*', _re.S), r'\1'),      # **negrita**
    (_re.compile(r'(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)', _re.S), r'\1'),  # *cursiva*
    (_re.compile(r'`{1,3}([^`]+)`{1,3}', _re.S), r'\1'),
    (_re.compile(r'^#{1,6}\s*', _re.M), ''),            # ## titulo
    (_re.compile(r'^\s*[-*•]\s+', _re.M), ''),          # - vineta
    (_re.compile(r'^\s*\d+[.)]\s+', _re.M), ''),        # 1. enumeracion
    (_re.compile(r'\n{3,}'), '\n\n'),
]


# Lo que NO se puede perder en un recorte de estilo. Nace de un caso real:
# el limpiador se comio «ese correo que te pidio la frase de respaldo es una
# estafa» y dejo solo «No le contestes».
_INTOCABLE = _re.compile(
    r'\d'                                   # cualquier cifra: montos, fechas
    r'|\b(estafa|estafar|robo|roban|fraude|enga[nñ]|falso|falsa|'
    r'contrase[nñ]a|clave|llave privada|frase|semilla|doce palabras|'
    r'nunca|jam[aá]s|no le des|no compartas|cuidado|ojo|peligro|'
    r'no puedo|no se puede|no garantiz|no promet)',
    _re.IGNORECASE)


def limpiar(texto):
    """Lo que el modelo pone y no deberia, quitado deterministamente.

    El prompt ya prohibe las tres cosas. El modelo las hace igual: a un modelo
    abierto no se le confia una regla de estilo, se le corrige a la salida.
    Paso en produccion con «según las fichas», dos veces, y otra vez con el
    «Hola Tere» de cada turno.
    """
    crudo = (texto or '').strip()
    # Los saludos SI pueden llevarse todo: «¡Hola Tere! Me alegra que tengas
    # una tienda.» es relleno de punta a punta y no hay nada que salvar.
    # La cortesia SI puede llevarse todo: si el mensaje entero era «¡Hola
    # Tere! Me alegra que tengas una tienda», no habia nada que salvar.
    sin_saludo = PREAMBULO_CORTESIA.sub(
        '', SALUDITO.sub('', FUGAS.sub('', crudo))).strip()
    if not sin_saludo:
        return ''
    # El ANUNCIO no: va antes de algo, y si al quitarlo no queda nada, es que
    # no era un anuncio sino la respuesta.
    sin_relleno = CIERRE_HUECO.sub('', PREAMBULO_ANUNCIO.sub('', sin_saludo)).strip()
    if not sin_relleno:
        sin_relleno = sin_saludo
    # ── LA GUARDA DURA ────────────────────────────────────────────────────
    #
    # Lo que se borra se COMPARA: si en el recorte se fue una palabra de
    # seguridad o una cifra, no se borra nada y se sigue con el texto entero.
    #
    # Esto no es prudencia general: es por un caso concreto y reproducido.
    # «Entiendo tu duda: ese correo que te pidió la frase de respaldo es una
    # estafa. No le contestes.» quedaba en «No le contestes.» — el aviso de
    # estafa borrado por un limpiador de estilo. Un preambulo que sobra es
    # una molestia; una advertencia borrada le puede costar la plata a
    # alguien, y una cifra borrada le cambia el monto.
    #
    # Cuando las dos cosas chocan, gana el contenido. Siempre.
    ido = sin_saludo[:len(sin_saludo) - len(sin_relleno)]
    if _INTOCABLE.search(ido):
        sin_relleno = sin_saludo
    # Si de todo el trozo no queda NADA, es que el trozo era relleno de punta
    # a punta — «¡Hola Tere! Me alegra que tengas una tienda.» y se acabo. Eso
    # se tira entero: mandarlo es hacer esperar a alguien por un mensaje que
    # no dice nada. Quien llama tiene que saber tratar el vacio.
    if not sin_relleno:
        return ''
    # El markdown se va SIEMPRE y no tiene vuelta atras. No quita sentido —
    # cambia «**oro**» por «oro»— y en cambio dejarlo pasar significa que la
    # nota de voz diga «asterisco asterisco oro asterisco asterisco».
    sin_marcas = sin_relleno
    for patron, con in MARCAS:
        sin_marcas = patron.sub(con, sin_marcas)
    sin_marcas = sin_marcas.strip()
    # el eco va DESPUES de quitar el markdown: el titulo suele venir como
    # «**¿Qué es AUKA?**» y sin quitar los asteriscos no se reconoce
    t = ECO.sub('', sin_marcas.lstrip()).strip()
    # LA RED, y contra QUE se mide. Un limpiador que se come la respuesta es
    # peor que la mugre que venia a sacar, pero la vuelta atras es a
    # `sin_marcas`, nunca al crudo. Midiendolo contra el crudo, quitar un
    # titulo largo parecia «se comio media respuesta» y devolvia el texto CON
    # los asteriscos puestos — la red restaurando justo lo que hay que sacar.
    if len(t) < len(sin_marcas) * 0.5:
        t = sin_marcas
    return (t[0].upper() + t[1:]) if t else ''


def _es_repetida(nueva, historial, umbral=0.90, prefijo=60):
    """¿Esto es casi lo mismo que lo ultimo que dijo?

    Se miran DOS cosas, porque un eco tiene dos formas y una sola medida no
    atrapa las dos:

      · EL ARRANQUE IDENTICO. Dos respuestas que empiezan con los mismos
        sesenta caracteres son la misma respuesta para quien la lee, aunque
        despues se separen. Esto paso en produccion y la medida global NO lo
        atrapo: «¿Qué es AUKA?» y «¿Y el Genesis ID?» compartian los primeros
        CIENTO OCHO caracteres exactos y daban 82% de parecido — por debajo
        del umbral, y sin embargo cualquiera que lo lee ve el copiado.
      · EL PARECIDO GLOBAL, alto y a proposito. Dos respuestas del mismo tema
        se parecen legitimamente, y cada falso positivo cuesta una generacion
        entera de mas. Se caza la copia, no el parecido.
    """
    import difflib
    n = (nueva or '').strip()
    if len(n) < 30:
        return False
    for m in reversed(historial or []):
        if m.get('role') == 'assistant':
            viejo = (m.get('content') or '').strip()
            if not viejo:
                return False
            comun = 0
            for x, y in zip(n.lower(), viejo.lower()):
                if x != y:
                    break
                comun += 1
            if comun >= prefijo:
                return True
            return difflib.SequenceMatcher(
                None, n[:200].lower(), viejo[:200].lower()).ratio() >= umbral
    return False


def preguntar_motor(sistema, perfil, historial, dicho, contexto='', al_vuelo=None,
                    frenar_listas=True, variar=False):
    """El sistema llega YA ARMADO y es siempre el mismo: eso es lo que hace
    que Ollama lo cachee y que la segunda pregunta no vuelva a pagar los dos
    minutos de lectura. Lo que cambia —quien pregunta y que pregunta— viaja
    en el turno de usuario, que es corto.

    ── POR QUE STREAM=TRUE ──────────────────────────────────────────────────

    Se midio de donde sale el tiempo: leer la pregunta son 13 segundos y
    ESCRIBIR la respuesta son 87. En esta maquina el modelo escribe a unas
    tres palabras por segundo, asi que una respuesta de 260 tokens tarda un
    minuto y medio pase lo que pase.

    Contra eso hay dos cosas que hacer, y las dos se hacen aqui:

      · pedir menos palabras (num_predict), porque la mitad de lo que
        escribia era relleno que ademas el prompt no queria; y
      · NO ESPERAR A QUE TERMINE. Con `stream`, en cuanto la primera frase
        esta completa se manda al chat y la persona empieza a leer mientras
        el resto se escribe. El tiempo total no cambia; el tiempo hasta que
        pasa algo baja de noventa segundos a diez o quince, que es lo unico
        que la persona siente.

    `al_vuelo(texto)` se llama con cada frase terminada. Si no se pasa, la
    funcion se comporta como antes y devuelve todo junto.
    """
    datos = []
    if contexto:
        datos.append(contexto)
    if perfil.get('trabajo'):
        datos.append(f"se dedica a {perfil.get('trabajo','')[:120]}; "
                     f"se formo en {perfil.get('estudios','')[:120]}; "
                     f"busca {perfil.get('interes','')[:120]}")
    quien = f"[quien te habla: {'; '.join(datos)}]\n" if datos else ''
    mensajes = ([{'role': 'system', 'content': sistema}]
                + historial[-MEMORIA:]
                + [{'role': 'user', 'content': quien + str(dicho)[:1000]}])
    pensadora = perfil.get('modo') == 'pensadora'
    modelo = MODELO_PENSADORA if pensadora else MODELO_RAPIDA
    cuerpo = json.dumps({
        'model': modelo, 'messages': mensajes, 'stream': bool(al_vuelo),
        # el modelo se queda cargado entre preguntas: cargarlo cuesta segundos
        # y en esta maquina cada segundo se nota
        'keep_alive': '30m',
        'options': {
            # Mas temperatura solo cuando se esta repreguntando por haber
            # repetido: si se contesta igual que antes, decirlo con las
            # mismas palabras exactas es justamente el problema.
            'temperature': 0.75 if variar else 0.3,
            # Sobre CPU esto era 110/220 y era lo correcto: a 6 tokens por
            # segundo cada palabra de mas costaba espera de verdad. Sobre la
            # GPU son 40 tok/s, y el techo bajo dejo de proteger a la persona
            # y empezo a cortarle la respuesta a media frase — que es peor que
            # esperar dos segundos mas. Se sube al doble largo.
            'num_predict': 300 if pensadora else 170,
            # ── EL FRENO DE LAS LISTAS ────────────────────────────────────
            # El prompt le pide en tres lugares que no escriba listas ni
            # titulos, y las escribe igual: es lo que hace un modelo
            # entrenado para paginas web. A una regla de estilo no se le
            # confia un modelo abierto — ya paso con «segun las fichas» y con
            # «Hola Tere».
            # Estas marcas CORTAN la generacion en seco. En cuanto empieza a
            # armar una lista o un titulo, la respuesta termina ahi: se queda
            # con lo que ya dijo, que son las frases de verdad. Es la unica
            # forma determinista de que conteste hablando y no maquetando.
            'stop': (['\n1.', '\n2.', '\n- ', '\n* ', '\n**', '\n#', '\n\n**']
                     if frenar_listas else []),
            # ── LA VENTANA. Esto costo 170 segundos por respuesta ──────────
            # Sin num_ctx, ollama usa 4096. El sistema solo son 1826 tokens;
            # con ocho turnos de memoria la peticion llega a 3814. Sumando la
            # respuesta REBALSA los 4096, y al rebalsar ollama tira la cache
            # y RELEE los 3814 desde cero, a 22 tokens por segundo: dos
            # minutos y medio ANTES de escribir la primera letra. En el log
            # del nodo se ve tal cual: «n_ctx_slot = 4096, task.n_tokens =
            # 3814, cached n_tokens = 5» — de 3814 tokens reaprovecho 5.
            # Con la ventana holgada la peticion entra entera, la cache se
            # sostiene y leer vuelve a costar 1,4s (medido, mismo nodo).
            # La pensadora lleva ventana mas chica porque su modelo es mas
            # grande y cada mil tokens de ventana le cuestan mas memoria, y
            # memoria es justo lo que falta en esta maquina.
            'num_ctx': 6144 if pensadora else 8192,
        },
    }).encode()
    req = urllib.request.Request(
        MOTOR + '/api/chat', data=cuerpo, method='POST',
        headers={'Content-Type': 'application/json'})

    if not al_vuelo:
        with urllib.request.urlopen(req, timeout=TIMEOUT_MOTOR) as r:
            j = json.loads(r.read())
        crudo = (j.get('message') or {}).get('content', '').strip()
        # Devuelve LO MISMO que el camino con streaming: (lo que se manda,
        # lo que dijo el motor en crudo). Antes devolvia un solo valor, y el
        # que llama desempaqueta dos — bastaba con apagar el streaming para
        # que reventara. Las dos salidas de una funcion tienen que tener la
        # misma forma o la funcion tiene dos funciones adentro.
        return _recortar(limpiar(crudo)), crudo

    entero, pendiente = '', ''
    with urllib.request.urlopen(req, timeout=TIMEOUT_MOTOR) as r:
        for linea in r:
            if not linea.strip():
                continue
            try:
                j = json.loads(linea)
            except Exception:
                continue
            trozo = (j.get('message') or {}).get('content', '')
            entero += trozo
            pendiente += trozo
            # Se corta por frase, no por trozo: mandar «ORI», «GEN», « es»
            # seria un tartamudeo. Y el primer envio pide 40 caracteres para
            # que no salga un «Hola.» solitario.
            if j.get('done'):
                break
            corte = max(pendiente.rfind('. '), pendiente.rfind('.\n'),
                        pendiente.rfind('? '), pendiente.rfind('! '))
            if corte > 40:
                frase = pendiente[:corte + 1].strip()
                # La PRIMERA frase no puede ser una cortesia sola. El modelo
                # chico tiende a abrir con «Rosa, me alegra que hayas...», y
                # al mandarla suelta la persona recibe un mensaje que no dice
                # nada y sigue esperando: peor que no haber mandado nada. Si
                # la primera parece saludo, se pega a la siguiente.
                if not entero.replace(frase, '', 1).strip() and _es_cortesia(frase):
                    continue
                pendiente = pendiente[corte + 1:]
                # limpiar puede devolver vacio: el trozo era relleno entero.
                # Ahi no se manda nada — un mensaje vacio lo rechaza el relevo,
                # y aunque no lo rechazara seria una burbuja en blanco.
                limpia = limpiar(frase) if frase else ''
                if limpia:
                    al_vuelo(limpia)
    resto = _recortar(limpiar(pendiente.strip()))
    return resto, entero


_CORTESIA = _re.compile(
    r"^(hola|buen[oa]s?)\b|me alegra|qu[eé] (buena|linda) pregunta|"
    r"gracias por (preguntar|escribir)|encantada", _re.IGNORECASE)


def _es_cortesia(frase):
    """¿Esta frase es puro saludo y no contesta nada? Se mira que sea corta Y
    que empiece con una formula: una frase larga que ademas saluda si lleva
    contenido y se manda igual."""
    return len(frase) < 120 and bool(_CORTESIA.search(frase))


def _recortar(texto):
    """Nunca se muestra media palabra.

    El techo de palabras del motor corta donde le toca, y donde le toca es a
    veces a mitad de «disminuya» — la persona lee «no dis» y ahi termina el
    mensaje. Se ve roto, y con razon: esta roto.

    Asi que si el texto no termina en un signo de cierre, se retrocede hasta
    la ultima frase COMPLETA. Se pierde media oracion y se gana un mensaje
    que se puede leer, que es el unico que sirve. Solo se deja tal cual si
    retroceder dejaria un pedazo demasiado corto: ahi es mejor la frase coja
    que un mensaje de tres palabras.
    """
    t = (texto or '').strip()
    if len(t) > 900:
        corte = t.rfind('.', 0, 900)
        t = t[:corte + 1 if corte > 200 else 900].strip()
    # los dos puntos NO cierran nada: anuncian lo que viene, y si lo que
    # viene se corto, queda una promesa sin cumplir
    if t and t[-1] not in '.!?…»"\'':
        corte = max(t.rfind('. '), t.rfind('.\n'), t.rfind('? '), t.rfind('! '),
                    t.rfind('.'), t.rfind('?'), t.rfind('!'))
        # Una PROMESA colgando se corta siempre, cueste lo que cueste. «Aquí
        # te dejo algunos pensamientos motivadores:» y nada detras es peor
        # que una respuesta corta: promete y no cumple, y la persona se queda
        # esperando algo que no va a llegar. Paso en produccion, con captura.
        # Una palabra cortada, en cambio, se tolera si recortarla dejaria un
        # pedazo diminuto: ahi la frase coja dice mas que tres palabras.
        promesa = t[-1] in ':;,'
        if corte > 0 and (promesa or corte >= len(t) * 0.5):
            t = t[:corte + 1].strip()
    return t


def mandar_voz(rel, para, texto, registro):
    """Graba la respuesta y la manda como nota de voz.

    Corre EN OTRO HILO y despues de que el texto ya salio, y las dos cosas
    son a proposito:

      · Despues, porque leer es instantaneo y grabar tarda unos segundos.
        Quien prefiere leer ya termino; quien prefiere escuchar espera un
        rato corto. Al reves —esperar la voz para recien mostrar el texto—
        castigaria a todos por el gusto de algunos.
      · En otro hilo, porque si grabar tarda, la siguiente pregunta de esa
        persona (o de otra) no tiene por que esperar detras.

    Si la voz falla, no pasa nada: el texto ya esta arriba y completo. Una
    nota que no salio es una molestia; una respuesta que no salio es un
    problema. Por eso esto nunca lanza hacia arriba.
    """
    try:
        cuerpo = json.dumps({'texto': texto[:1200], 'voz': registro}).encode()
        req = urllib.request.Request(
            VOZ + '/decir', data=cuerpo, method='POST',
            headers={'Content-Type': 'application/json'})
        # 180s: la voz genera casi a tiempo real, asi que una respuesta larga
        # puede pedir medio minuto. El techo esta para que un cuelgue no deje
        # el hilo colgado para siempre, no para cortar trabajo sano.
        with urllib.request.urlopen(req, timeout=180) as r:
            mp3 = r.read()
            segundos = r.headers.get('X-Duracion', '?')
        if not mp3:
            return
        iid = rel.subir(mp3, 'audio/mpeg', 'aura.mp3')
        if iid:
            rel.enviar_voz(para, iid)
            log(f'nota de voz para {para}: {segundos}s · {len(mp3) // 1024} KB'
                f' · {registro}')
    except Exception as e:
        log('la voz no salio para', para, f'({type(e).__name__})', str(e)[:80])


class Pensando:
    """Mantiene vivo el «esta escribiendo…» mientras el motor trabaja.

    El aviso del chat dura unos segundos y se manda una sola vez. Con
    respuestas de uno o dos minutos, la persona veia «escribiendo» un
    momento y despues silencio — que es exactamente lo que le parecio a
    Jose que se habia colgado. Ahora se repite cada cinco segundos hasta
    que hay respuesta."""

    def __init__(self, rel, para):
        self.rel, self.para, self.fin = rel, para, threading.Event()

    def __enter__(self):
        def latir():
            while not self.fin.wait(5):
                self.rel.escribiendo(self.para)
        self.rel.escribiendo(self.para)
        self.hilo = threading.Thread(target=latir, daemon=True)
        self.hilo.start()
        return self

    def __exit__(self, *a):
        self.fin.set()


# ── atender a una persona ────────────────────────────────────────────────────

def hoy():
    return time.strftime('%Y-%m-%d')


def perfil_de(perfiles, correo, tope=None):
    p = perfiles.setdefault(correo, {})
    p.setdefault('historial', [])
    p.setdefault('dia', hoy())
    p.setdefault('usadas', 0)
    if tope is not None:
        # Una charla sin tope conocido arranca EN EL PRESENTE. Es la guarda
        # contra la avalancha: perfil perdido o probador re-agregado no
        # significa recontestar 200 mensajes viejos a medio minuto cada uno.
        p.setdefault('tope', tope)
    return p


def atender(rel, sistema, p, de, dicho):
    """Atiende UN mensaje. Si lanza, el que llama decide reintentar o saltar;
    aqui no se avanza ningun tope."""
    if not p.get('saludado'):
        # El saludo se perdio (o nunca salio): se saluda ANTES de consumir
        # nada. El mensaje de la persona no era respuesta a ninguna pregunta.
        rel.enviar(de, SALUDO)
        p['saludado'] = True
        return

    if not dicho:
        # Un adjunto, o un mensaje cifrado de un cliente viejo. No se adivina.
        rel.enviar(de, 'Por ahora solo entiendo texto. ¿Me lo escribís?')
        return

    # Cambiar de modo es de la casa, no del modelo: se detecta aqui, en seco.
    bajo = _sin_tildes(dicho)
    if len(bajo) < 40 and ('modo pensador' in bajo or 'modo profundo' in bajo
                           or 'pensa mas' in bajo or 'thinker mode' in bajo):
        p['modo'] = 'pensadora'
        rel.enviar(de, CAMBIO_PENSADORA)
        return
    if len(bajo) < 40 and ('modo rapido' in bajo or 'fast mode' in bajo):
        p['modo'] = 'rapida'
        rel.enviar(de, CAMBIO_RAPIDA)
        return

    # Encender y apagar la voz tambien es de la casa. Se mira ANTES que la
    # entrevista, porque alguien puede querer oirla desde el primer minuto,
    # y ANTES del motor, porque no hay nada que pensar en «con voz».
    if len(bajo) < 40 and ('sin voz' in bajo or 'callate' in bajo
                           or 'no voz' in bajo or 'voice off' in bajo):
        p['voz'] = ''
        rel.enviar(de, VOZ_APAGADA)
        return
    if len(bajo) < 40 and ('voz' in bajo or 'voice' in bajo or 'habla' in bajo):
        pedido = next((r for r in REGISTROS if r in bajo), '')
        if pedido or 'con voz' in bajo or 'hablame' in bajo or 'voice on' in bajo:
            p['voz'] = pedido or 'calida'
            rel.enviar(de, CAMBIO_VOZ[p['voz']])
            return

    # EL SALUDO SUELTO. «Hola», «buenas», «qué tal» — la frase mas comun de
    # todas, y la que peor le sale al modelo: no tiene nada que contestar, asi
    # que recita el perfil o suelta un pedazo de otra respuesta. En la captura
    # de produccion, a un «Hola» contesto «Veta Wallet y MyTokenPay pueden
    # ayudarte a lograr eso.» — un fragmento sin cabeza.
    #
    # Un saludo se contesta saludando, y eso lo escribe la casa: sale al
    # instante, sale bien siempre, y no gasta motor. Solo cuando el mensaje
    # es UNICAMENTE el saludo; «hola, ¿qué es AUKA?» va al modelo como debe.
    if len(bajo) <= 22 and _re.fullmatch(
            r'\s*(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|'
            r'que tal|como estas|holi|saludos)[\s!¡.,?¿]*', bajo):
        p['saludos'] = p.get('saludos', 0) + 1
        rel.enviar(de, SALUDO_CORTO[min(p['saludos'] - 1, len(SALUDO_CORTO) - 1)])
        return

    # la entrevista, en orden y sin gastar motor
    for i, (campo, _) in enumerate(PREGUNTAS):
        if campo not in p:
            p[campo] = dicho[:400]
            rel.enviar(de, PREGUNTAS[i + 1][1] if i + 1 < len(PREGUNTAS) else CIERRE)
            return

    # el techo del dia — solo para lo que gasta motor
    if p.get('dia') != hoy():
        p['dia'], p['usadas'] = hoy(), 0
    if p['usadas'] >= TECHO_DIA:
        rel.enviar(de, TECHO_MSG)
        return

    try:
        contexto = quien_es(rel, de, p, dicho)
    except Exception:
        contexto = ''
    salio = []

    # ── UNA RESPUESTA, UNA BURBUJA ────────────────────────────────────────
    #
    # Antes cada frase terminada salia sola, y con razon: sobre CPU una
    # respuesta tardaba noventa segundos y mandar la primera frase a los diez
    # era la diferencia entre esperar y creer que se colgo.
    #
    # Sobre la GPU la respuesta ENTERA tarda cinco o seis segundos, asi que
    # ese reparto dejo de proteger a nadie y empezo a estorbar: la persona
    # recibia cuatro, cinco, seis globos seguidos por una sola pregunta. La
    # queja fue textual — «no hay conversación fluida, que aparezca que estoy
    # teniendo una conversación». Nadie que conversa contesta en seis
    # mensajes: contesta una vez.
    #
    # Asi que va entera, en un solo mensaje, mientras el «escribiendo…» hace
    # su trabajo. Se deja el reparto por frases detras de un interruptor
    # porque si algun dia esto vuelve a una maquina lenta, hace falta otra vez.
    por_frases = os.environ.get('AURA_POR_FRASES', '') == '1'

    def soltar(frase):
        try:
            rel.enviar(de, frase)
            salio.append(frase)
        except Exception as e:
            log('no salio una frase para', de, str(e)[:60])

    try:
        with Pensando(rel, de):
            resto, entero = preguntar_motor(sistema, p, p['historial'], dicho,
                                            contexto,
                                            al_vuelo=soltar if por_frases else None)
            # LA RESPUESTA VACIA, QUE NO ES UN MOTOR CAIDO.
            #
            # El freno de listas corta la generacion apenas el modelo empieza
            # a maquetar. Si empieza maquetando en la PRIMERA linea —«1.
            # Identidad…»— corta en seco y no queda nada que mandar. Paso:
            # «Explicame el Genesis ID con todas sus ventajas» devolvio cero
            # caracteres.
            #
            # Se vuelve a preguntar UNA vez sin ese freno. Es preferible una
            # respuesta con forma de lista a ninguna respuesta, y con el
            # limpiador de la salida la lista queda decente igual.
            # LA PROMESA ROTA. «Aquí te dejo algunos pensamientos motivadores:»
            # y ahi termina el mensaje. Paso en produccion, con captura: el
            # freno de listas corto justo despues de los dos puntos, y lo que
            # quedo fue un anuncio sin nada detras — peor que una lista fea y
            # peor que no contestar, porque promete y no cumple.
            #
            # Una respuesta que termina en dos puntos SIEMPRE esta cortada:
            # nadie cierra una idea con «:». Se repregunta sin el freno.
            promesa = (resto or '').rstrip().endswith((':', ';', ','))
            if not por_frases and (len((resto or '').strip()) < 40 or promesa):
                log('respuesta vacia, cortisima o con promesa colgando; '
                    'repregunto sin el freno')
                resto, entero = preguntar_motor(sistema, p, p['historial'],
                                                dicho, contexto,
                                                al_vuelo=None, frenar_listas=False)
            # LA RESPUESTA REPETIDA.
            #
            # Un modelo que ve su propia respuesta anterior en el historial
            # tiende a repetirla, sobre todo si la pregunta nueva es vaga
            # («hola», «¿qué podés hacer?»). Paso en produccion con captura:
            # dos preguntas distintas, la misma respuesta palabra por palabra,
            # y ahi ya no es una conversacion, es un eco.
            #
            # Se mira contra lo ultimo que dijo. Si es casi lo mismo, se
            # vuelve a preguntar UNA vez con mas temperatura y avisandole que
            # eso ya lo dijo. Cuesta unos segundos y salva la conversacion.
            # `if` y no `elif`: encadenados, una repregunta por respuesta
            # vacia dejaba al guardia de eco sin correr sobre el resultado de
            # esa repregunta, que es justo cuando mas facil es que salga
            # repetida. Las dos comprobaciones son sobre lo que HAY ahora.
            if not por_frases and _es_repetida(resto, p.get('historial')):
                log('respuesta casi identica a la anterior, repregunto')
                resto, entero = preguntar_motor(
                    sistema, p, p['historial'],
                    dicho + '\n[eso que ibas a contestar ya se lo dijiste hace '
                            'un momento: contestá otra cosa, o decilo distinto '
                            'y mas corto]',
                    contexto, al_vuelo=None, variar=True)
    except Exception as e:
        log('motor caido:', type(e).__name__, str(e)[:120])
        if not salio:
            rel.enviar(de, MOTOR_CAIDO)
        return
    if resto:
        rel.enviar(de, resto)
    if not salio and not resto:
        # NO se dice «mi motor esta apagado»: el motor contesto, lo que paso
        # es que no quedo nada util. Ademas el prompt le prohibe hablar de
        # las tripas de la casa, y «mi motor» es exactamente eso. Se pide de
        # otra manera, que es lo que haria una persona que no entendio.
        log('respuesta vacia hasta despues de repreguntar, para', de)
        rel.enviar(de, NO_SALIO)
        return
    # `entero` es lo que dijo el motor EN CRUDO — con sus asteriscos, sus
    # «1.» y su «¡Hola Tere!». Lo que sale al chat ya va limpio porque cada
    # frase pasa por limpiar() al mandarse, pero esto de aca se usa para DOS
    # cosas que no pasaban por ahi: la memoria de la charla y la nota de voz.
    # Sin limpiarlo, a la voz le llegaba el markdown entero: un trozo que era
    # solo «**» no tiene nada que pronunciar y tumbaba el motor de voz (y si
    # no lo tumbara, leeria «asterisco asterisco» en voz alta).
    r = limpiar(entero or '') or resto
    # La nota de voz, si esta persona la pidio. Va en otro hilo y detras del
    # texto: leer es instantaneo, grabar tarda. Ver mandar_voz.
    if p.get('voz') in REGISTROS and r:
        threading.Thread(target=mandar_voz, args=(rel, de, r, p['voz']),
                         daemon=True).start()
    # el cupo se gasta solo cuando la respuesta SALIO: si enviar lanza, el
    # que llama reintenta y la pregunta no se cobra dos veces
    p['usadas'] += 1
    p['historial'] = (p['historial'] + [
        {'role': 'user', 'content': dicho[:600]},
        {'role': 'assistant', 'content': r[:600]},
    ])[-MEMORIA:]


def atender_charla(rel, sistema, perfiles, correo):
    """Todo lo pendiente de UNA persona, en su hilo. El tope solo avanza con
    lo que termino bien; un fallo se reintenta y al tercero se salta con
    ruido."""
    with CANDADO_PERFILES:
        p = perfil_de(perfiles, correo)
        tope = p.get('tope', 0)
    bandeja = rel.bandeja(correo)
    nuevos = [m for m in bandeja
              if m.get('de') == correo and m.get('cuando', 0) > tope]
    nuevos.sort(key=lambda m: m.get('cuando', 0))
    for m in nuevos[:POR_VUELTA]:
        try:
            atender(rel, sistema, p, correo, (m.get('texto') or '').strip())
        except Exception as e:
            with CANDADO_PERFILES:
                f = p.setdefault('falla', {'id': None, 'n': 0})
                if f['id'] == m.get('id'):
                    f['n'] += 1
                else:
                    f['id'], f['n'] = m.get('id'), 1
                if f['n'] < REINTENTOS:
                    log(f'fallo con {correo} (intento {f["n"]}), reintento:',
                        type(e).__name__, str(e)[:100])
                    return   # sin avanzar el tope: se reintenta la vuelta que viene
                log(f'MENSAJE SALTADO tras {REINTENTOS} fallos · {correo} ·',
                    type(e).__name__, str(e)[:100])
        with CANDADO_PERFILES:
            p['tope'] = m.get('cuando', 0)
            p.pop('falla', None)
    if len(nuevos) <= POR_VUELTA:
        # Todo lo pendiente quedo atendido: el tope cubre tambien NUESTRAS
        # respuestas del hilo. Sin esto, «lo ultimo de la charla» seria
        # nuestra propia respuesta por encima del tope, y la charla se
        # re-escanearia en cada vuelta para siempre.
        with CANDADO_PERFILES:
            p['tope'] = max([p.get('tope', 0)]
                            + [m.get('cuando', 0) for m in bandeja])
    rel.leido(correo)
    guardar_perfiles(perfiles)


# ── el bucle ─────────────────────────────────────────────────────────────────

EN_CURSO = set()
CANDADO_CURSO = threading.Lock()


def vuelta(rel, sistema, perfiles, tanda):
    lista = probadores()
    ahora_ms = int(time.time() * 1000)

    # 1 · amistades: se acepta SOLO a la lista. El resto queda pendiente sin
    #     rechazo — agregar a alguien mañana es editar probadores.txt.
    for s in rel.solicitudes():
        c = (s.get('correo') or '').lower()
        if c not in lista:
            continue
        rel.aceptar(c)
        log('amistad aceptada:', c)
        with CANDADO_PERFILES:
            p = perfil_de(perfiles, c, tope=ahora_ms)
        try:
            rel.enviar(c, SALUDO)
            p['saludado'] = True   # solo con el saludo ENVIADO de verdad
        except Exception as e:
            log('saludo no salio para', c, '- se saluda con su primer mensaje:',
                str(e)[:80])
        guardar_perfiles(perfiles)

    # 2 · mensajes nuevos. La puerta es NUESTRA (el tope local), no el
    #     sinLeer del relevo: /leido sella la hora actual y un mensaje mandado
    #     mientras el motor pensaba quedaria detras del sello para siempre.
    for conv in rel.conversaciones():
        c = (conv.get('correo') or '').lower()
        if c == CORREO or c.startswith('g:') or c not in lista:
            continue   # grupos no, a proposito (ver cabecera); fuera de lista, silencio
        ult = conv.get('ultimo') or {}
        with CANDADO_PERFILES:
            p = perfil_de(perfiles, c, tope=ahora_ms if c not in perfiles else None)
            tope = p.get('tope', 0)
        if ult.get('cuando', 0) <= tope:
            continue   # nada nuevo (o lo ultimo es nuestra propia respuesta ya contada)
        with CANDADO_CURSO:
            if c in EN_CURSO:
                continue   # su charla ya se esta atendiendo; no se duplica
            EN_CURSO.add(c)

        def _uno(correo=c):
            try:
                atender_charla(rel, sistema, perfiles, correo)
            except Exception as e:
                log('charla fallida', correo, type(e).__name__, str(e)[:120])
            finally:
                with CANDADO_CURSO:
                    EN_CURSO.discard(correo)

        tanda.submit(_uno)


def templar(sistema):
    """Una pregunta de mentira al arrancar, para que la primera persona no
    pague el arranque en frio.

    Se midio: tras un reinicio, la primera respuesta tardo 237 segundos
    —cargar el modelo del disco mas leer el prompt entero sin cache— y la
    siguiente 24. Ese primer minuto y medio se lo comia quien tuviera la mala
    suerte de escribir primero. Templando aqui, se lo come el arranque.

    Si falla no pasa nada: es una comodidad, no un requisito."""
    try:
        t0 = time.time()
        preguntar_motor(sistema, {}, [], 'hola')
        log(f'motor templado en {time.time() - t0:.0f}s')
    except Exception as e:
        log('no se pudo templar el motor:', str(e)[:80])


def main():
    llave = llave_del_asistente()
    _candado = instancia_unica()
    rel = Relevo(CORREO, llave)
    saber = cargar_saber()
    # El sistema se arma UNA sola vez y no cambia nunca mas: es la condicion
    # para que Ollama lo cachee entre preguntas.
    sistema = (cargar_prompt() +
               '\n\nLO QUE SABES DE LA CASA (tu memoria; nunca menciones esta lista):\n'
               + todo_el_saber(saber))
    perfiles = cargar_perfiles()
    templar(sistema)
    log(f'AU-RA de pie · {len(saber)} fichas · {MODELO_RAPIDA}+{MODELO_PENSADORA} · '
        f'{len(probadores())} probadores')
    with ThreadPoolExecutor(max_workers=HILOS) as tanda:
        while True:
            try:
                vuelta(rel, sistema, perfiles, tanda)
            except Exception as e:
                # el relevo caido o la red rota no tumban el servicio
                log('vuelta fallida:', type(e).__name__, str(e)[:140])
                time.sleep(10)
            time.sleep(PASO)


if __name__ == '__main__':
    main()
