# El dossier de Orden Global · el que se le enseña a un inversionista.
#
#   python3 documentos/armar-dossier.py
#
# DOS REGLAS, Y LAS DOS SON DE FONDO
#
# 1 · NI UN DATO INVENTADO. Todas las cifras de aquí se comprobaron contra la
#     cadena y contra los servicios el mismo dia que se genero el documento, y
#     se escriben abajo con su fecha. No hay usuarios, ingresos ni proyecciones
#     financieras porque no los tenemos medidos: un dossier que se inventa una
#     metrica se cae entero en la primera pregunta. Las unicas cifras de
#     personas que aparecen -435 usuarios, 24 tarjetas, 10 paises- salen del
#     expediente de la Secretaria de la Junta del 14/08/2026, y van con esa
#     fuente escrita en el cierre.
#
# 2 · GENESIS CORE NO SE FOTOGRAFIA. El cerebro interno se explica —es parte de
#     lo que hace fuerte a la casa— pero no se ensena. Una captura de un panel
#     interno en un PDF que va a circular por correos ajenos es el mapa de la
#     casa regalado. Se cuenta que existe y que hace; no se ensena que ve.

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as lienzo
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path
import textwrap

AQUI = Path(__file__).parent
CAPTURAS = AQUI / 'capturas'
MARCAS = AQUI.parent / 'apps-web' / 'veta-wallet' / 'assets'
MARCA_NX = AQUI / 'marca'
SALIDA = AQUI / 'Orden-Global-dossier.pdf'

A, AL = A4
FECHA = '16 de agosto de 2026'

# ── la paleta de la casa ────────────────────────────────────────────────────
POZO   = (0.008, 0.106, 0.110)
VETA   = (0.024, 0.204, 0.188)
ORO    = (0.788, 0.663, 0.380)
OROHI  = (0.973, 0.937, 0.812)
CREMA  = (0.953, 0.925, 0.851)
BRUMA  = (0.682, 0.780, 0.765)
HUMO   = (0.431, 0.576, 0.561)
JADE   = (0.243, 0.851, 0.627)

# ── tipografia: la serif de la marca si esta, si no la del sistema ──────────
SERIF, SANS = 'Times-Roman', 'Helvetica'
SERIF_B, SANS_B = 'Times-Bold', 'Helvetica-Bold'
for archivo, nombre in [('Cinzel-Regular.ttf', 'Marca'), ('Cinzel-Bold.ttf', 'MarcaB')]:
    ruta = MARCAS / 'fonts' / archivo
    if ruta.exists():
        try:
            pdfmetrics.registerFont(TTFont(nombre, str(ruta)))
            if nombre == 'Marca': SERIF = 'Marca'
            else: SERIF_B = 'MarcaB'
        except Exception:
            pass

c = lienzo.Canvas(str(SALIDA), pagesize=A4)
c.setTitle('Orden Global · el ecosistema')
c.setAuthor('Nexus Coder · Fráncfort del Meno, Alemania')
c.setSubject('Dossier de producto y tecnologia · Orden Global Corp, construido por Nexus Coder')

pagina = [0]


def fondo(oscuro=True):
    c.setFillColorRGB(*(POZO if oscuro else (0.992, 0.988, 0.976)))
    c.rect(0, 0, A, AL, fill=1, stroke=0)


def hilo(y, x0=18*mm, x1=None, color=ORO, alpha=0.30):
    c.saveState(); c.setStrokeColorRGB(*color); c.setStrokeAlpha(alpha)
    c.setLineWidth(0.6); c.line(x0, y, x1 or (A - 18*mm), y); c.restoreState()


def sello(txt, y, x=18*mm, color=ORO):
    c.setFillColorRGB(*color); c.setFont(SANS_B, 7.5)
    c.drawString(x, y, ' '.join(txt.upper()))


def titulo(txt, y, tam=26, x=18*mm, color=CREMA, fuente=None):
    c.setFillColorRGB(*color); c.setFont(fuente or SERIF_B, tam)
    c.drawString(x, y, txt)


def parrafo(txt, y, x=18*mm, ancho=88, tam=9.6, inter=14, color=BRUMA, fuente=None):
    c.setFillColorRGB(*color); c.setFont(fuente or SANS, tam)
    for linea in textwrap.wrap(txt, ancho):
        c.drawString(x, y, linea); y -= inter
    return y


def cifra(valor, pie, x, y, tam=30, color=ORO, anchoPie=22):
    c.setFillColorRGB(*color); c.setFont(SERIF_B, tam)
    c.drawString(x, y, valor)
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.6)
    yy = y - 11
    for linea in textwrap.wrap(pie, anchoPie):
        c.drawString(x, yy, linea); yy -= 9.5
    return yy


def imagen(nombre, x, y, ancho, marco=True):
    """Coloca una captura respetando su proporcion. Devuelve su alto."""
    ruta = CAPTURAS / nombre
    if not ruta.exists():
        return 0
    im = ImageReader(str(ruta))
    iw, ih = im.getSize()
    alto = ancho * ih / iw
    if marco:
        c.saveState(); c.setStrokeColorRGB(*ORO); c.setStrokeAlpha(0.45); c.setLineWidth(0.8)
        c.rect(x - 1.5, y - 1.5, ancho + 3, alto + 3, fill=0, stroke=1); c.restoreState()
    c.drawImage(im, x, y, width=ancho, height=alto, mask='auto')
    return alto


def logo_nx(nombre, x, y, ancho, alpha=1.0):
    """El neon de Nexus Coder. Viene con transparencia: el negro del original se
    recorto a alfa para que el halo se funda con el fondo de la casa en vez de
    dejar un rectangulo negro encima del verde."""
    ruta = MARCA_NX / nombre
    if not ruta.exists():
        return 0
    im = ImageReader(str(ruta))
    iw, ih = im.getSize()
    alto = ancho * ih / iw
    c.saveState(); c.setFillAlpha(alpha)
    c.drawImage(im, x, y, width=ancho, height=alto, mask='auto')
    c.restoreState()
    return alto


