"""El candado de AU-RA: la misma caja fuerte que usa la app, del lado del servidor.

── POR QUE HACE FALTA ────────────────────────────────────────────────────────

AU-RA no entendia las notas de voz. Contestaba «Por ahora solo entiendo texto,
¿me lo escribis?» — teniendo el oido ya construido, desplegado y pagado
(`/oir`, Whisper en la misma GPU, que la billetera ya usa para dictar).

Pero el cable que faltaba no era un cable. Al ir a ponerlo aparecio la razon de
fondo, y es de diseño:

  · Un adjunto se sube CIFRADO con una llave de un solo uso (`cerrarBytes`).
  · Esa llave viaja DENTRO del sobre del mensaje, cerrada a las llaves de
    aparato de quien lo recibe. El relevo guarda el archivo cerrado y nunca ve
    con que abrirlo — que es exactamente lo que tiene que pasar.
  · Y si no hay a quien cerrarselo, la app NO manda la llave a proposito: «iria
    en claro al lado de los bytes cifrados, que es lo mismo que no cifrar pero
    con mas pasos y aparentando lo contrario». Ver `enviarAdjunto` en chat.js.

AU-RA no tenia llave de aparato. Asi que una nota de voz para ella llegaba
cifrada con una llave que nadie mando: ilegible para todos, incluida ella. No
era que le faltara el oido — era que no estaba invitada a la conversacion.

Esto la invita. Con su llave publicada, AU-RA es una destinataria mas: el sobre
se le cierra a ella como a cualquier aparato, y lo que abre es lo que la persona
le escribio. Y de paso el texto normal tambien pasa a viajar cerrado en vez de
en claro, que hasta hoy era lo que ocurria por no tener llave.

── LO QUE ESTO SIGNIFICA, DICHO SIN ADORNOS ──────────────────────────────────

La llave privada de AU-RA vive en el servidor. O sea que hablar con AU-RA no es
privado del mismo modo que hablar con una persona: ella es el otro extremo, y
el otro extremo es una maquina nuestra. Eso no cambia con esto ni podria — un
asistente que no puede leer lo que le escribis no sirve de nada. Lo que cambia
es que ahora es lo mismo que pasa con cualquier aparato: el relevo sigue sin
poder abrir nada, y el archivo sigue guardado cerrado.

No se toca ni se debilita el cifrado entre personas. Este fichero solo ABRE lo
que va dirigido a AU-RA.

── LA CRIPTOGRAFIA, QUE TIENE QUE CUADRAR AL BYTE ────────────────────────────

Copiada de candado.js, no reinventada:

    acuerdo   ECDH sobre P-256, llave publica en formato `raw` (punto sin
              comprimir, 65 bytes que empiezan por 0x04)
    derivada  HKDF-SHA256, sal vacia, info "pulse2chat/sobre/v1" -> AES-256
    sobre     AES-GCM con vector de 12 bytes
    base64    base64URL SIN relleno (- en vez de +, _ en vez de /)

Cualquiera de esos cinco detalles mal y no abre nada, sin decir por que. Por eso
`probar-candado-aura.py` cierra un bulto con la MISMA receta que el navegador y
comprueba que este fichero lo abre.
"""

import base64
import json
import os
import stat

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

INFO_SOBRE = b'pulse2chat/sobre/v1'


def b64(datos: bytes) -> str:
    """base64URL sin relleno, como `aB64` en candado.js."""
    return base64.urlsafe_b64encode(datos).decode().rstrip('=')


def deb64(s: str) -> bytes:
    """Lo contrario, tolerando que falte el relleno."""
    t = str(s or '')
    return base64.urlsafe_b64decode(t + '=' * ((4 - len(t) % 4) % 4))


