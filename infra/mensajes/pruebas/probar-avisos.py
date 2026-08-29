#!/usr/bin/env python3
"""El envío de avisos push: que empuje de verdad, firmado de verdad.

El servicio de push de Google no se puede usar en una prueba, así que aquí se
levanta uno FALSO que captura cada POST. Lo que se comprueba no es «la función
no lanza», sino la cadena entera con las reglas del estándar:

  · un mensaje a una persona produce UN POST a su endpoint suscrito;
  · el POST va vacío (sin cuerpo: no viaja ni un dato del mensaje) y con
    Authorization VAPID cuya firma ES256 verifica openssl con la llave real;
  · quien acaba de mirar su bandeja NO recibe empujón (está viendo el chat);
  · una solicitud de amistad también empuja; el timbre de llamada empuja con
    urgencia alta;
  · un endpoint que contesta 410 se poda: a la siguiente no se le insiste.

Sin llave VAPID configurada el relevo no empuja nada y no se cae: también se
comprueba, porque así arranca cualquier despliegue viejo.
"""
import base64, json, os, subprocess, sys, tempfile, threading, time
import urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')
# El puerto se lo pide al sistema en vez de llevarlo escrito.
#
# Con un numero fijo, dos pruebas de esta carpeta no pueden correr a la vez, y
# cualquier cosa que ya este escuchando ahi hace que el relevo no levante. Y no
# falla diciendo «puerto ocupado»: falla contestando lo que sirva el OTRO
# proceso, que suele ser un 404 en HTML, y la prueba muere con un
# «Expecting value: line 1 column 1» que parece que el relevo esta roto.
#
# Ya paso: probar-editar.py llevaba el 8791, que es donde el CI levanta el
# servidor estatico de las pruebas de navegador.
import socket as _socket

def _puerto_libre():
    s = _socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p

PUERTO = _puerto_libre()
PUERTO_PUSH = 8408
BASE = f'http://127.0.0.1:{PUERTO}'

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


# ── el servicio de push falso ────────────────────────────────────────────────
capturados = []