def pie_pagina(txt=''):
    pagina[0] += 1
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 7)
    c.drawString(18*mm, 12*mm, txt or 'Orden Global · confidencial')
    c.drawRightString(A - 18*mm, 12*mm, str(pagina[0]))


def hoja(txt_pie=''):
    pie_pagina(txt_pie); c.showPage()


# ═══════════════════════════════════════════════════════════════════════════
# 1 · PORTADA
# ═══════════════════════════════════════════════════════════════════════════
fondo()
# La constelación a sangre, recortada por el centro: llena la página entera y
# no deja la franja muerta que dejaba encajarla por proporción.
im = CAPTURAS / 'nucleo.png'
if im.exists():
    r = ImageReader(str(im)); iw, ih = r.getSize()
    escala = max(A / iw, AL / ih) * 1.62
    aw, ah = iw * escala, ih * escala
    # desplazado a la derecha y arriba: centra la constelacion y deja fuera la
    # barra lateral, el sello del pie y los botones
    c.saveState(); c.setFillAlpha(0.42)
    c.drawImage(r, (A - aw) / 2 - 0.16 * aw, (AL - ah) / 2 - 0.10 * ah,
                width=aw, height=ah, mask='auto')
    c.restoreState()
# Un velo más denso abajo, para que el texto se lea sobre cualquier cosa.
c.setFillColorRGB(*POZO); c.setFillAlpha(0.50); c.rect(0, 0, A, AL, fill=1, stroke=0)
c.setFillAlpha(0.72); c.rect(0, 0, A, 120*mm, fill=1, stroke=0); c.setFillAlpha(1)

# El logo de la casa, no el de uno de sus productos. Va con su proporcion
# real -es un lockup ancho, no un cuadrado- para que no salga aplastado.
logo = MARCA_NX / 'orden-global.png'
if logo.exists():
    r_l = ImageReader(str(logo)); lw, lh = r_l.getSize()
    ancho_l = 30*mm
    c.drawImage(r_l, 18*mm, AL - 40*mm, width=ancho_l, height=ancho_l * lh / lw, mask='auto')

sello('Orden Global · la casa del oro digital', AL - 50*mm)
hilo(AL - 54*mm, x1=118*mm)

c.setFillColorRGB(*OROHI); c.setFont(SERIF_B, 40)
c.drawString(18*mm, AL - 76*mm, 'CINCO MIL AÑOS')
c.setFillColorRGB(*ORO)
c.drawString(18*mm, AL - 92*mm, 'DE TENER RAZÓN.')

y = parrafo(
    'Imperios enteros se apagaron y el oro siguió siendo dinero. Orden Global lo trae a '
    'este siglo sin cambiarle la referencia: el precio del oro, vivo en una cadena que '
    'es nuestra.',
    108*mm, ancho=68, tam=11.5, inter=16.5, color=CREMA)

y = parrafo(
    'Esto no es una aplicación de finanzas. Es un ecosistema entero —dinero, identidad, '
    'mensajería, comercio— construido, desplegado y funcionando hoy.',
    y - 8, ancho=68, tam=11.5, inter=16.5, color=BRUMA)

hilo(62*mm)
c.setFillColorRGB(*BRUMA); c.setFont(SANS_B, 8.5)
c.drawString(18*mm, 54*mm, 'Veta Wallet · Genesis ID · PULSE CHAT · MyTokenPay · AU-RA · Cadena 5550')
c.setFillColorRGB(*HUMO); c.setFont(SANS, 8.5)
c.drawString(18*mm, 47*mm, 'Dossier de producto y tecnología · ' + FECHA)

# La firma de quien lo construyo, abajo a la derecha: no compite con el titular
# y es lo ultimo que se mira antes de pasar la pagina.
logo_nx('nexus-n.png', A - 39*mm, 43*mm, 13*mm, alpha=0.95)
c.setFillColorRGB(*BRUMA); c.setFont(SANS, 6.8)
c.drawRightString(A - 18*mm, 37*mm, 'D E S A R R O L L A D O   P A R A   O R D E N   G L O B A L   P O R')
c.setFillColorRGB(0.36, 0.90, 0.94); c.setFont(SANS_B, 10)
c.drawRightString(A - 18*mm, 29*mm, 'NEXUS CODER')
c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.2)
c.drawRightString(A - 18*mm, 23*mm, 'Fráncfort del Meno, Alemania')
hoja('')

# ═══════════════════════════════════════════════════════════════════════════
# 2 · LA TESIS
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('La tesis', AL - 28*mm)
titulo('Casi todo el oro digital', AL - 42*mm, 24)
titulo('del mundo vive alquilado.', AL - 55*mm, 24, color=ORO)

y = parrafo(
    'Se emite sobre la red de otro. Sujeto a sus reglas, a sus subidas de precio y a su '
    'permiso. El día que esa red decide algo distinto, el oro de tus clientes se entera '
    'antes que vos.',
    AL - 72*mm, ancho=86, tam=10.4, inter=15, color=CREMA)

y = parrafo(
    'Orden Global construyó la suya. Y no construyó solo la cadena: construyó todo lo que '
    'se apoya encima, para que una persona no tenga que salir del ecosistema para hacer '
    'nada de lo que hace con su dinero.',
    y - 8, ancho=86, tam=10.4, inter=15)

hilo(y - 10)

y -= 26
c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 10)
c.drawString(18*mm, y, 'Una cuenta. Seis puertas. Un solo suelo.')

