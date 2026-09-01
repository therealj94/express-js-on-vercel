#!/usr/bin/env python3
"""La voz de AU-RA. Corre en el nodo con GPU, al lado del motor que piensa.

    ── POR QUE ESTO EXISTE ──────────────────────────────────────────────────

Hasta ahora la app leia el texto con la voz del navegador: `speechSynthesis`.
Eso es una voz de sistema operativo, y suena a lo que es — a maquina. El
pedido fue textual: «una voz que funcione bien natural no esa robotica».

Asi que la voz se fabrica ACA, en el servidor, con un modelo de verdad.
    COMO LLEGA AL OIDO DE LA PERSONA, HOY. Al principio viajaba al chat como
NOTA DE VOZ —el mismo tipo de mensaje que graba una persona— y este parrafo lo
decia asi. Ya no: las notas de voz de AU-RA se retiraron, porque costaban 657
segundos de GPU al dia y eran la causa de las esperas de 21 a 59 segundos.
Ahora la app pide `/hablar` y suena EN VIVO mientras se genera, sin dejar nada
en el hilo.
    Y `/oir` va en el sentido contrario, que es de lo mismo: la persona graba y
AU-RA transcribe. Ver infra/aura/oido.py.

    ── LO QUE HACE EL MOTOR Y LO QUE HACEMOS NOSOTROS ───────────────────────

El motor (Chatterbox Multilingual, de Resemble AI) pone el timbre y la
entonacion. No entiende SSML ni etiquetas: le das texto y te da audio.

Todo lo que suena HUMANO se fabrica aca abajo, entre el texto y el audio:
el troceado por unidad de aliento, los silencios medidos, el ruido de sala
que rellena esos silencios, la pausa antes de un numero, y la unica duda
permitida al principio de la nota. Sin esta capa el motor lee bien pero
seguido, como un locutor apurado; con ella, respira.

    ── LA LICENCIA, QUE ES LO QUE HUNDE A LA MITAD DEL MERCADO ──────────────

Chatterbox es MIT en el CODIGO y MIT en los PESOS, comprobado por separado.
Esa separacion es el punto: XTTS-v2 tiene el codigo libre y los pesos NO
comerciales (CPML); F5-TTS y Fish Speech, lo mismo. Codigo abierto no
significa que el modelo se pueda usar en un producto que cobra.

Y hay algo que la licencia NO cubre y conviene tenerlo escrito: DE QUIEN ES
LA VOZ. Este motor puede clonar una voz desde un clip de referencia, y ahi
la licencia del modelo no dice nada — la voz de una persona es dato
biometrico. Por eso, mientras no haya cesion firmada de un locutor, aca se
usa UNICAMENTE la voz de fabrica que trae el modelo (su `conds.pt`), que no
es de nadie. Los tres registros de abajo son esa misma voz con tres
temperamentos distintos, no tres personas clonadas.
"""

import io
import json
import os
import re
import subprocess
import threading
import time
import wave

import numpy as np

import vozmemoria
from decir import para_la_voz

MODELO_DIR = os.environ.get('AURA_VOZ_MODELO', '')       # vacio = el de fabrica

# Donde vive la memoria de la voz. Ver `vozmemoria.py`.
MEMORIA_DIR = os.environ.get('AURA_VOZ_MEMORIA', '/srv/voz')

# Con que se templa la voz al arrancar, un idioma cada uno. Ver `cargar`.
TEMPLADO = (('es', 'Hola.'), ('en', 'Hello.'))
PUERTO = int(os.environ.get('AURA_VOZ_PUERTO', '8123'))
# ── DONDE ESCUCHA, Y POR QUE ──────────────────────────────────────────────
#
# Por defecto solo en 127.0.0.1: el asistente vive en esta misma maquina y no
# hace falta mas.
#
# Cuando la voz EN VIVO tiene que llegar al navegador, hay que dejar entrar
# al nodo del cerebro, que es el que tiene el certificado y el dominio. Ahi
# se pone 0.0.0.0 — y la pared no es esta linea, es el grupo de seguridad:
# el puerto 8123 solo admite al grupo del cerebro, por direccion privada,
# nunca desde internet. Escribirlo aca sin esa regla seria abrir la GPU al
# mundo, asi que las dos cosas van juntas o no va ninguna.
#
# Ollama NO se mueve: sigue en 127.0.0.1 y no sale de la maquina ni por
# error. Lo que se expone es la voz, con puerta y con cupo.
ESCUCHA = os.environ.get('AURA_VOZ_ESCUCHA', '127.0.0.1')
MUESTREO = 24000                                          # lo que entrega el motor

# ── LOS TRES REGISTROS ────────────────────────────────────────────────────
#
# Son la MISMA voz de fabrica con tres temperamentos. Los tres numeros no son
# decorativos:
#   exageracion  cuanto color emocional pone. Bajo = formal; alto = expresiva.
#   apego        cuanto se pega al texto. Alto = mas lenta y literal, que es
#                lo que se quiere cuando dice un monto. Bajo = mas suelta.
#   temperatura  cuanto improvisa. Baja para numeros, alta para conversar.
# El `semilla` fija hace que el timbre no derive entre trozo y trozo de una
# misma nota: sin eso, la voz cambia sutilmente a mitad de frase y se nota.
VOCES = {
    'calida': {
        'nombre': 'Cálida',
        'que_es': 'La de siempre. Conversa, explica, acompaña.',
        'exageracion': 0.50, 'apego': 0.50, 'temperatura': 0.70, 'semilla': 1101,
        # Cuanto se alarga cada silencio respecto de la tabla base. Una voz
        # calida se toma su tiempo; una agil no.
        'aire': 1.15,
    },
    'sobria': {
        'nombre': 'Sobria',
        'que_es': 'Para montos, confirmaciones y avisos. Lenta y clara.',
        'exageracion': 0.35, 'apego': 0.62, 'temperatura': 0.60, 'semilla': 2202,
        'aire': 1.30,
    },
    'agil': {
        'nombre': 'Ágil',
        'que_es': 'Rápida y con energía. Para respuestas cortas.',
        'exageracion': 0.72, 'apego': 0.32, 'temperatura': 0.85, 'semilla': 3303,
        'aire': 0.85,
    },
}
VOZ_POR_DEFECTO = 'calida'

# Como viene armado el cuerpo de /hablar. Va en una cabecera para que el que
# escucha pueda comprobarlo en vez de suponerlo: si algun dia cambia el
# reparto de los trozos, una version vieja de la app se da cuenta y se pasa
# a la nota de voz, en vez de tocar ruido.
FORMATO = 'trozos-mp3-v1'

