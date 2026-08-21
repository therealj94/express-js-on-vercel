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
sirven por GET /archivo/<id>: el id aleatorio largo es el permiso. Ese GET
entiende Range (206) —sin eso Safari no reproduce un video— y solo deja
abrirse dentro del navegador a imágenes y videos: lo demás se descarga, para
que nadie use nuestro dominio para servir su HTML.
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
# Las rutas de dos niveles (/grupo/crear, /amistad/pedir, …). Todo lo que no
# esté aquí se lee solo por su último tramo.
FAMILIAS = ('grupo', 'llaves', 'amistad', 'estado')
ID_ARCHIVO = re.compile(r'[0-9a-f]{32}')
ID_GRUPO = re.compile(r'g:[0-9a-f]{16}')
# 'Range: bytes=inicio-fin', con cualquiera de los dos lados vacío. Es la
# única forma que servimos: un solo trozo, en bytes.
RANGO = re.compile(r'bytes=(\d*)-(\d*)')
candado = threading.Lock()

# Los navegadores no dejan a una página llamar a otro dominio si el dominio no
# lo autoriza. La app nativa nunca tuvo que pedir permiso —fetch en React
# Native no aplica CORS— y por eso el relevo vivió sin esto: el chat de la web
# recibía la respuesta y el navegador la tiraba a la basura antes de que el
# código la viera. Es una lista corta y cerrada; con '*' cualquier página
# ajena podría hablar por el relevo desde el navegador de quien la visite.
# El backend de la wallet, para comprobar una sesion. Se puede apuntar a otro
# desde el entorno, que es como lo prueban las pruebas sin tocar produccion.
WALLET_URL = os.environ.get(
    'MENSAJES_WALLET_URL', 'https://vetawallet-1a2e38ac52b1.herokuapp.com').rstrip('/')


def correo_de_sesion(token):
    """Le pregunta al backend de la wallet de quien es esta sesion.

    Es lo que arregla el chat de raiz. La llave del relevo se acuna UNA vez y
    se la queda el primer dispositivo; el segundo recibia un 409 sin salida
    —«tu chat esta en otro lado»— aunque fuera la MISMA persona con la MISMA
    cuenta. La sesion de la wallet ya prueba quien es (el backend valida el
    token y devuelve el correo), asi que al dueno demostrado se le devuelve
    su llave existente en vez de un portazo.

    El relevo no valida el token por su cuenta a proposito: la firma y su
    vigencia son asunto del backend de la wallet, y duplicar esa logica aqui
    es tener dos versiones que un dia discrepan. Aqui solo se pregunta.

    Devuelve el correo en minusculas, o None si la sesion no vale o el
    backend no contesta. None NUNCA se distingue de una sesion mala hacia
    fuera: en ambos casos queda el 409 de siempre.
    """
    if not token or not isinstance(token, str) or len(token) > 4096:
        return None
    try:
        import urllib.request
        pet = urllib.request.Request(
            WALLET_URL + '/users/userDate',
            headers={'Authorization': 'Bearer ' + token})
        with urllib.request.urlopen(pet, timeout=6) as r:
            datos = json.loads(r.read() or b'{}')
        correo = str(datos.get('email', '')).strip().lower()
        return correo if correo_valido(correo) else None
    except Exception:
        return None


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


