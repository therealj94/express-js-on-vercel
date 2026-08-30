# AU-RA en WhatsApp.
#
# ── POR QUE ESTO NO ES UN BOT NUEVO ──────────────────────────────────────────
#
# AU-RA ya sabe conversar. Lo que le faltaba era una boca mas. Asi que esto no
# toca el cerebro: se hace pasar por el relevo.
#
# `atender()` y `atender_charla()` reciben un objeto `rel` y le piden cosas
# —bandeja, enviar, escribiendo, leido—. Si otro objeto responde a esas mismas
# preguntas hablando con WhatsApp, el cerebro atiende WhatsApp sin enterarse y
# sin que haya que tocarle una linea. Eso es todo lo que hay aqui.
#
# ── POR QUE SE SONDEA Y NO SE RECIBE UN AVISO ────────────────────────────────
#
# El proveedor ofrece webhooks, que en teoria son mejores: llegan solos y no
# hay que preguntar. Se eligio sondear igual, y por razones concretas:
#
#   · Un webhook obliga a abrir una ruta publica nueva. Ahi entra cualquiera
#     que adivine la direccion, y lo que entra va derecho al cerebro. La firma
#     del proveedor es OPCIONAL —lo dice su documentacion—, o sea que la unica
#     defensa seria nuestra y nueva.
#   · AU-RA ya tiene un bucle que sondea el chat cada pocos segundos. Sumar una
#     fuente ahi son veinte lineas; montar un webhook son una ruta publica, una
#     verificacion de firma, un despliegue del relevo y una superficie mas que
#     cuidar.
#   · La latencia de sondear es la misma que ya tiene el chat de la casa. Nadie
#     va a notar la diferencia, y el chat de la casa es el que marca el paso.
#
# Sondeando, la unica pieza que habla con el proveedor somos nosotros, hacia
# afuera. No hay puerta nueva.
#
# ── LA PUERTA ES NUESTRA, NO EL «SIN LEER» DEL PROVEEDOR ─────────────────────
#
# Esta leccion ya esta aprendida en `vuelta()` y aqui aplica igual: marcar
# leido sella la hora actual, y un mensaje que llegue mientras el motor piensa
# queda detras del sello PARA SIEMPRE. Asi que el sello es cortesia visual, y
# quien decide que esta pendiente es un tope local nuestro.
#
# ── LO QUE WHATSAPP NO PERDONA, Y ESTA RESUELTO AQUI ─────────────────────────
#
# AU-RA contesta en trozos: manda la primera frase y va EDITANDO ese mensaje
# mientras piensa. En la wallet eso se ve como una respuesta que se escribe
# sola. En WhatsApp no se puede editar, asi que hacerlo literal mandaria quince
# mensajes sueltos por una sola respuesta — y a quien lo recibe le explota el
# telefono.
#
# Aqui los trozos se GUARDAN y sale un solo mensaje al cerrar. El cerebro sigue
# creyendo que edita; el desajuste se absorbe en esta clase, que es su sitio.

import json
import os
import threading
import time
import urllib.error
import urllib.request

BASE = os.environ.get('ZERNIO_BASE', 'https://zernio.com/api/v1')
CLAVE = (os.environ.get('ZERNIO_CLAVE') or '').strip()
CUENTA = (os.environ.get('ZERNIO_CUENTA') or '').strip()

# WhatsApp corta el cuerpo de un mensaje de texto en 4096 caracteres. AU-RA se
# explaya cuando le preguntan algo de verdad, asi que sin esto la respuesta
# llegaria cortada — o rechazada— justo en las respuestas que mas valen.
TOPE_TEXTO = 4000

# Fuera de las 24 horas desde el ultimo mensaje de la persona, Meta rechaza
# cualquier texto libre: solo deja plantillas aprobadas. AU-RA solo contesta a
# quien acaba de escribir, asi que no deberia pasar nunca; si pasa es que algo
# se atasco mucho, y conviene que se lea en el registro y no como un error de
# red cualquiera.
VENTANA_MS = 24 * 3600 * 1000


class NoSalio(Exception):
    """La respuesta no llego a salir de verdad.

    Existe para distinguir dos cosas que el cerebro trataba igual y no lo son:

      · En el chat de la casa, si falla CERRAR el globo, el texto ya esta en el
        relevo — se ve, se lee, solo queda marcado como parcial. Tragarse ese
        error es correcto.
      · En WhatsApp no hay globo que cerrar: el cierre ES el envio. Si falla,
        no salio NADA, y la respuesta entera —ya escrita, ya pagada en tiempo
        de motor— se pierde.

    Por eso esta excepcion sube en vez de quedarse: `atender_charla` no avanza
    el tope y el mensaje se vuelve a atender. Contestar tarde es mejor que no
    contestar.
    """


