#!/usr/bin/env python3
"""EL PLAN DE REINICIO DE LA 5550, en PDF.

    python3 documentos/armar-plan-reinicio.py

Es la version leible de infra/migracion-cadena/PLAN-REINICIO-5550.md — el mismo
contenido, para llevar a una reunion. La fuente de verdad sigue siendo el .md:
si los dos se separan, manda el .md, porque es el que vive al lado del codigo
que lo ejecuta.

Igual que el informe de las cadenas, esto NO mide nada al correr: dibuja lo que
ya se midio. Las cifras vienen de la investigacion del 25 de agosto.
"""
import textwrap
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as lienzo

AQUI = Path(__file__).parent
MARCAS = AQUI.parent / 'apps-web' / 'veta-wallet' / 'assets'
SALIDA = AQUI / 'Orden-Global-Plan-Reinicio-5550.pdf'

A, AL = A4
FECHA = '25 de agosto de 2026'

POZO = (0.008, 0.106, 0.110)
ORO = (0.788, 0.663, 0.380)
CREMA = (0.953, 0.925, 0.851)
BRUMA = (0.682, 0.780, 0.765)
HUMO = (0.431, 0.576, 0.561)
JADE = (0.243, 0.851, 0.627)
AMBAR = (0.925, 0.706, 0.298)
ROJO = (0.894, 0.341, 0.294)

SERIF, SANS = 'Times-Roman', 'Helvetica'
SERIF_B, SANS_B = 'Times-Bold', 'Helvetica-Bold'
for archivo, nombre in [('Cinzel-Regular.ttf', 'Marca'), ('Cinzel-Bold.ttf', 'MarcaB')]:
    ruta = MARCAS / 'fonts' / archivo
    if ruta.exists():
        try:
            pdfmetrics.registerFont(TTFont(nombre, str(ruta)))
            if nombre == 'Marca':
                SERIF = 'Marca'
            else:
                SERIF_B = 'MarcaB'
        except Exception:
            pass

c = lienzo.Canvas(str(SALIDA), pagesize=A4)
c.setTitle('Orden Global · plan de reinicio de la cadena 5550')
c.setAuthor('Nexus Coder')
c.setSubject('Consolidar el ORIGEN en el tesoro · escrito antes de ejecutar nada')

pagina = [0]


def fondo():
    c.setFillColorRGB(*POZO)
    c.rect(0, 0, A, AL, fill=1, stroke=0)


def hilo(y, x0=18 * mm, x1=None, color=ORO, alpha=0.30, grosor=0.6):
    c.saveState()
    c.setStrokeColorRGB(*color)
    c.setStrokeAlpha(alpha)
    c.setLineWidth(grosor)
    c.line(x0, y, x1 or (A - 18 * mm), y)
    c.restoreState()


def sello(txt, y, x=18 * mm, color=ORO):
    c.setFillColorRGB(*color)
    c.setFont(SANS_B, 8.4)
    c.drawString(x, y, ' '.join(txt.upper()))


def titulo(txt, y, tam=27, x=18 * mm, color=CREMA):
    c.setFillColorRGB(*color)
    c.setFont(SERIF_B, tam)
    c.drawString(x, y, txt)


def parrafo(txt, y, x=18 * mm, ancho=78, tam=11, inter=16, color=BRUMA):
    c.setFillColorRGB(*color)
    c.setFont(SANS, tam)
    for linea in textwrap.wrap(txt, ancho):
        c.drawString(x, y, linea)
        y -= inter
    return y


def cifra(valor, pie, x, y, tam=27, color=ORO, anchoPie=20):
    c.setFillColorRGB(*color)
    c.setFont(SERIF_B, tam)
    c.drawString(x, y, valor)
    c.setFillColorRGB(*HUMO)
    c.setFont(SANS, 7.4)
    yy = y - 11
    for linea in textwrap.wrap(pie, anchoPie):
        c.drawString(x, yy, linea)
        yy -= 9.2
    return yy


