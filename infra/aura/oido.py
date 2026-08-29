"""El oído de AU-RA: una nota de voz que llega al chat, convertida en texto.

── POR QUE ESTE FICHERO ──────────────────────────────────────────────────────

Hasta hoy AU-RA contestaba «Por ahora solo entiendo texto. ¿Me lo escribís?» a
cualquier nota de voz. Y era raro de una forma que se nota: ELLA TE HABLA CON
VOZ. Le hablás con voz y no te oye.

El oído ya existía —`/oir` del servicio de voz, Whisper en la misma GPU, que la
billetera usa desde hace tiempo para dictar— y el asistente no lo llamaba ni
una vez. Lo que faltaba no era el modelo: era el camino desde el mensaje hasta
el audio.

── EL CAMINO, QUE TIENE CUATRO TRAMOS ────────────────────────────────────────

    1. el mensaje trae `tipo: 'voz'` y `archivo: <id>`
    2. el binario se baja del relevo con GET /archivo/<id>
    3. viene CIFRADO, con una llave de un solo uso que viajaba dentro del
       sobre del mensaje (ver candado.py: por eso AU-RA necesita llave propia)
    4. los bytes en claro van a /oir y vuelven como texto

Si cualquiera de los cuatro falla, AU-RA lo dice con palabras distintas para
cada caso. No es cosmética: «no pude bajarla», «no la pude abrir» y «no le
entendí» mandan a mirar sitios distintos, y un mensaje único para los tres es
lo que convierte un fallo de diez minutos en uno de dos horas.

── LO QUE NO SE HACE, Y POR QUE ──────────────────────────────────────────────

No se guarda el audio ni la transcripción en ningún sitio nuestro. Lo que se
transcribe se trata igual que si la persona lo hubiera escrito: entra en el
historial de la charla como texto y ahí acaba su vida. Un asistente que archiva
las notas de voz de la gente es otro producto, y uno que hay que explicar.
"""

import json
import urllib.error
import urllib.request

# Un opus de un minuto ronda el medio mega. Ocho es el tope que admite el
# relevo para un adjunto, así que más que eso no puede haber llegado.
TOPE_AUDIO = 8 * 1024 * 1024


class NoSePudoOir(Exception):
    """Con el motivo YA en palabras que se le pueden decir a una persona."""

    def __init__(self, para_la_persona, para_el_registro):
        super().__init__(para_el_registro)
        self.para_la_persona = para_la_persona


def bajar_adjunto(relevo_url: str, archivo_id: str, timeout=25) -> bytes:
    """Los bytes tal cual los guarda el relevo — cifrados, si venían así."""
    url = f'{relevo_url.rstrip("/")}/archivo/{archivo_id}'
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            datos = r.read(TOPE_AUDIO + 1)
    except urllib.error.HTTPError as e:
        raise NoSePudoOir('No pude bajar tu nota de voz. ¿Me la mandás de nuevo?',
                          f'HTTP {e.code} bajando {archivo_id}') from e
    except Exception as e:
        raise NoSePudoOir('No pude bajar tu nota de voz. ¿Me la mandás de nuevo?',
                          f'{type(e).__name__} bajando {archivo_id}') from e
    if len(datos) > TOPE_AUDIO:
        raise NoSePudoOir('Esa nota es muy larga para mí. ¿Me la contás más corta?',
                          f'{len(datos)} bytes, por encima del tope')
    if not datos:
        raise NoSePudoOir('Tu nota de voz llegó vacía. ¿Probás otra vez?',
                          f'{archivo_id} vino de 0 bytes')
    return datos


def transcribir(motor_voz: str, audio: bytes, correo: str, llave: str,
                idioma='es', timeout=90) -> str:
    """`/oir` del servicio de voz. El audio va CRUDO en el cuerpo.

    La credencial va en cabeceras y no en el cuerpo por la misma razón que en
    la app: el cuerpo son los bytes del audio, y envolverlos en JSON costaría
    un tercio más de subida en base64.
    """
    req = urllib.request.Request(
        f'{motor_voz.rstrip("/")}/oir', data=audio, method='POST',
        headers={'Content-Type': 'application/octet-stream',
                 'X-Correo': correo, 'X-Llave': llave,
                 'X-Idioma': 'en' if idioma == 'en' else 'es'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        if e.code == 503:
            raise NoSePudoOir('Se me tapó el oído un momento. Probá en un ratito.',
                              'el motor de voz todavía está cargando (503)') from e
        raise NoSePudoOir('No pude escuchar tu nota. ¿Me la escribís?',
                          f'/oir contestó HTTP {e.code}') from e
    except Exception as e:
        raise NoSePudoOir('No pude escuchar tu nota. ¿Me la escribís?',
                          f'{type(e).__name__} llamando a /oir') from e

    texto = str(d.get('texto', '')).strip()
    if not texto:
        # Silencio, o ruido. No es lo mismo que un fallo y no se dice igual.
        raise NoSePudoOir('No le entendí nada a esa nota. ¿La repetís?',
                          'la transcripción vino vacía')
    return texto


def oir_nota(mensaje, candado, relevo_url, motor_voz, correo, llave, idioma='es'):
    """De un mensaje con nota de voz al texto que dijo la persona.

    `mensaje` es el que devuelve `/bandeja`. `candado` es el de AU-RA, que hace
    falta para la llave del archivo: el relevo guarda el audio cerrado y nunca
    ve con qué abrirlo.
    """
    archivo = str(mensaje.get('archivo') or '')
    if not archivo:
        raise NoSePudoOir('Esa nota de voz vino sin audio. ¿La mandás otra vez?',
                          'mensaje de tipo voz sin campo archivo')

    # La llave del audio viaja DENTRO del texto del mensaje, y el texto del
    # mensaje viaja dentro del sobre. Sin sobre para AU-RA no hay llave, y sin
    # llave el archivo es ilegible — para ella y para cualquiera.
    llave_arch = iv_arch = None
    if mensaje.get('cif'):
        from candado import carga_del_adjunto
        claro = candado.abrir(mensaje['cif']) if candado else None
        if claro is None:
            raise NoSePudoOir(
                'No pude abrir tu nota de voz. Si la mandaste desde un aparato '
                'nuevo, escribime y lo arreglamos.',
                'el bulto no traía sobre para AU-RA')
        _, llave_arch, iv_arch = carga_del_adjunto(claro)

    datos = bajar_adjunto(relevo_url, archivo)

    if llave_arch:
        try:
            datos = candado.abrir_bytes(datos, llave_arch, iv_arch)
        except Exception as e:
            raise NoSePudoOir('No pude abrir tu nota de voz. ¿Me la mandás de nuevo?',
                              f'{type(e).__name__} descifrando el audio') from e

    return transcribir(motor_voz, datos, correo, llave, idioma)
