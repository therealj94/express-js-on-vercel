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

from candado import Candado
import whatsapp as wa
import guardia
import registro
import guion
import premio
import catalogo
import encargos
import escalafon
import espejo
import miradas
import oficios
import latido
import precio
import presentacion
import puerta
import recadero
import vistazo
from oido import NoSePudoOir, oir_nota
from concurrent.futures import ThreadPoolExecutor

RELEVO = os.environ.get('AURA_RELEVO', 'https://cerebro.ordenscan.com/mensajes').rstrip('/')
CORREO = os.environ.get('AURA_CORREO', 'aura@ordenglobal.org').lower()
# Alias para que se lea igual desde oido.py, que habla de «el asistente».
ASISTENTE = CORREO
DATOS = pathlib.Path(os.environ.get('AURA_DATOS', '/srv/aura'))
MOTOR = os.environ.get('AURA_MOTOR', 'http://127.0.0.1:11434').rstrip('/')
# EL MODELO. Uno solo, y elegido midiendo: se compararon siete contra este
# mismo prompt y estas mismas preguntas (ver comparar-modelos.py), y qwen2.5:7b
# gano en las tres cosas a la vez — una falta contra dos y hasta nueve, dos
# segundos de mediana contra tres y ocho, y treinta y seis palabras de media,
# que es lo que hace falta para una respuesta hablada.
#
# Los que perdieron y por que, para no volver a bajarlos:
#   aya-expanse:8b   miente con las fichas delante
#   qwen3:8b         miente, y no se niega a dar una contraseña
#   gemma3:12b       cuatro respuestas de mas de noventa palabras
#   granite3.3:8b    honesto pero largo
#   mistral-nemo:12b segundo mejor, sin ganarle en nada
#   qwen2.5:14b Q4   no cabe en la T4: se sale a CPU, 13s de mediana
#   qwen2.5:14b Q3   cabe, pero no se niega a dar una contraseña
MODELO_RAPIDA = os.environ.get('AURA_MODELO', 'llama3.2')

# La voz vive en la misma maquina, en 127.0.0.1. No sale a internet ni por
# error: un modelo de voz abierto al mundo es una fabrica de audio gratis
# para el primero que la encuentre, y ademas una forma comoda de dejar la
# GPU ocupada para siempre.
VOZ = os.environ.get('AURA_VOZ', 'http://127.0.0.1:8123').rstrip('/')
# Los tres registros que entiende el servicio de voz. El nombre que ve la
# persona vive alla; aca solo viajan las llaves.
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
# El ritmo de WhatsApp es SUYO: ver la nota en el bucle principal.
PASO_WA = float(os.environ.get('AURA_PASO_WHATSAPP', '5'))

# La maquina es un t2.large sin GPU: una respuesta puede tardar medio minuto.
# El timeout corto tipico (10s) mataria respuestas perfectamente sanas.
TIMEOUT_MOTOR = int(os.environ.get('AURA_TIMEOUT', '90'))

# Techo de respuestas DEL MOTOR por persona por dia. La entrevista no cuenta:
# no gasta motor. Sin techo, una persona con un bucle deja al motor ocupado
# para los otros catorce.
# Estaba en 60 y lo choque probando, en una tarde, sin buscarlo: son unas
# tres conversaciones de verdad. Quien esta usando la app para algo —o
# enseñandosela a alguien— lo choca tambien, y lo que recibe es «mañana
# seguimos», que delante de otra persona es peor que no tener asistente.
#
# 200 sigue siendo un techo contra el bucle, que es para lo unico que existe:
# 200 preguntas seguidas de una sola persona son cuatro horas de motor, y ahi
# si conviene frenar. Nadie llega a 200 conversando.
TECHO_DIA = int(os.environ.get('AURA_TECHO', '200'))

# ── EL FRENO DE RAFAGA ────────────────────────────────────────────────────
#
# Con AU-RA abierta a todos, lo que protege el motor ya no es una lista de
# nombres sino cuanto pide cada quien. El techo diario cubre el abuso lento;
# esto cubre el rapido: seis preguntas en un minuto es mas de lo que nadie
# CONVERSA —es un dedo trabado o un guion— y con un solo motor eso deja a los
# demas esperando detras.
#
# No se castiga: se pide un momento y se sigue. Quien de verdad conversa no
# lo choca nunca; quien lo choca, espera unos segundos.
RAFAGA = int(os.environ.get('AURA_RAFAGA', '6'))          # preguntas
RAFAGA_VENTANA = float(os.environ.get('AURA_RAFAGA_S', '60'))   # en segundos

# Cuantos turnos de memoria lleva cada charla al motor. Mas historial empuja
# las fichas fuera de la ventana del modelo, y sin fichas el modelo inventa.
# ── CUANTO SE GUARDA DE UNA PERSONA ─────────────────────────────────────────
#
# Un mes sin escribir y se borra todo lo suyo: su perfil, su historial, lo que
# contó de su trabajo. Lo decidio Jose el 30-ago-2026.
#
# Antes no se borraba NADA, nunca. Ahi dentro esta lo que la gente le cuenta a
# AU-RA —a que se dedica, que le preocupa del dinero, ocho turnos de charla— y
# lo de alguien que escribio una vez hace un año seguia guardado. Para una
# empresa que vende cumplimiento, guardar conversaciones sin plazo ni criterio
# es lo contrario de lo que se le pide a un cliente.
#
# El plazo se cuenta desde la ULTIMA VEZ QUE ESCRIBIO, no desde que se creo el
# perfil: alguien que escribe todas las semanas no pierde su historial nunca, y
# alguien que escribio una vez desaparece al mes.
PLAZO_DIAS = int(os.environ.get('AURA_PLAZO_DIAS', '30'))

MEMORIA = 8

# Cuantos mensajes de una misma persona se atienden por vuelta. No se pierde
# ninguno —el tope no avanza sobre lo no procesado—, solo se les pone paso.
POR_VUELTA = 4

# Cuantas charlas a la vez. El motor en CPU atiende de a una igual (Ollama
# las encola), pero asi nadie espera a que la charla de OTRO termine para
# que la suya entre a la cola.
HILOS = 3

# LA VENTANA DEL MODELO, Y POR QUE SE CONFIGURA.
#
# Estaba escrita a mano en 8192 porque era lo que cabia en la T4 compartiendo
# tarjeta con la voz. En una tarjeta mas grande cabe mas, y cambiarla no puede
# obligar a tocar el codigo — es un numero que depende de la MAQUINA, no del
# programa.
#
# Y va atada a `HILOS`: ollama reserva memoria para `num_ctx` POR CADA
# conversacion en paralelo. Pedir 16384 con tres hilos son 48k de memoria de
# atencion, y si no cabe, ollama no avisa: tira capas al procesador y todo se
# vuelve siete veces mas lento sin un solo error. Paso el 1-sep, midiendo.
# `probar-motor.py` comprueba que los dos numeros cuadren con la tarjeta.
VENTANA = int(os.environ.get('AURA_VENTANA', '12288'))

# Al tercer fallo seguido atendiendo el mismo mensaje, se salta con ruido.
# Un mensaje venenoso no puede dejar la charla ciclando para siempre.
REINTENTOS = 3

# Cuanto se calla la puerta del idioma antes de volver a ofrecerla. Corto no
# alcanza —tres mensajes seguidos son una rafaga y repetirla es spam— y no
# tenerlo era peor: quien volvia al otro dia no recibia nada nunca mas.
# Diez minutos separan las dos cosas sin ambiguedad.
RESPIRO_PUERTA = 600


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

    def huella(self, h):
        return _post('/huella', self._f({'huella': h}))

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

    def enviar(self, para, texto, parcial=False):
        return _post('/enviar', self._f({'para': para, 'texto': texto,
                                         'parcial': bool(parcial)}))

    def editar(self, mid, texto, parcial=False):
        """Cambia el texto de un mensaje que ya salio. Es lo que convierte
        «la respuesta aparece de golpe» en «la respuesta se escribe»."""
        return _post('/editar', self._f({'id': mid, 'texto': texto,
                                         'parcial': bool(parcial)}))

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
    """A quien le contesta AU-RA. VACIO = A TODO EL MUNDO.

    ── POR QUE CAMBIO ────────────────────────────────────────────────────

    Era una lista de tres correos, y lo que recibia quien no estaba en ella
    era SILENCIO: ni una respuesta, ni un «todavia no». Alguien a quien le
    enseñan la app toca AU-RA, escribe, y no pasa nada — y no hay forma de
    saber desde fuera si esta rota o si no te toca.

    Se pidio abrirla a todos y se abre. La lista sigue existiendo por si
    algun dia hace falta volver a cerrar —una linea en un archivo— pero
    vacia significa abierta, que es lo que corresponde a un producto que se
    entrega.

    Lo que protege el motor ya no es quien sos sino CUANTO PEDIS: el techo
    por persona y por dia (TECHO_DIA) y el freno de golpe (RAFAGA), que
    estan abajo. Un limite por uso escala; una lista de nombres, no.
    """
    f = DATOS / 'probadores.txt'
    if not f.exists():
        return None                     # sin archivo: abierta
    lista = {l.strip().lower() for l in f.read_text().splitlines()
             if l.strip() and not l.strip().startswith('#')}
    return lista or None                # archivo vacio: tambien abierta


# ── la memoria del asistente ─────────────────────────────────────────────────

CANDADO_PERFILES = threading.Lock()

# Los perfiles que estan en uso, para que el parte pueda leer el termometro.
#
# Es EL MISMO diccionario que usa el bucle, no una copia. Con una copia, la
# gente que llegara despues no apareceria nunca y el termometro diria numeros
# de la hora del arranque — un numero viejo presentado como el de ahora es la
# misma clase de mentira que el precio inventado.
#
# Por eso el bucle NO hace `perfiles = cargar_perfiles()` a secas: rellena
# este, y se lo lleva. No se pasa por parametro porque `atender` ya lleva seis
# y el parte es lo unico que lo necesita.
PERFILES_VIVOS = {}


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
    """Guarda los perfiles, con permisos, y de una pieza.

    LOS PERMISOS NO SON CEREMONIA. Aqui dentro esta el historial de lo que la
    gente le cuenta a AU-RA —ocho turnos por persona, con su nombre, a que se
    dedica y que le preocupa del dinero—. Se escribia con los permisos que
    tocara por defecto; que la carpeta sea 700 lo tapaba, pero un archivo con
    datos de personas no puede depender de que el permiso este UN NIVEL MAS
    ARRIBA. El dia que alguien copie la carpeta, mueva el archivo o cambie
    `AURA_DATOS`, el dato viaja con los permisos que lleve puestos.

    Y el temporal tambien: entre que se escribe y se renombra hay un archivo
    completo con todo dentro. Se crea con 600 desde el primer byte.
    """
    with CANDADO_PERFILES:
        tmp = DATOS / 'perfiles.tmp'
        # `os.open` con el modo puesto: crear-y-luego-chmod deja una ventana en
        # la que el archivo ya tiene el contenido y todavia no los permisos.
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                     stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, 'w', encoding='utf8') as fh:
            json.dump(p, fh, ensure_ascii=False, indent=1)
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


def _precio_dicho(idi):
    """La frase del precio en vivo, o la de «no lo se» si la fuente no
    contesta. Nunca una cifra del modelo."""
    try:
        return precio.como_se_dice(idi) or precio.NO_SE_SABE.get(idi, precio.NO_SE_SABE['es'])
    except Exception as e:
        log('no pude leer el precio:', type(e).__name__, str(e)[:80])
        return precio.NO_SE_SABE.get(idi, precio.NO_SE_SABE['es'])


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


PREGUNTAS = [
    ('trabajo', None),   # la hace el saludo
    ('estudios', "Buenísimo. ¿Y qué estudiaste, o dónde se formó tu experiencia?"),
    ('interes', "Última y te dejo tranquilo: ¿qué te gustaría lograr con "
                "Orden Global — ahorrar, pagar, entender la cadena, otra cosa?"),
]


# Se avisa que la PRIMERA tarda mas, y no por cortesia: al cambiar de modo la
# maquina descarga un modelo y carga el otro, y eso solo es un minuto. Sin el
# aviso, ese minuto se lee como que se colgo, y la persona escribe de nuevo —
# lo que pone otra pregunta en la cola y lo empeora.

# La voz se apaga con una palabra y se enciende con una palabra. Lo que se
# elige aqui es CON QUE VOZ habla —calida, sobria, agil—, no si manda
# archivos: las notas de voz se retiraron y la voz va en vivo. El registro
# elegido lo usa la wallet al pedirla.
# La persona LEE esto, asi que va en los dos idiomas. Se quedo en espanol
# hasta el 30-ago porque nadie lo cruzo con una charla en ingles.


# Cuando el motor SI contesto pero no quedo nada util. No es lo mismo que
# estar caido, y decir «mi motor está apagado» ahi es dos errores en una
# frase: es mentira, y habla de las tripas de la casa, que el prompt le
# prohibe. Se pide de otra manera, que es lo que hace una persona que no
# entendio la pregunta.

# Un saludo se contesta saludando, y sin gastar motor. Van varios porque
# alguien que saluda tres veces y recibe tres veces la misma frase exacta
# descubre la maquina en el acto — que es justo lo que se esta tratando de
# que no pase. El ultimo se repite: a la cuarta ya no importa.
SALUDO_CORTO = (
    "Hola. ¿En qué andás? Preguntame lo que quieras del ecosistema.",
    "Acá estoy. Contame qué necesitás.",
    "Hola de nuevo. ¿Qué querés saber?",
)

# ── LO QUE NO PREGUNTA NADA ──────────────────────────────────────────────────
#
# «Qué», «qué me cuentas», «y?», «dale». No son preguntas: son la forma de
# pasarle la pelota a la otra persona. Y son EXACTAMENTE lo que peor le sale a
# un modelo de siete mil millones: sin contenido al que agarrarse, se va a
# asistente genérico. Medido en produccion, con captura:
#
#     «Qué»            → «¿Cómo estás? ¿Qué ondas? ¿Estás teniendo un buen
#                         día? [...] Puedo ayudarte con consejos para la
#                         cocina, planes para el fin de semana»
#     «Qué me cuentas» → casi el mismo parrafo otra vez
#
# Dos respuestas casi iguales, ninguna de AU-RA, y un muro de preguntas
# personales: el prompt le pide interes por la persona y sin nada mas de que
# hablar lo cumple al pie de la letra, todo junto y de una vez.
#
# Con un modelo chico esto no se arregla escribiendo mas reglas —ya estan
# escritas y no las obedece cuando la entrada esta vacia—: se arregla no
# preguntandole. Contesta la casa, al instante, en su voz, y devolviendo la
# pelota con algo concreto en vez de con cuatro preguntas.
# Y lo que fue una orden y ya no lo es. Los botones «Rápida» y «Pensadora»
# estuvieron a la vista, así que alguien va a escribirlo — y contestarle con
# un muro de preguntas genéricas es peor que decirle la verdad en una línea.

SIN_CONTENIDO = (
    "Contame vos. Puedo hablar de lo que quieras — donde más te sirvo es acá "
    "adentro: ORIGEN, tu cuenta, la cadena, Genesis ID.",
    "Lo que se te ocurra. Si querés una punta: preguntame cuánto vale ORIGEN "
    "hoy, o qué hace falta para verificarte.",
    "Vos dirás. Estoy para lo del ecosistema y para lo que no lo sea también.",
)




# ── el motor ─────────────────────────────────────────────────────────────────

def _sin_tildes(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s).lower())
                   if unicodedata.category(c) != 'Mn')


def cargar_saber():
    d = json.loads((DATOS / 'saber.json').read_text())
    fichas = d if isinstance(d, list) else d.get('fichas', [])
    return [f for f in fichas if f.get('publico') is not False]


