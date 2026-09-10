#!/usr/bin/env python3
# El documento de presentación de la Layer 1 de Orden Global.
#
# Se dibuja a mano sobre el lienzo en vez de usar plantillas: el documento
# tiene que verse como la marca --verde profundo y oro-- y eso no sale de los
# estilos por defecto.

import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

W, H = A4
ACT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(ACT, 'wt2', 'veta-wallet-app', 'assets')
SALIDA = os.path.join(ACT, 'Orden-Global-Layer-1.pdf')

# ---- la paleta, sacada de la propia app -------------------------------------
FONDO   = (0x02/255, 0x1B/255, 0x1C/255)   # verde casi negro
ORO     = (0xC9/255, 0xA9/255, 0x61/255)
ORO_CLA = (0xEA/255, 0xD7/255, 0x9C/255)
CREMA   = (0xF3/255, 0xEC/255, 0xD9/255)
VERDE   = (0x6E/255, 0x93/255, 0x8F/255)
TINTA   = (0x0E/255, 0x2A/255, 0x2B/255)
TINTA2  = (0x3C/255, 0x55/255, 0x56/255)
PAPEL   = (0xFA/255, 0xF7/255, 0xEF/255)

D = 'DejaVuSerif'          # titulares, con carácter
DB = 'DejaVuSerif-Bold'
S = 'DejaVuSans'           # texto corrido
SB = 'DejaVuSans-Bold'
M = 'DejaVuSansMono'       # datos

for n, f in [(D,'DejaVuSerif.ttf'), (DB,'DejaVuSerif-Bold.ttf'),
             (S,'DejaVuSans.ttf'), (SB,'DejaVuSans-Bold.ttf'),
             (M,'DejaVuSansMono.ttf')]:
    pdfmetrics.registerFont(TTFont(n, f'/usr/share/fonts/truetype/dejavu/{f}'))

c = canvas.Canvas(SALIDA, pagesize=A4)
c.setTitle('Orden Global · Layer 1')
c.setAuthor('Orden Global')
c.setSubject('La cadena propia de Orden Global: qué es, cómo está hecha y en qué estado está')


def fondo_oscuro():
    c.setFillColorRGB(*FONDO)
    c.rect(0, 0, W, H, stroke=0, fill=1)


def fondo_claro():
    c.setFillColorRGB(*PAPEL)
    c.rect(0, 0, W, H, stroke=0, fill=1)


def regla(x, y, ancho, color=ORO, grosor=0.9):
    c.setStrokeColorRGB(*color)
    c.setLineWidth(grosor)
    c.line(x, y, x + ancho, y)


def parrafo(txt, x, y, ancho, fuente=S, tam=10.2, interlinea=15.5,
            color=TINTA2, justificado=False):
    """Corta el texto a mano: así el interlineado y el color quedan bajo
    control, que es lo que hace que una página se vea cuidada."""
    c.setFont(fuente, tam)
    c.setFillColorRGB(*color)
    palabras = txt.split()
    linea, lineas = '', []
    for p in palabras:
        prueba = (linea + ' ' + p).strip()
        if pdfmetrics.stringWidth(prueba, fuente, tam) <= ancho:
            linea = prueba
        else:
            lineas.append(linea)
            linea = p
    if linea:
        lineas.append(linea)
    for i, l in enumerate(lineas):
        c.drawString(x, y, l)
        y -= interlinea
    return y


def titulillo(txt, x, y, color=ORO):
    c.setFont(SB, 7.6)
    c.setFillColorRGB(*color)
    c.drawString(x, y, txt.upper())
    return y


def encabezado(numero, titulo, subtitulo=None):
    """La cabecera repetida de las páginas de contenido."""
    fondo_claro()
    c.setFillColorRGB(*FONDO)
    c.rect(0, H - 42*mm, W, 42*mm, stroke=0, fill=1)
    c.setFont(M, 8)
    c.setFillColorRGB(*ORO)
    c.drawString(22*mm, H - 17*mm, numero)
    regla(22*mm, H - 20*mm, 14*mm, ORO, 0.8)
    c.setFont(D, 25)
    c.setFillColorRGB(*CREMA)
    c.drawString(22*mm, H - 31*mm, titulo)
    if subtitulo:
        c.setFont(S, 9.4)
        c.setFillColorRGB(*VERDE)
        c.drawString(22*mm, H - 37.5*mm, subtitulo)


