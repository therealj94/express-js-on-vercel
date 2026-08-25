#!/usr/bin/env python3
"""El aviso que llega al TELEFONO, no al navegador.

══ QUE SE ROMPIA ═══════════════════════════════════════════════════════════

El relevo sabia empujar por VAPID —la red de push de los navegadores— y eso
no llega a la app. PULSE2CHAT vive ahi dentro en una vista de navegador
incrustada, y una vista incrustada NO recibe push: no hay obrero de servicio
que despertar ni permiso de notificacion que dar. O sea que en la app, que es
donde la gente lo usa, los mensajes llegaban en silencio y las llamadas no
sonaban. Se veian al abrir, y nada mas.

Un telefono se avisa por su propia red. Aqui es la de Expo, que es la que la
app ya habla. Esta prueba levanta una Expo FALSA y comprueba la cadena entera:

  · un testigo de telefono se apunta y se reemplaza como el de un navegador;
  · un mensaje produce UN envio a la red de Expo con ese testigo;
  · el envio NO lleva ni una palabra del mensaje —la promesa del relevo es que
    por la red de nadie pasa un dato, y Expo si dejaria mandarlo—;
  · el timbre de una llamada va por su propio canal y con vida corta: una
    llamada que suena diez minutos tarde es peor que ninguna;
  · un testigo que Expo declara muerto se poda, y a la siguiente no se insiste;
  · podar un telefono NO se lleva por delante a los otros telefonos —lo hacia,
    porque la poda era por `endpoint` y un telefono no tiene—;
  · y sin llave VAPID los avisos del telefono siguen saliendo: antes la falta
    de la llave del navegador apagaba tambien los de la app.
"""
import json, os, subprocess, sys, tempfile, threading, time
import urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')
PUERTO = 8417
PUERTO_EXPO = 8418
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


# ── la red de Expo, de mentira ───────────────────────────────────────────────
enviados = []
muertos = set()          # testigos que esta Expo declara desinstalados


class ExpoFalsa(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        cuerpo = json.loads(self.rfile.read(n) or b'[]')
        enviados.extend(cuerpo)
        # Expo contesta 200 aunque el testigo este muerto: el motivo viaja
        # DENTRO de la respuesta. Es justo la trampa que la poda tiene que ver.
        datos = []
        for m in cuerpo:
            if m.get('to') in muertos:
                datos.append({'status': 'error',
                              'details': {'error': 'DeviceNotRegistered'}})
            else:
                datos.append({'status': 'ok', 'id': 'x'})
        salida = json.dumps({'data': datos}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(salida)))
        self.end_headers()
        self.wfile.write(salida)

    def log_message(self, *a):
        pass


expo_srv = ThreadingHTTPServer(('127.0.0.1', PUERTO_EXPO), ExpoFalsa)
threading.Thread(target=expo_srv.serve_forever, daemon=True).start()

tmp = tempfile.mkdtemp()
PEM = os.path.join(tmp, 'vapid.pem')
subprocess.run(['openssl', 'ecparam', '-name', 'prime256v1', '-genkey', '-noout',
                '-out', PEM], check=True, capture_output=True)


def arrancar(con_llave=True, sufijo=''):
    env = {**os.environ,
           'MENSAJES_DATOS': os.path.join(tmp, f'd{con_llave}{sufijo}.json'),
           'MENSAJES_PUERTO': str(PUERTO),
           'MENSAJES_ARCHIVOS': os.path.join(tmp, 'arch'),
           'MENSAJES_EXPO_URL': f'http://127.0.0.1:{PUERTO_EXPO}/enviar',
           'MENSAJES_VAPID_PEM': PEM if con_llave else os.path.join(tmp, 'no-hay.pem')}
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
    return {'correo': c,
            'llave': pedir('/alta', {'correo': c, 'nombre': c.split('@')[0]})[1]['llave']}


def firmado(u, extra):
    return {'correo': u['correo'], 'llave': u['llave'], **extra}


def esperar(cuantos, plazo=8):
    fin = time.time() + plazo
    while time.time() < fin:
        if len(enviados) >= cuantos:
            return True
        time.sleep(0.1)
    return len(enviados) >= cuantos


TESTIGO = 'ExponentPushToken[telefono-de-jose]'
OTRO = 'ExponentPushToken[la-tablet]'

