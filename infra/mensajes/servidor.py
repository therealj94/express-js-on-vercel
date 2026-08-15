#!/usr/bin/env python3
"""El relevo de mensajes de Orden Global. Pequeño a propósito.

Guarda y entrega los mensajes del chat de la app. Python de la biblioteca
estándar, sin una sola dependencia: en el nodo del cerebro no hay npm y no
va a haberlo por un chat.

El modelo de identidad, dicho sin adornos:
  · el alta declara un correo y devuelve una LLAVE aleatoria;
  · la llave firma cada petición siguiente de ese correo;
  · el PRIMER alta de un correo se lo queda — quien llegue después con el
    mismo correo y otra llave, no entra.
Eso protege el buzón de un correo ya dado de alta, pero NO impide darse de
alta con el correo de otro ANTES que él. Cerrarlo de verdad exige verificar
la sesión de la wallet (PASS_TOKEN), y ese secreto está en la lista de la
Junta para rotarse (tarea 27): cuando se rote, aquí se añade la
comprobación. Escrito en el LEEME y dicho en la entrega — no es E2E y no se
promete E2E.

Los grupos ('g:'+16hex) son la segunda mitad de AURO CHAT. Dos permisos y
nada más: ser MIEMBRO (leer y escribir en el hilo) y ser ADMIN (renombrar,
cambiar la foto, regenerar la invitación). La invitación es una capability:
el token de 24 hex ES el permiso de entrar, y regenerarlo invalida el
anterior — sin listas de invitados que mantener. La pertenencia se comprueba
en CADA petición, nunca solo al abrir el hilo: quien sale del grupo deja de
leer en el mismo instante.

El /pago no mueve dinero: NEXUS jamás transmite. La wallet firma y transmite,
la cadena confirma, y solo DESPUÉS el relevo deja el comprobante en el hilo.

Corre detrás de Caddy en /mensajes/*. Estado en un JSON con candado; a
este tamaño (mensajes de texto entre cientos de usuarios) sobra. Los
adjuntos (imagen/video/archivo, ≤8MB) van como binarios en disco y se
sirven por GET /archivo/<id>: el id aleatorio largo es el permiso.
"""
import base64, json, os, re, secrets, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RUTA = os.environ.get('MENSAJES_DATOS', '/srv/mensajes/datos.json')
# Los adjuntos (imagen/video/archivo) viven como binarios sueltos al lado del
# JSON — meter megas en el JSON lo volvería ilegible e imposible de guardar
# atómicamente rápido. El mime y el nombre de cada uno sí van en el JSON.
CARPETA_ARCHIVOS = os.environ.get(
    'MENSAJES_ARCHIVOS', os.path.join(os.path.dirname(RUTA) or '.', 'archivos'))
TOPE_TEXTO = 2000          # un mensaje no es un documento
TOPE_BANDEJA = 200         # lo último; el histórico completo no viaja entero
TOPE_ARCHIVO = 8_000_000   # 8MB por adjunto: chat, no disco duro ajeno
# El POST normal sigue en 64KB; solo /subir necesita tragar el base64 de un
# adjunto de 8MB (≈10.7MB) más la envoltura JSON. Subir el tope global habría
# abierto todas las rutas a cuerpos gigantes sin motivo.
TOPE_POST = 64_000
TOPE_POST_SUBIR = 11_000_000
TOPE_NOMBRE = 64           # el nombre de un grupo cabe en la cabecera del hilo
TOPE_GRUPOS = 200          # ningún usuario en más de 200 grupos
# El JSON entero se reescribe en cada mensaje: un grupo de miles de miembros
# haría lento cada guardado de todo el relevo. 500 sobra para lo que esto es.
TOPE_MIEMBROS = 500
ID_ARCHIVO = re.compile(r'[0-9a-f]{32}')
ID_GRUPO = re.compile(r'g:[0-9a-f]{16}')
candado = threading.Lock()

# Los navegadores no dejan a una página llamar a otro dominio si el dominio no
# lo autoriza. La app nativa nunca tuvo que pedir permiso —fetch en React
# Native no aplica CORS— y por eso el relevo vivió sin esto: el chat de la web
# recibía la respuesta y el navegador la tiraba a la basura antes de que el
# código la viera. Es una lista corta y cerrada; con '*' cualquier página
# ajena podría hablar por el relevo desde el navegador de quien la visite.
ORIGENES = {
    'https://www.vetawallet.com',
    'https://vetawallet.com',
    'https://app.vetawallet.com',
    'https://main.d289v5ffkexk23.amplifyapp.com',   # el ensayo
    'http://localhost:8899',                        # y el escritorio de quien lo hace
    'http://127.0.0.1:8899',
}