def pie(n):
    c.setFont(S, 7.4)
    c.setFillColorRGB(*VERDE)
    c.drawString(22*mm, 13*mm, 'Orden Global · Layer 1')
    c.drawRightString(W - 22*mm, 13*mm, str(n))
    regla(22*mm, 17*mm, W - 44*mm, (0.85, 0.82, 0.74), 0.5)


# =============================================================================
# 1 · PORTADA
# =============================================================================
fondo_oscuro()

# Un halo muy suave detrás del logo, para que la portada no sea un plano liso.
for i in range(30, 0, -1):
    t = i / 30.0
    c.setFillColorRGB(FONDO[0] + 0.055*(1-t), FONDO[1] + 0.075*(1-t), FONDO[2] + 0.065*(1-t))
    c.circle(W/2, H - 88*mm, 52*mm * t, stroke=0, fill=1)

logo = os.path.join(ASSETS, 'logo.png')
if os.path.exists(logo):
    im = ImageReader(logo)
    iw, ih = im.getSize()
    anc = 62*mm
    alt = anc * ih / iw
    c.drawImage(im, W/2 - anc/2, H - 88*mm - alt/2 + 6*mm, anc, alt,
                mask='auto')

c.setFont(SB, 8.6)
c.setFillColorRGB(*VERDE)
c.drawCentredString(W/2, H - 118*mm, 'O R D E N   G L O B A L')

regla(W/2 - 24*mm, H - 126*mm, 48*mm, ORO, 1.0)

c.setFont(D, 40)
c.setFillColorRGB(*CREMA)
c.drawCentredString(W/2, H - 149*mm, 'Nuestra')
c.setFont(DB, 40)
c.setFillColorRGB(*ORO)
c.drawCentredString(W/2, H - 166*mm, 'Layer 1')

c.setFont(S, 11.4)
c.setFillColorRGB(*VERDE)
c.drawCentredString(W/2, H - 182*mm, 'Una cadena propia. Sin alquilarle el suelo a nadie.')

# Tres datos sueltos para que el hueco entre el titular y la chapa no quede
# muerto. Sin caja ni adornos: solo las cifras, que es lo que sostiene todo.
resumen = [('4', 'validadores'), ('10 s', 'por bloque'), ('EVM', 'compatible')]
ancho_col = 46*mm
inicio = W/2 - ancho_col
for i, (grande, chico) in enumerate(resumen):
    cxx = inicio + ancho_col*i
    c.setFont(DB, 15)
    c.setFillColorRGB(*ORO)
    c.drawCentredString(cxx, 78*mm, grande)
    c.setFont(S, 7.8)
    c.setFillColorRGB(*VERDE)
    c.drawCentredString(cxx, 71*mm, chico)
    if i < 2:
        c.setStrokeColorRGB(0.16, 0.28, 0.28)
        c.setLineWidth(0.6)
        c.line(cxx + ancho_col/2, 68*mm, cxx + ancho_col/2, 82*mm)

# La chapa de estado, abajo
c.setFillColorRGB(0.06, 0.15, 0.15)
c.roundRect(W/2 - 42*mm, 32*mm, 84*mm, 13*mm, 6.5*mm, stroke=0, fill=1)
c.setStrokeColorRGB(*ORO)
c.setLineWidth(0.7)
c.roundRect(W/2 - 42*mm, 32*mm, 84*mm, 13*mm, 6.5*mm, stroke=1, fill=0)
c.setFont(SB, 8.4)
c.setFillColorRGB(*ORO_CLA)
c.drawCentredString(W/2, 37.4*mm, 'EN PRUEBAS · CHAIN ID 5534')

c.setFont(S, 7.6)
c.setFillColorRGB(*VERDE)
c.drawCentredString(W/2, 22*mm, 'Agosto de 2026')
c.showPage()

# =============================================================================
# 2 · QUÉ ES
# =============================================================================
encabezado('01', 'Qué es', 'Y por qué una cadena propia y no un rincón de la de otro')
x = 22*mm
anc = W - 44*mm
y = H - 58*mm

y = parrafo(
    'ORIGEN no vive de prestado. Corre sobre una cadena de bloques propia, '
    'construida y operada por Orden Global: nosotros ponemos los validadores, '
    'nosotros fijamos el coste de moverse por ella y nosotros respondemos por '
    'lo que hay dentro.',
    x, y, anc, S, 11.6, 18, TINTA)

