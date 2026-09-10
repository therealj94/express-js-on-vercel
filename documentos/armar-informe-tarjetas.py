#!/usr/bin/env python3
"""Arma el informe en PDF de las tarjetas de debito.

TODO lo que sale aqui esta MEDIDO contra la API de Cryptomate y contra la base
de datos el 27 de agosto de 2026. Ninguna cifra sale de leer el codigo ni de
memoria: se pregunto y se leyo la respuesta. Este guion solo dibuja lo que ya
se midio — no consulta nada al correr, para que el documento sea el mismo cada
vez que se genere y se pueda comparar con el de la proxima vez.

    python3 documentos/armar-informe-tarjetas.py
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as lienzo

AQUI = Path(__file__).parent
SALIDA = AQUI / 'Orden-Global-Tarjetas-Debito.pdf'
FECHA = '27 de agosto de 2026'
A, AL = A4

# ── la paleta de la casa ────────────────────────────────────────────────────
POZO  = (0.008, 0.106, 0.110)
VETA  = (0.024, 0.204, 0.188)
ORO   = (0.788, 0.663, 0.380)
CREMA = (0.953, 0.925, 0.851)
BRUMA = (0.682, 0.780, 0.765)
HUMO  = (0.431, 0.576, 0.561)
JADE  = (0.243, 0.851, 0.627)
AMBAR = (0.925, 0.706, 0.298)
ROJO  = (0.894, 0.341, 0.294)

SERIF, SERIF_B = 'Times-Roman', 'Times-Bold'
SANS, SANS_B, MONO = 'Helvetica', 'Helvetica-Bold', 'Courier'
for archivo, nombre in [('Cinzel-Regular.ttf', 'Marca'), ('Cinzel-Bold.ttf', 'MarcaB')]:
    for base in (AQUI.parent / 'orden-global-app' / 'assets' / 'fonts',
                 AQUI.parent / 'apps-web' / 'social' / 'piezas',
                 AQUI.parent / 'apps-web' / 'veta-wallet' / 'assets' / 'fonts'):
        ruta = base / archivo
        if ruta.exists():
            try:
                pdfmetrics.registerFont(TTFont(nombre, str(ruta)))
                if nombre == 'Marca': SERIF = 'Marca'
                else: SERIF_B = 'MarcaB'
                break
            except Exception:
                pass

c = lienzo.Canvas(str(SALIDA), pagesize=A4)
c.setTitle('Veta Wallet · Tarjetas de debito · diagnostico')
c.setAuthor('Orden Global Corp')
c.setSubject('Estado de la integracion con Cryptomate, hallazgos y recomendaciones')
pagina = [0]

M = 18 * mm          # margen
ANCHO_TXT = A - 2 * M


# ── los ladrillos ───────────────────────────────────────────────────────────
def fondo():
    c.setFillColorRGB(*POZO); c.rect(0, 0, A, AL, stroke=0, fill=1)


def hilo(y, x0=M, x1=None, color=ORO, alpha=0.30, grosor=0.6):
    c.saveState(); c.setStrokeColorRGB(*color); c.setStrokeAlpha(alpha)
    c.setLineWidth(grosor); c.line(x0, y, x1 or (A - M), y); c.restoreState()


def sello(txt, y, x=M, color=ORO, tam=7.4):
    c.setFillColorRGB(*color); c.setFont(SANS_B, tam)
    c.drawString(x, y, ' '.join(txt.upper()))


def titulo(txt, y, tam=22, x=M, color=CREMA, fuente=None):
    c.setFillColorRGB(*color); c.setFont(fuente or SERIF, tam)
    c.drawString(x, y, txt)


def cortar(txt, ancho, fuente, tam):
    """Parte un texto en renglones que caben en `ancho` puntos."""
    palabras, lineas, actual = txt.split(), [], ''
    for p in palabras:
        prueba = (actual + ' ' + p).strip()
        if pdfmetrics.stringWidth(prueba, fuente, tam) <= ancho:
            actual = prueba
        else:
            if actual: lineas.append(actual)
            actual = p
    if actual: lineas.append(actual)
    return lineas


def parrafo(txt, y, x=M, ancho=None, tam=9.4, inter=13.2, color=BRUMA, fuente=None):
    f = fuente or SANS
    c.setFillColorRGB(*color); c.setFont(f, tam)
    for ln in cortar(txt, ancho or (ANCHO_TXT), f, tam):
        c.drawString(x, y, ln); y -= inter
    return y


def cifra(valor, pie, x, y, tam=26, color=ORO, ancho=44 * mm):
    c.setFillColorRGB(*color); c.setFont(SANS_B, tam)
    c.drawString(x, y, valor)
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.6)
    yy = y - 11
    for ln in cortar(pie, ancho, SANS, 7.6):
        c.drawString(x, yy, ln); yy -= 9.2
    return yy


def caja(x, y, ancho, alto, borde=ORO, alpha_borde=0.34, relleno=None, alpha_relleno=0.06):
    c.saveState()
    if relleno:
        c.setFillColorRGB(*relleno); c.setFillAlpha(alpha_relleno)
        c.roundRect(x, y, ancho, alto, 2 * mm, stroke=0, fill=1)
    c.setStrokeColorRGB(*borde); c.setStrokeAlpha(alpha_borde); c.setLineWidth(0.7)
    c.roundRect(x, y, ancho, alto, 2 * mm, stroke=1, fill=0)
    c.restoreState()


def hallazgo(etiqueta, color_et, tit, cuerpo, y):
    """Un hallazgo: etiqueta de severidad, titulo y explicacion."""
    c.setFillColorRGB(*color_et); c.setFont(SANS_B, 6.8)
    c.drawString(M, y, ' '.join(etiqueta.upper()))
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 10.4)
    c.drawString(M + 26 * mm, y, tit)
    yy = y - 14
    for p in cuerpo:
        yy = parrafo(p, yy, x=M + 26 * mm, ancho=ANCHO_TXT - 26 * mm, tam=9, inter=12.4)
        yy -= 3
    hilo(yy + 4, x0=M, color=BRUMA, alpha=0.12, grosor=0.4)
    return yy - 8


def fila_tabla(cols, anchos, y, color=BRUMA, fuente=None, tam=8.6):
    x = M
    for txt, an in zip(cols, anchos):
        col = color if not isinstance(txt, tuple) else txt[1]
        t = txt if not isinstance(txt, tuple) else txt[0]
        c.setFillColorRGB(*col); c.setFont(fuente or SANS, tam)
        c.drawString(x, y, t); x += an
    return y - 13


def pie_pagina():
    pagina[0] += 1
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 6.8)
    c.drawString(M, 12 * mm, 'Veta Wallet · Tarjetas de débito · ' + FECHA)
    c.drawRightString(A - M, 12 * mm, str(pagina[0]))


def hoja():
    pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# PORTADA
# ══════════════════════════════════════════════════════════════════════════
fondo()
sello('Orden Global Corp · Veta Wallet', AL - 34 * mm)
hilo(AL - 40 * mm)

titulo('Las tarjetas de débito', AL - 62 * mm, tam=27)
titulo('Diagnóstico completo', AL - 76 * mm, tam=27, color=ORO)

y = AL - 96 * mm
y = parrafo(
    'Estado de la integración con Cryptomate, medido contra su API y contra nuestra base '
    'de datos el 27 de agosto de 2026. Ninguna cifra de este informe sale de leer el código '
    'ni de memoria: se preguntó y se leyó la respuesta.', y, ancho=ANCHO_TXT - 30 * mm,
    tam=10.4, inter=15, color=BRUMA)

y -= 12 * mm
caja(M, y - 34 * mm, ANCHO_TXT, 38 * mm, borde=ROJO, alpha_borde=0.5, relleno=ROJO, alpha_relleno=0.08)
c.setFillColorRGB(*ROJO); c.setFont(SANS_B, 8)
c.drawString(M + 7 * mm, y - 8 * mm, ' '.join('LO PRIMERO, PORQUE ES DINERO DE OTROS'))
yy = parrafo(
    'Las dos únicas recargas de tarjeta que se han intentado en la historia del producto '
    'cobraron el ORIGEN y nunca entregaron el saldo. 82 ORIGEN — 207,12 dólares — salieron '
    'de dos personas y no llegaron a ninguna tarjeta. Una de ellas es un cliente de fuera '
    'de la casa. Siguen sin resolverse: la del 31 de julio lleva 27 días y la del 8 de '
    'agosto lleva 19.',
    y - 15 * mm, x=M + 7 * mm, ancho=ANCHO_TXT - 14 * mm, tam=9.2, inter=12.6, color=CREMA)

y = y - 46 * mm
hilo(y)
y -= 10 * mm
sello('En una línea', y, color=HUMO)
y -= 9 * mm
y = parrafo('La tarjeta está construida entera y todavía no ha funcionado ni una vez de punta a punta.',
            y, tam=12.6, inter=17, color=CREMA, fuente=SERIF)

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# 1 · LOS NÚMEROS
# ══════════════════════════════════════════════════════════════════════════
y = AL - 30 * mm
sello('Uno', y); y -= 10 * mm
titulo('Los números, medidos hoy', y, tam=19); y -= 8 * mm
hilo(y); y -= 14 * mm

anchos_c = ANCHO_TXT / 3
fila = [
    ('26', 'tarjetas activas en Cryptomate', ORO),
    ('24', 'las que nuestro sistema controla — faltan 2', AMBAR),
    ('0', 'compras hechas, desde siempre', ROJO),
]
for i, (v, p, col) in enumerate(fila):
    cifra(v, p, M + i * anchos_c, y, color=col, ancho=anchos_c - 8 * mm)
y -= 30 * mm

fila = [
    ('6,27', 'dólares en el tesoro que paga TODAS las recargas', ROJO),
    ('2', 'recargas intentadas — las dos quedaron a medias', ROJO),
    ('207,12', 'dólares cobrados y no entregados', ROJO),
]
for i, (v, p, col) in enumerate(fila):
    cifra(v, p, M + i * anchos_c, y, color=col, ancho=anchos_c - 8 * mm)
y -= 30 * mm

fila = [
    ('110,61', 'dólares de saldo en 5 tarjetas, cargados por fuera de este flujo', JADE),
    ('26', 'personas con identidad aprobada', ORO),
    ('0', 'avisos que Cryptomate nos ha mandado nunca', ROJO),
]
for i, (v, p, col) in enumerate(fila):
    cifra(v, p, M + i * anchos_c, y, color=col, ancho=anchos_c - 8 * mm)
y -= 34 * mm

hilo(y); y -= 12 * mm
y = parrafo(
    'La cifra que manda es el tesoro. No es un saldo cualquiera: es el fondo del que sale '
    'cada recarga de cada tarjeta. Mientras diga seis dólares, seis dólares es todo lo que '
    'el producto puede entregar — y es también la razón por la que las dos recargas '
    'atascadas no se pueden completar hoy aunque el sistema lo intente.', y, tam=9.6, inter=13.6)

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# 2 · A QUIÉN HAY QUE DEVOLVERLE
# ══════════════════════════════════════════════════════════════════════════
y = AL - 30 * mm
sello('Dos', y, color=ROJO); y -= 10 * mm
titulo('A quién hay que devolverle', y, tam=19); y -= 8 * mm
hilo(y, color=ROJO, alpha=0.4); y -= 14 * mm

y = parrafo(
    'Dos personas mandaron ORIGEN para cargar su tarjeta. El ORIGEN salió de su billetera '
    '—hay transacción en la cadena que lo prueba— y el USDT nunca se envió. El motivo, '
    'idéntico en las dos: el proveedor de Polygon dejó de responder y el reintento se agotó.',
    y, tam=9.6, inter=13.6)
y -= 6 * mm

for f, nom, correo, org, usd, precio, tx, dias in [
    ('8 de agosto de 2026', 'Gerson Adonis Gómez Amaya', 'jerry1039gaga@gmail.com',
     '77 ORIGEN', '195,33 USD', '2,5367', '0x4e5593112f2c482ac1c90de6f145e166f164710fbf5ade3fe11f1aeaa1732da2', '19 días'),
    ('31 de julio de 2026', 'Medardo José Ordóñez Enamorado', 'j.ordonez@ordenglobal.org',
     '5 ORIGEN', '11,80 USD', '2,3592', '0x17b2f194317bf83a0308d85edc38a3d1a01f165ac2d729dd3bcd40882c4ff2f3', '27 días'),
]:
    caja(M, y - 30 * mm, ANCHO_TXT, 31 * mm, borde=ROJO, alpha_borde=0.34, relleno=ROJO, alpha_relleno=0.05)
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 10.2)
    c.drawString(M + 6 * mm, y - 7 * mm, nom)
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 8)
    c.drawRightString(A - M - 6 * mm, y - 7 * mm, f + '  ·  lleva ' + dias)
    c.setFillColorRGB(*BRUMA); c.setFont(SANS, 8.4)
    c.drawString(M + 6 * mm, y - 14 * mm, correo)
    c.setFillColorRGB(*ROJO); c.setFont(SANS_B, 10)
    c.drawString(M + 6 * mm, y - 21 * mm, org + '   =   ' + usd)
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.4)
    c.drawString(M + 62 * mm, y - 21 * mm, '(al precio de ese día: ' + precio + ' USD por ORIGEN)')
    c.setFillColorRGB(*HUMO); c.setFont(MONO, 6.2)
    c.drawString(M + 6 * mm, y - 27 * mm, 'cobro: ' + tx)
    y -= 38 * mm

y -= 2 * mm
hilo(y); y -= 12 * mm
sello('Lo que hay que decidir', y, color=AMBAR); y -= 9 * mm
y = parrafo(
    'Si se les devuelve en ORIGEN o se les completa la recarga. Devolver el ORIGEN es más '
    'simple y no depende del tesoro de Polygon. Completar la recarga es lo que la persona '
    'pidió, pero necesita que el tesoro tenga fondos primero.', y, tam=9.4, inter=13)
y -= 4 * mm
y = parrafo(
    'Hay un detalle que conviene mirar: ese ORIGEN salió antes del reinicio de la cadena del '
    '26 de agosto, y en el reinicio los saldos se rehicieron. Antes de devolver, hay que '
    'confirmar en qué quedó el saldo de cada uno para no devolver dos veces ni de menos.',
    y, tam=9.4, inter=13, color=AMBAR)

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# 3 · CÓMO FUNCIONA
# ══════════════════════════════════════════════════════════════════════════
y = AL - 30 * mm
sello('Tres', y); y -= 10 * mm
titulo('El camino del dinero', y, tam=19); y -= 8 * mm
hilo(y); y -= 12 * mm

y = parrafo(
    'Entre el ORIGEN de una persona y su tarjeta hay cuatro saltos y un puente que '
    'sostenemos nosotros. El puente existe porque la 5550 es una cadena propia y ningún '
    'mercado público la cotiza: no es un defecto, es la consecuencia de tener cadena propia.',
    y, tam=9.6, inter=13.6)
y -= 8 * mm

# el diagrama
cajas = [
    ('La persona', 'manda ORIGEN', BRUMA, None),
    ('Tesoro 5550', 'recibe el ORIGEN', JADE, None),
    ('Tesoro Polygon', '6,27 USDT', ROJO, 'aquí se corta todo'),
    ('Cryptomate', 'acredita la tarjeta', BRUMA, None),
]
an_c = (ANCHO_TXT - 3 * 8 * mm) / 4
for i, (t, s, col, extra) in enumerate(cajas):
    x = M + i * (an_c + 8 * mm)
    alto = 22 * mm
    es_malo = col == ROJO
    caja(x, y - alto, an_c, alto, borde=ROJO if es_malo else HUMO,
         alpha_borde=0.6 if es_malo else 0.35,
         relleno=ROJO if es_malo else None, alpha_relleno=0.08)
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 8.4)
    c.drawCentredString(x + an_c / 2, y - 8 * mm, t)
    c.setFillColorRGB(*col); c.setFont(SANS_B if es_malo else SANS, 9 if es_malo else 7.8)
    c.drawCentredString(x + an_c / 2, y - 14 * mm, s)
    if extra:
        c.setFillColorRGB(*ROJO); c.setFont(SANS, 6.6)
        c.drawCentredString(x + an_c / 2, y - 19 * mm, extra)
    if i < 3:
        c.saveState(); c.setStrokeColorRGB(*HUMO); c.setLineWidth(0.7)
        fx = x + an_c + 1.5 * mm
        c.line(fx, y - 11 * mm, fx + 5 * mm, y - 11 * mm)
        c.setFillColorRGB(*HUMO)
        p = c.beginPath(); p.moveTo(fx + 5 * mm, y - 11 * mm)
        p.lineTo(fx + 3.4 * mm, y - 9.9 * mm); p.lineTo(fx + 3.4 * mm, y - 12.1 * mm); p.close()
        c.drawPath(p, stroke=0, fill=1); c.restoreState()
y -= 32 * mm

for t in ['Solo POLYGON, y solo USDT o USDC — lo impone Cryptomate, no lo elegimos nosotros.',
          'Prepago: la tarjeta gasta lo que se le carga. No hay crédito.',
          'Límites por tarjeta: 1.000 al día · 5.000 a la semana · 20.000 al mes.',
          'El precio del ORIGEN sale del oro: la onza dividida entre 31,1035 y entre 55.']:
    c.setFillColorRGB(*ORO); c.setFont(SANS, 8)
    c.drawString(M, y, '·')
    y = parrafo(t, y, x=M + 4 * mm, ancho=ANCHO_TXT - 4 * mm, tam=8.6, inter=11.6, color=BRUMA)
    y -= 2

y -= 6 * mm
hilo(y); y -= 12 * mm
sello('El punto delicado', y, color=AMBAR); y -= 9 * mm
y = parrafo(
    'La recarga tiene dos mitades que no son atómicas: primero se cobra el ORIGEN en nuestra '
    'cadena, después se libera el USDT en Polygon. Si la segunda falla, el dinero ya salió. '
    'Eso está previsto —la recarga queda en estado «debited» y se puede retomar— pero es '
    'exactamente lo que pasó las dos veces, y el rescate no se disparó solo.',
    y, tam=9.4, inter=13)

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# 4 · HALLAZGOS
# ══════════════════════════════════════════════════════════════════════════
y = AL - 30 * mm
sello('Cuatro', y); y -= 10 * mm
titulo('Hallazgos', y, tam=19); y -= 8 * mm
hilo(y); y -= 14 * mm

y = hallazgo('Grave', ROJO, 'Dos recargas cobradas y no entregadas', [
    '82 ORIGEN (207,12 dólares) salieron de dos personas y nunca llegaron a una tarjeta. El '
    'motivo fue el proveedor de Polygon: Alchemy dejó de responder y el reintento se agotó.',
    'El proveedor ya se arregló el 12 de agosto —se le pusieron varios sitios a los que ir— '
    'pero nadie volvió a rescatar las dos recargas que se habían quedado por el camino. Se '
    'arregló la causa y no se atendió al afectado.'], y)

y = hallazgo('Grave', ROJO, 'El tesoro de Polygon tiene 6,27 dólares', [
    'De ahí sale cada recarga de cada tarjeta. La siguiente persona que quiera cargar veinte '
    'dólares no va a poder, y el error que va a ver no le va a explicar por qué.',
    'Además, mientras siga así, las dos recargas atascadas tampoco se pueden completar: se '
    'deben 207,12 dólares y hay 6,27. Hay 0,85 POL para el gas, que alcanza para un rato.'], y)

y = hallazgo('Grave', ROJO, 'Nadie ha comprado nunca con una tarjeta', [
    'Se recorrieron las veinticuatro tarjetas una por una preguntándole a Cryptomate por sus '
    'movimientos: cero, en todas. Hay 110,61 dólares cargados en cinco tarjetas y ninguno se '
    'ha gastado.',
    'El tramo final —que la tarjeta pase en un comercio de verdad— no está probado. Todo lo '
    'demás sí. Pero es justo lo único que la gente va a hacer con ella.'], y)

y = hallazgo('Serio', AMBAR, 'Cryptomate no nos ha llamado nunca', [
    'La llave del webhook está puesta y el endpoint está escrito, pero en la base no hay ni '
    'un solo aviso recibido desde que existe. O no está configurado del lado de ellos, o la '
    'dirección que tienen apuntada no es la nuestra.',
    'Sin eso, un movimiento en la tarjeta no llega solo a la app: hay que preguntarle a '
    'Cryptomate cada vez.'], y)

pie_pagina(); c.showPage(); fondo()

y = AL - 30 * mm
sello('Hallazgos · continuación', y, color=HUMO); y -= 14 * mm

y = hallazgo('Serio', AMBAR, 'Dos tarjetas vivas fuera de nuestro control', [
    'Cryptomate tiene 26 tarjetas activas y nuestra base conoce 24. Las dos que faltan están '
    'a nombre de Lennie Dukes (····5572) y Jose Ordonez (····1236), y las dos están activas.',
    'No se pueden congelar desde la app, no se les pueden cambiar los límites y no aparecen '
    'en ningún listado nuestro. Si una se pierde, no hay botón para apagarla: hay que entrar '
    'al panel de Cryptomate a mano.'], y)

y = hallazgo('Serio', AMBAR, 'No hay tope por compra', [
    'Los límites por día, semana y mes están puestos. El de por compra está sin poner. Una '
    'sola compra puede llevarse los mil dólares del día de una vez.',
    'Es el límite más barato de activar y el que más duele no tener el día que alguien '
    'consigue unos datos de tarjeta.'], y)

y = hallazgo('Riesgo', AMBAR, 'Todo depende de Polygon', [
    'Se le preguntó a Cryptomate: la única red por la que acepta recargas es Polygon, con '
    'USDT o USDC. No es decisión nuestra.',
    'El producto depende de una cadena ajena, de su gas y de que nuestra billetera de allá '
    'tenga fondos. Cualquier problema en Polygon es un problema nuestro sin que podamos '
    'hacer nada — y eso ya pasó una vez, con las dos recargas de este informe.'], y)

y = hallazgo('Menor', HUMO, 'El rescate solo existe en el teléfono', [
    'Hay una vía para retomar una recarga a medias, y funciona: la pantalla de recarga de la '
    'app la llama al abrirse. Pero la billetera web no la llama nunca.',
    'Quien se quedó a medias desde el navegador no tiene forma de recuperarse solo.'], y)

y = hallazgo('Menor', HUMO, 'CORREO_SOPORTE no está puesta', [
    'El código la usa. Sin ella, los avisos que deberían llegarle a soporte no tienen a '
    'dónde ir. Se arregla en un minuto.'], y)

y = hallazgo('Sano', JADE, 'La integración, por lo demás, está completa', [
    'Emitir, ver el número, PIN, congelar y descongelar, cambiar límites, reemitir con número '
    'nuevo, quitar el bloqueo del emisor, configurar 3D Secure, teléfono para los códigos, '
    'historial, detalle de un movimiento, gastado contra los límites y estado de cuenta en '
    'CSV. Todo cableado, y pidiendo contraseña donde debe.',
    'Emitir exige identidad aprobada. Y el fondeo apunta bien a la cadena 5550: el comentario '
    'del código que dice 8532 quedó viejo, pero la configuración es correcta.'], y)

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# 5 · QUÉ TENEMOS DE CRYPTOMATE
# ══════════════════════════════════════════════════════════════════════════
y = AL - 30 * mm
sello('Cinco', y); y -= 10 * mm
titulo('Qué nos da Cryptomate, y qué no', y, tam=19); y -= 8 * mm
hilo(y); y -= 8 * mm

y = parrafo('Preguntado a su API el 27 de agosto. No es lo que dice su folleto: es lo que '
            'responde nuestra cuenta.', y, tam=9, inter=12.6, color=HUMO)
y -= 6 * mm

anchos = [58 * mm, 30 * mm, ANCHO_TXT - 88 * mm]
c.setFillColorRGB(*HUMO); c.setFont(SANS_B, 7.2)
fila_tabla([' '.join('QUÉ'), ' '.join('HOY'), ' '.join('DETALLE')], anchos, y, color=HUMO, fuente=SANS_B, tam=7.2)
y -= 5
hilo(y, color=ORO, alpha=0.3); y -= 11

for que, val, col, det in [
    ('Tarjeta virtual Visa', 'sí', JADE, '26 emitidas, todas de tipo «Virtual»'),
    ('Tarjeta física', 'no', ROJO, 'la cuenta no ofrece ninguna'),
    ('Modelo', 'prepago', JADE, '«TopUp» — gasta lo cargado, sin crédito'),
    ('Recarga', 'solo Polygon', AMBAR, 'USDT y USDC, ninguna otra red'),
    ('Límite día / semana / mes', 'sí', JADE, '1.000 · 5.000 · 20.000'),
    ('Límite por compra', 'sin poner', ROJO, 'se puede configurar, no está'),
    ('Congelar · reemitir · PIN', 'sí', JADE, 'por API, ya cableado en el backend'),
    ('3D Secure', 'sí', JADE, 'configurable por tarjeta'),
    ('Apple Pay · Google Pay', 'no', ROJO, 'por eso la carta a los usuarios lo aclara'),
    ('Webhooks', 'sin llegar', ROJO, 'cero avisos recibidos desde siempre'),
    ('Entorno de pruebas', 'sin confirmar', AMBAR, 'hoy cada prueba cuesta dinero real'),
    ('Campo «ramps»', 'sin averiguar', AMBAR, 'aparece en su respuesta; puede ser una pasarela'),
]:
    y = fila_tabla([que, (val, col), det], anchos, y)
    hilo(y + 8, color=BRUMA, alpha=0.09, grosor=0.3)

y -= 8 * mm
hilo(y); y -= 12 * mm
sello('El costo', y, color=HUMO); y -= 9 * mm
y = parrafo(
    'Lo que Cryptomate cobra por emitir y por cada recarga no está escrito en ningún sitio '
    'del repositorio y no se puede leer desde su API. Es una de las cosas que hay que '
    'preguntar y dejar por escrito: sin eso no se puede saber si el producto gana o pierde '
    'dinero por cada tarjeta.', y, tam=9.4, inter=13, color=AMBAR)

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# 6 · TODO LO QUE PODEMOS MEJORAR
# ══════════════════════════════════════════════════════════════════════════
y = AL - 30 * mm
sello('Seis', y); y -= 10 * mm
titulo('Todo lo que podemos mejorar', y, tam=19); y -= 8 * mm
hilo(y); y -= 12 * mm

grupos = [
    ('Que el dinero no se pierda por el camino', [
        ('Un vigilante de recargas a medias', 'Un proceso que cada pocos minutos busque recargas en «debited» y las intente completar. Hoy el rescate solo ocurre si la persona abre la pantalla de recarga en el teléfono. Con esto, las dos de este informe se habrían resuelto solas.'),
        ('Avisar cuando una recarga se atasca', 'Si el USDT no sale, que le llegue un correo a soporte y otro a la persona. Hoy la persona se queda mirando una pantalla y nadie de la casa se entera.'),
        ('Devolver automáticamente si no se puede completar', 'Si tras varios intentos el USDT no sale, devolver el ORIGEN a la billetera de la persona y cerrar la recarga como fallida. Vale más devolver de más que dejar a alguien esperando 27 días.'),
        ('Comprobar el tesoro ANTES de cobrar', 'Hoy se cobra el ORIGEN y luego se descubre que no hay USDT. Mirar el saldo del tesoro antes de tocar el dinero de nadie evita el problema entero.'),
    ]),
    ('Que no se caiga por depender de otros', [
        ('Vigilar el saldo del tesoro', 'Un aviso cuando el USDT baje de un mínimo, y otro cuando el POL del gas baje. Hoy nadie se entera hasta que falla una recarga.'),
        ('Más de un proveedor de Polygon', 'Ya se hizo para el vigilante de depósitos el 12 de agosto. Conviene comprobar que la recarga de tarjeta use ese mismo camino con varios sitios y no uno solo.'),
        ('Un panel de operación', 'Una pantalla interna que muestre el saldo del tesoro, las recargas del día, las atascadas y las tarjetas emitidas. Hoy todo esto solo se ve preguntándole a la base a mano.'),
    ]),
]

for tit_g, items in grupos:
    sello(tit_g, y, color=ORO, tam=7.2); y -= 10 * mm
    for t, d in items:
        c.setFillColorRGB(*ORO); c.setFont(SANS, 9); c.drawString(M, y, '·')
        c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 9.4)
        c.drawString(M + 4.5 * mm, y, t)
        y -= 12
        y = parrafo(d, y, x=M + 4.5 * mm, ancho=ANCHO_TXT - 4.5 * mm, tam=8.8, inter=12)
        y -= 5 * mm
    y -= 2 * mm

pie_pagina(); c.showPage(); fondo()

y = AL - 30 * mm
sello('Todo lo que podemos mejorar · continuación', y, color=HUMO); y -= 14 * mm

grupos2 = [
    ('Que sea más seguro', [
        ('Poner el tope por compra', 'Se hace por API y la ruta ya existe. Diez minutos de trabajo.'),
        ('Adoptar o cancelar las dos tarjetas sueltas', 'Vivas y sin control no se quedan. O entran a nuestra base y se pueden congelar, o se cancelan.'),
        ('Cuadrar tarjetas contra Cryptomate, sola y a diario', 'Una comprobación automática que avise cuando su lista y la nuestra no coincidan. Así una tarjeta fuera de control se detecta al día siguiente y no cuando alguien va a mirar.'),
        ('Registrar quién mira un número de tarjeta', 'Ver el PAN y el PIN pide contraseña, que está bien. Falta dejar anotado cada vez que se hace, para poder mirar atrás si algo pasa.'),
    ]),
    ('Que se entienda mejor', [
        ('Mensajes de error que digan qué pasó', 'Hoy si el tesoro no tiene fondos, la persona ve un error genérico. Debería decir «esto es nuestro, no tuyo, y tu ORIGEN no se movió».'),
        ('Enseñar el estado de la recarga', 'Que la pantalla diga en qué paso va —cobrado, enviando, acreditado— en vez de una espera muda.'),
        ('El rescate también en la web', 'La billetera web no llama nunca a la vía de retomar. Es una línea.'),
    ]),
    ('Que se pueda medir', [
        ('Guardar cada llamada a Cryptomate', 'Hoy si algo falla, el motivo solo queda en el registro de Heroku, que se borra. Conviene guardarlo junto a la tarjeta.'),
        ('Saber cuánto cuesta cada tarjeta', 'Preguntar las tarifas a Cryptomate y dejarlas escritas, para poder decir si el producto gana o pierde por cada emisión y por cada recarga.'),
    ]),
]

for tit_g, items in grupos2:
    sello(tit_g, y, color=ORO, tam=7.2); y -= 10 * mm
    for t, d in items:
        c.setFillColorRGB(*ORO); c.setFont(SANS, 9); c.drawString(M, y, '·')
        c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 9.4)
        c.drawString(M + 4.5 * mm, y, t)
        y -= 12
        y = parrafo(d, y, x=M + 4.5 * mm, ancho=ANCHO_TXT - 4.5 * mm, tam=8.8, inter=12)
        y -= 5 * mm
    y -= 2 * mm

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# 7 · QUÉ PEDIRLE A CRYPTOMATE
# ══════════════════════════════════════════════════════════════════════════
y = AL - 30 * mm
sello('Siete', y); y -= 10 * mm
titulo('Qué pedirle a Cryptomate', y, tam=19); y -= 8 * mm
hilo(y); y -= 8 * mm
y = parrafo('Por orden de lo que más cambia el producto. Las tres primeras son las que valen '
            'la reunión.', y, tam=9, inter=12.6, color=HUMO)
y -= 8 * mm

for i, (t, d) in enumerate([
    ('Tarjetas físicas',
     'Es la diferencia entre comprar en línea y poder pagar en la tienda de la esquina o sacar efectivo. Preguntar si las emiten, a qué países envían, cuánto cuesta cada una y cuánto tardan en llegar.'),
    ('Apple Pay y Google Pay',
     'Sin esto la tarjeta virtual solo sirve para compras en línea. Con esto sirve para pagar con el teléfono en cualquier lado, y deja de hacer falta la física para la mayoría de la gente. Preguntar si soportan tokenización y qué hace falta de nuestro lado.'),
    ('Más redes para recargar — o dólares por transferencia',
     'Hoy todo depende de Polygon. Preguntar qué otras redes aceptan, y sobre todo si aceptan un depósito en dólares por transferencia bancaria: eso nos sacaría de la cripto para el fondeo y haría el puente mucho más simple y más barato de sostener.'),
]):
    caja(M, y - 26 * mm, ANCHO_TXT, 27 * mm, borde=ORO, alpha_borde=0.4, relleno=ORO, alpha_relleno=0.05)
    c.setFillColorRGB(*ORO); c.setFont(SANS_B, 13)
    c.drawString(M + 6 * mm, y - 9 * mm, str(i + 1))
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 10.6)
    c.drawString(M + 14 * mm, y - 9 * mm, t)
    parrafo(d, y - 16 * mm, x=M + 14 * mm, ancho=ANCHO_TXT - 20 * mm, tam=8.6, inter=11.6)
    y -= 33 * mm

y -= 2 * mm
sello('Y de segunda vuelta', y, color=HUMO); y -= 10 * mm
for t, d in [
    ('Los webhooks', 'Confirmar que estén configurados de su lado y a qué dirección apuntan. Hoy no nos ha llegado ni uno.'),
    ('Las tarifas', 'Cuánto cobran por emitir, por recargar y por cada compra. No está escrito en ninguna parte nuestra.'),
    ('Un entorno de pruebas', 'Hoy cada prueba cuesta dinero real.'),
    ('Límites más altos', 'Mil al día está bien para empezar y se queda corto rápido.'),
    ('Qué es el campo «ramps»', 'Aparece en su respuesta de recargas. Si es una pasarela de compra con tarjeta o transferencia, cambia el producto entero.'),
    ('Las dos tarjetas de más', 'De dónde salieron ····5572 y ····1236, para cancelarlas o adoptarlas con conocimiento.'),
]:
    c.setFillColorRGB(*ORO); c.setFont(SANS, 9); c.drawString(M, y, '·')
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 9.2)
    c.drawString(M + 4.5 * mm, y, t)
    y -= 11.5
    y = parrafo(d, y, x=M + 4.5 * mm, ancho=ANCHO_TXT - 4.5 * mm, tam=8.6, inter=11.4)
    y -= 4 * mm

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# 8 · EL ORDEN
# ══════════════════════════════════════════════════════════════════════════
y = AL - 30 * mm
sello('Ocho', y); y -= 10 * mm
titulo('El orden que yo seguiría', y, tam=19); y -= 8 * mm
hilo(y); y -= 14 * mm

pasos = [
    ('Resolver lo de las dos personas', 'Es dinero de otros y lleva casi un mes. Decidir si se devuelve el ORIGEN o se completa la recarga, comprobar antes en qué quedó su saldo tras el reinicio de la cadena, y avisarles. Esto va primero de todo, aunque técnicamente sea lo menos urgente.', ROJO),
    ('Fondear el tesoro de Polygon', 'Nada de lo demás importa mientras haya seis dólares. Con 26 tarjetas y un límite de mil al día, unos pocos miles de dólares dan margen para empezar sin sustos. Es la decisión de José porque es dinero.', ROJO),
    ('Hacer UNA compra real', 'Cargar una tarjeta, ir a una tienda en línea y comprar algo de cinco dólares. Hasta que eso pase, no sabemos si el producto funciona — y si falla, mejor que le falle a alguien de la casa que a un cliente.', ROJO),
    ('Poner el tope por compra', 'Se hace por API, la ruta ya existe. Diez minutos.', AMBAR),
    ('Resolver las dos tarjetas sueltas', 'O entran a nuestra base o se cancelan.', AMBAR),
    ('Poner CORREO_SOPORTE', 'Un minuto.', HUMO),
    ('Montar el vigilante de recargas a medias', 'Para que lo de este informe no pueda repetirse: que el sistema se rescate solo en vez de esperar a que alguien abra una pantalla.', AMBAR),
    ('Y después sí, la reunión con Cryptomate', 'Con los números en la mano y una compra real hecha, la conversación sobre físicas y Apple Pay se tiene desde otro lugar.', HUMO),
]
for i, (t, d, col) in enumerate(pasos):
    c.setFillColorRGB(*col); c.setFont(SANS_B, 12)
    c.drawString(M, y, str(i + 1))
    c.setFillColorRGB(*CREMA); c.setFont(SANS_B, 10)
    c.drawString(M + 8 * mm, y, t)
    y -= 12.5
    y = parrafo(d, y, x=M + 8 * mm, ancho=ANCHO_TXT - 8 * mm, tam=8.8, inter=12)
    y -= 5.5 * mm

y -= 2 * mm
hilo(y); y -= 12 * mm
caja(M, y - 22 * mm, ANCHO_TXT, 23 * mm, borde=ORO, alpha_borde=0.4)
parrafo('Los pasos 4, 5, 6 y 7 se pueden hacer hoy mismo sin que nadie tome ninguna decisión. '
        'El 2 es de José porque es dinero. El 1 necesita una decisión suya y una llamada. Y el '
        '3 conviene que lo haga una persona con una tarjeta en la mano.',
        y - 8 * mm, x=M + 6 * mm, ancho=ANCHO_TXT - 12 * mm, tam=9, inter=12.4, color=CREMA)

pie_pagina(); c.showPage(); fondo()


# ══════════════════════════════════════════════════════════════════════════
# CIERRE
# ══════════════════════════════════════════════════════════════════════════
y = AL - 60 * mm
sello('Sobre este informe', y, color=HUMO); y -= 12 * mm
y = parrafo(
    'Todas las cifras de este documento se midieron el 27 de agosto de 2026 preguntándole a '
    'la API de Cryptomate y leyendo la base de datos de producción. Ninguna sale de leer el '
    'código ni de recordar una conversación.',
    y, tam=9.6, inter=13.6)
y -= 6 * mm
y = parrafo(
    'Donde algo no se pudo comprobar, está dicho: las tarifas de Cryptomate, si tienen '
    'entorno de pruebas, y qué es el campo «ramps». Preferimos dejar tres huecos marcados a '
    'llenarlos con una suposición que parezca un dato.',
    y, tam=9.6, inter=13.6)
y -= 10 * mm
hilo(y); y -= 10 * mm
c.setFillColorRGB(*HUMO); c.setFont(SANS, 8)
c.drawString(M, y, 'Orden Global Corp · Próspera, Roatán, Honduras')
pie_pagina()

c.save()
print(f'{SALIDA}  ·  {SALIDA.stat().st_size:,} bytes  ·  {pagina[0]} páginas')
