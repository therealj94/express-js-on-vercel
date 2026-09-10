#!/usr/bin/env python3
"""Lo que le faltaba al relevo para que la app quede a la par de la web.

  · una REACCIÓN viaja en sobre (`cif`) y el relevo la guarda opaca: ni el
    emoji ni nada legible queda en el disco; `quitar` la saca, y el emoji en
    claro de los clientes viejos sigue andando con su «tocar otra vez quita»;
  · la bandeja dice HASTA CUÁNDO LEYÓ la otra persona (`leidoHasta`), que es
    lo que pinta el doble check — una fecha, sin contenido;
  · la bandeja se PAGINA hacia atrás con `antes` y dice si `hayMas`;
  · y el timbre de una llamada se empuja a quien SOLO sondea la bandeja —la
    app— porque sondear no es poder recibir una llamada: antes contaba como
    «presente», el push se ahorraba y el teléfono no sonaba nunca.
"""
import json, os, subprocess, sys, tempfile, threading, time
import urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import socket as _socket

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')


def _puerto_libre():
    s = _socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


PUERTO = _puerto_libre()
PUERTO_EXPO = _puerto_libre()
BASE = f'http://127.0.0.1:{PUERTO}'
DATOS = None

fallos = []


def ok(que, cond, extra=''):
    print(f"{'  ok  ' if cond else ' FALLA'}  {que}" + (f'  · {extra}' if extra else ''))
    if not cond:
        fallos.append(que)


def pedir(ruta, cuerpo, espera=20):
    req = urllib.request.Request(BASE + ruta, method='POST',
                                 data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=espera) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


# ── la red de Expo, de mentira: solo cuenta lo que le llega ──────────────────
enviados = []