y -= 6*mm
y = parrafo(
    'Eso es lo que significa Layer 1: la capa de abajo del todo. No es un '
    'contrato viviendo encima de la red de otra gente, sujeto a sus subidas de '
    'comisión, a sus caídas y a sus reglas. Es el suelo.',
    x, y, anc, S, 10.4, 16.4, TINTA2)

y -= 9*mm
titulilloy = titulillo('LO QUE ESO PERMITE', x, y)
y -= 8*mm

puntos = [
    ('Comisiones que decidimos nosotros',
     'El precio del gas está fijado desde el bloque cero y se revisa contra el oro, no contra la '
     'especulación de una red ajena. Nadie se despierta con transferencias diez veces más caras.'),
    ('Compatible con todo lo que ya existe',
     'Es una máquina virtual de Ethereum. MetaMask, los exploradores, las librerías y los contratos '
     'estándar funcionan sin adaptaciones. Lo propio no significa aislado.'),
    ('Bloques cada diez segundos, siempre',
     'Sin subastas por entrar en el bloque ni esperas que dependen de lo llena que esté la red de otro. '
     'Diez segundos, medidos.'),
    ('Finalidad inmediata',
     'Cuando un bloque entra, entra. No hay reorganizaciones ni «espera doce confirmaciones»: '
     'el consenso decide antes de escribir, no después.'),
]
for t, d in puntos:
    c.setFillColorRGB(*ORO)
    c.circle(x + 1.6*mm, y + 1.4*mm, 1.5*mm, stroke=0, fill=1)
    c.setFont(SB, 10.6)
    c.setFillColorRGB(*TINTA)
    c.drawString(x + 7*mm, y, t)
    y -= 6.2*mm
    y = parrafo(d, x + 7*mm, y, anc - 7*mm, S, 9.6, 14.2, TINTA2)
    y -= 5.5*mm

# Banda de cierre: la pagina pedia peso abajo, no mas aire.
by = 34*mm
c.setFillColorRGB(*FONDO)
c.rect(0, by, W, 46*mm, stroke=0, fill=1)
regla(x, by + 46*mm, anc, ORO, 1.2)
c.setFont(D, 17)
c.setFillColorRGB(*CREMA)
c.drawString(x, by + 30*mm, 'El que pone los validadores')
c.setFont(DB, 17)
c.setFillColorRGB(*ORO)
c.drawString(x, by + 20*mm, 'pone las reglas.')
c.setFont(S, 9)
c.setFillColorRGB(*VERDE)
c.drawString(x, by + 11*mm, 'Y responde por ellas. Las dos cosas van juntas.')

pie(2)
c.showPage()

# =============================================================================
# 3 · CÓMO ESTÁ CONSTRUIDA  (con diagrama)
# =============================================================================
encabezado('02', 'Cómo está construida', 'Cuatro validadores que tienen que ponerse de acuerdo')
x = 22*mm
anc = W - 44*mm
y = H - 58*mm

y = parrafo(
    'La cadena la sostienen cuatro nodos validadores repartidos en dos regiones. '
    'Ninguno manda solo: para que un bloque exista, tres de los cuatro tienen que '
    'firmarlo. Es el consenso QBFT, y su gracia es que un nodo caído —o uno que '
    'mienta— no detiene la red ni la corrompe.',
    x, y, anc, S, 10.6, 16.4, TINTA2)

y -= 4*mm

# ---- diagrama: cuatro validadores en malla + nodo público -------------------
cx, cy, r = W/2, y - 44*mm, 26*mm
nodos = [(cx, cy + r), (cx + r, cy), (cx, cy - r), (cx - r, cy)]
nombres = ['node 3', 'node 4', 'node 5', 'node 6']

c.setStrokeColorRGB(*VERDE)
c.setLineWidth(0.6)
for i in range(4):
    for j in range(i + 1, 4):
        c.line(nodos[i][0], nodos[i][1], nodos[j][0], nodos[j][1])

for (nx, ny), nom in zip(nodos, nombres):
    c.setFillColorRGB(*FONDO)
    c.circle(nx, ny, 8.4*mm, stroke=0, fill=1)
    c.setStrokeColorRGB(*ORO)
    c.setLineWidth(1.0)
    c.circle(nx, ny, 8.4*mm, stroke=1, fill=0)
    c.setFont(SB, 7.2)
    c.setFillColorRGB(*ORO_CLA)
    c.drawCentredString(nx, ny - 1.2*mm, nom)

