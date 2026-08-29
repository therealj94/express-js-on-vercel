#!/usr/bin/env python3
"""Que AU-RA escuche una nota de voz de punta a punta.

POR QUE ESTA PRUEBA EXISTE

El camino de una nota de voz tiene cuatro tramos, y cada uno puede fallar por
su cuenta:

    1. el mensaje trae `tipo:'voz'` y un `archivo`
    2. el binario se baja del relevo con GET /archivo/<id>
    3. viene CIFRADO, con una llave que viajaba dentro del sobre del mensaje
    4. los bytes en claro van a /oir y vuelven como texto

Comprobar solo el resultado —«contestó algo»— no sirve: si el tramo 3 se
saltara, el audio llegaría a Whisper como ruido y la transcripción vendría
vacía, que es indistinguible de «la persona no dijo nada». Por eso se
comprueba cada tramo, y sobre todo LOS FALLOS: que cada uno diga algo distinto.

Los mensajes de fallo son la mitad del trabajo. «No pude bajarla», «no la pude
abrir» y «no le entendí» mandan a mirar sitios distintos; un mensaje único para
los tres convierte un fallo de diez minutos en uno de dos horas.

El motor de voz es de mentira acá —un /oir que contesta lo que se le diga— a
propósito: se está probando el CAMINO, no a Whisper. Whisper ya está probado
donde vive.
"""

import base64
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from candado import Candado, b64
from oido import NoSePudoOir, bajar_adjunto, oir_nota, transcribir

mal = 0


def ok(nombre, cierto, detalle=''):
    global mal
    if cierto:
        print(f'  ok    {nombre}' + (f'  · {detalle}' if detalle else ''))
    else:
        mal += 1
        print(f'  FALLA {nombre}' + (f'\n          {detalle}' if detalle else ''))


# ── un relevo y un motor de voz de mentira ───────────────────────────────────

ARCHIVOS = {}
LO_QUE_OYO = {}
COMO_CONTESTA = {'texto': 'hola, ¿me escuchás?', 'codigo': 200}


class Mano(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith('/archivo/'):
            iid = self.path.split('/archivo/')[1]
            if iid not in ARCHIVOS:
                self.send_response(404); self.end_headers(); return
            datos = ARCHIVOS[iid]
            self.send_response(200)
            self.send_header('Content-Length', str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)
            return
        self.send_response(404); self.end_headers()

    def do_POST(self):
        if self.path != '/oir':
            self.send_response(404); self.end_headers(); return
        n = int(self.headers.get('Content-Length', 0))
        audio = self.rfile.read(n)
        LO_QUE_OYO['audio'] = audio
        LO_QUE_OYO['correo'] = self.headers.get('X-Correo', '')
        LO_QUE_OYO['idioma'] = self.headers.get('X-Idioma', '')
        if COMO_CONTESTA['codigo'] != 200:
            self.send_response(COMO_CONTESTA['codigo'])
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error":"no"}')
            return
        cuerpo = json.dumps({'texto': COMO_CONTESTA['texto']}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)


srv = HTTPServer(('127.0.0.1', 0), Mano)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}'

caja = tempfile.mkdtemp(prefix='oido-')
CANDADO = Candado(os.path.join(caja, 'candado.json'))

AUDIO = b'OggS\x00\x02' + bytes(range(256)) * 20     # un «opus» de mentira, pero real