RUTA_PROMPT = DATOS / 'PROMPT-AURA.md'


def cargar_prompt():
    md = RUTA_PROMPT.read_text()
    i = md.index('```')
    j = md.index('```', i + 3)
    return md[i + 3:j].strip()


def todo_el_saber(saber, idioma='es'):
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

    ── Y EN SU IDIOMA, QUE ES LO QUE FALTABA ───────────────────────────────

    Esto leia siempre `f['es']`, aunque cada ficha tenga su version inglesa
    desde hace meses. El resultado: quien elegia English recibia el guion
    traducido pero el MOTOR pensaba con las fichas en espanol, y colaba
    palabras — «se cruzan palabras en español», dijo Jose el 30-ago probando.
    No era el modelo mezclando idiomas: era su memoria, que estaba entera en
    uno solo.

    Se arma un sistema por idioma. Alternar entre los dos cuesta una
    relectura de cache, y vale: una charla entera consistente vale mas que el
    segundo que se ahorra al cambiar de persona.
    """
    return '\n'.join(f"— {f['tema']}: {f.get(idioma) or f.get('es', '')}"
                     for f in saber)



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
# Las formas se fueron encontrando UNA A UNA en produccion, y por eso la lista
# crece: el prompt lo prohibe con todas las letras y el modelo lo escribe
# igual. «¿Te interesa saber mas sobre otros colores en el cielo?» salio el
# 28-ago, cerrando una respuesta sobre por que el cielo es azul.
CIERRE_HUECO = _re.compile(
    r'\s*¿\s*(?:te gustar[ií]a saber m[aá]s|te interesa(?:r[ií]a)? saber m[aá]s|'
    r'hay algo m[aá]s|necesit[aá]s algo m[aá]s|quer[eé]s saber m[aá]s|'
    r'te (?:gustar[ií]a|interesa) que te (?:cuente|explique)|'
    r'puedo ayudarte en algo m[aá]s|en qu[eé] m[aá]s puedo ayudarte)\b'
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


# ── EL VOSEO, QUE ES LO QUE LA HACE SONAR DE ACA ──────────────────────────
#
# El prompt lo pide desde el primer dia —«de vos o de usted, nunca de tú»— y
# el modelo contesta «¿Y tú cómo estás?» igual. Es lo que hace un modelo
# entrenado sobre todo con español de España y de México.
#
# Y no es un detalle de gusto: es lo primero que delata a una maquina para un
# oido centroamericano. La queja fue textual —«contestó súper robótico… no
# como debía una persona humana»— y la respuesta que la provoco decia «tú».
#
# Se corrige aca, deterministamente, porque a un modelo abierto no se le
# confia una regla de estilo: ya paso con «según las fichas», con «Hola
# Tere» y con las listas.
#
# Solo formas CERRADAS y sin ambiguedad. «ves», «vas», «estás» y «das» son
# iguales en las dos formas y no se tocan. Los imperativos son los mas
# delicados —«mira» tambien es un sustantivo— asi que van los tres de uso
# diario y ninguno mas.
_VOSEO = [
    # SOLO CON TILDE. `tú` es el pronombre; `tu` sin tilde es el posesivo —
    # «tu identidad», «tu billetera»— y en voseo es EXACTAMENTE igual.
    # Cambiando los dos salia «Es vos identidad», que no es español de
    # ningun lado. Lo encontro la propia prueba.
    (r'\btú\b', 'vos'),
    (r'\bcontigo\b', 'con vos'),
    (r'\b(a|para|de|por|en|con|hacia|sin|sobre)\s+ti\b', r'\1 vos'),
    (r'\beres\b', 'sos'),
    (r'\btienes\b', 'tenés'),
    (r'\bpuedes\b', 'podés'),
    (r'\bquieres\b', 'querés'),
    (r'\bsabes\b', 'sabés'),
    (r'\bdebes\b', 'debés'),
    (r'\bhaces\b', 'hacés'),
    (r'\bdices\b', 'decís'),
    (r'\bvienes\b', 'venís'),
    (r'\bnecesitas\b', 'necesitás'),
    (r'\bprefieres\b', 'preferís'),
    (r'\bentiendes\b', 'entendés'),
    (r'\bconoces\b', 'conocés'),
    (r'\brecibes\b', 'recibís'),
    (r'\benv[ií]as\b', 'enviás'),
    (r'\bguardas\b', 'guardás'),
    (r'\bpagas\b', 'pagás'),
    (r'\bcobras\b', 'cobrás'),
    (r'\bdime\b', 'decime'),
    (r'\bcu[eé]ntame\b', 'contame'),
    (r'\bpreg[uú]ntame\b', 'preguntame'),
    # los verbos de todos los dias en esta casa: plata, cuenta y trabajo
    (r'\btrabajas\b', 'trabajás'), (r'\bbuscas\b', 'buscás'),
    (r'\busas\b', 'usás'), (r'\bganas\b', 'ganás'),
    (r'\bhablas\b', 'hablás'), (r'\bentras\b', 'entrás'),
    (r'\bmiras\b', 'mirás'), (r'\besperas\b', 'esperás'),
    (r'\bcompras\b', 'comprás'), (r'\bvendes\b', 'vendés'),
    (r'\bahorras\b', 'ahorrás'), (r'\bmandas\b', 'mandás'),
    (r'\btomas\b', 'tomás'), (r'\bllevas\b', 'llevás'),
    (r'\baceptas\b', 'aceptás'), (r'\bverificas\b', 'verificás'),
    (r'\bretiras\b', 'retirás'), (r'\bdeseas\b', 'querés'),
]
_VOSEO = [(_re.compile(p, _re.IGNORECASE), r) for p, r in _VOSEO]


def vosear(texto):
    """De tú a vos, respetando mayuscula inicial de cada palabra cambiada."""
    t = texto or ''
    for patron, con in _VOSEO:
        def cambio(m, con=con):
            nuevo = m.expand(con) if '\\' in con else con
            # «Tú» al principio de una frase tiene que salir «Vos», no «vos»
            return nuevo[0].upper() + nuevo[1:] if m.group(0)[0].isupper() else nuevo
        t = patron.sub(cambio, t)
    return t


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
    # Se APUNTA lo que se quita, en vez de deducirlo por la diferencia de
    # largos. Ver la guarda de abajo: deducirlo suponia que todo se quitaba
    # del principio, y el cierre hueco se quita del FINAL.
    quitado = []

    def _apunta(m):
        quitado.append(m.group(0))
        return ''

    sin_relleno = CIERRE_HUECO.sub(
        _apunta, PREAMBULO_ANUNCIO.sub(_apunta, sin_saludo)).strip()
    if not sin_relleno:
        sin_relleno = sin_saludo
        quitado.clear()
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
    # Antes esto era `sin_saludo[:len(sin_saludo) - len(sin_relleno)]`, o sea:
    # «lo quitado son los primeros N caracteres». Vale cuando se quita un
    # preambulo y NO vale cuando se quita un cierre — ahi esos primeros N
    # caracteres son el principio de lo que SE QUEDA, no lo que se fue.
    #
    # El fallo se veia asi: «Es una estafa: no le contestes. ¿Hay algo mas en
    # lo que pueda ayudarte?» conservaba la coletilla, porque la guarda leia
    # «Es una estafa: n…» —el texto bueno— creia que se estaba borrando un
    # aviso de estafa, y lo deshacia todo. La guarda protegia el texto de si
    # misma.
    if _INTOCABLE.search(' '.join(quitado)):
        sin_relleno = sin_saludo
    # Si de todo el trozo no queda NADA, es que el trozo era relleno de punta
    # a punta — «¡Hola Tere! Me alegra que tengas una tienda.» y se acabo. Eso
    # se tira entero: mandarlo es hacer esperar a alguien por un mensaje que
    # no dice nada. Quien llama tiene que saber tratar el vacio.
    if not sin_relleno:
        return ''
    # El markdown se va SIEMPRE y no tiene vuelta atras. No quita sentido —
    # cambia «**oro**» por «oro»— y en cambio dejarlo pasar significa que la
    # voz diga «asterisco asterisco oro asterisco asterisco».
    sin_marcas = sin_relleno
    for patron, con in MARCAS:
        sin_marcas = patron.sub(con, sin_marcas)
    sin_marcas = sin_marcas.strip()
    # el eco va DESPUES de quitar el markdown: el titulo suele venir como
    # «**¿Qué es AUKA?**» y sin quitar los asteriscos no se reconoce
    t = vosear(ECO.sub('', sin_marcas.lstrip()).strip())
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


# ── ¿ESTO ES DE LA CASA, O ES DE LA VIDA? ────────────────────────────────
#
# Sirve para UNA cosa y hay que decir para cual: cuando alguien pregunta algo
# que no es del ecosistema, se le quita al modelo el material con el que
# arrastra la respuesta de vuelta. Medido, con el hilo limpio y este mismo
# prompt: «Me siento solo estos dias» contestaba hablando de proteger los
# ahorros en ORIGEN y de abrir una billetera.
#
# El prompt YA le pide que no lo haga, en mayusculas y con su parrafo. No
# alcanza — un modelo de siete mil millones de parametros, con quince fichas
# del ecosistema delante y una linea que dice que la persona «busca proteger
# sus ahorros», va a hablar de ahorros. A una regla de estilo no se le confia
# un modelo abierto; ya se aprendio con las listas y con «segun las fichas».
#
# Asi que en vez de pedirselo mejor, se le saca la tentacion: para una
# pregunta de la vida no viaja la linea de su oficio ni de lo que busca, y si
# viaja un aviso corto. La lista es de palabras de la casa, no de temas: es
# imposible acertar todos los temas del mundo y es facil enumerar los
# nuestros.
_DE_LA_CASA = _re.compile(
    r"\b(origen|origenes|auka|agka|ondk|gramin|gramines|"
    r"genesis|g[eé]nesis|veta|wallet|billetera|monedero|"
    r"pulse ?2? ?chat|mytokenpay|my token pay|ordenex|ordenscan|aucorp|"
    r"orden global|cadena|blockchain|token|tokens|cripto|"
    r"tarjeta|saldo|cobrar|cobro|enviar plata|transferir|comisi[oó]n|"
    r"validador|nodo|staking|semilla|doce palabras|llave privada|contrase[ñn]a|"
    r"kyc|verificar|verificaci[oó]n|dep[oó]sito|retiro|oro|onza)\b",
    _re.IGNORECASE)

# Y esto va aparte: aunque la pregunta no nombre nada de la casa, si toca
# dinero o seguridad NO se afloja nada. «Me conviene invertir?» no nombra
# ORIGEN y sigue siendo terreno donde AU-RA no opina.
# Con RAIZ y no con palabra entera: «estafa» no casaba con «estafaron», que
# es justo como lo escribe alguien a quien acaban de estafar.
_DELICADO = _re.compile(
    r"\b(invertir|invierto|inversi[oó]n|comprar|vender|ganancia|rendimiento|"
    r"impuesto\w*|declarar|sat|dian|"
    r"estaf\w*|fraud\w*|rob(o|ar|aron|aste|é)|timaron|hacke\w*|phishing)\b",
    _re.IGNORECASE)


def _de_la_casa(dicho):
    """¿La pregunta es del ecosistema (o de algo donde no se afloja)?"""
    t = str(dicho or '')
    return bool(_DE_LA_CASA.search(t) or _DELICADO.search(t))


# Este aviso NO lo lee la persona: se le pega al turno del motor. Va en los
# dos idiomas igual, porque un aviso en espanol dentro de una charla en ingles
# le empuja el idioma al modelo — que es como se cruzan las palabras.
AVISO_DE_LA_VIDA = {
    'es': ('[esto NO es del ecosistema: contestale de verdad y con lo que '
           'sabés, como una amiga que entiende del tema. No menciones Orden '
           'Global, ORIGEN, la billetera ni los ahorros; no cierres llevándolo '
           'para allá. Si de verdad viene al caso, ya vendrá solo]'),
    'en': ('[this is NOT about the ecosystem: answer for real, with what you '
           'know, like a friend who understands the topic. Do not mention '
           'Orden Global, ORIGEN, the wallet or savings; do not steer the '
           'ending back there. If it genuinely comes up, it will come up on '
           'its own]'),
}


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
    de_la_casa = _de_la_casa(dicho)
    # ── EL FRENO DE LISTAS NO VALE PARA TODO ──────────────────────────────
    #
    # Existe para que una explicacion del ecosistema no salga maquetada como
    # un folleto, y ahi hace falta. Pero para una pregunta de la vida la
    # estructura ES la respuesta: quien pregunta como armar un curriculum
    # quiere los pasos.
    #
    # Con el freno puesto, «¿Como hago un curriculum?» devolvia «puede parecer
    # abrumador, pero con organizacion lo podes hacer muy bien» — cortado
    # justo antes del primer paso, y sin decir uno solo. Medido en el nodo.
    #
    # Se apaga para lo que no es de la casa. El limpiador de la salida quita
    # los asteriscos igual, asi que la lista sale en prosa y no maquetada.
    if frenar_listas and not de_la_casa:
        frenar_listas = False
    datos = []
    if contexto:
        datos.append(contexto)
    # El oficio y «lo que busca» solo viajan cuando la pregunta es de la casa:
    # son para ELEGIR EL EJEMPLO —a quien tiene una pulperia se le habla de
    # cobrar con QR—, y en una pregunta de la vida no hay ejemplo que elegir.
    # Ahi lo unico que hacen es dar la excusa para volver a los ahorros.
    if perfil.get('trabajo') and de_la_casa:
        datos.append(f"se dedica a {perfil.get('trabajo','')[:120]}; "
                     f"se formo en {perfil.get('estudios','')[:120]}; "
                     f"busca {perfil.get('interes','')[:120]}")
    quien = f"[quien te habla: {'; '.join(datos)}]\n" if datos else ''
    # El aviso solo cuando hay ALGUIEN preguntando. Sin perfil no hay persona:
    # es el templado del arranque, que manda «hola» a secas para que la
    # primera persona del dia no pague los 237 segundos del arranque en frio.
    # Pegarle el aviso le cambiaba el turno, y con eso dejaba de ser
    # distinguible de una pregunta de verdad — siete comprobaciones en rojo
    # de una sola linea, porque se corrian todos los indices.
    if not de_la_casa and perfil:
        # `perfil`, no `p`: aqui la persona se llama `perfil`. Con `p` esto era
        # un NameError que solo saltaba en la pregunta de la vida —la de fuera
        # de casa—, o sea que AU-RA contestaba bien de Orden Global y se moria
        # con «¿como esta el clima?». Y se moria hacia AFUERA: la persona leia
        # «mi motor esta apagado», que es mentira, el motor estaba entero.
        quien += AVISO_DE_LA_VIDA[_idi(perfil)] + '\n'
    mensajes = ([{'role': 'system', 'content': sistema}]
                + historial[-MEMORIA:]
                + [{'role': 'user', 'content': quien + str(dicho)[:1000]}])
    modelo = MODELO_RAPIDA
    cuerpo = json.dumps({
        'model': modelo, 'messages': mensajes, 'stream': bool(al_vuelo),
        # ── POR QUE 24 HORAS Y NO 30 MINUTOS ──────────────────────────
        # Con 30m, CUALQUIER hueco de media hora saca el modelo de la VRAM:
        # el almuerzo, la noche, toda la mañana. Y el arranque en frio esta
        # medido en este mismo nodo — 237 segundos. O sea que la primera
        # persona que escribia cada mañana esperaba casi cuatro minutos, y
        # no habia forma de saberlo desde fuera: parecia «esta lento».
        # La maquina es DEDICADA a esto. No hay nadie con quien turnarse la
        # memoria de video, asi que soltarla no compra nada y cuesta cuatro
        # minutos al primero de cada dia.
        'keep_alive': '24h',
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
            # ── POR QUE MENOS, Y POR QUE MUCHO MENOS CON VOZ ────────────
            # «en voz nunca salió». Salió: el registro tiene la nota. Pero
            # eran 39,7 SEGUNDOS de audio, que tardan 34 en generarse — y
            # nadie espera cuarenta segundos mirando una pelotita. La voz no
            # fallaba: la respuesta era demasiado larga para decirse.
            #
            # ── EL TECHO DE PALABRAS ──────────────────────────────────────
            #
            # Estaba en 70 con la voz encendida, y tenia sentido cuando la voz
            # era un ARCHIVO: habia que esperar a que se grabara entera, asi
            # que una respuesta larga eran veinte segundos de pelotita quieta.
            # Pedir la mitad de palabras era pedir la mitad de espera.
            #
            # Ya no. La voz sale en vivo y el primer sonido llega a los 2,8s
            # dure lo que dure la respuesta (ver infra/aura/voz.py). Ese techo
            # dejo de proteger a nadie y empezo a cortar: en el hilo de
            # produccion, 17 de 119 respuestas —el 14%— terminaban a media
            # palabra («...similar al», «...para que me sirve»).
            #
            # Se sube a 200 con voz. Sigue siendo corto —el prompt pide tres
            # frases y las pide en cuatro sitios—, pero ahora el techo es un
            # techo de emergencia y no el que decide donde termina la frase.
            'num_predict': (200 if perfil.get('voz') else
                            160),
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
            'num_ctx': VENTANA,
        },
    }).encode()
    req = urllib.request.Request(
        MOTOR + '/api/chat', data=cuerpo, method='POST',
        headers={'Content-Type': 'application/json'})

    if not al_vuelo:
        with urllib.request.urlopen(req, timeout=TIMEOUT_MOTOR) as r:
            j = json.loads(r.read())
        crudo = (j.get('message') or {}).get('content', '').strip()
        # `done_reason` == 'length' significa QUE EL MOTOR SE QUEDO SIN TECHO,
        # no que termino de hablar. Es la diferencia entre un punto final y un
        # tijeretazo, y hasta ahora se adivinaba mirando el ultimo caracter.
        # Adivinar fallaba justo en el caso peor: una frase larga cortada a
        # mitad de palabra no tiene ningun signo raro al final — solo termina.
        cortado = j.get('done_reason') == 'length'
        # Devuelve LO MISMO que el camino con streaming: (lo que se manda,
        # lo que dijo el motor en crudo). Antes devolvia un solo valor, y el
        # que llama desempaqueta dos — bastaba con apagar el streaming para
        # que reventara. Las dos salidas de una funcion tienen que tener la
        # misma forma o la funcion tiene dos funciones adentro.
        return _recortar(limpiar(crudo), cortado), crudo

    entero, pendiente = '', ''
    cortado = False
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
                cortado = j.get('done_reason') == 'length'
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
    resto = _recortar(limpiar(pendiente.strip()), cortado)
    return resto, entero


_CORTESIA = _re.compile(
    r"^(hola|buen[oa]s?)\b|me alegra|qu[eé] (buena|linda) pregunta|"
    r"gracias por (preguntar|escribir)|encantada", _re.IGNORECASE)


_PROMESA = _re.compile(
    r"\b(vamos a (ayudarte|explicarte|ver|contarte)|te (explico|cuento|dejo|"
    r"muestro|comparto)|aqu[ií] (te dejo|van|tienes|ten[eé]s)|"
    r"segu[ií] estos pasos|estos son los pasos|los pasos son|"
    r"lo primero que|te lo explico|ahora te)\b", _re.IGNORECASE)


def _promete_y_no_cumple(texto):
    """¿Esto ANUNCIA una respuesta en vez de darla?

    El freno de listas corta la generacion en cuanto el modelo empieza a
    maquetar. Cuando lo que alcanzo a escribir antes del corte fue la entrada
    —«Vamos a ayudarte a crear un curriculum que destaque tu experiencia.»—
    queda un mensaje que TERMINA EN PUNTO y no dice nada. La regla vieja
    miraba los dos puntos finales y a este no lo veia: cierra bien.

    Salio de produccion: «¿Como hago un curriculum?» devolvio esa frase y
    nada mas. La persona se queda esperando los pasos que nunca llegan.

    Dos condiciones, y la segunda es la que lo hace util: que sea CORTO, y
    que el anuncio este en la ULTIMA frase.

    Lo de la ultima frase no es un detalle. «Mira, te cuento. Funciona asi y
    asa. Y esto otro.» tambien dice «te cuento», y cumple — el anuncio abre y
    detras viene lo prometido. Lo que no cumple es cuando el anuncio ES el
    final, porque ahi no vino nada detras. Sin esa distincion, esto saltaba
    con respuestas perfectamente sanas y hacia repreguntar al motor de gusto.
    """
    t = (texto or '').strip()
    if len(t) >= 160:
        return False
    m = None
    for m in _PROMESA.finditer(t):
        pass          # el ULTIMO anuncio, que es el que puede quedar colgando
    if not m:
        return False
    # Donde empieza la ULTIMA frase. Si el anuncio cae ahi dentro, no vino
    # nada detras. Se mide por frases y no buscando el siguiente punto: el
    # punto suele estar pegado al anuncio mismo («te cuento. ») y esa cuenta
    # daba siempre cero.
    cortes = [c.end() for c in _re.finditer(r'[.!?…]\s+', t)]
    ultima = cortes[-1] if cortes else 0
    return m.start() >= ultima


def _es_cortesia(frase):
    """¿Esta frase es puro saludo y no contesta nada? Se mira que sea corta Y
    que empiece con una formula: una frase larga que ademas saluda si lleva
    contenido y se manda igual."""
    return len(frase) < 120 and bool(_CORTESIA.search(frase))


def _recortar(texto, cortado=False):
    """Nunca se muestra media palabra.

    `cortado` viene del motor: True cuando se quedo sin techo de palabras en
    vez de terminar de hablar. Con esa certeza se retrocede SIEMPRE hasta la
    ultima frase completa; sin ella habia que adivinar por el ultimo caracter,
    y adivinar fallaba justo en el caso peor —una frase larga cortada a mitad
    de palabra no deja ninguna pista, solo termina—.

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
        if corte > 0 and (cortado or promesa or corte >= len(t) * 0.5):
            t = t[:corte + 1].strip()
        elif cortado:
            # Cortado y sin un solo punto en toda la respuesta: no hay frase
            # completa a la que volver. Se cierra en la ultima palabra ENTERA
            # y con puntos suspensivos, que es lo que hace una persona a la
            # que se le acaba el aire. Peor seria «...para que me sir».
            hueco = t.rfind(' ')
            if hueco > 40:
                t = t[:hueco].rstrip(' ,;:') + '…'
    return t



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