# Los sitios cuyo navegador puede pedir voz. Es LA MISMA lista del relevo, a
# proposito: son la misma casa vista desde dos puertas, y dos listas que
# tendrian que decir lo mismo terminan diciendo cosas distintas.
ORIGENES = {
    'https://www.vetawallet.com',
    'https://vetawallet.com',
    'https://app.vetawallet.com',
    'https://main.d289v5ffkexk23.amplifyapp.com',   # el ensayo
    'http://localhost:8899',                        # y el escritorio de quien lo hace
    'http://127.0.0.1:8899',
}

# ── LA TABLA DE SILENCIOS ─────────────────────────────────────────────────
#
# Milisegundos de silencio DESPUES de cada trozo, segun con que signo
# termino. Estos numeros salieron de escuchar, no de una formula: por debajo
# de 150 ms el oido no registra pausa, y por encima de 800 ms parece que la
# nota se corto.
SILENCIOS = {
    'coma':      200,
    'punto':     420,
    'aparte':    700,
    'dospuntos': 320,
    'pregunta':  550,   # una pregunta dirigida a la persona pide su hueco
    'ninguno':   120,   # corte tecnico a mitad de oracion: casi nada
}
# La pausa que mas humaniza de todas, y va ANTES y no despues: un respiro
# corto justo antes de decir una cifra. Se lee como cuidado — «dejame ver el
# dato»— y no como duda. Es la diferencia entre un cajero y una maquina.
ANTES_DE_CIFRA = 260

# ── LAS DUDAS ─────────────────────────────────────────────────────────────
#
# Van en el TEXTO, no en el audio: el motor es autorregresivo y las renderiza
# con respiracion de verdad. Pero con regla estricta, porque una duda mal
# puesta no suena humana, suena insegura — y una asistente de plata que suena
# insegura es un problema, no un encanto.
DUDAS = ('A ver, ', 'Mirá, ', 'Okey, ')

# Nunca antes de una mala noticia. Ahi la duda suena a que no sabe, o peor, a
# que se esta haciendo la que no sabe. Mala noticia = frase limpia y directa.
MALA_NOTICIA = re.compile(
    r'\b(no se puede|no puedo|rechaz|fall|error|insuficiente|vencid|bloquea|'
    r'suspend|denegad|no está disponible|no existe|todavía no)', re.I)

# Tampoco cuando la persona pregunta algo de seguridad: ahi se contesta
# derecho o no se contesta.
SIN_ADORNO = re.compile(r'\b(contraseña|clave|palabras|semilla|robo|estafa|hacke)', re.I)

# ── EL TROCEADO ───────────────────────────────────────────────────────────

TOPE_TROZO = 220        # el motor se desestabiliza en textos largos: repite,
                        # se acelera, se traga silabas. 220 es el techo seguro.
MIN_TROZO = 25          # por debajo de esto no vale la pena una generacion
                        # aparte: el arranque del modelo cuesta mas que el
                        # trozo, y ademas suena entrecortado.

# Un numero con coma o punto adentro (12,50 · 0.001 · 1.234,56) tiene que
# viajar ENTERO: cortar «12,» / «50» convierte doce con cincuenta en dos
# frases y la persona oye dos montos donde hay uno.
CIFRA = re.compile(r'\d[\d.,]*\d|\d')
CIFRA_PARTIDA = re.compile(r'\d[.,]$')
# Una letra de verdad, con tildes y eñes. Un trozo sin ninguna no se puede
# decir en voz alta, y al motor no le da igual: se cae.
LETRA = re.compile(r'[^\W\d_]', re.UNICODE)

_CIERRE = {'.': 'punto', '!': 'punto', '?': 'pregunta', ':': 'dospuntos',
           ';': 'punto', ',': 'coma'}


def trozos(texto):
    """Parte el texto en unidades de aliento, con su silencio de salida.

    Devuelve [(texto, ms_de_silencio_despues, pide_respiro_antes)].

    Se corta por prioridad: punto > punto y coma > coma > espacio. Y NUNCA
    dentro de una cifra: eso es una regla dura, no una preferencia. El
    `pide_respiro_antes` marca los trozos que empiezan con un numero, que son
    los que llevan el respiro corto de ANTES_DE_CIFRA.
    """
    texto = re.sub(r'\s+', ' ', str(texto or '')).strip()
    if not texto:
        return []

    # 1) por oraciones, conservando el signo que las cierra.
    #
    # El `(?<=\d)[.,](?=\d)` no es adorno: en español el separador de miles ES
    # un punto. Sin esa excepcion, «1.234,56» se parte en «1.» y «234,56», y
    # la nota dice «uno» y despues «doscientos treinta y cuatro con cincuenta
    # y seis» — dos montos donde hay uno. En una aplicacion de plata eso no es
    # un detalle de estilo. Un punto solo termina una oracion cuando NO tiene
    # digitos de los dos lados.
    crudas = re.findall(r'(?:[^.!?…]|(?<=\d)[.,](?=\d))+[.!?…]*', texto)
    piezas = []
    for o in crudas:
        o = o.strip()
        if o:
            piezas.append(o)

    # 2) las que siguen siendo largas se parten por dentro
    salida = []
    for pieza in piezas:
        if len(pieza) <= TOPE_TROZO:
            salida.append(pieza)
            continue
        resto = pieza
        while len(resto) > TOPE_TROZO:
            corte = _mejor_corte(resto, TOPE_TROZO)
            salida.append(resto[:corte].strip())
            resto = resto[corte:].strip()
        if resto:
            # un rabo diminuto se pega al anterior en vez de quedar solo
            if len(resto) < MIN_TROZO and salida:
                salida[-1] = salida[-1] + ' ' + resto
            else:
                salida.append(resto)

    # 3) fuera lo que no se puede pronunciar.
    #
    # Un trozo sin una sola letra —«**», «1.», «---»— no produce ningun
    # fonema, y el motor no devuelve audio vacio: se cae con «Expected
    # reduction dim 1 to have non-zero size» y se lleva puesta la nota
    # entera. Paso en produccion. Lo que no tiene letras se pega al trozo
    # anterior (por si eran signos de puntuacion sueltos) o se descarta.
    con_voz = []
    for t in salida:
        if LETRA.search(t):
            con_voz.append(t)
        elif con_voz:
            con_voz[-1] = (con_voz[-1] + ' ' + t).strip()
    salida = con_voz

    # 4) a cada trozo, su silencio y su marca de respiro
    final = []
    for i, t in enumerate(salida):
        ultimo = t[-1] if t else ''
        clase = _CIERRE.get(ultimo, 'ninguno')
        if i == len(salida) - 1:
            clase = 'aparte'          # el final de la nota descansa
        respiro = bool(CIFRA.match(t.lstrip('¿¡"\'( ')))
        final.append((t, SILENCIOS[clase], respiro))
    return final


