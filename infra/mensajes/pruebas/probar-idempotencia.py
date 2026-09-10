#!/usr/bin/env python3
"""Dos toques, un mensaje.

Si la red corta después de guardar y la app reintenta con el mismo idCliente,
el relevo tiene que devolver el que ya está — no nacer otro. Sin esto, cada
parpadeo duplica la burbuja.
"""
import json, os, socket, subprocess, sys, tempfile, time
import urllib.error, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')
ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({})).open


def puerto_libre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def pedir(base, ruta, cuerpo):
    pet = urllib.request.Request(base + ruta, data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with ABRIR(pet, timeout=10) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def main():
    carpeta = tempfile.mkdtemp(prefix='relevo-eco-')
    p = puerto_libre()
    env = dict(os.environ,
               MENSAJES_DATOS=os.path.join(carpeta, 'datos.json'),
               MENSAJES_ARCHIVOS=os.path.join(carpeta, 'archivos'),
               MENSAJES_PUERTO=str(p))
    for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'):
        env.pop(k, None)
    relevo = subprocess.Popen([sys.executable, SERVIDOR], env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = 'http://127.0.0.1:%d' % p
    time.sleep(1.2)
    fallos = 0

    def ok(q, c, x=''):
        nonlocal fallos
        print(('  ok  ' if c else ' FALLA') + '  ' + q + (('  · ' + x) if x else ''))
        if not c:
            fallos += 1

    try:
        _, a = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'nombre': 'Ana'})
        _, bo = pedir(base, '/alta', {'correo': 'beto@prueba.local', 'nombre': 'Beto'})
        ana = {'correo': 'ana@prueba.local', 'llave': a['llave']}
        beto = {'correo': 'beto@prueba.local', 'llave': bo['llave']}
        pedir(base, '/amistad/pedir', {**ana, 'para': 'beto@prueba.local'})
        pedir(base, '/amistad/responder', {**beto, 'de': 'ana@prueba.local', 'aceptar': True})

        e1, d1 = pedir(base, '/enviar', {**ana, 'para': beto['correo'],
                                         'texto': 'hola', 'idCliente': 'abc123abc123abc123abc123'})
        e2, d2 = pedir(base, '/enviar', {**ana, 'para': beto['correo'],
                                         'texto': 'hola', 'idCliente': 'abc123abc123abc123abc123'})
        ok('el primer envío entra', e1 == 200 and d1.get('id'), str(d1))
        ok('el reintento contesta 200', e2 == 200, str(d2))
        ok('devuelve el mismo id', d1.get('id') == d2.get('id'), '%s vs %s' % (d1.get('id'), d2.get('id')))
        ok('marca eco', d2.get('eco') is True, str(d2))

        e3, d3 = pedir(base, '/enviar', {**ana, 'para': beto['correo'],
                                         'texto': 'hola', 'idCliente': 'otro-id-distinto-0001'})
        ok('otro idCliente sí nace otro mensaje', d3.get('id') and d3.get('id') != d1.get('id'), str(d3))

        e, bandeja = pedir(base, '/bandeja', {**beto, 'desde': ana['correo']})
        n = len(bandeja.get('mensajes') or [])
        ok('en la bandeja hay dos, no tres', n == 2, str(n))
    finally:
        relevo.kill()
        relevo.wait()

    if fallos:
        print('%d comprobación(es) fallaron' % fallos)
        return 1
    print('ok · dos toques, un mensaje')
    return 0


if __name__ == '__main__':
    sys.exit(main())
