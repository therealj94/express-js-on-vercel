#!/usr/bin/env python3
"""Pulse2Chat · relevo de mensajes de Orden Global. Pequeño a propósito.

Código en infra/pulse2chat/ (antes infra/mensajes/). Guarda y entrega los
mensajes del chat de la app. Python de la biblioteca estándar, sin una sola
dependencia: en el nodo donde corre no hay npm y no va a haberlo por un chat.

El modelo de identidad, dicho sin adornos:
  · el alta declara un correo y devuelve una LLAVE aleatoria;
  · la llave firma cada petición siguiente de ese correo;
  · el PRIMER alta de un correo se lo queda — quien llegue después con el
    mismo correo y otra llave, no entra.
Eso protege el buzón de un correo ya dado de alta, pero NO impide darse de
alta con el correo de otro ANTES que él. Cerrarlo de verdad exige verificar
la sesión de la wallet (PASS_TOKEN), y ese secreto está en la lista de la
Junta para rotarse (tarea 27): cuando se rote, aquí se añade la
comprobación. Escrito en el LEEME y dicho en la entrega — no es E2E y no se
promete E2E.

Los grupos ('g:'+16hex) son la segunda mitad de AURO CHAT. Dos permisos y
nada más: ser MIEMBRO (leer y escribir en el hilo) y ser ADMIN (renombrar,
cambiar la foto, regenerar la invitación). La invitación es una capability:
el token de 24 hex ES el permiso de entrar, y regenerarlo invalida el
anterior — sin listas de invitados que mantener. La pertenencia se comprueba
en CADA petición, nunca solo al abrir el hilo: quien sale del grupo deja de
leer en el mismo instante.

El /pago no mueve dinero: NEXUS jamás transmite. La wallet firma y transmite,
la cadena confirma, y solo DESPUÉS el relevo deja el comprobante en el hilo.

Corre detrás de Caddy en /mensajes/*. Estado en un JSON con candado; a
este tamaño (mensajes de texto entre cientos de usuarios) sobra. Los
adjuntos (imagen/video/archivo, ≤8MB) van como binarios en disco y se
sirven por GET /archivo/<id>: el id aleatorio largo es el permiso. Ese GET
entiende Range (206) —sin eso Safari no reproduce un video— y solo deja
abrirse dentro del navegador a imágenes y videos: lo demás se descarga, para
que nadie use nuestro dominio para servir su HTML.
"""
import base64, json, os, re, secrets, subprocess, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RUTA = os.environ.get('MENSAJES_DATOS', '/srv/mensajes/datos.json')
# Los adjuntos (imagen/video/archivo) viven como binarios sueltos al lado del
# JSON — meter megas en el JSON lo volvería ilegible e imposible de guardar
# atómicamente rápido. El mime y el nombre de cada uno sí van en el JSON.
CARPETA_ARCHIVOS = os.environ.get(
    'MENSAJES_ARCHIVOS', os.path.join(os.path.dirname(RUTA) or '.', 'archivos'))
TOPE_TEXTO = 2000          # un mensaje no es un documento
TOPE_BANDEJA = 200         # lo último; el histórico completo no viaja entero
TOPE_ARCHIVO = 8_000_000   # 8MB por adjunto: chat, no disco duro ajeno
# El POST normal sigue en 64KB; solo /subir necesita tragar el base64 de un
# adjunto de 8MB (≈10.7MB) más la envoltura JSON. Subir el tope global habría
# abierto todas las rutas a cuerpos gigantes sin motivo.
TOPE_POST = 64_000
TOPE_POST_SUBIR = 11_000_000
TOPE_NOMBRE = 64           # el nombre de un grupo cabe en la cabecera del hilo
TOPE_GRUPOS = 200          # ningún usuario en más de 200 grupos
# El JSON entero se reescribe en cada mensaje: un grupo de miles de miembros
# haría lento cada guardado de todo el relevo. 500 sobra para lo que esto es.
TOPE_MIEMBROS = 500
# Las rutas de dos niveles (/grupo/crear, /amistad/pedir, …). Todo lo que no
# esté aquí se lee solo por su último tramo.
FAMILIAS = ('grupo', 'llaves', 'amistad', 'estado')
ID_ARCHIVO = re.compile(r'[0-9a-f]{32}')
ID_GRUPO = re.compile(r'g:[0-9a-f]{16}')
# 'Range: bytes=inicio-fin', con cualquiera de los dos lados vacío. Es la
# única forma que servimos: un solo trozo, en bytes.
RANGO = re.compile(r'bytes=(\d*)-(\d*)')
candado = threading.Lock()

