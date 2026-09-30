#!/usr/bin/env python3
"""Tres candados del relevo que AU-RA dejó a la vista.

  1. LA LLAVE SE COMPARA EN TIEMPO CONSTANTE. Con `==`, el 401 tarda un poco
     más cuanto más larga es la parte acertada, y midiendo se adivina la llave
     letra a letra. Aquí se comprueba que la comparación es `hmac.compare_digest`
     (mirando el código: el tiempo no se puede medir en una prueba corta sin que
     sea frágil) y que lo que no es texto —un número, una lista, nada— da 401 y
     no un 500 que tumbe la petición.
  2. EL ID DE UN APARATO SALE DE SU PÚBLICA. `/llaves/publicar` rechaza un
     aparato cuyo `id` no es b64url(sha256(pub))[:22]: si no, un aparato podría
     publicarse con el id de otro y quedarse con sus sobres.
  3. EL NOMBRE VISIBLE NO SE PISA. Un `/alta` sobre una cuenta que ya existe
     (otro aparato, AU-RA con el nombre corto de su padrón) no le cambia el
     nombre a nadie; si la cuenta no tenía nombre, sí se lo pone. Cambiarlo a
     propósito sigue siendo `/perfil`.

Se levanta el relevo REAL. Solo biblioteca estándar.
"""
import base64, hashlib, json, os, re, socket, subprocess, sys, tempfile, time
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


fallos = []


def ok(que, cond, extra=''):
    print(f"{'  ok  ' if cond else ' FALLA'}  {que}" + (f'  · {extra}' if extra else ''))
    if not cond:
        fallos.append(que)


def id_de(pub):
    """Como lo calculan los tres clientes: b64url(sha256(pub))[:22]."""
    crudo = base64.urlsafe_b64decode(pub + '=' * (-len(pub) % 4))
    return base64.urlsafe_b64encode(hashlib.sha256(crudo).digest()).decode().rstrip('=')[:22]


PUERTO = puerto_libre()
BASE = f'http://127.0.0.1:{PUERTO}'


def pedir(ruta, cuerpo, espera=20):
    """(estado, cuerpo) — los 4xx también se devuelven, no se lanzan."""
    req = urllib.request.Request(BASE + ruta, method='POST', data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with ABRIR(req, timeout=espera) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


tmp = tempfile.mkdtemp()
proc = subprocess.Popen([sys.executable, SERVIDOR], env={
    **os.environ,
    'MENSAJES_DATOS': os.path.join(tmp, 'd.json'),
    'MENSAJES_PUERTO': str(PUERTO),
    'MENSAJES_ARCHIVOS': os.path.join(tmp, 'arch'),
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

    print('\n1. La llave, en tiempo constante\n')
    codigo = open(SERVIDOR, encoding='utf-8').read()
    ok('la comparación de la llave es hmac.compare_digest', 'hmac.compare_digest(' in codigo)
    ok('ya no queda ninguna comparación de llave con == o !=',
       not re.search(r"b\.get\('llave'\)\s*[!=]=", codigo))

    e, r = pedir('/alta', {'correo': 'ana@prueba.local', 'nombre': 'Ana María López'})
    ok('alta de Ana', e == 200 and r.get('llave'), r)
    A = {'correo': 'ana@prueba.local', 'llave': r.get('llave')}

    e, _ = pedir('/conversaciones', A)
    ok('con su llave, entra', e == 200, e)
    e, _ = pedir('/conversaciones', dict(A, llave=A['llave'][:-1] + ('0' if A['llave'][-1] != '0' else '1')))
    ok('con una llave casi igual, 401', e == 401, e)
    for rara in (None, 12345, ['x'], {'k': 1}, '', 'ñandú'):
        e, _ = pedir('/conversaciones', dict(A, llave=rara))
        ok(f'una llave {type(rara).__name__} {rara!r} da 401, no un 500', e == 401, e)
    e, _ = pedir('/conversaciones', {'correo': 'nadie@prueba.local', 'llave': A['llave']})
    ok('la llave de otro correo, 401', e == 401, e)

    print('\n2. El id del aparato sale de su pública\n')
    pub = base64.urlsafe_b64encode(b'\x04' + bytes(range(64))).decode().rstrip('=')
    bien = id_de(pub)
    e, r = pedir('/llaves/publicar', dict(A, id=bien, pub=pub, fir='FIRMA'))
    ok('un aparato con su id de verdad se publica', e == 200, r)
    e, r = pedir('/llaves/publicar', dict(A, id='apAjeno1234567890ABCDE', pub=pub))
    ok('uno con un id inventado se rechaza', e == 400 and r.get('motivo') == 'id-no-cuadra', r)
    otra = base64.urlsafe_b64encode(b'\x04' + bytes(range(1, 65))).decode().rstrip('=')
    e, r = pedir('/llaves/publicar', dict(A, id=bien, pub=otra))
    ok('el id de OTRO aparato con una pública distinta se rechaza', e == 400, r)
    e, r = pedir('/llaves/publicar', dict(A, id=bien, pub='@@no-es-base64@@'))
    ok('una pública que no es base64url se rechaza', e == 400, r)
    e, r = pedir('/llaves/de', dict(A, correos=['ana@prueba.local']))
    mias = (r.get('llaves') or {}).get('ana@prueba.local', [])
    ok('queda solo el aparato bueno, con su pública intacta',
       [(a['id'], a['pub']) for a in mias] == [(bien, pub)], mias)

    print('\n3. El nombre visible no se pisa\n')
    e, r = pedir('/alta', dict(A, nombre='Ana'))
    ok('un alta con su llave devuelve la misma llave', e == 200 and r.get('llave') == A['llave'], r)
    e, r = pedir('/ficha', dict(A, de='ana@prueba.local'))
    ok('«Ana María López» sigue siendo «Ana María López»', r.get('nombre') == 'Ana María López', r)

    e, r = pedir('/alta', {'correo': 'beto@prueba.local'})
    B = {'correo': 'beto@prueba.local', 'llave': r.get('llave')}
    e, r = pedir('/alta', dict(B, nombre='Beto Pérez'))
    e, r = pedir('/ficha', dict(B, de='beto@prueba.local'))
    ok('una cuenta SIN nombre sí recibe el del alta', r.get('nombre') == 'Beto Pérez', r)

    e, r = pedir('/perfil', dict(A, nombre='Ana M.'))
    e, r = pedir('/ficha', dict(A, de='ana@prueba.local'))
    ok('cambiarlo a propósito con /perfil sigue funcionando', r.get('nombre') == 'Ana M.', r)
    e, r = pedir('/alta', dict(A, nombre='Ana María López'))
    e, r = pedir('/ficha', dict(A, de='ana@prueba.local'))
    ok('y un alta posterior tampoco deshace lo que eligió', r.get('nombre') == 'Ana M.', r)
finally:
    proc.terminate()

print(f'\n{len(fallos)} fallo(s)' if fallos else '\ntodo bien')
sys.exit(1 if fallos else 0)