print('\n── el telefono se apunta ────────────────────────────────────')
proc = arrancar()
try:
    ana = alta('ana@x.com')
    beto = alta('beto@x.com')

    c, d = pedir('/suscribir', firmado(ana, {'expo': TESTIGO}))
    ok('un testigo de telefono se apunta', c == 200 and d.get('dispositivos') == 1, str(d))

    c, _ = pedir('/suscribir', firmado(ana, {'expo': 'esto-no-es-un-testigo'}))
    ok('y uno con mala pinta se rechaza', c == 400, f'HTTP {c}')

    c, d = pedir('/suscribir', firmado(ana, {'expo': TESTIGO}))
    ok('apuntar el mismo dos veces no lo duplica', d.get('dispositivos') == 1, str(d))

    c, d = pedir('/suscribir', firmado(ana, {'expo': OTRO}))
    ok('y un segundo aparato sí se suma', d.get('dispositivos') == 2, str(d))

    # Hay que ser amigos para escribirse: es la regla del relevo, no un rodeo
    # de la prueba. Sin esto el mensaje se rechaza y no habria nada que empujar.
    pedir('/amistad/pedir', firmado(beto, {'para': ana['correo']}))
    pedir('/amistad/responder', firmado(ana, {'de': beto['correo'], 'aceptar': True}))

    print('\n── un mensaje avisa al telefono ─────────────────────────────')
    enviados.clear()
    pedir('/enviar', firmado(beto, {'para': ana['correo'], 'texto': 'hola, esto es secreto'}))
    ok('el mensaje llega a la red del telefono', esperar(2), f'{len(enviados)} envíos')
    if enviados:
        aTestigos = sorted(m.get('to') for m in enviados)
        ok('a los dos aparatos apuntados', aTestigos == sorted([TESTIGO, OTRO]),
           ', '.join(aTestigos))
        crudo = json.dumps(enviados)
        ok('y NO viaja ni una palabra del mensaje',
           'secreto' not in crudo and 'beto' not in crudo,
           'ni el texto ni quién lo mandó')
        ok('el canal es el de mensajes', enviados[0].get('channelId') == 'mensajes',
           str(enviados[0].get('channelId')))

    print('\n── una llamada suena distinto ───────────────────────────────')
    enviados.clear()
    pedir('/senal', firmado(beto, {'para': ana['correo'], 'tipo': 'llamo', 'datos': {}}))
    ok('el timbre sale', esperar(1), f'{len(enviados)} envíos')
    if enviados:
        m = enviados[0]
        ok('por el canal de llamadas', m.get('channelId') == 'llamadas', str(m.get('channelId')))
        ok('con vida corta: una llamada vieja no se enseña',
           isinstance(m.get('ttl'), int) and m['ttl'] <= 120, str(m.get('ttl')))
        ok('y con prioridad alta', m.get('priority') == 'high', str(m.get('priority')))

    print('\n── podar un telefono muerto ─────────────────────────────────')
    muertos.add(OTRO)
    enviados.clear()
    pedir('/enviar', firmado(beto, {'para': ana['correo'], 'texto': 'otra'}))
    esperar(2)
    time.sleep(1.2)                       # la poda ocurre tras responder Expo
    enviados.clear()
    pedir('/enviar', firmado(beto, {'para': ana['correo'], 'texto': 'y otra'}))
    esperar(1)
    time.sleep(0.6)
    quedan = sorted(m.get('to') for m in enviados)
    ok('el muerto se poda', OTRO not in quedan, ', '.join(quedan) or 'ninguno')
    ok('y el que vive SIGUE apuntado', TESTIGO in quedan,
       'podar por endpoint se llevaba a todos los teléfonos a la vez')
finally:
    proc.terminate()
    proc.wait(timeout=5)

print('\n── sin llave VAPID, el telefono igual recibe ────────────────')
proc = arrancar(con_llave=False, sufijo='b')
try:
    ana = alta('ana@x.com')
    beto = alta('beto@x.com')
    pedir('/suscribir', firmado(ana, {'expo': TESTIGO}))
    pedir('/amistad/pedir', firmado(beto, {'para': ana['correo']}))
    pedir('/amistad/responder', firmado(ana, {'de': beto['correo'], 'aceptar': True}))
    enviados.clear()
    muertos.clear()
    pedir('/enviar', firmado(beto, {'para': ana['correo'], 'texto': 'hola'}))
    ok('el aviso del teléfono no depende de la llave del navegador', esperar(1),
       'antes, sin VAPID, no salía ninguno de los dos')
finally:
    proc.terminate()
    proc.wait(timeout=5)

print()
if fallos:
    print(f'{len(fallos)} fallan\n')
    sys.exit(1)
print('Todo en verde\n')