def tabla(cabecera, filas, y, x=18 * mm, anchos=None, tam=9.6, alto=17, envolver=None):
    """Tabla sobria. `envolver` dice cuantos caracteres caben en cada columna:
       sin eso, una celda larga se monta encima de la de al lado y el informe
       parece descuidado justo donde hay que confiar en el."""
    anchos = anchos or [40 * mm] * len(cabecera)
    c.setFillColorRGB(*ORO)
    c.setFont(SANS_B, 8.2)
    xx = x
    for i, t in enumerate(cabecera):
        c.drawString(xx, y, t.upper())
        xx += anchos[i]
    y -= 5
    hilo(y, x, x + sum(anchos), alpha=0.35)
    y -= alto
    for fila in filas:
        trozos = []
        for i, celda in enumerate(fila):
            lim = (envolver or [999] * len(fila))[i]
            trozos.append(textwrap.wrap(str(celda), lim) or [''])
        altoFila = max(len(t) for t in trozos)
        xx = x
        for i, ls in enumerate(trozos):
            col = CREMA if i == 0 else BRUMA
            fuente = SANS_B if i == 0 else SANS
            c.setFillColorRGB(*col)
            c.setFont(fuente, tam)
            yy = y
            for l in ls:
                c.drawString(xx, yy, l)
                yy -= 12
            xx += anchos[i]
        y -= (altoFila - 1) * 12 + 4
        hilo(y, x, x + sum(anchos), color=BRUMA, alpha=0.10)
        y -= alto - 4
    return y


def bloque(titulo_txt, cuerpo, y, color=ORO, x=18 * mm, ancho=None):
    ancho = ancho or (A - 36 * mm)
    ls = textwrap.wrap(cuerpo, 73)
    alto = 17 + len(ls) * 14.4 + 9
    c.saveState()
    c.setFillColorRGB(*color)
    c.setFillAlpha(0.07)
    c.rect(x, y - alto + 12, ancho, alto, fill=1, stroke=0)
    c.setFillAlpha(1)
    c.setStrokeColorRGB(*color)
    c.setLineWidth(2)
    c.line(x, y - alto + 12, x, y + 12)
    c.restoreState()
    c.setFillColorRGB(*color)
    c.setFont(SANS_B, 9.4)
    c.drawString(x + 8, y, titulo_txt.upper())
    y -= 16
    c.setFillColorRGB(*CREMA)
    c.setFont(SANS, 10.4)
    for l in ls:
        c.drawString(x + 8, y, l)
        y -= 14.4
    return y - 11


def pasos(items, y, x=18 * mm, color=ORO):
    """Una lista numerada. El numero en oro y a la izquierda del texto: en un
       procedimiento el orden ES el contenido, y tiene que verse de un vistazo."""
    for i, (t, d) in enumerate(items, 1):
        c.setFillColorRGB(*color)
        c.setFont(SERIF_B, 15)
        c.drawString(x, y, str(i))
        c.setFillColorRGB(*CREMA)
        c.setFont(SANS_B, 10.4)
        c.drawString(x + 14, y, t)
        y -= 14
        if d:
            c.setFillColorRGB(*BRUMA)
            c.setFont(SANS, 9.8)
            for l in textwrap.wrap(d, 72):
                c.drawString(x + 14, y, l)
                y -= 13
        y -= 9
    return y


def pie():
    pagina[0] += 1
    hilo(14 * mm, alpha=0.18)
    c.setFillColorRGB(*HUMO)
    c.setFont(SANS, 6.8)
    c.drawString(18 * mm, 10 * mm,
                 f'ORDEN GLOBAL · plan de reinicio de la 5550 · {FECHA} · NO EJECUTADO')
    c.drawRightString(A - 18 * mm, 10 * mm, str(pagina[0]))
    c.showPage()


# ═════════════════════════════════════════════════════════════════════════════
# PORTADA
# ═════════════════════════════════════════════════════════════════════════════
fondo()
c.saveState()
c.setFillColorRGB(*ORO)
c.setFillAlpha(0.05)
c.circle(A * 0.84, AL * 0.78, 58 * mm, fill=1, stroke=0)
c.setFillAlpha(0.09)
c.circle(A * 0.84, AL * 0.78, 26 * mm, fill=1, stroke=0)
c.restoreState()

