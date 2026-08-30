# Los caminos guiados de AU-RA.
#
# ── DE DONDE SALE ESTA IDEA, Y POR QUE ES BUENA ─────────────────────────────
#
# La pidio Jose asi: «podriamos crear mensajes programados y guiar a la persona
# en vez de dejarle libre, aunque igual pueda preguntar; eso consumiria menos y
# podriamos guiar a usuarios e inversionistas. Algo cool, no lo normal que se
# siente robot».
#
# Tiene tres ventajas y la tercera es la que de verdad importa:
#
#   1. NO CUESTA. Un camino guiado no llama al motor: sale al instante y no
#      ocupa la GPU, que queda libre para las preguntas de verdad.
#   2. GUIA. Quien llega a un numero de WhatsApp sin saber que preguntar se va.
#      Tres puertas escritas dan mas que un «¿en que te ayudo?».
#   3. NO PUEDE ALUCINAR. Esto es lo importante. Un texto escrito por nosotros
#      dice lo que dice y nada mas. La mentira de la Regulacion A de la SEC no
#      habria podido salir nunca por aqui.
#
# ── COMO SE EVITA QUE SE SIENTA ROBOT ───────────────────────────────────────
#
# Un menu de central telefonica —«marque 1 para productos»— es exactamente lo
# que no se quiere. Las reglas que lo evitan:
#
#   · LOS BOTONES SE ESCRIBEN COMO HABLA LA PERSONA, no como piensa la empresa.
#     «¿Y esto para que me sirve?», no «Productos». «¿Es seguro?», no «FAQ».
#   · TRES PUERTAS, NO OCHO. WhatsApp deja tres botones y esta bien asi: una
#     lista larga es un formulario, y un formulario se abandona.
#   · EL TEXTO ES DE AU-RA. Va en su voz —voseo, corto, calido— y no en la voz
#     de un aviso legal. Los botones son ELLA ofreciendo, no una maquina
#     listando.
#   · NUNCA SE ENCIERRA A NADIE. Escribir a mano siempre funciona y siempre
#     llega al motor. Los botones son atajos, no paredes. Es la diferencia
#     entre guiar y atrapar.
#
# ── EL INVERSIONISTA NO SE ATIENDE SOLO, Y ES A PROPOSITO ───────────────────
#
# Jose menciono guiar a posibles inversionistas. El camino que ofrece este
# guion NO les cuenta la oportunidad: los pasa a una persona.
#
# No es timidez. Orden Global Corp no tiene ninguna licencia emitida y el
# expediente legal ya marca que lo publicado la contradice. Un camino
# automatico que le hable de invertir a alguien es exactamente donde ocurre una
# tergiversacion de valores — y el 30-ago ya tuvimos una version de eso. Ademas
# quien viene a invertir quiere hablar con una persona: mandarselo a una es
# mejor producto Y mas seguro. Las dos cosas a la vez, que no pasa siempre.

import re
import unicodedata

# WhatsApp corta el titulo de un boton en 20 caracteres. Uno mas largo no se
# recorta: Meta rechaza el mensaje entero, asi que la conversacion se queda
# muda. Hay una prueba que lo vigila.
TOPE_BOTON = 20


def _llano(t):
    """Sin tildes y en minusculas, para comparar lo que escribe la gente."""
    n = unicodedata.normalize('NFD', (t or '').lower().strip())
    return ''.join(c for c in n if unicodedata.category(c) != 'Mn')


