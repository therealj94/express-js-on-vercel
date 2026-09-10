#!/usr/bin/env python3
"""Prueba del rescate de la llave por sesión de la wallet (servidor.py).

El fallo que esto vigila: la llave del relevo se acuña UNA vez y se la queda
el primer dispositivo; el segundo recibía un 409 eterno aunque fuera la MISMA
persona con la MISMA cuenta. El arreglo: /alta acepta un campo `sesion` (el
JWT de la wallet), el relevo le pregunta al backend de quién es, y al dueño
demostrado le devuelve su llave EXISTENTE.

Se levanta el relevo REAL y un backend de wallet DE MENTIRA en otro puerto,
con MENSAJES_WALLET_URL apuntando ahí. Lo que tiene que ser verdad:

  1. el alta clásica sigue exactamente igual (nada de esto es obligatorio);
  2. un segundo dispositivo CON sesión válida del mismo correo recibe la
     MISMA llave — no una nueva, porque una nueva mataría al primero;
  3. una sesión de OTRO correo no sirve: 409 como siempre;
  4. una sesión que el backend rechaza (401) no sirve: 409;
  5. con el backend caído tampoco se rompe nada: 409, no un error raro;
  6. la llave del primer dispositivo sigue funcionando después de todo esto.

Sin dependencias fuera de la stdlib.
"""
import json, os, socket, subprocess, sys, tempfile, threading, time
import urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')
ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({})).open


def puerto_libre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


# ── el backend de la wallet, de mentira ─────────────────────────────────────
# Conoce dos sesiones: 'sesion-de-ana' → ana@... y 'sesion-de-beto' → beto@...
# Cualquier otra cosa, 401 — igual que el de verdad.
SESIONES = {'sesion-de-ana': 'ana@prueba.local', 'sesion-de-beto': 'beto@prueba.local'}


class WalletFalsa(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        token = (self.headers.get('Authorization') or '').replace('Bearer ', '')
        correo = SESIONES.get(token)
        # El puente de Genesis, de mentira: Ana esta verificada, Beto no tiene
        # identidad. Es lo que decide el GID del chat — no lo que mande nadie.
        if self.path.endswith('/genesis/gid'):
            if correo == 'ana@prueba.local':
                cuerpo = json.dumps({'estado': 'verificada', 'gid': 'GEN-TEST-ANA1-X'}).encode()
                self.send_response(200)
            else:
                cuerpo = b'{"error":"sin identidad"}'
                self.send_response(404 if correo else 401)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(cuerpo)))
            self.end_headers(); self.wfile.write(cuerpo); return
        if not self.path.endswith('/users/userDate'):
            self.send_response(404); self.end_headers(); return
        cuerpo = json.dumps({'email': correo} if correo else {'message': 'invalid token'}).encode()
        self.send_response(200 if correo else 401)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)


