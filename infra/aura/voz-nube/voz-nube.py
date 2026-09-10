#!/usr/bin/env python3
"""LA VOZ Y EL OÍDO DE LA CASA, SIN TARJETA PROPIA.

── POR QUÉ EXISTE ────────────────────────────────────────────────────────────

Hasta el 5-sep la voz de AU-RA vivía en una GPU entera para ella sola: una T4
de $394 al mes corriendo Chatterbox para hablar y Whisper para oír. Eso es una
tarjeta de mil quinientos dólares al año para decir «buenas tardes» y entender
notas de voz.

Este servicio hace las dos cosas contra ElevenLabs —que ULTRON ya usa y ya está
pagado— y no necesita GPU ni CPU de consideración: son dos llamadas HTTP. La T4
se apaga y la casa sigue hablando y oyendo igual.

── LA REGLA DE ESTE ARCHIVO: LA MISMA API, BYTE POR BYTE ────────────────────

AU-RA, la billetera y el cerebro llaman a `/salud`, `/decir`, `/hablar` y
`/oir` con una forma exacta —incluidos los ocho dígitos hexadecimales delante
de cada trozo de `/hablar` y la cabecera `X-Duracion` de `/decir`—. Este
servicio los reproduce SIN QUE NADIE DEL OTRO LADO CAMBIE UNA LÍNEA: se cambia
a dónde apunta `AURA_VOZ` y ya. Si algo aquí no cuadra, se vuelve a encender la
T4 y todo sigue como estaba.

── UNA SOLA VOZ PARA TODA LA CASA ───────────────────────────────────────────

José eligió a George el 5-sep, oyendo las cinco finalistas en español y en
inglés: británico, grave, mesurado. La misma en los dos idiomas y en las dos
casas —AU-RA y ULTRON—, porque dos voces distintas para una misma empresa es
una empresa que suena a dos empresas.

Las tres voces del catálogo viejo («cálida», «ágil», «sobria») se conservan
como NOMBRES para no romper a quien las pida, pero las tres suenan a George: la
casa tiene una voz, no tres.
"""

import io
import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── configuración ────────────────────────────────────────────────────────────
PUERTO = int(os.environ.get('AURA_VOZ_PUERTO', '8123'))
ESCUCHA = os.environ.get('AURA_VOZ_ESCUCHA', '0.0.0.0')
LLAVE = (os.environ.get('ELEVENLABS_API_KEY') or '').strip()
# George — británico, cálido y grave. La voz de la casa.
VOZ_ID = os.environ.get('ELEVENLABS_VOZ', 'JBFqnCBsd6RMkjVDRZzb')
MODELO_VOZ = os.environ.get('ELEVENLABS_MODELO', 'eleven_multilingual_v2')
MODELO_OIDO = os.environ.get('ELEVENLABS_MODELO_OIDO', 'scribe_v1')
API = 'https://api.elevenlabs.io/v1'
RELEVO = os.environ.get('AURA_RELEVO', 'https://cerebro.ordenscan.com/mensajes').rstrip('/')
TOPE_AUDIO = 2 * 1024 * 1024
FORMATO = 'mp3'
VOZ_POR_DEFECTO = 'calida'

# Los nombres viejos siguen existiendo para no romper a quien los pida; los
# tres apuntan a la única voz de la casa.
VOCES = {
    'calida':  {'nombre': 'George', 'que_es': 'la voz de la casa · británica, grave y mesurada'},
    'agil':    {'nombre': 'George', 'que_es': 'la voz de la casa'},
    'sobria':  {'nombre': 'George', 'que_es': 'la voz de la casa'},
}

ORIGENES = [
    'https://cerebro.ordenscan.com', 'https://app.vetawallet.com',
    'https://www.vetawallet.com', 'https://vetawallet.com',
    'https://ordenexchange.link', 'https://www.ordenexchange.link',
]


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


# ── ElevenLabs ───────────────────────────────────────────────────────────────
def _pedir(ruta, cuerpo=None, cabeceras=None, plazo=120, crudo=False):
    h = {'xi-api-key': LLAVE}
    h.update(cabeceras or {})
    datos = cuerpo
    if isinstance(cuerpo, dict):
        datos = json.dumps(cuerpo).encode()
        h['Content-Type'] = 'application/json'
    r = urllib.request.Request(API + ruta, data=datos, headers=h)
    with urllib.request.urlopen(r, timeout=plazo) as f:
        b = f.read()
    return b if crudo else json.loads(b or b'{}')


