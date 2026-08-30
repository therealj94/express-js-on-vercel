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


def encendido():
    """Sin clave ni cuenta, esto sencillamente no esta puesto en marcha."""
    return bool(CLAVE and CUENTA)


def _pedir(metodo, ruta, cuerpo=None, timeout=25):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(
        BASE + ruta, method=metodo, data=datos,
        headers={'Authorization': 'Bearer ' + CLAVE,
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b'{}')


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
        salida = []
        for m in d.get('data') or []:
            entrante = (m.get('direction') or '') == 'inbound'
            salida.append({
                'id': m.get('id'),
                'de': desde if entrante else 'aura',
                'texto': m.get('text') or '',
                'cuando': _ms(m.get('sentAt')),
                'tipo': 'voz' if _es_voz(m) else 'texto',
                'adjuntos': m.get('attachments') or [],
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
        """El unico sitio por el que sale texto hacia WhatsApp."""
        texto = (texto or '').strip()
        if not texto:
            return {}          # un mensaje vacio lo rechaza Meta, y con razon
        hilo = self._hilo_de(para)
        if not hilo:
            self.log('sin hilo para', para, '- no se pudo contestar')
            return {}
        ultimo = {}
        for parte in trozos(texto):
            ultimo = _pedir('POST', f'/inbox/conversations/{hilo}/messages',
                            {'accountId': self.cuenta, 'message': parte})
        return {'id': (ultimo or {}).get('id')}


def _es_voz(m):
    """Una nota de voz, para que AU-RA la mande a transcribir como ya sabe."""
    for a in (m.get('attachments') or []):
        t = str(a.get('type') or a.get('contentType') or '').lower()
        if 'audio' in t or a.get('voiceNote'):
            return True
    return False


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
