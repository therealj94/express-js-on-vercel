#!/usr/bin/env python3
"""Una cuenta en varios aparatos, y entrar al chat con un pase de Genesis.

Es lo que necesita AU-RA para ser un aparato más de la misma persona:

  1. EL PASE. AU-RA no tiene (ni debe tener) la sesión de la wallet. Trae un
     pase de Genesis ID sacado para ella y para el chat (aud), con reto. El
     relevo se lo da a Genesis y, si vale, le entrega la llave de la cuenta de
     ESE correo —el que dice Genesis, no el que mande nadie—. Un pase sin
     destino, con otro verificador o para otro correo no abre nada.
  2. LAS ALTAS CON PRUEBA. Con MENSAJES_ALTA_CON_PRUEBA=1, una cuenta nueva
     solo se crea probando el correo; los bots de la lista entran igual, y las
     cuentas que ya existían siguen entrando con su llave.
  3. EL BUZÓN POR APARATO. Dos aparatos de la misma cuenta reciben las dos el
     timbre; cuando uno contesta, al otro le llega «atendida» para que deje de
     sonar. Un cliente viejo, sin aparato, sigue como antes.
  4. EL PUSH POR APARATO. Cada aparato conserva su suscripción y la reemplaza
     él mismo; ya no se desplazan entre sí.

Se levanta el relevo REAL y un Genesis DE MENTIRA. Solo biblioteca estándar.
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


VERIF = 'v' * 43
# El Genesis de mentira conoce tres pases. Comprueba la clave de API y el
# verificador igual que el de verdad; el destino lo devuelve tal cual.
PASES = {
    'pase-ana': {'gid': 'GEN-ANA1-ANA2-A', 'correo': 'ana@prueba.local', 'aud': ['aura', 'pulse2chat']},
    'pase-ana-2': {'gid': 'GEN-ANA1-ANA2-A', 'correo': 'ana@prueba.local', 'aud': ['aura', 'pulse2chat']},
    'pase-solo-aura': {'gid': 'GEN-ANA1-ANA2-A', 'correo': 'ana@prueba.local', 'aud': ['aura']},
    'pase-sin-destino': {'gid': 'GEN-ANA1-ANA2-A', 'correo': 'ana@prueba.local'},
}
pedidas = []


class GenesisFalso(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        b = json.loads(self.rfile.read(n) or b'{}')
        pedidas.append(b)
        v = PASES.get(b.get('token'))
        ok = (self.path == '/api/v1/sso/verificar' and self.headers.get('X-API-Key') == 'clave-chat'
              and v and b.get('verificador') == VERIF)
        cuerpo = json.dumps(dict(v, valido=True) if ok else {'valido': False}).encode()
        self.send_response(200 if ok else 401)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)


fallos = []


def ok(que, cond, extra=''):
    print(f"{'  ok  ' if cond else ' FALLA'}  {que}" + (f'  · {extra}' if extra else ''))
    if not cond:
        fallos.append(que)


PUERTO = puerto_libre()
BASE = f'http://127.0.0.1:{PUERTO}'


def pedir(ruta, cuerpo, espera=40):
    """(estado, cuerpo) — los 4xx también se devuelven, no se lanzan."""
    req = urllib.request.Request(BASE + ruta, method='POST', data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with ABRIR(req, timeout=espera) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


genesis = ThreadingHTTPServer(('127.0.0.1', puerto_libre()), GenesisFalso)
threading.Thread(target=genesis.serve_forever, daemon=True).start()

tmp = tempfile.mkdtemp()
proc = subprocess.Popen([sys.executable, SERVIDOR], env={
    **os.environ,
    'MENSAJES_DATOS': os.path.join(tmp, 'd.json'),
    'MENSAJES_PUERTO': str(PUERTO),
    'MENSAJES_ARCHIVOS': os.path.join(tmp, 'arch'),
    'MENSAJES_GENESIS_URL': f'http://127.0.0.1:{genesis.server_address[1]}',
    'MENSAJES_GENESIS_CLAVE': 'clave-chat',
    'MENSAJES_ALTA_CON_PRUEBA': '1',
    'MENSAJES_ALTA_LIBRE': 'beto@prueba.local, bot@prueba.local',
    # El backend de la wallet no hace falta aquí; que no salga a la red.
    'MENSAJES_WALLET_URL': 'http://127.0.0.1:9',
}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    for _ in range(40):
        time.sleep(0.25)
        try:
            ABRIR(BASE + '/salud', timeout=2)
            break
        except Exception:
            pass

    print('\n1. El pase de Genesis\n')
    e, r = pedir('/alta', {'pase': 'pase-ana', 'verificador': VERIF, 'nombre': 'Ana'})
    ok('un pase válido abre (y crea) la cuenta de SU correo', e == 200 and r.get('correo') == 'ana@prueba.local', r)
    llave_ana = r.get('llave')
    e, r = pedir('/alta', {'pase': 'pase-ana-2', 'verificador': VERIF})
    ok('otro pase de la misma persona devuelve la MISMA llave', e == 200 and r.get('llave') == llave_ana)
    e, r = pedir('/alta', {'pase': 'pase-ana-2', 'verificador': VERIF, 'correo': 'otra@prueba.local'})
    ok('si el correo pedido no es el del pase: otra-cuenta, y dice cuál es',
       e == 409 and r.get('motivo') == 'otra-cuenta' and r.get('correoReal') == 'ana@prueba.local', r)
    for nombre, cuerpo in [('sin destino', {'pase': 'pase-sin-destino', 'verificador': VERIF}),
                           ('para otra app', {'pase': 'pase-solo-aura', 'verificador': VERIF}),
                           ('con otro verificador', {'pase': 'pase-ana', 'verificador': 'x' * 43}),
                           ('inventado', {'pase': 'nada', 'verificador': VERIF})]:
        e, r = pedir('/alta', cuerpo)
        ok(f'un pase {nombre} no abre nada', e == 409 and r.get('motivo') == 'pase-no-vale' and 'llave' not in r, r)
    ok('al relevo le llegó el verificador para comprobarlo', any(p.get('verificador') == VERIF for p in pedidas))

    print('\n2. Las altas nuevas, con prueba\n')
    e, r = pedir('/alta', {'correo': 'intruso@prueba.local'})
    ok('una cuenta nueva sin prueba no se crea', e == 409 and r.get('motivo') == 'sin-sesion', r)
    e, r = pedir('/alta', {'correo': 'beto@prueba.local'})
    ok('un bot de la lista sí', e == 200 and r.get('llave'), r)
    llave_beto = r.get('llave')
    e, r = pedir('/alta', {'correo': 'ana@prueba.local', 'llave': llave_ana})
    ok('una cuenta que ya existe sigue entrando con su llave', e == 200 and r.get('llave') == llave_ana, r)

    A = {'correo': 'ana@prueba.local', 'llave': llave_ana}
    B = {'correo': 'beto@prueba.local', 'llave': llave_beto}
    pedir('/amistad/pedir', dict(B, para='ana@prueba.local'))
    pedir('/amistad/responder', dict(A, de='beto@prueba.local', aceptar=True))

    print('\n3. El buzón de señales, por aparato\n')
    oido = {}

    def escucha(nombre, aparato):
        cuerpo = dict(A, aparato=aparato) if aparato else dict(A)
        e, r = pedir('/senales', cuerpo, espera=40)
        oido[nombre] = r.get('senales', [])

    hilos = [threading.Thread(target=escucha, args=(n, a)) for n, a in
             [('og', 'aparato-og'), ('aura', 'aparato-aura'), ('viejo', None)]]
    for h in hilos:
        h.start()
    time.sleep(0.6)
    e, r = pedir('/senal', dict(B, para='ana@prueba.local', tipo='llamo', datos={'video': False}))
    ok('Beto llama', e == 200, r)
    for h in hilos:
        h.join(10)
    for n in ('og', 'aura', 'viejo'):
        ok(f'el timbre llega al aparato «{n}»', [s['tipo'] for s in oido.get(n, [])] == ['llamo'], oido.get(n))

    # Lo ya visto no se repite: el aparato vuelve a escuchar y solo le llega
    # lo nuevo.
    hilo_rep = threading.Thread(target=escucha, args=('aura2', 'aparato-aura'))
    hilo_rep.start()
    time.sleep(0.6)
    e, r = pedir('/senal', dict(A, aparato='aparato-og', para='beto@prueba.local', tipo='respuesta',
                                datos={'sdp': {'type': 'answer', 'sdp': 'x'}}))
    ok('el aparato de Orden Global contesta', e == 200, r)
    hilo_rep.join(10)
    aten = oido.get('aura2', [])
    ok('al otro aparato no le vuelve a llegar el timbre ya visto', all(s['tipo'] != 'llamo' for s in aten), aten)
    ok('le llega «atendida», diciendo qué aparato contestó',
       any(s['tipo'] == 'atendida' and s.get('desde') == 'aparato-og' and s['de'] == 'beto@prueba.local'
           and s['datos'] == {'como': 'respuesta'} for s in aten), aten)
    e, r = pedir('/senales', dict(B), espera=40)
    ok('a Beto le llega la respuesta', [s['tipo'] for s in r.get('senales', [])] == ['respuesta'], r)

    print('\n4. El push, por aparato\n')
    for i, ap in enumerate(['web', 'og', 'aura', 'tablet']):
        e, r = pedir('/suscribir', dict(A, aparato=ap, expo=f'ExponentPushToken[t{i}]'))
    ok('cuatro aparatos conservan cada uno su suscripción', r.get('dispositivos') == 4, r)
    e, r = pedir('/suscribir', dict(A, aparato='aura', expo='ExponentPushToken[nuevo]'))
    ok('el mismo aparato con un testigo nuevo reemplaza el suyo, no suma', r.get('dispositivos') == 4, r)
    for i in range(6):
        e, r = pedir('/suscribir', dict(A, expo=f'ExponentPushToken[viejo{i}]'))
    ok('el tope por cuenta sigue existiendo (6)', r.get('dispositivos') == 6, r)
finally:
    proc.terminate()
    genesis.shutdown()

print(f'\n{len(fallos)} fallo(s)' if fallos else '\ntodo bien')
sys.exit(1 if fallos else 0)