def _derivar_al_equipo(rel, p, de):
    """Le avisa a Jose QUIEN esta por escribirle, antes de que le escriba.

    Es la mitad del valor de este camino. Sin esto le llega un «hola» de un
    numero desconocido y tiene que empezar preguntando lo que la persona ya
    conto — que es exactamente la sensacion de ser un numero.

    Si el aviso falla no se cae nada: la persona ya tiene el WhatsApp y puede
    escribir igual. Se deja anotado y se sigue.

    ── QUIEN LO RECIBE, Y POR QUE ESTO CAMBIO ─────────────────────────────

    Antes se leia `vistazo.JEFES`, que sale de la variable `AURA_PARTE_PARA`.
    Esa variable ESTA VACIA en el nodo, asi que el bucle recorria cero
    personas y la ficha no le llegaba nunca a nadie. La funcion existia,
    estaba bien escrita, y era un no-op silencioso — peor que no tenerla,
    porque parecia hecho.

    Ahora manda el ESCALAFON, que es la unica fuente sobre quien es admin.
    `AURA_PARTE_PARA` se conserva de respaldo por si algun dia el escalafon
    esta vacio, con el mismo orden que usa `vistazo.puede_pedirlo`: dos listas
    para la misma pregunta es como una de las dos se queda vieja sin que nadie
    lo note, y esta se quedo vieja del todo.
    """
    registro.anotar('equipo', motivo=(p.get('motivo') or '')[:40])
    a_quien = []
    for persona in escalafon.admins():
        for donde in escalafon.formas_de(persona):
            if donde.isdigit():
                a_quien.append(donde)
                break         # un aviso por persona, no por buzón
    if not a_quien:
        a_quien = [j for j in vistazo.JEFES if j.isdigit()]
    if not a_quien:
        # Que nadie lo reciba no puede volver a pasar en silencio: es una
        # persona interesada que se pierde.
        log('NADIE recibe la ficha del traspaso: revisá AURA_ESCALAFON')
        return
    for jefe in a_quien:
        try:
            rel.enviar(jefe, guion.aviso_para_el_equipo(p, de))
        except Exception as e:
            log('el aviso al equipo no salio:', type(e).__name__, str(e)[:70])


def _idi(p):
    """El idioma de esa persona, con el espanol de respaldo.

    Existe porque los mensajes de fuera del guion se mandan desde sitios que
    solo tienen el perfil a mano, y repetir `p.get('idioma') or 'es'` en diez
    lugares es como uno de los diez se queda sin traducir.
    """
    return (p or {}).get('idioma') or guion.POR_OMISION


def perfil_de(perfiles, correo, tope=None):
    p = perfiles.setdefault(correo, {})
    p.setdefault('historial', [])
    p.setdefault('dia', hoy())
    p.setdefault('usadas', 0)
    # Cuando se le vio por ultima vez. Es lo que decide el olvido, y se pone
    # tambien al CREAR el perfil: sin eso, uno recien creado no tendria fecha y
    # el olvido tendria que adivinar — que es como se borra a alguien que acaba
    # de escribir.
    p.setdefault('visto', int(time.time()))
    if tope is not None:
        # Una charla sin tope conocido arranca EN EL PRESENTE. Es la guarda
        # contra la avalancha: perfil perdido o probador re-agregado no
        # significa recontestar 200 mensajes viejos a medio minuto cada uno.
        p.setdefault('tope', tope)
    return p


_PIDE_PARTE = _re.compile(
    r'^\s*(actualizar|parte|resumen|estado|como vamos|cómo vamos)\s*[.!?]*\s*$',
    _re.IGNORECASE)


# «charlas» a secas, o «charla 2176»: el espejo. Anclado de punta a punta por
# la misma razon que el parte — «me gustan las charlas con vos» es una persona
# conversando, no un comando.
# ── SACAR EL NOMBRE DE LO QUE SEA QUE ESCRIBAN ──────────────────────────────
#
# Nadie contesta «Melany» a secas. Contestan «me llamo Melany», «soy Melany
# Ordóñez», «Melany 😊», o mandan una frase entera. Guardar el mensaje crudo
# daria un «Mucho gusto, me llamo Melany Ordóñez» que delata a la maquina en
# el segundo mensaje.
#
# Se saca el PRIMER nombre y nada mas — es como se habla, y ademas es el dato
# menos comprometedor de los que la persona podria darnos.
#
# Y si no se reconoce nada parecido a un nombre, se sigue SIN nombre en vez de
# guardar basura: el guion sabe cerrarse solo sin el (ver `_sin_nombre`). Una
# persona que no quiso decirlo no tiene que ver su propia evasiva convertida
# en su nombre el resto de la charla.
_ARRANQUES = _re.compile(
    r'^\s*(?:me\s+llamo|mi\s+nombre\s+es|soy|my\s+name\s+is|i\s*am|i\'m|'
    r'call\s+me|es|it\'s)\s+', _re.IGNORECASE)
# Verbos con los que empieza una frase, nunca un nombre. Cubre los titulos de
# las listas y lo que la gente escribe cuando cuenta en vez de presentarse.
_ARRANQUE_VERBO = _re.compile(
    r"^(tengo|trabajo|estudio|recibo|hago|vivo|quiero|necesito|busco|ando|"
    r"soy|estoy|vendo|manejo|cuido|tiene|tienen|"
    r"i|we|have|work|study|receive|want|need|live|do|am|is)$",
    _re.IGNORECASE)
_NOMBRE_BUENO = _re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{1,19}$")


def _leer_nombre(dicho):
    """El primer nombre, o `None` si no se reconoce ninguno."""
    t = _ARRANQUES.sub('', (dicho or '').strip())
    # Fuera emojis y puntuacion de adorno; queda lo que se pueda leer en voz.
    t = _re.sub(r'[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\'’\- ]', ' ', t).strip()
    if not t:
        return None
    primera = t.split()[0]
    if not _NOMBRE_BUENO.match(primera):
        return None
    # Una frase larga no es una presentacion: «no te voy a decir mi nombre».
    if len(t.split()) > 5:
        return None
    # Ni una frase que empieza por un verbo: «tengo un negocio», «trabajo por
    # mi cuenta». Son titulos de botones de otra pantalla, y bautizaron a Jose
    # como «Tengo» el 30-ago. El `toco` ya los filtra; esto cubre a quien los
    # TRANSCRIBE a mano, que pasa todo el tiempo.
    if _ARRANQUE_VERBO.match(primera):
        return None
    # Y tampoco el titulo de una opcion del guion, transcrito a mano. Se
    # pregunta al guion en vez de repetir la lista: una opcion nueva queda
    # cubierta sin que nadie la anote en dos sitios.
    if guion.es_titulo_de_opcion(dicho):
        return None
    # «MELANY» se guarda como «Melany»: quien escribe en mayusculas no quiere
    # que le griten el nombre en cada mensaje el resto de la charla.
    if primera.isupper() and len(primera) > 1:
        primera = primera.capitalize()
    return primera[:1].upper() + primera[1:]


_PIDE_CHARLAS = _re.compile(
    r'^\s*charlas?\s*(?P<sufijo>\d{2,15})?\s*[.!]*\s*$', _re.IGNORECASE)


def _pide_el_parte(dicho):
    """ANCLADO de punta a punta, como los demas atajos de la casa.

    «actualizar» a secas pide el parte; «como actualizo la app» es una pregunta
    de alguien y no puede caer aqui. Con `\b` en medio de la frase caeria, y ya
    nos paso hoy con la palabra «ayuda».
    """
    return bool(_PIDE_PARTE.match(dicho or ''))


def _arrancar_juego(rel, p, de):
    """Abre el juego, o dice que ya cobro. Comprueba ANTES de preguntar: hacer
    tres preguntas para despues decir «ya cobraste» es la peor forma posible de
    decirlo."""
    # El tope, ANTES de preguntar nada. Hacer tres preguntas para despues
    # decir «se acabó» es la peor forma posible de decirlo, y queda como una
    # estafa aunque no lo sea.
    if premio.agotado():
        registro.anotar('juego', paso='agotado')
        rel.enviar(de, guion.frase('premios-agotados', _idi(p)))
        return
    if premio.ya_reclamo(telefono=de):
        rel.enviar(de, guion.frase('ya-reclamo', _idi(p)))
        return
    p['juego'] = premio.arrancar()
    p['nodo'] = None
    registro.anotar('juego', paso='arranca')
    rel.enviar(de, premio.pregunta_de(p['juego'],
                                      p.get('idioma') or premio.POR_OMISION))