def encendido():
    """Sin clave ni cuenta, esto sencillamente no esta puesto en marcha."""
    return bool(CLAVE and CUENTA)


# ── EL FRENO, Y POR QUE ESTA AQUI Y NO EN EL BUCLE ──────────────────────────
#
# La primera version freno el SONDEO —una vuelta cada cinco segundos— y creyo
# que con eso bastaba. No basto: una vuelta descubre tres charlas, cada charla
# se atiende en su propio hilo, y cada una hace cinco o seis llamadas (bandeja,
# escribiendo, enviar, editar, editar, leido). O sea que «una vuelta cada cinco
# segundos» eran veinte llamadas en rafaga, y el proveedor las corto con 429.
#
# El freno tiene que estar donde estan las llamadas, no donde esta el bucle.
# Aqui se serializan TODAS, vengan del hilo que vengan, con un hueco minimo
# entre una y la siguiente.
_CANDADO_RITMO = threading.Lock()
_ULTIMA = [0.0]
HUECO = float(os.environ.get('ZERNIO_HUECO', '1.2'))

# Reintentos ante un 429 o un corte de red. Es lo que evita que una respuesta ya
# escrita se pierda por un tropiezo de un segundo: ver `_soltar`.
ESPERAS_429 = (2, 5, 12, 30)