def _mejor_corte(s, tope):
    """Donde partir `s` sin pasarse de `tope` y sin romper una cifra."""
    ventana = s[:tope]
    for patron in (r'[;:]', r',(?=\s)', r'\s(?=(?:y|pero|porque|entonces|aunque)\s)', r'\s'):
        pos = [m.end() for m in re.finditer(patron, ventana)]
        while pos:
            p = pos[-1]
            # si justo ahi queda una cifra partida («12,»), se prueba el anterior
            if not CIFRA_PARTIDA.search(ventana[:p].rstrip()):
                return p
            pos.pop()
    return tope


def humanizar(texto, mala_noticia=None):
    """Mete la duda de apertura, si corresponde. UNA sola, y solo al principio.

    Dos titubeos en una misma nota no suenan a persona pensando: suenan a
    modelo inseguro. Y ante una mala noticia, ninguno.
    """
    t = str(texto or '').strip()
    if not t:
        return t
    if mala_noticia is None:
        mala_noticia = bool(MALA_NOTICIA.search(t[:200]))
    if mala_noticia or SIN_ADORNO.search(t[:200]):
        return t
    if len(t) < 90:              # una respuesta corta no necesita preambulo
        return t
    # si ya empieza con algo conversacional, no se le encima otro
    if re.match(r'^\s*(a ver|mirá|mira|okey|bueno|dale|claro|sí|no)\b', t, re.I):
        return t
    # la eleccion depende del texto y no del azar: la misma respuesta suena
    # igual dos veces, que es lo que se espera de una voz con caracter
    return DUDAS[sum(map(ord, t[:32])) % len(DUDAS)] + t[0].lower() + t[1:]


# ── EL PEGADO DEL AUDIO ───────────────────────────────────────────────────

def _ruido_de_sala(pedazos, muestras):
    """El silencio entre frases NO puede ser silencio digital.

    Un tramo de ceros absolutos suena a corte de edicion — el oido lo detecta
    al instante y delata que el audio esta pegado de partes. Lo que va entre
    frase y frase es el ruido de fondo de la propia grabacion, bajito.

    Se saca del audio ya generado: se busca el tramo mas callado y se repite.
    Si no hay ninguno (audio muy corto), se cae a ceros — es peor, pero no
    romper es mas importante que sonar bien.
    """
    if not pedazos:
        return np.zeros(muestras, dtype=np.float32)
    largo = 2400                                    # 100 ms a 24 kHz
    mejor, energia_min = None, None
    for p in pedazos:
        if len(p) < largo * 2:
            continue
        for i in range(0, len(p) - largo, largo):
            e = float(np.mean(np.abs(p[i:i + largo])))
            if energia_min is None or e < energia_min:
                energia_min, mejor = e, p[i:i + largo]
    if mejor is None:
        return np.zeros(muestras, dtype=np.float32)
    veces = int(np.ceil(muestras / len(mejor)))
    fondo = np.tile(mejor, veces)[:muestras].astype(np.float32)
    # normalizado a -50 dBFS: presente para el oido, inaudible como contenido
    pico = float(np.max(np.abs(fondo))) or 1.0
    return fondo * (10 ** (-50 / 20) / pico)


def pegar(pedazos, silencios, muestreo=MUESTREO, fundido_ms=25):
    """Une los trozos con sus silencios y un fundido corto en cada juntura.

    El fundido de 25 ms existe por una razon concreta: dos trozos generados
    por separado empiezan y terminan en fases distintas de la onda, y pegarlos
    en seco produce un chasquido. 25 ms no se oyen como transicion pero
    borran el chasquido.
    """
    if not pedazos:
        return np.zeros(0, dtype=np.float32)
    fundido = int(muestreo * fundido_ms / 1000)
    salida = []
    for i, p in enumerate(pedazos):
        p = np.asarray(p, dtype=np.float32)
        if fundido and len(p) > fundido * 2:
            p = p.copy()
            p[:fundido] *= np.linspace(0, 1, fundido, dtype=np.float32)
            p[-fundido:] *= np.linspace(1, 0, fundido, dtype=np.float32)
        salida.append(p)
        ms = silencios[i] if i < len(silencios) else 0
        if ms > 0:
            salida.append(_ruido_de_sala(pedazos, int(muestreo * ms / 1000)))
    return np.concatenate(salida) if salida else np.zeros(0, dtype=np.float32)