def _atender_juego(rel, p, de, dicho):
    """Un turno del juego. Devuelve algo si lo consumio, `None` si no.

    Devolver `None` es importante: quien esta jugando y de golpe pregunta otra
    cosa no puede quedar atrapado. Se le suelta y sigue su camino.
    """
    j = p['juego']

    # Primero las preguntas.
    idi = p.get('idioma') or premio.POR_OMISION
    if j.get('paso', 0) < len(premio.PREGUNTAS):
        texto, termino = premio.responder(j, dicho, idi)
        if termino:
            rel.enviar(de, texto + '\n\n' + premio.pide_billetera(idi))
        else:
            rel.enviar(de, texto)
        return True

    # Despues, la direccion.
    direccion = premio.leer_direccion(dicho)
    if not direccion:
        # Si escribio otra cosa, se le recuerda UNA vez y despues se le suelta:
        # insistir con la billetera a quien esta preguntando otra cosa es
        # exactamente atrapar.
        if j.get('pedido', 0) >= 1:
            p.pop('juego', None)
            return None
        j['pedido'] = j.get('pedido', 0) + 1
        rel.enviar(de, guion.frase('falta-direccion', _idi(p)))
        return True

    if premio.problema_con(direccion):
        rel.enviar(de, guion.frase('billetera-nuestra', _idi(p)))
        return True

    ok, motivo = premio.anotar(de, direccion, j.get('aciertos', 0))
    p.pop('juego', None)
    if not ok:
        registro.anotar('juego', paso='repetido', por=motivo)
        rel.enviar(de, {
            'billetera': 'Esa billetera ya recibió su ORIGEN. 🌱 Es uno por '
                         'persona — pero seguí preguntándome lo que quieras.',
            'telefono': guion.frase('ya-cobro-telefono', _idi(p)),
            # Entraron otros mientras esta persona jugaba. Se le dice con el
            # nombre correcto y sin culparla: llego tarde por segundos.
            'agotado': guion.frase('agotado-jugando', _idi(p)),
            'ilegible': guion.frase('registro-ilegible', _idi(p)),
        }.get(motivo, guion.frase('no-pude-anotar', _idi(p))))
        return True

    registro.anotar('juego', paso='ganado', aciertos=j.get('aciertos', 0))
    rel.enviar(de, guion.frase('anotado', _idi(p)))
    return True



# Los mensajes saltados de la ultima hora. El vigilante avisa con UNO: un
# mensaje saltado es una persona que escribio y no recibio nada.
SALTADOS = []
VENTANA_SALTADOS = 3600


def saltados_recientes(ahora=None):
    ahora = ahora if ahora is not None else time.time()
    SALTADOS[:] = [t for t in SALTADOS if ahora - t <= VENTANA_SALTADOS]
    return len(SALTADOS)


DISCULPA = {
    'es': ('Perdón — se me trabó al contestarte eso y no quiero dejarte '
           'esperando en silencio.\n\n'
           'Tu mensaje me llegó; el fallo es mío. Probá a escribírmelo otra '
           'vez y si sigo igual te atiende una persona: wa.me/50432136457'),
    'en': ('Sorry — something broke while I was answering that, and I do not '
           'want to leave you waiting in silence.\n\n'
           'Your message did reach me; the fault is mine. Try sending it '
           'again, and if I am still stuck a person will help you: '
           'wa.me/50432136457'),
}


def _avisar_del_salto(rel, p, correo):
    """Le dice a la persona que su mensaje se cayo. Ver donde se llama.

    Como mucho UNA vez por hora: si lo que falla es el motor entero, cada
    mensaje que mande dispararia una disculpa y le llenariamos el telefono de
    perdones. Pedir perdon en bucle es otra manera de estar rota.
    """
    ahora = time.time()
    if ahora - (p.get('disculpa') or 0) < 3600:
        return
    p['disculpa'] = ahora
    rel.enviar(correo, DISCULPA.get(p.get('idioma') or 'es', DISCULPA['es']))


def _recordar(p, dicho, contestado):
    """Apunta un ida y vuelta en la memoria de esa persona.

    Existe para que el GUION deje huella igual que el motor: sin esto, cada
    respuesta del guion es un hueco que paga la pregunta siguiente. Ver
    `_mandar_nodo`.

    El tope y el recorte son los mismos que usa el motor — dos memorias con
    reglas distintas es una memoria que se comporta de dos maneras.
    """
    if not contestado:
        return
    p['historial'] = ((p.get('historial') or []) + [
        {'role': 'user', 'content': (dicho or '')[:600]},
        {'role': 'assistant', 'content': contestado[:600]},
    ])[-MEMORIA:]


def _que_falta(hueco):
    """Le pregunta a la persona el dato que falta, con sus opciones si las
    tiene. Sin decir las opciones, «reiniciar» se contesta con cualquier cosa
    y se rechaza tres veces seguidas."""
    forma = hueco[1]
    if forma['clase'] == 'una-de':
        return (f'¿Cuál {hueco[0]}?\n\n'
                + '\n'.join('• ' + o for o in forma['opciones']))
    return (f'Contame el {hueco[0]}, con detalle.\n\n'
            f'Lo va a leer entero quien lo firme, así que escribilo claro. '
            f'Hasta {forma["largo"]} caracteres.')


def _hacer_encargo(rel):
    """Lo que ejecuta un encargo que SALE SOLO — solo los de mirar.

    El mayordomo se importa aqui dentro y no arriba a proposito: asi el
    asistente no lo carga si nadie pide nada, y sobre todo, `puerta.py` no
    tiene que conocerlo. El que dibuja la puerta no puede hacer nada.
    """
    def hacer(e):
        try:
            import mayordomo
            mano = mayordomo.MANOS.get(e['clave'])
            if not mano:
                rel.enviar(e['quien'], f'{e["id"]}: no hay quien lo haga')
                return
            encargos.tomar(e['id'])
            bien, texto = mano(e)
            encargos.terminar(e['id'], bien, texto)
            rel.enviar(e['quien'], texto)
        except Exception as err:
            encargos.terminar(e['id'], False, f'{type(err).__name__}')
            rel.enviar(e['quien'],
                       f'{e["id"]}: no se pudo — {type(err).__name__}')
    return hacer


def atender(rel, sistema, p, de, dicho, mensaje=None):
    """Atiende un mensaje y APUNTA CUANTO TARDO.

    ── POR QUE ESTA ENVOLTURA EXISTE ──────────────────────────────────────

    De una revision: no se medía en ningún sitio cuánto tarda AU-RA en
    contestar. Es la primera cosa que nota quien le escribe —antes que si la
    respuesta es buena— y era la unica que no estaba escrita en ninguna parte.
    Se sabia que el modelo daba 44,6 fichas por segundo, que es un dato del
    aparato; nadie sabia cuantos SEGUNDOS espera una persona.

    Y sin eso no se puede mejorar: cualquier cambio para «que vaya mas rapido»
    seria una opinion contra otra opinion.

    Se apunta tambien SI HUBO MOTOR. Es el reparto que de verdad manda en el
    gasto y en la espera: lo que contesta el guion sale en centesimas y no toca
    la tarjeta; lo que llega al modelo tarda segundos. Cuando esa proporcion se
    mueva, se va a ver aqui.

    El cuerpo de siempre esta en `_atender`. Esta capa no decide nada: si
    apuntar fallara, la conversacion NO se cae — medir no puede ser mas
    importante que contestar.
    """
    arranco = time.monotonic()
    antes = p.get('usadas') or 0

    # ── LOS DIAS EN QUE SE LE VIO ─────────────────────────────────────────
    #
    # De aqui sale «cuantos volvieron», que es la unica nota que no se puede
    # fingir: nadie vuelve a hablar con algo que no le sirvio. Ni encuestas ni
    # botones — quien vuelve al dia siguiente ya lo dijo.
    #
    # Va en esta envoltura y no junto a los ocho `p['visto'] = ...` que hay
    # repartidos: uno solo de esos ocho olvidado seria una persona que volvio y
    # no cuenta, y el numero quedaria mal sin que nadie lo note.
    #
    # Son FECHAS, no horas, y solo cuatro: cuenta si volvio, no a que hora
    # entra. Guardar menos de lo que hace falta es la manera barata de no tener
    # que cuidarlo despues.
    dias = p.get('dias_vistos') or []
    d = hoy()
    if d not in dias:
        p['dias_vistos'] = (dias + [d])[-4:]

    try:
        return _atender(rel, sistema, p, de, dicho, mensaje)
    finally:
        try:
            registro.anotar('contesto',
                            ms=int((time.monotonic() - arranco) * 1000),
                            motor=bool((p.get('usadas') or 0) > antes))
        except Exception:
            pass


