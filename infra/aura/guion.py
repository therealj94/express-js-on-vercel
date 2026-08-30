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
    # ── LA PRIMERA PANTALLA ────────────────────────────────────────────────
    #
    # Es la unica que importa de verdad: si esta no engancha, no hay segunda.
    #
    # NO empieza con «somos un ecosistema». Eso es una categoria, no un motivo
    # para quedarse, y ademas no significa nada para quien esta parado en una
    # pulperia con el telefono en la mano.
    #
    # Empieza por el dolor, que ademas es verdad y esta escrito en las fichas:
    # las monedas de la region pierden valor con los años y el que ahorra en
    # ellas ve como su esfuerzo se le hace agua. Eso no hay que explicarlo en
    # ningun pais de la region: se sabe de Mexico para abajo.
    #
    # Y promete POCO tiempo. «Treinta segundos» baja el costo de seguir
    # leyendo, que es la unica decision que se toma en esta pantalla.
    'inicio': {
        'texto': (
            'Soy AU-RA, la inteligencia de Orden Global.\n\n'
            'Lo que ahorrás hoy, en un año compra menos. No es por lo que ganás '
            '— es por la moneda.\n\n'
            'Nosotros medimos con otra vara. Te lo cuento en treinta segundos.'),
        'botones': [
            # El premio va PRIMERO. Es el boton que da un motivo para tocar
            # algo, y quien lo toca termina aprendiendo lo mismo que le
            # contaria el camino largo — pero quedandose.
            ('Ganá 1 ORIGEN', 'ganar'),
            ('¿Cómo es eso?', 'como-funciona'),
            ('¿Qué puedo hacer?', 'que-hago'),
        ],
    },

    'como-funciona': {
        'texto': (
            'ORIGEN es la moneda de la casa y sigue al oro: uno vale un gramo de '
            'oro dividido entre cincuenta y cinco, al precio de hoy.\n\n'
            'La fórmula es pública y no la ponemos nosotros. Podés rehacer el '
            'precio con una calculadora cuando quieras.'),
        'botones': [
            ('¿Y si el oro baja?', 'honesto'),
            ('¿Dónde lo guardo?', 'billetera'),
            ('Volver', 'inicio'),
        ],
    },

    # ── EL NODO QUE MAS VENDE, Y VENDE PORQUE NO VENDE ─────────────────────
    #
    # Aqui se dice que el oro baja y que no hay oro en boveda. Parece un mal
    # negocio decirlo en la tercera pantalla; es al reves. Quien llega a un
    # numero de WhatsApp preguntando por una moneda de oro ya escucho diez
    # promesas y no le creyo a ninguna. Lo que no ha escuchado nunca es que le
    # digan la parte incomoda antes de que la busque.
    #
    # Y la salida no es una promesa: es «comprobalo vos», con la direccion del
    # explorador. Eso no lo puede decir quien esta mintiendo.
    'honesto': {
        'texto': (
            'Baja. El oro sube y baja, y no te voy a decir lo contrario.\n\n'
            'Y otra que casi nadie dice: no hay oro en bóveda detrás de ORIGEN. '
            'Hay una referencia de precio.\n\n'
            'Lo que sí podés comprobar sin pedirnos permiso es la cadena: cada '
            'movimiento está en ordenscan.com.'),
        'botones': [
            ('Me gusta eso', 'que-hago'),
            ('¿Y las otras?', 'monedas'),
            ('Volver', 'como-funciona'),
        ],
    },

    # El reparto. Tres puertas y cada una es una VIDA distinta: el que manda
    # plata, el que vende, el que ahorra. No «productos» — situaciones.
    'que-hago': {
        'texto': (
            'Con la misma cuenta: guardás tu plata, le mandás a tu gente, y le '
            'cobrás a tus clientes con un QR.\n\n'
            '¿Cuál te toca a vos?'),
        'botones': [
            ('Mandar plata', 'remesas'),
            ('Tengo un negocio', 'negocio'),
            ('Guardar mis ahorros', 'billetera'),
        ],
    },

    'remesas': {
        'texto': (
            'Le mandás a tu gente en nueve países, y antes de confirmar ves '
            'exactamente cuánto le llega del otro lado — ya con la comisión y el '
            'cambio descontados.\n\n'
            'Sin sorpresas al final. Eso es lo que más se agradece.'),
        'botones': [
            ('¿Cuánto cobran?', 'comision'),
            ('Quiero empezar', 'empezar'),
            ('Volver', 'que-hago'),
        ],
    },

    'comision': {
        'texto': (
            'La comisión de red es de 0,001 ORIGEN, y se paga en ORIGEN aunque '
            'mandés otra moneda.\n\n'
            'Es mínima porque la cadena es nuestra: no le alquilamos la red a '
            'nadie. El equivalente lo ves antes de confirmar.'),
        'botones': [
            ('Quiero empezar', 'empezar'),
            ('Volver', 'que-hago'),
        ],
    },

    'negocio': {
        'texto': (
            'Cobrás con un QR desde tu teléfono: ponés el monto, tu cliente lo '
            'escanea, y el pago te llega en segundos. Sin datáfono ni aparatos '
            'nuevos.\n\n'
            'Tu negocio además entra al directorio, donde ya hay comercios en '
            'diecinueve países.'),
        'botones': [
            ('¿Qué necesito?', 'negocio-como'),
            ('¿Cuánto cobran?', 'comision'),
            ('Volver', 'que-hago'),
        ],
    },

    'negocio-como': {
        'texto': (
            'Tu teléfono y tu Genesis ID verificado. Nada más.\n\n'
            'La identidad es para que quien te pague sepa que del otro lado hay '
            'alguien real, y para que vos puedas emitir cobros a tu nombre.'),
        'botones': [
            ('¿Cómo la saco?', 'genesis'),
            ('Quiero empezar', 'empezar'),
        ],
    },

    'billetera': {
        'texto': (
            'Veta Wallet: guardás, mandás, recibís y cambiás entre monedas, todo '
            'desde el teléfono.\n\n'
            'Tus llaves son tuyas. Yo preparo, vos firmás con tu contraseña.'),
        'botones': [
            ('¿Y si pierdo el cel?', 'llaves'),
            ('Quiero empezar', 'empezar'),
            ('Volver', 'que-hago'),
        ],
    },

    # Este nodo no esta para vender: esta para que nadie pierda su plata. Y
    # justamente por eso es de los que mas confianza dan.
    'llaves': {
        'texto': (
            'Tu frase de respaldo es lo único que abre tu dinero si perdés el '
            'teléfono. Guardala escrita en un sitio seguro.\n\n'
            'Y no se la digas a nadie. Si alguien te la pide —aunque diga que es '
            'de Orden Global, aunque diga que soy yo— es mentira.'),
        'botones': [
            ('Entendido', 'que-hago'),
            ('Quiero empezar', 'empezar'),
        ],
    },

    'genesis': {
        'texto': (
            'Te verificás una vez y quedás verificado en todo el ecosistema. La '
            'revisa una persona, no una máquina, y suele estar en menos de un '
            'día.\n\n'
            'Te sirve para cobrar a tu nombre, para el chat y para lo que venga.'),
        'botones': [
            ('¿Qué me piden?', 'genesis-que'),
            ('Quiero empezar', 'empezar'),
            ('Volver', 'que-hago'),
        ],
    },

    'genesis-que': {
        'texto': (
            'Tu documento y una foto tuya del momento, para saber que sos vos y '
            'no una foto de una foto.\n\n'
            'Las imágenes del documento se guardan cifradas y se borran a los '
            'cinco años. La única que queda es tu retrato, porque es tu '
            'credencial.'),
        'botones': [
            ('Quiero empezar', 'empezar'),
            ('Volver', 'genesis'),
        ],
    },

    'monedas': {
        'texto': (
            'ORIGEN sigue al oro por gramo. AUKA sigue la onza de oro y AGKA la '
            'de plata.\n\n'
            'Ojo con esto, que prefiero decírtelo yo: siguen el precio, no te '
            'entregan el metal.'),
        'botones': [
            ('¿Y ORIGEN?', 'como-funciona'),
            ('Quiero empezar', 'empezar'),
            ('Volver', 'que-hago'),
        ],
    },

    'empezar': {
        'texto': (
            'Bajás Veta Wallet, ponés tu correo y ya tenés cuenta. La '
            'verificación la hacés ahí adentro cuando quieras.\n\n'
            'Si se te traba algo, contámelo por acá y lo vemos.'),
        'botones': [
            ('Hablar con alguien', 'persona'),
            ('Volver', 'inicio'),
        ],
    },

    # ── EL JUEGO ───────────────────────────────────────────────────────────
    #
    # No es un adorno: es la puerta que mejor convierte. Alguien que llega por
    # curiosidad se va en veinte segundos; alguien que llega por un gramo de
    # oro se queda tres minutos, y en esos tres minutos aprende a usar el
    # producto. El premio paga la atencion, y las preguntas son el contenido.
    #
    # Se dice UNO POR PERSONA desde la primera linea. Escondido, se descubre al
    # final y se siente estafa; dicho de entrada es una regla y ya.
    'ganar': {
        'texto': (
            'Te regalo 1 ORIGEN por aprender a usar tu plata. 🌱\n\n'
            'Son tres preguntas. Si te equivocás no pasa nada: te explico y '
            'seguimos — no es un examen.\n\n'
            'Al final abrís tu Veta Wallet, me pasás tu dirección y te lo mando. '
            'Uno por persona.'),
        'botones': [
            ('Dale, empecemos', 'ganar-va'),
            ('¿Qué es ORIGEN?', 'como-funciona'),
            ('Ahora no', 'que-hago'),
        ],
    },

    # Nodo puente: lo toma el juego, que se encarga desde aqui. El texto no se
    # usa —lo pisa la primera pregunta— pero el nodo existe para que el boton
    # tenga a donde llevar y para que la prueba de nodos huerfanos pase.
    'ganar-va': {
        'texto': 'Arrancamos.',
        'botones': None,
    },

    # ── Los dos caminos que NO contestan solos ─────────────────────────────
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
            'Eso lo habla una persona, no yo. Escribile a info@ordenglobal.org y '
            'te contesta alguien que puede darte la información formal.\n\n'
            'No es una evasiva: de eso no me corresponde hablar a mí.'),
        'botones': None,
    },
}