# Los navegadores no dejan a una página llamar a otro dominio si el dominio no
# lo autoriza. La app nativa nunca tuvo que pedir permiso —fetch en React
# Native no aplica CORS— y por eso el relevo vivió sin esto: el chat de la web
# recibía la respuesta y el navegador la tiraba a la basura antes de que el
# código la viera. Es una lista corta y cerrada; con '*' cualquier página
# ajena podría hablar por el relevo desde el navegador de quien la visite.
# El backend de la wallet, para comprobar una sesion. Se puede apuntar a otro
# desde el entorno, que es como lo prueban las pruebas sin tocar produccion.
WALLET_URL = os.environ.get(
    'MENSAJES_WALLET_URL', 'https://vetawallet-1a2e38ac52b1.herokuapp.com').rstrip('/')

# ── EL COMPROBANTE DE PAGO SE COMPRUEBA CONTRA LA CADENA ──────────────────────
#
# `/pago` deja en el hilo una tarjeta con «te mandé 1 ORIGEN» y un hash. Hasta
# hoy el relevo solo miraba que el hash TUVIERA FORMA de hash: cualquiera con
# llave de chat podia plantar en tu hilo un comprobante confirmado de un pago
# que nunca existio, o de uno ajeno. Y para 1 a 1 ni siquiera exigia el
# circulo. Un comprobante que nadie comprueba es una tarjeta bonita.
#
# Ahora se le pregunta a la cadena: la transaccion tiene que existir, estar
# confirmada (status 1), salir de la direccion de quien firma la peticion,
# llegar a la direccion de quien recibe (o a la de un miembro del grupo), y
# mover EXACTAMENTE el monto declarado. Con ORIGEN es el `value`; con un token
# es el evento Transfer de su contrato.
#
# La wallet manda el comprobante apenas emite, y el recibo puede tardar uno o
# dos bloques (10 s cada uno): se espera, sondeando, hasta PAGO_ESPERA segundos
# — FUERA del candado del relevo, que es de todos.
RPC_URL = os.environ.get('MENSAJES_RPC', 'https://rpc.ordenglobal-rpc.com/')
PAGO_ESPERA = int(os.environ.get('MENSAJES_PAGO_ESPERA', '40'))
TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'


def _rpc(metodo, params):
    import urllib.request
    pet = urllib.request.Request(
        RPC_URL, data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': metodo,
                                  'params': params}).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(pet, timeout=8) as r:
        return json.loads(r.read() or b'{}').get('result')


def _wei(monto):
    from decimal import Decimal
    return int(Decimal(monto) * (10 ** 18))


def _mismo(a, b):
    return bool(a) and bool(b) and str(a).lower() == str(b).lower()


