#!/usr/bin/env python3
"""EL MOTOR DE ULTRON EN EL NODO: la única puerta desde afuera hacia el modelo.

── POR QUÉ EXISTE ───────────────────────────────────────────────────────────

Ollama escucha en 127.0.0.1:11434, sin clave y sin TLS, y así tiene que
quedarse: cualquiera que le hable puede cargar modelos, borrarlos o hacerle
gastar la tarjeta. ULTRON vive en Heroku y necesita pensar con el modelo del
nodo. Esto es lo que hay en medio, y hace exactamente tres cosas:

  1. Exige un secreto (cabecera `x-ultron-secreto`, comparación en tiempo
     constante) y habla TLS con un certificado propio cuya huella ULTRON
     conoce. Sin secreto: 401. Sin TLS: no hay puerto.
  2. Deja pasar solo `/api/chat` y `/api/tags`. Ni `/api/pull`, ni
     `/api/delete`, ni nada que cambie lo que hay en la tarjeta.
  3. FIJA el modelo y el tamaño de contexto a los de AU-RA. Esta tarjeta tiene
     UN modelo cargado a la vez (OLLAMA_MAX_LOADED_MODELS=1): un pedido con
     otro modelo o con otro `num_ctx` desaloja al de AU-RA, y el siguiente
     mensaje de un cliente por WhatsApp espera veinte segundos a que vuelva a
     cargar. Se decide aquí y no en ULTRON porque aquí es donde no se puede
     equivocar: un ULTRON mal configurado no puede tumbar a AU-RA.

El streaming pasa tal cual: Ollama manda NDJSON y esto lo reescribe línea a
línea según llega, que es lo que hace que la respuesta se vea escribirse.

── LO QUE NO ES ─────────────────────────────────────────────────────────────

No es un balanceador ni un cache. Un pedido, una respuesta. Si algún día hay
dos tarjetas, esto crece; hoy con una alcanza.

Variables (en /etc/ultron-motor.env):
  ULTRON_MOTOR_SECRETO    obligatoria; sin ella no arranca
  ULTRON_MOTOR_PUERTO     8443
  ULTRON_MOTOR_MODELO     qwen3.8:27b   (el mismo que AU-RA)
  ULTRON_MOTOR_CTX        12288         (el de AU-RA — mismo número o se recarga)
  ULTRON_MOTOR_CERT / _LLAVE   rutas del certificado y la llave
"""

import hmac
import json
import os
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRETO = (os.environ.get('ULTRON_MOTOR_SECRETO') or '').strip()
PUERTO = int(os.environ.get('ULTRON_MOTOR_PUERTO', '8443'))
MODELO = os.environ.get('ULTRON_MOTOR_MODELO', 'qwen3.8:27b')
CTX = int(os.environ.get('ULTRON_MOTOR_CTX', '12288'))
CERT = os.environ.get('ULTRON_MOTOR_CERT', '/etc/ultron-motor/cert.pem')
LLAVE = os.environ.get('ULTRON_MOTOR_LLAVE', '/etc/ultron-motor/llave.pem')
OLLAMA = os.environ.get('OLLAMA_HOST_LOCAL', 'http://127.0.0.1:11434')
TOPE_CUERPO = 512 * 1024          # un prompt de ULTRON son ~20 KB; medio mega es de sobra
PLAZO_S = 180                     # un turno largo con herramientas

# Cuántos piensan a la vez. Ollama tiene NUM_PARALLEL=3 y AU-RA usa esas
# ranuras; ULTRON toma como mucho DOS para no dejar a AU-RA sin ninguna. Un
# tercero espera, no se rechaza: la junta son seis personas, no mil.
CUPO = threading.BoundedSemaphore(int(os.environ.get('ULTRON_MOTOR_CUPO', '2')))

# Solo lo que ULTRON necesita. Todo lo demás es 404, no 403: no se cuenta qué
# hay detrás.
PERMITIDO = {('POST', '/api/chat'), ('GET', '/api/tags'), ('GET', '/salud')}

contador = {'pedidos': 0, 'rechazados': 0, 'desde': time.time()}


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