def cargar():
    try:
        with open(RUTA, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {'fichas': {}, 'mensajes': []}


def guardar(d):
    tmp = RUTA + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
    os.replace(tmp, RUTA)


def correo_valido(x):
    return bool(re.fullmatch(r'[^@\s]{1,64}@[^@\s]{3,255}', str(x or '').lower()))


def foto_valida(d, x):
    """Una foto es el id de un adjunto YA subido por /subir. Un id inventado
    se descarta en vez de guardarse: pintaría un hueco gris en cada lista y
    nadie sabría por qué. Cadena vacía = sin foto, y así se quita."""
    x = str(x or '')
    return x if (ID_ARCHIVO.fullmatch(x) and x in d.get('archivos', {})) else ''


def miembro(g, correo):
    return any(m['correo'] == correo for m in g.get('miembros', []))


def grupo_de(d, gid, correo):
    """El grupo, pero solo si quien firma es miembro AHORA. Un grupo que no
    existe y un grupo del que no soy miembro devuelven lo mismo (None → 403)
    a propósito: quien pruebe ids al azar no averigua cuáles existen."""
    g = d.get('grupos', {}).get(str(gid or ''))
    return g if (g and miembro(g, correo)) else None


def cuantos_grupos(d, correo):
    return sum(1 for g in d.get('grupos', {}).values() if miembro(g, correo))


def sumar_miembros(d, g, correos, ahora):
    """Mete en el grupo a los correos que se pueda y devuelve cuántos entraron.

    Solo gente ya dada de alta en el relevo: un correo sin ficha no podría
    leer nada y dejaría un miembro fantasma, sin nombre ni foto, en la ficha
    del grupo. Los que ya están, los que no caben y los que llegaron a sus
    200 grupos se saltan en silencio — invitar a diez y que entren siete no
    es un error, por eso la respuesta cuenta los añadidos.
    """
    n = 0
    for c in (correos if isinstance(correos, list) else [])[:TOPE_MIEMBROS]:
        c = str(c).lower()
        if not correo_valido(c) or c not in d['fichas'] or miembro(g, c):
            continue
        if len(g['miembros']) >= TOPE_MIEMBROS or cuantos_grupos(d, c) >= TOPE_GRUPOS:
            continue
        g['miembros'].append({'correo': c, 'desde': ahora})
        n += 1
    return n


class Relevo(BaseHTTPRequestHandler):
    server_version = 'relevo/1'

    def _permiso(self):
        """Autoriza al navegador, si quien pregunta es una de nuestras webs."""
        o = self.headers.get('Origin')
        if o in ORIGENES:
            self.send_header('Access-Control-Allow-Origin', o)
            # el origen decide la respuesta, asi que las caches intermedias
            # tienen que guardar una copia por origen y no mezclarlas
            self.send_header('Vary', 'Origin')

    def _json(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(datos)))
        self._permiso()
        self.end_headers()
        self.wfile.write(datos)

    def do_OPTIONS(self):
        # El vuelo previo: el navegador pregunta antes de mandar el POST de
        # verdad porque lleva Content-Type: application/json. Sin esto, el
        # POST ni sale.
        self.send_response(204)
        self._permiso()
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def log_message(self, *a):   # el journal no necesita cada GET
        pass

    def do_GET(self):
        if self.path.rstrip('/').endswith('/salud'):
            return self._json(200, {'vivo': True, 'cuando': int(time.time())})
        # GET /archivo/<id> — SIN llave a propósito: el id son 32 hex al azar
        # (128 bits) y ES el permiso (capability URL). Así el visor de la app,
        # el navegador o un reproductor externo lo abren sin sesión, igual que
        # un enlace de foto de cualquier chat. Adivinar un id no es viable.
        partes = [p for p in self.path.split('?')[0].split('/') if p]
        if len(partes) >= 2 and partes[-2] == 'archivo' and ID_ARCHIVO.fullmatch(partes[-1]):
            return self._archivo(partes[-1])
        return self._json(404, {'error': 'no existe'})

    def _archivo(self, iid):
        with candado:
            meta = cargar().get('archivos', {}).get(iid)
        try:
            # el id ya pasó el regex estricto: no hay ../ ni sorpresas de ruta
            with open(os.path.join(CARPETA_ARCHIVOS, iid + '.bin'), 'rb') as fh:
                cuerpo = fh.read()
        except OSError:
            meta = None
        if not meta:
            return self._json(404, {'error': 'no existe'})
        self.send_response(200)
        self.send_header('Content-Type', meta.get('mime') or 'application/octet-stream')
        self.send_header('Content-Length', str(len(cuerpo)))
        # nombre saneado a ASCII simple: es solo cortesía para el "guardar
        # como" del navegador, no vale la pena la coreografía RFC 5987
        nombre = re.sub(r'[^A-Za-z0-9._ -]', '_', meta.get('nombre') or iid)[:80]
        self.send_header('Content-Disposition', 'inline; filename="%s"' % nombre)
        # el binario de un id jamás cambia: que el teléfono lo cachee y no
        # vuelva a bajar la misma foto en cada scroll del hilo
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        self._permiso()
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_POST(self):
        # la ruta se decide ANTES de leer el cuerpo: el tope grande es solo
        # para /subir y el resto de rutas conserva su límite de siempre.
        # Se lee por el final porque delante puede venir el prefijo de Caddy
        # (/mensajes/...); 'grupo' es la única familia de dos niveles.
        partes = [p for p in self.path.split('?')[0].split('/') if p]
        ruta = '/' + (partes[-1] if partes else '')
        if len(partes) >= 2 and partes[-2] == 'grupo':
            ruta = '/grupo/' + partes[-1]
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n > (TOPE_POST_SUBIR if ruta == '/subir' else TOPE_POST):
                return self._json(413, {'error': 'muy grande'})
            b = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return self._json(400, {'error': 'json inválido'})

        with candado:
            d = cargar()
            fichas = d['fichas']

            if ruta == '/alta':
                correo = str(b.get('correo', '')).lower()
                if not correo_valido(correo):
                    return self._json(400, {'error': 'correo inválido'})
                f = fichas.get(correo)
                if f is None:
                    # el gid (Genesis ID) es un identificador PÚBLICO que la
                    # persona declara, como el nombre: texto recortado y punto.
                    # Las fichas de antes de este campo no lo tienen — por eso
                    # todas las lecturas usan .get('gid', '') y nada se migra.
                    f = {'llave': secrets.token_hex(24),
                         'nombre': str(b.get('nombre', ''))[:80],
                         'addr': str(b.get('addr', ''))[:64],
                         'gid': str(b.get('gid', '')).strip()[:64],
                         'foto': foto_valida(d, b.get('foto')),
                         'desde': int(time.time())}
                    fichas[correo] = f
                    guardar(d)
                    return self._json(200, {'llave': f['llave']})
                # el correo ya existe: solo su dueño (con la llave) refresca datos
                if b.get('llave') == f['llave']:
                    f['nombre'] = str(b.get('nombre', f['nombre']))[:80]
                    f['addr'] = str(b.get('addr', f['addr']))[:64]
                    f['gid'] = str(b.get('gid', f.get('gid', ''))).strip()[:64]
                    f['foto'] = foto_valida(d, b.get('foto', f.get('foto', '')))
                    guardar(d)
                    return self._json(200, {'llave': f['llave']})
                return self._json(409, {'error': 'ese correo ya tiene llave'})

            # todo lo demás exige la llave del correo que firma
            correo = str(b.get('correo', '')).lower()
            f = fichas.get(correo)
            if not f or b.get('llave') != f['llave']:
                return self._json(401, {'error': 'llave incorrecta'})

            if ruta == '/perfil':
                # Mi nombre y mi foto, lo único mío que ve el resto. Se mira
                # si la clave VIENE, no si trae algo: mandar {foto:''} es la
                # forma de quitarse la foto, y eso no puede confundirse con
                # "no toques la foto" (que es no mandar la clave).
                if 'nombre' in b:
                    f['nombre'] = str(b.get('nombre', ''))[:80]
                if 'foto' in b:
                    f['foto'] = foto_valida(d, b.get('foto'))
                if 'gid' in b:
                    # misma regla que la foto: mandar {gid:''} lo quita, y no
                    # mandar la clave lo deja en paz
                    f['gid'] = str(b.get('gid', '')).strip()[:64]
                guardar(d)
                return self._json(200, {'ok': True})

            if ruta == '/subir':
                # Sube un adjunto y devuelve su id. El binario NO viaja en el
                # mensaje: primero se sube aquí, después /enviar referencia el
                # id. Así un adjunto reintentado no duplica megas en el hilo.
                tipo = str(b.get('tipo', ''))
                if tipo not in ('imagen', 'video', 'archivo'):
                    return self._json(400, {'error': 'tipo inválido'})
                try:
                    datos = base64.b64decode(str(b.get('datos', '')), validate=True)
                except Exception:
                    return self._json(400, {'error': 'base64 inválido'})
                if not datos:
                    return self._json(400, {'error': 'archivo vacío'})
                if len(datos) > TOPE_ARCHIVO:
                    return self._json(413, {'error': 'más de 8MB'})
                mime = str(b.get('mime', ''))[:120]
                # un mime raro no rompe nada, pero saldrá en un header HTTP:
                # si no parece "tipo/subtipo", octet-stream y a otra cosa
                if not re.fullmatch(r'[\w.+-]+/[\w.+-]+', mime):
                    mime = 'application/octet-stream'
                iid = secrets.token_hex(16)   # 32 hex = la capability URL
                os.makedirs(CARPETA_ARCHIVOS, exist_ok=True)
                with open(os.path.join(CARPETA_ARCHIVOS, iid + '.bin'), 'wb') as fh:
                    fh.write(datos)
                d.setdefault('archivos', {})[iid] = {
                    'mime': mime, 'nombre': str(b.get('nombre', ''))[:120],
                    'tipo': tipo, 'de': correo, 'peso': len(datos),
                    'cuando': int(time.time() * 1000)}
                guardar(d)
                return self._json(200, {'id': iid})

            if ruta == '/enviar':
                para = str(b.get('para', '')).lower()
                texto = str(b.get('texto', ''))[:TOPE_TEXTO].strip()
                # adjunto opcional: solo cuenta si el id existe de verdad en el
                # índice — un id inventado daría burbujas rotas en la app
                tipo = str(b.get('tipo', ''))
                archivo = str(b.get('archivo', ''))
                adj = (tipo in ('imagen', 'video', 'archivo')
                       and archivo in d.get('archivos', {}))
                if ID_GRUPO.fullmatch(para):
                    # el permiso de escribir en un grupo es ser miembro AHORA:
                    # se comprueba en cada envío, no al abrir el hilo, para que
                    # salir del grupo corte de verdad y en el acto
                    if not grupo_de(d, para, correo):
                        return self._json(403, {'error': 'no eres del grupo'})
                elif not correo_valido(para):
                    return self._json(400, {'error': 'faltan datos'})
                # un mensaje puede ser solo texto, solo adjunto, o ambos
                if not texto and not adj:
                    return self._json(400, {'error': 'faltan datos'})
                m = {'de': correo, 'para': para, 'texto': texto,
                     'cuando': int(time.time() * 1000)}
                if adj:
                    m['tipo'] = tipo
                    m['archivo'] = archivo
                    m['nombre'] = str(b.get('nombre', ''))[:120]
                d['mensajes'].append(m)
                # el histórico no crece sin límite: 20 mil mensajes rodantes
                if len(d['mensajes']) > 20_000:
                    d['mensajes'] = d['mensajes'][-20_000:]
                guardar(d)
                return self._json(200, {'ok': True})

            if ruta == '/pago':
                # El comprobante de un envío que la cadena YA confirmó. Aquí
                # no se mueve dinero ni se verifica la cadena: el relevo solo
                # deja la tarjeta en el hilo con el hash para que cualquiera
                # lo compruebe en el explorador. La wallet llama DESPUÉS de la
                # confirmación, nunca antes — un comprobante de algo que aún
                # no pasó sería una mentira firmada por nosotros.
                para = str(b.get('para', '')).lower()
                # el monto se guarda como TEXTO: pasarlo por un float de JSON
                # redondearía los decimales de ORIGEN y el comprobante diría
                # una cantidad distinta de la que firmó la persona
                monto = str(b.get('monto', '')).strip()[:32]
                if (not re.fullmatch(r'\d{1,20}(\.\d{1,18})?', monto)
                        or not any(c in '123456789' for c in monto)):
                    return self._json(400, {'error': 'monto inválido'})
                moneda = str(b.get('moneda', '') or 'ORIGEN').upper()[:12]
                if not re.fullmatch(r'[A-Z0-9]{2,12}', moneda):
                    return self._json(400, {'error': 'moneda inválida'})
                # el hash acaba dentro de una URL del explorador: si no parece
                # un hash no entra — mejor tarjeta sin enlace que enlace roto
                hh = str(b.get('hash', '')).strip()[:80]
                if hh and not re.fullmatch(r'(0x)?[0-9a-fA-F]{16,78}', hh):
                    return self._json(400, {'error': 'hash inválido'})
                if ID_GRUPO.fullmatch(para):
                    if not grupo_de(d, para, correo):
                        return self._json(403, {'error': 'no eres del grupo'})
                elif not correo_valido(para):
                    return self._json(400, {'error': 'destino inválido'})
                # tipo 'pago' solo puede nacer aquí: /enviar únicamente acepta
                # los tipos de adjunto, así que nadie fabrica un comprobante
                # falso mandando un mensaje normal con tipo:'pago'
                m = {'de': correo, 'para': para, 'tipo': 'pago',
                     'monto': monto, 'moneda': moneda,
                     'texto': str(b.get('nota', ''))[:TOPE_TEXTO].strip(),
                     'cuando': int(time.time() * 1000)}
                if hh:
                    m['hash'] = hh
                d['mensajes'].append(m)
                if len(d['mensajes']) > 20_000:
                    d['mensajes'] = d['mensajes'][-20_000:]
                guardar(d)
                # se devuelve el mensaje entero para que el hilo pinte la
                # tarjeta al instante, sin esperar a la siguiente /bandeja
                return self._json(200, {'ok': True, 'mensaje': m})

            if ruta == '/bandeja':
                desde = str(b.get('desde', '')).lower()
                if ID_GRUPO.fullmatch(desde):
                    if not grupo_de(d, desde, correo):
                        return self._json(403, {'error': 'no eres del grupo'})
                    # en un grupo el hilo es uno solo y lo comparten todos:
                    # cada mensaje lleva su 'de' para pintar quién habla
                    hilo = [m for m in d['mensajes'] if m['para'] == desde]
                else:
                    hilo = [m for m in d['mensajes']
                            if (m['de'] == correo and m['para'] == desde)
                            or (m['de'] == desde and m['para'] == correo)]
                return self._json(200, {'mensajes': hilo[-TOPE_BANDEJA:]})

            if ruta == '/buscar':
                # El directorio del ecosistema: buscar gente por nombre o
                # correo entre quienes ya tienen Genesis en el chat. Devuelve
                # poco (10) y solo lo publico: nombre, correo, direccion.
                q = str(b.get('q', '')).lower().strip()
                if len(q) < 2:
                    return self._json(200, {'gente': []})
                # el GID se busca por empieza-por, no por contiene: es un
                # identificador que se teclea del principio, no prosa donde
                # pescar trozos sueltos
                gente = [{'correo': c, 'nombre': g['nombre'], 'addr': g['addr'],
                          'gid': g.get('gid', '')}
                         for c, g in fichas.items()
                         if q in c or q in g['nombre'].lower()
                         or g.get('gid', '').lower().startswith(q)]
                gente = [x for x in gente if x['correo'] != correo][:10]
                return self._json(200, {'gente': gente})

            if ruta == '/conversaciones':
                # Todas mis charlas —personas y grupos en la misma lista, que
                # es como se usan—: con quien, lo ultimo dicho y cuantos sin
                # leer. Es lo que pinta la lista principal del chat.
                vistos = d.setdefault('vistos', {}).get(correo, {})
                grupos = d.get('grupos', {})
                mios = {gid for gid, g in grupos.items() if miembro(g, correo)}
                # los grupos entran aunque nadie haya hablado todavía: un grupo
                # recién creado tiene que verse, si no parece que no se creó
                hilos = {gid: {'ultimo': None, 'sinLeer': 0} for gid in mios}
                for m in d['mensajes']:
                    para = m['para']
                    if ID_GRUPO.fullmatch(para):
                        # de un grupo del que me fui no vuelve a asomar nada,
                        # ni su último mensaje ni sus sin-leer
                        if para not in mios:
                            continue
                        otro = para
                    elif m['de'] == correo:
                        otro = para
                    elif para == correo:
                        otro = m['de']
                    else:
                        continue
                    h = hilos.setdefault(otro, {'ultimo': None, 'sinLeer': 0})
                    h['ultimo'] = m
                    ajeno = m['de'] != correo if otro in mios else para == correo
                    if ajeno and m['cuando'] > vistos.get(otro, 0):
                        h['sinLeer'] += 1
                lista = []
                for otro, h in hilos.items():
                    if otro in mios:
                        g = grupos[otro]
                        lista.append({'correo': otro, 'id': otro, 'esGrupo': True,
                                      'nombre': g['nombre'], 'foto': g.get('foto', ''),
                                      'miembros': len(g['miembros']),
                                      'creado': g.get('creado', 0),
                                      'ultimo': h['ultimo'], 'sinLeer': h['sinLeer']})
                        continue
                    g = fichas.get(otro, {})
                    lista.append({'correo': otro,
                                  'nombre': g.get('nombre', otro.split('@')[0]),
                                  'addr': g.get('addr', ''),
                                  'gid': g.get('gid', ''),
                                  'ultimo': h['ultimo'], 'sinLeer': h['sinLeer']})
                # por lo último dicho; el grupo callado se ordena por cuándo se
                # creó, así el recién hecho aparece arriba y no en el sótano
                lista.sort(key=lambda x: -((x['ultimo'] or {}).get('cuando')
                                           or x.get('creado', 0)))
                return self._json(200, {'conversaciones': lista})

            if ruta == '/leido':
                # Marca la charla con alguien (o un grupo) como vista hasta ahora.
                de = str(b.get('de', '')).lower()
                if ID_GRUPO.fullmatch(de) and not grupo_de(d, de, correo):
                    return self._json(403, {'error': 'no eres del grupo'})
                d.setdefault('vistos', {}).setdefault(correo, {})[de] = int(time.time() * 1000)
                guardar(d)
                return self._json(200, {'ok': True})

            if ruta == '/ficha':
                de = str(b.get('de', '')).lower()
                g = fichas.get(de)
                # la dirección de la wallet es pública en la cadena; el nombre lo
                # declaró su dueño para ser encontrado. La llave jamás sale.
                if not g:
                    return self._json(404, {'error': 'no está'})
                return self._json(200, {'nombre': g['nombre'], 'addr': g['addr'],
                                        'gid': g.get('gid', ''),
                                        'foto': g.get('foto', '')})

            if ruta == '/grupo/crear':
                nombre = str(b.get('nombre', '')).strip()[:TOPE_NOMBRE]
                if not nombre:
                    return self._json(400, {'error': 'falta el nombre'})
                if cuantos_grupos(d, correo) >= TOPE_GRUPOS:
                    return self._json(409, {'error': 'demasiados grupos'})
                ahora = int(time.time() * 1000)
                gid = 'g:' + secrets.token_hex(8)      # 16 hex
                inv = secrets.token_hex(12)            # 24 hex = el permiso de entrar
                g = {'id': gid, 'nombre': nombre, 'foto': foto_valida(d, b.get('foto')),
                     'admin': correo, 'invitacion': inv, 'creado': ahora,
                     # el orden de esta lista es el orden de llegada, y de ahí
                     # sale el heredero cuando el admin se va
                     'miembros': [{'correo': correo, 'desde': ahora}]}
                d.setdefault('grupos', {})[gid] = g
                d.setdefault('invitaciones', {})[inv] = gid
                sumar_miembros(d, g, b.get('miembros'), ahora)
                guardar(d)
                return self._json(200, {'id': gid, 'invitacion': inv})

            if ruta == '/grupo/info':
                g = grupo_de(d, b.get('id'), correo)
                if not g:
                    return self._json(403, {'error': 'no eres del grupo'})
                gente = []
                for m in g['miembros']:
                    ficha = fichas.get(m['correo'], {})
                    gente.append({'correo': m['correo'],
                                  'nombre': ficha.get('nombre') or m['correo'].split('@')[0],
                                  'foto': ficha.get('foto', '')})
                # la invitación va dentro porque cualquier miembro puede
                # invitar: esconderla al no-admin sería teatro, no seguridad
                return self._json(200, {'id': g['id'], 'nombre': g['nombre'],
                                        'foto': g.get('foto', ''), 'admin': g['admin'],
                                        'invitacion': g['invitacion'], 'miembros': gente})

            if ruta == '/grupo/editar':
                g = grupo_de(d, b.get('id'), correo)
                if not g:
                    return self._json(403, {'error': 'no eres del grupo'})
                if g['admin'] != correo:
                    return self._json(403, {'error': 'solo el admin'})
                if 'nombre' in b:
                    nombre = str(b.get('nombre', '')).strip()[:TOPE_NOMBRE]
                    if not nombre:
                        return self._json(400, {'error': 'falta el nombre'})
                    g['nombre'] = nombre
                if 'foto' in b:
                    g['foto'] = foto_valida(d, b.get('foto'))
                if b.get('nuevaInvitacion'):
                    # la invitación es una capability: la única forma de
                    # revocarla es que deje de existir. Se borra del índice y
                    # nace otra — el enlace viejo, el QR viejo y la captura
                    # que anda circulando dejan de abrir la puerta.
                    d.setdefault('invitaciones', {}).pop(g['invitacion'], None)
                    g['invitacion'] = secrets.token_hex(12)
                    d['invitaciones'][g['invitacion']] = g['id']
                guardar(d)
                # el admin acaba de tocar el grupo: devolver la invitación
                # vigente le ahorra un /grupo/info para repintar el QR
                return self._json(200, {'ok': True, 'invitacion': g['invitacion']})

            if ruta == '/grupo/invitar':
                g = grupo_de(d, b.get('id'), correo)
                if not g:
                    return self._json(403, {'error': 'no eres del grupo'})
                n = sumar_miembros(d, g, b.get('correos'), int(time.time() * 1000))
                guardar(d)
                return self._json(200, {'ok': True, 'añadidos': n})

            if ruta == '/grupo/unirse':
                # El token ES el permiso: quien lo tiene entra, venga de un
                # enlace o de un QR. Por eso no hay lista de invitados que
                # mantener — y por eso regenerarlo es la forma de cerrar.
                inv = str(b.get('invitacion', ''))
                gid = d.get('invitaciones', {}).get(inv)
                g = d.get('grupos', {}).get(gid or '')
                if not inv or not g or g['invitacion'] != inv:
                    return self._json(404, {'error': 'invitación no válida'})
                if not miembro(g, correo):
                    if len(g['miembros']) >= TOPE_MIEMBROS:
                        return self._json(409, {'error': 'grupo lleno'})
                    if cuantos_grupos(d, correo) >= TOPE_GRUPOS:
                        return self._json(409, {'error': 'demasiados grupos'})
                    g['miembros'].append({'correo': correo, 'desde': int(time.time() * 1000)})
                    guardar(d)
                # ya ser miembro no es un error: el que abre el enlace dos
                # veces entra al grupo igual, no a una pantalla de fallo
                return self._json(200, {'id': g['id'], 'nombre': g['nombre']})

            if ruta == '/grupo/salir':
                g = grupo_de(d, b.get('id'), correo)
                if not g:
                    return self._json(403, {'error': 'no eres del grupo'})
                gid = g['id']
                g['miembros'] = [m for m in g['miembros'] if m['correo'] != correo]
                if not g['miembros']:
                    # el último apagó la luz: sin miembros nadie podrá volver a
                    # leer ese hilo jamás, así que el grupo, su invitación y sus
                    # mensajes se van con él en vez de quedar de basura eterna
                    d['grupos'].pop(gid, None)
                    d.setdefault('invitaciones', {}).pop(g['invitacion'], None)
                    d['mensajes'] = [m for m in d['mensajes'] if m['para'] != gid]
                elif g['admin'] == correo:
                    # sin admin nadie podría renombrar ni cerrar la invitación:
                    # hereda el miembro más antiguo (min devuelve el primero de
                    # la lista si empatan, que es el que entró antes)
                    g['admin'] = min(g['miembros'], key=lambda m: m['desde'])['correo']
                guardar(d)
                return self._json(200, {'ok': True})

        return self._json(404, {'error': 'no existe'})


if __name__ == '__main__':
    os.makedirs(os.path.dirname(RUTA), exist_ok=True)
    puerto = int(os.environ.get('MENSAJES_PUERTO', '8390'))
    print('relevo de mensajes en :%d, datos en %s' % (puerto, RUTA), flush=True)
    ThreadingHTTPServer(('127.0.0.1', puerto), Relevo).serve_forever()