def _atender(rel, sistema, p, de, dicho, mensaje=None):
    """Atiende UN mensaje. Si lanza, el que llama decide reintentar o saltar;
    aqui no se avanza ningun tope.

    `sistema` es un diccionario por idioma —ver `arrancar`—. Se acepta tambien
    una cadena suelta para no romper a quien lo llame de otra manera; entonces
    vale para los dos.
    """
    # ── LO QUE HACE FALTA DESDE LA PRIMERA LINEA ──────────────────────────
    #
    # `toco` y `idi` se leen AQUI, arriba del todo, porque los usa casi todo
    # lo que viene despues — incluido el manejo de errores, que es donde mas
    # duele que falten.
    #
    # Estaban mas abajo, y dos cosas quedaron usandolos antes:
    #
    #   · la puerta de los encargos leia `toco` veinte lineas antes de que
    #     existiera. AU-RA se quedo muda para TODO EL MUNDO cuatro horas y
    #     media el 1-sep, con el servicio diciendo «active».
    #   · el `except` del espejo —que existe justo para que un fallo no tumbe
    #     la conversacion— usaba `idi`. O sea que la red de seguridad se caia
    #     sola, en el momento exacto en que hacia falta.
    #
    # Python no avisa de esto al importar: revienta corriendo, con
    # UnboundLocalError. `probar-nombres.py` lo caza ahora.
    toco = (mensaje or {}).get('toco')

    # ── EL IDIOMA SIGUE A LA PERSONA, NO AL DIA QUE ELIGIO ─────────────────
    #
    # La puerta pregunta el idioma una vez y lo guarda. El GUION usaba ese, y
    # el MOTOR usaba el del mensaje —se lo dice el prompt—: o sea que el
    # sistema se comportaba de dos maneras y quien cambiaba de idioma recibia
    # media conversacion en cada uno. Es la queja de Jose del 30-ago.
    #
    # Ahora manda lo que la persona ESCRIBIO, si esta claro. Si no lo esta
    # —«ok», «si», un nombre, un numero— se queda el guardado: cambiarle el
    # idioma a alguien que no lo pidio se lee como que la maquina se equivoco.
    #
    # Y se GUARDA el cambio: si escribio dos veces en ingles, el parte y el
    # recibo del premio tambien van en ingles. Media casa en un idioma y
    # media en otro es peor que cualquiera de los dos.
    _guardado = p.get('idioma') or guion.POR_OMISION
    idi = guion.en_que_habla(dicho, _guardado)
    if idi != _guardado and p.get('idioma'):
        p['idioma'] = idi
        log(f'…{str(de)[-4:]} escribió en {idi}: se le cambia el idioma')

    # ── EL GUION VA ANTES QUE EL MOTOR ────────────────────────────────────
    #
    # Si lo que llega es un boton tocado, o algo que lleva derecho a un nodo
    # escrito, se contesta de ahi y no se enciende el motor. Sale al instante,
    # no cuesta GPU, y —lo que mas importa— NO PUEDE ALUCINAR: es texto que
    # escribimos nosotros.
    #
    # Va antes del saludo porque el propio saludo es un nodo del guion: quien
    # escribe por primera vez recibe las tres puertas, no un «¿en que te
    # ayudo?» al vacio.
    #
    # Y no encierra a nadie: lo que no encaja con ningun nodo devuelve `None` y
    # sigue su camino de siempre. Ver la cabecera de guion.py.
    # ── EL PARTE, A PEDIDO ────────────────────────────────────────────────
    #
    # «actualizar» y AU-RA arma el parte y lo manda. No cuesta motor y no puede
    # alucinar: son cuentas leidas de sitios de verdad.
    #
    # Y va RESTRINGIDO. El parte lleva identidades en cola, premios por pagar y
    # el estado de Meta: no es para cualquiera que adivine la palabra. Sin
    # `AURA_PARTE_PARA` puesto no lo recibe nadie, que es lo correcto por
    # defecto.
    #
    # Pedido asi no hace falta plantilla de Meta: si Jose escribe, la ventana de
    # 24 horas esta abierta y el texto libre pasa. La plantilla solo hace falta
    # para el parte de las 7:30 y las 19:30, que llega sin que nadie escriba.
    if _pide_el_parte(dicho) and vistazo.puede_pedirlo(de):
        registro.anotar('parte', quien='a pedido')
        # EL SUYO, no el de todos. A quien lleva mercadeo, «el disco al 71%»
        # no le dice nada — es la misma razon por la que el parte de las 7:30
        # ya va por tramo. Quien no este en el escalafon recibe el de admin,
        # que es como funcionaba antes.
        suyos = list(escalafon.tramos_de(de)) or ['admin']
        d = miradas.para(suyos, registro=registro, premio=premio,
                         clave_wa=os.environ.get('ZERNIO_CLAVE', ''),
                         cuenta_wa=os.environ.get('ZERNIO_CUENTA', ''),
                         encargos=encargos, perfiles=PERFILES_VIVOS)
        rel.enviar(de, miradas.texto(suyos, d))
        return

    # ── EL ESPEJO: SOLO PARA QUIEN PUEDE PEDIR EL PARTE ─────────────────────
    #
    # Muestra numeros y charlas privadas de gente real: misma lista que el
    # parte, y el que mira no se lista a si mismo. Ver espejo.py.
    # SOLO ADMIN, y no «quien puede pedir el parte». El espejo enseña
    # numeros y conversaciones privadas de gente real: que Nicole pueda ver
    # su parte de mercadeo no quiere decir que pueda leer las charlas de
    # nadie. Antes iban por la misma puerta, y con `puede_pedirlo` mirando
    # ahora el escalafon, esa puerta se habria abierto a los seis.
    m_esp = _PIDE_CHARLAS.match(dicho or '')
    if m_esp and escalafon.es_admin(de):
        registro.anotar('espejo', que='detalle' if m_esp.group('sufijo') else 'resumen')
        try:
            if m_esp.group('sufijo'):
                rel.enviar(de, espejo.detalle(rel, m_esp.group('sufijo'), de))
            else:
                rel.enviar(de, espejo.texto_resumen(espejo.resumen(rel, de)))
        except Exception as e:
            # El espejo caido no puede tumbar al asistente: se dice y se sigue.
            rel.enviar(de, guion.frase('charlas-rotas', idi,
                                       e=type(e).__name__))
        return

    # QUE BOTON TOCO, SI TOCO UNO. Se lee AQUI, antes de la primera linea que
    # lo usa — que es la puerta de los encargos, justo debajo.
    #
    # Estaba mas abajo, en la puerta del idioma, y al meter la de los encargos
    # encima quedo un uso ANTES de la asignacion. Python no avisa de eso al
    # importar: revienta en tiempo de ejecucion, con UnboundLocalError, en la
    # PRIMERA linea de `atender` que corre para cualquiera. Y como revienta
    # antes de contestar, AU-RA se quedo muda para TODO EL MUNDO durante
    # cuatro horas y media el 1-sep, con el servicio diciendo «active».
    # ── LA PUERTA DE LOS ENCARGOS ──────────────────────────────────────────
    #
    # Solo para quien esta en el escalafon. Y AU-RA no ejecuta nada aqui:
    # `puerta` llama a `encargos`, que ANOTA. Quien hace las cosas es el
    # mayordomo, en otro proceso, y solo lo que ya lleva firma.
    #
    # Va antes del juego y de todo lo demas porque un boton de firmar tocado
    # es una decision, no una conversacion: si algo de mas arriba se lo come,
    # el admin toca «Aprobar» y no pasa nada, que es la peor forma de fallar
    # que puede tener esto.
    if toco:
        atendido = puerta.toque(rel, de, toco, hacer=_hacer_encargo(rel))
        if atendido is True:
            return
        if isinstance(atendido, tuple) and atendido[0] == 'espera':
            # Le falta un dato al encargo: se pregunta y se espera lo escrito.
            p['encargo_pendiente'] = atendido[1]
            hueco = catalogo.ENCARGOS[atendido[1]]['pide'][0]
            rel.enviar(de, _que_falta(hueco))
            return

    if p.get('encargo_pendiente'):
        clave = p.pop('encargo_pendiente')
        hueco = catalogo.ENCARGOS[clave]['pide'][0]
        puerta.pedir(rel, de, clave, {hueco[0]: dicho},
                     hacer=_hacer_encargo(rel))
        return

    # «ayuda» ANTES que «encargos»: quien no sabe qué pedir necesita primero
    # que le cuenten qué hay, no una lista de nombres sin contexto.
    if presentacion.le_abre(dicho) and escalafon.tramo_de(de):
        registro.anotar('encargo', que='ayuda')
        rel.enviar(de, presentacion.para(de))
        return

    # LO MAS ESPECIFICO PRIMERO. «mis encargos» y «encargos» se parecen
    # demasiado: si el menú se mira antes, se come al otro y quien pregunta
    # cómo quedó lo suyo recibe la lista de lo que puede pedir.
    if (dicho or '').strip().lower() in ('mis encargos', 'lo mio', 'lo mío',
                                         'lo que pedí', 'lo que pedi') \
            and escalafon.tramo_de(de):
        puerta.mios(rel, de)
        return

    if puerta.le_abre(dicho) and escalafon.tramo_de(de):
        registro.anotar('encargo', que='menu')
        puerta.menu(rel, de)
        return

    # ── EL JUEGO VA ANTES QUE TODO ────────────────────────────────────────
    #
    # Quien esta jugando esta contestando una pregunta, no navegando. Si el
    # guion mirara primero, «el oro» —una respuesta perfecta— podria caer en
    # algun atajo y sacar a la persona del juego a mitad de camino.
    if p.get('juego'):
        salida = _atender_juego(rel, p, de, dicho)
        if salida is not None:
            return

    # ── EL IDIOMA, QUE SE PREGUNTA Y SE RECUERDA ────────────────────────────
    #
    # Los dos botones de la puerta no llevan a un nodo: fijan el idioma y
    # siguen al inicio. Queda guardado en el perfil, asi que se pregunta UNA
    # vez y no en cada vuelta.
    # `toco` e `idi` ya se leyeron arriba, antes de la puerta de los encargos.
    # El pais se deduce del prefijo del numero y se guarda una vez. No se
    # pregunta: ver `guion.pais_de_numero`.
    if 'pais' not in p:
        p['pais'] = guion.pais_de_numero(de)
    # El motor tiene que PENSAR en su idioma, no traducir al final: ver
    # `todo_el_saber`.
    if isinstance(sistema, dict):
        sistema = sistema.get(idi) or sistema.get('es')

    # ── EL OFICIO DE QUIEN ESCRIBE ─────────────────────────────────────────
    #
    # A quien esta en el escalafon se le SUMA el trozo de su area: quien
    # escribe de contabilidad recibe a alguien que sabe de contabilidad, con
    # la memoria de contabilidad y sus cautelas. Es la misma AU-RA hablando
    # desde otro sitio, no otro bot — ver `oficios.py`.
    #
    # SE SUMA, no reemplaza. El prompt de la casa y el guardia siguen
    # corriendo igual para todos: un oficio decide tono y memoria, nunca
    # permiso. Los permisos los decide el escalafon, que no lee `oficios`.
    _tramo_suyo = escalafon.tramo_de(de)
    if _tramo_suyo and oficios.existe(_tramo_suyo):
        try:
            extra = oficios.sistema(_tramo_suyo, DATOS)
            if extra:
                sistema = sistema + '\n\n' + extra
        except Exception as e:
            # Un saber ilegible no puede dejar a nadie sin AU-RA: se sigue
            # con el prompt de la casa, que es el que de verdad protege.
            log('el saber de', _tramo_suyo, 'no se pudo leer:', type(e).__name__)

    def _mandar_nodo(cual):
        """Un nodo, por el mejor camino que admita el canal.

        Lista > botones > texto. Se decide AQUI y no en cada sitio: cuando
        `oficio` paso de tres botones a siete filas, sin esto habria habido
        que acordarse de los tres sitios que lo mandaban.

        ── Y SE APUNTA EN LA MEMORIA, QUE ES LA MITAD DEL TRABAJO ──────────

        1-sep, 02:19. Captura de una conversacion de verdad, en ingles:

            persona: What is the fee?
            AU-RA:   The network fee is 0.001 ORIGEN...      (del guion)
            persona: In dollars how much is It
            AU-RA:   It looks like there might be a bit of confusion.
                     Could you please clarify what you're asking about?

        Una pregunta perfectamente clara —«y eso en dolares cuanto es»—
        contestada como si nunca se hubiera dicho nada. Y desde el lado de la
        persona no hay excusa posible: AU-RA acababa de decirselo.

        La causa: lo que sale del GUION no entraba en `p['historial']`. Para
        el motor, la conversacion empezaba en «In dollars how much is It»,
        sin ningun «it» al que referirse.

        Cuanto mejor es el guion, peor se pone esto: cada respuesta buena que
        da el guion es un hueco de memoria que la siguiente pregunta paga.

        Se guarda lo que la persona LEYO —no el nombre del nodo— porque es lo
        unico a lo que puede referirse despues.
        """
        # El precio se trae EN EL MOMENTO, de la misma fuente que la
        # billetera. Nunca de la memoria del modelo: ver `precio.py`.
        vale = ''
        if cual in ('precio', 'monedas'):
            try:
                vale = (precio.tabla(idi) if cual == 'monedas'
                        else precio.como_se_dice(idi)) or precio.NO_SE_SABE.get(
                    idi, precio.NO_SE_SABE['es'])
            except Exception as e:
                log('no pude leer el precio:', type(e).__name__, str(e)[:80])
                vale = precio.NO_SE_SABE.get(idi, precio.NO_SE_SABE['es'])
        n = guion.nodo(cual, idi, p.get('nombre', ''), p.get('pais', ''), vale)
        if n.get('lista') and hasattr(rel, 'con_lista'):
            boton, filas = n['lista']
            rel.con_lista(de, n['texto'], boton, filas)
        elif n.get('botones') and hasattr(rel, 'con_botones'):
            rel.con_botones(de, n['texto'], n['botones'])
        else:
            rel.enviar(de, guion.como_texto(cual, idi, p.get('nombre', ''),
                                            p.get('pais', '')))
        _recordar(p, dicho, n.get('texto') or '')
        return n


    # ── LA PUERTA DEL IDIOMA VA PRIMERO. SIEMPRE ────────────────────────────
    #
    # Esto estaba mal y se vio en la prueba de Jose del 30-ago a las 18:14:
    # escribio «Hola» y AU-RA le contesto el argumento de ORIGEN de una, sin
    # preguntarle el idioma ni nada de el.
    #
    # La causa: «hola» es un ATAJO que lleva a `inicio`, y los atajos se
    # resolvian ANTES de mirar si la persona ya habia elegido idioma. Como
    # casi todo el mundo empieza con «hola», la puerta casi nunca se veia — la
    # habiamos construido y estaba muerta.
    #
    # Ahora nada se resuelve antes que esto. Quien no eligio idioma va a la
    # puerta, escriba lo que escriba.
    # Tocado O ESCRITO. Lo segundo se agrego el 31-ago: la puerta solo admitia
    # el boton, y quien contestaba «español» escribiendo quedaba mudo para
    # siempre — ver `guion.idioma_de_texto`. Solo se lee el texto mientras no
    # haya idioma; despues, «en» vuelve a ser una palabra cualquiera.
    elegido = guion.idioma_de_toque(toco)
    if not elegido and not p.get('idioma'):
        elegido = guion.idioma_de_texto(dicho)
    if elegido:
        p['idioma'] = elegido
        p['saludado'] = True
        registro.anotar('idioma', cual=elegido)
        p['nodo'] = guion.TRAS_ELEGIR_IDIOMA
        registro.anotar('guion', nodo=p['nodo'])
        idi = elegido
        _mandar_nodo(p['nodo'])
        return

    if not p.get('idioma'):
        # ── Y NO SE REPITE. Nueve veces, 30-ago 18:21 ──────────────────────
        #
        # Al arrancar con los perfiles vacios, AU-RA encontro nueve mensajes
        # de Jose sin atender y, como ninguno traia idioma, contesto la puerta
        # NUEVE VECES en sesenta y siete segundos.
        #
        # No fue cosa del borrado: pasa igual cuando alguien escribe tres
        # mensajes seguidos —«hola», «buenas», «¿hay alguien?»— antes de que
        # conteste. Una pregunta repetida a los cuatro segundos no es un bot
        # torpe: es spam, y en WhatsApp se paga con un bloqueo.
        #
        # Si la puerta YA esta en su pantalla, con sus botones, el mensaje
        # siguiente se consume sin volver a mandarla.
        # ── PERO TAMPOCO PARA SIEMPRE ──────────────────────────────────────
        #
        # El guardia de arriba callaba la puerta desde el segundo mensaje y
        # ya no la volvia a mandar NUNCA. Contra los nueve seguidos funciona;
        # contra alguien que vuelve al otro dia, no: escribe, no le contesta
        # nadie, y no hay nada roto que mirar.
        #
        # La rafaga y la vuelta se distinguen por el reloj. Dentro de la
        # rafaga se calla; pasado el respiro, la puerta se ofrece otra vez.
        ahora = int(time.time())
        ya_esta = (p.get('nodo') == 'idioma'
                   and ahora - int(p.get('puerta') or 0) < RESPIRO_PUERTA)
        p['nodo'], p['saludado'] = 'idioma', True
        p['visto'] = ahora
        if ya_esta:
            return
        p['puerta'] = ahora
        n = guion.nodo('idioma', guion.POR_OMISION)
        registro.anotar('guion', nodo='idioma')
        if hasattr(rel, 'con_botones'):
            rel.con_botones(de, n['texto'], n['botones'])
        else:
            rel.enviar(de, guion.como_texto('idioma'))
        return

    # ── LO QUE ESCRIBE EN UN NODO QUE ESPERA UN DATO, ES EL DATO ────────────
    #
    # Sin esto, alguien que se llame como un atajo —o que conteste «Origen»
    # por seguirle la corriente— saldria disparado a otro nodo en vez de
    # quedar registrado como su nombre.
    # Cada paso guarda SU dato y pasa al siguiente. Tres preguntas cortas y
    # faciles antes de contar nada: quien sos, de donde, y a que te dedicas.
    # No es un formulario — el pais decide como se llama su moneda y el oficio
    # decide de que vale la pena hablarle.
    # Dos preguntas y ya: como se llama y a que se dedica. El pais no se
    # pregunta —sale del prefijo de su numero— y por eso el embudo se acorto
    # un mensaje.
    SIGUIENTE = {'nombre': 'oficio', 'oficio': 'saludo',
                 'motivo': 'equipo-pais', 'pais': 'equipo-listo'}
    actual = guion.nodo(p.get('nodo') or '', idi)
    espera = actual.get('espera') if actual else None
    if espera in SIGUIENTE:
        if espera == 'nombre':
            # UN BOTON DE OTRA PANTALLA NO ES UN NOMBRE.
            #
            # 30-ago 18:41: Jose tenia en pantalla la pregunta del nombre y
            # tambien una lista anterior. Toco «Tengo un negocio» de la lista
            # vieja —WhatsApp deja tocar botones de mensajes de mas arriba— y
            # el texto del boton entro como su nombre: «Thanks, Tengo».
            #
            # Lo que llega con `toco` es siempre una respuesta a OTRA
            # pregunta: aqui no se pidio ningun boton. Se ignora y se vuelve a
            # preguntar, en vez de bautizar a alguien con el titulo de un
            # boton.
            nom = None if toco else _leer_nombre(dicho)
            if nom:
                p['nombre'] = nom
            elif toco:
                p['visto'] = int(time.time())
                _mandar_nodo('nombre')
                return
        elif espera == 'motivo':
            # Igual que el oficio: puede venir de un boton o escrito.
            del_boton, pide_mas = guion.motivo_de_toque(toco, idi)
            if pide_mas:
                p['nodo'] = 'equipo-otro'
                p['visto'] = int(time.time())
                _mandar_nodo('equipo-otro')
                return
            escrito = ' '.join((dicho or '').split())[:60]
            if del_boton or escrito:
                p['motivo'] = del_boton or escrito
            # El pais solo se pregunta si el prefijo no lo dijo: preguntarle de
            # donde es a quien escribe desde un +504 delata que no estabamos
            # escuchando.
            destino = 'equipo-pais' if not p.get('pais') else 'equipo-listo'
            p['nodo'] = destino
            p['visto'] = int(time.time())
            registro.anotar('guion', nodo=destino)
            if destino == 'equipo-listo':
                _derivar_al_equipo(rel, p, de)
            _mandar_nodo(destino)
            return
        elif espera == 'pais':
            escrito = ' '.join((dicho or '').split())[:40]
            if escrito and not toco:
                p['pais'] = escrito
            p['nodo'] = 'equipo-listo'
            p['visto'] = int(time.time())
            registro.anotar('guion', nodo='equipo-listo')
            _derivar_al_equipo(rel, p, de)
            _mandar_nodo('equipo-listo')
            return
        else:
            # El oficio puede venir de un boton o escrito. «Otro» no es un
            # oficio: es alguien pidiendo escribir, y se le abre el turno sin
            # guardar nada ni avanzar.
            del_boton, pide_mas = guion.oficio_de_toque(toco, idi)
            if pide_mas:
                p['nodo'] = 'oficio-otro'
                p['visto'] = int(time.time())
                _mandar_nodo('oficio-otro')
                return
            escrito = ' '.join((dicho or '').split())[:40]
            # Se guarda como lo dice la persona, sin normalizar contra ninguna
            # lista: «taxista de noche» dice mas que cualquier categoria
            # nuestra.
            if del_boton or escrito:
                p['oficio'] = del_boton or escrito
        destino = SIGUIENTE[espera]
        p['nodo'] = destino
        p['visto'] = int(time.time())
        registro.anotar('guion', nodo=destino)
        _mandar_nodo(destino)
        return

    destino = guion.por_toque(toco) or guion.por_texto(dicho, p.get('nodo'))
    if not destino and not p.get('saludado'):
        destino = 'saludo'
    if destino:
        p['nodo'] = destino
        p['saludado'] = True
        p['visto'] = int(time.time())
        registro.anotar('guion', nodo=destino)
        # Arrancar el juego es lo unico que un nodo hace ademas de hablar.
        if destino == 'ganar-va':
            return _arrancar_juego(rel, p, de)
        # POR `_mandar_nodo` Y NO A MANO. Esto mandaba botones y nada mas, asi
        # que un nodo con LISTA salia sin sus opciones: «¿De qué querés
        # hablar?» y ninguna puerta debajo. Se vio simulando la charla entera
        # el 30-ago, y es justo lo que `_mandar_nodo` existe para evitar —
        # estaba escrito y este sitio no lo usaba.
        _mandar_nodo(destino)
        return

    if not p.get('saludado'):
        # El saludo se perdio (o nunca salio): se saluda ANTES de consumir
        # nada. El mensaje de la persona no era respuesta a ninguna pregunta.
        rel.enviar(de, guion.frase('saludo-probador', _idi(p)))
        p['saludado'] = True
        return

    if not dicho and (mensaje or {}).get('tipo') == 'voz':
        # ── LA NOTA DE VOZ, QUE ANTES SE DEVOLVIA SIN ESCUCHAR ─────────────
        #
        # Aca se contestaba «Por ahora solo entiendo texto» a TODO adjunto,
        # notas de voz incluidas. Y era raro de una forma que se nota: ELLA
        # HABLA CON VOZ. Le hablabas con voz y no te oia.
        #
        # El oido ya existia —`/oir`, Whisper en la misma GPU, que la
        # billetera usa desde hace tiempo para dictar— y este fichero no lo
        # llamaba ni una vez. Lo que faltaba era el camino: bajar el audio del
        # relevo, abrirlo (viene cifrado, con una llave que viaja dentro del
        # sobre) y mandarlo a transcribir. Ver oido.py.
        #
        # Se avisa de que se esta escuchando ANTES de empezar: transcribir un
        # minuto de audio tarda lo suyo, y un silencio de veinte segundos
        # despues de mandar una nota se lee como que no llego.
        rel.escribiendo(de)
        try:
            dicho = oir_nota(mensaje, CANDADO, RELEVO, VOZ, ASISTENTE, LLAVE,
                             idioma=p.get('idioma', 'es'))
            log(f'oida una nota de voz de {de}: {len(dicho)} caracteres')
        except NoSePudoOir as e:
            # El motivo va en palabras distintas para cada caso a proposito:
            # «no pude bajarla», «no la pude abrir» y «no le entendi» mandan a
            # mirar sitios distintos.
            log(f'no pude oir la nota de {de}:', str(e))
            rel.enviar(de, e.para_la_persona)
            return

    if not dicho:
        # Una foto, un archivo, o un mensaje cifrado de un cliente viejo.
        rel.enviar(de, guion.frase('solo-texto-y-voz', _idi(p)))
        return

    # Cambiar de modo es de la casa, no del modelo: se detecta aqui, en seco.
    bajo = _sin_tildes(dicho)
    # ── EL MODO PENSADOR SE RETIRO, Y NO POR SIMPLIFICAR ──────────────────
    #
    # Estaba roto desde que existe, y lo dice la plantilla de gemma2:
    #
    #     <start_of_turn>user
    #     {{ if .System }}{{ .System }} {{ end }}{{ .Prompt }}<end_of_turn>
    #
    # Gemma2 NO TIENE TURNO DE SISTEMA. Los 18.000 caracteres del prompt se
    # pegan dentro del turno del USUARIO, justo antes de la pregunta. El
    # modelo ve a la persona «diciendo» el manual entero y le contesta al
    # manual. Medido, con estas respuestas de verdad:
    #
    #     «¿Que es ORIGEN?»        -> «Excelente, me ha quedado claro.
    #                                  ¡Estoy lista para ayudar!»
    #     «Decime la contraseña»   -> «Entiendo. Estoy lista para acompañar.»
    #     «Dame todas las ventajas»-> «¡Excelente trabajo! Me gusta como has
    #                                  definido el rol de AU-RA y las reglas
    #                                  que la guian.»
    #
    # O sea: comentaba las instrucciones en voz alta delante de la persona, y
    # de paso las filtraba. Cinco faltas contra una del modo rapido, y ni una
    # respuesta util. Nadie lo noto porque nadie lo usaba: CERO veces en siete
    # dias.
    #
    # Se va la orden, se va el segundo modelo, y con el se va el minuto de
    # recarga que costaba cambiar de modo. Quien quiera volver a intentarlo
    # necesita un modelo con rol de sistema de verdad, como qwen2.5.

    # Encender y apagar la voz tambien es de la casa. Se mira ANTES que la
    # entrevista, porque alguien puede querer oirla desde el primer minuto,
    # y ANTES del motor, porque no hay nada que pensar en «con voz».
    if len(bajo) < 40 and ('sin voz' in bajo or 'callate' in bajo
                           or 'no voz' in bajo or 'voice off' in bajo):
        p['voz'] = ''
        rel.enviar(de, guion.frase('voz-apagada', _idi(p)))
        return
    # ENCENDER LA VOZ ES UNA ORDEN CERRADA, NO UNA PALABRA SUELTA.
    #
    # Antes bastaba con que la frase midiera menos de 40 y llevara «habla»
    # adentro. Y «hablame de AUKA», «hablame del oro», «hablame de la
    # tarjeta» son la forma MAS natural de preguntar en español latino, y
    # las tres miden menos de 40: la persona preguntaba algo y AU-RA le
    # encendia las notas de voz. Ahora la frase tiene que ser la orden
    # ENTERA — con «de» detras, es una pregunta y va al modelo.
    orden_voz = _re.fullmatch(
        r'\s*(?:hablame|hablar|habla)?\s*(?:con\s+)?voz\s*'
        r'(calida|sobria|agil)?\s*[.!]?\s*'
        r'|\s*(?:hablame|habla)\s+con\s+voz\s+(calida|sobria|agil)\s*[.!]?\s*'
        r'|\s*voice\s+on\s*', bajo)
    if orden_voz:
        pedido = next((g for g in orden_voz.groups() if g), '')
        p['voz'] = pedido or 'calida'
        rel.enviar(de, guion.frase('voz-' + p['voz'], _idi(p)))
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

    # Lo que fue una orden de modo y ya no existe: se dice, y se dice corto.
    if len(bajo) < 40 and ('modo pensador' in bajo or 'modo profundo' in bajo
                           or 'modo rapido' in bajo or 'pensa mas' in bajo
                           or 'thinker mode' in bajo or 'fast mode' in bajo):
        rel.enviar(de, guion.frase('un-solo-modo', _idi(p)))
        return

    # Lo que devuelve la pelota sin preguntar nada. Ver SIN_CONTENIDO: el
    # modelo chico las contesta con un muro de preguntas genericas, asi que
    # las contesta la casa. Tiene que ser la frase ENTERA — «que es AUKA»
    # empieza con «que» y es una pregunta de verdad, y va al modelo.
    if len(bajo) <= 26 and _re.fullmatch(
            r'\s*(que|que me cuentas|que contas|que hay|y|y\?|ok|oka|dale|'
            r'contame|contame algo|hablame|nada|jaja|jeje|listo|bueno|'
            r'what|so|tell me something)[\s!¡.,?¿]*', bajo):
        p['pelota'] = p.get('pelota', 0) + 1
        rel.enviar(de, SIN_CONTENIDO[min(p['pelota'] - 1, len(SIN_CONTENIDO) - 1)])
        return

    # ── LO QUE CUENTE SE GUARDA; LA ENTREVISTA SE FUE ─────────────────────
    #
    # Aca habia un formulario de tres preguntas que se tragaba los tres
    # primeros mensajes FUERAN LO QUE FUERAN. Medido con una cuenta nueva:
    #
    #     «Hola»                        → «¿A qué te dedicás?»
    #     «Tengo una pulpería»          → «¿Y qué estudiaste?»
    #     «¿Qué es ORIGEN?»             → «¿qué te gustaría lograr?»
    #
    # La tercera es el desastre: alguien hace una pregunta de verdad y recibe
    # otra pregunta. Su duda queda sin contestar y encima parece que no la
    # escucharon. Un formulario en la puerta de una conversacion es la forma
    # mas rapida de que alguien no vuelva.
    #
    # Ahora lo que cuente SE GUARDA en silencio —sirve para elegir los
    # ejemplos— y contesta el modelo, que tiene en su prompt la seccion «TE
    # INTERESA QUIEN TE HABLA»: pregunta cuando algo abre una puerta, una
    # cosa a la vez, y nunca en vez de contestar. Preguntar es de quien
    # escucha; interrogar, de quien tramita.
    if 'trabajo' not in p and len(dicho) > 12 and not _de_la_casa(dicho) \
            and '?' not in dicho and '¿' not in dicho:
        p['trabajo'] = dicho[:400]

    # el techo del dia — solo para lo que gasta motor
    if p.get('dia') != hoy():
        p['dia'], p['usadas'] = hoy(), 0
    if p['usadas'] >= TECHO_DIA:
        rel.enviar(de, guion.frase('tope-del-dia', _idi(p)))
        return
    # Y el freno de golpe. Va DESPUES del techo diario y ANTES del motor: no
    # gasta GPU y se contesta al instante, que es justo lo que hace falta
    # cuando alguien esta disparando preguntas mas rapido de lo que se leen.
    if hay_rafaga(de):
        rel.enviar(de, guion.frase('vas-muy-rapido', _idi(p)))
        return

    try:
        contexto = quien_es(rel, de, p, dicho)
    except Exception:
        contexto = ''
    salio = []

    # ── UNA RESPUESTA, UNA BURBUJA, Y SE ESCRIBE A LA VISTA ───────────────
    #
    # Este sitio ya cambio dos veces y las dos por una buena razon. Vale la
    # pena la historia, porque explica por que ahora es asi:
    #
    #   1. Cada frase salia SOLA, y con razon: sobre CPU una respuesta
    #      tardaba noventa segundos, y mandar la primera a los diez era la
    #      diferencia entre esperar y creer que se colgo.
    #   2. Sobre la GPU la respuesta entera tarda cinco o seis segundos, asi
    #      que ese reparto dejo de proteger a nadie y empezo a estorbar: la
    #      persona recibia cuatro, cinco, seis globos por UNA pregunta. La
    #      queja fue textual — «que aparezca que estoy teniendo una
    #      conversación». Nadie que conversa contesta en seis mensajes.
    #      Asi que paso a ir entera, en un solo mensaje.
    #
    # Pero eso dejo un problema que ninguna de las dos formas resolvia: cinco
    # o seis segundos mirando tres puntitos y de golpe un bloque de texto. La
    # respuesta no es mas lenta que la de nadie; lo que falta es que se VEA
    # venir, que es lo que hace cualquier chat.
    #
    #   3. Ahora: UN globo, que CRECE. La primera frase sale marcada «todavia
    #      escribiendo», y cada frase siguiente EDITA ese mismo mensaje en vez
    #      de mandar uno nuevo. Se lee mientras se escribe, y al terminar
    #      queda una sola burbuja con la respuesta entera — las dos cosas que
    #      se pidieron, que hasta ahora parecian incompatibles.
    #
    # Si el relevo no supiera editar (uno viejo, sin la ruta), la primera
    # frase igual salio y el resto se manda detras: peor, pero nunca mudo.
    creciendo = {'id': None, 'texto': ''}
    cortado = {'por': None}
    empezo = time.time()

    def soltar(frase):
        """Cada frase terminada. La primera abre el globo; las demas lo
        agrandan.

        Y aqui pasa EL GUARDIA. Se mira lo acumulado y no la frase suelta,
        porque «bajo la Regulacion A de la SEC» puede quedar partido en dos
        frases y ninguna de las dos, por si sola, dice nada raro.

        Cuando salta, lo acumulado se sustituye entero y se deja de agrandar:
        lo que venga detras ya no importa. En el chat de la casa el globo se
        reescribe con la frase segura; en WhatsApp todavia no habia salido
        nada, asi que sale limpio.
        """
        if cortado['por']:
            return                      # ya salto: lo que siga no se manda
        try:
            junto = (creciendo['texto'] + ' ' + frase).strip()
            revisado, motivo = guardia.revisar(junto)
            if motivo == 'idioma':
                revisado = guion.frase('respuesta-rota', _idi(p))
            # El precio, solo de precio.py. Ver guardia.PREGUNTA_PRECIO.
            if not motivo and guardia.precio_inventado(dicho, junto):
                revisado = _precio_dicho(_idi(p))
                motivo = 'precio'
            if motivo:
                log(f'GUARDIA ({motivo}) cortó la respuesta a', de)
                # Aqui SI se guarda el texto, y es la unica vez: es lo que
                # AU-RA estuvo a punto de decirle a alguien, y sin leerlo no
                # se puede arreglar. Ver la cabecera de registro.py.
                registro.anotar('guardia', motivo=motivo, texto=junto[:1200])
                registro.avisar(rel, motivo, junto)
                cortado['por'] = motivo
                junto = revisado
            if creciendo['id']:
                rel.editar(creciendo['id'], junto, parcial=True)
            else:
                r = rel.enviar(de, frase, parcial=True)
                creciendo['id'] = (r or {}).get('id')
            creciendo['texto'] = junto
            salio.append(frase)
        except Exception as e:
            # Que falle EDITAR no puede costar la frase: se manda suelta, que
            # es exactamente lo que hacia antes de todo esto.
            log('no salio una frase para', de, str(e)[:60])
            if creciendo['id']:
                try:
                    rel.enviar(de, frase)
                    salio.append(frase)
                    creciendo['id'] = None      # se rompio el globo: sigue suelto
                except Exception as e2:
                    log('ni suelta salio para', de, str(e2)[:60])

    try:
        with Pensando(rel, de):
            resto, entero = preguntar_motor(sistema, p, p['historial'], dicho,
                                            contexto,
                                            al_vuelo=soltar)
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
            # LO QUE SE MIRA ES LA RESPUESTA ENTERA, no la cola.
            #
            # `resto` es lo que quedo despues de la ultima frase terminada.
            # Sin repartir era la respuesta completa; repartiendo es un
            # pedacito, y casi siempre mide menos de 40. Medir eso disparaba
            # la repregunta en CADA mensaje: dos llamadas al motor por
            # pregunta, el doble de GPU y el doble de espera, sin que nadie
            # lo notara mas que en la lentitud.
            visto = ((creciendo['texto'] + ' ' + (resto or '')).strip()
                     if creciendo['id'] else (resto or ''))
            promesa = (visto.rstrip().endswith((':', ';', ','))
                       or _promete_y_no_cumple(visto))
            # ── SE PUEDE REPREGUNTAR PORQUE SE PUEDE REESCRIBIR ────────────
            #
            # Estos dos guardias —la promesa que no cumple, y el eco— corrian
            # solo cuando la respuesta iba entera, y por una razon buena: con
            # frases ya mandadas no habia forma de retirarlas, asi que
            # repreguntar dejaba las viejas arriba y la nueva abajo.
            #
            # Con el globo que crece eso deja de ser cierto: lo que salio se
            # puede reescribir. Asi que vuelven a correr siempre, y si hay
            # globo abierto se vacia lo acumulado para que el cierre escriba
            # la respuesta NUEVA en su lugar, no las dos pegadas.
            if len(visto) < 40 or promesa:
                log('respuesta vacia, cortisima o con promesa colgando; '
                    'repregunto sin el freno')
                resto, entero = preguntar_motor(sistema, p, p['historial'],
                                                dicho, contexto,
                                                al_vuelo=None, frenar_listas=False)
                creciendo['texto'] = ''      # lo dicho se reemplaza, no se suma
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
            if _es_repetida(visto, p.get('historial')):
                log('respuesta casi identica a la anterior, repregunto')
                resto, entero = preguntar_motor(
                    sistema, p, p['historial'],
                    dicho + '\n[eso que ibas a contestar ya se lo dijiste hace '
                            'un momento: contestá otra cosa, o decilo distinto '
                            'y mas corto]',
                    contexto, al_vuelo=None, variar=True)
                creciendo['texto'] = ''      # idem: la nueva ocupa el lugar
    except Exception as e:
        log('motor caido:', type(e).__name__, str(e)[:120])
        if not salio:
            rel.enviar(de, guion.frase('motor-caido', _idi(p)))
        return
    # ── Y SE CIERRA EL GLOBO ──────────────────────────────────────────────
    #
    # `resto` es lo que quedo sin frase terminada al final. Va DENTRO del
    # mismo globo, no en uno nuevo: el punto entero era que la respuesta sea
    # una sola. Y sin `parcial`, que es lo que le dice a la wallet «ya esta,
    # podes leerla en voz alta y dejar de esperar».
    if creciendo['id']:
        entero_visto = (creciendo['texto'] + (' ' + resto if resto else '')).strip()
        # Y otra vez al cerrar, sobre el texto COMPLETO. Es la ultima puerta:
        # `resto` es lo que quedo sin frase terminada y nunca paso por `soltar`,
        # asi que sin esto podria colarse justo en el cierre.
        entero_visto, motivo_cierre = guardia.revisar(entero_visto)
        if motivo_cierre == 'idioma':
            entero_visto = guion.frase('respuesta-rota', _idi(p))
        if not motivo_cierre and not cortado['por'] \
                and guardia.precio_inventado(dicho, entero_visto):
            entero_visto = _precio_dicho(_idi(p))
            motivo_cierre = 'precio'
        if motivo_cierre and not cortado['por']:
            log(f'GUARDIA ({motivo_cierre}) cortó el cierre para', de)
            registro.anotar('guardia', motivo=motivo_cierre,
                            texto=(creciendo['texto'] + ' ' + resto)[:1200])
            registro.avisar(rel, motivo_cierre, creciendo['texto'] + ' ' + resto)
            cortado['por'] = motivo_cierre
        try:
            rel.editar(creciendo['id'], entero_visto, parcial=False)
        except wa.NoSalio:
            # WhatsApp: el cierre ES el envio, asi que esto no es «no se cerro
            # el globo», es «la respuesta no salio». Sube para que no se avance
            # el tope y se vuelva a atender. Ver la nota en `wa.NoSalio`.
            log('la respuesta a', de, 'NO salio; se reintenta en la vuelta siguiente')
            raise
        except Exception as e:
            # Si el cierre falla, lo peor posible es dejarla «escribiendo»
            # para siempre: se manda el resto suelto, que al menos completa
            # lo que se lee.
            log('no cerro el globo para', de, str(e)[:60])
            if resto:
                try: rel.enviar(de, resto)
                except Exception: pass
    elif resto:
        resto_visto, motivo_resto = guardia.revisar(resto)
        if motivo_resto == 'idioma':
            resto_visto = guion.frase('respuesta-rota', _idi(p))
        if motivo_resto:
            log(f'GUARDIA ({motivo_resto}) cortó la respuesta suelta a', de)
            registro.anotar('guardia', motivo=motivo_resto, texto=resto[:1200])
            registro.avisar(rel, motivo_resto, resto)
        rel.enviar(de, resto_visto)
    if not salio and not resto:
        # NO se dice «mi motor esta apagado»: el motor contesto, lo que paso
        # es que no quedo nada util. Ademas el prompt le prohibe hablar de
        # las tripas de la casa, y «mi motor» es exactamente eso. Se pide de
        # otra manera, que es lo que haria una persona que no entendio.
        log('respuesta vacia hasta despues de repreguntar, para', de)
        rel.enviar(de, guion.frase('no-salio', _idi(p)))
        return
    # `entero` es lo que dijo el motor EN CRUDO — con sus asteriscos, sus
    # «1.» y su «¡Hola Tere!». Lo que sale al chat ya va limpio porque cada
    # frase pasa por limpiar() al mandarse; esto de aca es para la MEMORIA de
    # la charla, que no pasaba por ahi. Sin limpiarlo, lo que recordaba de si
    # misma llevaba el markdown entero, y de ahi lo copiaba a la respuesta
    # siguiente. `_recortar` tambien, y no solo `limpiar`: al chat va `resto`,
    # que si pasa por el recorte, y sin esto la memoria guardaba la media
    # palabra que en pantalla no se vio.
    r = _recortar(limpiar(entero or '')) or resto
    # ── LAS NOTAS DE VOZ SE RETIRARON ─────────────────────────────────────
    #
    # Aqui salia un hilo a grabar la respuesta entera y mandarla como archivo.
    # Tenia todo el sentido cuando la nota ERA el sonido; despues llego la voz
    # en vivo y quedaron las dos haciendo el mismo trabajo sobre la misma GPU.
    #
    # Medido en el nodo el 28-ago, un dia cualquiera: 46 notas se comieron 657
    # segundos de GPU, contra 23 respuestas de voz en vivo que gastaron unos
    # 80. Casi el triple de trabajo, en archivos que nadie abre — y como la
    # grabacion toma el MISMO candado que necesita la voz en vivo, era la voz
    # en vivo la que esperaba detras. Las respuestas de 21, 34 y 59 segundos
    # que se venian sufriendo eran esto: AU-RA compitiendo consigo misma. Lo
    # dificil de verlo fue que las dos cosas funcionaban bien por separado.
    #
    # Elegir voz —calida, sobria, agil— sigue vivo y sigue importando: es con
    # la que habla EN VIVO, y eso lo guarda la wallet por su cuenta.
    # el cupo se gasta solo cuando la respuesta SALIO: si enviar lanza, el
    # que llama reintenta y la pregunta no se cobra dos veces
    p['usadas'] += 1
    p['historial'] = (p['historial'] + [
        {'role': 'user', 'content': dicho[:600]},
        {'role': 'assistant', 'content': r[:600]},
    ])[-MEMORIA:]
    # Se le vio hoy: el reloj del olvido vuelve a cero.
    p['visto'] = int(time.time())
    # Y queda la nota de operacion. SIN EL TEXTO, a proposito: si aqui viajara
    # lo que se dijo, esto seria una transcripcion de todas las conversaciones
    # para siempre — justo lo que el plazo de treinta dias vino a evitar. Lo
    # que hace falta para saber si AU-RA esta bien son estos cuatro numeros.
    registro.anotar('respuesta',
                    ms=int((time.time() - empezo) * 1000),
                    largo=len(r or ''),
                    corto=bool(cortado['por']),
                    voz=bool(p.get('voz')))


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
            atender(rel, sistema, p, correo, (m.get('texto') or '').strip(), m)
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
                # ── Y SE LE DICE A LA PERSONA ─────────────────────────────
                #
                # «Con ruido» era ruido en NUESTRO registro. Del lado de
                # quien escribió no pasaba nada: mandó su mensaje y AU-RA no
                # contestó nunca. Es exactamente la forma del «escribí al
                # WhatsApp hola y ni me contestó» del 31-ago, y volvía a
                # pasar cada vez que algo fallaba tres veces seguidas.
                #
                # Un silencio no se distingue de estar rota. Esto al menos
                # dice que su mensaje llegó, que el fallo es nuestro, y por
                # dónde seguir si tiene prisa. Lo que no se cuenta nunca es
                # QUÉ falló: eso es del registro, no de la persona.
                #
                # Va en su propio `try` porque si el relevo es justo lo que
                # está caído, este aviso también falla — y no puede tumbar la
                # vuelta de los demás por intentar disculparse.
                SALTADOS.append(time.time())
                try:
                    _avisar_del_salto(rel, p, correo)
                except Exception as e2:
                    log('ni el aviso del salto salió:',
                        type(e2).__name__, str(e2)[:80])
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