class Motor(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'ultron-motor/1'

    def log_message(self, *a):        # el registro es nuestro, no el del módulo
        pass

    def _json(self, codigo, obj):
        cuerpo = json.dumps(obj).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(cuerpo)

    def _autorizado(self):
        dado = (self.headers.get('x-ultron-secreto') or '').encode()
        return SECRETO and hmac.compare_digest(dado, SECRETO.encode())

    def do_GET(self):
        self._atender('GET')

    def do_POST(self):
        self._atender('POST')

    def _atender(self, metodo):
        ruta = self.path.split('?')[0]
        if (metodo, ruta) not in PERMITIDO:
            return self._json(404, {'error': 'no'})
        if not self._autorizado():
            contador['rechazados'] += 1
            return self._json(401, {'error': 'no', 'codigo': 'NO'})
        contador['pedidos'] += 1
        if ruta == '/salud':
            return self._json(200, {'ok': True, 'modelo': MODELO, 'ctx': CTX, 'ollama': self._ollama_vivo(),
                                    'pedidos': contador['pedidos'], 'rechazados': contador['rechazados'],
                                    'desde': int(contador['desde'])})
        if ruta == '/api/tags':
            return self._reenviar('GET', ruta, None)
        # /api/chat
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > TOPE_CUERPO:
            return self._json(413, {'error': 'cuerpo fuera de medida', 'codigo': 'MEDIDA'})
        try:
            pedido = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return self._json(400, {'error': 'no es JSON', 'codigo': 'JSON'})
        # LA REGLA QUE NO SE NEGOCIA: el modelo y el contexto de AU-RA, siempre.
        pedido['model'] = MODELO
        opciones = pedido.get('options') if isinstance(pedido.get('options'), dict) else {}
        opciones['num_ctx'] = CTX
        pedido['options'] = opciones
        pedido['keep_alive'] = pedido.get('keep_alive') or '30m'
        self._reenviar('POST', ruta, json.dumps(pedido).encode())

    def _ollama_vivo(self):
        try:
            with urllib.request.urlopen(OLLAMA + '/api/tags', timeout=4) as r:
                d = json.loads(r.read() or b'{}')
            return {'vivo': True, 'modelos': [m.get('name') for m in d.get('models', [])]}
        except Exception as e:
            return {'vivo': False, 'porQue': type(e).__name__}

    def _reenviar(self, metodo, ruta, cuerpo):
        req = urllib.request.Request(OLLAMA + ruta, data=cuerpo, method=metodo,
                                     headers={'Content-Type': 'application/json'})
        with CUPO:
            t0 = time.time()
            try:
                with urllib.request.urlopen(req, timeout=PLAZO_S) as r:
                    self.send_response(r.status)
                    self.send_header('Content-Type', r.headers.get('Content-Type', 'application/x-ndjson'))
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Connection', 'close')
                    self.end_headers()
                    # Línea a línea: Ollama manda un JSON por línea y cada uno es
                    # un trozo de respuesta. Esperar el final sería quitarle a
                    # ULTRON justo lo que hace que se vea vivo.
                    while True:
                        trozo = r.readline()
                        if not trozo:
                            break
                        self.wfile.write(trozo)
                        self.wfile.flush()
                if ruta == '/api/chat':
                    log(f'chat · {time.time() - t0:.1f}s')
            except urllib.error.HTTPError as e:
                detalle = e.read()[:400]
                log(f'ollama {e.code} en {ruta}: {detalle[:120]!r}')
                self._json(502, {'error': 'el modelo contestó mal', 'codigo': 'MODELO', 'ollama': e.code,
                                 'detalle': detalle.decode('utf-8', 'replace')})
            except Exception as e:
                log(f'ollama no contesta en {ruta}: {type(e).__name__} {str(e)[:120]}')
                try:
                    self._json(503, {'error': 'el modelo no contesta', 'codigo': 'MODELO_MUDO', 'porQue': type(e).__name__})
                except Exception:
                    pass


def main():
    if len(SECRETO) < 24:
        print('ULTRON_MOTOR_SECRETO falta o es corto (mínimo 24). No arranco.', file=sys.stderr)
        sys.exit(2)
    for ruta in (CERT, LLAVE):
        if not os.path.exists(ruta):
            print(f'falta {ruta}. Correr instalar-motor.sh.', file=sys.stderr)
            sys.exit(2)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(CERT, LLAVE)
    sv = ThreadingHTTPServer(('0.0.0.0', PUERTO), Motor)
    sv.socket = ctx.wrap_socket(sv.socket, server_side=True)
    log(f'motor de ULTRON en :{PUERTO} · modelo {MODELO} · ctx {CTX} · ollama {OLLAMA}')
    sv.serve_forever()


if __name__ == '__main__':
    main()