# Lo que escribe alguien y lleva derecho a un nodo, sin pasar por el motor. Es
# el atajo para quien no toca botones — la mayoria de la gente escribe.
ATAJOS = [
    (re.compile(r'^\s*(hola|buenas|buenos dias|buenas tardes|buenas noches|'
                r'hey|holi|que tal|saludos)\s*[.!]*\s*$'), 'inicio'),
    # Todo lo que huela a invertir va a una persona, y va ANTES que los demas
    # atajos: «quiero invertir en origen» no puede caer en el nodo de ORIGEN.
    (re.compile(r'\b(invertir|inversion|inversionista|invierto|accionista|'
                r'rendimiento|ganancia|rentabilidad|ondk|acciones?)\b'), 'inversion'),
    # ANCLADO de punta a punta, como el saludo. «ayuda» a secas es alguien
    # pidiendo el menu; «necesito ayuda con remesas» es alguien diciendo lo que
    # le pasa, y contestarle el menu es no haberlo leido. Con `\b` en medio de
    # la frase, la segunda caia en el menu.
    (re.compile(r'^\s*(menu|menú|opciones|ayuda|empezar|inicio|'
                r'que podes hacer|que puedes hacer)\s*[.!?]*\s*$'), 'inicio'),
]

# ── LOS ATAJOS DE TEMA, QUE SON OTRA COSA ───────────────────────────────────
#
# «remesas» es alguien diciendo de que quiere hablar. «¿cuanto cuesta mandar
# plata a mi mama?» es una PREGUNTA, y contestarle un menu es no haberla
# leido.
#
# La primera version no distinguia y atrapaba las dos. Lo cazo la prueba que
# existe justamente para eso — la que dice que lo que no encaja va al motor.
#
# La regla: un atajo de tema solo vale si el mensaje es CORTO y NO es una
# pregunta. Quien escribe cuatro palabras sin signo esta nombrando un tema;
# quien escribe una frase con «?» quiere una respuesta, no una puerta.
TEMAS = [
    (re.compile(r'\b(remesa|remesas|mandar plata|enviar plata|mandar dinero|'
                r'enviar dinero)\b'), 'remesas'),
    (re.compile(r'\b(mi negocio|negocio|cobrar|cobro|qr|mytokenpay|'
                r'pulperia|tienda)\b'), 'negocio'),
    (re.compile(r'\b(genesis ?id|verificar|verificacion|identidad)\b'), 'genesis'),
    (re.compile(r'\b(frase de respaldo|semilla|seed)\b'), 'llaves'),
    (re.compile(r'\b(origen|gramin)\b'), 'como-funciona'),
    (re.compile(r'\b(premio|regalo|gratis|ganar|concurso)\b'), 'ganar'),
    (re.compile(r'\b(auka|agka)\b'), 'monedas'),
]

