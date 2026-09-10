#!/usr/bin/env python3
"""Prueba de punta a punta del GID (Genesis ID) en infra/mensajes/servidor.py.

── LO QUE CAMBIÓ, Y POR QUÉ ESTA PRUEBA SE REESCRIBIÓ ENTERA ────────────────

La versión anterior comprobaba que «/alta acepta un gid opcional y /ficha lo
devuelve tal cual lo declaró su dueño» y que «/perfil cambia el gid». Eso era
el contrato — y era el agujero: el GID es lo que en el chat dice «esta persona
está verificada», y lo escribía el propio cliente como texto libre. Cualquiera
podía ponerse el GID de otro y salir verificado. Genesis ID tiene motor de
verdad (documento, cara, prueba de vida, OFAC) y el chat lo tiraba en la
puerta.

Ahora el relevo le pregunta a Genesis por la sesión de la wallet
(`/genesis/gid` en el backend, de solo lectura, con el mismo token) y lo que venga en el
cuerpo se ignora SIEMPRE. Lo que esta prueba necesita que sea verdad:

  1. con sesión de una identidad VERIFICADA, /alta pone el GID que dice
     Genesis, aunque el cliente declare otro;
  2. /buscar encuentra a la persona por el PRINCIPIO de ese GID, en
     minúsculas, y trae nombre y gid;
  3. /perfil ya no puede cambiarlo;
  4. repetir /alta sólo con la llave del relevo (sin sesión) no lo toca;
  5. una cuenta SIN identidad queda sin GID aunque declare uno, y sigue
     funcionando en /alta, /buscar y /ficha.

Se levanta el relevo REAL y un backend de wallet DE MENTIRA que conoce dos
sesiones: Ana (verificada, GEN-TEST-ANA1-X) y Beto (sin identidad).
"""
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')

# opener sin proxy: la máquina de pruebas puede tener HTTPS_PROXY global y
# esto habla con 127.0.0.1 directamente
ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({})).open

SESIONES = {'sesion-de-ana': 'ana@og.hn', 'sesion-de-beto': 'beto@og.hn'}
GID_ANA = 'GEN-TEST-ANA1-X'


class WalletFalsa(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, codigo, obj):
        cuerpo = json.dumps(obj).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        token = (self.headers.get('Authorization') or '').replace('Bearer ', '')
        correo = SESIONES.get(token)
        if self.path.endswith('/users/userDate'):
            return self._json(200 if correo else 401,
                              {'email': correo} if correo else {'message': 'invalid token'})
        if self.path.endswith('/genesis/gid'):
            if correo == 'ana@og.hn':
                return self._json(200, {'estado': 'verificada', 'gid': GID_ANA})
            return self._json(404 if correo else 401, {'error': 'sin identidad'})
        self.send_response(404); self.end_headers()


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