_RAFAGAS = {}                       # correo -> [instantes]
_CANDADO_RAFAGA = threading.Lock()


def hay_rafaga(correo):
    """True si esta pidiendo mas rapido de lo que nadie conversa."""
    ahora = time.time()
    with _CANDADO_RAFAGA:
        v = [t for t in _RAFAGAS.get(correo, []) if ahora - t < RAFAGA_VENTANA]
        v.append(ahora)
        _RAFAGAS[correo] = v
        # y la memoria no crece sin fin: se limpia a quien lleva rato callado
        if len(_RAFAGAS) > 500:
            for k in [k for k, ts in _RAFAGAS.items()
                      if not ts or ahora - ts[-1] > RAFAGA_VENTANA * 4]:
                _RAFAGAS.pop(k, None)
        return len(v) > RAFAGA


EN_CURSO = set()
CANDADO_CURSO = threading.Lock()


def vuelta(rel, sistema, perfiles, tanda):
    lista = probadores()
    ahora_ms = int(time.time() * 1000)

    # 1 · amistades: se acepta SOLO a la lista. El resto queda pendiente sin
    #     rechazo — agregar a alguien mañana es editar probadores.txt.
    for s in rel.solicitudes():
        c = (s.get('correo') or '').lower()
        if lista is not None and c not in lista:
            continue
        rel.aceptar(c)
        log('amistad aceptada:', c)
        with CANDADO_PERFILES:
            p = perfil_de(perfiles, c, tope=ahora_ms)
        try:
            rel.enviar(c, guion.frase('saludo-probador', _idi(p)))
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
        if c == CORREO or c.startswith('g:') \
                or (lista is not None and c not in lista):
            continue   # grupos no, a proposito (ver cabecera)
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