class Expo(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        cuerpo = json.loads(self.rfile.read(n) or b'[]')
        enviados.extend(cuerpo)
        resp = json.dumps({'data': [{'status': 'ok'} for _ in cuerpo]}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    def log_message(self, *a):
        pass


expo = ThreadingHTTPServer(('127.0.0.1', PUERTO_EXPO), Expo)
threading.Thread(target=expo.serve_forever, daemon=True).start()

tmp = tempfile.mkdtemp()
DATOS = os.path.join(tmp, 'd.json')
proc = subprocess.Popen([sys.executable, SERVIDOR],
                        env={**os.environ, 'MENSAJES_DATOS': DATOS,
                             'MENSAJES_PUERTO': str(PUERTO),
                             'MENSAJES_ARCHIVOS': os.path.join(tmp, 'arch'),
                             'MENSAJES_EXPO_URL': f'http://127.0.0.1:{PUERTO_EXPO}/push',
                             'HTTP_PROXY': '', 'HTTPS_PROXY': '', 'http_proxy': '', 'https_proxy': ''},
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(40):
        time.sleep(0.25)
        try:
            urllib.request.urlopen(BASE + '/salud', timeout=2); break
        except Exception:
            pass

    A = {'correo': 'ana@ordenglobal.link', 'llave': pedir('/alta', {'correo': 'ana@ordenglobal.link'})[1]['llave']}
    B = {'correo': 'beto@ordenglobal.link', 'llave': pedir('/alta', {'correo': 'beto@ordenglobal.link'})[1]['llave']}
    pedir('/amistad/pedir', dict(A, para=B['correo']))
    pedir('/amistad/responder', dict(B, de=A['correo'], aceptar=True))

    # Un bulto con la forma de los de verdad. Al relevo le da igual qué hay
    # dentro: solo transporta.
    def bulto(marca):
        return {'v': 2, 'de': 'PUB', 'iv': 'IV', 'ct': 'CT-' + marca,
                's': [{'a': 'ap1', 'iv': 'x', 'k': 'y'}]}

    print('\nLA REACCIÓN VIAJA CERRADA\n')
    c, r = pedir('/enviar', dict(A, para=B['correo'], cif=bulto('hola')))
    mid = r['id']
    c, r = pedir('/reaccion', dict(B, id=mid, cif=bulto('corazon')))
    ok('el relevo la acepta', c == 200, json.dumps(r))
    ok('y la devuelve tal cual, por persona', r.get('reacciones', {}).get(B['correo'], {}).get('cif', {}).get('ct') == 'CT-corazon')
    disco = open(DATOS, encoding='utf-8').read()
    ok('en el disco no hay ningún emoji ni «corazon» en claro', '❤' not in disco and '"corazon"' not in disco)
    ok('lo que hay es el bulto opaco', 'CT-corazon' in disco)
    c, r = pedir('/bandeja', dict(A, desde=B['correo']))
    m = next(x for x in r['mensajes'] if x['id'] == mid)
    ok('la bandeja la trae dentro del mensaje', m.get('reacciones', {}).get(B['correo'], {}).get('cif', {}).get('ct') == 'CT-corazon')
    c, r = pedir('/reaccion', dict(B, id=mid, cif=bulto('risa')))
    ok('otra reacción reemplaza la anterior (una por persona)', r['reacciones'][B['correo']]['cif']['ct'] == 'CT-risa')
    c, r = pedir('/reaccion', dict(B, id=mid, quitar=True))
    ok('«quitar» la saca', c == 200 and B['correo'] not in r.get('reacciones', {}), json.dumps(r))
    c, r = pedir('/reaccion', dict(B, id=mid, cif={'ct': 'x'}))
    ok('un bulto sin sobres se rechaza', c == 400, json.dumps(r))
    c, r = pedir('/reaccion', dict(B, id=mid, cif={'ct': 'x', 's': [1], 'relleno': 'z' * 70000}))
    # 413 si lo para el tope del POST antes, 400 si llega hasta la ruta: las
    # dos son «no entra», y es lo único que importa.
    ok('y uno enorme también', c in (400, 413), str(c))

    print('\nEL EMOJI EN CLARO DE LOS CLIENTES VIEJOS SIGUE ANDANDO\n')
    c, r = pedir('/reaccion', dict(A, id=mid, emoji='👍'))
    ok('se guarda como texto', r['reacciones'][A['correo']] == '👍')
    c, r = pedir('/reaccion', dict(A, id=mid, emoji='👍'))
    ok('tocar la misma la quita', A['correo'] not in r.get('reacciones', {}))
    C = {'correo': 'carla@ordenglobal.link', 'llave': pedir('/alta', {'correo': 'carla@ordenglobal.link'})[1]['llave']}
    c, r = pedir('/reaccion', dict(C, id=mid, cif=bulto('ajena')))
    ok('quien no es del hilo no puede reaccionar', c == 403)

    print('\nHASTA DÓNDE LEYÓ LA OTRA PERSONA\n')
    c, r = pedir('/bandeja', dict(A, desde=B['correo']))
    ok('sin que Beto abra el hilo, leidoHasta es 0', r.get('leidoHasta') == 0, json.dumps(r.get('leidoHasta')))
    antes_de_leer = int(time.time() * 1000)
    pedir('/leido', dict(B, de=A['correo']))
    c, r = pedir('/bandeja', dict(A, desde=B['correo']))
    ok('cuando Beto marca leído, Ana ve la fecha', r.get('leidoHasta', 0) >= antes_de_leer)
    ok('y cubre el mensaje mandado antes', r['leidoHasta'] >= m['cuando'])
    c, r = pedir('/enviar', dict(A, para=B['correo'], cif=bulto('despues')))
    c, r2 = pedir('/bandeja', dict(A, desde=B['correo']))
    ultimo = r2['mensajes'][-1]
    ok('pero NO el mandado después de leer', r2['leidoHasta'] < ultimo['cuando'])
    ok('la fecha no lleva contenido: es un número', isinstance(r2['leidoHasta'], int))

    print('\nLA BANDEJA SE PAGINA HACIA ATRÁS\n')
    for i in range(230):
        pedir('/enviar', dict(A if i % 2 else B, para=(B if i % 2 else A)['correo'], texto=f'm{i}'))
    c, r = pedir('/bandeja', dict(A, desde=B['correo']))
    ok('la primera página son los últimos 200', len(r['mensajes']) == 200, str(len(r['mensajes'])))
    ok('y dice que hay más atrás', r.get('hayMas') is True)
    mas_viejo = r['mensajes'][0]['cuando']
    c, r2 = pedir('/bandeja', dict(A, desde=B['correo'], antes=mas_viejo))
    ok('con `antes` llega la página anterior', 0 < len(r2['mensajes']) < 200, str(len(r2['mensajes'])))
    ok('toda anterior al corte', all(x['cuando'] < mas_viejo for x in r2['mensajes']))
    ok('sin repetir ninguno', not {x['id'] for x in r2['mensajes']} & {x['id'] for x in r['mensajes']})
    ok('y ahí ya no hay más', r2.get('hayMas') is False)
    c, r3 = pedir('/bandeja', dict(A, desde=B['correo'], antes='basura'))
    ok('un `antes` ilegible se ignora y da lo último', len(r3['mensajes']) == 200)

    print('\nLA LLAMADA LE SUENA A QUIEN SOLO SONDEA LA BANDEJA\n')
    pedir('/suscribir', dict(B, expo='ExponentPushToken[beto-telefono]'))
    # Beto tiene la app abierta en el hilo: sondea la bandeja, NO escucha señales.
    pedir('/bandeja', dict(B, desde=A['correo']))
    del enviados[:]
    pedir('/enviar', dict(A, para=B['correo'], texto='hola'))
    time.sleep(0.8)
    ok('un mensaje NO se le empuja: lo está viendo', not enviados)
    pedir('/senal', dict(A, para=B['correo'], tipo='llamo', datos={'video': False}))
    time.sleep(0.8)
    ok('pero el timbre de la llamada SÍ', len(enviados) == 1, json.dumps(enviados))
    ok('por el canal de llamadas', enviados and enviados[0].get('channelId') == 'llamadas')
    # Y quien escucha el buzón recibe el timbre por la señal: ahí no se empuja.
    del enviados[:]
    h = threading.Thread(target=lambda: pedir('/senales', dict(B), espera=40))
    h.start(); time.sleep(0.5)
    pedir('/senal', dict(A, para=B['correo'], tipo='llamo', datos={'video': False}))
    h.join(timeout=10)
    time.sleep(0.5)
    ok('a quien escucha el buzón no se le duplica el aviso', not enviados)
finally:
    proc.terminate()
    expo.shutdown()

print(f'\n{len(fallos)} en rojo\n' if fallos else '\nTodo en verde\n')
sys.exit(1 if fallos else 0)