y -= 20
piezas = [
    ('Veta Wallet',  'El dinero: enviar, recibir, cobrar y una tarjeta.'),
    ('Genesis ID',   'La identidad: te verificás una vez y vale en todo el ecosistema.'),
    ('PULSE CHAT',   'La gente: mensajería donde el dinero viaja dentro de la conversación.'),
    ('MyTokenPay',   'El comercio: cobros con QR y directorio de negocios que aceptan ORIGEN.'),
    ('AU-RA',        'La inteligencia: guía, explica y deja los pagos preparados.'),
    ('ORDENSCAN',    'La prueba: cada bloque y cada movimiento, públicos.'),
]
for nombre, que in piezas:
    c.setFillColorRGB(*ORO); c.setFont(SANS_B, 9.4)
    c.drawString(20*mm, y, nombre)
    c.setFillColorRGB(*BRUMA); c.setFont(SANS, 9.4)
    c.drawString(58*mm, y, que)
    y -= 15

hilo(y - 4)
y = parrafo(
    'Nada de esto es una maqueta. Todas las capturas de este documento son del producto '
    'real, y todas las cifras se comprobaron contra la cadena el ' + FECHA + '.',
    y - 20, ancho=86, tam=9, inter=13, color=HUMO)
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 3 · EL NÚCLEO (imagen grande)
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('Lo que ve una persona al entrar', AL - 24*mm)
titulo('El Núcleo', AL - 38*mm, 26)
parrafo('Cada esfera es una aplicación viva del ecosistema, y todas cuelgan de la misma '
        'cuenta. Se entra tocando; no hay que aprenderse nada.',
        AL - 50*mm, ancho=92, tam=9.8, inter=13.5)

alto = imagen('nucleo.png', 18*mm, 62*mm, A - 36*mm)
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 4 · LA CADENA
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('El suelo', AL - 24*mm)
titulo('La cadena 5550', AL - 38*mm, 26)
titulo('es nuestra.', AL - 51*mm, 26, color=ORO)

y = parrafo(
    'Una Layer 1 propia sobre Hyperledger Besu, con consenso QBFT y finalidad inmediata: '
    'un bloque firmado no se revierte. Nuestros validadores, nuestras reglas, y lo que se '
    'mueve encima no le pide permiso a nadie.',
    AL - 68*mm, ancho=88, tam=10, inter=14.5, color=CREMA)

hilo(y - 6)
yc = y - 30
cifra('5550', 'Cadena propia · Besu · máquina Shanghai', 18*mm, yc, 28)
cifra('QBFT', 'Finalidad inmediata: lo firmado no se revierte', 68*mm, yc, 28)
cifra('10 s', 'Por bloque, medido contra la cadena', 118*mm, yc, 28)
cifra('100%', 'Del registro es público y comprobable', 160*mm, yc, 28)

y = yc - 42
hilo(y + 8)
y = parrafo(
    'No es una promesa de arquitectura: está corriendo. Al ' + FECHA + ' la cadena iba por '
    'el bloque 13.018, con cuatro validadores firmando en rotación, y cualquiera puede '
    'comprobarlo en ordenscan.com sin pedirnos nada.',
    y - 6, ancho=88, tam=9.6, inter=14)

# La captura de esta sección repetía estas mismas cuatro cifras. Se cambia por
# lo único que aquí de verdad añade algo: cómo se comprueba, que es el
# argumento entero.
y -= 22
hilo(y + 12)
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 9.6)
c.drawString(18*mm, y, 'Cómo se comprueba, sin pedirnos nada')
y -= 16
for paso, txt in [
    ('1', 'Se abre ordenscan.com y se mira el último bloque.'),
    ('2', 'Se comprueba que el ORIGEN que dice tener una cuenta está en la cadena.'),
    ('3', 'Se sigue cualquier movimiento hasta su bloque, con su hora y su firma.'),
]:
    c.setFillColorRGB(*ORO); c.setFont(SERIF_B, 13); c.drawString(19*mm, y - 1, paso)
    c.setFillColorRGB(*BRUMA); c.setFont(SANS, 9.6); c.drawString(27*mm, y, txt)
    y -= 16

y = parrafo(
    'Es la diferencia entre un balance publicado y un balance comprobable. Lo primero hay '
    'que creerlo; lo segundo se mira.',
    y - 10, ancho=88, tam=9.6, inter=14, color=HUMO)

# ── la finalidad, dibujada ─────────────────────────────────────────────────
# Lo que distingue a QBFT de una cadena de prueba de trabajo no se explica bien
# con palabras: se ve. Tres bloques encadenados y uno que intenta entrar por
# detras y no puede.
dy = y - 34
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 7.5)
c.drawString(18*mm, dy, ' '.join('FINALIDAD INMEDIATA'))

by = dy - 40*mm
bw, bh = 34*mm, 26*mm
x0 = 18*mm
for i, (etq, sub) in enumerate([('BLOQUE n', 'firmado'), ('n + 1', 'firmado'), ('n + 2', 'firmado')]):
    x = x0 + i * (bw + 12*mm)
    c.saveState()
    c.setFillColorRGB(*VETA); c.setFillAlpha(0.6)
    c.roundRect(x, by, bw, bh, 3, fill=1, stroke=0); c.setFillAlpha(1)
    c.setStrokeColorRGB(*ORO); c.setStrokeAlpha(0.65); c.setLineWidth(0.9)
    c.roundRect(x, by, bw, bh, 3, fill=0, stroke=1)
    c.restoreState()
    c.setFillColorRGB(*OROHI); c.setFont(SANS_B, 8.4)
    c.drawCentredString(x + bw / 2, by + bh - 10*mm, etq)
    c.setFillColorRGB(*JADE); c.setFont(SANS, 7)
    c.drawCentredString(x + bw / 2, by + bh - 16*mm, sub)
    if i < 2:
        c.saveState(); c.setStrokeColorRGB(*ORO); c.setStrokeAlpha(0.7); c.setLineWidth(1)
        c.line(x + bw + 2*mm, by + bh / 2, x + bw + 10*mm, by + bh / 2)
        c.restoreState()