sello('Orden Global · procedimiento', AL - 32 * mm)
titulo('Reinicio de la 5550', AL - 52 * mm, tam=32)
titulo('El ORIGEN, al tesoro', AL - 68 * mm, tam=32, color=ORO)
hilo(AL - 76 * mm)
y = parrafo(
    'Hay 17.401,93 ORIGEN fuera del tesoro y ninguna vía de transacción para traerlos. '
    'Este documento dice qué se haría, en qué orden, qué se rompe y cómo se vuelve atrás. '
    'Está escrito ANTES de tocar nada, por pedido expreso.',
    AL - 86 * mm, ancho=76, tam=10.4, inter=15, color=CREMA)

y -= 16
y = bloque('estado de este documento',
           'NO EJECUTADO. Ninguna etapa se ha corrido. La etapa 0 —el respaldo— es la '
           'condición: sin ella comprobada, el corte no empieza.',
           y, color=ROJO)

# Las tres cifras van abajo y no pegadas al bloque: son el resumen que se lee
# de lejos, y necesitan aire para funcionar como resumen.
yc = 92 * mm
hilo(yc + 22 * mm, alpha=0.22)
cifra('17.226,93', 'ORIGEN que volverían al tesoro', 18 * mm, yc, tam=30)
cifra('1', 'transacción en toda la vida de la cadena: eso es lo único que se pierde',
      88 * mm, yc, tam=30, color=JADE, anchoPie=28)
cifra('7', 'nodos que hay que vaciar y volver a arrancar, uno por uno',
      142 * mm, yc, tam=30, color=AMBAR, anchoPie=28)