def verificar_pago(hh, monto, moneda, addr_de, addrs_para, espera=None):
    """`('ok', None)`, `('pendiente', None)`, `('no', por_que)` o `('sin-rpc', None)`.

    `addrs_para` es la lista de direcciones que pueden recibir: una en 1 a 1,
    las de todos los miembros en un grupo. Se sondea hasta `espera` segundos
    mientras la transaccion exista y no tenga recibo todavia.
    """
    espera = PAGO_ESPERA if espera is None else espera
    fin = time.time() + espera
    while True:
        try:
            tx = _rpc('eth_getTransactionByHash', [hh])
            rc = _rpc('eth_getTransactionReceipt', [hh]) if tx else None
        except Exception:
            return 'sin-rpc', None
        if tx and rc:
            break
        if time.time() >= fin:
            return 'pendiente', None
        time.sleep(5)
    if str(rc.get('status', '')).lower() not in ('0x1', '1'):
        return 'no', 'la transacción falló en la cadena'
    if not _mismo(tx.get('from'), addr_de):
        return 'no', 'no salió de tu dirección'
    quiere = _wei(monto)
    if moneda == 'ORIGEN':
        if not any(_mismo(tx.get('to'), a) for a in addrs_para):
            return 'no', 'no llegó a la dirección de quien recibe'
        if int(str(tx.get('value', '0x0')), 16) != quiere:
            return 'no', 'el monto no es el de la transacción'
        return 'ok', None
    # un token: el evento Transfer(from, to, value) de su contrato
    for lg in rc.get('logs') or []:
        tp = lg.get('topics') or []
        if len(tp) < 3 or str(tp[0]).lower() != TRANSFER:
            continue
        de_ev = '0x' + str(tp[1])[-40:]
        a_ev = '0x' + str(tp[2])[-40:]
        try:
            valor = int(str(lg.get('data', '0x0')), 16)
        except ValueError:
            continue
        if _mismo(de_ev, addr_de) and any(_mismo(a_ev, a) for a in addrs_para) and valor == quiere:
            return 'ok', None
    return 'no', 'la transacción no mueve ese monto de ese token a quien recibe'


# ─────────────────────────────────────────────────────────────────────────────
# LOS AVISOS PUSH: la mitad que faltaba.
#
# El relevo llevaba tiempo GUARDANDO suscripciones (/suscribir) sin que nadie
# las usara: el obrero de la web sabe pintar el aviso desde el primer dia, pero
# ningun aviso salia. Esta es la pieza que empuja.
#
# COMO SE FIRMA SIN CRIPTOGRAFIA EN PYTHON
#
# Los servicios de push (Google, Mozilla, Apple) exigen VAPID: un JWT firmado
# con ES256. La biblioteca estandar no trae curvas elipticas y en este nodo no
# se instalan dependencias — pero openssl SI esta, en cualquier Linux. La firma
# se hace por subprocess con la llave de /srv/mensajes/vapid.pem, que se genera
# EN el nodo al desplegar y no pasa por el repositorio jamas.
#
# POR QUE EL AVISO VIAJA SIN CUERPO
#
# Un push CON cuerpo obliga a cifrarlo (RFC 8291: ECDH + HKDF + AES-GCM), y eso
# si que no se puede hacer con openssl de linea de comandos. Un push VACIO es
# legal (RFC 8030), no exige cifrado, y el obrero ya lo entiende: despierta y
# pinta «PULSE2CHAT — Te escribio». El nombre del remitente y el texto NO
# viajan, y eso aqui es una virtud: por la red de Google no pasa ni un dato del
# mensaje, solo el hecho de que hay algo nuevo.
#
# CUANDO NO SE EMPUJA
#
# Si esa cuenta consulto su bandeja hace menos de 45 segundos, esta con el chat
# delante y el aviso solo duplicaria lo que ya esta viendo. El pulso vive en
# memoria (no en el JSON): es un dato de presencia, no de estado.
VAPID_PEM = os.environ.get('MENSAJES_VAPID_PEM', '/srv/mensajes/vapid.pem')
VAPID_CONTACTO = 'mailto:info@ordenglobal.org'
PULSO = {}                       # correo -> ultima consulta de bandeja (epoch)
# La huella que deja AU-RA al arrancar. En memoria a proposito: describe un
# proceso vivo, y un proceso que se murio no tiene version que contar.
HUELLAS = {}                     # correo -> {asistente, prompt, modelos, ...}
# De quien es la huella que sale en /salud. Cualquiera con llave puede dejar la
# suya —la ruta no distingue—, pero solo esta se publica: /salud es publico y
# no es sitio para lo que quiera escribir cualquiera.
CORREO_AURA = os.environ.get('AURA_CORREO', 'aura@ordenglobal.org').lower()
PULSO_FRESCO = 45

