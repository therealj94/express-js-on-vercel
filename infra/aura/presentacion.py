# Lo que AU-RA le dice a cada uno el primer dia, y cada vez que escriba «ayuda».
#
# ── POR QUE ESTO ES UN ARCHIVO Y NO UN MENSAJE QUE ALGUIEN ESCRIBE A MANO ──
#
# Porque se va a mandar seis veces hoy y otras tantas cada vez que entre
# alguien, y porque tiene que decir LO MISMO siempre. Una herramienta que cada
# quien entiende distinto no es una herramienta: son seis herramientas.
#
# ── LAS TRES COSAS QUE TIENE QUE DEJAR CLARAS ──────────────────────────────
#
#   1. QUE PUEDE PEDIRLE, con las palabras exactas. «Escribí encargos» es una
#      instruccion; «podés consultarme cosas» no es nada.
#   2. QUE NECESITA FIRMA Y QUE NO. Si alguien descubre el limite chocandose,
#      lo lee como un fallo. Dicho antes, es una regla.
#   3. QUE TODAVIA NO VE. Es lo que menos se escribe y lo que mas vale: sin
#      eso, «todo en orden» se lee como «todo esta vigilado».
#
# ── Y EL TONO ──────────────────────────────────────────────────────────────
#
# Corto. Se lee de pie, en un telefono, entre dos cosas. Nada de «me complace
# presentarme»: lo primero que se ve tiene que ser lo que puede hacer hoy.
#
# ── Y ESCRITO COMO LO ENTIENDE WHATSAPP, NO COMO MARKDOWN ──────────────────
#
# WhatsApp negrita con *un* asterisco, cursiva con _guion bajo_ y monoespacio
# con tres comillas invertidas. `**esto**` y `esto` de Markdown NO se
# convierten: salen con los simbolos a la vista, y un mensaje de bienvenida
# lleno de asteriscos sueltos es lo primero que hace que algo parezca a medio
# hacer. Hay una prueba que lo vigila.

import os

import escalafon
import catalogo
import miradas

PALABRAS = ('ayuda', 'que podes hacer', 'qué podés hacer', 'que puedes hacer',
            'qué puedes hacer', 'como funciona', 'cómo funciona', 'instrucciones')

# Que le resuelve AU-RA a cada area, en una linea. Lo primero que lee, y por
# eso no es un saludo: es lo que se lleva si deja de leer en el renglon dos.
LOQUELEHAGO = {
    'admin': 'Te tengo el estado de todo y te aviso lo que necesita tu firma.',
    'tecnologico': ('Te tengo la cadena y el nodo mirados, y podés desplegar '
                    'o reiniciar desde acá.'),
    'legal': 'Te tengo el registro y el estado de Meta al día.',
    'mercadeo': 'Te tengo la cuenta de la gente que llega y qué hizo.',
    'contable': 'Te tengo la billetera y los premios leídos de la cadena.',
    'operacion': 'Te ayudo con lo del día a día.',
}


def le_abre(dicho):
    return (dicho or '').strip().strip('.!¡¿?').lower() in PALABRAS


def _lo_que_puede(tramos):
    """Sus encargos, separados por los que salen solos y los que no.

    Separados y no mezclados con una etiqueta: leyendo dos listas se entiende
    la regla de una vez; leyendo una lista con marcas hay que ir mirando
    cual tiene cual.
    """
    solos, firma = [], []
    for clave, ficha in catalogo.para(tramos):
        (firma if catalogo.necesita_permiso(clave) else solos).append(
            f'• {ficha["titulo"]}')
    return solos, firma


def _lo_que_no_veo(tramos):
    ciego = []
    for t in tramos:
        for x in miradas.CIEGO.get(t, ()):
            if x not in ciego:
                ciego.append(x)
    return ciego


def _algo_de_verdad(tramos, registro=None, premio=None, datos=None):
    """Dos o tres cosas REALES, miradas en el momento de escribir el mensaje.

    Es la pieza que hace que esto no sea otro mensaje de bienvenida. «Puedo
    darte el estado de la cadena» es una promesa; «la cadena va en el bloque
    52.518» ya es el trabajo hecho, y se comprueba en ordenscan.com.

    Si una fuente no contesta NO se inventa nada y no se pone: un mensaje de
    presentación que abre con un dato falso arruina justo lo que venía a
    demostrar. Se cae al resto del mensaje, que ya vale por sí solo.
    """
    d = miradas.para(list(tramos), registro=registro, premio=premio,
                     clave_wa=os.environ.get('ZERNIO_CLAVE', ''),
                     cuenta_wa=os.environ.get('ZERNIO_CUENTA', ''))
    # Lo que se enseña primero es lo que NECESITA a alguien: es lo que más
    # impresiona y lo más útil a la vez. Después, cómo va todo.
    vivo = list(d['pendientes'])[:2] + list(d['lineas'])[:3]
    return vivo[:4]