def decir(texto, idioma='es'):
    """Texto → MP3. `idioma` no se manda: el modelo multilingüe lo saca del
       propio texto, y forzarlo es como se consigue que lea el español con
       fonética inglesa."""
    return _pedir(f'/text-to-speech/{VOZ_ID}',
                  {'text': texto, 'model_id': MODELO_VOZ,
                   'voice_settings': {'stability': 0.55, 'similarity_boost': 0.8,
                                      'style': 0.0, 'use_speaker_boost': True}},
                  {'Accept': 'audio/mpeg'}, plazo=150, crudo=True)


def oir(crudo, idioma='es'):
    """Audio → texto. Se manda como multipart a mano: son cuatro líneas y
       evita una dependencia entera solo para armar un formulario."""
    lim = '----ogb' + os.urandom(8).hex()
    partes = []
    for k, v in (('model_id', MODELO_OIDO),):
        partes.append(f'--{lim}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    partes.append(f'--{lim}\r\nContent-Disposition: form-data; name="file"; filename="a.ogg"\r\n'
                  f'Content-Type: application/octet-stream\r\n\r\n'.encode())
    partes.append(crudo)
    partes.append(f'\r\n--{lim}--\r\n'.encode())
    d = _pedir('/speech-to-text', b''.join(partes),
               {'Content-Type': f'multipart/form-data; boundary={lim}'}, plazo=180)
    return (d.get('text') or '').strip()


# ── la puerta: quién puede pedir voz ─────────────────────────────────────────
_CONOCIDOS = {}
_CANDADO = threading.Lock()


def _puede(correo, llave):
    """La misma puerta que el servicio viejo: se le pregunta al relevo. No se
       inventa una lista de cuentas nueva — una segunda lista es una segunda
       lista que se desincroniza."""
    if not correo or not llave:
        return False
    ahora = time.time()
    with _CANDADO:
        visto = _CONOCIDOS.get((correo, llave))
        if visto and ahora - visto[0] < 300:
            return visto[1]
    try:
        req = urllib.request.Request(
            RELEVO + '/ficha', method='POST',
            data=json.dumps({'correo': correo, 'llave': llave, 'de': correo}).encode(),
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=8) as r:
            ok = r.status == 200
    except Exception:
        ok = False        # ante la duda, no
    with _CANDADO:
        _CONOCIDOS[(correo, llave)] = (ahora, ok)
        if len(_CONOCIDOS) > 500:
            _CONOCIDOS.clear()
    return ok


_CUPO = {}


def _hay_cupo(quien, cuantas=20, ventana=60):
    ahora = time.time()
    with _CANDADO:
        v = [t for t in _CUPO.get(quien, []) if ahora - t < ventana]
        if len(v) >= cuantas:
            _CUPO[quien] = v
            return False
        v.append(ahora)
        _CUPO[quien] = v
    return True


def _partir(texto, tope=280):
    """Para /hablar: el texto se parte por frases para que la primera suene
       antes de que la última esté generada. Es lo mismo que hacía el motor
       local, y por lo mismo: la espera que se nota es la PRIMERA."""
    trozos, actual = [], ''
    for pieza in texto.replace('\n', ' ').split('. '):
        pieza = pieza.strip()
        if not pieza:
            continue
        if not pieza.endswith(('.', '?', '!')):
            pieza += '.'
        if len(actual) + len(pieza) + 1 > tope and actual:
            trozos.append(actual.strip())
            actual = pieza
        else:
            actual = (actual + ' ' + pieza).strip()
    if actual:
        trozos.append(actual)
    return trozos or [texto[:tope]]


def _segundos(mp3):
    """Duración aproximada del MP3: 128 kbps = 16 KB por segundo. Es lo que va
       en X-Duracion, que la burbuja del chat usa para dibujar la barra sin
       descargar el audio entero."""
    return max(0.4, len(mp3) / 16000.0)