parrafo('Fuente: infra/migracion-cadena/PLAN-REINICIO-5550.md · investigación del 25 de '
        'agosto de 2026 · ninguna cifra de este documento se midió al generarlo.',
        42 * mm, ancho=96, tam=8.6, inter=12, color=HUMO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 1 · POR QUÉ
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('uno · por qué', AL - 26 * mm)
titulo('Por qué hay que reiniciar', AL - 40 * mm)
hilo(AL - 47 * mm)

y = parrafo(
    'Porque no hay otra forma de traer ese ORIGEN. Se investigó cada peso antes de '
    'proponer esto, y el problema no es de permisos: es que las llaves no aparecen y los '
    'contratos no tienen puerta de salida.',
    AL - 58 * mm)

y -= 8
y = tabla(['Dónde está', 'ORIGEN', 'Por qué no sale'],
          [['Pool AUKA/WORIGEN', '16.259,23',
            'Exige las 31 posiciones de liquidez, todas de 0x3063a26b… — su llave no aparece'],
           ['Contrato 0xa2218053…', '839,17',
            '12 KB de código, no es un pool V3; sin leerlo no se sabe si tiene salida'],
           ['12 tenedores WORIGEN', '128,53', 'Haría falta la llave de cada uno'],
           ['155 semillas de gas', '173,93', 'Ídem, y ese 1 ORIGEN es su gas'],
           ['Validadores', '1,07', 'Comisiones cobradas legítimamente. Se quedan']],
          y, anchos=[40 * mm, 26 * mm, 108 * mm], envolver=[20, 12, 56])

y -= 10
y = bloque('dónde se buscó la llave, y no estaba',
           'AWS Secrets Manager: vacío en las dos regiones. Parameter Store: ocho entradas, '
           'todas llaves de validador. node1 y node7 en /root /opt /srv /home: ningún '
           'keystore, ningún UTC--*, ningún .env con llave. El repositorio: sólo datos. '
           'No está en la infraestructura — lo cual es correcto, pero significa que la '
           'tiene una persona o no la tiene nadie.',
           y, color=AMBAR)

y = bloque('por qué ahora y no dentro de seis meses',
           'La 5550 tiene UNA transacción en toda su vida: la transferencia de 20 ORIGEN del '
           'bloque 14.955. El precio de reiniciar hoy es esa transferencia y reindexar un '
           'explorador. Con gente moviendo dinero de verdad, este mismo plan sería '
           'impensable. La ventana está abierta y se cierra sola.',
           y, color=JADE)

y = bloque('y la posición es de prueba',
           'Ese es el dato que cambia el cálculo. Si el pool fuera un mercado con gente '
           'dentro, la respuesta sería seguir buscando la llave. Siendo de prueba, '
           'reescribir el estado sale más barato que perseguir una llave que quizá no '
           'exista en ningún lado.',
           y, color=ORO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 2 · QUÉ SE AFECTA
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('dos · el impacto', AL - 26 * mm)
titulo('Qué se afecta y qué no', AL - 40 * mm)
hilo(AL - 47 * mm)

y = AL - 58 * mm
y = bloque('chainlist NO se afecta',
           'Los tres PR están fusionados (#8594, #8612, #8613). El JSON publicado lleva '
           'chainId, networkId, las URLs del RPC, ORIGEN con sus 18 decimales, el ícono y el '
           'explorador. NO lleva hash de génesis ni datos de bloques. Conservando el 5550 y '
           'las mismas URLs, la entrada sigue siendo correcta: no hay que abrir ningún PR. '
           'Queda dicho aquí para que nadie abra uno por las dudas.',
           y, color=JADE)

y -= 2
sello('tampoco se afecta', y)
y -= 14
for punto in [
    'Las direcciones de los contratos, que viajan en el alloc del génesis nuevo.',
    'Los saldos de todos los tokens ERC-20.',
    'Las llaves de validador: las cuatro de Parameter Store siguen sirviendo.',
    'La wallet, Ordenex y la app, que apuntan al mismo RPC de siempre.',
    'Nada del código fija el hash del génesis ni una altura de arranque. Se buscó en '
    'infra, apps-web y el código de la app: cero coincidencias.',
]:
    c.setFillColorRGB(*ORO)
    c.setFont(SANS_B, 10)
    c.drawString(18 * mm, y, '·')
    y = parrafo(punto, y, x=18 * mm + 9, ancho=88, tam=9.8, inter=13.4)
    y -= 3

y -= 8
sello('lo que sí se rompe', y)
y -= 14
y = tabla(['Se rompe', 'Cómo se atiende'],
          [['Besu no arranca con datos viejos',
            'Vaciar el directorio de los siete nodos. Uno mal borrado no entra al consenso, y no lo dice claro'],
           ['Ordenscan sirve 91.000 bloques fantasma',
            'Vaciar su base y reindexar desde cero ANTES de levantar el mantenimiento'],
           ['MetaMask guarda el nonce',
            'Quien la haya usado debe borrar datos de actividad. A la app no le pasa: el backend lee el nonce de la cadena'],
           ['Comprobantes de pago del chat',
            'PULSE2CHAT guarda el hash en el mensaje. Esos enlaces quedan muertos. Hoy son muy pocos'],
           ['Se pierden 91.000 bloques',
            'En la práctica: una transferencia de 20 ORIGEN y unos gastos de gas']],
          y, anchos=[60 * mm, 114 * mm], envolver=[30, 60])

y -= 6
y = bloque('qué ve la gente',
           'Media hora con la wallet en mantenimiento, de noche. Al volver, los saldos son '
           'los mismos y las direcciones son las mismas: para quien usa la app, no cambió '
           'nada. Los únicos que notan algo son quien haya agregado la 5550 a MetaMask y '
           'quien tenga un enlace a un comprobante de pago viejo del chat.',
           y, color=ORO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 3 · EL GÉNESIS NUEVO
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('tres · el génesis', AL - 26 * mm)
titulo('El génesis nuevo', AL - 40 * mm)
hilo(AL - 47 * mm)

y = parrafo(
    'Se construye sobre la FOTO DEL ESTADO DE HOY, no sobre el génesis viejo: hay que '
    'conservar lo que pasó en estos diez días.',
    AL - 58 * mm)

y -= 6
sello('lo que cambia', y)
y -= 16
y = pasos([
    ('Se consolidan en el tesoro 0x3d5510e5…',
     'Los saldos nativos del pool (16.259,23), del contrato 0xa2218053… (839,17) y de los '
     'doce tenedores de WORIGEN (128,53). En total, 17.226,93 ORIGEN.'),
    ('El wrapper queda a cero por LOS DOS LADOS',
     'Su ORIGEN y su storage de saldos se vacían a la vez o ninguno. Dejarlo con WORIGEN '
     'emitido y sin respaldo lo vuelve insolvente — que es exactamente lo que el corte '
     'anterior se cuidó de no hacer.'),
    ('El pool queda sin liquidez',
     'Con ello desaparece el mercado AUKA/WORIGEN. Es la consecuencia buscada: la posición '
     'era de prueba.'),
], y)

y -= 2
sello('lo que NO cambia', y)
y -= 14
for punto in [
    'Las tres asignaciones preservadas de 250.000 millones. Mover el tesoro exige '
    'instrucción escrita de la Junta, y esto no lo es.',
    'El 1 ORIGEN de gas de las 155 billeteras: quitárselo las congela y no recupera nada '
    'que importe — son 173,93 en total.',
    'Los saldos de todos los tokens ERC-20.',
    'El chainId, el networkId, el gasLimit y el precio del gas.',
]:
    c.setFillColorRGB(*ORO)
    c.setFont(SANS_B, 10)
    c.drawString(18 * mm, y, '·')
    y = parrafo(punto, y, x=18 * mm + 9, ancho=88, tam=9.8, inter=13.4)
    y -= 3

y -= 10
y = tabla(['La cuenta', 'ORIGEN', 'Después del reinicio'],
          [['Se consolida al tesoro', '17.226,93', 'Suma al saldo del tesoro'],
           ['Gas de las 155 semillas', '173,93', 'Se queda donde está'],
           ['Comisiones de validador', '1,07', 'Se queda donde está'],
           ['Total fuera del tesoro hoy', '17.401,93', 'Cuadra: 17.226,93 + 173,93 + 1,07']],
          y, anchos=[62 * mm, 32 * mm, 80 * mm], envolver=[30, 16, 40])

y -= 10
y = bloque('la suma tiene que cuadrar al último decimal',
           'Antes y después, el total de ORIGEN de la cadena debe ser idéntico. Si no cuadra, '
           'el génesis está mal y no se despliega. Esta comprobación no es opcional y no se '
           'hace a ojo: la hace un guion.',
           y, color=ROJO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 4 · EL PROCEDIMIENTO
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('cuatro · el procedimiento', AL - 26 * mm)
titulo('Las cuatro etapas', AL - 40 * mm)
hilo(AL - 47 * mm)

y = AL - 58 * mm
sello('etapa 0 · el respaldo, antes de nada', y, color=ROJO)
y -= 16
y = pasos([
    ('Copia del génesis actual', 'De /opt/og5550-real/genesis.json, fuera de las máquinas.'),
    ('Volcado del estado completo', 'A la altura del corte, con su huella.'),
    ('Copia de la base de Ordenscan', ''),
], y, color=ROJO)

y = bloque('sin la etapa 0 no hay vuelta atrás',
           'Es la única etapa que no se puede improvisar después. Si el respaldo no está '
           'hecho Y comprobado, el corte no empieza.',
           y, color=ROJO)

y -= 2
sello('etapa 1 · construir y juzgar el génesis', y)
y -= 16
y = pasos([
    ('construir-genesis-desde-arbol.py sobre la foto', 'Con los cambios de la página anterior.'),
    ('comparar-cadenas.py entre la foto y el génesis nuevo',
     'Tiene que salir idéntico salvo en las direcciones que se consolidan a propósito.'),
    ('Las tres comprobaciones que no perdonan',
     'La suma total de ORIGEN; que el wrapper esté a cero por los dos lados; y que las tres '
     'preservadas sigan con sus 250.000 millones exactos.'),
], y)

y -= 2
sello('etapa 2 · el ensayo, en máquina aparte', y)
y -= 16
y = pasos([
    ('Levantar la cadena en ogb-testnet-2 o -3', 'Las instancias ya existen.'),
    ('Comprobar contra ella',
     'Que el tesoro subió los 17.226,93; que los cinco contratos ERC-20 responden su '
     'emisión; y apuntar la wallet de ensayo y hacer un envío de verdad.'),
], y)

y = bloque('si el ensayo no pasa, se para aquí',
           'Y producción no se ha tocado. Del corte anterior: lo que no se prueba, no '
           'funciona — el aislamiento de las llaves parecía puesto y cada nodo seguía '
           'leyendo las de los otros tres.',
           y, color=AMBAR)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 5 · EL CORTE
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('cinco · el corte', AL - 26 * mm)
titulo('La noche del corte', AL - 40 * mm)
hilo(AL - 47 * mm)

y = parrafo('De noche, y en este orden. Media hora de mantenimiento.', AL - 56 * mm)
y -= 4
y = pasos([
    ('Mantenimiento', 'Backend de la wallet en pausa.'),
    ('Foto final', 'Y su huella al acta.'),
    ('Parar los siete nodos', ''),
    ('Vaciar el directorio de datos de los siete',
     'Comprobar uno por uno que quedó vacío. Un nodo con datos viejos no entra al consenso '
     'y no lo dice claro.'),
    ('Distribuir el génesis nuevo',
     'Comprobar la huella md5 EN CADA NODO, no en el que se subió. Un archivo distinto en '
     'un nodo es una cadena que no arranca.'),
    ('Arrancar los validadores', 'Esperar a que produzcan bloques.'),
    ('Comprobar desde fuera',
     'Altura subiendo, siete validadores, saldo del tesoro correcto, los contratos '
     'responden.'),
    ('Vaciar y reindexar Ordenscan', ''),
    ('Levantar el mantenimiento', ''),
], y)

y -= 6
sello('etapa 4 · después, y esto no lleva orden', y)
y -= 16
for punto in [
    'Aviso a quien haya usado MetaMask: que borre datos de actividad.',
    'Actualizar el informe de las cadenas con las cifras nuevas.',
    'Chainlist: nada que hacer. Repetido aquí a propósito, para que nadie abra un PR.',
]:
    c.setFillColorRGB(*ORO)
    c.setFont(SANS_B, 10)
    c.drawString(18 * mm, y, '·')
    y = parrafo(punto, y, x=18 * mm + 9, ancho=88, tam=9.8, inter=13.4)
    y -= 3
y -= 10

y = bloque('vuelta atrás',
           'Hasta el paso 4 se aborta sin consecuencias: no se ha tocado nada. Después del '
           'paso 4, la vuelta atrás es restaurar el génesis viejo y el volcado de la etapa 0 '
           'en los siete nodos. La historia posterior al corte se pierde — por eso el corte '
           'va de noche y por eso el backend está en mantenimiento.',
           y, color=ROJO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 6 · LO QUE HACE FALTA
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('seis · antes de empezar', AL - 26 * mm)
titulo('Lo que hace falta', AL - 40 * mm)
hilo(AL - 47 * mm)

y = AL - 58 * mm
y = bloque('1 · confirmar que la posición del pool es de prueba',
           'Y que cerrar el mercado AUKA/WORIGEN es aceptable. Ya dicho de palabra; queda '
           'escrito aquí.',
           y, color=ORO)

y = bloque('2 · decidir sobre los 128,53 de los doce tenedores de WORIGEN',
           'Esta sí es una decisión y no una operación técnica: consolidarlos es quitarle a '
           'doce direcciones un saldo que hoy tienen. Si alguna es de una persona de fuera, '
           'esto cambia de naturaleza.',
           y, color=ROJO)

y = bloque('3 · una ventana de corte',
           'Media hora de mantenimiento, de noche.',
           y, color=ORO)

y = bloque('cómo se sabe que salió bien',
           'Cuatro comprobaciones desde fuera, no desde los nodos: la altura sube; responden '
           'los siete validadores; el saldo del tesoro subió exactamente 17.226,93; y los '
           'cinco contratos ERC-20 devuelven su emisión. Si las cuatro pasan, se reindexa '
           'Ordenscan y se levanta el mantenimiento. Si una falla, se vuelve atrás con el '
           'respaldo de la etapa 0.',
           y, color=JADE)

y -= 4
hilo(y)
y -= 18
sello('las dos lecciones del corte anterior, que aquí se aplican', y)
y -= 16
y = bloque('un respaldo que no se comprueba no es un respaldo',
           'La primera extracción de las llaves de validador las truncaba a 62 caracteres en '
           'vez de 64, y nadie lo habría sabido hasta necesitarlas. Por eso aquí la huella '
           'del génesis se comprueba EN CADA NODO.',
           y, color=AMBAR)

y = bloque('esto se hace una vez',
           'Si después aparece la llave de 0x3063a26b…, ya habremos reescrito el estado y esa '
           'llave dará igual. Conviene buscarla antes de la etapa 3, no después.',
           y, color=AMBAR)

y -= 4
y = parrafo(
    'La fuente de verdad de este plan es infra/migracion-cadena/PLAN-REINICIO-5550.md, que '
    'vive al lado del código que lo ejecuta. Si este PDF y ese archivo se separan, manda el '
    'archivo.',
    y, tam=8.6, ancho=96, inter=12, color=HUMO)
pie()

c.save()
print(f'listo: {SALIDA}')
