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
  AURA_PASO      segundos entre vueltas (4)

En el primer arranque, si no hay llave.txt, se da de alta solo en el relevo y
guarda la llave con permisos 600. La llave NUNCA va al repositorio.
"""
import fcntl
import json
import os
import pathlib
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
# La cadena, para leer el saldo PUBLICO de la persona (es dato de cadena, no
# un secreto: cualquiera con la direccion lo ve en el explorador).
RPC = os.environ.get('AURA_RPC', 'https://ordenglobal-rpc.com')
PASO = float(os.environ.get('AURA_PASO', '4'))

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


def quien_es(rel, correo, perfil):
    """La linea de contexto de la persona: nombre, gid, saldo. Con cache de
    cinco minutos — el saldo no cambia tan rapido como para pagar un RPC por
    pregunta, y si cambia, cinco minutos de desfase no enganan a nadie."""
    ahora = time.time()
    en_cache = _SALDOS.get(correo)
    if en_cache and ahora - en_cache[0] < 300:
        return en_cache[1]
    f = rel.ficha(correo)
    partes = []
    nombre = (f.get('nombre') or '').strip()
    if nombre:
        partes.append(f"se llama {nombre.split()[0]}")
    if (f.get('gid') or '').strip():
        partes.append(f"su Genesis ID declarado es {f['gid'].strip()[:40]}")
    addr = (f.get('addr') or '').strip()
    if addr.startswith('0x') and len(addr) == 42:
        try:
            b = origen_de(addr)
            partes.append(f"su billetera tiene {b:,.4f} ORIGEN en la cadena")
        except Exception:
            pass   # sin dato no hay linea; inventar esta prohibido
    linea = ('; '.join(partes)) if partes else ''
    _SALDOS[correo] = (ahora, linea)
    return linea


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

CAMBIO_PENSADORA = (
    "Listo — modo pensador. Voy a tardar más por respuesta, pero razono con "
    "más fondo. Para volver, decime «modo rápido».")
CAMBIO_RAPIDA = (
    "Listo — modo rápido. Contesto al vuelo; si querés más fondo, decime "
    "«modo pensador».")

MOTOR_CAIDO = (
    "Ahora mismo no puedo pensar: mi motor está apagado. Ya avisé a la casa — "
    "probá de nuevo en un rato.")

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


import re as _re

FUGAS = _re.compile(
    r"(^\s*(seg[uú]n|de acuerdo (a|con)|conforme a)\s+(las?\s+)?fichas?,?\s*)"
    r"|(\b(seg[uú]n|en|de)\s+(las?\s+)?fichas?,?\s*)",
    _re.IGNORECASE)


def limpiar(texto):
    """El modelo chico a veces dice «según las fichas...» aunque el prompt se
    lo prohiba — paso en produccion dos veces. A un modelo de 3B no se le
    confia una regla de estilo: se limpia aqui, determinista, a la salida."""
    t = FUGAS.sub('', texto).strip()
    return (t[0].upper() + t[1:]) if t else texto


def preguntar_motor(sistema, perfil, historial, dicho, contexto='', al_vuelo=None):
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
            'temperature': 0.3,
            # La pensadora puede extenderse; la rapida no. Menos palabras es
            # menos espera Y mejor chat: el prompt ya pedia dos o tres frases.
            'num_predict': 220 if pensadora else 110,
        },
    }).encode()
    req = urllib.request.Request(
        MOTOR + '/api/chat', data=cuerpo, method='POST',
        headers={'Content-Type': 'application/json'})

    if not al_vuelo:
        with urllib.request.urlopen(req, timeout=TIMEOUT_MOTOR) as r:
            j = json.loads(r.read())
        return _recortar(limpiar((j.get('message') or {}).get('content', '').strip()))

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
                pendiente = pendiente[corte + 1:]
                if frase:
                    al_vuelo(limpiar(frase))
    resto = _recortar(limpiar(pendiente.strip()))
    return resto, entero


def _recortar(texto):
    if len(texto) > 900:
        corte = texto.rfind('.', 0, 900)
        texto = texto[:corte + 1 if corte > 200 else 900].strip()
    return texto


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
        contexto = quien_es(rel, de, p)
    except Exception:
        contexto = ''
    salio = []

    def soltar(frase):
        # cada frase terminada sale ya: la persona lee mientras se escribe el
        # resto. Si una falla, se guarda para el envio final y no se pierde.
        try:
            rel.enviar(de, frase)
            salio.append(frase)
        except Exception as e:
            log('no salio una frase para', de, str(e)[:60])

    try:
        with Pensando(rel, de):
            resto, entero = preguntar_motor(sistema, p, p['historial'], dicho,
                                            contexto, al_vuelo=soltar)
    except Exception as e:
        log('motor caido:', type(e).__name__, str(e)[:120])
        if not salio:
            rel.enviar(de, MOTOR_CAIDO)
        return
    if resto:
        rel.enviar(de, resto)
    if not salio and not resto:
        rel.enviar(de, MOTOR_CAIDO)
        return
    r = (entero or '').strip() or resto
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