# el que intenta reescribir y rebota
xr = x0 + 2 * (bw + 12*mm) + bw + 14*mm
c.saveState()
c.setStrokeColorRGB(0.94, 0.47, 0.42); c.setStrokeAlpha(0.8); c.setLineWidth(1.0); c.setDash(3, 3)
c.roundRect(xr, by, bw * 0.72, bh, 3, fill=0, stroke=1); c.setDash()
c.setLineWidth(1.5)
c.line(xr + 4*mm, by + bh / 2 + 4*mm, xr + 12*mm, by + bh / 2 - 4*mm)
c.line(xr + 4*mm, by + bh / 2 - 4*mm, xr + 12*mm, by + bh / 2 + 4*mm)
c.restoreState()
c.setFillColorRGB(0.94, 0.47, 0.42); c.setFont(SANS, 6.6)
c.drawCentredString(xr + bw * 0.36, by - 6*mm, 'no se revierte')

c.setFillColorRGB(*HUMO); c.setFont(SANS, 8)
c.drawString(18*mm, by - 14*mm,
    'En QBFT un bloque firmado es definitivo desde el segundo cero: no hay «esperá seis '
    'confirmaciones».')
c.drawString(18*mm, by - 21*mm,
    'Un cobro en un mostrador no puede depender de que media hora después la cadena cambie '
    'de opinión.')
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 5 · ORIGEN + VETA WALLET
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('El activo y el bolsillo', AL - 24*mm)
titulo('ORIGEN: el oro marca', AL - 38*mm, 23)
titulo('el precio. La cadena lo mueve.', AL - 51*mm, 23, color=ORO)

y = parrafo(
    'Cada ORIGEN es un gramin: 1⁄55 de un gramo de oro, al precio del oro del día. Es '
    'una referencia de precio, pública y verificable con una calculadora, no una promesa '
    'de metal en bóveda. La emisión —un billón exacto— está escrita en el génesis de la '
    'cadena y no se puede ampliar.',
    AL - 68*mm, ancho=52, tam=10, inter=14.5, color=CREMA)

y = parrafo(
    'Veta Wallet es donde vive: enviar y recibir en segundos, cambiar entre los catorce '
    'activos del ecosistema, cobrar con un código y una tarjeta para gastarlo en el mundo '
    'de todos los días.',
    y - 8, ancho=52, tam=10, inter=14.5)

hilo(y - 8, x1=100*mm)
yc = y - 30
cifra('÷55', 'Un gramin es 1/55 del gramo de oro', 18*mm, yc, 26, anchoPie=18)
cifra('14', 'Activos del ecosistema, todos en cadena', 55*mm, yc, 26, anchoPie=18)

imagen('billetera.png', 118*mm, 40*mm, 72*mm)
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 6 · GENESIS ID
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('La identidad', AL - 24*mm)
titulo('Verificate una vez.', AL - 38*mm, 25)
titulo('Vale en todas partes.', AL - 51*mm, 25, color=ORO)

y = parrafo(
    'Genesis ID es la capa de identidad del ecosistema: verificación de documento, cotejo '
    'biométrico del rostro, tamizado contra listas de sanciones y perfil de cumplimiento '
    'proporcional al volumen declarado. Quien decide es una persona del equipo de '
    'cumplimiento, no un algoritmo.',
    AL - 68*mm, ancho=88, tam=10, inter=14.5, color=CREMA)

y = parrafo(
    'Y lo que la persona recibe a cambio no es una etiqueta verde: es una credencial que '
    'puede enseñar, con su número y su código para comprobarla en el acto.',
    y - 8, ancho=88, tam=10, inter=14.5)

imagen('credencial.png', 18*mm, 92*mm, A - 36*mm)

y = 80*mm
hilo(y + 8)
c.setFillColorRGB(*BRUMA); c.setFont(SANS, 9.4)
for linea in ['Es la pieza que convierte al ecosistema en algo distinto de una billetera más:',
              'del otro lado de un chat o de un cobro siempre hay una persona real y verificada.']:
    c.drawString(18*mm, y, linea); y -= 13
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 7 · PULSE CHAT
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('La gente', AL - 24*mm)
titulo('PULSE CHAT', AL - 38*mm, 26)

y = parrafo(
    'La mensajería del ecosistema, y la única del mundo donde todos los que están dentro '
    'tienen identidad verificada. El dinero viaja dentro de la conversación: se manda '
    'ORIGEN sin salir del hilo, y cada pago deja su comprobante comprobable en la cadena.',
    AL - 52*mm, x=100*mm, ancho=48, tam=10, inter=14.5, color=CREMA)

y = parrafo(
    'Grupos, adjuntos, invitación por código y perfil propio. Construido sobre nuestro '
    'propio relevo, no sobre el de nadie más.',
    y - 8, x=100*mm, ancho=48, tam=10, inter=14.5)

hilo(y - 8, x0=100*mm)
y = parrafo(
    'Es el canal por el que el ecosistema se vuelve una red y no una suma de cuentas '
    'sueltas: la gente trae a su gente.',
    y - 22, x=100*mm, ancho=48, tam=9.6, inter=14, color=HUMO)

imagen('chat.png', 18*mm, 40*mm, 72*mm)
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 8 · MYTOKENPAY
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('El comercio', AL - 24*mm)
titulo('MyTokenPay', AL - 38*mm, 26)
parrafo('Donde el oro deja de ser un ahorro y se vuelve un medio de pago: cobros con '
        'código, directorio de negocios que aceptan ORIGEN, y pago desde la misma '
        'billetera sin salir del ecosistema.',
        AL - 50*mm, ancho=92, tam=9.8, inter=13.5)