def cerrar_como_la_app(audio, texto_de_la_persona=''):
    """Lo que hace la app: cifra el audio, y mete su llave DENTRO del sobre."""
    llave = os.urandom(32)
    iv = os.urandom(12)
    cerrado = AESGCM(llave).encrypt(iv, audio, None)

    # el texto del mensaje: '{' + JSON, como `enviarAdjunto`
    carga = '{' + json.dumps({'t': texto_de_la_persona,
                              'k': b64(llave), 'iv': b64(iv)})

    # y el sobre, cerrado a la llave de AU-RA
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    mi = ec.generate_private_key(ec.SECP256R1())
    suya = ec.EllipticCurvePublicKey.from_encoded_point(
        ec.SECP256R1(), base64.urlsafe_b64decode(CANDADO.publica_b64 + '=='))
    k = HKDF(algorithm=hashes.SHA256(), length=32, salt=b'',
             info=b'pulse2chat/sobre/v1').derive(mi.exchange(ec.ECDH(), suya))
    llave_msg = os.urandom(32)
    iv_msg = os.urandom(12)
    iv_s = os.urandom(12)
    return cerrado, {
        'v': 2,
        'de': b64(mi.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint)),
        'iv': b64(iv_msg),
        'ct': b64(AESGCM(llave_msg).encrypt(iv_msg, carga.encode(), None)),
        's': [{'a': CANDADO.id, 'iv': b64(iv_s),
               'k': b64(AESGCM(k).encrypt(iv_s, llave_msg, None))}],
    }


print('\n── el camino entero ─────────────────────────────────────────')

cerrado, cif = cerrar_como_la_app(AUDIO)
ARCHIVOS['nota1'] = cerrado
msg = {'tipo': 'voz', 'archivo': 'nota1', 'cif': json.dumps(cif)}

texto = oir_nota(msg, CANDADO, BASE, BASE, 'aura@x.com', 'llave', idioma='es')
ok('AU-RA escucha una nota de voz cifrada', texto == 'hola, ¿me escuchás?', repr(texto))
ok('y lo que le llega a Whisper es el audio DESCIFRADO, no el bulto',
   LO_QUE_OYO.get('audio') == AUDIO,
   'si no, la transcripción vendría vacía y parecería que la persona no dijo nada')
ok('con el idioma que se le pidió', LO_QUE_OYO.get('idioma') == 'es')

print('\n── una nota SIN cifrar (cliente viejo, o sin candado) ───────')
ARCHIVOS['nota2'] = AUDIO
texto2 = oir_nota({'tipo': 'voz', 'archivo': 'nota2'}, CANDADO, BASE, BASE,
                  'aura@x.com', 'llave')
ok('también la escucha', texto2 == 'hola, ¿me escuchás?', repr(texto2))

print('\n── y los fallos, que tienen que decir cosas DISTINTAS ───────')

dichos = {}


def motivo(msg_, etiqueta):
    try:
        oir_nota(msg_, CANDADO, BASE, BASE, 'aura@x.com', 'llave')
        return None
    except NoSePudoOir as e:
        dichos[etiqueta] = e.para_la_persona
        return e.para_la_persona


m1 = motivo({'tipo': 'voz', 'archivo': 'no-existe'}, 'no-baja')
ok('un archivo que no está: lo dice', bool(m1), m1)

_, cif_ajeno = cerrar_como_la_app(AUDIO)
cif_ajeno['s'][0]['a'] = 'otro-aparato'      # el sobre no es para AU-RA
ARCHIVOS['nota3'] = cerrado
m2 = motivo({'tipo': 'voz', 'archivo': 'nota3', 'cif': json.dumps(cif_ajeno)}, 'sin-sobre')
ok('un sobre que no es suyo: lo dice, y manda a escribir', bool(m2), m2)

ARCHIVOS['nota4'] = b'esto no es el audio que se cifro'
_, cif4 = cerrar_como_la_app(AUDIO)
m3 = motivo({'tipo': 'voz', 'archivo': 'nota4', 'cif': json.dumps(cif4)}, 'no-abre')
ok('bytes que no descifran: lo dice', bool(m3), m3)

COMO_CONTESTA['texto'] = ''
ARCHIVOS['nota5'] = AUDIO
m4 = motivo({'tipo': 'voz', 'archivo': 'nota5'}, 'vacia')
ok('silencio o ruido: pide que la repita, no dice que falló', bool(m4), m4)

