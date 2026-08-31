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

# ── DOS IDIOMAS, Y LA PREGUNTA VA PRIMERO ───────────────────────────────────
#
# Pedido de Jose: «desde preguntar el idioma ingles o espanol, de ahi partir».
# El nodo `idioma` es la puerta de entrada y es el UNICO mensaje bilingue del
# guion: a partir de ahi todo va en el idioma que la persona eligio.
#
# Se pregunta en vez de adivinar por el prefijo del telefono. Un +1 puede ser
# un hondureno en Houston y un +52 un canadiense en Cancun; adivinar mal en el
# primer mensaje es el peor momento para equivocarse, porque es el unico en el
# que la persona todavia no invirtio nada en la charla y se va sin costo.
#
# ── LOS ENLACES NO SON ADORNO ───────────────────────────────────────────────
#
# Cada nodo que nombra una pieza del sistema lleva su enlace. Un guion que
# explica Veta Wallet y no dice donde esta obliga a la persona a buscarla, y
# ahi se pierde. Los cuatro que se usan:
#
#   app.vetawallet.com   la billetera
#   ordenscan.com        el explorador, para comprobar sin pedir permiso
#   ordenglobal.org      la casa
#   wa.me/50432136457    el WhatsApp de Jose, para hablar con una persona
#
# El de `wa.me` es el que mas importa: «hablar con alguien» que no da un numero
# no es hablar con alguien.

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

    # ── LA PUERTA. El unico mensaje bilingue del guion ──────────────────────
    #
    # Se pregunta el idioma en vez de adivinarlo por el prefijo: un +1 puede
    # ser un hondureno en Houston. Equivocarse aqui es equivocarse en el unico
    # mensaje que la persona lee sin haber invertido nada en la charla.
    'idioma': {
        'texto': {
            'es': ('Soy AU-RA — la inteligencia propia de Orden Global. 🌎\n\n'
                   '¿En qué idioma seguimos?\n'
                   "I'm AU-RA — Orden Global's own intelligence. "
                   'Which language?'),
            'en': ('Soy AU-RA — la inteligencia propia de Orden Global. 🌎\n\n'
                   '¿En qué idioma seguimos?\n'
                   "I'm AU-RA — Orden Global's own intelligence. "
                   'Which language?'),
        },
        'botones': {
            'es': [('Español', 'lang:es'), ('English', 'lang:en')],
            'en': [('Español', 'lang:es'), ('English', 'lang:en')],
        },
    },

    # ── EL NOMBRE. La segunda puerta, y la que cambia todo ──────────────────
    #
    # Antes de esto el arranque tiraba el argumento de ORIGEN en el primer
    # mensaje: informacion a alguien que todavia no dijo ni como se llama. Se
    # leia como folleto, y un folleto se cierra.
    #
    # Preguntar el nombre cuesta un mensaje y compra tres cosas: la persona
    # contesta algo facil (y quien contesta una vez contesta la siguiente), la
    # charla deja de ser anonima, y AU-RA puede llamarla por su nombre el
    # resto del camino. `espera` le dice al asistente que lo que escriba aqui
    # ES el dato, no un comando — si no, alguien que se llame algo parecido a
    # un atajo saldria disparado a otro nodo.
    'nombre': {
        'texto': {
            'es': ('Soy el modelo 1 de Orden Global — hecho por la casa, no '
                   'alquilado a nadie. 🌱\n\n'
                   'No estoy para contestar preguntas sueltas: estoy para '
                   'acompañarte. Te explico, te preparo lo que necesités y me '
                   'acuerdo de vos la próxima vez.\n\n'
                   'Y para eso tengo que saber con quién hablo. ¿Cómo te '
                   'llamás?'),
            'en': ('I am Orden Global\'s model 1 — built in-house, not rented '
                   'from anyone. 🌱\n\n'
                   'I am not here to answer loose questions: I am here to stay '
                   'with you. I explain, I prepare what you need, and I '
                   'remember you next time.\n\n'
                   'And for that I need to know who I am talking to. What is '
                   'your name?'),
        },
        'espera': 'nombre',
    },

    # ── UNA SOLA PREGUNTA, CON SIETE OPCIONES ───────────────────────────────
    #
    # Eran dos preguntas —pais y oficio— y Jose pidio juntarlas y dar mas
    # opciones. El pais ya no se pregunta (sale del prefijo del numero) y el
    # oficio usa una LISTA de WhatsApp, no botones: hasta diez filas, cada una
    # con su subtitulo.
    #
    # Que se pudiera no era obvio. Probado con el campo `list` devolvia 200 y
    # el proveedor tiraba la lista en silencio; el campo bueno es
    # `interactive`, y se supo leyendo su documentacion despues de que el 200
    # enganara una vez. Ver `whatsapp.con_lista`.
    #
    # Las descripciones son la mitad del valor: «Tengo un negocio / Pulpería,
    # taller, tienda» se reconoce sin pensarlo. Y la ultima fila deja escribir,
    # porque ninguna lista cubre a todo el mundo.
    'oficio': {
        'texto': {
            'es': ('{nombre}, ¿a qué te dedicás?\n\n'
                   'Elegí la que más se parezca — o escribímelo con tus '
                   'palabras, como prefieras.'),
            'en': ('{nombre}, what do you do?\n\n'
                   'Pick the closest one — or just write it in your own '
                   'words, whichever you prefer.'),
        },
        # SIN EJEMPLOS, lo pidio Jose. Y tiene razon de sobra: un ejemplo
        # ACOTA en vez de abrir. Quien lee «Tengo un negocio / Pulpería,
        # taller, tienda» y tiene una barberia duda de si cuenta; sin el
        # subtitulo, «Tengo un negocio» le queda perfecto. La lista se lee
        # ademas de un vistazo, que es de lo que se trata.
        'lista': {
            'es': ('Ver opciones', [
                ('of:negocio', 'Tengo un negocio'),
                ('of:asalariado', 'Tengo un empleo'),
                ('of:independiente', 'Trabajo por mi cuenta'),
                ('of:remesas', 'Recibo remesas'),
                ('of:agro', 'Trabajo en el campo'),
                ('of:estudiante', 'Estudio'),
                ('of:otro', 'Otra cosa'),
            ]),
            'en': ('See options', [
                ('of:negocio', 'I have a business'),
                ('of:asalariado', 'I have a job'),
                ('of:independiente', 'I work for myself'),
                ('of:remesas', 'I receive remittances'),
                ('of:agro', 'I work the land'),
                ('of:estudiante', 'I study'),
                ('of:otro', 'Something else'),
            ]),
        },
        'espera': 'oficio',
    },

    # Quien elige «Otra cosa» pidio escribir. Se le pregunta y se espera.
    'oficio-otro': {
        'texto': {
            'es': 'Contame vos, {nombre}: ¿a qué te dedicás?',
            'en': 'Tell me yourself, {nombre}: what do you do?',
        },
        'espera': 'oficio',
    },

    # ── QUIEN ES AU-RA. La pregunta que mas se hace y peor se contestaba ────
    #
    # Lo pidio Jose: que se venda como lo que es —la inteligencia PROPIA de la
    # casa, modelo 1— y que se note la diferencia con una AI de proposito
    # general.
    #
    # La diferencia se cuenta con hechos, no con adjetivos: se acuerda de vos,
    # vive donde esta tu dinero, y NO firma nada. Ese ultimo es el que mas
    # tranquiliza y el que ninguna AI grande puede decir, porque ninguna esta
    # dentro de una billetera.
    'quien-soy': {
        'texto': {
            'es': ('Soy AU-RA, modelo 1 — la inteligencia de la casa. No es una '
                   'AI alquilada con otro nombre: corre en nuestros servidores '
                   'y aprende de lo nuestro.\n\n'
                   'La diferencia con las otras: ellas contestan y se olvidan. '
                   'Yo me acuerdo de vos, vivo dentro de tu billetera y te '
                   'preparo lo que necesités.\n\n'
                   'Y algo que ninguna debería poder hacer: yo NUNCA toco tu '
                   'dinero. Preparo, explico — firmás vos.'),
            'en': ('I am AU-RA, model 1 — this house\'s own intelligence. Not a '
                   'rented AI under another name: I run on our servers and I '
                   'learn from what is ours.\n\n'
                   'The difference with the others: they answer and forget. I '
                   'remember you, I live inside your wallet, and I prepare what '
                   'you need.\n\n'
                   'And something none of them should be able to do: I NEVER '
                   'touch your money. I prepare and explain — you sign.'),
        },
        'botones': {
            'es': [('¿Qué es la casa?', 'familia'),
                   ('Ganá 1 ORIGEN', 'ganar'),
                   ('¿Qué puedo hacer?', 'que-hago')],
            'en': [('What is the house?', 'familia'),
                   ('Win 1 ORIGEN', 'ganar'),
                   ('What can I do?', 'que-hago')],
        },
    },

    # ── EL MOMENTO, SIN PROMETER NADA ───────────────────────────────────────
    #
    # Jose lo pidio asi: «este es el momento para entrar antes que Orden Global
    # se expanda mundialmente, ser parte de la familia».
    #
    # Se vende la PERTENENCIA, jamas el rendimiento. «Entra ahora que va a
    # subir» seria promocion de valores en un WhatsApp abierto — lo mismo que
    # ya nos costo caro con lo de la SEC. «Estamos empezando y podés ser de los
    # primeros» es cierto, es atractivo, y no promete un centavo.
    'familia': {
        'texto': {
            'es': ('Orden Global no es una app: es la casa entera. Tu dinero '
                   '(Veta Wallet), tu identidad (Genesis ID), tu negocio '
                   '(MyTokenPay) y tu gente — todo sobre nuestra propia '
                   'cadena.\n\n'
                   'Y está empezando. Hoy somos los que estamos armándolo desde '
                   'Latinoamérica, para Latinoamérica. Cuando esto sea grande, '
                   'vos vas a poder decir que estabas desde el principio.\n\n'
                   'No te pido que me creas: comprobalo en ordenscan.com.'),
            'en': ('Orden Global is not an app: it is the whole house. Your '
                   'money (Veta Wallet), your identity (Genesis ID), your '
                   'business (MyTokenPay) and your people — all on our own '
                   'chain.\n\n'
                   'And it is just starting. Right now we are the ones building '
                   'it from Latin America, for Latin America. When this gets '
                   'big, you will be able to say you were here from the '
                   'start.\n\n'
                   'Do not take my word for it: check ordenscan.com.'),
        },
        'botones': {
            'es': [('Ganá 1 ORIGEN', 'ganar'),
                   ('¿Es real esto?', 'comprobar'),
                   ('¿Qué puedo hacer?', 'que-hago')],
            'en': [('Win 1 ORIGEN', 'ganar'),
                   ('Is this real?', 'comprobar'),
                   ('What can I do?', 'que-hago')],
        },
    },

    # ── COMPROBARLO POR FUERA. El mejor argumento que tiene la casa ─────────
    #
    # Y el unico que no depende de que nos crean. Estaba solo en una ficha del
    # motor; ahora tambien es un nodo escrito, que no puede alucinar.
    'comprobar': {
        'texto': {
            'es': ('No me creas a mí — mirá en sitios que no controlamos:\n\n'
                   '🔗 chainlist.org/chain/5550 — el directorio público de '
                   'redes. Ahí está la nuestra, con ORIGEN como su moneda.\n\n'
                   '🏛️ gleif.org — el registro que usa la banca mundial. Orden '
                   'Global Corp. y Au Corp. tienen su código activo.\n\n'
                   '🔍 ordenscan.com — cada movimiento de la cadena, a la '
                   'vista.'),
            'en': ('Do not take my word — look at places we do not control:\n\n'
                   '🔗 chainlist.org/chain/5550 — the public network directory. '
                   'Ours is there, with ORIGEN as its currency.\n\n'
                   '🏛️ gleif.org — the registry world banking uses. Orden '
                   'Global Corp. and Au Corp. each hold an active code.\n\n'
                   '🔍 ordenscan.com — every movement on the chain, in the '
                   'open.'),
        },
        'botones': {
            'es': [('Ganá 1 ORIGEN', 'ganar'), ('Quiero empezar', 'empezar'),
                   ('Volver', 'familia')],
            'en': [('Win 1 ORIGEN', 'ganar'), ('I want to start', 'empezar'),
                   ('Back', 'familia')],
        },
    },

    # ── EL SALUDO: UNA PREGUNTA, NO UN DISCURSO ─────────────────────────────
    #
    # Aqui es donde se decide si la persona se queda. La tentacion es explicar
    # ORIGEN de una; el error es el mismo de cualquier vendedor que habla
    # antes de escuchar. Se dice UNA frase que duele —la devaluacion, que la
    # vive todo el mundo en la region— y despues se le pregunta a ella.
    #
    # Las tres puertas no son «productos»: son las tres formas en que a una
    # persona le duele el dinero. Elegir una ya es contar algo de si misma.
    'saludo': {
        'texto': {
            'es': ('Gracias, {nombre}. 🤝\n\n'
                   'Te cuento dónde te estás metiendo: Orden Global está '
                   'construyendo una sola moneda para toda América Latina, y '
                   'está empezando. Entrar ahora es ser de los primeros.\n\n'
                   'Pero primero lo tuyo: ¿qué te trajo hasta acá?'),
            'en': ('Thanks, {nombre}. 🤝\n\n'
                   'Here is what you are walking into: Orden Global is '
                   'building one single currency for all of Latin America, and '
                   'it is just starting. Coming in now means being among the '
                   'first.\n\n'
                   'But first, you: what brought you here?'),
        },
        'botones': {
            'es': [('Cuidar mis ahorros', 'ahorro'),
                   ('Mandar plata', 'remesas'),
                   ('Tengo un negocio', 'negocio')],
            'en': [('Protect my savings', 'ahorro'),
                   ('Send money', 'remesas'),
                   ('I have a business', 'negocio')],
        },
    },

    # El camino del que ahorra. Antes caia en `billetera`, que le explicaba la
    # HERRAMIENTA sin haberle nombrado el PROBLEMA. Este empieza por el
    # problema, que es el suyo y lo reconoce al leerlo.
    'ahorro': {
        'texto': {
            'es': ('Te entiendo, {nombre}. Es la pregunta que más me hacen.\n\n'
                   'Guardás en {moneda} y en un año compra menos. No es que '
                   'ganes menos: es que la moneda vale menos.\n\n'
                   'Nosotros medimos con otra vara — el oro. Lo que guardás en '
                   'ORIGEN sigue al oro, no a la devaluación de tu país.'),
            'en': ('I hear you, {nombre}. It is the question I get most.\n\n'
                   'You save in {moneda} and a year later it buys less. You are '
                   'not earning less: the currency is worth less.\n\n'
                   'We measure with a different yardstick — gold. What you keep '
                   'in ORIGEN follows gold, not your country devaluation.'),
        },
        'botones': {
            'es': [('¿Y si el oro baja?', 'honesto'),
                   ('¿Dónde lo guardo?', 'billetera'),
                   ('Ganá 1 ORIGEN', 'ganar')],
            'en': [('If gold drops?', 'honesto'),
                   ('Where do I keep it?', 'billetera'),
                   ('Win 1 ORIGEN', 'ganar')],
        },
    },

    'inicio': {
        'texto': {
            'es': ('Lo que ahorrás hoy, en un año compra menos. No es por lo '
                   'que ganás — es por la moneda.\n\n'
                   'Nosotros medimos con otra vara: el oro. Te lo cuento en '
                   'treinta segundos.'),
            'en': ('What you save today buys less a year from now. It is not '
                   'what you earn — it is the currency.\n\n'
                   'We measure with a different yardstick: gold. Thirty '
                   'seconds and you will see it.'),
        },
        'botones': {
            'es': [('Ganá 1 ORIGEN', 'ganar'), ('¿Cómo es eso?', 'como-funciona'),
                   ('¿Qué puedo hacer?', 'que-hago')],
            'en': [('Win 1 ORIGEN', 'ganar'), ('How does that work?', 'como-funciona'),
                   ('What can I do?', 'que-hago')],
        },
    },

    'como-funciona': {
        'texto': {
            'es': ('ORIGEN es la moneda de la casa y sigue al oro: uno vale un '
                   'gramo de oro dividido entre cincuenta y cinco, al precio '
                   'de hoy.\n\n'
                   'La fórmula es pública y no la ponemos nosotros. Podés '
                   'rehacer el precio con una calculadora cuando quieras.'),
            'en': ('ORIGEN is our currency and it follows gold: one is worth a '
                   'gram of gold divided by fifty-five, at today price.\n\n'
                   'The formula is public and it is not ours to set. You can '
                   'redo the price with a calculator whenever you want.'),
        },
        'botones': {
            'es': [('¿Y si el oro baja?', 'honesto'), ('¿Dónde lo guardo?', 'billetera'),
                   ('Volver', 'inicio')],
            'en': [('If gold drops?', 'honesto'), ('Where do I keep it?', 'billetera'),
                   ('Back', 'inicio')],
        },
    },

    # ── EL NODO QUE MAS VENDE, Y VENDE PORQUE NO VENDE ──────────────────────
    #
    # Quien llega a un WhatsApp preguntando por una moneda de oro ya escucho
    # diez promesas y no le creyo a ninguna. Lo que no escucho nunca es que le
    # digan la parte incomoda antes de buscarla. La salida no es una promesa:
    # es «comprobalo vos», con la direccion del explorador.
    'honesto': {
        'texto': {
            'es': ('Baja. El oro sube y baja, y no te voy a decir lo '
                   'contrario.\n\n'
                   'Pero mirá la diferencia: la moneda de tu país baja y no '
                   'vuelve. El oro baja y sube.\n\n'
                   'ORIGEN no es un certificado de oro guardado: es una moneda '
                   'para mover plata, con el precio atado a una fórmula '
                   'pública del oro.\n\n'
                   'Acá nadie decide cuánto vale, y cada movimiento está a la '
                   'vista en ordenscan.com'),
            'en': ('It drops. Gold goes up and down, and I am not going to '
                   'tell you otherwise.\n\n'
                   'But look at the difference: your country currency goes '
                   'down and stays down. Gold goes down and comes back.\n\n'
                   'ORIGEN is not a certificate for stored gold. It is a '
                   'currency to move money, priced by a public gold '
                   'formula.\n\n'
                   'Nobody here decides what it is worth, and every movement '
                   'is public at ordenscan.com'),
        },
        'botones': {
            'es': [('Me gusta eso', 'que-hago'), ('¿Y las otras?', 'monedas'),
                   ('Volver', 'como-funciona')],
            'en': [('I like that', 'que-hago'), ('The other coins?', 'monedas'),
                   ('Back', 'como-funciona')],
        },
    },

    'que-hago': {
        'texto': {
            'es': ('Con la misma cuenta: guardás tu plata, le mandás a tu '
                   'gente, y le cobrás a tus clientes con un QR.\n\n'
                   '¿Cuál te toca a vos?'),
            'en': ('One account for all of it: keep your money, send it to '
                   'your people, and charge your customers with a QR.\n\n'
                   'Which one is yours?'),
        },
        'botones': {
            'es': [('Mandar plata', 'remesas'), ('Tengo un negocio', 'negocio'),
                   ('Guardar mis ahorros', 'billetera')],
            'en': [('Send money', 'remesas'), ('I have a business', 'negocio'),
                   ('Keep my savings', 'billetera')],
        },
    },

    'remesas': {
        'texto': {
            'es': ('Le mandás a tu gente en nueve países, y antes de confirmar '
                   'ves exactamente cuánto le llega del otro lado — ya con la '
                   'comisión y el cambio descontados.\n\n'
                   'Sin sorpresas al final. Eso es lo que más se agradece.'),
            'en': ('Send to your people across nine countries, and before you '
                   'confirm you see exactly what lands on the other side — fee '
                   'and exchange already taken out.\n\n'
                   'No surprises at the end. That is the part people thank us '
                   'for.'),
        },
        'botones': {
            'es': [('¿Cuánto cobran?', 'comision'), ('Quiero empezar', 'empezar'),
                   ('Volver', 'que-hago')],
            'en': [('What is the fee?', 'comision'), ('I want to start', 'empezar'),
                   ('Back', 'que-hago')],
        },
    },

    'comision': {
        'texto': {
            'es': ('La comisión de red es de 0,001 ORIGEN, y se paga en ORIGEN '
                   'aunque mandés otra moneda.\n\n'
                   'Es mínima porque la cadena es nuestra: no le alquilamos la '
                   'red a nadie. El equivalente lo ves antes de confirmar.'),
            'en': ('The network fee is 0.001 ORIGEN, paid in ORIGEN even if '
                   'you send another coin.\n\n'
                   'It is tiny because the chain is ours: we rent the network '
                   'from nobody. You see the equivalent before confirming.'),
        },
        'botones': {
            'es': [('Quiero empezar', 'empezar'), ('Volver', 'que-hago')],
            'en': [('I want to start', 'empezar'), ('Back', 'que-hago')],
        },
    },

    'negocio': {
        'texto': {
            'es': ('Cobrás con un QR desde tu teléfono: ponés el monto, tu '
                   'cliente lo escanea, y el pago te llega en segundos. Sin '
                   'datáfono ni aparatos nuevos.\n\n'
                   'Tu negocio además entra al directorio, donde ya hay '
                   'comercios en diecinueve países.'),
            'en': ('Charge with a QR from your phone: you set the amount, your '
                   'customer scans it, and the payment lands in seconds. No '
                   'card terminal, no new hardware.\n\n'
                   'Your business also joins the directory, with merchants in '
                   'nineteen countries already.'),
        },
        'botones': {
            'es': [('¿Qué necesito?', 'negocio-como'), ('¿Cuánto cobran?', 'comision'),
                   ('Volver', 'que-hago')],
            'en': [('What do I need?', 'negocio-como'), ('What is the fee?', 'comision'),
                   ('Back', 'que-hago')],
        },
    },

    'negocio-como': {
        'texto': {
            'es': ('Tu teléfono y tu Genesis ID verificado. Nada más.\n\n'
                   'La identidad es para que quien te pague sepa que del otro '
                   'lado hay alguien real, y para que vos puedas emitir cobros '
                   'a tu nombre.'),
            'en': ('Your phone and your verified Genesis ID. Nothing else.\n\n'
                   'The identity is so whoever pays you knows there is a real '
                   'person on the other side, and so you can issue charges in '
                   'your own name.'),
        },
        'botones': {
            'es': [('¿Cómo la saco?', 'genesis'), ('Quiero empezar', 'empezar')],
            'en': [('How do I get it?', 'genesis'), ('I want to start', 'empezar')],
        },
    },

    'billetera': {
        'texto': {
            'es': ('Veta Wallet: guardás, mandás, recibís y cambiás entre '
                   'monedas, todo desde el teléfono.\n\n'
                   'Tus llaves son tuyas. Yo preparo, vos firmás con tu '
                   'contraseña.\n\n'
                   'Está en app.vetawallet.com'),
            'en': ('Veta Wallet: keep, send, receive and swap between coins, '
                   'all from your phone.\n\n'
                   'Your keys are yours. I prepare, you sign with your '
                   'password.\n\n'
                   'It lives at app.vetawallet.com'),
        },
        'botones': {
            'es': [('¿Y si pierdo el cel?', 'llaves'), ('Quiero empezar', 'empezar'),
                   ('Volver', 'que-hago')],
            'en': [('If I lose my phone?', 'llaves'), ('I want to start', 'empezar'),
                   ('Back', 'que-hago')],
        },
    },

    'llaves': {
        'texto': {
            'es': ('Tu frase de respaldo es lo único que abre tu dinero si '
                   'perdés el teléfono. Guardala escrita en un sitio '
                   'seguro.\n\n'
                   'Y no se la digas a nadie. Si alguien te la pide —aunque '
                   'diga que es de Orden Global, aunque diga que soy yo— es '
                   'mentira.'),
            'en': ('Your recovery phrase is the only thing that opens your '
                   'money if you lose your phone. Write it down and keep it '
                   'somewhere safe.\n\n'
                   'And never tell it to anyone. If someone asks for it — even '
                   'claiming to be Orden Global, even claiming to be me — it '
                   'is a lie.'),
        },
        'botones': {
            'es': [('Entendido', 'que-hago'), ('Quiero empezar', 'empezar')],
            'en': [('Understood', 'que-hago'), ('I want to start', 'empezar')],
        },
    },

    'genesis': {
        'texto': {
            'es': ('Te verificás una vez y quedás verificado en todo el '
                   'ecosistema. La revisa una persona, no una máquina, y suele '
                   'estar en menos de un día.\n\n'
                   'Te sirve para cobrar a tu nombre, para el chat y para lo '
                   'que venga.'),
            'en': ('Verify once and you are verified across the whole '
                   'ecosystem. A person reviews it, not a machine, and it '
                   'usually takes less than a day.\n\n'
                   'You need it to charge in your own name, for the chat, and '
                   'for whatever comes next.'),
        },
        'botones': {
            'es': [('¿Qué me piden?', 'genesis-que'), ('Quiero empezar', 'empezar'),
                   ('Volver', 'que-hago')],
            'en': [('What do they ask?', 'genesis-que'), ('I want to start', 'empezar'),
                   ('Back', 'que-hago')],
        },
    },

    'genesis-que': {
        'texto': {
            'es': ('Tu documento y una foto tuya del momento, para saber que '
                   'sos vos y no una foto de una foto.\n\n'
                   'Las imágenes del documento se guardan cifradas y se borran '
                   'a los cinco años. La única que queda es tu retrato, porque '
                   'es tu credencial.'),
            'en': ('Your ID document and a live photo of you, so we know it is '
                   'you and not a photo of a photo.\n\n'
                   'The document images are stored encrypted and deleted after '
                   'five years. The only one that stays is your portrait, '
                   'because that is your credential.'),
        },
        'botones': {
            'es': [('Quiero empezar', 'empezar'), ('Volver', 'genesis')],
            'en': [('I want to start', 'empezar'), ('Back', 'genesis')],
        },
    },

    # ── LAS CUATRO MONEDAS ──────────────────────────────────────────────────
    #
    # Aqui esta la frase que contesta el miedo, y la dijo Jose: AUKA y AGKA no
    # salen hasta que el respaldo este firmado. Es mejor argumento que afirmar
    # una boveda —que el expediente de la Junta dice que no existe— porque es
    # verdad hoy y porque decir «no lo sacamos todavia» es exactamente lo que
    # NO hace quien esta vendiendo humo.
    #
    # ONDK si esta respaldado y es la unica excepcion del ecosistema. Se nombra
    # sin precio, sin apreciacion y sin invitar a nada: es un valor negociable.
    'monedas': {
        'texto': {
            'es': ('Cada una tiene su trabajo:\n\n'
                   '🟡 ORIGEN — la de todos los días: mandar, cobrar, '
                   'guardar.\n'
                   '🥇 AUKA — el oro. 🥈 AGKA — la plata.\n'
                   '🏛️ ONDK — Orden Global hecha token.\n\n'
                   'AUKA y AGKA todavía no las sacamos: no salen hasta que el '
                   'respaldo del metal esté firmado. Se está trabajando en '
                   'Próspera.\n\n'
                   'Cuando salgan van a seguir el precio del metal, no te lo '
                   'entregan. Prefiero decírtelo yo.\n\n'
                   'ONDK sí está respaldado — por la minería y las compañías '
                   'del grupo. De eso te habla una persona.'),
            'en': ('Each one has a job:\n\n'
                   '🟡 ORIGEN — the everyday one: send, charge, keep.\n'
                   '🥇 AUKA — gold. 🥈 AGKA — silver.\n'
                   '🏛️ ONDK — Orden Global as a token.\n\n'
                   'AUKA and AGKA are not out yet: they do not launch until '
                   'the metal backing is signed. That work is under way in '
                   'Próspera.\n\n'
                   'When they launch they will follow the metal price, they '
                   'do not hand you the metal. I would rather say it.\n\n'
                   'ONDK is backed — by the group mining and companies. A '
                   'person talks to you about that one.'),
        },
        'botones': {
            'es': [('¿Y ORIGEN?', 'como-funciona'), ('Quiero empezar', 'empezar'),
                   ('Volver', 'que-hago')],
            'en': [('And ORIGEN?', 'como-funciona'), ('I want to start', 'empezar'),
                   ('Back', 'que-hago')],
        },
    },

    'empezar': {
        'texto': {
            'es': ('Entrá a app.vetawallet.com, ponés tu correo y ya tenés '
                   'cuenta. La verificación la hacés ahí adentro cuando '
                   'quieras.\n\n'
                   'Si se te traba algo, contámelo por acá y lo vemos.'),
            'en': ('Go to app.vetawallet.com, enter your email and you have an '
                   'account. You do the verification inside, whenever you '
                   'want.\n\n'
                   'If anything gets stuck, tell me here and we sort it out.'),
        },
        'botones': {
            'es': [('Hablar con el equipo', 'equipo'), ('Volver', 'inicio')],
            'en': [('Talk to the team', 'equipo'), ('Back', 'inicio')],
        },
    },

    'ganar': {
        'texto': {
            'es': ('Te regalo 1 ORIGEN por aprender a usar tu plata. 🌱\n\n'
                   'Son tres preguntas. Si te equivocás no pasa nada: te '
                   'explico y seguimos — no es un examen.\n\n'
                   'Al final abrís tu Veta Wallet, me pasás tu dirección y te '
                   'lo mando. Uno por persona.'),
            'en': ('I will give you 1 ORIGEN for learning how your money '
                   'works. 🌱\n\n'
                   'Three questions. Getting one wrong is fine: I explain and '
                   'we keep going — this is not an exam.\n\n'
                   'At the end you open your Veta Wallet, send me your address '
                   'and I send it. One per person.'),
        },
        'botones': {
            'es': [('Dale, empecemos', 'ganar-va'), ('¿Qué es ORIGEN?', 'como-funciona'),
                   ('Ahora no', 'que-hago')],
            'en': [('Let us start', 'ganar-va'), ('What is ORIGEN?', 'como-funciona'),
                   ('Not now', 'que-hago')],
        },
    },

    'ganar-va': {
        'texto': {'es': 'Arrancamos.', 'en': 'Here we go.'},
    },

    # ── HABLAR CON EL EQUIPO: PRIMERO SE PREGUNTA PARA QUE ─────────────────
    #
    # Lo pidio Jose: «hacer preguntas quién es, qué país y qué ocupa saber
    # para dirigirlo». Antes esto daba el correo y ya, y a Jose le llegaba un
    # «hola» sin saber de quien.
    #
    # El nombre, el pais y el oficio YA los tenemos del embudo. Lo unico que
    # falta es el MOTIVO, y con eso alcanza para dirigir. Preguntar de nuevo lo
    # que ya nos dijo es la forma mas rapida de que alguien se sienta un
    # numero.
    'equipo': {
        'texto': {
            'es': ('Dale, {nombre}. Te conecto con la persona que te sirve.\n\n'
                   '¿De qué querés hablar?'),
            'en': ('Sure, {nombre}. Let me connect you with the right '
                   'person.\n\n'
                   'What do you want to talk about?'),
        },
        'lista': {
            'es': ('Ver opciones', [
                ('eq:invertir', 'Quiero invertir'),
                ('eq:negocio', 'Poner mi negocio'),
                ('eq:cuenta', 'Un problema con mi cuenta'),
                ('eq:proyecto', 'Saber más del proyecto'),
                ('eq:alianza', 'Una alianza o propuesta'),
                ('eq:otro', 'Otra cosa'),
            ]),
            'en': ('See options', [
                ('eq:invertir', 'I want to invest'),
                ('eq:negocio', 'List my business'),
                ('eq:cuenta', 'A problem with my account'),
                ('eq:proyecto', 'Learn more about it'),
                ('eq:alianza', 'A partnership or proposal'),
                ('eq:otro', 'Something else'),
            ]),
        },
        'espera': 'motivo',
    },

    # Quien elige «otra cosa» escribe. Se le pregunta y se espera.
    'equipo-otro': {
        'texto': {
            'es': 'Contame en una línea qué necesitás, {nombre}, y te dirijo.',
            'en': 'Tell me in one line what you need, {nombre}, and I will '
                  'point you the right way.',
        },
        'espera': 'motivo',
    },

    # ── LO QUE FALTA PARA DIRIGIRLO ────────────────────────────────────────
    #
    # Solo se pregunta si el prefijo del telefono no lo dijo. A quien escribe
    # desde un +504 no se le pregunta de donde es: ya lo sabemos, y
    # preguntarlo delata que no estabamos escuchando.
    'equipo-pais': {
        'texto': {
            'es': '¿Y desde qué país me escribís, {nombre}?',
            'en': 'And what country are you writing from, {nombre}?',
        },
        'espera': 'pais',
    },

    # ── DERIVADO. Con el WhatsApp de Jose, no con un correo ────────────────
    'equipo-listo': {
        'texto': {
            # El nombre de la persona va al principio y el del dueño NO se
            # repite: quien se llame José leia «Listo, José. Escribile directo
            # a José», que se lee como una plantilla mal rellenada. Se dice
            # «escribile» y el numero: ya se sabe a quien.
            'es': ('Listo, {nombre}. Escribile directo por WhatsApp:\n'
                   'wa.me/50432136457\n\n'
                   'Ya le pasé quién sos y qué necesitás, así que no vas a '
                   'tener que contar todo de nuevo.\n\n'
                   'Si preferís escribir: info@ordenglobal.org'),
            'en': ('Done, {nombre}. Message directly on WhatsApp:\n'
                   'wa.me/50432136457\n\n'
                   'I already passed on who you are and what you need, so you '
                   'will not have to explain it all again.\n\n'
                   'If you prefer writing: info@ordenglobal.org'),
        },
        'botones': {
            'es': [('Ganá 1 ORIGEN', 'ganar'), ('Mientras, contame', 'que-hago')],
            'en': [('Win 1 ORIGEN', 'ganar'), ('Meanwhile, tell me', 'que-hago')],
        },
    },

    # ── LO LEGAL Y LO DE INVERTIR NO SE CONTESTA SOLO ───────────────────────
    #
    # Antes este nodo mandaba a un correo y ya. Ahora da un WhatsApp: quien
    # pregunta por invertir quiere hablar YA, y un correo es donde esa persona
    # se pierde. Sigue sin contarle la oportunidad — eso es lo que no puede
    # hacer una maquina.
    'inversion': {
        'texto': {
            'es': ('Eso lo habla una persona, no yo: de eso no me '
                   'corresponde hablar a mí.\n\n'
                   'Te conecto con José en un segundo — o si preferís '
                   'escribir, a info@ordenglobal.org.'),
            'en': ('A person handles that, not me: it is not mine to '
                   'answer.\n\n'
                   'Let me connect you with José in a second — or if you '
                   'prefer writing, info@ordenglobal.org.'),
        },
        'botones': {
            'es': [('Dale, conectame', 'equipo'),
                   ('¿Qué es la casa?', 'familia')],
            'en': [('Yes, connect me', 'equipo'),
                   ('What is the house?', 'familia')],
        },
    },
}

