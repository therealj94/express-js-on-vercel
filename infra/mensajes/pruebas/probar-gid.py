#!/usr/bin/env python3
"""Prueba de punta a punta del GID (Genesis ID) en infra/mensajes/servidor.py.

Levanta el relevo REAL en un puerto libre con datos en un directorio temporal
y comprueba lo que el directorio del ecosistema necesita que sea verdad:
  1. /alta acepta un gid opcional (texto recortado, tope 64) y /ficha lo
     devuelve tal cual lo declaró su dueño;
  2. /buscar encuentra a la persona tecleando el PRINCIPIO de su gid en
     minúsculas (empieza-por, insensible a mayúsculas), y los resultados
     traen nombre y gid;
  3. /perfil cambia el gid — y el gid viejo deja de encontrar a la persona,
     porque un identificador retirado no puede seguir apuntándole;
  4. el dueño con su llave también actualiza el gid repitiendo /alta, igual
     que hace con nombre y foto;
  5. una cuenta SIN gid sigue funcionando igual en /alta, /buscar y /ficha:
     el campo llega como '' y nada revienta — las fichas de antes de este
     campo no se migran, se leen con .get y ya.

Sin dependencias fuera de la stdlib.
"""
import json, os, socket, subprocess, sys, tempfile, time
import urllib.error, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
SERVIDOR = os.path.join(AQUI, '..', 'servidor.py')

# opener sin proxy: la máquina de pruebas puede tener HTTPS_PROXY global y
# esto habla con 127.0.0.1 directamente
ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({})).open