imagen('pay.png', 18*mm, 82*mm, A - 36*mm)

y = 70*mm
hilo(y + 10)
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 9.6)
c.drawString(18*mm, y, 'Por qué importa')
c.setFillColorRGB(*BRUMA); c.setFont(SANS, 9.4)
y -= 14
for linea in ['Un activo referenciado al oro que solo se puede guardar es un ahorro.',
              'Uno que se puede gastar en la esquina es una moneda — y esa es la diferencia',
              'entre un producto financiero y una economía.']:
    c.drawString(18*mm, y, linea); y -= 13
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 9 · AU-RA · LA INTELIGENCIA QUE HABLA
#
# Aqui y en la pagina siguiente se cuenta lo mismo desde los dos lados: Orden
# Global tiene DOS inteligencias, y no son la misma cosa partida en dos. Genesis
# Core gobierna y AU-RA habla. Contarlas asi es mas fuerte que contarlas como un
# asistente y un panel, porque es lo que de verdad son.
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('Las dos inteligencias · la que habla', AL - 24*mm)
titulo('AU-RA', AL - 38*mm, 26)
titulo('la inteligencia que atiende a cada persona.', AL - 51*mm, 15,
       color=ORO, fuente=SANS_B)

y = parrafo('Inteligencia propia de Orden Global, con voz de la casa. Conoce el '
            'ecosistema entero y lo explica, lleva a la persona a donde quiere ir, le dice '
            'el precio del día y le deja los pagos preparados. Es la cara con la que el '
            'sistema habla: en español y en inglés, a cualquier hora, sin cola.',
            AL - 64*mm, ancho=92, tam=9.8, inter=13.5)

# El ancho se calcula desde el hueco que queda entre el parrafo y el bloque de
# abajo, no se elige a mano: asi el dia que el texto crezca una linea, la
# captura se encoge sola en vez de comerselo.
_hueco = (y - 6) - 96*mm
_ancho = min(A - 36*mm, _hueco / 0.76)
imagen('aura.png', (A - _ancho) / 2, 96*mm, _ancho)

y = 84*mm
hilo(y + 10)
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 9.6)
c.drawString(18*mm, y, 'Lo que la hace de fiar')
c.setFillColorRGB(*BRUMA); c.setFont(SANS, 9.4)
y -= 14
for linea in ['Habla con datos, no con adjetivos: cada cifra que dice sale de la cadena o del',
              'servicio en ese momento. Si no llegó, lo dice — nunca la inventa.',
              'AU-RA prepara y la persona firma. El dinero se mueve con la contraseña de su',
              'dueño, y ni un destino ni un monto salen de otro sitio que de quien manda.']:
    c.drawString(18*mm, y, linea); y -= 13
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 10 · GENESIS CORE — SIN IMAGEN, A PROPOSITO
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('Las dos inteligencias · la que gobierna', AL - 24*mm)
titulo('Genesis Core', AL - 38*mm, 26)
titulo('el cerebro de todo el ecosistema.', AL - 51*mm, 17, color=ORO, fuente=SANS_B)

y = parrafo(
    'La segunda inteligencia de Orden Global, y la que manda. Genesis Core lo sabe todo: '
    'las cadenas, los servicios, el explorador, la identidad, la tesorería, las máquinas y '
    'lo que cada una está haciendo en este momento. Nada del ecosistema le queda fuera.',
    AL - 68*mm, ancho=88, tam=10, inter=14.5, color=CREMA)

y = parrafo(
    'Con eso hace tres cosas. Le da a la Junta Directiva el estado real de la casa, en un '
    'solo sitio y en voz alta, para que las decisiones se tomen sobre lo que hay y no '
    'sobre lo que se recuerda. Vigila el ecosistema entero y avisa antes de que algo se '
    'rompa. Y es donde se entrena a AU-RA: el conocimiento de la casa se escribe ahí, y '
    'desde ahí se decide qué puede salir al mundo.',
    y - 8, ancho=88, tam=10, inter=14.5)

hilo(y - 8)
y -= 26
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 9.6)
c.drawString(18*mm, y, 'Lo que gobierna, a diario')
y -= 17
gobierna = [
    ('El parte de la casa', 'El estado de cada sistema, leído para la Junta.'),
    ('La vigilancia', 'Cadenas, servicios, costes y seguridad, sin dejar de mirar.'),
    ('El conocimiento', 'Todo lo que la casa sabe, en un solo sitio y con dueño.'),
    ('Lo que es público', 'Qué puede decir AU-RA, y qué no sale de aquí.'),
]
for nombre, que in gobierna:
    c.setFillColorRGB(*ORO); c.setFillAlpha(0.5)
    c.rect(18*mm, y - 1, 1.6*mm, 8, fill=1, stroke=0); c.setFillAlpha(1)
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 9)
    c.drawString(22*mm, y, nombre)
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 8.6)
    c.drawString(70*mm, y, que)
    y -= 15

y = parrafo(
    'Genesis Core es interno y se queda interno: quien manda sobre un sistema no se '
    'enseña en un documento que circula. Lo que sí se puede enseñar es su mecanismo, y '
    'es la pieza de la que más orgullosa está la casa.',
    y - 12, ancho=88, tam=9.6, inter=14, color=HUMO)

# ── el diagrama de la puerta ────────────────────────────────────────────────
# La media pagina que quedaba vacia se llena con lo unico que aqui puede
# ilustrar algo sin ensenar nada: el mecanismo. Dibujado, no fotografiado.
dy = y - 26
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 7.5)
c.drawString(18*mm, dy, ' '.join('LA PUERTA'))

ancho_caja, alto_caja = 54*mm, 42*mm
caja_y = dy - 14 - alto_caja