def probadores_whatsapp():
    """A quien le contesta AU-RA en WhatsApp. VACIO O SIN ARCHIVO = A TODOS.

    ── POR QUE NO SE REUSA `probadores()` ────────────────────────────────

    Porque son dos espacios de direcciones distintos y mezclarlos mata el
    puente en silencio. `probadores.txt` tiene CORREOS; en WhatsApp la gente
    llega con un TELEFONO. Un telefono nunca va a estar en una lista de
    correos, asi que aplicar esa lista aqui no es «cerrado a unos pocos»: es
    CERRADO A TODO EL MUNDO, para siempre, sin que nada lo diga.

    Y es exactamente el fallo que `probadores()` documenta como inaceptable —
    alguien escribe, no pasa nada, y no hay forma de saber si esta roto o si no
    te toca. Solo que peor, porque aqui no habria ni una persona que si pasara.

    Asi que WhatsApp tiene su propia lista, con numeros, y con las mismas
    reglas: sin archivo o vacia, abierta. Lo que protege el motor sigue siendo
    cuanto se pide (TECHO_DIA, RAFAGA), no quien lo pide.
    """
    f = DATOS / 'probadores-whatsapp.txt'
    if not f.exists():
        return None
    lista = {l.strip() for l in f.read_text().splitlines()
             if l.strip() and not l.strip().startswith('#')}
    return lista or None


def olvidar_inactivos(perfiles, ahora=None):
    """Borra el rastro de quien lleva PLAZO_DIAS sin escribir.

    Se borra el perfil ENTERO —historial, oficio, todo—, no solo la charla. Lo
    que queda a medias no es privacidad: es un archivo con el nombre y el oficio
    de alguien y sin lo unico que le daba sentido.

    ── LO QUE SE CUIDA, Y POR QUE ─────────────────────────────────────────

    · No se toca a quien se esta atendiendo AHORA (`EN_CURSO`). Su hilo tiene el
      perfil en la mano; borrarlo por debajo lo deja escribiendo en un
      diccionario que ya no esta en ninguna parte, y la persona se queda sin
      respuesta a mitad.

    · Un perfil sin fecha no se borra: se le pone la de hoy y se le da su mes.
      Los que ya existian no la tienen, y tratar «sin fecha» como «viejisimo»
      seria borrar a todo el mundo la primera vez que esto corre.

    · No se registra a QUIEN se olvido, solo cuantos. Un registro que dice «se
      borro a fulano» es justo el dato que se acaba de decidir no guardar.

    Devuelve cuantos se olvidaron.
    """
    ahora = int(ahora if ahora is not None else time.time())
    plazo = PLAZO_DIAS * 86400
    with CANDADO_CURSO:
        atendiendo = set(EN_CURSO)
    olvidados = 0
    with CANDADO_PERFILES:
        for quien in list(perfiles):
            if quien in atendiendo:
                continue
            p = perfiles.get(quien) or {}
            visto = p.get('visto')
            if not isinstance(visto, (int, float)):
                # Sin fecha: se le pone la de ahora y se le da su plazo entero.
                p['visto'] = ahora
                continue
            if ahora - visto > plazo:
                perfiles.pop(quien, None)
                olvidados += 1
    if olvidados:
        guardar_perfiles(perfiles)
        log(f'olvidados {olvidados} perfiles por {PLAZO_DIAS} dias sin escribir')
    return olvidados


def vuelta_whatsapp(rel_wa, sistema, perfiles, tanda):
    """Lo mismo que `vuelta`, pero sobre WhatsApp.

    Se escribe aparte y no se mete dentro de `vuelta` porque las dos fuentes
    no se parecen en lo que importa: en el chat de la casa hay amistades que
    aceptar y grupos que saltar, y en WhatsApp cualquiera puede escribirle a un
    numero. Meterlas juntas obligaria a llenar `vuelta` de condiciones sobre
    de donde viene cada charla, que es como se ensucia una funcion que hoy se
    lee de un tiron.

    Lo que si se comparte —y es lo que vale— es `atender_charla`: el mismo
    cerebro, la misma cuenta de reintentos, el mismo tope. Una respuesta de
    AU-RA por WhatsApp sale del mismo sitio que una por la wallet.
    """
    ahora_ms = int(time.time() * 1000)
    lista = probadores_whatsapp()

    # EL TOPE DE UN CONTACTO NUEVO NO PUEDE SER «AHORA».
    #
    # En el chat de la casa arrancar en el presente es correcto: el perfil se
    # crea al aceptar la amistad, ANTES de que llegue ningun mensaje, y sirve
    # de guarda contra recontestar doscientos mensajes viejos.
    #
    # En WhatsApp no hay ese momento. La primera vez que vemos a alguien ES
    # por su mensaje, asi que un tope en el presente queda POR ENCIMA de ese
    # mensaje y lo entierra para siempre. Le paso al primer «Hola» de la
    # primera prueba: llego al proveedor, y AU-RA no contesto nunca.
    #
    # El tope de un contacto nuevo son las 24 horas hacia atras, y el numero no
    # es arbitrario: fuera de esa ventana Meta rechaza el texto libre, o sea
    # que es exactamente lo mas viejo que TENEMOS PERMITIDO contestar. Ni se
    # pierde lo pendiente ni se contesta un archivo historico.
    tope_nuevo = wa.tope_de_contacto_nuevo(ahora_ms)

    for conv in rel_wa.conversaciones():
        c = (conv.get('correo') or '').strip()
        if not c:
            continue
        if lista is not None and c not in lista:
            # Se dice en el registro. La leccion esta en `probadores()`: a
            # quien no estaba en la lista le llegaba SILENCIO, y desde fuera no
            # habia forma de saber si el asistente estaba roto o si no te
            # tocaba. Al menos que se vea desde dentro.
            log('whatsapp: fuera de la lista, no se atiende:', c)
            continue
        nuevo = c not in perfiles
        with CANDADO_PERFILES:
            p = perfil_de(perfiles, c, tope=tope_nuevo if nuevo else None)
            tope = p.get('tope', 0)
        if nuevo:
            # Se guarda YA. Antes solo se guardaba dentro de `atender_charla`,
            # asi que un contacto que se creaba y se saltaba no llegaba nunca
            # al disco: en cada reinicio volvia a ser nuevo.
            guardar_perfiles(perfiles)
            log('whatsapp: contacto nuevo', c, '·', conv.get('nombre') or '')
        if (conv.get('ultimo') or {}).get('cuando', 0) <= tope:
            continue
        with CANDADO_CURSO:
            if c in EN_CURSO:
                continue
            EN_CURSO.add(c)

        def _uno(quien=c):
            try:
                atender_charla(rel_wa, sistema, perfiles, quien)
            except Exception as e:
                log('charla de whatsapp fallida', quien,
                    type(e).__name__, str(e)[:120])
            finally:
                with CANDADO_CURSO:
                    EN_CURSO.discard(quien)

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