# ── El guion ────────────────────────────────────────────────────────────────
#
# Cada nodo: el texto que dice AU-RA y hasta tres puertas. `None` en las
# puertas de un nodo significa que ahi termina el camino guiado y lo que siga
# lo contesta ella.
#
# Los textos son cortos a proposito: esto se lee en un telefono, de pie, con
# una mano. Lo que no entra en cuatro lineas no se lee.
NODOS = {
    'inicio': {
        'texto': (
            'Soy AU-RA, la asistente de Orden Global.\n\n'
            'Te puedo contar de qué va esto, ayudarte con tu cuenta, o pasarte '
            'con una persona. También podés escribirme lo que quieras y te '
            'contesto.'),
        'botones': [
            ('¿Qué es esto?', 'que-es'),
            ('Quiero mi cuenta', 'cuenta'),
            ('Hablar con alguien', 'persona'),
        ],
    },

    'que-es': {
        'texto': (
            'Orden Global es un ecosistema para mover, guardar y cobrar dinero '
            'en Latinoamérica, sobre una cadena de bloques propia.\n\n'
            'En la práctica son tres cosas: una billetera (Veta Wallet), una '
            'identidad que sirve en todas las apps (Genesis ID), y un chat '
            'cifrado (PULSE2CHAT).'),
        'botones': [
            ('La billetera', 'billetera'),
            ('Mi identidad', 'genesis'),
            ('¿Y las monedas?', 'monedas'),
        ],
    },

    'billetera': {
        'texto': (
            'Veta Wallet guarda tu dinero y lo mueve. Podés recibir, enviar, '
            'cambiar entre monedas y cobrarle a un cliente con un QR.\n\n'
            'Tus llaves son tuyas: yo no las tengo ni las necesito. Vos firmás '
            'con tu contraseña, yo solo preparo.'),
        'botones': [
            ('¿Cómo empiezo?', 'cuenta'),
            ('¿Es seguro?', 'seguro'),
            ('Volver', 'que-es'),
        ],
    },

    'genesis': {
        'texto': (
            'Genesis ID es tu identidad verificada. La hacés una vez —tu '
            'documento y una foto— y te sirve en todas las apps de Orden '
            'Global sin volver a mandar papeles.\n\n'
            'La revisa una persona, no una máquina. Suele tardar menos de un '
            'día, y te avisamos cuando esté.'),
        'botones': [
            ('Quiero hacerla', 'cuenta'),
            ('¿Qué piden?', 'genesis-que'),
            ('Volver', 'que-es'),
        ],
    },

    'genesis-que': {
        'texto': (
            'Tu documento de identidad —el de tu país— y una foto tuya del '
            'momento, para comprobar que sos vos y no una foto de una foto.\n\n'
            'Las fotos del documento se guardan cifradas y se borran a los '
            'cinco años. La única imagen que queda es el retrato de tu '
            'credencial, porque es tu credencial.'),
        'botones': [('Empezar', 'cuenta'), ('Volver', 'genesis')],
    },

    'monedas': {
        'texto': (
            'Hay varias, y cada una hace algo distinto. ORIGEN y AUKA siguen el '
            'precio del oro; AGKA el de la plata; ONDK es la de la casa.\n\n'
            'Te cuento de la que quieras, o escribime el nombre de una.'),
        'botones': [
            ('ORIGEN', 'origen'),
            ('¿Cómo se compran?', 'cuenta'),
            ('Volver', 'que-es'),
        ],
    },

    'origen': {
        'texto': (
            'ORIGEN sigue el precio del oro: cada uno equivale a un gramo de oro '
            'dividido entre cincuenta y cinco, al precio del día.\n\n'
            'Si querés saber si te conviene para lo tuyo, eso lo habla mejor una '
            'persona que yo.'),
        'botones': [('Hablar con alguien', 'persona'), ('Volver', 'monedas')],
    },

    'seguro': {
        'texto': (
            'Tu frase de respaldo es tuya y solo tuya: no se la digas a nadie, '
            'ni a mí. Yo nunca te la voy a pedir.\n\n'
            'Guardala escrita en un sitio seguro. Es lo único que abre tu dinero '
            'si perdés el teléfono.'),
        'botones': [('Volver', 'billetera')],
    },

    'cuenta': {
        'texto': (
            'Se abre desde la app de Veta Wallet: la bajás, ponés tu correo y '
            'listo. La verificación de identidad la hacés ahí mismo cuando '
            'quieras.\n\n'
            'Si algo se te traba, contame qué pasó y lo vemos.'),
        'botones': [('Hablar con alguien', 'persona'), ('Volver', 'inicio')],
    },

    # ── El camino que NO contesta solo ──────────────────────────────────────
    'persona': {
        'texto': (
            'Dale. Escribile a info@ordenglobal.org contando qué necesitás y te '
            'responde alguien del equipo.\n\n'
            'Si es algo de tu cuenta que puedo resolver yo, contámelo por acá y '
            'lo intento primero.'),
        'botones': None,
    },

    # Para quien pregunta por invertir. NO se le cuenta la oportunidad: se le
    # pasa a una persona. Ver la cabecera — es lo mas seguro y ademas es lo que
    # esa persona queria.
    'inversion': {
        'texto': (
            'Eso lo habla una persona, no yo. Escribile a info@ordenglobal.org '
            'y te contesta alguien que puede darte la información formal.\n\n'
            'No es una evasiva: de regulación, licencias y de si algo es una '
            'inversión no me corresponde hablar a mí.'),
        'botones': None,
    },
}