c.setFont(S, 8)
c.setFillColorRGB(*TINTA2)
c.drawCentredString(cx, cy - r - 15*mm, 'cada uno habla con todos los demás · 3 de 4 firman cada bloque')

y = cy - r - 24*mm

# ---- tabla de especificaciones ---------------------------------------------
titulillo('ESPECIFICACIONES', x, y)
y -= 7*mm

especs = [
    ('Motor',                'Hyperledger Besu 26.7.1'),
    ('Consenso',             'QBFT · tolerante a fallos bizantinos'),
    ('Máquina virtual',      'EVM · compatible con Ethereum'),
    ('Chain ID',             '5550 red  ·  5534 pruebas'),
    ('Validadores',          '4, en dos regiones'),
    ('Período de bloque',    '10 segundos'),
    ('Límite de gas',        '10.000.000 por bloque'),
    ('Precio del gas',       '93 gwei, revisado contra el oro'),
    ('Moneda',               'ORIGEN'),
    ('Emisión total',        '1.000.000.000.000'),
]
fila = 7.4*mm
c.setFillColorRGB(0.96, 0.94, 0.88)
c.rect(x, y - fila*len(especs) + 2*mm, anc, fila*len(especs), stroke=0, fill=1)
for i, (k, v) in enumerate(especs):
    yy = y - fila*i - 3.4*mm
    if i % 2 == 1:
        c.setFillColorRGB(0.99, 0.98, 0.95)
        c.rect(x, yy - 2.2*mm, anc, fila, stroke=0, fill=1)
    c.setFont(S, 9.2)
    c.setFillColorRGB(*TINTA2)
    c.drawString(x + 4*mm, yy, k)
    c.setFont(M, 9.2)
    c.setFillColorRGB(*TINTA)
    c.drawRightString(x + anc - 4*mm, yy, v)
regla(x, y + 2*mm, anc, ORO, 1.0)

pie(3)
c.showPage()

# =============================================================================
# 4 · LA MIGRACIÓN, MEDIDA
# =============================================================================
encabezado('03', 'Nada se pierde', 'La parte que no se puede prometer: hay que demostrarla')
x = 22*mm
anc = W - 44*mm
y = H - 58*mm

y = parrafo(
    'Una cadena nueva se estrena con el estado de la anterior: cada saldo, cada '
    'contrato, cada posición. Y ahí no vale la palabra. Una cadena puede arrancar, '
    'producir bloques, responder a todo y haber perdido estado por el camino sin '
    'que se note hasta que alguien abre su billetera y le falta algo.',
    x, y, anc, S, 10.6, 16.4, TINTA2)

y -= 5*mm
y = parrafo(
    'Por eso el traslado se comprueba contrato por contrato contra la cadena vieja, '
    'y se compara la raíz criptográfica del almacenamiento de cada uno. Si un solo '
    'valor de una sola posición estuviera mal, esa raíz no coincidiría.',
    x, y, anc, S, 10.6, 16.4, TINTA2)

y -= 10*mm

# ---- las tres cifras grandes ------------------------------------------------
cifras = [('1.350', 'comprobaciones\niguales'), ('0', 'diferencias\nencontradas'), ('172', 'contratos con\nraíz idéntica')]
bw = anc / 3
for i, (num, txt) in enumerate(cifras):
    bx = x + bw*i
    c.setFillColorRGB(*FONDO)
    c.roundRect(bx + 2*mm, y - 30*mm, bw - 4*mm, 30*mm, 3*mm, stroke=0, fill=1)
    c.setFont(DB, 26)
    c.setFillColorRGB(*ORO)
    c.drawCentredString(bx + bw/2, y - 14*mm, num)
    c.setFont(S, 8)
    c.setFillColorRGB(*VERDE)
    for j, l in enumerate(txt.split('\n')):
        c.drawCentredString(bx + bw/2, y - 20.5*mm - j*4.2*mm, l)

y -= 40*mm

titulillo('EL DETALLE', x, y)
y -= 7.5*mm

