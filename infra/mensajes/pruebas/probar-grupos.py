#!/usr/bin/env python3
"""Prueba de punta a punta de los grupos y del pago (infra/mensajes/servidor.py).

Levanta el relevo REAL en un puerto libre con datos en un directorio temporal
y comprueba lo que AURO CHAT necesita que sea verdad:
  1. /perfil pone nombre y foto, y /ficha los devuelve;
  2. /grupo/crear da un id 'g:'+16hex y una invitación de 24hex, y mete de
     entrada a los miembros que se le pasan;
  3. quien tiene la invitación entra por /grupo/unirse;
  4. un mensaje al grupo lo ven TODOS los miembros, con su 'de' para saber
     quién habla, y sale en el /conversaciones de cada uno mezclado con las
     personas y ordenado por lo último dicho;
  5. quien NO es del grupo se estrella con 403 tanto al leer como al escribir
     — y sigue estrellándose después de salirse, que es la parte que importa:
     la pertenencia se mira en cada petición, no al entrar;
  6. renombrar es solo del admin; regenerar la invitación mata la vieja;
  7. al salir el admin hereda el miembro más antiguo, y el último en salir se
     lleva el grupo (y sus mensajes) con él;
  8. /pago deja en el hilo un mensaje tipo:'pago' con monto, moneda y hash, y
     rechaza lo que no es un monto;
  9. las rutas de dos tramos aguantan el prefijo con el que las sirve Caddy
     (/mensajes/grupo/info) y el tope de 200 grupos por persona se cumple.

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


def hex_de(x, n):
    return len(x) == n and all(c in '0123456789abcdef' for c in x)


def main():
    tmp = tempfile.mkdtemp(prefix='mensajes-grupos-')
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

        # cuatro personas de verdad, con su llave cada una
        firmas = {}
        for correo, nombre in (('ana@og.hn', 'Ana'), ('beto@og.hn', 'Beto'),
                               ('carla@og.hn', 'Carla'), ('dora@og.hn', 'Dora')):
            st, r = post(base, '/alta', {'correo': correo, 'nombre': nombre})
            assert st == 200 and r.get('llave'), 'alta de %s: %s %s' % (correo, st, r)
            firmas[correo] = {'correo': correo, 'llave': r['llave']}
        ana, beto = firmas['ana@og.hn'], firmas['beto@og.hn']
        carla, dora = firmas['carla@og.hn'], firmas['dora@og.hn']
        # Desde que existe el circulo hay que aceptarse para poder
        # escribirse. No es ruido de la prueba: es el mismo paso que
        # da una persona en la app antes de su primer mensaje.
        for uno in firmas:
            for otro in firmas:
                if uno < otro:
                    post(base, '/amistad/pedir', dict(firmas[uno], para=otro))
                    post(base, '/amistad/responder',
                         dict(firmas[otro], de=uno, aceptar=True))

        # 1) perfil: nombre y foto (la foto es el id de un adjunto ya subido)
        st, r = post(base, '/subir', dict(ana, nombre='cara.png', tipo='imagen',
                     mime='image/png', datos='aGVsbG8gZm90bw=='))
        assert st == 200 and hex_de(r.get('id', ''), 32), '/subir: %s %s' % (st, r)
        cara = r['id']
        st, r = post(base, '/perfil', dict(ana, nombre='Ana G.', foto=cara))
        assert st == 200 and r.get('ok'), '/perfil: %s %s' % (st, r)
        st, r = post(base, '/ficha', dict(beto, de='ana@og.hn'))
        assert st == 200 and r.get('foto') == cara and r.get('nombre') == 'Ana G.', \
            '/ficha no trae el perfil nuevo: %s %s' % (st, r)
        # una foto inventada no se guarda: pintaría un hueco gris para siempre
        st, r = post(base, '/perfil', dict(ana, foto='f' * 32))
        st, r = post(base, '/ficha', dict(beto, de='ana@og.hn'))
        assert r.get('foto') == '', 'una foto con id inventado no debía guardarse: %s' % r
        post(base, '/perfil', dict(ana, foto=cara))

        # 2) crear el grupo con Beto dentro desde el minuto uno
        st, g = post(base, '/grupo/crear', dict(ana, nombre='Junta de Orden',
                     foto=cara, miembros=['beto@og.hn', 'nadie@og.hn']))
        assert st == 200, '/grupo/crear: %s %s' % (st, g)
        gid, inv = g['id'], g['invitacion']
        assert gid.startswith('g:') and hex_de(gid[2:], 16), 'id de grupo raro: %r' % gid
        assert hex_de(inv, 24), 'invitación rara: %r' % inv

        st, r = post(base, '/grupo/info', dict(beto, id=gid))
        assert st == 200 and r['admin'] == 'ana@og.hn' and r['nombre'] == 'Junta de Orden', \
            '/grupo/info: %s %s' % (st, r)
        # en producción Caddy entrega el camino con su prefijo (/mensajes/…) y
        # las rutas de grupo tienen DOS tramos: si el enrutado se quedara con
        # el último, /mensajes/grupo/info se leería como '/info' y no existiría
        st, r2 = post(base, '/mensajes/grupo/info', dict(beto, id=gid))
        assert st == 200 and r2 == r, 'la ruta con prefijo de Caddy no resuelve: %s %s' % (st, r2)
        assert r['foto'] == cara and r['invitacion'] == inv, 'info incompleta: %s' % r
        assert [m['correo'] for m in r['miembros']] == ['ana@og.hn', 'beto@og.hn'], \
            'miembros mal (nadie@ no existe y no debía entrar): %s' % r['miembros']
        assert r['miembros'][0]['nombre'] == 'Ana G.' and r['miembros'][0]['foto'] == cara, \
            'la ficha del miembro no viaja: %s' % r['miembros'][0]

        # 3) Carla entra por la invitación (enlace o QR: el token es el permiso)
        st, r = post(base, '/grupo/unirse', dict(carla, invitacion=inv))
        assert st == 200 and r['id'] == gid and r['nombre'] == 'Junta de Orden', \
            '/grupo/unirse: %s %s' % (st, r)
        # abrir el enlace dos veces no es un error, se entra igual
        st, r = post(base, '/grupo/unirse', dict(carla, invitacion=inv))
        assert st == 200 and r['id'] == gid, 'unirse dos veces debía dar igual: %s %s' % (st, r)
        st, r = post(base, '/grupo/unirse', dict(dora, invitacion='0' * 24))
        assert st == 404, 'una invitación inventada debía dar 404, dio %s %s' % (st, r)

        # 4) un mensaje al grupo lo ven todos, con su 'de'
        st, r = post(base, '/enviar', dict(ana, para=gid, texto='arrancamos'))
        assert st == 200 and r.get('ok'), '/enviar al grupo: %s %s' % (st, r)
        st, r = post(base, '/enviar', dict(carla, para=gid, texto='aquí estoy'))
        assert st == 200, 'un miembro nuevo debe poder escribir: %s %s' % (st, r)
        for quien_, firma in (('beto', beto), ('carla', carla), ('ana', ana)):
            st, r = post(base, '/bandeja', dict(firma, desde=gid))
            assert st == 200 and len(r['mensajes']) == 2, \
                '%s no ve el hilo del grupo: %s %s' % (quien_, st, r)
            assert [m['de'] for m in r['mensajes']] == ['ana@og.hn', 'carla@og.hn'], \
                'sin el "de" no se sabe quién habla: %s' % r['mensajes']

        # el grupo sale en /conversaciones mezclado con las personas y ordenado
        # por lo último dicho; el mensaje suelto de Dora es lo más reciente
        post(base, '/enviar', dict(dora, para='beto@og.hn', texto='hola beto'))
        st, r = post(base, '/conversaciones', dict(beto))
        assert st == 200, '/conversaciones: %s %s' % (st, r)
        c = r['conversaciones']
        assert [x['correo'] for x in c] == ['dora@og.hn', gid], \
            'orden por lo último dicho roto: %s' % [x['correo'] for x in c]
        cg = c[1]
        assert cg.get('esGrupo') and cg['nombre'] == 'Junta de Orden' \
            and cg['foto'] == cara and cg['miembros'] == 3, 'el grupo mal pintado: %s' % cg
        assert cg['ultimo']['texto'] == 'aquí estoy' and cg['sinLeer'] == 2, \
            'último/sinLeer del grupo mal: %s' % cg
        st, r = post(base, '/leido', dict(beto, de=gid))
        assert st == 200, '/leido de un grupo: %s %s' % (st, r)
        st, r = post(base, '/conversaciones', dict(beto))
        cg = [x for x in r['conversaciones'] if x['correo'] == gid][0]
        assert cg['sinLeer'] == 0, '/leido no bajó el contador del grupo: %s' % cg

        # 5) quien no es del grupo se estrella, lea o escriba
        for ruta, cuerpo in (('/bandeja', dict(dora, desde=gid)),
                             ('/enviar', dict(dora, para=gid, texto='me cuelo')),
                             ('/grupo/info', dict(dora, id=gid)),
                             ('/leido', dict(dora, de=gid)),
                             ('/pago', dict(dora, para=gid, monto='5'))):
            st, r = post(base, ruta, cuerpo)
            assert st == 403, '%s de un extraño debía dar 403, dio %s %s' % (ruta, st, r)
        # y un grupo que no existe se responde igual, para no delatar cuáles sí
        st, r = post(base, '/grupo/info', dict(dora, id='g:' + 'a' * 16))
        assert st == 403, 'un grupo inexistente debía dar 403, dio %s %s' % (st, r)

        # 6) renombrar es cosa del admin
        st, r = post(base, '/grupo/editar', dict(beto, id=gid, nombre='Mi grupo'))
        assert st == 403, 'un miembro no admin no debía renombrar, dio %s %s' % (st, r)
        st, r = post(base, '/grupo/editar', dict(ana, id=gid, nombre='Junta AURO'))
        assert st == 200 and r.get('ok'), '/grupo/editar del admin: %s %s' % (st, r)
        st, r = post(base, '/grupo/info', dict(beto, id=gid))
        assert r['nombre'] == 'Junta AURO', 'el nombre no cambió: %s' % r
        # nombres largos: se recortan a 64, no revientan
        st, r = post(base, '/grupo/editar', dict(ana, id=gid, nombre='x' * 200))
        st, r = post(base, '/grupo/info', dict(ana, id=gid))
        assert r['nombre'] == 'x' * 64, 'el nombre no se recortó a 64: %d' % len(r['nombre'])
        post(base, '/grupo/editar', dict(ana, id=gid, nombre='Junta AURO'))

        # invitar: puede cualquier miembro, y cuenta a los que entraron
        st, r = post(base, '/grupo/invitar', dict(beto, id=gid,
                     correos=['dora@og.hn', 'ana@og.hn', 'fantasma@og.hn']))
        assert st == 200 and r.get('añadidos') == 1, \
            'solo Dora era añadible: %s %s' % (st, r)
        st, r = post(base, '/bandeja', dict(dora, desde=gid))
        assert st == 200 and len(r['mensajes']) == 2, 'Dora ya es del grupo: %s %s' % (st, r)

        # 6b) regenerar la invitación mata la vieja
        st, r = post(base, '/grupo/editar', dict(ana, id=gid, nuevaInvitacion=True))
        assert st == 200 and hex_de(r.get('invitacion', ''), 24), 'no dio invitación nueva: %s' % r
        inv2 = r['invitacion']
        assert inv2 != inv, 'la invitación regenerada es la misma'
        st, r = post(base, '/grupo/salir', dict(dora, id=gid))
        assert st == 200, 'Dora sale para probar la invitación vieja: %s %s' % (st, r)
        st, r = post(base, '/grupo/unirse', dict(dora, invitacion=inv))
        assert st == 404, 'la invitación vieja debía estar muerta, dio %s %s' % (st, r)
        st, r = post(base, '/bandeja', dict(dora, desde=gid))
        assert st == 403, 'salirse corta la lectura EN EL ACTO, dio %s %s' % (st, r)
        st, r = post(base, '/grupo/unirse', dict(dora, invitacion=inv2))
        assert st == 200 and r['id'] == gid, 'la invitación nueva debía abrir: %s %s' % (st, r)
        # un grupo del que me fui deja de asomar en mi lista
        post(base, '/grupo/salir', dict(dora, id=gid))
        st, r = post(base, '/conversaciones', dict(dora))
        assert [x['correo'] for x in r['conversaciones']] == ['beto@og.hn'], \
            'el grupo abandonado sigue en la lista: %s' % r['conversaciones']

        # 7) el pago en la conversación
        st, r = post(base, '/pago', dict(ana, para=gid, monto='125.5',
                     hash='0x' + 'ab' * 32, nota='el aporte'))
        assert st == 200 and r.get('ok'), '/pago: %s %s' % (st, r)
        m = r['mensaje']
        assert m['tipo'] == 'pago' and m['monto'] == '125.5' and m['moneda'] == 'ORIGEN' \
            and m['hash'] == '0x' + 'ab' * 32 and m['texto'] == 'el aporte' \
            and m['de'] == 'ana@og.hn' and m['para'] == gid and m['cuando'] > 0, \
            'la tarjeta de pago no tiene su forma: %s' % m
        st, r = post(base, '/bandeja', dict(carla, desde=gid))
        assert r['mensajes'][-1]['tipo'] == 'pago', 'el pago no está en el hilo: %s' % r['mensajes'][-1]
        # el pago de persona a persona también, y con su moneda
        st, r = post(base, '/pago', dict(ana, para='beto@og.hn', monto='0.000001',
                     moneda='usdt'))
        assert st == 200 and r['mensaje']['moneda'] == 'USDT', '/pago 1 a 1: %s %s' % (st, r)
        st, r = post(base, '/bandeja', dict(beto, desde='ana@og.hn'))
        assert len(r['mensajes']) == 1 and r['mensajes'][0]['monto'] == '0.000001', \
            'el pago 1 a 1 no llegó: %s' % r['mensajes']
        for malo, por in (({'monto': '0'}, 'cero'), ({'monto': 'mucho'}, 'texto'),
                          ({'monto': '-3'}, 'negativo'),
                          ({'monto': '1', 'hash': 'no-es-un-hash'}, 'hash roto')):
            st, r = post(base, '/pago', dict(ana, para='beto@og.hn', **malo))
            assert st == 400, 'un pago con %s debía dar 400, dio %s %s' % (por, st, r)

        # 8) herencia de admin: sale Ana (la creadora) y hereda Beto, que entró
        # antes que Carla
        st, r = post(base, '/grupo/salir', dict(ana, id=gid))
        assert st == 200 and r.get('ok'), '/grupo/salir del admin: %s %s' % (st, r)
        st, r = post(base, '/grupo/info', dict(carla, id=gid))
        assert st == 200 and r['admin'] == 'beto@og.hn', \
            'el más antiguo no heredó: %s %s' % (st, r)
        assert [m['correo'] for m in r['miembros']] == ['beto@og.hn', 'carla@og.hn'], \
            'la lista de miembros no soltó a Ana: %s' % r['miembros']
        st, r = post(base, '/bandeja', dict(ana, desde=gid))
        assert st == 403, 'el admin que se fue ya no lee, dio %s %s' % (st, r)
        st, r = post(base, '/grupo/editar', dict(beto, id=gid, nombre='Junta de Beto'))
        assert st == 200, 'el heredero debe poder renombrar: %s %s' % (st, r)

        # el último en salir se lleva el grupo y sus mensajes
        post(base, '/grupo/salir', dict(beto, id=gid))
        st, r = post(base, '/grupo/salir', dict(carla, id=gid))
        assert st == 200, 'el último sale: %s %s' % (st, r)
        st, r = post(base, '/grupo/unirse', dict(dora, invitacion=inv2))
        assert st == 404, 'el grupo vacío debía desaparecer, dio %s %s' % (st, r)
        st, r = post(base, '/conversaciones', dict(carla))
        assert r['conversaciones'] == [], 'quedaron restos del grupo muerto: %s' % r

        # 9) el tope de 200 grupos por persona: se comprueba de verdad, porque
        # es lo que impide que una cuenta llene el JSON de todos
        for i in range(200):
            st, r = post(base, '/grupo/crear', dict(dora, nombre='g%d' % i))
            assert st == 200, 'grupo %d de Dora: %s %s' % (i, st, r)
        st, r = post(base, '/grupo/crear', dict(dora, nombre='el 201'))
        assert st == 409, 'el grupo 201 debía dar 409, dio %s %s' % (st, r)
        st, r = post(base, '/grupo/crear', dict(carla, nombre='con Dora dentro',
                     miembros=['dora@og.hn']))
        assert st == 200 and r.get('id'), 'Carla sí puede crear: %s %s' % (st, r)
        st, r = post(base, '/grupo/info', dict(carla, id=r['id']))
        assert [m['correo'] for m in r['miembros']] == ['carla@og.hn'], \
            'a Dora, con sus 200 grupos, no debían meterla: %s' % r['miembros']

        # ── LAS LLAVES DE UN COMPANERO DE GRUPO QUE NO ES MI AMIGO ────
        #
        # Todo lo de arriba corre con las cuatro personas hechas amigas entre
        # si, y ese montaje TAPABA el fallo: `/llaves/de` no tenia rama de
        # grupo, aunque su propio comentario prometia «y los companeros de un
        # grupo del que soy» desde el primer dia.
        #
        # Sin esa rama, en un grupo de gente que no se habia escrito antes
        # —el caso normal de un grupo nuevo— pasaban dos cosas, las dos
        # calladas: los miembros que no eran tus amigos veian «Cifrado para
        # otro de tus aparatos» en CADA mensaje del grupo, y si no habia
        # ningun amigo dentro, lo unico que devolvia era TU PROPIA llave — el
        # cliente hacia el sobre para si mismo y daba el mensaje por cifrado.
        # Un mensaje que no puede abrir nadie, dado por bueno.
        #
        # Por eso aqui se usan personas nuevas, SIN amistad ninguna.
        for correo, nombre in (('eva@og.hn', 'Eva'), ('fito@og.hn', 'Fito')):
            st, r = post(base, '/alta', {'correo': correo, 'nombre': nombre})
            assert st == 200, 'alta de %s: %s %s' % (correo, st, r)
            firmas[correo] = {'correo': correo, 'llave': r['llave']}
        eva, fito = firmas['eva@og.hn'], firmas['fito@og.hn']
        for quien, ident in ((eva, 'ap-eva'), (fito, 'ap-fito')):
            st, r = post(base, '/llaves/publicar',
                         dict(quien, id=ident, pub='B' + ident, fir='F' + ident))
            assert st == 200, 'publicar de %s: %s %s' % (ident, st, r)
        # No son amigos y nunca se escribieron: sin grupo, no hay llaves.
        st, r = post(base, '/llaves/de', dict(eva, correos=['fito@og.hn']))
        assert st == 200 and not r.get('llaves'), \
            'sin grupo ni amistad NO se entregan llaves: %s' % r
        st, r = post(base, '/grupo/crear', dict(eva, nombre='recien conocidos',
                     miembros=['fito@og.hn']))
        assert st == 200 and r.get('id'), 'grupo de Eva y Fito: %s %s' % (st, r)
        st, r = post(base, '/llaves/de', dict(eva, correos=['fito@og.hn']))
        assert st == 200 and r.get('llaves', {}).get('fito@og.hn'), \
            'companero de grupo: SI se entregan sus llaves: %s' % r
        # Y la vuelta: Fito tiene que poder cerrarle a Eva, o sus mensajes al
        # grupo saldrian con el sobre hecho solo para el mismo.
        st, r = post(base, '/llaves/de', dict(fito, correos=['eva@og.hn']))
        assert st == 200 and r.get('llaves', {}).get('eva@og.hn'), \
            'y en el otro sentido igual: %s' % r
        # Lo que NO cambia: alguien de fuera del grupo sigue sin tocarlas.
        st, r = post(base, '/llaves/de', dict(dora, correos=['fito@og.hn']))
        assert st == 200 and not r.get('llaves'), \
            'quien no comparte grupo ni amistad sigue sin llaves: %s' % r

        print('TODO BIEN: perfil con foto, grupo creado, invitación, hilo compartido, '
              '403 al de fuera, admin único que edita, invitación regenerada, salida, '
              'herencia de admin, tarjeta de pago y tope de 200 grupos.')
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == '__main__':
    main()