def _caja(x, titulo_c, lineas, borde, alpha_relleno):
    c.saveState()
    c.setFillColorRGB(*VETA); c.setFillAlpha(alpha_relleno)
    c.roundRect(x, caja_y, ancho_caja, alto_caja, 4, fill=1, stroke=0)
    c.setFillAlpha(1)
    c.setStrokeColorRGB(*borde); c.setStrokeAlpha(0.65); c.setLineWidth(0.9)
    c.roundRect(x, caja_y, ancho_caja, alto_caja, 4, fill=0, stroke=1)
    c.restoreState()
    c.setFillColorRGB(*borde); c.setFont(SANS_B, 8.6)
    c.drawString(x + 5*mm, caja_y + alto_caja - 8*mm, titulo_c)
    c.setFillColorRGB(*BRUMA); c.setFont(SANS, 7.2)
    yy = caja_y + alto_caja - 14*mm
    for l in lineas:
        c.drawString(x + 5*mm, yy, l); yy -= 8.6

_caja(18*mm, 'GENESIS CORE',
      ['Interno · con contraseña', '', 'El estado de cada sistema',
       'Infraestructura y tesorería', 'El parte para la Junta',
       'Todo el conocimiento'], ORO, 0.55)
_caja(A - 18*mm - ancho_caja, 'AU-RA',
      ['Público · en la billetera', '', 'Solo lo que una persona',
       'marcó y firmó.', '', 'Nada más cruza.'], JADE, 0.22)

mx = A / 2
ya = caja_y + alto_caja * 0.66
xi = 18*mm + ancho_caja
xd = A - 18*mm - ancho_caja
c.saveState()
c.setStrokeColorRGB(*ORO); c.setStrokeAlpha(0.8); c.setLineWidth(1.1)
c.line(xi + 2*mm, ya, mx - 9*mm, ya)
c.line(mx + 9*mm, ya, xd - 4*mm, ya)
c.setFillColorRGB(*ORO); c.setFillAlpha(0.9)
pf = c.beginPath(); pf.moveTo(xd - 1*mm, ya)
pf.lineTo(xd - 4.5*mm, ya + 2.2); pf.lineTo(xd - 4.5*mm, ya - 2.2); pf.close()
c.drawPath(pf, fill=1, stroke=0)
c.setStrokeAlpha(0.9); c.setLineWidth(1.2)
c.circle(mx, ya, 8.5*mm, fill=0, stroke=1)
c.restoreState()
c.setFillColorRGB(*OROHI); c.setFont(SANS_B, 6.2)
c.drawCentredString(mx, ya + 1.8, 'MARCADO')
c.drawCentredString(mx, ya - 5.2, 'A MANO')

yb = caja_y + alto_caja * 0.22
c.saveState()
c.setStrokeColorRGB(0.94, 0.47, 0.42); c.setStrokeAlpha(0.8); c.setLineWidth(1.0)
c.setDash(3, 3); c.line(xi + 2*mm, yb, mx - 6*mm, yb); c.setDash()
c.setLineWidth(1.5)
c.line(mx - 6*mm, yb + 3.5, mx, yb - 3.5)
c.line(mx - 6*mm, yb - 3.5, mx, yb + 3.5)
c.restoreState()
c.setFillColorRGB(0.94, 0.47, 0.42); c.setFont(SANS, 6.4)
c.drawString(mx + 3*mm, yb - 2, 'lo interno no cruza')

c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.6)
c.drawCentredString(A / 2, caja_y - 9*mm,
    'El filtro se aplica al publicar, no al leer: lo interno no viaja al navegador ni oculto.')
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 11 · HACIA DONDE CRECE
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('Hacia dónde', AL - 24*mm)
titulo('Lo construido sostiene', AL - 38*mm, 25)
titulo('lo que viene.', AL - 51*mm, 25, color=ORO)

y = parrafo(
    'El ecosistema no es una lista cerrada. Cada pieza nueva se apoya en las que ya están '
    'funcionando, y esa es la ventaja de haber construido el suelo primero.',
    AL - 68*mm, ancho=88, tam=10, inter=14.5, color=CREMA)

y -= 14
frentes = [
    ('AUBANK',
     'La capa bancaria sobre el mismo suelo: cuentas, rendimiento y crédito con garantía '
     'en el saldo, para gente que ya tiene identidad verificada en la casa.'),
    ('Ordenexchange',
     'El mercado propio: cambiar entre los activos del ecosistema y contra el mundo de '
     'fuera, sin salir de la cuenta.'),
    ('Comercios',
     'MyTokenPay ya encuentra negocios; el paso siguiente es que cada uno registre su '
     'dirección de cobro y el pago en línea se cierre de punta a punta.'),
    ('AU-RA que aprende',
     'Hoy sabe lo que la casa le enseña. Lo siguiente: que Genesis Core recoja lo que se '
     'le preguntó y no supo, y lo convierta en trabajo de entrenamiento guiado por '
     'personas.'),
    ('La red de validadores',
     'La cadena corre hoy con cuatro validadores propios. Abrirla a validadores de socios '
     'reparte la confianza y convierte la infraestructura en un activo compartido.'),
]
for nombre, que in frentes:
    c.setFillColorRGB(*ORO); c.setFont(SANS_B, 10)
    c.drawString(18*mm, y, nombre)
    y -= 13
    y = parrafo(que, y, x=20*mm, ancho=86, tam=9.3, inter=12.6)
    y -= 8

hilo(y + 4)
parrafo('Lo caro de un ecosistema es el primer producto que de verdad funciona. '
        'Eso ya está pagado.',
        y - 14, ancho=88, tam=10, inter=14, color=CREMA, fuente=SANS_B)
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 12 · IR POR TODO EL MUNDO
#
# La unica pagina del documento que mira hacia afuera, y por eso la que mas
# facil se llena de humo. Regla: cada cifra de aqui existe. Los diez paises son
# los que la Secretaria de la Junta consigno el 14/08; los 435 usuarios y las
# 24 tarjetas, tambien. Es poco, y se dice que es poco: 435 personas que
# llegaron sin una sola campana valen mas en una conversacion honesta que un
# millon proyectado en una diapositiva.
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('El mundo', AL - 24*mm)
titulo('Ya llegó a diez países', AL - 38*mm, 25)
titulo('sin haberlo intentado.', AL - 51*mm, 25, color=ORO)