detalle = [
    ('Cuentas trasladadas',                 '331'),
    ('Contratos con su código y su estado', '172'),
    ('Posiciones de almacenamiento',        '1.375'),
    ('Posiciones identificadas',            '1.383 de 1.385'),
    ('Contratos con emisión idéntica',      '82 de 82'),
    ('Nodos del árbol de estado ausentes',  '0'),
]
for i, (k, v) in enumerate(detalle):
    yy = y - 7*mm*i
    c.setFont(S, 9.4)
    c.setFillColorRGB(*TINTA2)
    c.drawString(x, yy, k)
    c.setStrokeColorRGB(0.85, 0.82, 0.74)
    c.setLineWidth(0.4)
    kw = pdfmetrics.stringWidth(k, S, 9.4)
    vw = pdfmetrics.stringWidth(v, M, 9.4)
    c.line(x + kw + 2*mm, yy + 1*mm, x + anc - vw - 2*mm, yy + 1*mm)
    c.setFont(M, 9.4)
    c.setFillColorRGB(*TINTA)
    c.drawRightString(x + anc, yy, v)

y -= 7*mm*len(detalle) + 6*mm
y = parrafo(
    'Las dos posiciones que faltan pertenecen al contrato de staking de la cadena '
    'anterior, que no viaja: en QBFT no hay staking, se vota. Están contadas, no '
    'escondidas.',
    x, y, anc, S, 9.2, 13.6, VERDE)

y -= 10*mm
titulillo('CÓMO SE COMPRUEBA', x, y)
y -= 9*mm
pasos = [
    ('1', 'Se copia el árbol', 'Se vuelca el estado entero de la cadena anterior, cuenta por cuenta. Si falta un solo nodo del árbol, el volcado aborta.'),
    ('2', 'Se reconstruye', 'Con ese volcado se arma el bloque cero de la cadena nueva: los saldos, el código y el almacenamiento de cada contrato.'),
    ('3', 'Se interroga', 'Se le hacen las mismas preguntas a las dos cadenas y se comparan las respuestas, incluida la raíz criptográfica de cada contrato.'),
]
pw = anc / 3
for i, (n, tit, des) in enumerate(pasos):
    px = x + pw*i
    c.setFillColorRGB(*ORO)
    c.circle(px + 3.4*mm, y + 1.2*mm, 3.4*mm, stroke=0, fill=1)
    c.setFont(SB, 8)
    c.setFillColorRGB(*FONDO)
    c.drawCentredString(px + 3.4*mm, y - 0.6*mm, n)
    c.setFont(SB, 9.4)
    c.setFillColorRGB(*TINTA)
    c.drawString(px + 9*mm, y, tit)
    parrafo(des, px, y - 8*mm, pw - 7*mm, S, 8.2, 12, TINTA2)

pie(4)
c.showPage()

# =============================================================================
# 5 · EN QUÉ ESTADO ESTÁ
# =============================================================================
encabezado('04', 'En qué estado está', 'Lo que ya funciona y lo que todavía no')
x = 22*mm
anc = W - 44*mm
y = H - 58*mm

y = parrafo(
    'La red está viva. No es una maqueta ni un diagrama: son cuatro máquinas '
    'produciendo bloques cada diez segundos, con el estado completo de Orden Global '
    'dentro, y un nodo público por el que cualquiera puede consultarla y enviarle '
    'transacciones.',
    x, y, anc, S, 10.6, 16.4, TINTA2)

y -= 9*mm

hecho = [
    'Los cuatro validadores en marcha, con malla completa entre ellos.',
    'Un bloque cada diez segundos, medido durante días.',
    'Arranque automático probado reiniciando una máquina entera: volvió sola en un minuto.',
    'El estado migrado y verificado contra la cadena anterior, sin una sola diferencia.',
    'Nodo público de consulta y envío, abierto.',
    'La billetera enviando transacciones firmadas para la cadena nueva.',
]
falta = [
    'La ventana de corte: pasar los usuarios de la cadena vieja a la nueva.',
    'El explorador apuntando a la red nueva.',
    'La app en las tiendas, con la cuenta de organización.',
]

titulillo('YA FUNCIONA, Y ESTÁ COMPROBADO', x, y)
y -= 8*mm
for t in hecho:
    c.setStrokeColorRGB(*ORO)
    c.setLineWidth(1.3)
    c.line(x + 0.6*mm, y + 1.4*mm, x + 2.2*mm, y - 0.2*mm)
    c.line(x + 2.2*mm, y - 0.2*mm, x + 5*mm, y + 3.4*mm)
    y = parrafo(t, x + 8.5*mm, y, anc - 8.5*mm, S, 9.8, 14.4, TINTA2)
    y -= 3.4*mm

