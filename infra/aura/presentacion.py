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


def para(quien):
    """El mensaje de esa persona. `None` si no está en el escalafón."""
    tramos = escalafon.tramos_de(quien)
    if not tramos:
        return None
    nombre = escalafon.nombre_de(quien)
    solos, firma = _lo_que_puede(tramos)
    ciego = _lo_que_no_veo(tramos)

    t = [f'Hola{" " + nombre if nombre else ""} 👋',
         '',
         'Soy AU-RA, la inteligencia de Orden Global. Desde hoy trabajo '
         'también para adentro, con vos.',
         '',
         f'*Lo tuyo es {escalafon.como_se_dicen(tramos)}.*',
         # Una línea por tramo, no solo la del principal: a Melany, que lleva
         # tres, decirle solo lo de legal le esconde dos tercios de lo que
         # AU-RA hace por ella.
         '\n'.join(LOQUELEHAGO[t] for t in tramos if t in LOQUELEHAGO),
         '',
         '━━━━━━━━━━━━━━━',
         '',
         '*1 · Escribime la palabra ENCARGOS*',
         'Te abro la lista de lo que podés pedirme. Estos salen al momento:',
         '\n'.join(solos)]

    if firma:
        t += ['',
              'Y estos los tiene que firmar un admin antes de hacerse '
              '(José o Medardo):',
              '\n'.join(firma),
              '',
              'No es desconfianza: nadie ejecuta nada solo, ni ellos. '
              'José tampoco puede firmarse lo suyo.']

    t += ['',
          '*2 · Contame lo que van a hacer*',
          'En esa misma lista está «Anotar lo que vamos a hacer». Lo que '
          'anotes queda como memoria de tu área y me lo aprendo: la próxima '
          'vez que alguien de lo tuyo me escriba, ya lo tengo presente.',
          '',
          'Ahí es donde te voy a servir de verdad. Hoy sé de Orden Global lo '
          'que me enseñaron; de tu área sé lo que vos me cuentes.',
          '',
          '*3 · Tu parte, todos los días*',
          'A las 7:30 y a las 19:30 te llega el tuyo — solo lo de tu área, '
          'no el de todos. Si lo querés antes, pedime «El parte del día».']

    if ciego:
        t += ['',
              '━━━━━━━━━━━━━━━',
              '',
              '*Lo que todavía NO veo, para que no te confíes:*',
              '\n'.join('• ' + c for c in ciego),
              '',
              'Te lo digo ahora y te lo repito en cada parte. Si un día digo '
              '«todo en orden», tiene que significar que lo miré — no que no '
              'lo estaba mirando.']

    t += ['',
          '━━━━━━━━━━━━━━━',
          '',
          'Escribime AYUDA cuando quieras y te repito todo esto.',
          'Y preguntame lo que sea: de Orden Global o de lo que estés '
          'haciendo. Para eso estoy.']
    return '\n'.join(t)


def para_todos():
    """`[(telefono, mensaje, nombre)]` — uno por persona con teléfono."""
    fuera = []
    for persona in escalafon.GENTE:
        donde = escalafon.telefono_de(persona)
        if not donde:
            continue        # a quien solo tiene correo no se le manda por aqui
        texto = para(persona)
        if texto:
            fuera.append((donde, texto, escalafon.nombre_de(persona)))
    return fuera