def puerto_libre():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def post(base, ruta, cuerpo):
    """POST JSON → (status, dict). Los errores HTTP también traen JSON."""
    req = urllib.request.Request(base + ruta, data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with ABRIR(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def main():
    tmp = tempfile.mkdtemp(prefix='mensajes-gid-')
    puerto = puerto_libre()
    base = 'http://127.0.0.1:%d' % puerto
    env = dict(os.environ, MENSAJES_DATOS=os.path.join(tmp, 'datos.json'),
               MENSAJES_PUERTO=str(puerto))
    proc = subprocess.Popen([sys.executable, SERVIDOR], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        # esperar a que el relevo respire
        for _ in range(50):
            try:
                with ABRIR(base + '/salud', timeout=2) as r:
                    if json.loads(r.read()).get('vivo'):
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise SystemExit('el servidor nunca contestó /salud')

        # 1) alta CON gid (con espacios alrededor: deben recortarse) y alta SIN
        gid1 = 'GID-7QK4X9RTLM'
        st, r = post(base, '/alta', {'correo': 'ana@og.hn', 'nombre': 'Ana',
                                     'gid': '  %s  ' % gid1})
        assert st == 200 and r.get('llave'), '/alta con gid: %s %s' % (st, r)
        ana = {'correo': 'ana@og.hn', 'llave': r['llave']}
        st, r = post(base, '/alta', {'correo': 'beto@og.hn', 'nombre': 'Beto'})
        assert st == 200 and r.get('llave'), '/alta sin gid: %s %s' % (st, r)
        beto = {'correo': 'beto@og.hn', 'llave': r['llave']}
        # Desde que existe el circulo hay que aceptarse para poder
        # escribirse. No es ruido de la prueba: es el mismo paso que
        # da una persona en la app antes de su primer mensaje.
        post(base, '/amistad/pedir', dict(ana, para='beto@og.hn'))
        post(base, '/amistad/responder', dict(beto, de='ana@og.hn', aceptar=True))

        # 2) buscar por el PRINCIPIO del gid en minúsculas lo encuentra
        st, r = post(base, '/buscar', dict(beto, q='gid-7qk4'))
        assert st == 200, '/buscar por gid: %s %s' % (st, r)
        assert [x['correo'] for x in r['gente']] == ['ana@og.hn'], \
            'el prefijo del gid debía dar con Ana: %s' % r['gente']
        assert r['gente'][0]['nombre'] == 'Ana' and r['gente'][0]['gid'] == gid1, \
            'el resultado debe traer nombre y gid: %s' % r['gente'][0]
        # el trozo del MEDIO del gid no encuentra: un identificador se teclea
        # desde el principio, no se pesca por dentro como la prosa de un nombre
        st, r = post(base, '/buscar', dict(beto, q='x9rtlm'))
        assert r['gente'] == [], 'el gid es empieza-por, no contiene: %s' % r['gente']

        # 3) la ficha trae el gid, ya sin los espacios del alta
        st, r = post(base, '/ficha', dict(beto, de='ana@og.hn'))
        assert st == 200 and r.get('gid') == gid1 and r.get('nombre') == 'Ana', \
            '/ficha sin el gid recortado: %s %s' % (st, r)

        # 4) /perfil cambia el gid, y el viejo deja de encontrar
        gid2 = 'GID-ZW8MB2PDQN'
        st, r = post(base, '/perfil', dict(ana, gid=gid2))
        assert st == 200 and r.get('ok'), '/perfil con gid: %s %s' % (st, r)
        st, r = post(base, '/ficha', dict(beto, de='ana@og.hn'))
        assert r.get('gid') == gid2, 'la ficha no trae el gid nuevo: %s' % r
        st, r = post(base, '/buscar', dict(beto, q='gid-7qk4'))
        assert r['gente'] == [], 'el gid viejo debía estar muerto: %s' % r['gente']
        st, r = post(base, '/buscar', dict(beto, q='gid-zw8m'))
        assert [x['gid'] for x in r['gente']] == [gid2], \
            'el gid nuevo debía encontrar: %s' % r['gente']
        # tocar el nombre sin mandar gid NO lo borra (misma regla que la foto)
        st, r = post(base, '/perfil', dict(ana, nombre='Ana G.'))
        st, r = post(base, '/ficha', dict(beto, de='ana@og.hn'))
        assert r.get('gid') == gid2 and r.get('nombre') == 'Ana G.', \
            'perfil sin gid no debía tocarlo: %s' % r

        # 5) repetir /alta con la llave también actualiza el gid, y un gid
        # kilométrico se recorta a 64 en vez de reventar
        gid3 = 'GID-' + 'A' * 100
        st, r = post(base, '/alta', dict(ana, gid=gid3))
        assert st == 200 and r.get('llave') == ana['llave'], \
            '/alta del dueño: %s %s' % (st, r)
        st, r = post(base, '/ficha', dict(beto, de='ana@og.hn'))
        assert r.get('gid') == gid3[:64], 'el gid no se recortó a 64: %r' % r.get('gid')
        post(base, '/perfil', dict(ana, gid=gid2))

        # 6) la cuenta sin gid sigue entera: se busca por nombre, su ficha
        # contesta y el gid llega como '' sin romper a nadie
        st, r = post(base, '/buscar', dict(ana, q='beto'))
        assert st == 200 and [x['correo'] for x in r['gente']] == ['beto@og.hn'], \
            'a Beto se le encuentra por nombre como siempre: %s %s' % (st, r)
        assert r['gente'][0]['gid'] == '', 'sin gid el campo es vacío: %s' % r['gente'][0]
        st, r = post(base, '/ficha', dict(ana, de='beto@og.hn'))
        assert st == 200 and r.get('gid') == '' and r.get('nombre') == 'Beto', \
            'la ficha sin gid debe seguir contestando: %s %s' % (st, r)

        # y en /conversaciones cada persona viaja con su gid (o '' si no hay)
        st, r = post(base, '/enviar', dict(ana, para='beto@og.hn', texto='hola'))
        assert st == 200, '/enviar: %s %s' % (st, r)
        st, r = post(base, '/conversaciones', dict(beto))
        c = [x for x in r['conversaciones'] if x['correo'] == 'ana@og.hn'][0]
        assert c.get('gid') == gid2, 'la conversación no trae el gid de Ana: %s' % c
        st, r = post(base, '/conversaciones', dict(ana))
        c = [x for x in r['conversaciones'] if x['correo'] == 'beto@og.hn'][0]
        assert c.get('gid') == '', 'sin gid la conversación lleva vacío: %s' % c

        print('TODO BIEN: alta con gid recortado, búsqueda por empieza-por en '
              'minúsculas, ficha con gid, perfil que lo cambia y mata el viejo, '
              'alta del dueño que lo actualiza, y la cuenta sin gid intacta.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == '__main__':
    main()