y -= 5*mm
titulillo('TODAVÍA NO', x, y, VERDE)
y -= 8*mm
for t in falta:
    c.setStrokeColorRGB(*VERDE)
    c.setLineWidth(1.0)
    c.circle(x + 2.6*mm, y + 1.4*mm, 1.7*mm, stroke=1, fill=0)
    y = parrafo(t, x + 8.5*mm, y, anc - 8.5*mm, S, 9.8, 14.4, TINTA2)
    y -= 3.4*mm

y -= 6*mm
c.setFillColorRGB(0.96, 0.94, 0.88)
c.roundRect(x, y - 24*mm, anc, 24*mm, 2.5*mm, stroke=0, fill=1)
regla(x, y, anc, ORO, 1.2)
c.setFont(SB, 9.6)
c.setFillColorRGB(*TINTA)
c.drawString(x + 5*mm, y - 8*mm, 'Estamos en pruebas, y lo decimos.')
parrafo('La red 5534 existe para romperla antes de que dependa de ella el dinero de '
        'nadie. Lo que se mueve ahí no es real. Lo que se aprende, sí.',
        x + 5*mm, y - 14*mm, anc - 10*mm, S, 9.2, 13.4, TINTA2)

y -= 34*mm
titulillo('LO QUE VIENE', x, y)
y -= 9*mm
viene = [
    ('Cerrar la ventana', 'Congelar la cadena anterior, levantar la nueva con el estado del momento y volver a pasar el juez antes de abrirle la puerta a nadie.'),
    ('Explorador propio', 'Que cualquiera pueda seguir un bloque, una cuenta o una transacción sin pedirle permiso a nadie.'),
    ('La app en las tiendas', 'Con la cuenta de organización, para que instalar Veta Wallet sea abrir Google Play.'),
]
for tit, des in viene:
    c.setFillColorRGB(*ORO)
    c.rect(x, y - 0.6*mm, 2.2*mm, 2.2*mm, stroke=0, fill=1)
    c.setFont(SB, 9.6)
    c.setFillColorRGB(*TINTA)
    c.drawString(x + 6.5*mm, y, tit)
    y -= 5.8*mm
    y = parrafo(des, x + 6.5*mm, y, anc - 6.5*mm, S, 9, 13.2, TINTA2)
    y -= 4.4*mm

pie(5)
c.showPage()

# =============================================================================
# 6 · CIERRE
# =============================================================================
fondo_oscuro()

regla(W/2 - 18*mm, H - 62*mm, 36*mm, ORO, 1.0)

c.setFont(D, 27)
c.setFillColorRGB(*CREMA)
c.drawCentredString(W/2, H - 84*mm, 'Una moneda necesita')
c.setFont(DB, 27)
c.setFillColorRGB(*ORO)
c.drawCentredString(W/2, H - 96*mm, 'un suelo propio')

yy = parrafo(
    'Se puede emitir un token en la cadena de otro y llamarlo moneda. Funciona, '
    'hasta que el dueño del suelo sube el alquiler, cambia las reglas o se cae. '
    'Construir la capa de abajo es más trabajo y es más lento, y es la única forma '
    'de que lo que se promete dependa de uno mismo.',
    W/2 - 62*mm, H - 116*mm, 124*mm, S, 10.4, 16.6, VERDE)

# La chapa técnica final
c.setFont(M, 8.4)
c.setFillColorRGB(*ORO_CLA)
datos = [
    'Besu 26.7.1  ·  QBFT  ·  EVM',
    '4 validadores  ·  10 s por bloque',
    'chain 5550 red  ·  5534 pruebas',
]
for i, d in enumerate(datos):
    c.drawCentredString(W/2, 118*mm - i*6.4*mm, d)

# La raya va con aire por debajo: pegada quedaba subrayando la ultima linea.
regla(W/2 - 30*mm, 96*mm, 60*mm, (0.18, 0.30, 0.30), 0.8)

logo2 = os.path.join(ASSETS, 'logo.png')
if os.path.exists(logo2):
    im = ImageReader(logo2)
    iw, ih = im.getSize()
    anc2 = 34*mm
    alt2 = anc2 * ih / iw
    c.drawImage(im, W/2 - anc2/2, 62*mm, anc2, alt2, mask='auto')

c.setFont(SB, 8)
c.setFillColorRGB(*VERDE)
c.drawCentredString(W/2, 54*mm, 'O R D E N   G L O B A L')
c.setFont(S, 7.4)
c.drawCentredString(W/2, 44*mm, 'Agosto de 2026 · documento técnico de presentación')

c.showPage()
c.save()
print('escrito', SALIDA)