# La presencia que se ENSEÑA es otra cosa que el pulso de arriba. PULSO dice
# «está mirando este hilo ahora mismo» y sirve para no duplicar el push. Para
# decir «está en el chat» —el punto verde, y sobre todo si una llamada puede
# entrarle— la señal buena es el buzón de señales: quien lo está escuchando
# tiene PULSE2CHAT de pie y una llamada le va a sonar. Se apunta cada vez que
# alguien viene a escuchar; el ciclo es de 25 segundos, así que 40 de margen
# separan «se fue» de «está entre dos preguntas».
OIDO = {}                        # correo -> ultima escucha de señales (epoch)
PRESENTE_FRESCO = 40


def presente(c):
    ahora = time.time()
    return (ahora - OIDO.get(c, 0) < PRESENTE_FRESCO
            or ahora - PULSO.get(c, 0) < PRESENTE_FRESCO)


def escuchando(c):
    """¿Le puede ENTRAR una llamada ahora mismo? Solo si escucha el buzón.

    `presente` mezcla dos cosas a propósito —el punto verde se enciende
    también con el sondeo de la bandeja—, pero para decidir si el timbre de
    una llamada se EMPUJA o no, esa mezcla era un fallo: la app del teléfono
    sondea la bandeja cada tres segundos y no escuchaba señales, así que
    contaba como «presente», el push del «llamo» se ahorraba, y la llamada no
    le sonaba nunca a quien tenía el chat abierto. Aquí solo cuenta el buzón:
    quien lo escucha recibe el timbre por la señal, y al resto se le empuja.
    """
    return time.time() - OIDO.get(c, 0) < PRESENTE_FRESCO
_vapid_pub = None
_jwt_cache = {}                  # audiencia -> (vence, token)


def _b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def llave_publica_avisos():
    """El punto publico de la llave VAPID, como lo quiere pushManager.subscribe.

    En el DER de una llave publica P-256 el punto sin comprimir son SIEMPRE los
    ultimos 65 bytes (0x04 + X + Y): no hace falta un parser de ASN.1 para
    recortarlo. Si no hay llave, cadena vacia — y la app dira que los avisos no
    estan disponibles, que es la verdad.
    """
    global _vapid_pub
    if _vapid_pub is not None:
        return _vapid_pub
    try:
        r = subprocess.run(['openssl', 'ec', '-in', VAPID_PEM, '-pubout', '-outform', 'DER'],
                           capture_output=True, timeout=10)
        punto = r.stdout[-65:]
        _vapid_pub = _b64u(punto) if r.returncode == 0 and len(punto) == 65 and punto[0] == 4 else ''
    except Exception:
        _vapid_pub = ''
    return _vapid_pub


def _der_a_cruda(der):
    """La firma DER de openssl (SEQUENCE de dos INTEGER) al r||s de 64 bytes
    que exige JWS. Los enteros DER llevan un 0x00 delante cuando el byte alto
    esta encendido; se quita, y se rellena a 32 por la izquierda."""
    def entero(b, i):
        n = b[i + 1]
        return b[i + 2:i + 2 + n].lstrip(b'\x00'), i + 2 + n
    i = 2 + (der[1] & 0x7f if der[1] & 0x80 else 0)
    r, i = entero(der, i)
    t, _ = entero(der, i)
    return r.rjust(32, b'\x00') + t.rjust(32, b'\x00')


def _jwt_para(audiencia):
    ahora = int(time.time())
    c = _jwt_cache.get(audiencia)
    if c and c[0] - 600 > ahora:
        return c[1]
    cab = _b64u(json.dumps({'typ': 'JWT', 'alg': 'ES256'}).encode())
    cue = _b64u(json.dumps({'aud': audiencia, 'exp': ahora + 12 * 3600,
                            'sub': VAPID_CONTACTO}).encode())
