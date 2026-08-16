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
#     metrica se cae entero en la primera pregunta.
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
c.setAuthor('Orden Global Corp')
c.setSubject('Dossier de producto y tecnologia')

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

logo = MARCAS / 'veta-mark.png'
if logo.exists():
    c.drawImage(ImageReader(str(logo)), 18*mm, AL - 40*mm, width=15*mm, height=15*mm, mask='auto')

sello('Orden Global · la casa del oro digital', AL - 50*mm)
hilo(AL - 54*mm, x1=118*mm)

c.setFillColorRGB(*OROHI); c.setFont(SERIF_B, 40)
c.drawString(18*mm, AL - 76*mm, 'CINCO MIL AÑOS')
c.setFillColorRGB(*ORO)
c.drawString(18*mm, AL - 92*mm, 'DE TENER RAZÓN.')

y = parrafo(
    'Imperios enteros se apagaron y el oro siguió siendo dinero. Orden Global lo trae a '
    'este siglo sin cambiarle la naturaleza: metal certificado, guardado en bóveda, vivo '
    'en una cadena que es nuestra.',
    108*mm, ancho=68, tam=11.5, inter=16.5, color=CREMA)

y = parrafo(
    'Esto no es una aplicación de finanzas. Es un ecosistema entero —dinero, identidad, '
    'mensajería, comercio— construido, desplegado y funcionando hoy.',
    y - 8, ancho=68, tam=11.5, inter=16.5, color=BRUMA)

hilo(58*mm)
c.setFillColorRGB(*HUMO); c.setFont(SANS, 8.5)
c.drawString(18*mm, 50*mm, 'Dossier de producto y tecnología · ' + FECHA)
c.setFillColorRGB(*BRUMA); c.setFont(SANS_B, 8.5)
c.drawString(18*mm, 43*mm, 'Veta Wallet · Genesis ID · PULSE CHAT · MyTokenPay · AU-RA · Cadena 5550')
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
    'el bloque 12.234, con cuatro validadores firmando en rotación, y cualquiera puede '
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
titulo('ORIGEN: oro que se mueve', AL - 38*mm, 23)
titulo('como un mensaje.', AL - 51*mm, 23, color=ORO)

y = parrafo(
    'Cada ORIGEN es un gramin: 1⁄55 de un gramo de oro certificado bajo el estándar '
    'internacional NI 43-101, que firma un tercero y no nosotros. Por cada ORIGEN en '
    'circulación hay un gramin guardado en bóveda. No es una promesa de oro: es el oro, '
    'con otra forma de viajar.',
    AL - 68*mm, ancho=52, tam=10, inter=14.5, color=CREMA)

y = parrafo(
    'Veta Wallet es donde vive: enviar y recibir en segundos, cambiar entre los catorce '
    'activos del ecosistema, cobrar con un código y una tarjeta para gastarlo en el mundo '
    'de todos los días.',
    y - 8, ancho=52, tam=10, inter=14.5)

hilo(y - 8, x1=100*mm)
yc = y - 30
cifra('1:1', 'Un gramin guardado por cada ORIGEN', 18*mm, yc, 26, anchoPie=18)
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
for linea in ['Un activo respaldado en oro que solo se puede guardar es un ahorro.',
              'Uno que se puede gastar en la esquina es una moneda — y esa es la diferencia',
              'entre un producto financiero y una economía.']:
    c.drawString(18*mm, y, linea); y -= 13
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 9 · AU-RA
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('La inteligencia', AL - 24*mm)
titulo('AU-RA', AL - 38*mm, 26)
titulo('modelo 1 · beta', AL - 50*mm, 14, color=ORO, fuente=SANS_B)

parrafo('Nuestra propia asistente, con voz grabada por la casa. Navega por la persona, '
        'le explica el ecosistema, le dice el precio del día y le deja los pagos '
        'preparados. Pero nunca firma: el dinero se mueve solo con la contraseña de su '
        'dueño.',
        AL - 62*mm, ancho=92, tam=9.8, inter=13.5)

imagen('aura.png', 18*mm, 96*mm, A - 36*mm)

y = 84*mm
hilo(y + 10)
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 9.6)
c.drawString(18*mm, y, 'Las dos reglas que no rompe')
c.setFillColorRGB(*BRUMA); c.setFont(SANS, 9.4)
y -= 14
for linea in ['Jamás inventa un número. Si el precio o la actividad no llegaron, lo dice.',
              'AU-RA prepara; la persona firma. Un destino o un monto no salen nunca de',
              'su imaginación, solo de lo que la persona dictó o tiene en su agenda.']:
    c.drawString(18*mm, y, linea); y -= 13
hoja()

