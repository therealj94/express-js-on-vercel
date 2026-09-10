#!/usr/bin/env python3
"""Prueba de vaciar y quitar una conversación (/olvidar) y de la foto en las listas.

Lo que se pide en pantalla es «borrar la conversación» y «vaciar el chat». Lo
que se puede hacer de verdad es otra cosa, y esta prueba fija la diferencia
para que nadie la confunda después: el hilo es de DOS, y una cuenta solo
decide sobre SU vista. Así que no se borra nada — se pone un corte con la
fecha de hoy y de ahí para atrás esta cuenta ya no lo ve. La otra conserva su
copia entera. Si algún día alguien cambia esto por un borrado de verdad, esta
prueba tiene que fallar, porque sería otra promesa.

Lo que tiene que ser verdad:

  1. vaciar deja el hilo en cero PARA MÍ y no toca el de la otra persona;
  2. lo de después del corte sí se ve: vaciar no es dejar de recibir;
  3. `quitar` saca la fila de mi lista, y `vaciar` la deja vacía pero puesta;
  4. una fila quitada VUELVE sola cuando llega un mensaje nuevo;
  5. no se puede vaciar el hilo de un grupo del que no soy;
  6. la foto de una persona viaja en /conversaciones y en /buscar (antes solo
     salía en /ficha, y las listas se pintaban sin cara).

Sin dependencias fuera de la stdlib.
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
    carpeta = tempfile.mkdtemp(prefix='relevo-olvidar-')
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

    try:
        _, a = pedir(base, '/alta', {'correo': 'ana@prueba.local', 'nombre': 'Ana'})
        _, bo = pedir(base, '/alta', {'correo': 'beto@prueba.local', 'nombre': 'Beto'})
        ana = {'correo': 'ana@prueba.local', 'llave': a['llave']}
        beto = {'correo': 'beto@prueba.local', 'llave': bo['llave']}
        # Desde que existe el circulo hay que aceptarse para poder
        # escribirse. No es ruido de la prueba: es el mismo paso que
        # da una persona en la app antes de su primer mensaje.
        pedir(base, '/amistad/pedir', {**ana, 'para': 'beto@prueba.local'})
        pedir(base, '/amistad/responder', {**beto, 'de': 'ana@prueba.local',
                                          'aceptar': True})

        # una foto de verdad: se sube y se pone en el perfil de Beto
        png = ('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8'
               'z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
        e, sub = pedir(base, '/subir', {**beto, 'tipo': 'imagen', 'datos': png,
                                        'mime': 'image/png', 'nombre': 'yo.png'})
        assert e == 200 and sub.get('id'), 'no se pudo subir la foto: %s %s' % (e, sub)
        e, _ = pedir(base, '/perfil', {**beto, 'foto': sub['id']})
        assert e == 200, 'no se pudo poner la foto de perfil: %s' % e

        # tres mensajes viejos
        for txt in ('uno', 'dos', 'tres'):
            pedir(base, '/enviar', {**ana, 'para': beto['correo'], 'texto': txt})

        e, d = pedir(base, '/bandeja', {**ana, 'desde': beto['correo']})
        assert len(d['mensajes']) == 3, 'no se guardaron los tres: %s' % d

        # 6 · la foto viaja en las listas, no solo en /ficha
        e, d = pedir(base, '/conversaciones', ana)
        fila = next(x for x in d['conversaciones'] if x['correo'] == beto['correo'])
        assert fila.get('foto') == sub['id'], 'la foto no viaja en /conversaciones: %s' % fila
        e, d = pedir(base, '/buscar', {**ana, 'q': 'beto'})
        assert d['gente'] and d['gente'][0].get('foto') == sub['id'], \
            'la foto no viaja en /buscar: %s' % d

        # 1 · vaciar: mi hilo queda en cero
        time.sleep(0.01)
        e, _ = pedir(base, '/olvidar', {**ana, 'con': beto['correo']})
        assert e == 200, 'no dejó vaciar: %s' % e
        e, d = pedir(base, '/bandeja', {**ana, 'desde': beto['correo']})
        assert d['mensajes'] == [], 'el hilo de Ana no quedó vacío: %s' % d

        # 1b · y el de Beto queda ENTERO: nadie borra lo de otro
        e, d = pedir(base, '/bandeja', {**beto, 'desde': ana['correo']})
        assert len(d['mensajes']) == 3, 'se le borró el hilo a Beto: %s' % d

        # 3 · vaciar (sin quitar) deja la fila puesta, pero vacía
        e, d = pedir(base, '/conversaciones', ana)
        fila = [x for x in d['conversaciones'] if x['correo'] == beto['correo']]
        assert fila, 'vaciar hizo desaparecer la fila; eso era «quitar»'
        assert fila[0]['ultimo'] is None, 'la fila vaciada sigue enseñando el último: %s' % fila[0]

        # 2 · lo NUEVO sí se ve: vaciar no es dejar de recibir
        time.sleep(0.01)
        pedir(base, '/enviar', {**beto, 'para': ana['correo'], 'texto': 'después del corte'})
        e, d = pedir(base, '/bandeja', {**ana, 'desde': beto['correo']})
        assert [m['texto'] for m in d['mensajes']] == ['después del corte'], \
            'el mensaje nuevo no llegó, o volvieron los viejos: %s' % d

        # 3b · quitar: la fila se va de la lista
        time.sleep(0.01)
        e, _ = pedir(base, '/olvidar', {**ana, 'con': beto['correo'], 'quitar': True})
        assert e == 200
        e, d = pedir(base, '/conversaciones', ana)
        assert not [x for x in d['conversaciones'] if x['correo'] == beto['correo']], \
            'la conversación quitada sigue en la lista'

        # 4 · y vuelve sola cuando llega algo nuevo
        time.sleep(0.01)
        pedir(base, '/enviar', {**beto, 'para': ana['correo'], 'texto': 'volví'})
        e, d = pedir(base, '/conversaciones', ana)
        fila = [x for x in d['conversaciones'] if x['correo'] == beto['correo']]
        assert fila, 'un mensaje nuevo no devolvió la conversación a la lista'
        assert fila[0]['ultimo']['texto'] == 'volví'
        assert fila[0]['sinLeer'] == 1, 'el mensaje nuevo no cuenta como sin leer: %s' % fila[0]

        # 5 · un grupo ajeno no se toca
        e, g = pedir(base, '/grupo/crear', {**beto, 'nombre': 'Solo Beto'})
        assert e == 200
        e, _ = pedir(base, '/olvidar', {**ana, 'con': g['id']})
        assert e == 403, 'Ana pudo vaciar el hilo de un grupo del que no es: %s' % e

        # y sin `con` no hay nada que vaciar
        e, _ = pedir(base, '/olvidar', ana)
        assert e == 400, 'aceptó un /olvidar sin destinatario: %s' % e

        print('TODO BIEN: vaciar deja mi hilo en cero sin tocar el de la otra persona, '
              'lo nuevo sigue llegando, quitar saca la fila y un mensaje la devuelve, '
              'el grupo ajeno no se toca, y la foto ya viaja en las listas.')
        return 0
    finally:
        relevo.terminate()


if __name__ == '__main__':
    sys.exit(main())
