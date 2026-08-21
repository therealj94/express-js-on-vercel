#!/usr/bin/env python3
"""El buzón de señales de las llamadas.

Lo que se comprueba no es que funcione a secas: es que la espera larga NO
congele el resto del relevo. Ese es el fallo que tumbaría el chat entero
mientras alguien llama, y no se ve hasta que pasa en producción.
"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')
PUERTO = 8399
BASE = f'http://127.0.0.1:{PUERTO}'

fallos = []
def ok(que, cond, extra=''):
    print(f"{'  ok  ' if cond else ' FALLA'}  {que}" + (f'  · {extra}' if extra else ''))
    if not cond:
        fallos.append(que)

def pedir(ruta, cuerpo, espera=40):
    req = urllib.request.Request(BASE + ruta, method='POST',
                                 data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=espera) as r:
        return json.loads(r.read())

tmp = tempfile.mkdtemp()
proc = subprocess.Popen([sys.executable, SERVIDOR],
                        env={**os.environ, 'MENSAJES_DATOS': os.path.join(tmp, 'd.json'),
                             'MENSAJES_PUERTO': str(PUERTO),
                             'MENSAJES_ARCHIVOS': os.path.join(tmp, 'arch')},
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(40):
        time.sleep(0.25)
        try:
            urllib.request.urlopen(BASE + '/salud', timeout=2); break
        except Exception:
            pass

    ana = pedir('/alta', {'correo': 'ana@ordenglobal.link'})['llave']
    beto = pedir('/alta', {'correo': 'beto@ordenglobal.link'})['llave']
    A = {'correo': 'ana@ordenglobal.link', 'llave': ana}
    B = {'correo': 'beto@ordenglobal.link', 'llave': beto}

    # Una llamada hace SONAR un teléfono, así que desde que existe el círculo
    # hace falta que el otro te haya aceptado. Es el mismo paso que da una
    # persona en la app antes de poder llamar a nadie.
    pedir('/amistad/pedir', dict(A, para='beto@ordenglobal.link'))
    pedir('/amistad/responder', dict(B, de='ana@ordenglobal.link', aceptar=True))

    print('\nUna señal llega, y llega rápido\n')
    recibido = {}
    def escucha():
        t0 = time.time()
        r = pedir('/senales', dict(B), espera=40)
        recibido['tarde'] = time.time() - t0
        recibido['senales'] = r.get('senales', [])
    h = threading.Thread(target=escucha); h.start()
    time.sleep(0.6)                       # Beto ya está esperando
    pedir('/senal', dict(A, para='beto@ordenglobal.link', tipo='llamo', datos={'video': True}))
    h.join(timeout=10)
    ok('la señal llega', len(recibido.get('senales', [])) == 1, json.dumps(recibido.get('senales')))
    ok('llega en menos de un segundo', recibido.get('tarde', 99) < 1.5,
       f"{recibido.get('tarde', 0):.2f}s")
    ok('dice quién llama', recibido['senales'][0]['de'] == 'ana@ordenglobal.link')
    ok('trae los datos', recibido['senales'][0]['datos'] == {'video': True})

    print('\nEL CHAT NO SE CONGELA MIENTRAS ALGUIEN ESPERA\n')
    esperando = threading.Thread(target=lambda: pedir('/senales', dict(A), espera=40))
    esperando.start()
    time.sleep(0.5)
    t0 = time.time()
    pedir('/enviar', dict(B, para='ana@ordenglobal.link', texto='hola'))
    tardo = time.time() - t0
    ok('mandar un mensaje sigue siendo instantáneo', tardo < 1.5, f'{tardo:.2f}s')
    t0 = time.time()
    pedir('/bandeja', dict(B, desde='ana@ordenglobal.link'))
    ok('leer la bandeja también', time.time() - t0 < 1.5, f'{time.time()-t0:.2f}s')
    pedir('/senal', dict(B, para='ana@ordenglobal.link', tipo='cuelgo', datos={}))
    esperando.join(timeout=10)

    print('\nLo que se rechaza\n')
    try:
        pedir('/senal', dict(A, para='beto@ordenglobal.link', tipo='inventado', datos={}))
        ok('un tipo inventado se rechaza', False)
    except urllib.error.HTTPError as e:
        ok('un tipo inventado se rechaza', e.code == 400)
    try:
        pedir('/senal', dict(A, para='beto@ordenglobal.link', tipo='ice',
                             datos={'x': 'y' * 20000}))
        ok('una señal enorme se rechaza', False)
    except urllib.error.HTTPError as e:
        ok('una señal enorme se rechaza', e.code == 413)
    try:
        pedir('/senal', {'correo': 'ana@ordenglobal.link', 'llave': 'inventada',
                         'para': 'beto@ordenglobal.link', 'tipo': 'ice', 'datos': {}})
        ok('sin la llave no se puede señalar', False)
    except urllib.error.HTTPError as e:
        ok('sin la llave no se puede señalar', e.code == 401)

    print('\nSin nada que recoger, la espera termina sola\n')
    t0 = time.time()
    r = pedir('/senales', dict(A), espera=40)
    tardo = time.time() - t0
    ok('vuelve vacía tras la espera', r.get('senales') == [], json.dumps(r))
    ok('y no se queda colgada para siempre', 20 < tardo < 32, f'{tardo:.1f}s')
finally:
    proc.terminate()

print(f'\n{len(fallos)} en rojo\n' if fallos else '\nTodo en verde\n')
sys.exit(1 if fallos else 0)