# Cuatro palabras. Con cinco ya empiezan a caber preguntas de verdad
# («cuanto me cobran por mandar plata»), y con tres se escapan temas que la
# gente escribe con articulo («lo de las remesas»).
TOPE_TEMA = 4

# Y el signo de pregunta NO ALCANZA para saber si algo es una pregunta: en
# WhatsApp casi nadie lo pone. «cuantos ORIGEN tengo» son tres palabras, no
# lleva signo, y es tan pregunta como la que mas — se colaba al nodo de ORIGEN
# en vez de ir a mirar su saldo.
#
# Lo que de verdad delata la pregunta es la palabra con que empieza. Quien
# escribe «remesas» esta nombrando un tema; quien escribe «cuanto», «como» o
# «tengo» quiere una respuesta.
INTERROGA = re.compile(
    r'\b(que|qué|cuanto|cuantos|cuanta|cuantas|como|cuando|donde|cual|cuales|'
    r'quien|quienes|por que|porque|tengo|tenes|puedo|podes|hay|sirve|funciona|'
    r'necesito|quiero saber)\b')


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

    # Los de tema, solo si es corto y no es una pregunta. Ver `TEMAS` e
    # `INTERROGA`: el signo no alcanza, la palabra sí.
    if ('?' not in t and len(t.split()) <= TOPE_TEMA
            and not INTERROGA.search(t)):
        for patron, destino in TEMAS:
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