def pedir(base, ruta, cuerpo):
    pet = urllib.request.Request(base + ruta, data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with ABRIR(pet, timeout=10) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def main():
    carpeta = tempfile.mkdtemp(prefix='relevo-sesion-')
    p_wallet = puerto_libre()
    p_relevo = puerto_libre()

    wallet = ThreadingHTTPServer(('127.0.0.1', p_wallet), WalletFalsa)
    threading.Thread(target=wallet.serve_forever, daemon=True).start()

    env = dict(os.environ,
               MENSAJES_DATOS=os.path.join(carpeta, 'datos.json'),
               MENSAJES_PUERTO=str(p_relevo),
               MENSAJES_WALLET_URL='http://127.0.0.1:%d' % p_wallet)
    # sin proxy: esto habla consigo mismo
    for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'):
        env.pop(k, None)
    relevo = subprocess.Popen([sys.executable, SERVIDOR], env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = 'http://127.0.0.1:%d' % p_relevo
    time.sleep(1.2)

    try:
        # 1 · el alta clasica, intacta
        e, d = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'nombre': 'Ana'})
        assert e == 200 and d.get('llave'), 'el alta clasica se rompio: %s %s' % (e, d)
        llave1 = d['llave']

        # y el 409 clasico tambien: otro dispositivo SIN nada, portazo
        e, d = pedir(base, '/alta', {'correo': 'ana@prueba.local'})
        assert e == 409, 'el 409 clasico desaparecio: %s' % e

        # 2 · el segundo dispositivo, con su sesion: la MISMA llave
        e, d = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'sesion': 'sesion-de-ana'})
        assert e == 200, 'la sesion valida no rescato la llave: %s %s' % (e, d)
        assert d['llave'] == llave1, 'devolvio una llave NUEVA: eso mata al primer dispositivo'

        # 3 · la sesion de OTRO no abre este buzon
        e, d = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'sesion': 'sesion-de-beto'})
        assert e == 409, 'la sesion de beto abrio el buzon de ana: %s' % e

        # 4 · una sesion que el backend rechaza, tampoco
        e, d = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'sesion': 'inventada'})
        assert e == 409, 'una sesion invalida abrio el buzon: %s' % e

        # ── EL GID LO DICE GENESIS, NO EL CLIENTE ──────────────────────
        # Antes `/alta` y `/perfil` guardaban `gid` como texto libre y la
        # busqueda por GID buscaba sobre eso: cualquiera se ponia el GID de
        # otro y salia «verificado». Ahora se le pregunta a Genesis por la
        # sesion, y lo que venga en el cuerpo se ignora.
        e, d = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'sesion': 'sesion-de-ana',
                                     'gid': 'GEN-FAKE-FAKE-X'})
        assert e == 200, 'alta de Ana con sesion: %s %s' % (e, d)
        llave_ana = d['llave']
        e, f = pedir(base, '/ficha', {'correo': 'ana@prueba.local', 'llave': llave_ana,
                                      'de': 'ana@prueba.local'})
        assert e == 200 and f.get('gid') == 'GEN-TEST-ANA1-X', \
            'el GID tiene que ser el de Genesis, no el declarado: %s %s' % (e, f)
        # /perfil ya no acepta gid: se ignora
        e, _ = pedir(base, '/perfil', {'correo': 'ana@prueba.local', 'llave': llave_ana,
                                       'gid': 'GEN-OTRO-OTRO-X'})
        assert e == 200
        e, f = pedir(base, '/ficha', {'correo': 'ana@prueba.local', 'llave': llave_ana,
                                      'de': 'ana@prueba.local'})
        assert f.get('gid') == 'GEN-TEST-ANA1-X', '/perfil dejo cambiar el GID: %s' % f
        # Beto no tiene identidad: aunque declare uno, queda sin GID
        e, d = pedir(base, '/alta', {'correo': 'beto@prueba.local', 'sesion': 'sesion-de-beto',
                                     'gid': 'GEN-TEST-ANA1-X'})
        assert e == 200, 'alta de Beto: %s %s' % (e, d)
        e, f = pedir(base, '/ficha', {'correo': 'beto@prueba.local', 'llave': d['llave'],
                                      'de': 'beto@prueba.local'})
        assert e == 200 and not f.get('gid'), \
            'Beto se puso el GID de Ana y el relevo se lo creyo: %s' % f
        # Y sin sesion, lo que ya tenia la ficha no se toca
        e, d = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'llave': llave_ana, 'gid': ''})
        assert e == 200
        e, f = pedir(base, '/ficha', {'correo': 'ana@prueba.local', 'llave': llave_ana,
                                      'de': 'ana@prueba.local'})
        assert f.get('gid') == 'GEN-TEST-ANA1-X', 'sin sesion no se debe tocar el GID: %s' % f

        # 5 · backend caido: 409 limpio, nada de errores raros
        wallet.shutdown()
        e, d = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'sesion': 'sesion-de-ana'})
        assert e == 409, 'con el backend caido no dio el 409 de siempre: %s' % e

        # 6 · la llave del primer dispositivo sigue viva
        e, d = pedir(base, '/conversaciones', {'correo': 'ana@prueba.local', 'llave': llave1})
        assert e == 200, 'la llave original dejo de servir: %s' % e

        print('TODO BIEN: el alta clasica intacta, la sesion valida rescata la MISMA llave, '
              'la ajena y la invalida no, el backend caido degrada al 409 de siempre, '
              'y la llave original sigue viva. Y el GID lo pone Genesis, no el cliente.')
        return 0
    finally:
        relevo.terminate()


if __name__ == '__main__':
    sys.exit(main())