# ═══════════════════════════════════════════════════════════════════════════
# 10 · GENESIS CORE — SIN IMAGEN, A PROPOSITO
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('La sala de máquinas', AL - 24*mm)
titulo('Genesis Core', AL - 38*mm, 26)
titulo('el cerebro que no se enseña.', AL - 51*mm, 18, color=ORO, fuente=SANS_B)

y = parrafo(
    'Todo lo anterior tiene detrás un sistema interno que lo vigila: Genesis Core. Reúne '
    'en un solo sitio el estado real de cada pieza del ecosistema —las cadenas, los '
    'servicios, el explorador, la identidad, la tesorería— y da el parte del día.',
    AL - 68*mm, ancho=88, tam=10, inter=14.5, color=CREMA)

y = parrafo(
    'Es también donde se entrena a AU-RA. El conocimiento del ecosistema se escribe ahí, y '
    'una persona marca a mano qué puede saber el público. Solo eso cruza: el resto no sale '
    'del sistema interno, ni siquiera oculto en el código que llega al navegador.',
    y - 8, ancho=88, tam=10, inter=14.5)

hilo(y - 8)
y -= 26
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 9.6)
c.drawString(18*mm, y, 'Por qué no hay una captura de Genesis Core en este documento')
y -= 16
y = parrafo(
    'Porque enseña la infraestructura, el estado de cada sistema y lo que está pendiente de '
    'arreglar. Un panel interno fotografiado en un PDF que va a circular es el mapa de la '
    'casa regalado a quien lo reciba de tercera mano. Se cuenta que existe y qué hace; no '
    'se enseña qué ve.',
    y, ancho=88, tam=9.6, inter=14)

y = parrafo(
    'La misma disciplina gobierna el producto: lo interno se queda adentro por diseño, no '
    'por costumbre. Es la clase de decisión que un inversionista debería querer ver tomada '
    'antes de poner dinero, no después.',
    y - 8, ancho=88, tam=9.6, inter=14, color=HUMO)

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
      ['Interno · con contraseña', '', 'Estado de cada sistema',
       'Infraestructura y tesorería', 'Lo que falta por hacer',
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
     'La capa bancaria sobre el mismo suelo: cuentas, rendimiento y crédito respaldado en '
     'oro, para gente que ya tiene identidad verificada y saldo en la casa.'),
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
# 12 · CIERRE
# ═══════════════════════════════════════════════════════════════════════════
fondo()
im = CAPTURAS / 'portada.png'
if im.exists():
    r = ImageReader(str(im)); iw, ih = r.getSize()
    alto = A * ih / iw
    c.saveState(); c.setFillAlpha(0.22)
    c.drawImage(r, 0, AL - alto - 20*mm, width=A, height=alto, mask='auto')
    c.restoreState()
c.setFillColorRGB(*POZO); c.setFillAlpha(0.62); c.rect(0, 0, A, AL, fill=1, stroke=0); c.setFillAlpha(1)

sello('El cierre', AL - 60*mm)
c.setFillColorRGB(*OROHI); c.setFont(SERIF_B, 30)
c.drawString(18*mm, AL - 82*mm, 'Está construido.')
c.setFillColorRGB(*ORO)
c.drawString(18*mm, AL - 98*mm, 'Está corriendo.')

y = parrafo(
    'Una cadena propia con finalidad inmediata. Un activo respaldado en oro certificado. '
    'Identidad verificada, mensajería, comercio y una inteligencia que lo explica todo. '
    'Seis productos vivos sobre un solo suelo, y una sola cuenta para entrar.',
    AL - 118*mm, ancho=76, tam=11, inter=16, color=CREMA)

y = parrafo(
    'Lo que sigue no es empezar: es escalar lo que ya funciona.',
    y - 6, ancho=76, tam=11, inter=16, color=BRUMA, fuente=SANS_B)

hilo(64*mm)
c.setFillColorRGB(*BRUMA); c.setFont(SANS_B, 9.5)
c.drawString(18*mm, 56*mm, 'Orden Global Corp · Isla Roatán, Honduras')
c.setFillColorRGB(*HUMO); c.setFont(SANS, 9)
c.drawString(18*mm, 48*mm, 'www.ordenglobal.org  ·  www.vetawallet.com  ·  ordenscan.com')
c.drawString(18*mm, 41*mm, 'info@ordenglobal.org')
c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.4)
c.drawString(18*mm, 30*mm, 'Documento de producto y tecnología. No contiene proyecciones financieras ni '
                           'constituye una oferta de valores.')
c.drawString(18*mm, 25*mm, 'Cifras comprobadas contra la cadena y los servicios el ' + FECHA + '.')
hoja()

c.save()
print(f'{SALIDA}  ·  {pagina[0]} páginas  ·  {SALIDA.stat().st_size/1024:.0f} kB')
