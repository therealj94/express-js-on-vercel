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


def reposar(quieto=1.0, plazo=6):
    """Espera a que DEJEN de llegar avisos.

    Los avisos salen en un hilo aparte, asi que `enviados.clear()` justo despues
    de una peticion no garantiza nada: lo de la peticion anterior puede estar
    todavia en camino y aparecer en la tanda siguiente. Esperar un numero fijo
    de segundos tampoco sirve —en una maquina lenta se queda corto, y ahi fue
    donde el CI vio cuatro envios donde esta maquina veia dos—. Se espera a que
    pase `quieto` segundos sin que llegue nada nuevo.
    """
    fin = time.time() + plazo
    cuantos = len(enviados)
    calma = time.time()
    while time.time() < fin:
        time.sleep(0.1)
        if len(enviados) != cuantos:
            cuantos = len(enviados)
            calma = time.time()
        elif time.time() - calma >= quieto:
            return


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
    enviados.clear()
    pedir('/amistad/pedir', firmado(beto, {'para': ana['correo']}))

    # SE ESPERA A QUE LLEGUEN LOS DE LA SOLICITUD ANTES DE SEGUIR.
    #
    # `/amistad/pedir` tambien avisa —«una persona esperando», dice el relevo— y
    # lo hace EN UN HILO APARTE, para no hacerle esperar la red de Google a
    # quien mando la solicitud. Ana tiene dos aparatos apuntados, o sea dos
    # avisos en camino.
    #
    # Aca abajo se limpiaba la lista y se mandaba el mensaje enseguida. En esta
    # maquina los dos de la solicitud ya habian llegado y se iban con el
    # `clear()`; en el CI, que es mas lento, llegaban DESPUES y se sumaban a
    # los dos del mensaje: cuatro envios, cada testigo repetido. Parecia un
    # aviso duplicado de verdad —el fallo que mas se nota en un telefono— y era
    # esta carrera.
    #
    # De paso se comprueba que la solicitud avisa, que antes no lo miraba nadie.
    ok('la solicitud de amistad tambien avisa al telefono', esperar(2),
       f'{len(enviados)} envios')

    pedir('/amistad/responder', firmado(ana, {'de': beto['correo'], 'aceptar': True}))
    reposar()   # por si `responder` empujara algo algun dia

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
    # Se deja que termine de llegar todo lo del mensaje ANTES de limpiar. Si no,
    # un aviso de mensaje rezagado cae dentro de esta tanda y `enviados[0]` es
    # un mensaje en vez de una llamada: las tres comprobaciones de abajo miran
    # ese primero y fallarian diciendo que el canal esta mal, que es una pista
    # falsa de las caras.
    reposar()
    enviados.clear()
    pedir('/senal', firmado(beto, {'para': ana['correo'], 'tipo': 'llamo', 'datos': {}}))
    # DOS, uno por aparato. Antes pedia uno solo y se conformaba: un timbre que
    # suena en el telefono pero no en la tablet habria pasado por bueno, y es
    # justo el fallo que se nota —te llaman y suena donde no estas mirando.
    ok('el timbre sale en los dos aparatos', esperar(2), f'{len(enviados)} envíos')
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