def a_wav(audio, muestreo=MUESTREO):
    """float32 [-1,1] a WAV de 16 bits en memoria."""
    a = np.clip(np.asarray(audio, dtype=np.float32), -1.0, 1.0)
    # un pelin de margen para que el mp3 no recorte picos al codificar
    pico = float(np.max(np.abs(a))) if a.size else 0.0
    if pico > 0.94:
        a = a * (0.94 / pico)
    b = io.BytesIO()
    with wave.open(b, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(muestreo)
        w.writeframes((a * 32767).astype('<i2').tobytes())
    return b.getvalue()


# 64 kbps mono, que es lo que sale de `a_mp3`. Sirve para decirle al navegador
# cuanto dura un audio que vino de la memoria, sin volver a abrirlo: el error
# de un MP3 de tasa fija es de decimas, y la cabecera `X-Duracion` la usa la
# burbuja para dibujar la barra, no para nada exacto.
BYTES_POR_SEGUNDO = 64 * 1000 / 8


def _segundos_de(mp3):
    return len(mp3) / BYTES_POR_SEGUNDO if mp3 else 0.0


def a_mp3(wav_bytes, kbps=64):
    """WAV a MP3 mono.

    64 kbps mono a 24 kHz es de sobra para voz y deja una nota de un minuto
    en menos de 500 KB. Importa porque el adjunto del chat tiene tope de 8 MB
    y porque la mayoria de la gente lo va a oir con datos moviles, no wifi.
    """
    p = subprocess.run(
        ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
         '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k',
         '-ac', '1', '-f', 'mp3', 'pipe:1'],
        input=wav_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0 or not p.stdout:
        raise RuntimeError('ffmpeg: ' + p.stderr.decode()[:200])
    return p.stdout


# ── EL MOTOR ──────────────────────────────────────────────────────────────

# ── SOLO EL PRIMER TROZO VA CORTO ─────────────────────────────────────────
#
# El primero corto para que se oiga algo pronto; los demas, unidades de
# aliento enteras. Parece poca cosa y detras hay dos cosas medidas en esta
# maquina, las dos contraintuitivas.
#
# PRIMERA: el motor va MAS RAPIDO que el tiempo real, poco pero constante.
#
#      caracteres   genera   audio
#          19        2,6s     3,1s
#          34        3,5s     4,2s
#          58        4,5s     5,3s
#          74        5,2s     6,2s
#         155        7,5s     8,3s
#
# Cada trozo deja medio segundo de sobra, y ese margen se acumula. Por eso
# mientras suena un trozo se alcanza a fabricar el siguiente y la voz sigue
# sola: con estos trozos, los silencios medidos de punta a punta fueron de
# nueve decimas, que a oido es una pausa entre frases.
#
# SEGUNDA, y es la que impide trocear mas fino: EL MOTOR ES MUCHISIMO MENOS
# EFICIENTE EN TROZOS CORTOS. La misma frase, entera y partida:
#
#      88 caracteres de una vez  →  6,2s de audio   (0,070 s/caracter)
#      partida en 30 + 34 + 22   →  14,3s de audio  (0,137 a 0,245)
#
# Cada generacion arrastra un par de segundos de sobra pase lo que pase. Se
# probo repartir toda la respuesta en trozos cortos —queda mas fluida, los
# silencios bajan a una decima— y el precio fue que la misma respuesta pasaba
# de 13,4s a 20,6s de audio: la mitad de rapido, arrastrando las palabras.
# Una pausa de nueve decimas entre frases suena a persona; hablar a media
# velocidad suena a que algo va mal. Asi que se corta uno y no mas.
ARRANQUE = 24     # el primero corto a proposito: es el que decide la espera
MIN_CORTE = 12    # por debajo de esto el pedazo no llega ni a una palabra util


def _cortar_cerca(t, tope):
    """Donde partir `t` para que el pedazo no pase de `tope`, sin partir palabras.

    Se prefiere una coma —ahi la voz ya iba a pausar y el corte no se oye— y
    si no hay, el ultimo espacio que entre. Devuelve -1 si no hay ningun sitio
    decente: mas vale un trozo largo que una palabra partida al medio.
    """
    coma = t.rfind(', ', 0, tope + 1)
    if coma >= MIN_CORTE:
        return coma + 1
    hueco = t.rfind(' ', 0, tope + 1)
    return hueco if hueco >= MIN_CORTE else -1


def escalonar(partes):
    """Parte en dos la primera unidad de aliento, si es larga. Nada mas.

    El corte va a mitad de frase y no se oye: los trozos se pegan con fundido
    y ruido de sala, y el que escucha oye una sola voz seguida. Lo que si se
    oiria —y por eso solo el primero— es trocear toda la respuesta: ver arriba.
    """
    if not partes:
        return []
    cabeza, ms, respiro = partes[0]
    if len(cabeza) <= ARRANQUE * 2:
        return list(partes)
    corte = _cortar_cerca(cabeza, ARRANQUE)
    if corte <= 0 or len(cabeza) - corte < MIN_CORTE:
        return list(partes)
    return ([(cabeza[:corte].strip(), SILENCIOS['ninguno'], respiro),
             (cabeza[corte:].strip(), ms, False)] + list(partes[1:]))


# ── EL OÍDO ───────────────────────────────────────────────────────────────
#
# Whisper (faster-whisper, `small` en la GPU). Existe para que el ESCUCHAR
# también sea de la casa: el reconocedor del navegador manda el audio a los
# servidores del navegador, y en los navegadores que no traen ninguno
# (Firefox, iOS viejo) el modo voz directamente no existía.
#
# La eleccion del tamaño esta MEDIDA en esta maquina, en circulo cerrado
# —nuestra voz dice una frase, el oido la escucha—:
#
#     tiny  CPU: 0,5s  → «Quiero un biarque insorigana Maria»   (basura)
#     base  CPU: 7,0s  → «Kirun B. Arquins, Origena, Maria»     (basura lenta)
#     small GPU: <0,1s → «Quiero enviar quince origen a Maria
#                          y después ver mi actividad.»          (perfecta)
#
# O sea: en CPU no hay producto — ni rapido ni fiel. En GPU es las dos cosas.
# Por eso, si la GPU no esta, el oido NO se ofrece (503): oir mal los montos
# en una billetera es peor que no oir.
#
# La PISTA le da el vocabulario de la casa: sin ella, «ORIGEN» y «AUKA» se
# transcriben como les suene. Es el mismo truco que un humano nuevo en la
# empresa: primero le decis los nombres propios.
PISTA_OIDO = {
    'es': 'Veta Wallet, Orden Global: enviar, cobrar, actividad, saldo, '
          'ORIGEN, AUKA, AGKA, ONDK, Genesis ID, MyTokenPay, Ordenex, tarjeta',
    'en': 'Veta Wallet, Orden Global: send, charge, activity, balance, '
          'ORIGEN, AUKA, AGKA, ONDK, Genesis ID, MyTokenPay, Ordenex, card',
}
TOPE_AUDIO = 2 * 1024 * 1024      # ~40s de opus; nadie dicta mas de un tiron


class Oido:
    def __init__(self):
        self.modelo = None
        self.turno = threading.Lock()   # de a uno: es rapidisimo, no hace cola

    def cargar(self):
        """En la GPU o nada — ver la tabla de arriba. Y las librerias CUDA de
        ctranslate2 se buscan en las que ya trae torch, ANTES del import:
        dlopen lee el entorno del momento."""
        try:
            import glob as _glob
            rutas = _glob.glob(os.path.join(os.path.dirname(os.__file__), '..',
                                            'site-packages', 'nvidia', '*', 'lib'))
            if rutas:
                os.environ['LD_LIBRARY_PATH'] = (':'.join(rutas) + ':'
                    + os.environ.get('LD_LIBRARY_PATH', ''))
            from faster_whisper import WhisperModel
            t0 = time.time()
            self.modelo = WhisperModel('small', device='cuda', compute_type='float16')
            # se templa con un segundo de silencio: la primera transcripcion
            # real no paga la inicializacion de CUDA
            import numpy as _np
            list(self.modelo.transcribe(_np.zeros(16000, dtype=_np.float32),
                                        language='es', beam_size=1)[0])
            print(f'oido listo en {time.time() - t0:.0f}s (small, GPU)', flush=True)
        except Exception as e:
            self.modelo = None
            print(f'sin oido ({type(e).__name__}: {str(e)[:120]}) — '
                  f'el navegador seguira escuchando con el suyo', flush=True)

    def oir(self, crudo, idioma='es'):
        """Bytes de audio (lo que grabe el navegador: webm/opus, lo que sea
        que ffmpeg entienda) → texto. Lanza si no hay oido."""
        if self.modelo is None:
            raise RuntimeError('sin oido')
        wav = subprocess.run(
            ['ffmpeg', '-loglevel', 'error', '-i', 'pipe:0',
             '-ar', '16000', '-ac', '1', '-f', 'f32le', 'pipe:1'],
            input=crudo, capture_output=True, timeout=30).stdout
        audio = np.frombuffer(wav, dtype=np.float32)
        if len(audio) < 1600:      # menos de una decima: no hay nada que oir
            return ''
        with self.turno:
            segs, _ = self.modelo.transcribe(
                audio, language=idioma, beam_size=2,
                initial_prompt=PISTA_OIDO.get(idioma, PISTA_OIDO['es']))
            return ' '.join(s.text.strip() for s in segs).strip()


class Motor:
    """El modelo cargado, con UN solo turno a la vez.

    El candado no es prolijidad: dos generaciones simultaneas en una T4 que
    ademas comparte con el modelo que piensa es el camino directo a quedarse
    sin memoria de video, y quedarse sin memoria de video no degrada — mata
    el proceso. Con la fila de a uno, dos personas pidiendo voz al mismo
    tiempo esperan; sin ella, las dos se quedan sin nada.
    """

    def __init__(self):
        self.modelo = None
        self.turno = threading.Lock()
        self.listo = threading.Event()

    def cargar(self):
        import torch
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        t0 = time.time()
        self.modelo = ChatterboxMultilingualTTS.from_pretrained(device='cuda')
        self.torch = torch
        # ── SE TEMPLA ANTES DE DECIR QUE ESTA LISTA ─────────────────────────
        #
        # Medido: la PRIMERA frase despues de arrancar tardaba 23,8 segundos, y
        # la misma frase un minuto despues, 1,6. Veintidos segundos de peaje
        # que pagaba siempre una persona de verdad — y como el servicio se
        # reinicia con cada despliegue, la pagaba seguido.
        #
        # Una frase de mentira ANTES de `listo.set()` lo traslada al arranque,
        # que es cuando no hay nadie esperando. Es la misma idea que «el
        # arranque templa el motor» del asistente.
        #
        # Y va en su propio `try`: que el templado falle no puede dejar la voz
        # apagada. Peor lenta que muda.
        # Se templan LOS DOS idiomas. El motor es multilingue y comparte casi
        # todo, pero «casi» no es «todo»: quien escriba en ingles seria el
        # primero de su idioma y pagaria su propio peaje. Son siete segundos
        # mas en el arranque, que es cuando no hay nadie esperando.
        try:
            t1 = time.time()
            self.turno.acquire()
            try:
                # La variable se llama `lengua` y no como la de las rutas de
                # verdad, A PROPOSITO: `probar-voz.py` cuenta apariciones en el
                # fuente para exigir que las DOS rutas que contestan pasen el
                # idioma que llega. Este templado no es una ruta y no debe
                # entrar en esa cuenta — si entrara, la guarda dejaria de
                # cuadrar y el dia que alguien fije de verdad el idioma en una
                # ruta, nadie se enteraria.
                for lengua, hola in TEMPLADO:
                    torch.manual_seed(VOCES[VOZ_POR_DEFECTO]['semilla'])
                    self.modelo.generate(
                        hola, language_id=lengua,
                        exaggeration=VOCES[VOZ_POR_DEFECTO]['exageracion'],
                        cfg_weight=VOCES[VOZ_POR_DEFECTO]['apego'],
                        temperature=VOCES[VOZ_POR_DEFECTO]['temperatura'])
            finally:
                self.turno.release()
            print(f'voz templada en {time.time() - t1:.0f}s', flush=True)
        except Exception as e:
            print(f'no se pudo templar la voz ({type(e).__name__}): '
                  'la primera va a tardar', flush=True)
        self.listo.set()
        print(f'voz lista en {time.time() - t0:.0f}s · '
              f'{torch.cuda.memory_allocated() / 1e9:.1f} GB de VRAM', flush=True)

    def decir(self, texto, voz=VOZ_POR_DEFECTO, idioma='es'):
        """Texto a audio, ya humanizado y pegado. Devuelve (mp3, segundos).

        ── LO QUE YA SE DIJO NO SE VUELVE A FABRICAR ────────────────────────

        La mayor parte de lo que AU-RA dice es SIEMPRE LO MISMO: el guion tiene
        treinta nodos de texto fijo, y cada persona que escribe «hola» recibe
        exactamente las mismas palabras que la anterior. Fabricarlas de nuevo
        para cada una es pagar mil veces por un trabajo hecho.

        Medido antes de esto: la misma frase dos veces seguidas costaba 1,63 s
        y 1,58 s. No habia memoria de ninguna clase.

        Y no es solo lentitud. Es lo que MATO las notas de voz: estan retiradas
        —lo dice la cabecera de este archivo— porque costaban 657 segundos de
        GPU al dia y causaban esperas de 21 a 59 segundos. Las dos cosas salen
        de lo mismo: se pagaba entera cada vez.
        """
        guardado = vozmemoria.buscar(MEMORIA_DIR, texto, voz, idioma)
        if guardado:
            return guardado, _segundos_de(guardado)
        v = VOCES.get(voz) or VOCES[VOZ_POR_DEFECTO]
        # Antes que nada, TRADUCIR DE ESCRITO A HABLADO. «0,001» y
        # «MyTokenPay» estan perfectos en la pantalla y son ilegibles en voz
        # alta: el motor atropella los digitos y lee el ingles en español.
        # Ver decir.py — nace de dos quejas reales de produccion.
        #
        # SOLO EN ESPAÑOL. El humanizado es castellano de punta a punta —el
        # voseo, los numeros en letras, el «Mirá,» de apertura— y pasarselo a
        # un texto ingles lo dejaria diciendo «veintiun mil» en medio de una
        # frase en ingles. Para ingles, el texto va como esta: el troceado por
        # signos y los silencios funcionan igual en los dos idiomas.
        partes = trozos(humanizar(para_la_voz(texto)) if idioma == 'es' else texto)
        if not partes:
            return b'', 0.0
        pedazos, silencios = [], []
        with self.turno:
            for t, ms, respiro in partes:
                # la semilla fija por voz: sin esto el timbre deriva de un
                # trozo al siguiente y la misma nota suena a dos personas
                self.torch.manual_seed(v['semilla'])
                try:
                    w = self.modelo.generate(
                        t, language_id=idioma,
                        exaggeration=v['exageracion'],
                        cfg_weight=v['apego'],
                        temperature=v['temperatura'])
                except Exception as e:
                    # UN trozo que se cae no puede llevarse la nota entera.
                    # Se salta y se sigue: una nota a la que le falta una
                    # frase todavia sirve; una nota que no existe, no. Queda
                    # en el registro para poder mirarlo despues.
                    print(f'trozo saltado ({type(e).__name__}): {t[:60]!r}',
                          flush=True)
                    continue
                a = w.squeeze(0).cpu().numpy().astype(np.float32)
                if respiro and pedazos:
                    # el respiro corto ANTES de la cifra: se le suma al
                    # silencio del trozo anterior, que es donde cae
                    silencios[-1] = silencios[-1] + ANTES_DE_CIFRA
                pedazos.append(a)
                silencios.append(int(ms * v['aire']))
        audio = pegar(pedazos, silencios)
        mp3, segundos = a_mp3(a_wav(audio)), len(audio) / MUESTREO
        vozmemoria.guardar(MEMORIA_DIR, texto, voz, idioma, mp3, segundos)
        return mp3, segundos

    def decir_al_vuelo(self, texto, voz=VOZ_POR_DEFECTO, idioma='es'):
        """Lo mismo, pero SOLTANDO cada trozo apenas esta.

        ── POR QUE EXISTE ──────────────────────────────────────────────────

        `decir()` devuelve la nota entera, y eso obliga a esperar a que
        termine de grabarse TODA la respuesta antes de oir la primera
        palabra. Con audio que se genera a una vez tiempo real, una
        respuesta de quince segundos son quince segundos de silencio.

        Generar el trozo tres no ayuda a nadie mientras el uno ya esta
        hecho y nadie lo escucha. Asi que se entrega por trozos, y el
        navegador —que sabe reproducir un MP3 que llega de a poco— empieza
        a sonar con el primero. El tiempo total es el mismo; el tiempo
        hasta que se oye algo pasa de quince segundos a dos.

        El silencio entre trozos viaja PEGADO al trozo anterior, no aparte:
        un hueco mandado como su propio bloque llega tarde y se oye como un
        corte. Y el ruido de sala se saca del primer trozo, que es lo unico
        que hay a mano cuando todavia no se genero el resto — con la nota
        entera se podia elegir el tramo mas callado de todos.
        """
        v = VOCES.get(voz) or VOCES[VOZ_POR_DEFECTO]
        # el humanizado solo en español; ver decir() para el porqué
        partes = escalonar(trozos(
            humanizar(para_la_voz(texto)) if idioma == 'es' else texto))
        if not partes:
            return
        fondo = None
        for i, (t, ms, respiro) in enumerate(partes):
            # ── EL CANDADO SE TOMA POR TROZO, NO POR RESPUESTA ─────────────
            #
            # Tenerlo abrazando el bucle entero parece mas prolijo y es un
            # error grave: esto es un GENERADOR, y un generador que se
            # abandona a mitad —porque quien escuchaba cerro la app, o se le
            # fue la señal— nunca sale de su `with`. El candado queda tomado
            # para siempre y NADIE mas puede volver a hablar hasta reiniciar
            # el servicio.
            #
            # Lo encontre probando: mate un curl a mitad de una respuesta y
            # el servicio quedo mudo. En produccion pasa el primer dia, con
            # la primera persona que se sale del chat mientras AU-RA habla.
            #
            # Tomandolo por trozo se sigue cumpliendo lo unico que el
            # candado tiene que garantizar —que no haya dos generaciones a
            # la vez en la GPU, que es lo que la deja sin memoria— y entre
            # trozo y trozo queda libre.
            with self.turno:
                self.torch.manual_seed(v['semilla'])
                try:
                    w = self.modelo.generate(
                        t, language_id=idioma,
                        exaggeration=v['exageracion'],
                        cfg_weight=v['apego'],
                        temperature=v['temperatura'])
                except Exception as e:
                    print(f'trozo saltado ({type(e).__name__}): {t[:60]!r}',
                          flush=True)
                    w = None
            # DESDE AQUI, FUERA DEL CANDADO. Lo unico que tiene que estar
            # protegido es la generacion en la GPU; pegar audio y codificar
            # MP3 es trabajo de CPU, y el `yield` sobre todo: entregar el
            # trozo puede tardar lo que la persona tarde en escucharlo.
            if w is None:
                continue
            a = w.squeeze(0).cpu().numpy().astype(np.float32)
            if fondo is None:
                fondo = [a]
            # el respiro antes de una cifra va DELANTE de este trozo, porque
            # el anterior ya se mando y no se puede tocar
            antes = ANTES_DE_CIFRA if (respiro and i) else 0
            hueco = int(ms * v['aire'])
            trozo = pegar([a], [hueco], fundido_ms=25)
            if antes:
                trozo = np.concatenate(
                    [_ruido_de_sala(fondo, int(MUESTREO * antes / 1000)), trozo])
            yield a_mp3(a_wav(trozo)), len(trozo) / MUESTREO


MOTOR = Motor()
OIDO = Oido()

# ── LA PUERTA: QUIEN PUEDE PEDIR VOZ ──────────────────────────────────────
#
# No se inventa un sistema de cuentas nuevo. El relevo ya sabe quien es
# quien, y una segunda lista de contraseñas es una segunda lista que se
# desincroniza. Se le presenta el correo y la llave, y el relevo contesta.
#
# Con memoria de diez minutos: preguntarle al relevo por cada trozo de audio
# le agregaria un viaje de red a cada frase, y la llave de alguien no cambia
# entre una frase y la siguiente.
RELEVO = os.environ.get('AURA_RELEVO', 'https://cerebro.ordenscan.com/mensajes').rstrip('/')
_CONOCIDOS = {}
_CANDADO_PUERTA = threading.Lock()


def _puede(correo, llave):
    if not correo or not llave:
        return False
    ahora = time.time()
    with _CANDADO_PUERTA:
        visto = _CONOCIDOS.get((correo, llave))
        if visto and ahora - visto[0] < 600:
            return visto[1]
    ok = False
    try:
        import urllib.request
        req = urllib.request.Request(
            RELEVO + '/ficha', method='POST',
            data=json.dumps({'correo': correo, 'llave': llave,
                             'de': correo}).encode(),
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=8) as r:
            ok = r.status == 200
    except Exception:
        ok = False        # ante la duda, no
    with _CANDADO_PUERTA:
        _CONOCIDOS[(correo, llave)] = (ahora, ok)
        if len(_CONOCIDOS) > 500:
            _CONOCIDOS.clear()      # no es una cache: es un recuerdo corto
    return ok


# ── EL CUPO ───────────────────────────────────────────────────────────────
#
# La GPU atiende de a una voz por vez. Sin techo, una sola persona con un
# bucle deja a los otros catorce esperando detras — y no hace falta mala
# intencion: basta un boton que se toca dos veces.
_PEDIDOS = {}
_CANDADO_CUPO = threading.Lock()
POR_MINUTO = int(os.environ.get('AURA_VOZ_POR_MINUTO', '12'))


def _hay_cupo(correo):
    ahora = time.time()
    with _CANDADO_CUPO:
        vivos = [t for t in _PEDIDOS.get(correo, []) if ahora - t < 60]
        if len(vivos) >= POR_MINUTO:
            _PEDIDOS[correo] = vivos
            return False
        vivos.append(ahora)
        _PEDIDOS[correo] = vivos
    return True


# ── LA PUERTA ─────────────────────────────────────────────────────────────
#
# Escucha SOLO en 127.0.0.1. Un modelo de voz abierto a internet es una
# fabrica de audio gratis para el primero que la encuentre, y ademas una
# forma comoda de dejar la GPU ocupada para siempre. Quien habla con esto es
# el asistente, que vive en la misma maquina.

def servir():
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class Puerta(BaseHTTPRequestHandler):
        # HTTP/1.1 y no 1.0: sin esto no hay `Transfer-Encoding: chunked`, y
        # sin chunked el que escucha no sabe cuando termino — se queda
        # esperando el cierre de la conexion. Medido: curl colgado 200
        # segundos DESPUES de haber recibido el audio entero.
        protocol_version = 'HTTP/1.1'

        def log_message(self, *a):
            pass

        def _permiso(self):
            """Autoriza al navegador, si quien pregunta es una de nuestras webs.

            La misma lista que el relevo y por el mismo motivo: /decir lo llama
            el cerebro desde dentro, pero /hablar lo llama el NAVEGADOR de la
            persona, y para un navegador esto es otro dominio.

            Y una cabecera que no está en la lista de expuestas NO EXISTE del
            otro lado — el navegador la borra sin decir nada. Por eso va
            `X-Formato`: sin exponerla, la app leía vacío, creía que el nodo
            hablaba otro idioma y se caía a la nota de voz. Con curl no se ve
            (curl no hace CORS); con un navegador, cada vez.
            """
            o = self.headers.get('Origin')
            if o in ORIGENES:
                self.send_header('Access-Control-Allow-Origin', o)
                self.send_header('Access-Control-Expose-Headers', 'X-Formato, X-Duracion')
                # el origen decide la respuesta: cada cache guarda su copia
                self.send_header('Vary', 'Origin')

        def do_OPTIONS(self):
            # El vuelo previo. El POST lleva Content-Type: application/json, y
            # eso obliga al navegador a preguntar antes. Sin esto, el POST de
            # la voz ni sale de la máquina.
            self.send_response(204)
            self._permiso()
            self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers',
                             'Content-Type, X-Correo, X-Llave, X-Idioma')
            self.send_header('Access-Control-Max-Age', '86400')
            self.send_header('Content-Length', '0')
            self.end_headers()

        def _json(self, codigo, cuerpo):
            b = json.dumps(cuerpo).encode()
            self.send_response(codigo)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(b)))
            self._permiso()
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            if self.path == '/salud':
                return self._json(200, {'listo': MOTOR.listo.is_set(),
                                        'voces': {k: {'nombre': v['nombre'],
                                                      'que_es': v['que_es']}
                                                  for k, v in VOCES.items()}})
            self._json(404, {'error': 'no'})

        def do_POST(self):
            if self.path == '/hablar':
                return self._hablar()
            if self.path == '/oir':
                return self._oir()
            if self.path != '/decir':
                return self._json(404, {'error': 'no'})
            if not MOTOR.listo.is_set():
                return self._json(503, {'error': 'todavía cargando'})
            try:
                n = int(self.headers.get('Content-Length', 0))
                b = json.loads(self.rfile.read(n) or b'{}')
            except Exception:
                return self._json(400, {'error': 'json inválido'})
            texto = str(b.get('texto', ''))[:1200]
            voz = str(b.get('voz', VOZ_POR_DEFECTO))
            # «es» salvo que pidan «en»: cualquier otra cosa cae a español,
            # que un idioma inventado no puede tumbar la voz
            idioma = 'en' if b.get('idioma') == 'en' else 'es'
            if not texto.strip():
                return self._json(400, {'error': 'sin texto'})
            t0 = time.time()
            try:
                mp3, segundos = MOTOR.decir(texto, voz, idioma)
            except Exception as e:
                print('voz falló:', type(e).__name__, str(e)[:200], flush=True)
                return self._json(500, {'error': 'no salió'})
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(mp3)))
            # la duracion viaja en la cabecera: la burbuja del chat la muestra
            # sin tener que descargar el audio entero para medirlo
            self.send_header('X-Duracion', f'{segundos:.1f}')
            self.end_headers()
            self.wfile.write(mp3)
            print(f'dicho: {segundos:.1f}s de audio en {time.time() - t0:.1f}s '
                  f'· voz={voz} · {len(mp3) // 1024} KB', flush=True)


        def _oir(self):
            """El oido de la casa: audio del navegador → texto.

            Misma puerta que /hablar —el relevo dice si conoce a quien pide—
            y mismo cupo. La credencial viaja en CABECERAS y no en el cuerpo,
            porque el cuerpo es el audio crudo: meter un JSON alrededor de
            dos megas de opus seria pagar un tercio mas de subida en base64.
            """
            if OIDO.modelo is None:
                # sin GPU no se ofrece: oir mal los montos en una billetera
                # es peor que no oir (los numeros, arriba, en la clase)
                return self._json(503, {'error': 'sin oído'})
            quien = str(self.headers.get('X-Correo', ''))[:120].lower()
            llave = str(self.headers.get('X-Llave', ''))[:200]
            if not _puede(quien, llave):
                return self._json(403, {'error': 'no te conozco'})
            if not _hay_cupo(quien):
                return self._json(429, {'error': 'muchas seguidas'})
            idioma = 'en' if self.headers.get('X-Idioma') == 'en' else 'es'
            try:
                n = int(self.headers.get('Content-Length', 0))
            except Exception:
                n = 0
            if not (0 < n <= TOPE_AUDIO):
                return self._json(413, {'error': 'audio muy grande o vacío'})
            crudo = self.rfile.read(n)
            t0 = time.time()
            try:
                texto = OIDO.oir(crudo, idioma)
            except Exception as e:
                print('oír falló:', type(e).__name__, str(e)[:150], flush=True)
                return self._json(500, {'error': 'no se pudo oír'})
            print(f'oído a {quien}: {len(crudo) // 1024} KB → '
                  f'{len(texto)} car en {time.time() - t0:.1f}s', flush=True)
            return self._json(200, {'texto': texto})

        def _hablar(self):
            """La voz EN VIVO, para el navegador.

            Se entrega en trozos con `Transfer-Encoding: chunked`, que es lo
            que permite empezar a sonar con el primero en vez de esperar el
            archivo entero.

            ── POR QUE CADA TROZO LLEVA SU TAMAÑO DELANTE ───────────────────

            Cada trozo es un MP3 COMPLETO, y el navegador los toca uno tras
            otro. Para eso tiene que saber donde termina uno y empieza el
            siguiente — y esa marca hay que ponerla aca, porque del otro lado
            NO SE VE: `fetch` entrega los bytes como se le da la gana (a
            veces medio trozo, a veces dos juntos) y los limites del
            `chunked` los consume el navegador sin enseñarselos a nadie.

            Asi que antes de cada MP3 van ocho digitos hexadecimales con su
            largo. Ocho bytes por trozo, y del otro lado el corte es exacto
            en vez de adivinado.

            Se penso en no marcarlos: varios MP3 pegados uno detras de otro
            forman un MP3 valido —asi funciona la radio por internet— y el
            navegador lo tocaria de corrido sin ayuda. Pero eso necesita
            MediaSource, que en el Safari de iPhone no existio hasta hace
            poco, y este audio tiene que sonar en el telefono de quien lo
            pidio. Partido en trozos suena con Web Audio, que anda en todos.

            ── QUIEN PUEDE PEDIR VOZ ────────────────────────────────────────

            Esta ruta sale a internet (por el Caddy del cerebro), asi que
            NO puede ser abierta: un motor de voz sin puerta es una fabrica
            de audio gratis para el primero que la encuentre, y una forma
            comoda de dejar la GPU ocupada para siempre.

            La puerta es el propio relevo: se le presenta el correo y la
            llave de la persona, y si el relevo los reconoce, adelante. No
            se inventa un sistema de cuentas nuevo — el que hay ya sabe
            quien es quien, y una segunda lista de contraseñas es una
            segunda lista que se desincroniza.
            """
            if not MOTOR.listo.is_set():
                return self._json(503, {'error': 'todavía cargando'})
            try:
                n = int(self.headers.get('Content-Length', 0))
                b = json.loads(self.rfile.read(n) or b'{}')
            except Exception:
                return self._json(400, {'error': 'json inválido'})
            quien = str(b.get('correo', ''))[:120].lower()
            llave = str(b.get('llave', ''))[:200]
            if not _puede(quien, llave):
                return self._json(403, {'error': 'no te conozco'})
            if not _hay_cupo(quien):
                return self._json(429, {'error': 'muchas seguidas'})
            texto = str(b.get('texto', ''))[:1200]
            voz = str(b.get('voz', VOZ_POR_DEFECTO))
            # «es» salvo que pidan «en»: cualquier otra cosa cae a español,
            # que un idioma inventado no puede tumbar la voz
            idioma = 'en' if b.get('idioma') == 'en' else 'es'
            if not texto.strip():
                return self._json(400, {'error': 'sin texto'})

            t0 = time.time()
            primera = None
            pasos = []
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('X-Formato', FORMATO)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Transfer-Encoding', 'chunked')
            self.send_header('X-Accel-Buffering', 'no')   # que nadie lo junte
            self._permiso()
            self.end_headers()
            total = 0.0
            try:
                for mp3, segundos in MOTOR.decir_al_vuelo(texto, voz, idioma):
                    if primera is None:
                        primera = time.time() - t0
                    # Cada trozo con su cuenta, y no es ruido de registro: es
                    # el unico sitio donde se ve si la voz se va a cortar. El
                    # que escucha se queda sin audio cuando un trozo tarda en
                    # llegar MAS de lo que dura el anterior, y eso solo se ve
                    # comparando estas dos columnas.
                    print(f'  trozo {len(pasos) + 1}: {segundos:.1f}s de audio, '
                          f'listo a los {time.time() - t0:.1f}s', flush=True)
                    pasos.append((round(time.time() - t0, 1), round(segundos, 1)))
                    total += segundos
                    # El cuerpo del trozo son ocho digitos con el largo del
                    # mp3 y despues el mp3. Lo de afuera —el tamaño en hexa
                    # con sus \r\n— es el sobre del `chunked`, que es otra
                    # cosa y no llega al navegador.
                    cuerpo = f'{len(mp3):08X}'.encode() + mp3
                    self.wfile.write(f'{len(cuerpo):X}\r\n'.encode())
                    self.wfile.write(cuerpo)
                    self.wfile.write(b'\r\n')
                    self.wfile.flush()
                self.wfile.write(b'0\r\n\r\n')   # y el cierre, que faltaba
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                # se fue antes de que terminara: es normal, no es un fallo
                print(f'se corto la escucha de {quien}', flush=True)
                return
            except Exception as e:
                print('hablar falló:', type(e).__name__, str(e)[:200], flush=True)
                return
            print(f'hablado a {quien}: {total:.1f}s de audio · primera voz a los '
                  f'{(primera or 0):.1f}s · voz={voz}', flush=True)
    ThreadingHTTPServer((ESCUCHA, PUERTO), Puerta).serve_forever()


if __name__ == '__main__':
    threading.Thread(target=MOTOR.cargar, daemon=True).start()
    # el oido carga DESPUES de la voz y en su propio hilo: la voz es lo que
    # no puede esperar, y el oido son tres segundos que a nadie apuran
    threading.Thread(
        target=lambda: (MOTOR.listo.wait(600), OIDO.cargar()),
        daemon=True).start()
    print(f'voz de AU-RA escuchando en {ESCUCHA}:{PUERTO} (cargando modelo…)',
          flush=True)
    servir()
