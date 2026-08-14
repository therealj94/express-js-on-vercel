#!/usr/bin/env python3
"""El relevo de mensajes de Orden Global. Pequeño a propósito.

Guarda y entrega los mensajes del chat de la app. Python de la biblioteca
estándar, sin una sola dependencia: en el nodo del cerebro no hay npm y no
va a haberlo por un chat.

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

Corre detrás de Caddy en /mensajes/*. Estado en un JSON con candado; a
este tamaño (mensajes de texto entre cientos de usuarios) sobra.
"""
import json, os, re, secrets, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RUTA = os.environ.get('MENSAJES_DATOS', '/srv/mensajes/datos.json')
TOPE_TEXTO = 2000          # un mensaje no es un documento
TOPE_BANDEJA = 200         # lo último; el histórico completo no viaja entero
candado = threading.Lock()


def cargar():
    try:
        with open(RUTA, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'fichas': {}, 'mensajes': []}


def guardar(d):
    tmp = RUTA + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, RUTA)


def correo_valido(x):
    return bool(re.fullmatch(r'[^@\s]{1,64}@[^@\s]{3,255}', str(x or '').lower()))


class Relevo(BaseHTTPRequestHandler):
    server_version = 'relevo/1'

    def _json(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def log_message(self, *a):   # el journal no necesita cada GET
        pass

    def do_GET(self):
        if self.path.rstrip('/').endswith('/salud'):
            return self._json(200, {'vivo': True, 'cuando': int(time.time())})
        return self._json(404, {'error': 'no existe'})

    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n > 64_000:
                return self._json(413, {'error': 'muy grande'})
            b = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return self._json(400, {'error': 'json inválido'})
        ruta = '/' + self.path.strip('/').split('/')[-1]

        with candado:
            d = cargar()
            fichas = d['fichas']

            if ruta == '/alta':
                correo = str(b.get('correo', '')).lower()
                if not correo_valido(correo):
                    return self._json(400, {'error': 'correo inválido'})
                f = fichas.get(correo)
                if f is None:
                    f = {'llave': secrets.token_hex(24),
                         'nombre': str(b.get('nombre', ''))[:80],
                         'addr': str(b.get('addr', ''))[:64],
                         'desde': int(time.time())}
                    fichas[correo] = f
                    guardar(d)
                    return self._json(200, {'llave': f['llave']})
                # el correo ya existe: solo su dueño (con la llave) refresca datos
                if b.get('llave') == f['llave']:
                    f['nombre'] = str(b.get('nombre', f['nombre']))[:80]
                    f['addr'] = str(b.get('addr', f['addr']))[:64]
                    guardar(d)
                    return self._json(200, {'llave': f['llave']})
                return self._json(409, {'error': 'ese correo ya tiene llave'})

            # todo lo demás exige la llave del correo que firma
            correo = str(b.get('correo', '')).lower()
            f = fichas.get(correo)
            if not f or b.get('llave') != f['llave']:
                return self._json(401, {'error': 'llave incorrecta'})

            if ruta == '/enviar':
                para = str(b.get('para', '')).lower()
                texto = str(b.get('texto', ''))[:TOPE_TEXTO].strip()
                if not correo_valido(para) or not texto:
                    return self._json(400, {'error': 'faltan datos'})
                d['mensajes'].append({'de': correo, 'para': para, 'texto': texto,
                                      'cuando': int(time.time() * 1000)})
                # el histórico no crece sin límite: 20 mil mensajes rodantes
                if len(d['mensajes']) > 20_000:
                    d['mensajes'] = d['mensajes'][-20_000:]
                guardar(d)
                return self._json(200, {'ok': True})

            if ruta == '/bandeja':
                desde = str(b.get('desde', '')).lower()
                hilo = [m for m in d['mensajes']
                        if (m['de'] == correo and m['para'] == desde)
                        or (m['de'] == desde and m['para'] == correo)]
                return self._json(200, {'mensajes': hilo[-TOPE_BANDEJA:]})

            if ruta == '/ficha':
                de = str(b.get('de', '')).lower()
                g = fichas.get(de)
                # la dirección de la wallet es pública en la cadena; el nombre lo
                # declaró su dueño para ser encontrado. La llave jamás sale.
                if not g:
                    return self._json(404, {'error': 'no está'})
                return self._json(200, {'nombre': g['nombre'], 'addr': g['addr']})

        return self._json(404, {'error': 'no existe'})


if __name__ == '__main__':
    os.makedirs(os.path.dirname(RUTA), exist_ok=True)
    puerto = int(os.environ.get('MENSAJES_PUERTO', '8390'))
    print('relevo de mensajes en :%d, datos en %s' % (puerto, RUTA), flush=True)
    ThreadingHTTPServer(('127.0.0.1', puerto), Relevo).serve_forever()