class Candado:
    """La llave de aparato de AU-RA, y lo que se puede hacer con ella."""

    def __init__(self, ruta):
        self.ruta = ruta
        self._cargar()

    # ── la llave, que se fabrica una vez y se guarda ────────────────────────
    def _cargar(self):
        if os.path.exists(self.ruta):
            d = json.loads(open(self.ruta).read())
            self.id = d['id']
            self.priv = serialization.load_pem_private_key(
                d['priv'].encode(), password=None)
        else:
            self.priv = ec.generate_private_key(ec.SECP256R1())
            # El id del aparato lo elige quien lo tiene; el relevo solo lo
            # reparte. 16 hex es lo mismo que usa la app.
            self.id = os.urandom(8).hex()
            self._guardar()

    def _guardar(self):
        pem = self.priv.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode()
        os.makedirs(os.path.dirname(self.ruta) or '.', exist_ok=True)
        # Se escribe con permisos de dueño ANTES de meterle nada: crear el
        # fichero abierto y arreglarlo despues deja una ventana en la que la
        # llave privada es legible para cualquiera de la maquina.
        f = os.open(self.ruta, os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                    stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(f, 'w') as fh:
            json.dump({'id': self.id, 'priv': pem}, fh)

    @property
    def publica_b64(self) -> str:
        """La publica en `raw` —punto sin comprimir— que es lo que importa
        WebCrypto con `importKey('raw', …)`."""
        return b64(self.priv.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        ))

    # ── abrir lo que viene ──────────────────────────────────────────────────
    def _secreto_con(self, pub_b64: str) -> bytes:
        suya = ec.EllipticCurvePublicKey.from_encoded_point(
            ec.SECP256R1(), deb64(pub_b64))
        crudo = self.priv.exchange(ec.ECDH(), suya)
        return HKDF(algorithm=hashes.SHA256(), length=32, salt=b'',
                    info=INFO_SOBRE).derive(crudo)

    def abrir(self, bulto) -> str | None:
        """El texto de un bulto dirigido a AU-RA, o None si no hay sobre suyo.

        Que no haya sobre es NORMAL y no es un error: un mensaje escrito antes
        de que AU-RA publicara su llave no se le cerro a nadie que sea ella.
        """
        if isinstance(bulto, str):
            try:
                bulto = json.loads(bulto)
            except Exception:
                return None
        if not isinstance(bulto, dict):
            return None

        sobre = next((s for s in bulto.get('s', []) if s.get('a') == self.id), None)
        if not sobre:
            return None

        k = self._secreto_con(bulto.get('de', ''))
        # Dos capas: el sobre guarda la llave del mensaje; la llave del mensaje
        # abre el texto.
        cruda = AESGCM(k).decrypt(deb64(sobre['iv']), deb64(sobre['k']), None)
        claro = AESGCM(cruda).decrypt(deb64(bulto['iv']), deb64(bulto['ct']), None)
        return claro.decode('utf-8', 'replace')

    @staticmethod
    def abrir_bytes(datos: bytes, llave_b64: str, iv_b64: str) -> bytes:
        """Un adjunto, con la llave que venia dentro del texto del mensaje."""
        return AESGCM(deb64(llave_b64)).decrypt(deb64(iv_b64), datos, None)


def carga_del_adjunto(texto: str):
    """Lo que `enviarAdjunto` mete en el texto cuando hay archivo.

    El formato es raro a proposito y conviene decirlo: es una llave `{` pegada
    delante de un JSON —`'{' + JSON.stringify({t, k, iv})`— asi que el texto
    empieza por `{{`. Se comprueba esa forma exacta en vez de intentar parsear
    cualquier cosa que empiece por llave, para no confundir con un mensaje que
    de la casualidad de ser JSON.

    Devuelve (texto_de_la_persona, llave, iv) o (texto, None, None).
    """
    t = str(texto or '')
    if not t.startswith('{{'):
        return t, None, None
    try:
        d = json.loads(t[1:])
    except Exception:
        return t, None, None
    if not isinstance(d, dict) or 'k' not in d:
        return t, None, None
    return str(d.get('t', '')), d.get('k'), d.get('iv')