class Puerta(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def _permiso(self):
        o = self.headers.get('Origin', '')
        if o in ORIGENES:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Correo, X-Llave')
            self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')

    def _json(self, codigo, obj):
        b = json.dumps(obj).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self._permiso()
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self._permiso()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path == '/salud':
            # `listo` es siempre true: no hay modelo que cargar. Ese era el
            # 503 de «todavía cargando» que costaba dos minutos en la T4.
            return self._json(200, {'listo': bool(LLAVE), 'nube': True,
                                    'voces': {k: dict(v) for k, v in VOCES.items()}})
        self._json(404, {'error': 'no'})

    def _cuerpo(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            return json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return None

    def do_POST(self):
        if self.path == '/hablar':
            return self._hablar()
        if self.path == '/oir':
            return self._oir()
        if self.path != '/decir':
            return self._json(404, {'error': 'no'})
        if not LLAVE:
            return self._json(503, {'error': 'sin llave de voz'})
        b = self._cuerpo()
        if b is None:
            return self._json(400, {'error': 'json inválido'})
        texto = str(b.get('texto', ''))[:1200]
        idioma = 'en' if b.get('idioma') == 'en' else 'es'
        if not texto.strip():
            return self._json(400, {'error': 'sin texto'})
        t0 = time.time()
        try:
            mp3 = decir(texto, idioma)
        except Exception as e:
            log('voz falló:', type(e).__name__, str(e)[:200])
            return self._json(500, {'error': 'no salió'})
        seg = _segundos(mp3)
        self.send_response(200)
        self.send_header('Content-Type', 'audio/mpeg')
        self.send_header('Content-Length', str(len(mp3)))
        self.send_header('X-Duracion', f'{seg:.1f}')
        self._permiso()
        self.end_headers()
        self.wfile.write(mp3)
        log(f'dicho: {seg:.1f}s de audio en {time.time() - t0:.1f}s · {len(mp3) // 1024} KB')

    def _oir(self):
        if not LLAVE:
            return self._json(503, {'error': 'sin oído'})
        quien = str(self.headers.get('X-Correo', ''))[:120].lower()
        llave = str(self.headers.get('X-Llave', ''))[:200]
        if not _puede(quien, llave):
            return self._json(403, {'error': 'no te conozco'})
        if not _hay_cupo(quien):
            return self._json(429, {'error': 'muchas seguidas'})
        idioma = 'en' if self.headers.get('X-Idioma') == 'en' else 'es'
        try:
            n = int(self.headers.get('Content-Length', 0))
        except Exception:
            n = 0
        if not (0 < n <= TOPE_AUDIO):
            return self._json(413, {'error': 'audio muy grande o vacío'})
        crudo = self.rfile.read(n)
        t0 = time.time()
        try:
            texto = oir(crudo, idioma)
        except Exception as e:
            log('oír falló:', type(e).__name__, str(e)[:150])
            return self._json(500, {'error': 'no se pudo oír'})
        log(f'oído a {quien}: {len(crudo) // 1024} KB → {len(texto)} car en {time.time() - t0:.1f}s')
        return self._json(200, {'texto': texto})

    def _hablar(self):
        if not LLAVE:
            return self._json(503, {'error': 'sin llave de voz'})
        b = self._cuerpo()
        if b is None:
            return self._json(400, {'error': 'json inválido'})
        quien = str(b.get('correo', ''))[:120].lower()
        llave = str(b.get('llave', ''))[:200]
        if not _puede(quien, llave):
            return self._json(403, {'error': 'no te conozco'})
        if not _hay_cupo(quien):
            return self._json(429, {'error': 'muchas seguidas'})
        texto = str(b.get('texto', ''))[:1200]
        idioma = 'en' if b.get('idioma') == 'en' else 'es'
        if not texto.strip():
            return self._json(400, {'error': 'sin texto'})
        t0, primera, total, n = time.time(), None, 0.0, 0
        self.send_response(200)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('X-Formato', FORMATO)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Transfer-Encoding', 'chunked')
        self.send_header('X-Accel-Buffering', 'no')
        self._permiso()
        self.end_headers()
        try:
            for trozo in _partir(texto):
                mp3 = decir(trozo, idioma)
                if primera is None:
                    primera = time.time() - t0
                seg = _segundos(mp3)
                total += seg
                n += 1
                log(f'  trozo {n}: {seg:.1f}s de audio, listo a los {time.time() - t0:.1f}s')
                # Ocho dígitos con el largo del MP3 y después el MP3: es lo que
                # el navegador necesita para cortar exacto, porque los límites
                # del `chunked` los consume él sin enseñárselos a nadie.
                cuerpo = f'{len(mp3):08X}'.encode() + mp3
                self.wfile.write(f'{len(cuerpo):X}\r\n'.encode())
                self.wfile.write(cuerpo)
                self.wfile.write(b'\r\n')
                self.wfile.flush()
            self.wfile.write(b'0\r\n\r\n')
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            log(f'se cortó la escucha de {quien}')
            return
        except Exception as e:
            log('hablar falló:', type(e).__name__, str(e)[:200])
            return
        log(f'hablado a {quien}: {total:.1f}s de audio · primera voz a los {(primera or 0):.1f}s')


if __name__ == '__main__':
    if not LLAVE:
        log('AVISO: sin ELEVENLABS_API_KEY no hay voz ni oído')
    log(f'voz de la casa en {ESCUCHA}:{PUERTO} · ElevenLabs · voz {VOZ_ID} · sin GPU')
    ThreadingHTTPServer((ESCUCHA, PUERTO), Puerta).serve_forever()