def main():
    tmp = tempfile.mkdtemp(prefix='mensajes-gid-')
    puerto = puerto_libre()
    p_wallet = puerto_libre()
    base = 'http://127.0.0.1:%d' % puerto

    wallet = HTTPServer(('127.0.0.1', p_wallet), WalletFalsa)
    threading.Thread(target=wallet.serve_forever, daemon=True).start()

    env = dict(os.environ, MENSAJES_DATOS=os.path.join(tmp, 'datos.json'),
               MENSAJES_PUERTO=str(puerto),
               MENSAJES_WALLET_URL='http://127.0.0.1:%d' % p_wallet)
    proc = subprocess.Popen([sys.executable, SERVIDOR], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try:
                with ABRIR(base + '/salud', timeout=2) as r:
                    if json.loads(r.read()).get('vivo'):
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise SystemExit('el servidor nunca contestó /salud')

        # 1) Ana, verificada: el GID es el de Genesis, no el declarado
        st, r = post(base, '/alta', {'correo': 'ana@og.hn', 'nombre': 'Ana',
                                     'sesion': 'sesion-de-ana', 'gid': 'GEN-FAKE-FAKE-X'})
        assert st == 200 and r.get('llave'), '/alta de Ana: %s %s' % (st, r)
        ana = {'correo': 'ana@og.hn', 'llave': r['llave']}
        st, r = post(base, '/ficha', dict(ana, de='ana@og.hn'))
        assert st == 200 and r.get('gid') == GID_ANA and r.get('nombre') == 'Ana', \
            'la ficha tiene que traer el GID de Genesis: %s %s' % (st, r)

        # 5a) Beto, sin identidad: aunque declare el GID de Ana, queda sin GID
        st, r = post(base, '/alta', {'correo': 'beto@og.hn', 'nombre': 'Beto',
                                     'sesion': 'sesion-de-beto', 'gid': GID_ANA})
        assert st == 200 and r.get('llave'), '/alta de Beto: %s %s' % (st, r)
        beto = {'correo': 'beto@og.hn', 'llave': r['llave']}
        st, r = post(base, '/ficha', dict(beto, de='beto@og.hn'))
        assert st == 200 and not r.get('gid'), \
            'Beto se puso el GID de Ana y el relevo se lo creyó: %s' % r

        # se hacen amigos para poder buscarse y verse la ficha
        post(base, '/amistad/pedir', dict(ana, para='beto@og.hn'))
        post(base, '/amistad/responder', dict(beto, de='ana@og.hn', aceptar=True))

        # 2) buscar por el PRINCIPIO del GID en minúsculas encuentra a Ana
        st, r = post(base, '/buscar', dict(beto, q='gen-test'))
        assert st == 200, '/buscar por gid: %s %s' % (st, r)
        assert [x['correo'] for x in r['gente']] == ['ana@og.hn'], \
            'el prefijo del gid debía dar con Ana: %s' % r['gente']
        assert r['gente'][0]['nombre'] == 'Ana' and r['gente'][0]['gid'] == GID_ANA, \
            'el resultado debe traer nombre y gid: %s' % r['gente'][0]
        st, r = post(base, '/buscar', dict(beto, q='ana1'))
        assert r['gente'] == [], 'el gid es empieza-por, no contiene: %s' % r['gente']
        # y por el GID que Beto intentó apropiarse no aparece Beto
        st, r = post(base, '/buscar', dict(ana, q='gen-test'))
        assert 'beto@og.hn' not in [x['correo'] for x in r['gente']], \
            'Beto aparece con el GID de Ana: %s' % r['gente']

        # 3) /perfil ya no cambia el GID
        st, r = post(base, '/perfil', dict(ana, gid='GEN-OTRO-OTRO-X'))
        assert st == 200 and r.get('ok'), '/perfil: %s %s' % (st, r)
        st, r = post(base, '/ficha', dict(ana, de='ana@og.hn'))
        assert r.get('gid') == GID_ANA, '/perfil dejó cambiar el GID: %s' % r

        # 4) repetir /alta sólo con la llave (sin sesión) no lo toca
        st, r = post(base, '/alta', dict(ana, nombre='Ana G.', gid=''))
        assert st == 200, '/alta con llave: %s %s' % (st, r)
        st, r = post(base, '/ficha', dict(ana, de='ana@og.hn'))
        assert r.get('gid') == GID_ANA and r.get('nombre') == 'Ana G.', \
            'sin sesión el GID no se toca (y el nombre sí): %s' % r

        # 5b) una cuenta sin GID sigue entera: buscar por nombre y ficha
        st, r = post(base, '/buscar', dict(ana, q='beto'))
        assert st == 200 and [x['correo'] for x in r['gente']] == ['beto@og.hn'], \
            'buscar a Beto por nombre: %s %s' % (st, r)
        assert r['gente'][0].get('gid', '') == '', 'Beto no tiene GID: %s' % r['gente'][0]
        st, r = post(base, '/ficha', dict(ana, de='beto@og.hn'))
        assert st == 200 and r.get('nombre') == 'Beto' and r.get('gid', '') == '', \
            'ficha de Beto sin gid: %s %s' % (st, r)

        print('TODO BIEN: el GID lo pone Genesis por la sesión, el cliente no puede '
              'declararlo ni cambiarlo, se busca por prefijo, y una cuenta sin '
              'identidad sigue funcionando sin GID.')
        return 0
    finally:
        proc.terminate()
        proc.wait(timeout=5)
        wallet.shutdown()


if __name__ == '__main__':
    sys.exit(main())