def para(quien, registro=None, premio=None):
    """El mensaje de esa persona. `None` si no está en el escalafón.

    ── POR QUE EMPIEZA MOSTRANDO Y NO EXPLICANDO ─────────────────────────

    La primera version explicaba: «soy AU-RA, hago esto y aquello». Se lee
    una vez, se entiende, y no pasa nada — porque contar lo que uno hace no
    convence a nadie que ya recibio veinte mensajes de bienvenida este año.

    Esta empieza con UN DATO DE VERDAD, sacado de la maquina en el momento de
    escribir el mensaje: el bloque en el que va la cadena, cuantos premios
    quedan, cuanta gente llego. No es un ejemplo: es lo que hay AHORA MISMO,
    y quien lo lee lo puede comprobar.

    Esa es toda la diferencia. «Puedo darte el estado de la cadena» es una
    promesa; «la cadena va en el bloque 52.518, mirá» ya es el trabajo hecho.
    """
    tramos = escalafon.tramos_de(quien)
    if not tramos:
        return None
    nombre = escalafon.nombre_de(quien)
    solos, firma = _lo_que_puede(tramos)
    ciego = _lo_que_no_veo(tramos)

    t = [f'{nombre or "Hola"} 👋',
         '',
         'Soy AU-RA. Ya me conocés de afuera — soy la que atiende a la gente '
         'que le escribe a Orden Global.',
         '',
         '*Desde hoy también trabajo para adentro. Con vos.*',
         '',
         'Y en vez de contarte lo que puedo hacer, mejor te lo muestro. Esto '
         'lo acabo de mirar, ahora, para escribirte:']

    try:
        vivo = _algo_de_verdad(tramos, registro, premio)
    except Exception:
        vivo = []   # ver `_algo_de_verdad`: no se inventa nada
    if vivo:
        t += ['', '\n'.join('▸ ' + v for v in vivo)]
    t += ['',
          'Eso no es un ejemplo. Es lo que hay en este momento, y lo podés '
          'comprobar vos.',
          '',
          '━━━━━━━━━━━━━━━',
          '',
          f'*Lo tuyo es {escalafon.como_se_dicen(tramos)}.*',
          '\n'.join(LOQUELEHAGO[x] for x in tramos if x in LOQUELEHAGO),
          '',
          '*Escribime la palabra ENCARGOS* y te abro tu lista. Estos salen al '
          'momento, sin pedirle permiso a nadie:',
          '\n'.join(solos)]

    if firma:
        t += ['',
              'Y estos los hago cuando los firme el otro admin '
              '(José o Medardo):',
              '\n'.join(firma),
              '',
              'Nadie ejecuta nada solo, ni ellos: José no puede firmarse lo '
              'suyo ni desde su otro correo. Está probado.']

    t += ['',
          '━━━━━━━━━━━━━━━',
          '',
          '*Y acá es donde te vas a sorprender.*',
          '',
          'Contame lo que van a hacer y lo que les sale. En tu lista está '
          '«Anotar lo que vamos a hacer».',
          '',
          'Lo que anotes se queda como memoria de TU área. La próxima vez que '
          'alguien de lo tuyo me escriba, ya lo sé. No hay que repetirlo, no '
          'hay que buscarlo en un chat de hace tres semanas: lo tengo.',
          '',
          'Hoy sé de Orden Global lo que me enseñaron. De tu área voy a saber '
          'lo que vos me cuentes — y en un mes voy a saber más de tu trabajo '
          'que cualquier herramienta que hayas usado, porque me lo vas a '
          'haber enseñado vos.',
          '',
          '━━━━━━━━━━━━━━━',
          '',
          '*Tu parte, dos veces al día*',
          'A las 7:30 y a las 19:30. Solo lo tuyo, no el de todos. Arriba te '
          'digo cuántas cosas te necesitan, para que sepas en un segundo si '
          'hay que hacer algo hoy.']

    if ciego:
        t += ['',
              '*Y lo que todavía NO veo, para que no te confíes:*',
              '\n'.join('• ' + c for c in ciego),
              '',
              'Te lo digo ahora y te lo repito en cada parte. Si un día te '
              'digo «todo en orden», tiene que significar que lo miré — no '
              'que no lo estaba mirando. Prefiero decirte lo que no sé.']

    t += ['',
          '━━━━━━━━━━━━━━━',
          '',
          'Escribime *AYUDA* y te repito todo esto cuando quieras.',
          '',
          'Y preguntame lo que sea. De Orden Global, de tu trabajo, o de lo '
          'que se te ocurra — también estoy para eso. 🌎']
    return '\n'.join(t)


def para_todos(registro=None, premio=None):
    """`[(telefono, mensaje, nombre)]` — uno por persona con teléfono."""
    fuera = []
    for persona in escalafon.GENTE:
        donde = escalafon.telefono_de(persona)
        if not donde:
            continue        # a quien solo tiene correo no se le manda por aqui
        texto = para(persona, registro, premio)
        if texto:
            fuera.append((donde, texto, escalafon.nombre_de(persona)))
    return fuera