# Un correo se guarda aquí y después se pinta en la pantalla de OTRA persona.
# La regla de antes —«cualquier cosa sin arroba ni espacios»— dejaba entrar
# comillas, paréntesis y punto y coma, y con eso un correo dado de alta a mano
# podía salirse de la cadena en la que la web lo pinta. La web ya escapa bien
# ese sitio, pero un dato con forma de correo tiene que tener forma de correo:
# es la mitad del arreglo que vive de este lado.
#
# El apóstrofo SÍ se permite: o'brien@example.com es un correo de verdad y
# negárselo a alguien por culpa nuestra sería el error contrario.
CORREO = re.compile(r"[A-Za-z0-9!#$%&'*+/=?^_~.-]{1,64}"
                    r"@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
                    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+")


def correo_valido(x):
    return bool(CORREO.fullmatch(str(x or '').lower()))


def foto_valida(d, x):
    """Una foto es el id de un adjunto YA subido por /subir. Un id inventado
    se descarta en vez de guardarse: pintaría un hueco gris en cada lista y
    nadie sabría por qué. Cadena vacía = sin foto, y así se quita."""
    x = str(x or '')
    return x if (ID_ARCHIVO.fullmatch(x) and x in d.get('archivos', {})) else ''


def en_linea(mime):
    """¿Este adjunto se PINTA dentro del hilo, o se baja como descarga?

    Un adjunto lo sube cualquiera, y servido «inline» se abre DENTRO de
    nuestro dominio: un .html o un .svg subidos como adjunto ejecutarían su
    JavaScript en cerebro.ordenscan.com, con la confianza que la gente le
    tiene a esa barra de direcciones. Eso es alojarle el phishing a quien lo
    intente, gratis y con nuestro nombre.

    Así que inline SOLO lo que el chat tiene que enseñar en la burbuja:
    imágenes, videos y notas de voz. El SVG se queda fuera a propósito aunque
    su mime empiece por image/ — no es un mapa de píxeles, es XML que puede
    traer <script> dentro. Todo lo demás baja como archivo y no corre nada.

    Y el audio: una nota de voz hay que poder oírla en la burbuja, y un
    audio no ejecuta nada — no hay «audio/html». Se deja pasar por eso, no
    por comodidad.
    """
    m = str(mime or '').split(';')[0].strip().lower()
    if 'svg' in m:
        return False
    return m.startswith('image/') or m.startswith('video/') or m.startswith('audio/')


def trozo_pedido(cabecera, total):
    """Traduce un `Range: bytes=i-f` al pedazo que hay que servir.

    Safari (y iOS entero) NO reproduce un <video> al que el servidor le
    contesta 200 con el archivo completo: pide un trozo y espera un 206. Sin
    esto, un video mandado por el chat se veía en la app pero no en el
    navegador — que es donde está la mitad de la gente.

    Devuelve una tupla (qué, i, f):
      · ('entero', 0, total-1) → servir todo con el 200 de siempre. Es lo que
        toca sin cabecera Range Y TAMBIÉN con una cabecera que no entendemos
        (varios rangos, otra unidad): la norma manda ignorar el Range
        incomprensible, no fallar.
      · ('trozo', i, f)        → 206 con esos bytes, ambos extremos incluidos.
      · ('fuera', 0, 0)        → el rango tiene buena forma pero pide algo que
        no existe (empieza pasado el final, o al revés): eso es un 416.
    """
    fin = total - 1
    if not cabecera or len(cabecera) > 100:
        return ('entero', 0, fin)
    m = RANGO.fullmatch(cabecera.strip())
    if not m:
        return ('entero', 0, fin)
    ini, ult = m.group(1), m.group(2)
    if ini == '' and ult == '':
        return ('entero', 0, fin)
    # 20 dígitos ya son más bytes de los que cabrían jamás en un adjunto de
    # 8MB: no vale la pena convertir a entero un número de mil cifras
    if len(ini) > 20 or len(ult) > 20:
        return ('fuera', 0, 0)
    if ini == '':
        # 'bytes=-N': los ÚLTIMOS N bytes. Pedir los últimos cero no es un
        # trozo, es nada.
        n = int(ult)
        if n == 0 or total == 0:
            return ('fuera', 0, 0)
        return ('trozo', max(0, total - n), fin)
    i = int(ini)
    f = int(ult) if ult != '' else fin      # 'bytes=i-' = de ahí hasta el final
    if total == 0 or i >= total or i > f:
        return ('fuera', 0, 0)
    return ('trozo', i, min(f, fin))


def miembro(g, correo):
    return any(m['correo'] == correo for m in g.get('miembros', []))


def corte_de(d, correo, con):
    """Desde cuándo ve ESTA cuenta el hilo con `con`.

    Vaciar o quitar una conversación no borra mensajes —el hilo es de dos y
    solo se puede decidir sobre la propia vista—: deja una fecha, y de ahí
    para atrás esta cuenta no lo ve. 0 = nunca se vació, se ve todo.
    """
    c = d.get('cortes', {}).get(correo, {}).get(con)
    return c.get('en', 0) if isinstance(c, dict) else 0


def grupo_de(d, gid, correo):
    """El grupo, pero solo si quien firma es miembro AHORA. Un grupo que no
    existe y un grupo del que no soy miembro devuelven lo mismo (None → 403)
    a propósito: quien pruebe ids al azar no averigua cuáles existen."""
    g = d.get('grupos', {}).get(str(gid or ''))
    return g if (g and miembro(g, correo)) else None


def cuantos_grupos(d, correo):
    return sum(1 for g in d.get('grupos', {}).values() if miembro(g, correo))


# ── el circulo: quien puede escribirle a quien ────────────────────────────────
#
# Antes cualquiera con el correo de otro podia escribirle. Eso esta bien para
# un buzon de soporte y esta mal para una app de mensajes: significa que a
# cualquiera se le puede llenar el chat de desconocidos, y que basta con
# adivinar un correo para meterse en la vida de alguien.
#
# Ahora hay que PEDIR y que el otro ACEPTE. Es una sola regla y protege dos
# cosas a la vez: quien no acepto no recibe, y quien no fue aceptado no puede
# ver ni un estado.
#
# La clave es el par ordenado alfabeticamente, no «a→b»: la amistad es una
# sola cosa entre dos, no dos cosas espejadas que se pueden desincronizar.
TOPE_PEDIDOS = 200          # pedidos pendientes por cuenta, en cualquier sentido


def par(a, b):
    return '|'.join(sorted([str(a).lower(), str(b).lower()]))


def lazo(d, a, b):
    return d.get('circulo', {}).get(par(a, b))


def son_amigos(d, a, b):
    l = lazo(d, a, b)
    return bool(l and l.get('estado') == 'ok')


def con_quien_hablo(d, correo):
    """Con quién tiene historial esta cuenta, en UNA sola pasada.

    `ya_hablaron` recorre los mensajes cada vez que se la llama. Para una
    comprobación suelta da igual; para una lista de cien correos serían cien
    pasadas por veinte mil mensajes. Donde hay lista, se usa esto.
    """
    otros = set()
    for m in d.get('mensajes', []):
        if m.get('de') == correo:
            otros.add(m.get('para'))
        elif m.get('para') == correo:
            otros.add(m.get('de'))
    return otros


def ya_hablaron(d, a, b):
    """¿Hay historial entre estos dos?

    Existe por una razon concreta: el dia que esto se despliega hay cientos de
    conversaciones abiertas. Exigir de golpe una solicitud aceptada las
    cortaria todas a la vez, y la gente pensaria que el chat se rompio. Quien
    ya se escribia se queda como estaba; la regla nueva rige de aqui en
    adelante. Es una puerta que se cierra sin dejar a nadie fuera de su casa.
    """
    for m in d.get('mensajes', []):
        if (m.get('de') == a and m.get('para') == b) or (m.get('de') == b and m.get('para') == a):
            return True
    return False


def puede_escribir(d, quien, a_quien):
    return (quien == a_quien or son_amigos(d, quien, a_quien)
            or ya_hablaron(d, quien, a_quien))


def cuantos_pedidos(d, correo):
    c = str(correo).lower()
    return sum(1 for k, v in d.get('circulo', {}).items()
               if v.get('estado') == 'pedido' and c in k.split('|'))


def resumen_ficha(correo, f):
    return {'correo': correo, 'nombre': f.get('nombre', ''), 'addr': f.get('addr', ''),
            'gid': f.get('gid', ''), 'foto': f.get('foto', '')}


# ── las llaves publicas de cada aparato ───────────────────────────────────────
#
# Una cuenta tiene varios aparatos —telefono, computadora— y cada uno se
# fabrica su propio par de llaves. Aqui solo viven las PUBLICAS: son como un
# numero de telefono, no sirven para abrir nada. Las privadas nunca salieron
# del navegador y no hay ninguna ruta por la que pudieran llegar.
TOPE_APARATOS = 5           # mas que eso son casi siempre navegaciones privadas
VIDA_APARATO = 180 * 86400  # un aparato que no aparece en medio año se cae solo


def apuntar_aparato(f, ident, pub, ahora):
    aps = [a for a in f.get('aparatos', []) if a.get('id') != ident]
    aps.append({'id': ident, 'pub': pub, 'visto': ahora})
    # se cae el mas viejo por ULTIMA VEZ VISTO, no por antiguedad de alta: el
    # telefono de todos los dias no se puede caer por haberse dado de alta
    # antes que una computadora que se usa una vez al mes
    aps.sort(key=lambda a: a.get('visto', 0), reverse=True)
    f['aparatos'] = aps[:TOPE_APARATOS]


def aparatos_de(f, ahora):
    return [{'id': a['id'], 'pub': a['pub']} for a in f.get('aparatos', [])
            if a.get('pub') and ahora - a.get('visto', 0) < VIDA_APARATO * 1000]


# ── los estados de 24 horas ───────────────────────────────────────────────────
#
# Un estado es lo contrario de un mensaje: no va dirigido a nadie y se borra
# solo. Por eso NO se guarda en 'mensajes' ni se cifra de punta a punta — lo
# ve todo el circulo, que puede ser mucha gente y cambiar mientras el estado
# esta vivo, y cifrarlo para cada aparato de cada amigo significaria rehacerlo
# cada vez que alguien acepta una solicitud.
#
# Eso quiere decir que un estado SI lo puede ver el servidor, y la app lo dice
# con esas palabras en la pantalla de subirlo. No se esconde: se avisa donde
# la persona esta decidiendo.
VIDA_ESTADO = 24 * 3600 * 1000
TOPE_ESTADOS = 20           # por cuenta y a la vez


def purgar_estados(d, ahora):
    """Los vencidos se van de verdad: se borra la fila y su archivo.

    Un estado que «se ve borrado» pero sigue en el disco no es un estado de 24
    horas, es un archivo con una etiqueta. Si se promete que desaparece, tiene
    que desaparecer.
    """
    vivos, muertos = [], []
    for e in d.get('estados', []):
        (vivos if e.get('vence', 0) > ahora else muertos).append(e)
    if not muertos:
        return
    d['estados'] = vivos
    en_uso = {e.get('archivo') for e in vivos if e.get('archivo')}
    en_uso |= {f.get('foto') for f in d.get('fichas', {}).values() if f.get('foto')}
    en_uso |= {m.get('archivo') for m in d.get('mensajes', []) if m.get('archivo')}
    for e in muertos:
        a = e.get('archivo')
        if a and a not in en_uso:
            d.get('archivos', {}).pop(a, None)
            try:
                os.remove(os.path.join(CARPETA_ARCHIVOS, a))
            except OSError:
                pass


def sumar_miembros(d, g, correos, ahora):
    """Mete en el grupo a los correos que se pueda y dice QUÉ pasó con cada uno.

    Solo gente ya dada de alta en el relevo: un correo sin ficha no podría
    leer nada y dejaría un miembro fantasma, sin nombre ni foto, en la ficha
    del grupo. Eso está bien; lo que estaba mal es que se saltaba en
    SILENCIO. Quien escribía el correo de alguien que todavía no tiene la
    app veía «Invitación enviada» y se quedaba esperando a una persona que
    nunca fue invitada a nada — la mentira más cara de todas, porque no se
    nota hasta días después.

    Por eso ya no se devuelve un número pelado sino qué le tocó a cada
    correo. Que la respuesta diga «este no existe» permite a la pantalla
    decirlo con esas palabras en vez de fingir un éxito.

    Devuelve un dict de listas: entraron, noExisten, yaEstaban, sinCupo; y
    'invalidos' es un CONTEO, no una lista: lo que no tiene forma de correo
    no se devuelve tal cual — no le devolvemos a nadie su propia cadena rara
    para que otra pantalla la pinte.
    """
    r = {'entraron': [], 'noExisten': [], 'yaEstaban': [], 'sinCupo': [],
         'invalidos': 0}
    lista = correos if isinstance(correos, list) else []
    for c in lista[:TOPE_MIEMBROS]:
        c = str(c).lower()
        if not correo_valido(c):
            r['invalidos'] += 1
            continue
        if c not in d['fichas']:
            # sí, esto dice si un correo está dado de alta. El directorio
            # (/buscar) ya lo dice desde siempre, y sin esto no hay forma
            # honesta de avisar de que la invitación no llegó a nadie.
            r['noExisten'].append(c)
            continue
        if miembro(g, c):
            r['yaEstaban'].append(c)
            continue
        if len(g['miembros']) >= TOPE_MIEMBROS or cuantos_grupos(d, c) >= TOPE_GRUPOS:
            r['sinCupo'].append(c)
            continue
        g['miembros'].append({'correo': c, 'desde': ahora})
        r['entraron'].append(c)
    # lo que ni se miró por venir detrás del tope tampoco entró: contarlo
    # como añadido sería la misma mentira por otra puerta
    for c in lista[TOPE_MIEMBROS:]:
        c = str(c).lower()
        if correo_valido(c):
            r['sinCupo'].append(c)
        else:
            r['invalidos'] += 1
    return r



# ─────────────────────────────────────────────────────────────────────────────
# EL BUZÓN DE SEÑALES DE LAS LLAMADAS
#
# Para montar una llamada, dos navegadores tienen que intercambiar tres cosas
# —la oferta, la respuesta y los caminos de red (ICE)— y tienen que hacerlo en
# SEGUNDOS. El chat sondea cada cinco, así que por ahí una llamada tardaría
# entre quince y veinticinco segundos en conectar: inusable.
#
# Esto es un buzón aparte con espera larga: quien escucha deja la petición
# abierta hasta veinticinco segundos, y en cuanto llega algo para él se le
# contesta al instante. Es casi un WebSocket, sin serlo, y sin tocar nada de
# lo que ya funciona.
#
# TRES DECISIONES QUE IMPORTAN
#
# 1. VIVE EN MEMORIA, NO EN EL ARCHIVO. Una señal dura segundos y no le
#    interesa a nadie después. Guardarlas en datos.json sería una escritura
#    del archivo entero por cada candidato ICE —decenas por llamada— y eso sí
#    tumbaría el relevo.
#
# 2. NO USA EL CANDADO GLOBAL. Ese candado es de TODO el relevo: esperar
#    veinticinco segundos con él en la mano dejaría el chat congelado para
#    todo el mundo mientras alguien llama. Tiene su propio candado, y solo
#    protege este buzón.
#
# 3. SE VACÍA SOLO. Lo que nadie recogió en un minuto se tira: una señal vieja
#    no sirve —la llamada ya se cayó— y sin esto el buzón crecería para
#    siempre con las llamadas que nadie contestó.

ESPERA_SENAL = 25          # lo que aguanta una petición abierta, en segundos
VIDA_SENAL = 60            # lo que vive una señal sin que nadie la recoja
TOPE_SENALES = 60          # por buzón: una llamada normal usa unas veinte
TOPE_SENAL_DATOS = 12_000  # una oferta SDP ronda los 4KB; ICE, unos cientos

senales = {}                          # correo -> [ {de, tipo, datos, en} ]
aviso_senal = threading.Condition()   # su propio candado, NO el global


def _purgar_senales(ahora):
    """Tira lo que nadie recogió. Se llama con `aviso_senal` en la mano."""
    for quien in list(senales):
        senales[quien] = [x for x in senales[quien] if ahora - x['en'] < VIDA_SENAL]
        if not senales[quien]:
            del senales[quien]


def dejar_senal(para, de, tipo, datos):
    """Deja una señal para alguien y despierta a quien esté esperando."""
    ahora = time.time()
    with aviso_senal:
        _purgar_senales(ahora)
        buzon = senales.setdefault(para, [])
        if len(buzon) >= TOPE_SENALES:
            return False
        buzon.append({'de': de, 'tipo': tipo, 'datos': datos, 'en': ahora})
        aviso_senal.notify_all()
    return True


def recoger_senales(quien, espera=ESPERA_SENAL):
    """Lo que haya para mí, esperando hasta `espera` segundos si no hay nada.

    Devolver la lista VACÍA tras la espera no es un fallo: es la forma de que
    el navegador vuelva a preguntar sin que la petición se quede colgada para
    siempre ni el móvil gaste batería sondeando cada segundo.
    """
    hasta = time.time() + espera
    with aviso_senal:
        while True:
            _purgar_senales(time.time())
            mias = senales.pop(quien, [])
            if mias:
                return [{'de': x['de'], 'tipo': x['tipo'], 'datos': x['datos']} for x in mias]
            queda = hasta - time.time()
            if queda <= 0:
                return []
            aviso_senal.wait(timeout=queda)



# ─────────────────────────────────────────────────────────────────────────────
# LAS CREDENCIALES DEL TURN DE CLOUDFLARE
#
# POR QUE ESTO VIVE EN EL SERVIDOR Y NO EN EL NAVEGADOR
#
# Porque para pedirle credenciales a Cloudflare hace falta un token de API que
# vale para TODA la cuenta. Ese token en el navegador lo puede leer cualquiera
# abriendo las herramientas de desarrollo, y con él se puede consumir el
# terabyte gratis del mes en una tarde — o gastar dinero de verdad después.
#
# Así que el token se queda aquí, y el navegador pide credenciales CORTAS: se
# generan al vuelo, duran una hora, y solo sirven para relevar audio y video.
#
# QUE PASA SI NO ESTA CONFIGURADO
#
# Se contesta 200 con la lista vacía, no un error. Sin TURN las llamadas
# siguen funcionando —la mayoría conecta con STUN a secas— y un 500 aquí haría
# que la app tratara como rota una situación que es solo «todavía no lo
# pagamos». La app mira si vino algo y sigue igual.
#
# CONFIGURACION (variables de entorno, ninguna escrita aquí)
#   TURN_LLAVE_ID    el «TURN Key ID» que da el panel de Cloudflare
#   TURN_LLAVE_TOKEN el token de API de esa llave
#   TURN_VIDA        segundos que dura la credencial; por defecto 3600

TURN_ID = os.environ.get('TURN_LLAVE_ID', '').strip()
TURN_TOKEN = os.environ.get('TURN_LLAVE_TOKEN', '').strip()
TURN_VIDA = int(os.environ.get('TURN_VIDA', '3600'))
TURN_URL = 'https://rtc.live.cloudflare.com/v1/turn/keys/{}/credentials/generate-ice-servers'

# Las credenciales se cachean casi toda su vida: son iguales para todo el
# mundo durante ese rato, y pedir una por llamada sería una llamada de red
# extra en el momento en que más importa la prisa.
_turno_cache = {'hasta': 0, 'servidores': []}
_turno_candado = threading.Lock()


def servidores_turno():
    """Los iceServers de Cloudflare, o [] si no está configurado."""
    if not TURN_ID or not TURN_TOKEN:
        return []
    ahora = time.time()
    with _turno_candado:
        if _turno_cache['hasta'] > ahora:
            return _turno_cache['servidores']
    try:
        import urllib.request
        req = urllib.request.Request(
            TURN_URL.format(TURN_ID), method='POST',
            data=json.dumps({'ttl': TURN_VIDA}).encode(),
            headers={'Authorization': 'Bearer ' + TURN_TOKEN,
                     'Content-Type': 'application/json',
                     # El escudo antibots de Cloudflare rechaza con «error code
                     # 1010» a quien llega con el User-Agent de python-urllib,
                     # ANTES de mirar el token. Sale un 403 que parece de
                     # credenciales y no lo es: cuesta media hora de buscar en
                     # el sitio equivocado. Con una identificación normal pasa.
                     'User-Agent': 'veta-wallet-relevo/1.0',
                     'Accept': '*/*'})
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.loads(r.read())
        srv = d.get('iceServers') or []
        # Cloudflare devuelve un objeto o una lista segun el caso; se normaliza
        # a lista para que la app no tenga que saberlo.
        if isinstance(srv, dict):
            srv = [srv]
        with _turno_candado:
            # Se renueva antes de que venza, no justo al vencer: una credencial
            # que caduca a mitad de una llamada la corta.
            _turno_cache['hasta'] = ahora + max(60, TURN_VIDA * 0.8)
            _turno_cache['servidores'] = srv
        return srv
    except Exception as e:
        print('[turno] no se pudieron pedir credenciales:', e)
        return []


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
        total = len(cuerpo)
        mime = meta.get('mime') or 'application/octet-stream'
        # nombre saneado a ASCII simple: es solo cortesía para el "guardar
        # como" del navegador, no vale la pena la coreografía RFC 5987
        nombre = re.sub(r'[^A-Za-z0-9._ -]', '_', meta.get('nombre') or iid)[:80]

        que, i, f = trozo_pedido(self.headers.get('Range'), total)
        if que == 'fuera':
            # 416 con el tamaño de verdad: el reproductor recalcula y vuelve
            # a pedir bien, en vez de quedarse mirando un error sin datos
            self.send_response(416)
            self.send_header('Content-Range', 'bytes */%d' % total)
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', '0')
            self._permiso()
            self.end_headers()
            return

        self.send_response(206 if que == 'trozo' else 200)
        self.send_header('Content-Type', mime)
        # decirlo SIEMPRE, también en el 200: es así como el reproductor se
        # entera de que puede pedir trozos y de que puede saltar en la barra
        self.send_header('Accept-Ranges', 'bytes')
        if que == 'trozo':
            self.send_header('Content-Range', 'bytes %d-%d/%d' % (i, f, total))
            self.send_header('Content-Length', str(f - i + 1))
        else:
            self.send_header('Content-Length', str(total))
        # Un adjunto se guarda, no se ejecuta: inline solo lo que la burbuja
        # tiene que enseñar (imagen y video, nunca SVG). Lo demás, descarga —
        # ver en_linea(): es lo que impide que nos alojen el phishing.
        self.send_header('Content-Disposition', '%s; filename="%s"'
                         % ('inline' if en_linea(mime) else 'attachment', nombre))
        # y que el navegador no adivine el tipo mirando los bytes: sin esto,
        # un .html subido con mime de imagen se ejecutaría igual
        self.send_header('X-Content-Type-Options', 'nosniff')
        # el binario de un id jamás cambia: que el teléfono lo cachee y no
        # vuelva a bajar la misma foto en cada scroll del hilo
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        self._permiso()
        if self.headers.get('Origin') in ORIGENES:
            # sin esto el JavaScript de la web ve la respuesta pero no puede
            # leer de dónde a dónde va el trozo que le mandaron
            self.send_header('Access-Control-Expose-Headers',
                             'Content-Range, Content-Length, Accept-Ranges')
        self.end_headers()
        self.wfile.write(cuerpo[i:f + 1] if que == 'trozo' else cuerpo)

    def do_POST(self):
        # la ruta se decide ANTES de leer el cuerpo: el tope grande es solo
        # para /subir y el resto de rutas conserva su límite de siempre.
        # Se lee por el final porque delante puede venir el prefijo de Caddy
        # (/mensajes/...). Las familias de dos niveles van en una lista y no
        # sueltas en un `if`: cada vez que se añadía una hacía falta acordarse
        # de tocar esta línea, y olvidarlo deja la ruta nueva contestando 404
        # sin que nada lo diga.
        partes = [p for p in self.path.split('?')[0].split('/') if p]
        ruta = '/' + (partes[-1] if partes else '')
        if len(partes) >= 2 and partes[-2] in FAMILIAS:
            ruta = '/' + partes[-2] + '/' + partes[-1]
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n > (TOPE_POST_SUBIR if ruta == '/subir' else TOPE_POST):
                return self._json(413, {'error': 'muy grande'})
            b = json.loads(self.rfile.read(n) or b'{}')
        except Exception:
            return self._json(400, {'error': 'json inválido'})

        # La sesion de la wallet se comprueba AQUI, antes del candado: es una
        # llamada de red y el candado es de todo el relevo — con ella dentro,
        # seis segundos de Heroku lento serian seis segundos de chat parado
        # para todo el mundo.
        correo_probado = None
        if ruta == '/alta' and b.get('sesion'):
            correo_probado = correo_de_sesion(b.get('sesion'))

        # Se rellena dentro del candado y se usa FUERA: ver la nota en /senales.
        esperar_para = None

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
                # el correo ya existe: su dueño refresca datos y recibe su
                # llave. Dueño es quien LA TIENE — o quien lo PRUEBA con su
                # sesión de la wallet, que es lo que salva al segundo
                # dispositivo del 409 eterno. La llave devuelta es SIEMPRE la
                # existente: acuñar otra mataría al primer dispositivo, que
                # sigue firmando con la vieja.
                if b.get('llave') == f['llave'] or correo_probado == correo:
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

            if ruta == '/turno':
                # Las credenciales del relevo de video. Exige llave: si no,
                # cualquiera podría gastarse nuestro terabyte del mes.
                return self._json(200, {'iceServers': servidores_turno()})

            if ruta == '/senal':
                # Dejar una señal para el otro lado de la llamada. El permiso
                # es el mismo que el de escribirle: si es un grupo hay que ser
                # miembro, y si es una persona tiene que ser un correo válido.
                para = str(b.get('para', '')).lower()
                tipo = str(b.get('tipo', ''))[:24]
                datos = b.get('datos')
                # Los que empiezan por `g` son de las llamadas de grupo: la
                # malla habla de todos con todos, asi que hacen falta tipos
                # propios para no confundirlos con los del cara a cara.
                if tipo not in ('oferta', 'respuesta', 'ice', 'llamo', 'cuelgo',
                                'ocupado', 'rechazo',
                                'gllamo', 'gentro', 'goferta', 'grespuesta',
                                'gice', 'gsalgo', 'grechazo',
                                'escribe'):
                    return self._json(400, {'error': 'tipo inválido'})
                if not correo_valido(para):
                    return self._json(400, {'error': 'faltan datos'})
                # Una llamada hace SONAR el telefono de alguien. Si escribirle
                # exige que te haya aceptado, hacerle sonar el telefono con
                # mas razon: es la forma mas ruidosa de molestar que tiene la
                # app. Las señales de una llamada ya en curso pasan por aqui
                # tambien, y no es problema: si la llamada empezo es que el
                # lazo existe.
                if not puede_escribir(d, correo, para):
                    return self._json(403, {'error': 'hace falta que te acepte'})
                if len(json.dumps(datos or {})) > TOPE_SENAL_DATOS:
                    return self._json(413, {'error': 'señal muy grande'})
                if not dejar_senal(para, correo, tipo, datos):
                    # El buzón lleno casi siempre es alguien reintentando en
                    # bucle, no tráfico legítimo. Se dice y no se acumula.
                    return self._json(429, {'error': 'demasiadas señales'})
                return self._json(200, {'ok': True})

            if ruta == '/senales':
                # LA ESPERA VA FUERA DEL CANDADO. Es lo único importante de
                # esta ruta: `with candado` es de TODO el relevo, y esperar
                # veinticinco segundos con él en la mano dejaría el chat
                # congelado para todo el mundo mientras alguien llama.
                # Se sale del bloque con un salto y la espera ocurre abajo.
                esperar_para = correo

            if False:  # el hueco que deja el salto de /senales
                pass

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
                # `voz` es una nota grabada en la app, no un archivo de audio
                # adjuntado: se pinta como nota con su duración, no como una
                # tarjeta de descarga. Por eso es un tipo aparte de `archivo`.
                if tipo not in ('imagen', 'video', 'archivo', 'voz'):
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
                # EL BULTO CERRADO. Cuando viene, el relevo no sabe ni puede
                # saber que dice: es un objeto opaco que se guarda tal cual y
                # se devuelve tal cual. Ni siquiera se mira por dentro — solo
                # se comprueba que tenga la forma de un bulto y que no sea
                # enorme, que es lo unico que le toca al que solo transporta.
                cif = b.get('cif')
                if cif is not None:
                    if (not isinstance(cif, dict) or not cif.get('ct')
                            or not isinstance(cif.get('s'), list)
                            or len(json.dumps(cif)) > 60_000):
                        return self._json(400, {'error': 'bulto inválido'})
                # adjunto opcional: solo cuenta si el id existe de verdad en el
                # índice — un id inventado daría burbujas rotas en la app
                tipo = str(b.get('tipo', ''))
                archivo = str(b.get('archivo', ''))
                adj = (tipo in ('imagen', 'video', 'archivo', 'voz')
                       and archivo in d.get('archivos', {}))
                if ID_GRUPO.fullmatch(para):
                    # el permiso de escribir en un grupo es ser miembro AHORA:
                    # se comprueba en cada envío, no al abrir el hilo, para que
                    # salir del grupo corte de verdad y en el acto
                    if not grupo_de(d, para, correo):
                        return self._json(403, {'error': 'no eres del grupo'})
                elif not correo_valido(para):
                    return self._json(400, {'error': 'faltan datos'})
                elif not puede_escribir(d, correo, para):
                    # La privacidad no se hace solo escondiendo el boton en la
                    # app: si la regla no esta AQUI, cualquiera que sepa hablar
                    # con el relevo se la salta.
                    return self._json(403, {'error': 'hace falta que te acepte'})
                # un mensaje puede ser solo texto, solo adjunto, o ambos
                if not texto and not cif and not adj:
                    return self._json(400, {'error': 'faltan datos'})
                m = {'de': correo, 'para': para, 'texto': texto,
                     'cuando': int(time.time() * 1000),
                     # Un id propio. Sin el no se puede reaccionar a un mensaje
                     # ni citarlo: «el tercero de arriba» no es una referencia
                     # que sobreviva a que lleguen mas mensajes.
                     'id': secrets.token_hex(8)}
                # Responder citando: se guarda a QUE mensaje responde. Solo el
                # id; el texto citado lo pinta la app leyendo el hilo, para que
                # editar o borrar el original no deje copias viejas por ahi.
                cita = str(b.get('cita', ''))[:16]
                if cita:
                    m['cita'] = cita
                if cif is not None:
                    m['cif'] = cif
                    # El texto en claro NO se guarda al lado del cerrado. Seria
                    # el error mas tonto posible: cifrar y dejar la copia.
                    m['texto'] = ''
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

            if ruta == '/suscribir':
                # La suscripcion push de ESTE navegador. Se guarda por
                # dispositivo —una persona tiene telefono y computadora— y se
                # reemplaza la que tuviera el mismo `endpoint`: el navegador
                # renueva esa direccion cada tanto y guardar las dos mandaria
                # el aviso dos veces.
                sus = b.get('suscripcion')
                if not isinstance(sus, dict) or not sus.get('endpoint'):
                    return self._json(400, {'error': 'faltan datos'})
                if len(json.dumps(sus)) > 2000:
                    return self._json(413, {'error': 'suscripcion muy grande'})
                lista = f.setdefault('push', [])
                lista = [x for x in lista if x.get('endpoint') != sus['endpoint']]
                lista.append({'endpoint': sus['endpoint'],
                              'keys': sus.get('keys', {}),
                              'desde': int(time.time() * 1000)})
                # Tres dispositivos por cuenta: mas que eso casi siempre son
                # suscripciones muertas que nadie limpio.
                f['push'] = lista[-3:]
                guardar(d)
                return self._json(200, {'ok': True, 'dispositivos': len(f['push'])})

            if ruta == '/desuscribir':
                sus = (b.get('suscripcion') or {}).get('endpoint')
                f['push'] = [x for x in f.get('push', []) if x.get('endpoint') != sus]
                guardar(d)
                return self._json(200, {'ok': True})

            if ruta == '/reaccion':
                # Una reaccion a un mensaje. Se guarda POR PERSONA y no como
                # un contador: sin saber quien puso que, no se puede quitar la
                # propia ni impedir que alguien sume diez veces la misma.
                mid = str(b.get('id', ''))[:16]
                emo = str(b.get('emoji', ''))[:8]
                msg = next((x for x in d['mensajes'] if x.get('id') == mid), None)
                if not msg:
                    return self._json(404, {'error': 'ese mensaje no existe'})
                # Solo se reacciona en un hilo del que uno es parte.
                suyo = msg['de'] == correo or msg['para'] == correo
                if not suyo and not (ID_GRUPO.fullmatch(msg['para']) and grupo_de(d, msg['para'], correo)):
                    return self._json(403, {'error': 'ese hilo no es tuyo'})
                r = msg.setdefault('reacciones', {})
                if not emo or r.get(correo) == emo:
                    r.pop(correo, None)      # tocar la misma la quita
                else:
                    r[correo] = emo
                if not r:
                    msg.pop('reacciones', None)
                guardar(d)
                return self._json(200, {'ok': True, 'reacciones': msg.get('reacciones', {})})

            if ruta == '/escribiendo':
                # «Esta escribiendo…». NO se guarda en el archivo: dura tres
                # segundos y escribirlo en disco por cada tecla seria una
                # escritura del archivo entero cada vez que alguien teclea.
                # Va por el buzon de señales, que ya vive en memoria.
                para = str(b.get('para', '')).lower()
                if ID_GRUPO.fullmatch(para):
                    g = grupo_de(d, para, correo)
                    if not g:
                        return self._json(403, {'error': 'no eres del grupo'})
                    for x in g['miembros']:
                        if x['correo'] != correo:
                            dejar_senal(x['correo'], correo, 'escribe', {'donde': para})
                elif correo_valido(para):
                    dejar_senal(para, correo, 'escribe', {'donde': correo})
                else:
                    return self._json(400, {'error': 'faltan datos'})
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
                hilo = [m for m in hilo if m['cuando'] > corte_de(d, correo, desde)]
                return self._json(200, {'mensajes': hilo[-TOPE_BANDEJA:]})

            if ruta == '/olvidar':
                """Vaciar un hilo, o quitarlo de mi lista. SOLO DE MI LADO.

                El hilo es uno solo y lo comparten los dos: borrarlo de verdad
                seria borrarselo tambien a la otra persona, y eso no es una
                opcion que le toque a nadie mas que a su dueño. Asi que esto
                no borra nada: pone un CORTE con la fecha de hoy, y de ahi en
                adelante esta cuenta ya no ve lo anterior. La otra conserva su
                copia entera, y la pantalla lo dice con esas palabras — es la
                diferencia entre una funcion honesta y una mentira comoda.

                `quitar` ademas saca la fila de la lista hasta que llegue algo
                nuevo: eso es «borrar la conversacion». Sin el, la fila queda
                vacia: eso es «vaciar los mensajes».
                """
                con = str(b.get('con', '')).lower()
                if not con:
                    return self._json(400, {'error': 'falta con'})
                if ID_GRUPO.fullmatch(con) and not grupo_de(d, con, correo):
                    return self._json(403, {'error': 'no eres del grupo'})
                d.setdefault('cortes', {}).setdefault(correo, {})[con] = {
                    'en': int(time.time() * 1000),
                    'quitar': bool(b.get('quitar')),
                }
                guardar(d)
                return self._json(200, {'ok': True})

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
                          'gid': g.get('gid', ''), 'foto': g.get('foto', '')}
                         for c, g in fichas.items()
                         if q in c or q in g['nombre'].lower()
                         or g.get('gid', '').lower().startswith(q)]
                gente = [x for x in gente if x['correo'] != correo][:10]
                # Cada resultado dice en que punto esta la relacion, para que
                # el boton diga la verdad: «Agregar», «Pendiente», «Responder»
                # o «Escribir». Sin esto la app manda solicitudes repetidas a
                # gente que ya la mando, que es como se llena un buzon de
                # ruido.
                viejos = con_quien_hablo(d, correo)
                for x in gente:
                    l = lazo(d, correo, x['correo'])
                    if (l and l['estado'] == 'ok') or x['correo'] in viejos:
                        x['lazo'] = 'amigos'
                    elif l and l['estado'] == 'pedido':
                        x['lazo'] = 'enviada' if l.get('de') == correo else 'recibida'
                    else:
                        x['lazo'] = 'no'
                return self._json(200, {'gente': gente})

            # ── las llaves de los aparatos ────────────────────────────────
            #
            # Publicar la propia y pedir las de aquellos a quienes se puede
            # escribir. Nada mas. Aqui NO hay ninguna llave privada: si la
            # hubiera, el cifrado de punta a punta seria un adorno.
            if ruta == '/llaves/publicar':
                ident = str(b.get('id', ''))[:40]
                pub = str(b.get('pub', ''))[:200]
                if not ident or not pub:
                    return self._json(400, {'error': 'faltan datos'})
                apuntar_aparato(f, ident, pub, int(time.time() * 1000))
                guardar(d)
                return self._json(200, {'ok': True})

            if ruta == '/llaves/de':
                ahora = int(time.time() * 1000)
                pedidos = [str(x).lower() for x in (b.get('correos') or [])][:120]
                viejos = con_quien_hablo(d, correo)
                salida, faltan = {}, []
                for c in pedidos:
                    otra = fichas.get(c)
                    # Se entregan las llaves de quien me puede leer: yo mismo,
                    # mi circulo, y los companeros de un grupo del que soy.
                    permitido = (c == correo or son_amigos(d, correo, c)
                                 or c in viejos)
                    if not permitido or not otra:
                        continue
                    aps = aparatos_de(otra, ahora)
                    if aps:
                        salida[c] = aps
                    else:
                        # No es un error: es alguien que todavia no ha abierto
                        # la version nueva. La app tiene que poder decirlo con
                        # esas palabras en vez de fallar en silencio.
                        faltan.append(c)
                return self._json(200, {'llaves': salida, 'sinLlave': faltan})

            # ── el circulo ────────────────────────────────────────────────
            if ruta == '/amistad/pedir':
                otro = str(b.get('para', '')).lower()
                if not correo_valido(otro) or otro == correo:
                    return self._json(400, {'error': 'faltan datos'})
                if otro not in fichas:
                    return self._json(404, {'error': 'esa persona no está en el chat'})
                circulo = d.setdefault('circulo', {})
                k = par(correo, otro)
                l = circulo.get(k)
                if l and l['estado'] == 'ok':
                    return self._json(200, {'estado': 'amigos'})
                if l and l['estado'] == 'pedido':
                    if l.get('de') == correo:
                        return self._json(200, {'estado': 'enviada'})
                    # Los dos se pidieron a la vez: eso ya es un si de ambos
                    # lados, y hacerles pulsar «aceptar» seria pedantería.
                    l['estado'] = 'ok'
                    l['en'] = int(time.time() * 1000)
                    guardar(d)
                    return self._json(200, {'estado': 'amigos'})
                if cuantos_pedidos(d, correo) >= TOPE_PEDIDOS:
                    return self._json(429, {'error': 'demasiadas solicitudes abiertas'})
                circulo[k] = {'estado': 'pedido', 'de': correo,
                              'en': int(time.time() * 1000),
                              'nota': str(b.get('nota', ''))[:140]}
                guardar(d)
                return self._json(200, {'estado': 'enviada'})

            if ruta == '/amistad/responder':
                otro = str(b.get('de', '')).lower()
                circulo = d.setdefault('circulo', {})
                l = circulo.get(par(correo, otro))
                # Solo responde quien RECIBIO. Sin esta comprobacion, quien
                # pide podria aceptarse a si mismo y la solicitud no serviria
                # para nada.
                if not l or l['estado'] != 'pedido' or l.get('de') == correo:
                    return self._json(404, {'error': 'no hay solicitud'})
                if b.get('aceptar'):
                    l['estado'] = 'ok'
                    l['en'] = int(time.time() * 1000)
                    guardar(d)
                    return self._json(200, {'estado': 'amigos'})
                # Rechazar BORRA la fila. Guardar un «rechazado» permitiria
                # preguntar «me rechazo?», y eso no le hace bien a nadie: para
                # quien pidio queda como si no hubiera contestado todavia.
                circulo.pop(par(correo, otro), None)
                guardar(d)
                return self._json(200, {'estado': 'no'})

            if ruta == '/amistad/quitar':
                otro = str(b.get('con', '')).lower()
                d.setdefault('circulo', {}).pop(par(correo, otro), None)
                guardar(d)
                return self._json(200, {'ok': True})

            if ruta == '/amistad/lista':
                circulo = d.get('circulo', {})
                amigos, recibidas, enviadas = [], [], []
                for k, l in circulo.items():
                    lados = k.split('|')
                    if correo not in lados:
                        continue
                    otro = lados[0] if lados[1] == correo else lados[1]
                    ficha_otro = fichas.get(otro)
                    if not ficha_otro:
                        continue
                    x = resumen_ficha(otro, ficha_otro)
                    if l['estado'] == 'ok':
                        amigos.append(x)
                    elif l.get('de') == correo:
                        enviadas.append(x)
                    else:
                        x['nota'] = l.get('nota', '')
                        x['en'] = l.get('en', 0)
                        recibidas.append(x)
                amigos.sort(key=lambda x: x['nombre'].lower())
                recibidas.sort(key=lambda x: -x.get('en', 0))
                return self._json(200, {'amigos': amigos, 'recibidas': recibidas,
                                        'enviadas': enviadas})

            # ── los estados de 24 horas ───────────────────────────────────
            if ruta == '/estado/subir':
                ahora = int(time.time() * 1000)
                purgar_estados(d, ahora)
                texto = str(b.get('texto', ''))[:300].strip()
                archivo = str(b.get('archivo', ''))
                tiene = archivo in d.get('archivos', {})
                if not texto and not tiene:
                    return self._json(400, {'error': 'faltan datos'})
                mios = [e for e in d.get('estados', []) if e['de'] == correo]
                if len(mios) >= TOPE_ESTADOS:
                    return self._json(429, {'error': 'demasiados estados'})
                e = {'id': secrets.token_hex(8), 'de': correo, 'texto': texto,
                     'cuando': ahora, 'vence': ahora + VIDA_ESTADO, 'vistas': []}
                if tiene:
                    e['archivo'] = archivo
                    e['tipo'] = 'video' if str(
                        d['archivos'][archivo].get('tipo', '')).startswith('video') else 'imagen'
                # El color de fondo de un estado de solo texto. Lo elige la app
                # y se guarda como un indice, no como un color: asi el dia que
                # cambie la paleta de la marca cambian todos a la vez.
                fondo = b.get('fondo')
                if isinstance(fondo, int) and 0 <= fondo < 8:
                    e['fondo'] = fondo
                d.setdefault('estados', []).append(e)
                guardar(d)
                return self._json(200, {'id': e['id']})

            if ruta == '/estado/borrar':
                ahora = int(time.time() * 1000)
                eid = str(b.get('id', ''))
                antes = len(d.get('estados', []))
                d['estados'] = [e for e in d.get('estados', [])
                                if not (e['id'] == eid and e['de'] == correo)]
                purgar_estados(d, ahora)
                if len(d['estados']) != antes:
                    guardar(d)
                return self._json(200, {'ok': True})

            if ruta == '/estados':
                ahora = int(time.time() * 1000)
                purgar_estados(d, ahora)
                # Los mios y los de mi circulo, agrupados por persona, como se
                # miran: una fila por persona, no un revoltijo por fecha.
                por_quien = {}
                for e in d.get('estados', []):
                    if e['de'] != correo and not son_amigos(d, correo, e['de']):
                        continue
                    ficha_suya = fichas.get(e['de'])
                    if not ficha_suya:
                        continue
                    g = por_quien.setdefault(e['de'], {
                        **resumen_ficha(e['de'], ficha_suya), 'estados': []})
                    g['estados'].append({
                        'id': e['id'], 'texto': e.get('texto', ''),
                        'archivo': e.get('archivo', ''), 'tipo': e.get('tipo', ''),
                        'fondo': e.get('fondo'), 'cuando': e['cuando'],
                        'vence': e['vence'],
                        'visto': correo in e.get('vistas', []),
                        # Quien lo subio ve CUANTOS lo vieron. Quien lo mira,
                        # no: la lista de quien vio que es de su dueño.
                        'vistas': len(e.get('vistas', [])) if e['de'] == correo else None,
                    })
                salida = list(por_quien.values())
                for g in salida:
                    g['estados'].sort(key=lambda x: x['cuando'])
                    g['sinVer'] = sum(1 for x in g['estados'] if not x['visto'])
                # Primero quien tiene algo sin ver, y dentro de eso lo mas
                # reciente: es el orden en el que se miran de verdad.
                salida.sort(key=lambda g: (-g['sinVer'], -g['estados'][-1]['cuando']))
                guardar(d)
                return self._json(200, {'gente': salida})

            if ruta == '/estado/visto':
                eid = str(b.get('id', ''))
                for e in d.get('estados', []):
                    if e['id'] == eid and (e['de'] == correo or son_amigos(d, correo, e['de'])):
                        if correo not in e.setdefault('vistas', []):
                            e['vistas'].append(correo)
                            guardar(d)
                        break
                return self._json(200, {'ok': True})

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
                cortes = d.get('cortes', {}).get(correo, {})
                # Una conversación VACIADA sigue en la lista aunque no quede
                # nada dentro —se pidió vaciarla, no perderla—, así que se
                # siembra igual que un grupo recién creado. La QUITADA no se
                # siembra: solo vuelve si llega un mensaje nuevo.
                for otro, c in cortes.items():
                    if isinstance(c, dict) and not c.get('quitar') and not ID_GRUPO.fullmatch(otro):
                        hilos.setdefault(otro, {'ultimo': None, 'sinLeer': 0})
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
                    # lo que quedó del otro lado del corte no cuenta para nada:
                    # ni como último dicho ni —sobre todo— como sin leer. Una
                    # burbuja con un número que al abrir el hilo no enseña nada
                    # es peor que no tener la función.
                    c = cortes.get(otro)
                    if isinstance(c, dict) and m['cuando'] <= c.get('en', 0):
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
                    # la foto viaja también aquí: sin ella la lista de gente se
                    # pintaba con iniciales mientras el grupo de al lado sí
                    # tenía cara, y pedirla ficha por ficha era una llamada por
                    # cada fila
                    lista.append({'correo': otro,
                                  'nombre': g.get('nombre', otro.split('@')[0]),
                                  'addr': g.get('addr', ''),
                                  'gid': g.get('gid', ''),
                                  'foto': g.get('foto', ''),
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
                r = sumar_miembros(d, g, b.get('correos'), int(time.time() * 1000))
                guardar(d)
                n = len(r['entraron'])
                # 'añadidos' se queda con ese nombre pase lo que pase: la app
                # del teléfono y la web ya lo leen y no se actualizan a la vez.
                # 'agregados' es el mismo número sin la eñe, para quien tenga
                # que leerlo desde un sitio donde una clave con tilde duele.
                # Lo nuevo son las listas: sin ellas la pantalla no puede
                # distinguir «entró» de «ese correo no existe» y acaba diciendo
                # «invitación enviada» cuando no se invitó a nadie.
                return self._json(200, {
                    'ok': True, 'añadidos': n, 'agregados': n,
                    'entraron': r['entraron'], 'noExisten': r['noExisten'],
                    'yaEstaban': r['yaEstaban'], 'sinCupo': r['sinCupo'],
                    'invalidos': r['invalidos']})

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

        # ── AQUI, YA FUERA DEL CANDADO, ES DONDE SE ESPERA ──────────────────
        #
        # /senales sale del bloque de arriba SIN contestar, dejando su correo
        # en `esperar_para`. La espera larga tiene que ocurrir con el candado
        # global ya soltado: dentro, veinticinco segundos de espera serian
        # veinticinco segundos de chat congelado para todos los demas.
        if esperar_para:
            return self._json(200, {'senales': recoger_senales(esperar_para)})

        return self._json(404, {'error': 'no existe'})


if __name__ == '__main__':
    os.makedirs(os.path.dirname(RUTA), exist_ok=True)
    puerto = int(os.environ.get('MENSAJES_PUERTO', '8390'))
    print('relevo de mensajes en :%d, datos en %s' % (puerto, RUTA), flush=True)
    ThreadingHTTPServer(('127.0.0.1', puerto), Relevo).serve_forever()