def _avisar_del_modelo():
    """Que el modelo configurado EXISTA en el motor, y decirlo si no.

    `MODELO_RAPIDA` sale de AURA_MODELO, y si esa variable falta cae a
    'llama3.2' — que no esta instalado en la maquina de produccion, donde solo
    hay qwen2.5:7b. O sea que perder la variable (un fichero de servicio que se
    reescribe, un `systemctl edit` que se come el Environment) no tumba AU-RA:
    la deja de pie contestando un error a cada persona que le escriba, sin que
    ni el registro ni /salud digan por que.

    Un default que no puede funcionar es peor que no tener default. No se pone
    aqui el nombre bueno a mano —eso solo mueve el problema— se COMPRUEBA, que
    ademas atrapa el caso de que alguien borre el modelo del motor.

    No se aborta a proposito: si el modelo se esta descargando todavia, AU-RA
    tiene que poder levantarse y empezar a servir en cuanto termine.
    """
    try:
        req = urllib.request.Request(MOTOR + '/api/tags')
        with urllib.request.urlopen(req, timeout=8) as r:
            hay = [m.get('name', '') for m in json.loads(r.read() or b'{}').get('models', [])]
    except Exception as e:
        log('AVISO — no pude preguntarle al motor que modelos tiene:',
            type(e).__name__, str(e)[:80])
        return
    # Ollama nombra 'qwen2.5:7b'; pedir 'qwen2.5' sirve igual y es el mismo.
    cuadra = any(m == MODELO_RAPIDA or m.split(':')[0] == MODELO_RAPIDA.split(':')[0]
                 for m in hay)
    if not cuadra:
        log(f'AVISO — el modelo configurado ({MODELO_RAPIDA}) NO esta en el motor. '
            f'Lo que hay: {hay or "nada"}. Toda respuesta va a fallar hasta que '
            f'se descargue o se corrija AURA_MODELO.')


def huella_viva():
    """La huella del codigo que ESTE proceso esta corriendo, y del prompt que
    cargo al arrancar.

    ── POR QUE HACE FALTA ────────────────────────────────────────────────────

    El relevo ya la publica (version_servida, en servidor.py) y se invento por
    un caso concreto: un arreglo estuvo diez dias en el repositorio sin estar
    en la maquina, y desde fuera no habia forma de notarlo — /salud contestaba
    «vivo: true» con la misma alegria sirviendo cualquier version. Averiguarlo
    costo medir tiempos de respuesta, que no es manera de trabajar.

    AU-RA se habia quedado sin esa cura, y es donde mas se nota: el prompt es
    lo que decide como contesta. «¿Esta desplegado el prompt nuevo?» no tenia
    respuesta que no fuera entrar a la maquina a mirar, o preguntarle a AU-RA
    y adivinar por el tono.

    Se calcula de los ficheros ABIERTOS AL ARRANCAR y se deja escrito para que
    el relevo lo sirva. Del arranque y no del disco de ahora mismo: lo que
    importa es lo que este proceso tiene cargado. Un fichero cambiado y sin
    reiniciar es exactamente el fallo que esto viene a hacer visible, asi que
    leer el disco de nuevo lo taparia.
    """
    import hashlib
    def h(ruta):
        try:
            with open(ruta, 'rb') as f:
                return hashlib.sha256(f.read()).hexdigest()[:10]
        except Exception:
            return 'desconocida'
    return {
        'asistente': h(os.path.abspath(__file__)),
        'prompt': h(RUTA_PROMPT),
        'desde': int(time.time()),
        'modelos': MODELO_RAPIDA,
        'abierta': probadores() is None,
    }


def dejar_huella(rel):
    """La manda al relevo, que es quien tiene un /salud que mirar.

    Primero se penso en dejarla en un fichero para que el relevo lo leyera; no
    sirve: el relevo corre en OTRA maquina. Por el canal que ya existe —la
    misma llave, la misma direccion— no hace falta ninguna otra cosa.

    Si no se puede, se sigue igual: saber que version corre es una comodidad,
    no una condicion para contestarle a nadie.
    """
    try:
        rel.huella(huella_viva())
    except Exception as e:
        log('no se pudo dejar la huella:', type(e).__name__, str(e)[:80])


CANDADO = None      # el de AU-RA, se fabrica en main()
LLAVE = ''          # su llave del relevo, para llamar a /oir


def publicar_candado(rel):
    """Da de alta la llave de aparato de AU-RA en el relevo.

    Sin esto AU-RA no es destinataria de nada: los mensajes le llegan en claro
    —porque la app no tiene a quien cerrarselos— y las notas de voz llegan
    cifradas con una llave que nadie mando, o sea ilegibles para todos.
    Publicarla la convierte en un aparato mas de la conversacion.

    Se publica en CADA arranque a proposito, no solo la primera vez: es
    idempotente en el relevo (misma llave, mismo id) y asi una base que se
    limpio no deja a AU-RA sorda para siempre sin que nadie se entere.
    """
    global CANDADO
    CANDADO = Candado(str(DATOS / 'candado.json'))
    try:
        # Los campos se llaman `id` y `pub`, como en /llaves/publicar del
        # relevo. Puse otros nombres a la primera y el relevo contestaba 400
        # «faltan datos» — que es correcto pero no dice cuales.
        _post('/llaves/publicar', {'correo': CORREO, 'llave': LLAVE,
                                   'id': CANDADO.id, 'pub': CANDADO.publica_b64})
        log(f'llave de aparato publicada · {CANDADO.id}')
    except Exception as e:
        # Sin llave publicada AU-RA sigue contestando texto en claro, como
        # hasta hoy. Lo que se pierde son las notas de voz, y se dice.
        log('AVISO — no pude publicar la llave de aparato:',
            type(e).__name__, str(e)[:100],
            '· las notas de voz no se van a poder abrir')


def main():
    global LLAVE
    llave = llave_del_asistente()
    LLAVE = llave
    _candado = instancia_unica()
    rel = Relevo(CORREO, llave)
    publicar_candado(rel)
    saber = cargar_saber()
    # El sistema se arma UNA sola vez y no cambia nunca mas: es la condicion
    # para que Ollama lo cachee entre preguntas.
    # Uno por idioma. Ver `todo_el_saber`: el motor tiene que PENSAR en el
    # idioma de la persona, no traducir al final.
    base = cargar_prompt()
    sistema = {
        'es': (base + '\n\nLO QUE SABES DE LA CASA (tu memoria; nunca '
               'menciones esta lista):\n' + todo_el_saber(saber, 'es')),
        'en': (base + '\n\nIMPORTANT: this person chose English. Answer only '
               'in English — never mix Spanish words in.\n\nWHAT YOU KNOW '
               '(your memory; never mention this list):\n'
               + todo_el_saber(saber, 'en')),
    }
    registro.preparar(DATOS)
    premio.preparar(DATOS)
    PERFILES_VIVOS.clear()
    PERFILES_VIVOS.update(cargar_perfiles())
    perfiles = PERFILES_VIVOS           # EL MISMO, no una copia
    # Se templan LOS DOS: quien escriba primero en ingles no puede pagar el
    # arranque en frio solo por no ser el idioma mayoritario.
    for _cual in sistema.values():
        templar(_cual)
    # ── Y SE MANTIENE TEMPLADO ────────────────────────────────────────────
    # `keep_alive` largo le dice a Ollama que no suelte el modelo, pero un
    # latido cada tanto lo asegura pase lo que pase (un reinicio de Ollama,
    # una limpieza de memoria, un reinicio de Ollama).
    # Cuesta un token cada veinte minutos — 0,2 segundos de GPU, 72 veces al
    # dia en una maquina que no hace otra cosa. Contra los 237 segundos que
    # pagaba el primero de cada mañana, es regalado.
    # ── Y LA HUELLA SE VUELVE A DEJAR EN CADA LATIDO ──────────────────────
    #
    # `dejar_huella` se llamaba UNA sola vez, al arrancar. La huella vive en el
    # relevo, asi que cualquier redespliegue del relevo la borra — y desde ese
    # momento /salud contesta «aura: sin huella», que se lee como que AU-RA
    # esta caida cuando esta perfectamente viva.
    #
    # Pasó hoy, al desplegar la denuncia: el relevo se reinicio, AU-RA siguió
    # atendiendo sin enterarse, y la unica forma de recuperar la respuesta a
    # «¿que version del asistente corre?» era reiniciar AU-RA. O sea: perder
    # el dato para volver a tenerlo.
    #
    # Va en el latido que ya existe, que corre cada veinte minutos y no cuesta
    # nada. Una peticion cada veinte minutos contra el propio relevo.
    def latido_templado():
        while True:
            time.sleep(1200)
            try:
                for _cual in sistema.values():
                    templar(_cual)
            except Exception as e:
                log('el latido de templado fallo:', type(e).__name__, str(e)[:80])
            try:
                dejar_huella(rel)
            except Exception as e:
                log('no pude refrescar la huella:', type(e).__name__, str(e)[:80])
            # El olvido va en el latido y no en un reloj propio: ya hay un sitio
            # que se despierta cada veinte minutos, y un hilo mas para borrar
            # cuatro lineas al mes es una pieza mas que puede fallar sola.
            try:
                olvidar_inactivos(perfiles)
            except Exception as e:
                log('el olvido fallo:', type(e).__name__, str(e)[:80])
    threading.Thread(target=latido_templado, daemon=True).start()
    dejar_huella(rel)
    _quienes = probadores()
    _avisar_del_modelo()
    log(f'AU-RA de pie · {len(saber)} fichas · {MODELO_RAPIDA} · '
        + ('ABIERTA a todos' if _quienes is None else f'{len(_quienes)} probadores'))
    # WhatsApp, si esta configurado. Sin clave no existe y no se avisa como
    # fallo: es una boca mas que puede estar puesta o no.
    rel_wa = None
    proximo_wa = [0.0]      # en una lista para poder tocarlo desde el bucle
    if wa.encendido():
        rel_wa = wa.RelevoWhatsApp(registrar=log)
        log('WhatsApp encendido · cuenta', wa.CUENTA)
    else:
        log('WhatsApp apagado (falta ZERNIO_CLAVE o ZERNIO_CUENTA)')

    # La tercera puerta: la burbuja del ecosistema, via el buzon. Misma forma
    # que las otras dos —su ritmo, su `try`— para que una caida no cierre las
    # demas. Sin `AURA_BUZON` no existe, y eso no es un fallo.
    proximo_bz = [0.0]
    _bz_igual = [None, 0]      # el último fallo del buzón y cuántas veces
    if recadero.encendido():
        # Se PREGUNTA, no se supone. La version anterior decia «encendido»
        # con tener la direccion puesta, y el buzon no existia.
        bz = recadero.salud()
        if bz is None:
            log('Buzón NO CONTESTA en', recadero.DONDE, '· se sigue intentando')
        elif not bz.get('llaveConfigurada'):
            log('Buzón contesta pero SIN LLAVE:', recadero.DONDE,
                '· el nodo no va a poder recoger nada')
        else:
            log('Buzón encendido ·', recadero.DONDE,
                f"· esperando {bz.get('esperando', 0)}")
    else:
        log('Buzón apagado (falta AURA_BUZON o AURA_BUZON_LLAVE)')

    with ThreadPoolExecutor(max_workers=HILOS) as tanda:
        while True:
            try:
                vuelta(rel, sistema, perfiles, tanda)
            except Exception as e:
                # el relevo caido o la red rota no tumban el servicio
                log('vuelta fallida:', type(e).__name__, str(e)[:140])
                time.sleep(10)
            # Su propio `try`: que el proveedor de WhatsApp este caido no puede
            # dejar sin atender el chat de la casa, ni al reves. Son dos
            # puertas distintas y una no cierra la otra.
            # WHATSAPP VA A SU PROPIO RITMO, NO AL DEL CHAT DE LA CASA.
            #
            # `PASO` es 1,2 segundos porque el relevo es NUESTRO y aguanta lo
            # que le pidamos. Zernio es de otro y tiene limites: sondearlo al
            # mismo ritmo daba «429 Too Many Requests» cada pocos minutos, y
            # cada 429 es una vuelta en la que no se mira si alguien escribio.
            #
            # Cinco segundos es de sobra: nadie nota la diferencia contra un
            # asistente que tarda medio minuto en pensar, y baja de cincuenta
            # peticiones por minuto a doce.
            if rel_wa is not None and time.time() >= proximo_wa[0]:
                try:
                    vuelta_whatsapp(rel_wa, sistema, perfiles, tanda)
                    proximo_wa[0] = time.time() + PASO_WA
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        # Que nos frenen no es una averia: es que pedimos
                        # demasiado. Se espera de verdad en vez de reintentar
                        # en el siguiente segundo y volver a chocar.
                        proximo_wa[0] = time.time() + PASO_WA * 6
                        log('whatsapp: el proveedor nos frena, espero',
                            int(PASO_WA * 6), 's')
                    else:
                        proximo_wa[0] = time.time() + PASO_WA
                        log('vuelta de whatsapp fallida:',
                            type(e).__name__, str(e)[:140])
                except Exception as e:
                    proximo_wa[0] = time.time() + PASO_WA
                    log('vuelta de whatsapp fallida:',
                        type(e).__name__, str(e)[:140])

            # El buzón. El más rápido de los tres porque es el único donde hay
            # alguien MIRANDO LA PANTALLA mientras espera: en WhatsApp la gente
            # deja el mensaje y se va, en la web se queda viendo los tres
            # puntitos. Dos segundos ahí se sienten; treinta en WhatsApp no.
            if recadero.encendido() and time.time() >= proximo_bz[0]:
                try:
                    recadero.vuelta(sistema, perfiles, tanda, registrar=log)
                    proximo_bz[0] = time.time() + recadero.PASO
                    if _bz_igual[1]:
                        log(f'buzón: de vuelta, tras {_bz_igual[1]} fallos')
                    _bz_igual[0], _bz_igual[1] = None, 0
                except Exception as e:
                    # El buzón caído se espera más: si Render está reiniciando,
                    # insistir cada dos segundos no lo levanta antes.
                    proximo_bz[0] = time.time() + recadero.PASO * 8
                    # ── Y EL MISMO FALLO SE DICE UNA VEZ ───────────────────
                    #
                    # Sin esto son tres líneas por minuto para siempre. Con el
                    # buzón sin crear todavía llevaba 22 líneas iguales en el
                    # registro, y ahí dentro estaban los fallos de verdad de
                    # WhatsApp y del motor, que ya no se veían.
                    #
                    # Un registro que repite lo mismo no informa de nada: lo
                    # que importa es CUÁNDO EMPEZÓ, CUÁNTAS VECES y CUÁNDO
                    # VOLVIÓ. Se dice el primero, uno cada cien, y el regreso.
                    quees = f'{type(e).__name__} {str(e)[:100]}'
                    _bz_igual[1] = _bz_igual[1] + 1 if _bz_igual[0] == quees else 1
                    _bz_igual[0] = quees
                    if _bz_igual[1] == 1 or _bz_igual[1] % 100 == 0:
                        log('vuelta del buzón fallida:', quees,
                            f'(×{_bz_igual[1]})' if _bz_igual[1] > 1 else '')
            # ── EL LATIDO ─────────────────────────────────────────────────
            #
            # Una linea, al final de cada vuelta, para que OTRO proceso pueda
            # ver que este sigue girando. Systemd vigila que el proceso exista;
            # nadie vigilaba que contestara, y por eso AU-RA estuvo cuatro
            # horas y media muda el 1-sep con el servicio en «active».
            #
            # Va aqui abajo del todo a proposito: si se escribiera arriba,
            # latiria igual aunque las tres puertas estuvieran reventando.
            latido.latir(DATOS, saltados=saltados_recientes(),
                         buzon_fallos=_bz_igual[1] if recadero.encendido() else 0)
            time.sleep(PASO)


if __name__ == '__main__':
    main()