# Lo que escribe alguien y lleva derecho a un nodo, sin pasar por el motor. Es
# el atajo para quien no toca botones — la mayoria de la gente escribe.
ATAJOS = [
    (re.compile(r'^\s*(hola|buenas|buenos dias|buenas tardes|buenas noches|'
                r'hey|holi|que tal|saludos)\s*[.!]*\s*$'), 'inicio'),
    (re.compile(r'\b(invertir|inversion|inversionista|invierto|accionista|'
                r'rendimiento|ganancia)\b'), 'inversion'),
    (re.compile(r'\b(menu|opciones|ayuda|que podes hacer|que puedes hacer|'
                r'empezar|inicio)\b'), 'inicio'),
]


def nodo(nombre):
    return NODOS.get(nombre)


def por_toque(id_boton):
    """El nodo al que lleva un boton tocado.

    `id_boton` es lo que WhatsApp devuelve en `metadata.interactiveId`: el
    `payload` que se mando. Se comprueba que exista antes de usarlo — un
    identificador que no esta en el guion es un mensaje de otra epoca, de una
    version anterior del menu, y no puede llevar a ninguna parte.
    """
    return NODOS.get(id_boton) and id_boton or None


def por_texto(dicho, desde=None):
    """A donde lleva lo que alguien ESCRIBIO. `None` si no lleva a ningun lado.

    Se mira, en este orden:

      1. Si coincide con el titulo de un boton del nodo donde estaba. Es el
         caso de quien no toca el boton y TRANSCRIBE lo que dice — pasa todo el
         tiempo con teclados grandes y con gente mayor.
      2. Los atajos generales: un saludo lleva al inicio, y cualquier cosa de
         invertir lleva al camino de la persona.

    Lo que no encaja devuelve `None` y sigue su camino de siempre: al motor.
    Esa es la regla que separa guiar de atrapar.
    """
    t = _llano(dicho)
    if not t:
        return None

    n = NODOS.get(desde or '')
    for titulo, destino in (n or {}).get('botones') or []:
        if _llano(titulo) == t:
            return destino

    for patron, destino in ATAJOS:
        if patron.search(t):
            return destino
    return None


def como_texto(nombre):
    """El nodo escrito para un canal SIN botones — el chat de la casa.

    Las opciones van como una linea al final, en la voz de AU-RA y no como una
    lista numerada: en el chat la persona escribe, y escribir «la billetera» es
    tan facil como tocar un boton que no existe.
    """
    n = NODOS.get(nombre)
    if not n:
        return None
    if not n.get('botones'):
        return n['texto']
    opciones = ' · '.join(t for t, _ in n['botones'])
    return f"{n['texto']}\n\n{opciones}"