def _pedir(metodo, ruta, cuerpo=None, timeout=25):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    ultimo = None
    for intento in range(len(ESPERAS_429) + 1):
        with _CANDADO_RITMO:
            espera = HUECO - (time.time() - _ULTIMA[0])
            if espera > 0:
                time.sleep(espera)
            _ULTIMA[0] = time.time()
        req = urllib.request.Request(
            BASE + ruta, method=metodo, data=datos,
            headers={'Authorization': 'Bearer ' + CLAVE,
                     'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read() or b'{}')
        except urllib.error.HTTPError as e:
            # Solo se reintenta lo que se arregla esperando. Un 400 o un 401 no
            # mejoran por insistir, y reintentarlos es gastar el cupo que hace
            # falta para lo que si.
            if e.code not in (429, 500, 502, 503, 504):
                raise
            ultimo = e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            ultimo = e
        if intento < len(ESPERAS_429):
            time.sleep(ESPERAS_429[intento])
    raise ultimo


def _ms(iso):
    """Una fecha del proveedor a milisegundos. Sirve de tope y de orden."""
    if not iso:
        return 0
    try:
        t = str(iso).replace('Z', '+00:00')
        from datetime import datetime
        return int(datetime.fromisoformat(t).timestamp() * 1000)
    except Exception:
        return 0


def trozos(texto, tope=TOPE_TEXTO):
    """Parte un texto largo sin cortar palabras por la mitad.

    Se corta por parrafo, y si no hay, por espacio. Cortar a ciegas en el
    caracter 4096 parte una palabra o un enlace, y un enlace partido dejo de
    ser un enlace.
    """
    texto = (texto or '').strip()
    if len(texto) <= tope:
        return [texto] if texto else []
    partes, resto = [], texto
    while len(resto) > tope:
        corte = resto.rfind('\n\n', 0, tope)
        if corte < tope // 2:
            corte = resto.rfind('\n', 0, tope)
        if corte < tope // 2:
            corte = resto.rfind(' ', 0, tope)
        if corte < tope // 2:
            corte = tope          # una palabra imposible: se corta y ya
        partes.append(resto[:corte].strip())
        resto = resto[corte:].strip()
    if resto:
        partes.append(resto)
    return [p for p in partes if p]


class RelevoWhatsApp:
    """El mismo trato que `Relevo`, hablando con WhatsApp.

    Solo implementa lo que el cerebro llama de verdad. Lo que no tiene sentido
    en WhatsApp devuelve vacio en vez de fallar: una amistad que aceptar no
    existe —cualquiera puede escribirle a un numero— y una huella de version no
    tiene donde ponerse.
    """

    def __init__(self, cuenta=None, registrar=None):
        self.cuenta = cuenta or CUENTA
        self.log = registrar or (lambda *a: None)
        # correo (telefono) -> id de conversacion del proveedor
        self._hilos = {}
        # Los globos a medio escribir. Ver la cabecera: el cerebro cree que
        # edita, y lo que hacemos es guardar hasta que cierre.
        self._globos = {}
        self._n = 0
        self._candado = threading.Lock()

    # ── lo que no aplica ────────────────────────────────────────────────────
    def solicitudes(self):
        return []

    def aceptar(self, de):
        return {}

    def huella(self, h):
        return {}

    def ficha(self, de):
        """VACIA A PROPOSITO, y esto no es un hueco por llenar.

        En el chat de la casa `ficha()` devuelve el nombre, el Genesis ID
        declarado y la DIRECCION de la billetera, y con esa direccion
        `quien_es()` consulta el saldo en la cadena y se lo pasa al modelo. Eso
        esta bien ahi: la persona entro con su correo y su llave, y le estamos
        contando a ella lo suyo.

        En WhatsApp lo unico que sabemos de quien escribe es un NUMERO DE
        TELEFONO. Nadie demostro que ese numero sea de la persona cuya
        billetera se consultaria: no hay sesion, no hay llave, no hay vinculo.
        Devolver aqui una ficha de verdad seria contarle el saldo de alguien a
        quien tenga ese numero — un chip clonado, un telefono prestado, un
        numero reciclado por la operadora.

        Asi que devuelve vacio, y `quien_es()` no arma ninguna linea. El dia
        que haya que atar un telefono a una identidad, se ata en Genesis ID con
        su prueba, y ENTONCES se decide que se puede contar. No antes, y no
        aqui.
        """
        return {}

    # ── leer ────────────────────────────────────────────────────────────────
    def conversaciones(self):
        """Las charlas de WhatsApp, con la forma que espera el cerebro."""
        d = _pedir('GET', f'/inbox/conversations?platform=whatsapp'
                          f'&accountId={self.cuenta}&limit=50&sortOrder=desc')
        salida = []
        for c in d.get('data') or []:
            quien = c.get('participantId') or ''
            if not quien:
                continue
            with self._candado:
                self._hilos[quien] = c.get('id')
            salida.append({
                'correo': quien,
                'nombre': c.get('participantName') or '',
                'ultimo': {'cuando': _ms(c.get('updatedTime'))},
            })
        return salida

    def bandeja(self, desde):
        """Los mensajes de esa charla, del mas viejo al mas nuevo.

        `de` se rellena con el telefono cuando el mensaje es entrante y con
        nuestro propio nombre cuando es nuestro: `atender_charla` filtra por
        ese campo para saber que esta pendiente, y sin la distincion se
        contestaria a nuestras propias respuestas.
        """
        hilo = self._hilo_de(desde)
        if not hilo:
            return []
        d = _pedir('GET', f'/inbox/conversations/{hilo}/messages'
                          f'?accountId={self.cuenta}&limit=100&sortOrder=asc')
        # OJO CON LOS NOMBRES: esta ruta NO devuelve lo mismo que el aviso del
        # webhook, aunque hablen de lo mismo. Aqui la lista se llama
        # `messages` (no `data`), el texto `message` (no `text`) y lo entrante
        # es `incoming` (no `inbound`).
        #
        # Esto no se dedujo: se leyo de una respuesta de verdad. La primera
        # version se escribio a partir del esquema del webhook —que si usa
        # `data`/`text`/`inbound`— y la bandeja salia SIEMPRE vacia: AU-RA
        # marcaba la charla como leida y no contestaba nada, que es peor que no
        # hacer nada. Y las pruebas pasaban, porque el proveedor de mentira
        # estaba escrito con la misma suposicion equivocada.
        salida = []
        for m in d.get('messages') or []:
            entrante = (m.get('direction') or '') == 'incoming'
            meta = m.get('metadata') or {}
            salida.append({
                'id': m.get('id'),
                'de': desde if entrante else 'aura',
                'texto': m.get('message') or '',
                'cuando': _ms(m.get('sentAt') or m.get('createdAt')),
                'tipo': 'voz' if _es_voz(m) else 'texto',
                'adjuntos': m.get('attachments') or [],
                # QUE BOTON TOCO, si toco uno. Viene en `metadata.interactiveId`
                # y es el `payload` que mandamos nosotros. Sin esto habria que
                # adivinar por el texto del boton, que funciona hasta que dos
                # botones se llaman parecido.
                'toco': (meta.get('interactiveId')
                         if meta.get('interactiveType') in
                            ('button_reply', 'list_reply') else None),
            })
        return salida

    def _hilo_de(self, quien):
        with self._candado:
            hilo = self._hilos.get(quien)
        if hilo:
            return hilo
        # Se pudo perder el mapa (un reinicio): se rehace preguntando.
        self.conversaciones()
        with self._candado:
            return self._hilos.get(quien)

    # ── avisar y escribir ───────────────────────────────────────────────────
    def leido(self, de):
        hilo = self._hilo_de(de)
        if not hilo:
            return
        try:
            _pedir('POST', f'/inbox/conversations/{hilo}/read',
                   {'accountId': self.cuenta}, timeout=8)
        except Exception:
            pass   # cortesia visual; no puede tumbar nada

    def escribiendo(self, para):
        """El «escribiendo…» de WhatsApp.

        Con respuestas que tardan medio minuto esto no es adorno: es la
        diferencia entre «esta pensando» y «este numero no contesta».
        """
        hilo = self._hilo_de(para)
        if not hilo:
            return
        try:
            _pedir('POST', f'/inbox/conversations/{hilo}/typing',
                   {'accountId': self.cuenta}, timeout=6)
        except Exception:
            pass

    def con_botones(self, para, texto, botones):
        """Un mensaje con hasta tres puertas.

        Es lo unico que NO pasa por el globo: un nodo del guion sale entero de
        una vez, porque ya esta escrito y no hay nada que esperar. Por eso
        tampoco cuesta motor.

        WhatsApp corta el titulo en 20 caracteres y no recorta: Meta rechaza el
        mensaje ENTERO, y la conversacion se queda muda. Se recorta aqui, y hay
        una prueba en el guion que vigila que no haga falta.
        """
        hilo = self._hilo_de(para)
        if not hilo:
            self.log('sin hilo para', para, '- no se pudo guiar')
            return {}
        return _pedir('POST', f'/inbox/conversations/{hilo}/messages', {
            'accountId': self.cuenta,
            'message': (texto or '').strip()[:1024],
            'buttons': [{'type': 'postback', 'title': t[:20], 'payload': d}
                        for t, d in (botones or [])[:3]],
        })

    # WhatsApp corta el titulo de una fila en 24 caracteres y la descripcion
    # en 72. Diez filas es el techo de Meta.
    TOPE_FILA, TOPE_DESC, TOPE_FILAS = 24, 72, 10

    def con_lista(self, para, texto, boton, filas):
        """Un mensaje con hasta DIEZ opciones, cada una con su subtitulo.

        Tres botones era el techo que creiamos tener. El campo se llama
        `interactive` y no `list` — probar con el nombre equivocado devuelve
        200 y el proveedor tira la lista EN SILENCIO, que fue exactamente el
        rato que se perdio el 30-ago antes de leer su documentacion. El 200 no
        prueba nada: lo que prueba es `metadata.waInteractive` en el mensaje
        guardado.

        `filas` son `(id, titulo, descripcion)`. La descripcion es el lujo que
        no dan los botones: «Tengo un negocio / Pulpería, taller, tienda» se
        entiende sin pensarlo, y quien duda se reconoce en el subtitulo.
        """
        hilo = self._hilo_de(para)
        if not hilo:
            self.log('sin hilo para', para, '- no se pudo guiar')
            return {}
        rows = []
        for f in (filas or [])[:self.TOPE_FILAS]:
            fid, titulo = f[0], f[1]
            desc = f[2] if len(f) > 2 else ''
            fila = {'id': str(fid)[:200], 'title': str(titulo)[:self.TOPE_FILA]}
            if desc:
                fila['description'] = str(desc)[:self.TOPE_DESC]
            rows.append(fila)
        return _pedir('POST', f'/inbox/conversations/{hilo}/messages', {
            'accountId': self.cuenta,
            'interactive': {
                'type': 'list',
                'body': {'text': (texto or '').strip()[:1024]},
                'action': {'button': str(boton)[:20],
                           'sections': [{'rows': rows}]},
            },
        })

    def enviar(self, para, texto, parcial=False):
        """Manda, o guarda si es un trozo.

        `parcial=True` es el cerebro abriendo un globo que va a ir agrandando.
        En WhatsApp no se puede agrandar nada, asi que se guarda y se devuelve
        un identificador nuestro; el mensaje sale de verdad cuando el cerebro
        cierre el globo con `editar(..., parcial=False)`.
        """
        if parcial:
            with self._candado:
                self._n += 1
                mid = f'wa-globo-{self._n}'
                self._globos[mid] = {'para': para, 'texto': texto or ''}
            return {'id': mid}
        return self._soltar(para, texto)

    def editar(self, mid, texto, parcial=False):
        """Agranda el globo, o lo cierra soltandolo de una pieza."""
        with self._candado:
            g = self._globos.get(mid)
            if g is None:
                # No es un globo nuestro. No hay nada que editar en WhatsApp,
                # y mandar el texto otra vez seria duplicar la respuesta.
                return {}
            g['texto'] = texto or ''
            if parcial:
                return {'id': mid}
            self._globos.pop(mid, None)
            para, entero = g['para'], g['texto']
        return self._soltar(para, entero)

    def _soltar(self, para, texto):
        """El unico sitio por el que sale texto hacia WhatsApp.

        SI ESTO FALLA, LANZA. Y es importante que lo haga.

        Como la respuesta se guarda entera y sale al cerrar el globo, un fallo
        justo en el cierre no pierde una frase: pierde LA RESPUESTA COMPLETA,
        ya escrita y ya pagada en tiempo de motor. Paso el 30-ago a las
        03:35:11 con un 429 —«no cerro el globo»—: la respuesta se tiro, el
        tope avanzo igual, y a la persona le quedo el visto y nada mas.

        Lanzando, `atender_charla` no avanza el tope y el mensaje se vuelve a
        atender en la vuelta siguiente. Es preferible contestar tarde a no
        contestar.
        """
        texto = (texto or '').strip()
        if not texto:
            return {}          # un mensaje vacio lo rechaza Meta, y con razon
        hilo = self._hilo_de(para)
        if not hilo:
            self.log('sin hilo para', para, '- no se pudo contestar')
            return {}
        ultimo = {}
        salieron = 0
        for parte in trozos(texto):
            try:
                ultimo = _pedir('POST', f'/inbox/conversations/{hilo}/messages',
                                {'accountId': self.cuenta, 'message': parte})
                salieron += 1
            except Exception as e:
                # Si ya habia salido algun trozo, se corta y no se relanza: al
                # reintentar se mandaria otra vez lo que ya llego, y la persona
                # veria la respuesta duplicada. Media respuesta con aviso es
                # mejor que una respuesta y media.
                if salieron:
                    self.log('respuesta a medias para', para,
                             f'({salieron} trozos), no se reintenta:', str(e)[:70])
                    return {'id': (ultimo or {}).get('id'), 'aMedias': True}
                raise NoSalio(str(e)) from e
        return {'id': (ultimo or {}).get('id')}


def _es_voz(m):
    """Una nota de voz, para que AU-RA la mande a transcribir como ya sabe."""
    for a in (m.get('attachments') or []):
        t = str(a.get('type') or a.get('contentType') or '').lower()
        if 'audio' in t or a.get('voiceNote'):
            return True
    return False


def tope_de_contacto_nuevo(ahora_ms=None):
    """El tope con el que arranca alguien a quien vemos por primera vez.

    NO ES «AHORA», y esa es toda la gracia. En el chat de la casa el perfil se
    crea al aceptar la amistad —antes de que llegue ningun mensaje— asi que un
    tope en el presente es correcto y protege de recontestar un archivo viejo.

    En WhatsApp no existe ese momento: la primera vez que vemos a alguien ES
    por su mensaje. Un tope en el presente queda POR ENCIMA de ese mensaje y lo
    entierra para siempre. Paso de verdad con el primer «Hola» de la primera
    prueba: llego al proveedor y AU-RA no contesto nunca.

    Se arranca 24 horas atras, y el numero no es arbitrario: fuera de esa
    ventana Meta rechaza el texto libre, o sea que es exactamente lo mas viejo
    que TENEMOS PERMITIDO contestar.
    """
    if ahora_ms is None:
        ahora_ms = int(time.time() * 1000)
    return ahora_ms - VENTANA_MS


def fuera_de_ventana(bandeja):
    """True si el ultimo mensaje de la persona ya paso las 24 horas.

    Meta rechaza texto libre fuera de esa ventana. Se comprueba para poder
    decirlo en el registro con su nombre, en vez de dejar un error del
    proveedor que parece un fallo de red.
    """
    entrantes = [m.get('cuando', 0) for m in bandeja if m.get('de') != 'aura']
    if not entrantes:
        return False
    return (int(time.time() * 1000) - max(entrantes)) > VENTANA_MS
