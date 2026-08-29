#!/usr/bin/env python3
"""EL GLOBO QUE CRECE: /editar y la marca «parcial».

Existe para que AU-RA escriba a la vista, como escribe una persona.

Antes: preguntabas, mirabas los tres puntos cinco o seis segundos, y la
respuesta aparecía entera de golpe. Mandar cada frase por separado ya se
probó y fue peor —cinco o seis globos por una sola pregunta, que no es como
contesta nadie—. Lo que hace cualquier chat es UN globo que crece, y eso
pide poder cambiar un mensaje que ya salió.

Lo que se prueba aquí es sobre todo lo que la ruta NO deja hacer: editar el
mensaje de otro, cambiar de quién es, o abrir uno cerrado.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.request

AQUI = pathlib.Path(__file__).resolve().parent
SERVIDOR = AQUI.parent / 'servidor.py'
# EL PUERTO SE LO PIDE AL SISTEMA, no se escribe a mano.
#
# Aca decia 8791, que es EXACTAMENTE donde el CI levanta el servidor estatico
# para las pruebas de navegador. Cuando los dos coinciden, el relevo no llega a
# levantar, `/alta` le pega al servidor de ficheros, contesta un 404 en HTML y
# la prueba muere con «Expecting value: line 1 column 1». No decia «puerto
# ocupado» por ningun lado: parecia que el relevo estaba roto.
#
# Las demas pruebas de esta carpeta llevan cada una su numero (8399, 8402,
# 8407, 8417), lo cual funciona pero se rompe sola en cuanto dos coinciden. Se
# pide uno libre y se acabo el problema para siempre.
import socket as _socket

def _puerto_libre():
    s = _socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p

PUERTO = int(os.environ.get('PUERTO_PRUEBA') or _puerto_libre())
BASE = f'http://127.0.0.1:{PUERTO}'
mal = 0


def ok(cierto, nombre, detalle=''):
    global mal
    if cierto:
        print('  ok    ' + nombre)
    else:
        mal += 1
        print('  FALLA ' + nombre + (('\n          ' + detalle) if detalle else ''))


def post(ruta, cuerpo):
    req = urllib.request.Request(BASE + ruta, method='POST',
                                 data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def alta(correo):
    _, d = post('/alta', {'correo': correo, 'nombre': correo.split('@')[0]})
    return {'correo': correo, 'llave': d['llave']}


def hilo(quien, con):
    _, d = post('/bandeja', {**quien, 'desde': con['correo']})
    return d.get('mensajes', [])


datos = pathlib.Path(tempfile.mkdtemp()) / 'datos.json'
proc = subprocess.Popen([sys.executable, str(SERVIDOR)],
                        env={**os.environ, 'MENSAJES_DATOS': str(datos),
                             'MENSAJES_PUERTO': str(PUERTO)},
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE + '/salud', timeout=1)
            break
        except Exception:
            time.sleep(0.2)

    ana = alta('ana@prueba.local')
    zoe = alta('zoe@prueba.local')
    post('/amistad/pedir', {**ana, 'para': zoe['correo']})
    post('/amistad/responder', {**zoe, 'de': ana['correo'], 'aceptar': True})

    print('\nUn globo que crece')

    code, d = post('/enviar', {**ana, 'para': zoe['correo'],
                               'texto': 'Primera frase.', 'parcial': True})
    mid = d.get('id')
    ok(code == 200 and mid,
       'mandar devuelve el id del mensaje',
       'sin id no hay forma de editarlo después: «el último que mandé» no '
       'aguanta que lleguen otros en el medio')

    ms = hilo(zoe, ana)
    ok(ms and ms[-1].get('parcial') == 1,
       'y llega marcado como que todavía se está escribiendo',
       'sin la marca, quien recibe no distingue media respuesta de una respuesta')

    code, _ = post('/editar', {**ana, 'id': mid,
                               'texto': 'Primera frase. Y la segunda.',
                               'parcial': True})
    ms = hilo(zoe, ana)
    ok(code == 200 and ms[-1]['texto'] == 'Primera frase. Y la segunda.',
       'editarlo cambia el texto del MISMO mensaje')
    ok(len(ms) == 1,
       'y no deja un mensaje nuevo detrás',
       f'hay {len(ms)} mensajes; el punto entero era no llenar el hilo de globos')

    code, _ = post('/editar', {**ana, 'id': mid,
                               'texto': 'Primera frase. Y la segunda. Y el final.'})
    ms = hilo(zoe, ana)
    ok('parcial' not in ms[-1],
       'y al terminar se le quita la marca',
       'si no se quita, la respuesta queda «escribiéndose» para siempre')

    print('\nLo que la ruta NO deja hacer')

    code, _ = post('/editar', {**zoe, 'id': mid, 'texto': 'yo no dije esto'})
    ms = hilo(zoe, ana)
    ok(code == 403 and 'yo no dije esto' not in ms[-1]['texto'],
       'nadie edita el mensaje de otro',
       'poder reescribir lo que dijo otra persona en su propio hilo')

    code, _ = post('/editar', {**ana, 'id': mid, 'texto': ''})
    ok(code == 400, 'no se puede vaciar un mensaje editándolo')

    code, _ = post('/editar', {**ana, 'id': 'noexiste', 'texto': 'hola'})
    ok(code == 404, 'un id que no existe da 404, no un mensaje nuevo')

    antes = hilo(zoe, ana)[-1]
    post('/editar', {**ana, 'id': mid, 'texto': 'otro texto',
                     'de': zoe['correo'], 'para': ana['correo'],
                     'cuando': 1, 'tipo': 'voz', 'archivo': 'x'})
    d2 = hilo(zoe, ana)[-1]
    ok(d2['de'] == antes['de'] and d2['para'] == antes['para']
       and d2['cuando'] == antes['cuando'] and 'archivo' not in d2,
       'editar cambia el TEXTO y nada más',
       'de/para/cuando/adjunto tienen que ser intocables: editar lo que uno '
       'dijo es una cosa, reescribir de quién es un mensaje es otra')

    # la forma que el relevo acepta de verdad: ct + la lista de sobres
    _, d = post('/enviar', {**ana, 'para': zoe['correo'],
                            'cif': {'ct': 'bWVuc2FqZQ==', 's': [{'p': 'x', 'k': 'y'}]}})
    cid = d.get('id')
    code, _ = post('/editar', {**ana, 'id': cid, 'texto': 'en claro'})
    ok(cid and code == 400,
       'un mensaje cerrado no se edita',
       'el texto viaja cifrado y esto no sabe cerrarlo: guardaría claro al '
       'lado de lo cerrado, que es el error más tonto posible')

finally:
    proc.terminate()
    proc.wait(timeout=5)

print(f'\n{mal} mal\n' if mal else '\nTodo en verde\n')
raise SystemExit(1 if mal else 0)