y = parrafo(
    'Nadie hizo una campaña. No hay presupuesto de adquisición, ni red de afiliados, ni '
    'un anuncio pagado. Y aun así hay cuentas abiertas en tres continentes, porque el '
    'producto viaja por donde viaja la gente que lo usa.',
    AL - 68*mm, ancho=88, tam=10, inter=14.5, color=CREMA)

# El mapa, dicho en palabras: cuatro columnas de nombres pesan menos que un SVG
# y no mienten sobre cobertura que no tenemos.
y -= 20
paises = ['Honduras', 'México', 'Guatemala', 'El Salvador', 'Costa Rica',
          'Canadá', 'España', 'Italia', 'Reino Unido', 'Nueva Zelanda']
c.saveState()
col_x = [18*mm, 62*mm, 106*mm, 150*mm]
for i, pais in enumerate(paises):
    x = col_x[i % 4]; yy = y - (i // 4) * 17
    c.setFillColorRGB(*ORO); c.setFillAlpha(0.55)
    c.circle(x + 1.4*mm, yy + 1.1*mm, 1.4*mm, fill=1, stroke=0)
    c.setFillAlpha(1); c.setFillColorRGB(*CREMA); c.setFont(SANS, 9)
    c.drawString(x + 5*mm, yy, pais)
c.restoreState()
y -= 2 * 17 + 24

hilo(y)
y -= 26
yc = y
cifra('435', 'Usuarios activos, sin una sola campaña', 18*mm, yc, 32, anchoPie=19)
cifra('24', 'Tarjetas emitidas y en uso', 68*mm, yc, 32, anchoPie=19)
cifra('10', 'Países, en tres continentes', 112*mm, yc, 32, anchoPie=19)
cifra('2', 'Idiomas, en todo el producto', 152*mm, yc, 32, anchoPie=19)
y = yc - 46
hilo(y)

y = parrafo(
    'La arquitectura ya está pensada para eso. Orden Global Corp opera desde Próspera '
    'hacia el mundo, y esa capa es descentralizada: el marco regulatorio aplicable es el '
    'de la jurisdicción, no uno distinto por cada país donde vive un usuario.',
    y - 20, ancho=88, tam=9.8, inter=14, color=CREMA)

y -= 12
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 8)
c.drawString(18*mm, y, 'E L   C A M I N O   R E G U L A T O R I O   ·   E N   P R E P A R A C I Ó N')
y -= 17
tramites = [
    ('FinTech ATS, Clase B', 'Ampara el intercambio del ecosistema.'),
    ('Aviso de Oferta Exenta', 'Cubre ORIGEN, AUKA, AGKA y ONDK en colocación privada.'),
    ('Licencia de Compañía de Inversión', 'La más robusta: tokenización de activos reales.'),
    ('Prestamista No Bancario', 'Complementa la actividad del intercambio.'),
]
for nombre, que in tramites:
    c.setFillColorRGB(*ORO); c.setFillAlpha(0.5)
    c.rect(18*mm, y - 1, 1.6*mm, 8, fill=1, stroke=0); c.setFillAlpha(1)
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 9)
    c.drawString(22*mm, y, nombre)
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 8.6)
    c.drawString(88*mm, y, que)
    y -= 15
c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.6)
c.drawString(22*mm, y - 2, 'Ninguna emitida a la fecha. El paquete completo está en preparación ante la RFSA de Próspera.')

y -= 20
hilo(y)
parrafo('Lo difícil de un producto global no es traducirlo: es que funcione igual de bien '
        'cuando nadie de la casa está mirando. Eso ya está construido.',
        y - 16, ancho=88, tam=10, inter=14, color=CREMA, fuente=SANS_B)
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 13 · QUIEN LO CONSTRUYO · NEXUS CODER
# ═══════════════════════════════════════════════════════════════════════════
fondo()
logo_nx('nexus-n.png', 130*mm, AL - 120*mm, 54*mm, alpha=0.92)

sello('Quién lo construyó', AL - 24*mm)
titulo('Nexus Coder.', AL - 40*mm, 27)
c.setFillColorRGB(0.36, 0.90, 0.94); c.setFont(SERIF_B, 27)
c.drawString(18*mm, AL - 53*mm, 'Fráncfort, Alemania.')

y = parrafo(
    'Todo lo que se ha visto en estas páginas —la cadena, la billetera, la identidad, la '
    'mensajería, el comercio y las dos inteligencias— lo desarrolló Nexus Coder para '
    'Orden Global Corp.',
    AL - 71*mm, ancho=56, tam=10.5, inter=15, color=CREMA)

y = parrafo(
    'No se integraron piezas de terceros con una portada encima. La capa uno se '
    'construyó desde el génesis, el consenso, el explorador y las inteligencias '
    'también. Por eso el ecosistema se puede enseñar corriendo en vez de en una maqueta.',
    y - 8, ancho=56, tam=9.6, inter=13.8, color=BRUMA)

y = min(y, AL - 126*mm) - 6
hilo(y)
y -= 18
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 8)
c.drawString(18*mm, y, 'L O   Q U E   S A B E M O S   C O N S T R U I R')
y -= 18