COMO_CONTESTA['codigo'] = 503
m5 = motivo({'tipo': 'voz', 'archivo': 'nota5'}, 'cargando')
ok('el motor todavía cargando: dice que espere un ratito', bool(m5), m5)
COMO_CONTESTA['codigo'] = 200
COMO_CONTESTA['texto'] = 'hola'

ok('los cinco motivos son mensajes DISTINTOS',
   len(set(dichos.values())) == len(dichos),
   f'{len(set(dichos.values()))} distintos de {len(dichos)} · ' +
   'un mensaje único para todos convierte un fallo de diez minutos en uno de dos horas')

print('\n── el tope ──────────────────────────────────────────────────')
ARCHIVOS['gorda'] = b'x' * (9 * 1024 * 1024)
try:
    bajar_adjunto(BASE, 'gorda')
    ok('una nota de más de 8 MB se corta', False, 'la dejó pasar')
except NoSePudoOir as e:
    ok('una nota de más de 8 MB se corta', True, e.para_la_persona)

print('\n── y que el ASISTENTE lo use de verdad ─────────────────────')

# Lo de arriba prueba `oir_nota`. Esto prueba el CABLE: que `atender` mande la
# nota al oido en vez de contestar «solo entiendo texto». Es exactamente la
# clase de union que se escribe, se da por buena y nunca se ejercita.
import asistente as aura

aura.CANDADO = CANDADO
aura.LLAVE = 'llave'
aura.RELEVO = BASE
aura.VOZ = BASE
COMO_CONTESTA['texto'] = 'esto lo dije hablando'


class RelevoDeMentira:
    def __init__(self):
        self.dicho = []

    def enviar(self, para, texto, parcial=False):
        self.dicho.append(texto)
        return {'ok': True, 'id': 'm1'}

    def editar(self, mid, texto, parcial=False):
        self.dicho[-1] = texto
        return {'ok': True}

    def escribiendo(self, para):
        pass

    def ficha(self, de):
        return {}


# Se le corta el paso al motor: acá no se prueba qué contesta, sino QUÉ OYÓ.
oido_por_el_motor = {}


def motor_de_mentira(sistema, perfil, historial, dicho, *a, **k):
    # *a a proposito: `preguntar_motor` lleva mas parametros posicionales
    # (contexto, al_vuelo…) y una firma exacta ata la prueba a un detalle que
    # no esta probando.
    oido_por_el_motor['dicho'] = dicho
    return 'te oí'


aura.preguntar_motor = motor_de_mentira

ARCHIVOS['nota6'] = AUDIO
rel = RelevoDeMentira()
p = {'saludado': True, 'historial': [], 'dia': aura.hoy(), 'usadas': 0}
aura.atender(rel, 'sistema', p, 'ana@x.com', '',
             {'tipo': 'voz', 'archivo': 'nota6'})

ok('atender manda la nota al oído en vez de rebotarla',
   'solo entiendo' not in ' '.join(rel.dicho).lower(),
   ' | '.join(rel.dicho)[:120])
ok('y al motor le llega lo que la persona DIJO',
   oido_por_el_motor.get('dicho') == 'esto lo dije hablando',
   repr(oido_por_el_motor.get('dicho')))

# Y una foto sigue rebotando, que es lo correcto: no hay ojos, solo oído.
rel2 = RelevoDeMentira()
p2 = {'saludado': True, 'historial': [], 'dia': aura.hoy(), 'usadas': 0}
aura.atender(rel2, 'sistema', p2, 'ana@x.com', '',
             {'tipo': 'imagen', 'archivo': 'nota6'})
ok('una foto sí se rebota, y ahora dice que también entiende notas de voz',
   'notas de voz' in ' '.join(rel2.dicho), ' | '.join(rel2.dicho)[:120])

srv.shutdown()
print(f'\n{mal} en rojo\n' if mal else '\nAU-RA escucha\n')
sys.exit(1 if mal else 0)
