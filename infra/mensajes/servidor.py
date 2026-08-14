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
este tamaño (mensajes de texto entre cientos de usuarios) sobra. Los
adjuntos (imagen/video/archivo, ≤8MB) van como binarios en disco y se
sirven por GET /archivo/<id>: el id aleatorio largo es el permiso.
"""
import base64, json, os, re, secrets, threading, time
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
ID_ARCHIVO = re.compile(r'[0-9a-f]{32}')
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
        # GET /archivo/<id> — SIN llave a propósito: el id son 32 hex al azar
        # (128 bits) y ES el permiso (capability URL). Así el visor de la app,
        # el navegador o un reproductor externo lo abren sin sesión, igual que
        # un enlace de foto de cualquier chat. Adivinar un id no es viable.
        partes = [p for p in self.path.split('?')[0].split('/') if p]
        if len(partes) >= 2 and partes[-2] == 'archivo' and ID_ARCHIVO.fullmatch(partes[-1]):
            return self._archivo(partes[-1])
        return self._json(404, {'error': 'no existe'})

    def _archivo(self, iid):
        with candado:
            meta = cargar().get('archivos', {}).get(iid)
        try:
            # el id ya pasó el regex estricto: no hay ../ ni sorpresas de ruta
            with open(os.path.join(CARPETA_ARCHIVOS, iid + '.bin'), 'rb') as fh:
                cuerpo = fh.read()
        except OSError:
            meta = None
        if not meta:
            return self._json(404, {'error': 'no existe'})
        self.send_response(200)
        self.send_header('Content-Type', meta.get('mime') or 'application/octet-stream')
        self.send_header('Content-Length', str(len(cuerpo)))
        # nombre saneado a ASCII simple: es solo cortesía para el "guardar
        # como" del navegador, no vale la pena la coreografía RFC 5987
        nombre = re.sub(r'[^A-Za-z0-9._ -]', '_', meta.get('nombre') or iid)[:80]
        self.send_header('Content-Disposition', 'inline; filename="%s"' % nombre)
        # el binario de un id jamás cambia: que el teléfono lo cachee y no
        # vuelva a bajar la misma foto en cada scroll del hilo
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_POST(self):
        # la ruta se decide ANTES de leer el cuerpo: el tope grande es solo
        # para /subir y el resto de rutas conserva su límite de siempre
        ruta = '/' + self.path.split('?')[0].strip('/').split('/')[-1]
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n > (TOPE_POST_SUBIR if ruta == '/subir' else TOPE_POST):
                return self._json(413, {'error': 'muy grande'})
            b = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return self._json(400, {'error': 'json inválido'})

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

            if ruta == '/subir':
                # Sube un adjunto y devuelve su id. El binario NO viaja en el
                # mensaje: primero se sube aquí, después /enviar referencia el
                # id. Así un adjunto reintentado no duplica megas en el hilo.
                tipo = str(b.get('tipo', ''))
                if tipo not in ('imagen', 'video', 'archivo'):
                    return self._json(400, {'error': 'tipo inválido'})
                try:
                    datos = base64.b64decode(str(b.get('datos', '')), validate=True)
                except Exception:
                    return self._json(400, {'error': 'base64 inválido'})
                if not datos:
                    return self._json(400, {'error': 'archivo vacío'})
                if len(datos) > TOPE_ARCHIVO:
                    return self._json(413, {'error': 'más de 8MB'})
                mime = str(b.get('mime', ''))[:120]
                # un mime raro no rompe nada, pero saldrá en un header HTTP:
                # si no parece "tipo/subtipo", octet-stream y a otra cosa
                if not re.fullmatch(r'[\w.+-]+/[\w.+-]+', mime):
                    mime = 'application/octet-stream'
                iid = secrets.token_hex(16)   # 32 hex = la capability URL
                os.makedirs(CARPETA_ARCHIVOS, exist_ok=True)
                with open(os.path.join(CARPETA_ARCHIVOS, iid + '.bin'), 'wb') as fh:
                    fh.write(datos)
                d.setdefault('archivos', {})[iid] = {
                    'mime': mime, 'nombre': str(b.get('nombre', ''))[:120],
                    'tipo': tipo, 'de': correo, 'peso': len(datos),
                    'cuando': int(time.time() * 1000)}
                guardar(d)
                return self._json(200, {'id': iid})

            if ruta == '/enviar':
                para = str(b.get('para', '')).lower()
                texto = str(b.get('texto', ''))[:TOPE_TEXTO].strip()
                # adjunto opcional: solo cuenta si el id existe de verdad en el
                # índice — un id inventado daría burbujas rotas en la app
                tipo = str(b.get('tipo', ''))
                archivo = str(b.get('archivo', ''))
                adj = (tipo in ('imagen', 'video', 'archivo')
                       and archivo in d.get('archivos', {}))
                # un mensaje puede ser solo texto, solo adjunto, o ambos
                if not correo_valido(para) or (not texto and not adj):
                    return self._json(400, {'error': 'faltan datos'})
                m = {'de': correo, 'para': para, 'texto': texto,
                     'cuando': int(time.time() * 1000)}
                if adj:
                    m['tipo'] = tipo
                    m['archivo'] = archivo
                    m['nombre'] = str(b.get('nombre', ''))[:120]
                d['mensajes'].append(m)
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

            if ruta == '/buscar':
                # El directorio del ecosistema: buscar gente por nombre o
                # correo entre quienes ya tienen Genesis en el chat. Devuelve
                # poco (10) y solo lo publico: nombre, correo, direccion.
                q = str(b.get('q', '')).lower().strip()
                if len(q) < 2:
                    return self._json(200, {'gente': []})
                gente = [{'correo': c, 'nombre': g['nombre'], 'addr': g['addr']}
                         for c, g in fichas.items()
                         if q in c or q in g['nombre'].lower()]
                gente = [x for x in gente if x['correo'] != correo][:10]
                return self._json(200, {'gente': gente})

            if ruta == '/conversaciones':
                # Todas mis charlas: con quien, lo ultimo dicho y cuantos sin
                # leer. Es lo que pinta la lista principal del chat.
                vistos = d.setdefault('vistos', {}).get(correo, {})
                hilos = {}
                for m in d['mensajes']:
                    if m['de'] == correo:
                        otro = m['para']
                    elif m['para'] == correo:
                        otro = m['de']
                    else:
                        continue
                    h = hilos.setdefault(otro, {'ultimo': None, 'sinLeer': 0})
                    h['ultimo'] = m
                    if m['para'] == correo and m['cuando'] > vistos.get(otro, 0):
                        h['sinLeer'] += 1
                lista = []
                for otro, h in hilos.items():
                    g = fichas.get(otro, {})
                    lista.append({'correo': otro,
                                  'nombre': g.get('nombre', otro.split('@')[0]),
                                  'addr': g.get('addr', ''),
                                  'ultimo': h['ultimo'], 'sinLeer': h['sinLeer']})
                lista.sort(key=lambda x: -(x['ultimo'] or {}).get('cuando', 0))
                return self._json(200, {'conversaciones': lista})

            if ruta == '/leido':
                # Marca la charla con alguien como vista hasta ahora.
                de = str(b.get('de', '')).lower()
                d.setdefault('vistos', {}).setdefault(correo, {})[de] = int(time.time() * 1000)
                guardar(d)
                return self._json(200, {'ok': True})

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