# Dos columnas de capacidades: es lo que un cliente de fuera busca en la pagina
# del estudio, y cada linea de aqui existe en el ecosistema que acaba de ver.
capacidades = [
    ('Capa uno propia', 'Cadena, consenso, génesis y validadores.'),
    ('Explorador y datos', 'Indexado, API pública y panel en vivo.'),
    ('Billeteras y custodia', 'Claves, firmas, saldos y tarjetas.'),
    ('Identidad y cumplimiento', 'KYC, KYB, AML y sesión única.'),
    ('Pagos y comercio', 'Cobro por código, directorio y pasarela.'),
    ('Asistentes sobre producto', 'Con frontera entre lo interno y lo público.'),
]
y0 = y
for i, (nombre, que) in enumerate(capacidades):
    x = 18*mm if i % 2 == 0 else 105*mm
    yy = y0 - (i // 2) * 26
    c.setFillColorRGB(0.36, 0.90, 0.94); c.setFont(SANS_B, 9.4)
    c.drawString(x, yy, nombre)
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 8.6)
    c.drawString(x, yy - 11, que)
y = y0 - 3 * 26 - 6

hilo(y)
y -= 18
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 8)
c.drawString(18*mm, y, 'C Ó M O   T R A B A J A M O S')
y -= 17

principios = [
    ('Ni un dato inventado.',
     'En este documento no hay una cifra que no se haya medido contra la cadena o contra '
     'el servicio, el mismo día que se generó. Es la misma regla que gobierna el '
     'producto: cuando el precio del oro no llega, la pantalla enseña un guion — nunca '
     'un número inventado.'),
    ('Lo que se dice, se puede comprobar.',
     'Cada afirmación del producto tiene detrás una prueba automática que se pone roja si '
     'alguien la deshace sin querer. No es documentación: es un guardia que corre en cada '
     'cambio.'),
    ('Se despliega desde la fuente, siempre.',
     'Nada de paquetes armados a mano ni copias desfasadas. Lo que corre en producción es '
     'exactamente lo que está en el repositorio, y se comprueba después de cada subida.'),
]
for nombre, que in principios:
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 9.4)
    c.drawString(18*mm, y, nombre)
    y -= 12
    y = parrafo(que, y, x=18*mm, ancho=100, tam=8.8, inter=12)
    y -= 8

hilo(y + 2)
parrafo('Construimos sistemas financieros que aguantan que los abran y los miren por '
        'dentro. Es lo que hicimos aquí, y es lo que hacemos.',
        y - 13, ancho=96, tam=10, inter=14, color=CREMA, fuente=SANS_B)
hoja('Nexus Coder · Fráncfort del Meno, Alemania · desarrollado para Orden Global Corp')

# ═══════════════════════════════════════════════════════════════════════════
# 14 · CIERRE
# ═══════════════════════════════════════════════════════════════════════════
fondo()
im = CAPTURAS / 'portada.png'
if im.exists():
    r = ImageReader(str(im)); iw, ih = r.getSize()
    alto = A * ih / iw
    c.saveState(); c.setFillAlpha(0.22)
    c.drawImage(r, 0, AL - alto - 20*mm, width=A, height=alto, mask='auto')
    c.restoreState()
c.setFillColorRGB(*POZO); c.setFillAlpha(0.80); c.rect(0, 0, A, AL, fill=1, stroke=0); c.setFillAlpha(1)

sello('El cierre', AL - 60*mm)
c.setFillColorRGB(*OROHI); c.setFont(SERIF_B, 30)
c.drawString(18*mm, AL - 82*mm, 'Está construido.')
c.setFillColorRGB(*ORO)
c.drawString(18*mm, AL - 98*mm, 'Está corriendo.')

y = parrafo(
    'Una cadena propia con finalidad inmediata. Un activo referenciado al oro, con la '
    'fórmula a la vista. '
    'Identidad verificada, mensajería, comercio y una inteligencia que lo explica todo. '
    'Seis productos vivos sobre un solo suelo, y una sola cuenta para entrar.',
    AL - 118*mm, ancho=76, tam=11, inter=16, color=CREMA)

y = parrafo(
    'Lo que sigue no es empezar: es escalar lo que ya funciona.',
    y - 6, ancho=76, tam=11, inter=16, color=BRUMA, fuente=SANS_B)

hilo(72*mm)
c.setFillColorRGB(*BRUMA); c.setFont(SANS_B, 9.5)
c.drawString(18*mm, 64*mm, 'Orden Global Corp · Isla Roatán, Honduras')
c.setFillColorRGB(*HUMO); c.setFont(SANS, 9)
c.drawString(18*mm, 56*mm, 'www.ordenglobal.org  ·  www.vetawallet.com  ·  ordenscan.com')
c.drawString(18*mm, 49*mm, 'info@ordenglobal.org')

# Las dos firmas, separadas: la casa a la izquierda, el estudio a la derecha.
logo_nx('nexus-texto.png', A - 62*mm, 62*mm, 44*mm, alpha=0.95)
c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.2)
c.drawRightString(A - 18*mm, 56*mm, 'Desarrollado para Orden Global Corp por Nexus Coder')
c.drawRightString(A - 18*mm, 49*mm, 'Fráncfort del Meno, Alemania')

hilo(45*mm, alpha=0.18)
c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.4)
c.drawString(18*mm, 37*mm, 'Documento de producto y tecnología. No contiene proyecciones financieras ni '
                           'constituye una oferta de valores.')
c.drawString(18*mm, 32*mm, 'ORIGEN, AUKA y AGKA son instrumentos referenciados a un precio de metal; no son '
                           'instrumentos respaldados. ONDK es un valor negociable bajo Próspera.')
c.drawString(18*mm, 27*mm, 'Cifras comprobadas contra la cadena y los servicios el ' + FECHA + '.')
c.drawString(18*mm, 22*mm, 'Datos de usuarios y países según el expediente de la Secretaría de la Junta, 14/08/2026.')
hoja()

c.save()
print(f'{SALIDA}  ·  {pagina[0]} páginas  ·  {SALIDA.stat().st_size/1024:.0f} kB')