ATAJOS = [
    (re.compile(r'^\s*(hola|buenas|buenos dias|buenas tardes|buenas noches|'
                r'hey|holi|que tal|saludos)\s*[.!]*\s*$'), 'inicio'),
    # Todo lo que huela a invertir va a una persona, y va ANTES que los demas
    # atajos: «quiero invertir en origen» no puede caer en el nodo de ORIGEN.
    (re.compile(r'\b(invertir|inversion|inversionista|invierto|accionista|'
                r'rendimiento|ganancia|rentabilidad|ondk|acciones?|'
                r'invest|investing|investor|investment|shares?|'
                r'stake|returns?|dividend)\b'), 'inversion'),
    # ANCLADO de punta a punta, como el saludo. «ayuda» a secas es alguien
    # pidiendo el menu; «necesito ayuda con remesas» es alguien diciendo lo que
    # le pasa, y contestarle el menu es no haberlo leido. Con `\b` en medio de
    # la frase, la segunda caia en el menu.
    (re.compile(r'^\s*(menu|menú|opciones|ayuda|empezar|inicio|'
                r'que podes hacer|que puedes hacer)\s*[.!?]*\s*$'), 'inicio'),

    # ── LOS TRES QUE MAS VENDEN, Y POR ESO NO VAN AL MOTOR ──────────────────
    #
    # «¿quién sos?», «¿esto es real?» y «¿qué es Orden Global?» son las tres
    # preguntas que deciden si alguien se queda, y las tres iban al motor: las
    # contestaba distinto cada vez y una acababa mandando a la persona a un
    # correo. Ahora son texto escrito — dicen lo que dicen, no pueden alucinar,
    # y salen al instante sin gastar GPU.
    #
    # Van en ATAJOS y no en TEMAS a proposito: los de tema se bloquean cuando
    # el mensaje parece una pregunta, y estas SON preguntas. Por eso los
    # patrones son especificos en vez de palabras sueltas — «de verdad» a secas
    # atraparia «de verdad necesito ayuda con las remesas».
    (re.compile(r'\b(quien sos|quien eres|que sos vos|que eres tu|sos una ia|'
                r'eres una ia|sos un bot|eres un bot|sos humana|eres humana|'
                r'who are you|are you a bot|are you an ai|are you human)\b'),
     'quien-soy'),
    (re.compile(r'\b(estafa|scam|fraude|son de verdad|es de verdad|'
                r'son reales|es real esto|esto es real|como se que|'
                r'como puedo comprobar|is this real|is this a scam|'
                r'chainlist|gleif|how do i know)\b'), 'comprobar'),
    (re.compile(r'\b(hablar con (el equipo|alguien|una persona|un humano)|'
                r'quiero hablar con|contactar|contacto|'
                r'talk to (the team|someone|a person|a human)|'
                r'contact (you|the team))\b'), 'equipo'),
    (re.compile(r'\b(que es orden global|quienes son ustedes|de que se trata|'
                r'what is orden global|who is orden global|'
                r'que hace orden global)\b'), 'familia'),
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


IDIOMAS = ('es', 'en')
POR_OMISION = 'es'


def _en(valor, idioma):
    """Un campo del nodo en el idioma pedido.

    Si falta la traduccion se cae al espanol en vez de devolver vacio: media
    conversacion en un idioma es peor que toda en el otro.
    """
    if not isinstance(valor, dict):
        return valor
    return valor.get(idioma) or valor.get(POR_OMISION)


# ── LA MONEDA DE CADA PAIS ──────────────────────────────────────────────────
#
# «La moneda de tu país se devalúa» es un folleto. «Guardás en lempiras y en un
# año compra menos» le habla a ella. Esa es toda la razon de preguntar el pais.
#
# Se escribe como la nombra la gente —«en pesos», «en lempiras»— y no con el
# codigo ISO: nadie dice «guardo en HNL».
#
# El dolar y el euro NO estan y es a proposito: a quien ahorra en dolares no se
# le puede decir que su moneda se achica todos los años, seria mentira y
# ademas la notaria. Un pais que no este aqui cae en el texto general, que
# sigue siendo verdadero.
MONEDAS = {
    'honduras': 'lempiras', 'guatemala': 'quetzales', 'nicaragua': 'córdobas',
    'costa rica': 'colones', 'mexico': 'pesos', 'méxico': 'pesos',
    'colombia': 'pesos', 'argentina': 'pesos', 'chile': 'pesos',
    'republica dominicana': 'pesos', 'dominicana': 'pesos', 'uruguay': 'pesos',
    'peru': 'soles', 'perú': 'soles', 'bolivia': 'bolivianos',
    'paraguay': 'guaraníes', 'venezuela': 'bolívares', 'brasil': 'reales',
    'brazil': 'reales', 'haiti': 'gourdes', 'haití': 'gourdes',
}
MONEDA_GENERAL = {'es': 'la moneda de tu país', 'en': 'your local currency'}

# ── EL PAIS SALE DEL NUMERO, NO DE UNA PREGUNTA ─────────────────────────────
#
# Un +504 escribe desde Honduras casi siempre. Preguntarselo gasta un mensaje
# del embudo para averiguar algo que ya viene en la cabecera de cada mensaje
# que manda.
#
# Y OJO CON LA ASIMETRIA, porque es la razon de que esto sea distinto del
# idioma: adivinar el idioma por el prefijo es caro —un hondureno en Houston
# lee el mensaje en el idioma equivocado y se va—; adivinar la MONEDA es
# barato, porque lo peor que pasa es nombrar la moneda de su pais de origen en
# vez de la de donde vive, que ademas suele ser la que le duele. Por eso el
# idioma se pregunta y el pais no.
#
# Los paises dolarizados y España NO estan: ver `MONEDAS`. Un prefijo que no
# este aqui cae en la frase general, que sigue siendo cierta.
PREFIJOS = {
    '504': 'honduras', '502': 'guatemala', '505': 'nicaragua',
    '506': 'costa rica', '509': 'haiti', '591': 'bolivia', '595': 'paraguay',
    '598': 'uruguay', '52': 'mexico', '57': 'colombia', '54': 'argentina',
    '56': 'chile', '51': 'peru', '58': 'venezuela', '55': 'brasil',
    # Republica Dominicana comparte el +1 con Estados Unidos y Canada, asi que
    # se distingue por el codigo de area. Van antes que cualquier prefijo mas
    # corto: la busqueda es del mas largo al mas corto.
    '1809': 'republica dominicana', '1829': 'republica dominicana',
    '1849': 'republica dominicana',
}


def pais_de_numero(numero):
    """El pais probable de un numero de WhatsApp. Cadena vacia si no se sabe.

    Se prueba del prefijo mas largo al mas corto: si no, el +1 de Estados
    Unidos se comeria a la Republica Dominicana.
    """
    t = ''.join(ch for ch in str(numero or '') if ch.isdigit())
    for largo in sorted({len(k) for k in PREFIJOS}, reverse=True):
        pais = PREFIJOS.get(t[:largo])
        if pais:
            return pais
    return''

MONEDAS_EN = {
    'honduras': 'lempiras', 'guatemala': 'quetzales', 'nicaragua': 'córdobas',
    'costa rica': 'colones', 'mexico': 'pesos', 'méxico': 'pesos',
    'colombia': 'pesos', 'argentina': 'pesos', 'chile': 'pesos',
    'republica dominicana': 'pesos', 'dominicana': 'pesos', 'uruguay': 'pesos',
    'peru': 'soles', 'perú': 'soles', 'bolivia': 'bolivianos',
    'paraguay': 'guaraníes', 'venezuela': 'bolívares', 'brasil': 'reais',
    'brazil': 'reais', 'haiti': 'gourdes', 'haití': 'gourdes',
}


# ── LO QUE AU-RA DICE FUERA DEL GUION ───────────────────────────────────────
#
# El guion habla los dos idiomas desde el 30-ago, pero estos mensajes sueltos
# —los del juego, sobre todo— seguian en espanol nada mas. Quien elegia
# English jugaba en ingles y de golpe leia «Anotado. Tu ORIGEN sale hacia esa
# billetera»: justo en el momento del premio, que es el que decide si se
# queda.
#
# Estan aqui y no repartidos por `asistente.py` porque un mensaje suelto en el
# medio del codigo es un mensaje que nadie traduce nunca. `frase()` cae al
# espanol si falta una traduccion, y hay prueba de que no falta ninguna.
FRASES = {
    'premios-agotados': {
        'es': ('Se acabaron los ORIGEN de esta ronda. 🌱\n\nIgual te enseño lo '
               'mismo gratis si querés, y cuando abramos otra te aviso por acá.'),
        'en': ('This round of ORIGEN is finished. 🌱\n\nI can still teach you '
               'the same thing for free, and I will let you know here when we '
               'open another one.'),
    },
    'ya-reclamo': {
        'es': ('Este número ya reclamó su ORIGEN. 🌱 Es uno por persona, pero '
               'seguí preguntándome lo que quieras.'),
        'en': ('This number already claimed its ORIGEN. 🌱 It is one per '
               'person, but keep asking me anything you like.'),
    },
    'falta-direccion': {
        'es': ('Te sigo debiendo tu ORIGEN. Cuando tengas la dirección de tu '
               'Veta Wallet —empieza con 0x— pegámela por acá.'),
        'en': ('I still owe you your ORIGEN. When you have your Veta Wallet '
               'address —it starts with 0x— paste it here.'),
    },
    'anotado': {
        'es': ('Anotado. 🌱 Tu ORIGEN va en camino a esa billetera.\n\nCuando '
               'llegue lo vas a ver en tu Veta Wallet, y en ordenscan.com si '
               'querés comprobarlo vos.'),
        'en': ('Got it. 🌱 Your ORIGEN is on its way to that wallet.\n\nWhen it '
               'lands you will see it in your Veta Wallet, and on ordenscan.com '
               'if you want to check it yourself.'),
    },
    'ya-cobro-telefono': {
        'es': 'Este número ya reclamó su ORIGEN. 🌱 Uno por persona.',
        'en': 'This number already claimed its ORIGEN. 🌱 One per person.',
    },
    'ya-cobro-billetera': {
        'es': ('Esa billetera ya recibió un ORIGEN. 🌱 Es uno por persona y por '
               'billetera.'),
        'en': ('That wallet already received an ORIGEN. 🌱 One per person and '
               'per wallet.'),
    },
    'agotado-jugando': {
        'es': ('Uf — se acabaron los ORIGEN mientras jugabas. 🌱 Lo siento de '
               'verdad. Cuando abramos otra ronda te aviso por acá, y lo que '
               'aprendiste te queda igual.'),
        'en': ('Ah — the ORIGEN ran out while you were playing. 🌱 I am truly '
               'sorry. I will let you know here when we open another round, and '
               'what you learned stays with you anyway.'),
    },
    'registro-ilegible': {
        'es': ('Se me trabó algo al anotarte. Escribime en un rato y lo reviso '
               '— tu premio no se pierde.'),
        'en': ('Something jammed while registering you. Write me in a while and '
               'I will check it — your prize is not lost.'),
    },
    'no-pude-anotar': {
        'es': 'No pude anotarte ahora mismo. Probá en un rato.',
        'en': 'I could not register you right now. Try again in a while.',
    },
    'billetera-nuestra': {
        'es': 'Esa es una billetera nuestra. Mandame la tuya.',
        'en': 'That is one of our wallets. Send me yours.',
    },
    'solo-texto-y-voz': {
        'es': 'Por ahora entiendo texto y notas de voz. ¿Me lo escribís?',
        'en': 'For now I understand text and voice notes. Could you write it?',
    },
    # ── LAS QUE VIVIAN COMO CONSTANTES EN `asistente.py` ────────────────────
    #
    # Nueve, todas en espanol. Una de ellas —MODO_RETIRADO— salio el 30-ago a
    # las 13:25 en medio de una charla ENTERA en ingles: la persona venia de
    # jugar en ingles y de golpe leyo «Contame vos. Puedo hablar de lo que
    # quieras». Jose: «me cambió el idioma, necesito esto estar al 100».
    #
    # Se me escaparon porque la prueba anterior buscaba literales pegados a
    # `rel.enviar(`, y estas son constantes de modulo. La prueba nueva recorre
    # el arbol del fuente y no se le escapa ninguna.
    'saludo-probador': {
        'es': ('Hola, soy AU-RA, la inteligencia de Orden Global. Estás en el '
               'grupo de prueba, así que bienvenido dos veces.\n\n'
               'Una cosa primero, porque acá se dice todo: esta conversación '
               'conmigo la procesa nuestro servidor para poder contestarte. '
               'Tus chats con otras personas siguen cifrados de punta a punta '
               'y ahí no entro.'),
        'en': ('Hi, I am AU-RA, Orden Global\'s intelligence. You are in the '
               'test group, so welcome twice over.\n\n'
               'One thing first, because here everything gets said: this '
               'conversation with me is processed by our server so I can '
               'answer you. Your chats with other people stay end-to-end '
               'encrypted and I do not go in there.'),
    },
    'cierre-conocido': {
        'es': ('Gracias — con eso ya te conozco. Preguntame lo que quieras del '
               'ecosistema: ORIGEN, la cadena, tu Genesis ID, la tarjeta, lo '
               'que venga. Y si algo no lo sé, te lo digo derecho.'),
        'en': ('Thanks — now I know you. Ask me anything about the ecosystem: '
               'ORIGEN, the chain, your Genesis ID, the card, whatever comes '
               'up. And if I do not know something, I will tell you straight.'),
    },
    'voz-apagada': {
        'es': ('Listo, me callo. Para que vuelva a hablarte, tocá el micrófono '
               'o decime «con voz».'),
        'en': ('Done, I will stay quiet. To have me speak again, tap the '
               'microphone or tell me «with voice».'),
    },
    'motor-caido': {
        'es': ('Ahora mismo no puedo pensar: mi motor está apagado. Ya avisé a '
               'la casa — probá de nuevo en un rato.'),
        'en': ('Right now I cannot think: my engine is down. I already told the '
               'house — try again in a little while.'),
    },
    'no-salio': {
        'es': ('Se me enredó la respuesta. Preguntámelo de otra forma y te la '
               'doy bien.'),
        'en': ('My answer got tangled. Ask me another way and I will get it '
               'right.'),
    },
    'un-solo-modo': {
        'es': ('Ya no hay dos modos: pienso de una sola manera y contesto igual '
               'de rápido para todo. Preguntame nomás.'),
        'en': ('There are no two modes any more: I think one way and answer '
               'just as fast for everything. Just ask me.'),
    },
    'vas-muy-rapido': {
        'es': ('Pará un segundo que te sigo — vas más rápido que yo. Dale unos '
               'segundos y seguimos.'),
        'en': ('Hold on a second so I can keep up — you are going faster than '
               'me. Give it a few seconds and we continue.'),
    },
    'tope-del-dia': {
        'es': ('Por hoy llegamos al tope de preguntas que puedo atender por '
               'persona — estamos en prueba y el motor es uno solo. Mañana '
               'seguimos.'),
        'en': ('We have hit today\'s limit of questions I can handle per '
               'person — we are in testing and there is only one engine. We '
               'continue tomorrow.'),
    },
    'voz-calida': {
        'es': ('Listo, te hablo con la voz cálida. Te sigo escribiendo igual, '
               'para que lo que leés y lo que oís sea lo mismo.'),
        'en': ('Done, I will speak with the warm voice. I keep writing too, so '
               'what you read and what you hear are the same.'),
    },
    'voz-sobria': {
        'es': ('Listo, voz sobria: más lenta y más clara, la que uso para los '
               'montos.'),
        'en': ('Done, plain voice: slower and clearer, the one I use for '
               'amounts.'),
    },
    'voz-agil': {
        'es': 'Listo, voz ágil: más rápida y con más energía.',
        'en': 'Done, brisk voice: faster and with more energy.',
    },
    'respuesta-rota': {
        'es': ('Perdón, se me enredó la respuesta a mitad de camino. ¿Me lo '
               'volvés a preguntar?'),
        'en': ('Sorry, my answer got tangled halfway through. Could you ask me '
               'again?'),
    },
    'charlas-rotas': {
        'es': 'No pude leer las charlas ({e}). Probá de nuevo en un rato.',
        'en': 'I could not read the chats ({e}). Try again in a while.',
    },
}


# Lo que la persona dice que necesita, para dirigirla y para que Jose lo sepa
# ANTES de que le escriba. La clave viaja en el boton; el texto va al aviso.
MOTIVOS = {
    'eq:invertir': {'es': 'quiere invertir', 'en': 'wants to invest'},
    'eq:negocio': {'es': 'quiere poner su negocio',
                   'en': 'wants to list their business'},
    'eq:cuenta': {'es': 'tiene un problema con su cuenta',
                  'en': 'has a problem with their account'},
    'eq:proyecto': {'es': 'quiere saber más del proyecto',
                    'en': 'wants to know more about the project'},
    'eq:alianza': {'es': 'trae una alianza o propuesta',
                   'en': 'brings a partnership or proposal'},
}


def motivo_de_toque(id_boton, idioma=POR_OMISION):
    """`(motivo, pide_mas)`. «Otra cosa» abre el texto libre y no guarda nada:
    «otro» no es un motivo, es alguien pidiendo escribir."""
    s = str(id_boton or '')
    if s == 'eq:otro':
        return None, True
    m = MOTIVOS.get(s)
    return (_en(m, idioma) if m else None), False


def aviso_para_el_equipo(p, numero):
    """La ficha de quien esta por escribir, para el telefono de Jose.

    Es la mitad del valor de todo este camino. Sin esto, a Jose le llega un
    «hola» de un numero desconocido y tiene que empezar preguntando lo que la
    persona ya conto — que es exactamente la sensacion de ser un numero.

    Va en espanol siempre: lo lee Jose, no la persona.
    """
    quien = (p.get('nombre') or '').strip() or 'Alguien'
    lineas = [f'🔔 {quien} quiere hablar con vos.', '']
    pais = (p.get('pais') or '').strip()
    oficio = (p.get('oficio') or '').strip()
    señas = ' · '.join(x for x in (pais.title() if pais else '', oficio) if x)
    lineas.append(f'👤 {quien} · +{numero}')
    if señas:
        lineas.append(f'📍 {señas}')
    motivo = (p.get('motivo') or '').strip()
    if motivo:
        lineas.append(f'💬 {motivo}')
    if p.get('idioma') == 'en':
        lineas.append('🌐 habla en inglés')
    lineas += ['', 'Ya tiene tu WhatsApp.']
    return '\n'.join(lineas)


def es_titulo_de_opcion(texto):
    """Si eso que escribieron es, palabra por palabra, el titulo de un boton o
    de una fila de lista del guion — en cualquier idioma.

    Sirve para no confundir la transcripcion de un boton con una respuesta
    libre. El caso que lo motivo: «Tengo un negocio» entrando como nombre de
    pila. El `toco` cubre a quien TOCA el boton; esto cubre a quien lo copia a
    mano, que con teclados grandes y gente mayor pasa todo el tiempo.

    Se calcula del guion y no de una lista aparte: una opcion nueva queda
    cubierta sin que nadie se acuerde de anotarla en dos sitios.
    """
    t = _llano(texto)
    if not t:
        return False
    for n in NODOS.values():
        for idioma in IDIOMAS:
            for titulo, _destino in (_en(n.get('botones'), idioma) or []):
                if _llano(titulo) == t:
                    return True
            lista = _en(n.get('lista'), idioma)
            for fila in (lista[1] if lista else []):
                if _llano(fila[1]) == t:
                    return True
    return False


def frase(clave, idioma=POR_OMISION, **huecos):
    """Un mensaje de fuera del guion, en su idioma.

    Cae al espanol si falta la traduccion: media conversacion en un idioma es
    peor que toda en el otro, y quedarse MUDO es peor que las dos.
    """
    t = FRASES.get(clave) or {}
    texto = t.get(idioma) or t.get(POR_OMISION) or ''
    return texto.format(**huecos) if huecos else texto


def moneda_de(pais, idioma=POR_OMISION):
    """Como se llama la plata donde vive esa persona.

    Sin pais reconocido devuelve la frase general, que sigue siendo cierta —
    nunca se inventa una moneda ni se deja el hueco crudo.
    """
    t = _llano(pais or '')
    tabla = MONEDAS_EN if idioma == 'en' else MONEDAS
    for nombre_pais, moneda in tabla.items():
        if _llano(nombre_pais) in t:
            return moneda
    return MONEDA_GENERAL.get(idioma, MONEDA_GENERAL['es'])


def nodo(nombre, idioma=POR_OMISION, quien='', pais=''):
    """El nodo, en su idioma y con el nombre de la persona ya puesto.

    `quien` es como se llama quien esta del otro lado. Si no lo sabemos, los
    huecos `{nombre}` no se dejan crudos ni se rellenan con «amigo»: se quita
    el hueco y la frase se cierra sola. Un «Mucho gusto, {nombre}» en pantalla
    es peor que no saludar, y un «Mucho gusto, amigo» suena a promocion.
    """
    n = NODOS.get(nombre)
    if not n:
        return None
    texto = _en(n.get('texto'), idioma) or ''
    if '{moneda}' in texto:
        texto = texto.replace('{moneda}', moneda_de(pais, idioma))
    if '{nombre}' in texto:
        texto = (texto.replace('{nombre}', quien) if quien
                 else _sin_nombre(texto))
    return {'texto': texto,
            'botones': _en(n.get('botones'), idioma),
            'lista': _en(n.get('lista'), idioma),
            'espera': n.get('espera')}


# Cuando no hay nombre, el hueco no se deja crudo ni se rellena con «amigo»:
# se quita, y la frase se cierra sola. «Mucho gusto, {nombre}» en pantalla es
# peor que no saludar, y «Mucho gusto, amigo» suena a promocion de cable.
#
# Son dos casos y hay que tratarlos distinto, porque la puntuacion cae de
# lados opuestos:
#
#   «Mucho gusto, {nombre}.»        el hueco cierra  -> se va la coma de ANTES
#   «{nombre}, ¿qué te trajo?»      el hueco abre    -> se va la coma de DESPUES
#                                                       y la frase se capitaliza
_ABRE = re.compile(r'^\{nombre\}\s*,\s*', re.M)
_CIERRA = re.compile(r'\s*[,;:]?\s*\{nombre\}')


def _sin_nombre(texto):
    def _mayus(m):
        resto = texto[m.end():m.end() + 1]
        return ''
    t = _ABRE.sub('', texto)
    t = _CIERRA.sub('', t)
    # La linea que empezaba con «{nombre}, ¿qué...» ahora empieza en minuscula.
    salida = []
    for linea in t.split('\n'):
        cabeza = re.match(r'^([¿¡«"]*)([a-záéíóúñ])', linea)
        salida.append(linea[:cabeza.end() - 1] + cabeza.group(2).upper()
                      + linea[cabeza.end():] if cabeza else linea)
    return '\n'.join(salida)


# A donde va la persona en cuanto elige idioma. NO al inicio: al nombre. La
# informacion viene despues de saber con quien se esta hablando.
TRAS_ELEGIR_IDIOMA = 'nombre'

# Los botones del oficio no llevan a un nodo: son la RESPUESTA a la pregunta.
# Dos se guardan tal cual y el tercero abre el texto libre.
OFICIOS = {
    'of:negocio': {'es': 'tengo un negocio', 'en': 'I have a business'},
    'of:asalariado': {'es': 'trabajo asalariado', 'en': 'employed'},
    'of:independiente': {'es': 'trabajo por mi cuenta', 'en': 'self-employed'},
    'of:remesas': {'es': 'recibo remesas', 'en': 'receives remittances'},
    'of:agro': {'es': 'trabajo en el campo', 'en': 'works in farming'},
    'of:estudiante': {'es': 'estudio', 'en': 'studies'},
}


def oficio_de_toque(id_boton, idioma=POR_OMISION):
    """Lo que dijo al tocar un boton del oficio.

    Devuelve `(oficio, pide_mas)`. `pide_mas` en cierto es «Otro»: no se
    guarda nada todavia porque «otro» no es un oficio — es alguien pidiendo
    escribir.
    """
    s = str(id_boton or '')
    if s == 'of:otro':
        return None, True
    quien = OFICIOS.get(s)
    return (_en(quien, idioma) if quien else None), False


def idioma_de_toque(id_boton):
    """«lang:en» -> «en». `None` si ese boton no elige idioma.

    Los dos botones de la puerta no llevan a un nodo: cambian el idioma y
    despues siguen. Por eso no estan en NODOS y `por_toque` los ignora — se
    resuelven aqui.
    """
    s = str(id_boton or '')
    if s.startswith('lang:'):
        cual = s[5:]
        if cual in IDIOMAS:
            return cual
    return None


# Como se escribe «español» y «english» cuando NO se toca el boton. Un teclado
# sin tildes, un «esp», un «ingles» dicho en espanol: todo eso es la misma
# persona contestando la misma pregunta.
_IDIOMA_ESCRITO = {
    'es': ('espanol', 'español', 'castellano', 'es', 'esp', 'spanish',
           'en espanol', 'en español'),
    'en': ('english', 'en', 'ingles', 'inglés', 'eng', 'in english'),
}


def idioma_de_texto(dicho):
    """El idioma que alguien ESCRIBIO en la puerta. `None` si no dijo ninguno.

    ── POR QUE HACE FALTA ───────────────────────────────────────────────────

    La puerta se contestaba SOLO tocando el boton. Quien escribia «español» en
    vez de tocarlo no elegia nada, y el guardia que impide repetir la puerta
    se tragaba ese mensaje y todos los siguientes: la persona quedaba muda
    para siempre, sin un error en ningun lado.

    Y no es un caso raro. Los botones se pierden al hacer scroll, en el correo
    no existen, y mucha gente contesta escribiendo por costumbre.

    Se mira solo cuando la persona TODAVIA no tiene idioma, asi que puede ser
    generoso sin miedo: aqui «en» solo puede querer decir «English».
    """
    s = (dicho or '').strip().lower().strip('.!¡¿?,;:"\'()')
    if not s or len(s) > 24:
        return None                 # una frase larga no es una respuesta de dos
    for cual, formas in _IDIOMA_ESCRITO.items():
        if s in formas:
            return cual
    return None


def por_toque(id_boton):

    """El nodo al que lleva un boton tocado.

    `id_boton` es lo que WhatsApp devuelve en `metadata.interactiveId`: el
    `payload` que se mando. Se comprueba que exista antes de usarlo — un
    identificador que no esta en el guion es un mensaje de otra epoca, de una
    version anterior del menu, y no puede llevar a ninguna parte.
    """
    return NODOS.get(id_boton) and id_boton or None


def por_texto(dicho, desde=None, idioma=None):
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

    # Se comparan los botones de LOS DOS idiomas, no solo el elegido: alguien
    # que puso «English» y despues transcribe «Volver» —porque asi lo vio en
    # una captura, o porque cambio de idea— tiene que llegar igual. Encerrar a
    # una persona por el idioma que toco una vez es la peor forma de guiar.
    n = NODOS.get(desde or '')
    for lengua in IDIOMAS:
        for titulo, destino in (_en((n or {}).get('botones'), lengua) or []):
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


def como_texto(nombre, idioma=POR_OMISION, quien='', pais=''):
    """El nodo escrito para un canal SIN botones — el chat de la casa.

    Las opciones van como una linea al final, en la voz de AU-RA y no como una
    lista numerada: en el chat la persona escribe, y escribir «la billetera» es
    tan facil como tocar un boton que no existe.
    """
    n = nodo(nombre, idioma, quien, pais)
    if not n:
        return None
    if not n.get('botones'):
        return n['texto']
    opciones = ' · '.join(t for t, _ in n['botones'])
    return f"{n['texto']}\n\n{opciones}"