class PushFalso(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        cuerpo = self.rfile.read(n) if n else b''
        capturados.append({
            'ruta': self.path,
            'cuerpo': cuerpo,
            'auth': self.headers.get('Authorization') or '',
            'ttl': self.headers.get('TTL'),
            'urgencia': self.headers.get('Urgency'),
        })
        # /muerto simula una suscripción caducada, como la devuelve FCM.
        codigo = 410 if self.path.startswith('/muerto') else 201
        self.send_response(codigo)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def log_message(self, *a):
        pass


push_srv = ThreadingHTTPServer(('127.0.0.1', PUERTO_PUSH), PushFalso)
threading.Thread(target=push_srv.serve_forever, daemon=True).start()

tmp = tempfile.mkdtemp()
PEM = os.path.join(tmp, 'vapid.pem')
subprocess.run(['openssl', 'ecparam', '-name', 'prime256v1', '-genkey', '-noout',
                '-out', PEM], check=True, capture_output=True)


def arrancar(con_llave):
    env = {**os.environ, 'MENSAJES_DATOS': os.path.join(tmp, f'd{con_llave}.json'),
           'MENSAJES_PUERTO': str(PUERTO),
           'MENSAJES_ARCHIVOS': os.path.join(tmp, 'arch')}
    env['MENSAJES_VAPID_PEM'] = PEM if con_llave else os.path.join(tmp, 'no-existe.pem')
    p = subprocess.Popen([sys.executable, SERVIDOR], env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        time.sleep(0.25)
        try:
            urllib.request.urlopen(BASE + '/salud', timeout=2)
            break
        except Exception:
            pass
    return p


def alta(c):
    return {'correo': c, 'llave': pedir('/alta', {'correo': c, 'nombre': c.split('@')[0]})[1]['llave']}


def firmado(u, extra):
    return {'correo': u['correo'], 'llave': u['llave'], **extra}


def esperar_push(cuantos, plazo=8):
    fin = time.time() + plazo
    while time.time() < fin:
        if len(capturados) >= cuantos:
            return True
        time.sleep(0.1)
    return len(capturados) >= cuantos


# ═════ 1 · con llave: la cadena entera ═══════════════════════════════════════
print('\n── con llave VAPID ──────────────────────────────────────────')
proc = arrancar(con_llave=True)
try:
    # La llave pública que publica el relevo es la del PEM.
    with urllib.request.urlopen(BASE + '/llave-avisos', timeout=5) as r:
        pub = json.loads(r.read()).get('llave', '')
    der = subprocess.run(['openssl', 'ec', '-in', PEM, '-pubout', '-outform', 'DER'],
                         capture_output=True).stdout
    esperada = base64.urlsafe_b64encode(der[-65:]).rstrip(b'=').decode()
    ok('la llave pública publicada es la del PEM', pub == esperada, pub[:16] + '…')

    ana = alta('ana@x.com')
    beto = alta('beto@x.com')
    # beto se suscribe con el endpoint del servicio falso
    pedir('/suscribir', firmado(beto, {'suscripcion': {
        'endpoint': f'http://127.0.0.1:{PUERTO_PUSH}/vivo/1', 'keys': {'p256dh': 'x', 'auth': 'y'}}}))
    # y ana y beto quedan en el círculo para poder escribirse
    pedir('/amistad/pedir', firmado(ana, {'para': 'beto@x.com'}))
    capturados.clear()

    # ── el mensaje empuja ──
    pedir('/amistad/responder', firmado(beto, {'de': 'ana@x.com', 'aceptar': True}))
    pedir('/enviar', firmado(ana, {'para': 'beto@x.com', 'texto': 'hola'}))
    ok('un mensaje produce un empujón al suscrito', esperar_push(1), f'{len(capturados)} POST')
    if capturados:
        c = capturados[0]
        ok('el aviso viaja VACÍO: ni un dato del mensaje', c['cuerpo'] == b'',
           f'{len(c["cuerpo"])} bytes')
        ok('lleva TTL', c['ttl'] == '86400')
        ok('con urgencia normal', c['urgencia'] == 'normal')
        auth = c['auth']
        ok('Authorization es VAPID', auth.startswith('vapid t='), auth[:24] + '…')
        # la firma del JWT verifica con la llave real
        try:
            t = auth.split('t=')[1].split(',')[0].strip()
            cab, cue, fir = t.split('.')
            rell = lambda x: x + '=' * (-len(x) % 4)
            cruda = base64.urlsafe_b64decode(rell(fir))
            r, s_ = cruda[:32].lstrip(b'\x00'), cruda[32:].lstrip(b'\x00')
            if r and r[0] & 0x80: r = b'\x00' + r
            if s_ and s_[0] & 0x80: s_ = b'\x00' + s_
            cr = bytes([2, len(r)]) + r + bytes([2, len(s_)]) + s_
            der_sig = bytes([0x30, len(cr)]) + cr
            fs = os.path.join(tmp, 'f.sig'); fd = os.path.join(tmp, 'f.dat')
            open(fs, 'wb').write(der_sig); open(fd, 'wb').write(f'{cab}.{cue}'.encode())
            pubpem = os.path.join(tmp, 'pub.pem')
            subprocess.run(['openssl', 'ec', '-in', PEM, '-pubout', '-out', pubpem],
                           capture_output=True)
            v = subprocess.run(['openssl', 'dgst', '-sha256', '-verify', pubpem,
                                '-signature', fs, fd], capture_output=True)
            ok('la firma ES256 del JWT verifica con openssl', v.returncode == 0,
               v.stdout.decode().strip())
            claims = json.loads(base64.urlsafe_b64decode(rell(cue)))
            ok('la audiencia es el origen del endpoint',
               claims.get('aud') == f'http://127.0.0.1:{PUERTO_PUSH}')
        except Exception as e:
            ok('la firma ES256 del JWT verifica con openssl', False, str(e)[:60])

    # ── quien está mirando no recibe ──
    capturados.clear()
    pedir('/bandeja', firmado(beto, {'desde': 'ana@x.com'}))
    pedir('/enviar', firmado(ana, {'para': 'beto@x.com', 'texto': 'otra'}))
    time.sleep(1.2)
    ok('quien acaba de mirar su bandeja NO recibe empujón', len(capturados) == 0,
       f'{len(capturados)} POST')

    # ── la solicitud de amistad empuja ──
    carla = alta('carla@x.com')
    pedir('/suscribir', firmado(carla, {'suscripcion': {
        'endpoint': f'http://127.0.0.1:{PUERTO_PUSH}/vivo/2', 'keys': {}}}))
    capturados.clear()
    pedir('/amistad/pedir', firmado(ana, {'para': 'carla@x.com'}))
    ok('una solicitud de amistad empuja a quien la recibe', esperar_push(1))

    # ── el timbre empuja con urgencia ──
    pedir('/amistad/responder', firmado(carla, {'de': 'ana@x.com', 'aceptar': True}))
    capturados.clear()
    pedir('/senal', firmado(ana, {'para': 'carla@x.com', 'tipo': 'llamo', 'datos': {}}))
    ok('el timbre de llamada empuja', esperar_push(1))
    if capturados:
        ok('y con urgencia alta', capturados[0]['urgencia'] == 'high', capturados[0]['urgencia'])

    # ── el endpoint muerto se poda ──
    dora = alta('dora@x.com')
    pedir('/suscribir', firmado(dora, {'suscripcion': {
        'endpoint': f'http://127.0.0.1:{PUERTO_PUSH}/muerto/1', 'keys': {}}}))
    pedir('/amistad/pedir', firmado(ana, {'para': 'dora@x.com'}))
    pedir('/amistad/responder', firmado(dora, {'de': 'ana@x.com', 'aceptar': True}))
    capturados.clear()
    pedir('/enviar', firmado(ana, {'para': 'dora@x.com', 'texto': 'a'}))
    esperar_push(1)
    time.sleep(1.0)                       # que la poda del hilo termine
    capturados.clear()
    pedir('/enviar', firmado(ana, {'para': 'dora@x.com', 'texto': 'b'}))
    time.sleep(1.2)
    ok('un endpoint que contestó 410 se poda: no se le insiste', len(capturados) == 0,
       f'{len(capturados)} POST')
finally:
    proc.terminate(); proc.wait()

# ═════ 2 · sin llave: no empuja y no se cae ═════════════════════════════════
print('\n── sin llave VAPID ──────────────────────────────────────────')
proc = arrancar(con_llave=False)
try:
    with urllib.request.urlopen(BASE + '/llave-avisos', timeout=5) as r:
        pub = json.loads(r.read()).get('llave')
    ok('sin llave, /llave-avisos dice vacío (la app sabrá decirlo)', pub == '')
    eva = alta('eva@x.com')
    fran = alta('fran@x.com')
    pedir('/suscribir', firmado(fran, {'suscripcion': {
        'endpoint': f'http://127.0.0.1:{PUERTO_PUSH}/vivo/9', 'keys': {}}}))
    pedir('/amistad/pedir', firmado(eva, {'para': 'fran@x.com'}))
    pedir('/amistad/responder', firmado(fran, {'de': 'eva@x.com', 'aceptar': True}))
    capturados.clear()
    st, _ = pedir('/enviar', firmado(eva, {'para': 'fran@x.com', 'texto': 'hola'}))
    time.sleep(0.8)
    ok('el mensaje entra igual (200) y no se empuja nada', st == 200 and len(capturados) == 0)
finally:
    proc.terminate(); proc.wait()

print()
if fallos:
    print(f'{len(fallos)} comprobación(es) fallaron')
    sys.exit(1)
print('Todo en verde')
