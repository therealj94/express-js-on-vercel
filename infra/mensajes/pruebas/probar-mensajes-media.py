#!/usr/bin/env python3
"""Prueba de punta a punta del chat con adjuntos (infra/mensajes/servidor.py).

Levanta el relevo REAL en un puerto libre con datos en un directorio temporal,
y comprueba lo que la app necesita que sea verdad:
  1. /subir guarda una imagen de verdad (PNG generado con PIL) y da un id;
  2. GET /archivo/<id> devuelve EXACTAMENTE los mismos bytes y el mime bueno;
  3. un mensaje con {tipo, archivo, nombre} viaja entero /enviar → /bandeja
     y aparece igual en el 'ultimo' de /conversaciones;
  4. lo que debe rebotar, rebota: id desconocido (404), adjunto de más de
     8MB (413) y un mensaje sin texto con id de archivo inventado (400).

Sin dependencias fuera de la stdlib + PIL (solo para fabricar el PNG).
"""
import base64, io, json, os, socket, subprocess, sys, tempfile, time
import urllib.error, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')

# opener sin proxy: la máquina de pruebas puede tener HTTPS_PROXY global y
# esto habla con 127.0.0.1 directamente
ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({})).open


def puerto_libre():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def post(base, ruta, cuerpo):
    """POST JSON → (status, dict). Los errores HTTP también traen JSON."""
    req = urllib.request.Request(base + ruta, data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with ABRIR(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def png_de_prueba():
    """Un PNG chiquito pero real (no bytes al azar): si el día de mañana el
    servidor tocara el contenido, una imagen válida lo delataría."""
    from PIL import Image
    img = Image.new('RGB', (24, 24))
    px = img.load()
    for x in range(24):
        for y in range(24):
            px[x, y] = (x * 10, y * 10, (x + y) * 5)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def main():
    tmp = tempfile.mkdtemp(prefix='mensajes-media-')
    puerto = puerto_libre()
    base = 'http://127.0.0.1:%d' % puerto
    env = dict(os.environ, MENSAJES_DATOS=os.path.join(tmp, 'datos.json'),
               MENSAJES_PUERTO=str(puerto))
    proc = subprocess.Popen([sys.executable, SERVIDOR], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        # esperar a que el relevo respire
        for _ in range(50):
            try:
                with ABRIR(base + '/salud', timeout=2) as r:
                    if json.loads(r.read()).get('vivo'):
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise SystemExit('el servidor nunca contestó /salud')

        # dos personas de verdad, con su llave cada una
        st, ana = post(base, '/alta', {'correo': 'ana@og.hn', 'nombre': 'Ana'})
        assert st == 200 and ana.get('llave'), 'alta de ana: %s %s' % (st, ana)
        st, beto = post(base, '/alta', {'correo': 'beto@og.hn', 'nombre': 'Beto'})
        assert st == 200 and beto.get('llave'), 'alta de beto: %s %s' % (st, beto)
        f_ana = {'correo': 'ana@og.hn', 'llave': ana['llave']}
        f_beto = {'correo': 'beto@og.hn', 'llave': beto['llave']}
        # Desde que existe el circulo hay que aceptarse para poder
        # escribirse. No es ruido de la prueba: es el mismo paso que
        # da una persona en la app antes de su primer mensaje.
        post(base, '/amistad/pedir', dict(f_ana, para='beto@og.hn'))
        post(base, '/amistad/responder', dict(f_beto, de='ana@og.hn', aceptar=True))

        # 1) subir una imagen real
        png = png_de_prueba()
        st, r = post(base, '/subir', dict(f_ana, nombre='cuadrito.png',
                     tipo='imagen', mime='image/png',
                     datos=base64.b64encode(png).decode()))
        assert st == 200 and len(r.get('id', '')) == 32, '/subir: %s %s' % (st, r)
        iid = r['id']
        assert all(c in '0123456789abcdef' for c in iid), 'id no es hex: ' + iid

        # 2) bajarla por su capability URL y comparar byte a byte
        with ABRIR(base + '/archivo/' + iid, timeout=10) as resp:
            bajado = resp.read()
            mime = resp.headers.get('Content-Type')
        assert bajado == png, 'los bytes bajados NO son los subidos (%d vs %d)' % (len(bajado), len(png))
        assert mime == 'image/png', 'mime devuelto: %r' % mime

        # 3) el mensaje con adjunto viaja entero
        st, r = post(base, '/enviar', dict(f_ana, para='beto@og.hn', texto='',
                     tipo='imagen', archivo=iid, nombre='cuadrito.png'))
        assert st == 200 and r.get('ok'), '/enviar con adjunto: %s %s' % (st, r)

        st, r = post(base, '/bandeja', dict(f_beto, desde='ana@og.hn'))
        assert st == 200 and len(r['mensajes']) == 1, '/bandeja: %s %s' % (st, r)
        m = r['mensajes'][0]
        assert m['tipo'] == 'imagen' and m['archivo'] == iid \
            and m['nombre'] == 'cuadrito.png' and m['de'] == 'ana@og.hn', \
            'el adjunto no llegó entero: %s' % m

        st, r = post(base, '/conversaciones', dict(f_beto))
        assert st == 200 and len(r['conversaciones']) == 1, '/conversaciones: %s %s' % (st, r)
        u = r['conversaciones'][0]['ultimo']
        assert u['tipo'] == 'imagen' and u['archivo'] == iid and u['nombre'] == 'cuadrito.png', \
            "el 'ultimo' perdió el adjunto: %s" % u

        # 4) lo que debe rebotar, rebota
        try:
            with ABRIR(base + '/archivo/' + 'f' * 32, timeout=5) as resp:
                st = resp.status
        except urllib.error.HTTPError as e:
            st = e.code
        assert st == 404, 'id desconocido debía dar 404, dio %s' % st

        gordo = base64.b64encode(b'\x00' * 8_100_000).decode()
        st, r = post(base, '/subir', dict(f_ana, nombre='gordo.bin',
                     tipo='archivo', mime='application/octet-stream', datos=gordo))
        assert st == 413, 'un adjunto de 8.1MB debía dar 413, dio %s %s' % (st, r)

        st, r = post(base, '/enviar', dict(f_ana, para='beto@og.hn', texto='',
                     tipo='imagen', archivo='a' * 32, nombre='fantasma.png'))
        assert st == 400, 'adjunto inventado sin texto debía dar 400, dio %s' % st

        print('TODO BIEN: subida, bajada byte a byte, mensaje con adjunto entero, y rechazos correctos.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == '__main__':
    main()
