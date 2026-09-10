#!/usr/bin/env python3
"""EL INFORME DE LAS DOS CADENAS.

    python3 documentos/armar-cadenas.py

══ QUE ES ESTO Y POR QUE NO SE ESCRIBE DE MEMORIA ═══════════════════════════

Un informe sobre el estado de una cadena que se redacta de memoria es una
opinion con formato de PDF. Todos los numeros de aqui se leyeron de las
maquinas y de los RPC el mismo dia, y donde no se pudo comprobar algo se dice
que no se pudo — un hueco declarado vale mas que una cifra bonita inventada.

Los datos vienen de cuatro sitios, todos de primera mano:

  · el RPC publico de la 5550 (altura, validadores, cadencia, contratos);
  · los siete nodos EC2 por AWS SSM (que servicio corre cada uno de verdad);
  · el nodo que todavia sostiene la 8532, por SSM (altura, pares, servicio);
  · el explorador Ordenscan, para comprobar que indexa lo que la cadena dice.

Se guardan en DATOS, con la hora de la lectura. Volver a correr esto NO
recolecta: dibuja lo recolectado. Para actualizar hay que volver a medir y
cambiar DATOS, a proposito — asi un PDF nunca miente por haberse regenerado
en una tarde distinta a la que se midio.
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
SALIDA = AQUI / 'Orden-Global-Cadenas-5550-y-8532.pdf'

A, AL = A4
FECHA = '25 de agosto de 2026'
HORA = '23:52 UTC · despues del reinicio'

# ── la paleta de la casa, la misma de los demas informes ─────────────────────
POZO = (0.008, 0.106, 0.110)
ORO = (0.788, 0.663, 0.380)
OROHI = (0.973, 0.937, 0.812)
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

# ═════════════════════════════════════════════════════════════════════════════
# LO MEDIDO. Cada cifra con su procedencia.
# ═════════════════════════════════════════════════════════════════════════════
DATOS = {
    'c5550': {
        # La cadena se REINICIO el 25-ago a las 23:40 UTC. La altura de aqui es
        # la de la cadena nueva; la vieja murio en el 92.834.
        'altura': 73,
        'genesis': '0x56b3cf56694f61c8a1ff1eae8bb50c57723899a1f493910a59f797b3ce734405',
        'validadores': 7,
        'pares_rpc': 6,
        'cliente': 'Besu v26.7.1 · QBFT',
        'cadencia': '10 s exactos',
        'primer_bloque': '25-08-2026 23:40 UTC',
        'gas_limite': 10_000_000,
        'explorador': 73,
        # la cadena anterior, la que el reinicio cerro
        'vieja_altura': 92_834,
        'vieja_tx': 23,
        'vieja_nacio': '15-08-2026 05:30 UTC',
        'vieja_dias': 10.8,
    },
    'c8532': {
        'altura': 4_247_873,
        'pares': 0,
        'nodos': 0,
        'cliente': 'polygon-edge · IBFT',
        'parada': '25-08-2026 23:52 UTC',
        'disco': '12 GB de 30 GB (39 %)',
        'datos': '2,6 GB en node3',
    },
    'origen': {
        'altura': 73,
        'cuentas': 343,
        'contratos': 172,
        'billeteras': 159,
        'contratos_con_origen': 0,
        'suma': '1.000.000.000.000,00',
        'principales': [
            ('0xacc03b7fe0c658cb3872726d05da24d0554f44b8',
             'Asignación preservada · nunca se ha tocado', '250.000.000.000,00'),
            ('0x3011f7f9d263d7f73a1ac2130ac7afe426495718',
             'Asignación preservada · nunca se ha tocado', '250.000.000.000,00'),
            ('0x50219186545980b35912adc89550522e63667f74',
             'Asignación preservada · nunca se ha tocado', '250.000.000.000,00'),
            ('0x3d5510e5081822877d14cd51b356bf01df2c32c9',
             'EL TESORO · recibió todo lo recuperado', '249.999.999.845,00'),
        ],
        'resto': 155,
        'resto_suma': '155,00',
        'recuperado': '17.246,93',
        'antes_tesoro': '249.999.982.598,07',
        'wrapped': ('0xccbe0c6690bf61d1f23f95f3998e4ba0d7b89f75', '0,00', '16.387,76'),
        'liquidez': ('0xa22180530d9d52676925e6ad9247ce3c24341fb1', '0,00', '839,17'),
        'pool': ('0xd3790bfd26fd215491e68180f1e2da2c3b8d973d', '0,00', '16.259,23'),
    },
    'tokens': [
        ('ORIGEN', 'nativo de la cadena', '—'),
        ('AUKA', '0x6Facc8Df…3a26B9B', '55.000.000'),
        ('AGKA', '0x961f798f…ef187a4B', '500.000.000'),
        ('ONDK', '0xfb83eEA4…b7CA19c1', '555.000.000'),
        ('IBS', '0x7AF11D3E…e2718E62', '500.000.000'),
        ('HARV', '0x0fa04D11…AdDb1923', '1.000.000.000.000'),
    ],
    'nodos': [
        ('node1', 'us-east-1', '23.23.205.33', 't2.medium', 'besu5550'),
        ('node2', 'us-east-2', '18.190.14.28', 't3.medium', 'besu5550'),
        ('node3', 'us-east-1', '54.205.125.99', 't2.medium', 'besu5550'),
        ('node4', 'us-east-2', '18.226.95.184', 't3.medium', 'besu5550'),
        ('node5', 'us-east-1', '18.211.40.149', 't3.medium', 'besu5550'),
        ('node6', 'us-east-1', '3.224.143.231', 't3.medium', 'besu5550'),
        ('node7', 'us-east-1', '—', 't3.medium', 'besu5550'),
    ],
    'apagadas': [
        ('validatorr ogb 1', 'us-east-2', 't2.large', 'detenida'),
        ('ogb-testnet-1', 'us-east-1', 't3.small', 'detenida desde el 20-ago'),
    ],
}

c = lienzo.Canvas(str(SALIDA), pagesize=A4)
c.setTitle('Orden Global · estado de las cadenas 5550 y 8532')
c.setAuthor('Nexus Coder')
c.setSubject(f'Informe tecnico de las dos cadenas · medido el {FECHA} a las {HORA}')

pagina = [0]


def mil(n):
    """Separador de miles a la española. Existe como función y no como un
       `.replace(',', '.')` sobre la frase entera porque eso se lleva por delante
       las comas del TEXTO — pasó, y dejó un «en 10.6 días. unos cuatro minutos»."""
    return f'{n:,}'.replace(',', '.')


# ── los ladrillos del dibujo ────────────────────────────────────────────────
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
    c.setFont(SANS_B, 7.5)
    c.drawString(x, y, ' '.join(txt.upper()))


def titulo(txt, y, tam=24, x=18 * mm, color=CREMA):
    c.setFillColorRGB(*color)
    c.setFont(SERIF_B, tam)
    c.drawString(x, y, txt)


def parrafo(txt, y, x=18 * mm, ancho=92, tam=9.4, inter=13.6, color=BRUMA):
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


def tabla(cabecera, filas, y, x=18 * mm, anchos=None, tam=8.4, alto=14):
    """Una tabla sobria: cabecera en oro, filas separadas por un hilo tenue."""
    anchos = anchos or [40 * mm] * len(cabecera)
    c.setFillColorRGB(*ORO)
    c.setFont(SANS_B, 7.2)
    xx = x
    for i, t in enumerate(cabecera):
        c.drawString(xx, y, t.upper())
        xx += anchos[i]
    y -= 5
    hilo(y, x, x + sum(anchos), alpha=0.35)
    y -= alto
    for fila in filas:
        xx = x
        for i, celda in enumerate(fila):
            col = CREMA if i == 0 else BRUMA
            fuente = SANS_B if i == 0 else SANS
            c.setFillColorRGB(*col)
            c.setFont(fuente, tam)
            c.drawString(xx, y, str(celda))
            xx += anchos[i]
        y -= 4
        hilo(y, x, x + sum(anchos), color=BRUMA, alpha=0.10)
        y -= alto - 4
    return y


def bloque(titulo_txt, cuerpo, y, color=ORO, x=18 * mm, ancho=None):
    """Un aparte con su filo de color a la izquierda. Para lo que hay que leer
       aunque se lea el informe en diagonal."""
    ancho = ancho or (A - 36 * mm)
    ls = textwrap.wrap(cuerpo, 86)
    alto = 15 + len(ls) * 12.4 + 8
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
    c.setFont(SANS_B, 8.4)
    c.drawString(x + 8, y, titulo_txt.upper())
    y -= 14
    c.setFillColorRGB(*CREMA)
    c.setFont(SANS, 9)
    for l in ls:
        c.drawString(x + 8, y, l)
        y -= 12.4
    return y - 10


def pie():
    pagina[0] += 1
    hilo(14 * mm, alpha=0.18)
    c.setFillColorRGB(*HUMO)
    c.setFont(SANS, 6.8)
    c.drawString(18 * mm, 10 * mm,
                 f'ORDEN GLOBAL · estado de las cadenas · medido el {FECHA} a las {HORA}')
    c.drawRightString(A - 18 * mm, 10 * mm, str(pagina[0]))
    c.showPage()


# ═════════════════════════════════════════════════════════════════════════════
# PORTADA
# ═════════════════════════════════════════════════════════════════════════════
fondo()
c.saveState()
c.setFillColorRGB(*ORO)
c.setFillAlpha(0.05)
c.circle(A * 0.82, AL * 0.80, 62 * mm, fill=1, stroke=0)
c.setFillAlpha(0.08)
c.circle(A * 0.82, AL * 0.80, 30 * mm, fill=1, stroke=0)
c.restoreState()

sello('Orden Global · informe técnico', AL - 32 * mm)
titulo('Las dos cadenas', AL - 52 * mm, tam=34)
titulo('5550 y 8532', AL - 68 * mm, tam=34, color=ORO)
hilo(AL - 76 * mm)
y = parrafo(
    'Qué hay corriendo hoy, quién lo sostiene, y qué queda de la cadena anterior. '
    'Todas las cifras de este informe se leyeron de las máquinas y de los RPC el '
    f'{FECHA} a las {HORA}; ninguna se copió de documentación previa.',
    AL - 86 * mm, ancho=78, tam=10.4, inter=15, color=CREMA)

y -= 14
cifra('5550', 'la cadena viva. Siete validadores, un bloque cada diez segundos',
      18 * mm, y, tam=40)
cifra('8532', 'la cadena anterior. Un solo nodo, sin pares, aislada',
      78 * mm, y, tam=40, color=HUMO)
cifra('159', 'billeteras tienen ORIGEN hoy. Cuatro concentran casi todo',
      140 * mm, y, tam=40, color=BRUMA)

y -= 34
y = bloque('este informe se escribe DESPUES del reinicio',
           'La 5550 se reinició el 25 de agosto a las 23:40 UTC para recuperar el ORIGEN '
           'que se había quedado atrapado en las pruebas. Salió, y este informe cuenta cómo '
           'quedó. La 8532 quedó parada de verdad el mismo día.',
           y, color=ORO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 1 · EN UNA PÁGINA
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('uno · el resumen', AL - 26 * mm)
titulo('En una página', AL - 40 * mm)
hilo(AL - 47 * mm)

d5, d8 = DATOS['c5550'], DATOS['c8532']
y = AL - 60 * mm
y = tabla(
    ['', 'Cadena 5550', 'Cadena 8532'],
    [
        ['Estado', 'Viva · reiniciada el 25-ago', 'PARADA el 25-ago'],
        ['Altura', mil(d5['altura']) + ' (nueva)', mil(d8['altura']) + ' (congelada)'],
        ['Cliente', 'Besu 26.7.1 · QBFT', 'polygon-edge · IBFT'],
        ['Validadores', '7', 'ninguno corriendo'],
        ['Pares conectados', str(d5['pares_rpc']), '—'],
        ['Nodos corriendo', '7', '0'],
        ['Ritmo', '10 s exactos', 'no avanza'],
        ['RPC público', 'rpc.ordenglobal-rpc.com', 'ninguno'],
        ['La usa', 'Wallet, Ordenex, Ordenscan', 'nadie'],
    ], y, anchos=[42 * mm, 66 * mm, 66 * mm])

y -= 12
y = bloque('por qué se reinició la 5550',
           f"Había 17.401,93 ORIGEN fuera del tesoro, atrapados en contratos y pools de "
           'prueba, y ninguna vía de transacción para traerlos: la llave del dueño de las 31 '
           'posiciones de liquidez no aparece en ningún sitio. Con una cadena que en '
           f"{d5['vieja_dias']} días había registrado {d5['vieja_tx']} transacciones, "
           'reescribir el estado salía más barato que perseguir esa llave.',
           y, color=JADE)

y = bloque('qué se recuperó, exactamente',
           f"El tesoro pasó de {DATOS['origen']['antes_tesoro']} a "
           f"{DATOS['origen']['principales'][3][2]} ORIGEN, o sea {DATOS['origen']['recuperado']} "
           'recuperados. Las 155 billeteras sembradas conservan su 1 ORIGEN de gas, y todos '
           'los saldos de tokens quedaron exactamente como estaban.',
           y, color=JADE)

y = bloque('la 8532, cerrada',
           'Seguía produciendo bloques con un solo validador y cero pares, pese a darse por '
           f"apagada el 20-ago. El {d8['parada']} se paró y se deshabilitó el servicio. Sus "
           f"datos no se borraron: siguen en disco ({d8['datos']}).",
           y, color=AMBAR)

y = bloque('el corte no salió a la primera, y conviene que se sepa',
           'El primer arranque partió la red en dos cadenas: cuatro nodos con el génesis viejo '
           'y tres con el nuevo. La culpa fue de un vigilante nuestro que reinicia el nodo cada '
           'tres minutos si la altura no avanza — hacía su trabajo, y resucitó cuatro máquinas '
           'antes de que les llegara el génesis nuevo. Quince minutos para arreglarlo y '
           'ninguna pérdida: el respaldo estaba hecho y comprobado.',
           y, color=ROJO)

y = bloque('lo que estaba escrito y no se aplicó',
           'Cinco días antes, al apagar la 8532, quedó anotado que «el watchdog se apaga '
           'primero: si no, reanima el servicio a los tres minutos y el apagado no dura». '
           'Estaba en un documento y no en el procedimiento. Una lección escrita que no entra '
           'en el procedimiento no sirve de nada; ésta ya está en el paso 0.',
           y, color=AMBAR)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 2 · LA 5550
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('dos · la cadena viva', AL - 26 * mm)
titulo('La 5550', AL - 40 * mm)
hilo(AL - 47 * mm)

y = parrafo(
    'Es la cadena que sostiene el ecosistema: la wallet lee de ella los saldos, Ordenex '
    f"cotiza sobre ella y Ordenscan la indexa. La versión que corre hoy arrancó el "
    f"{d5['primer_bloque']}, cuando se reinició para recuperar el ORIGEN de las pruebas. "
    f"La anterior había nacido el {d5['vieja_nacio']} y murió en el bloque "
    f"{mil(d5['vieja_altura'])}.",
    AL - 58 * mm)

y -= 6
cifra('7', 'validadores QBFT', 18 * mm, y)
cifra('10 s', 'entre bloque y bloque, sin desviación', 52 * mm, y)
cifra(str(d5['vieja_tx']), 'transacciones tuvo la cadena anterior en toda su vida',
      100 * mm, y, color=BRUMA)
cifra('0', 'contratos guardan ORIGEN hoy', 148 * mm, y, color=JADE)

y -= 44
y = bloque('los siete validadores, ahora en el génesis',
           'Antes sólo cuatro estaban en el génesis: node1, node2 y node7 habían entrado por '
           'votación QBFT el 20-ago, y esa votación vivía en la historia que el reinicio '
           'borra. De haberlo pasado por alto, la cadena habría vuelto con cuatro validadores '
           '—aguantando una caída en vez de dos— sin que nada avisara. El génesis nuevo los '
           'lleva a los siete, y los siete proponen bloques.',
           y, color=JADE)

y = parrafo(
    'El ritmo es exactamente de diez segundos entre bloques, sin una sola desviación en la '
    'muestra tomada. Eso es lo que se espera de QBFT sano: los bloques no salen «más o menos '
    'cada diez segundos», salen cada diez.', y, tam=9.4)

y -= 8
sello('los tokens que viven en ella', y)
y -= 14
y = tabla(['Token', 'Contrato', 'Emisión'],
          [[t[0], t[1], t[2]] for t in DATOS['tokens']],
          y, anchos=[30 * mm, 74 * mm, 60 * mm])

y -= 10
y = bloque('los tokens no se tocaron, y se comprobó de dos maneras',
           'Antes del corte se leyó la emisión de los 172 contratos en la cadena vieja y en '
           'un ensayo del génesis nuevo, y se compararon: CERO diferencias. Después del corte '
           'se volvieron a leer en la cadena viva, contrato por contrato, y siguen iguales. '
           'Lo único que cambió fue WORIGEN, que fue a cero junto con el ORIGEN que lo '
           'respaldaba — o el contrato habría quedado insolvente.',
           y, color=ORO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 3 · LA 8532
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('tres · la cadena anterior', AL - 26 * mm)
titulo('La 8532', AL - 40 * mm)
hilo(AL - 47 * mm)

y = parrafo(
    'El informe anterior la encontró encendida pese a darse por apagada el 20-ago: seguía '
    'produciendo bloques en una sola máquina, sin un solo par. El 25 de agosto se paró de '
    'verdad.',
    AL - 58 * mm)

y -= 6
cifra(mil(d8['altura']), 'bloques · congelada ahí', 18 * mm, y)
cifra('0', 'nodos la sostienen', 74 * mm, y, color=JADE)
cifra('0', 'pares conectados', 108 * mm, y, color=HUMO)
cifra('0', 'aplicaciones la leen', 144 * mm, y, color=HUMO)

y -= 40
y = bloque('parada y deshabilitada, no sólo parada',
           f"El {d8['parada']} se paró `polygon-edge` en node1, el único que todavía la "
           'sostenía, y quedó `disabled`: no vuelve sola al reiniciar la máquina. La '
           'diferencia importa — un servicio parado pero habilitado vuelve en el siguiente '
           'arranque y nadie se entera.',
           y, color=JADE)

y = bloque('llevaba encendida sin que nadie lo supiera',
           'Se dio por apagada el 20 de agosto y el 25 seguía produciendo bloques. Ese es el '
           'patrón que conviene retener: un servicio que se para sin deshabilitar, o con un '
           'vigilante que lo reanima, vuelve solo. Es exactamente lo que le pasó a esta '
           'cadena, y lo que estuvo a punto de arruinar el reinicio de la 5550.',
           y, color=AMBAR)

y = bloque('los datos no se borraron',
           f"Siguen en disco: {d8['datos']}. Volver a encenderla es un `systemctl start`. Se "
           'dejan a propósito hasta que alguien decida que la historia de la 8532 ya no hace '
           'falta para nada.',
           y, color=ORO)

y = parrafo(
    f"La máquina tiene {d8['disco']} ocupados. Con la cadena parada, ese número ya no crece.",
    y, tam=9.4)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 4 · QUIÉN TIENE ORIGEN
# ═════════════════════════════════════════════════════════════════════════════
fondo()
o = DATOS['origen']
sello('cuatro · el reparto', AL - 26 * mm)
titulo('Quién tiene ORIGEN', AL - 40 * mm)
hilo(AL - 47 * mm)

y = parrafo(
    'Se preguntó el saldo de ORIGEN a la cadena, dirección por dirección, sobre las '
    f"{o['cuentas']} cuentas del génesis. Al bloque {mil(o['altura'])}: {o['billeteras']} "
    f"direcciones tienen algo, y {o['contratos_con_origen']} de ellas son contratos. Después "
    'del reinicio, ningún contrato guarda ORIGEN: todo lo que estaba dentro volvió al tesoro.',
    AL - 58 * mm)

y -= 6
cifra(str(o['billeteras']), 'billeteras con ORIGEN hoy', 18 * mm, y)
cifra('4', 'concentran el 99,99998 % del total', 62 * mm, y)
cifra(str(o['resto']), 'con su 1 ORIGEN de gas', 112 * mm, y, color=HUMO)
cifra(o['recuperado'], 'ORIGEN recuperados al tesoro', 152 * mm, y, color=JADE)

y -= 40
sello('las cuatro principales', y)
y -= 14
y = tabla(['Dirección', 'Qué es', 'ORIGEN hoy'],
          [[f"{d[:10]}…{d[-6:]}", q, b] for d, q, b in o['principales']],
          y, anchos=[46 * mm, 74 * mm, 44 * mm])

y -= 12
y = bloque('las tres primeras siguen sin tocarse',
           'Son asignaciones heredadas de la cadena anterior, de 250.000 millones cada una, '
           'que el reinicio preservó igual que el génesis original. Su saldo de hoy es EXACTO: '
           'ni un decimal se ha movido. Mover el tesoro exige instrucción escrita de la Junta, '
           'y el reinicio no lo era.',
           y, color=ORO)

y = bloque('el tesoro subió, y por qué el número es redondo',
           f"Pasó de {o['antes_tesoro']} a {o['principales'][3][2]}, o sea {o['recuperado']} "
           'recuperados de contratos, pools y restos de prueba. Que caiga en un número tan '
           'redondo no se buscó — es lo que queda al restar del billón las tres preservadas '
           '(750.000 millones) y las 155 billeteras sembradas (155). Que cuadre exacto es la '
           'señal de que las cuentas cierran.',
           y, color=JADE)

y = bloque(f"las otras {o['resto']} billeteras tienen 1 ORIGEN cada una",
           'Ni una más ni una menos: las que habían gastado gas se repusieron y las que tenían '
           'de más se recortaron. Ese 1 no es lo que esa persona posee: es la semilla de gas '
           'para que nadie quede congelado — alcanza para unas 210 transferencias. Lo que la '
           'gente tiene de valor está en los tokens.',
           y, color=AMBAR)

y = bloque('los tres contratos que guardaban ORIGEN quedaron en cero',
           f"El wrapper WORIGEN ({o['wrapped'][0][:10]}…) tenía {o['wrapped'][2]} y el pool "
           f"AUKA/WORIGEN ({o['pool'][0][:10]}…) {o['pool'][2]}; el contrato de liquidez "
           f"({o['liquidez'][0][:10]}…), {o['liquidez'][2]}. Hoy los tres están a cero.",
           y, color=ORO)

y = bloque('vaciar el wrapper era lo delicado',
           'Su ORIGEN respalda los WORIGEN que la gente tiene fuera. Quitarle uno sin el otro '
           'lo dejaba insolvente, así que se vaciaron los dos a la vez. Se comprobó antes en '
           'un ensayo: depositando 0,10 ORIGEN emite exactamente 0,10 WORIGEN. Arranca '
           'solvente desde cero y funciona.',
           y, color=JADE)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 5 · LAS MÁQUINAS
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('cinco · el hierro', AL - 26 * mm)
titulo('Las máquinas', AL - 40 * mm)
hilo(AL - 47 * mm)

y = parrafo(
    'Siete instancias EC2 corriendo y dos detenidas. Lo que cada una ejecuta se preguntó a '
    'la propia máquina por AWS SSM: no se dedujo del nombre de la etiqueta, que es como se '
    'construyen los inventarios que envejecen mal.',
    AL - 58 * mm)

y -= 10
y = tabla(['Nodo', 'Región', 'IP elástica', 'Tipo', 'Qué corre'],
          DATOS['nodos'], y, anchos=[20 * mm, 26 * mm, 34 * mm, 24 * mm, 60 * mm])

y -= 12
sello('detenidas', y)
y -= 14
y = tabla(['Instancia', 'Región', 'Tipo', 'Estado'],
          DATOS['apagadas'], y, anchos=[52 * mm, 30 * mm, 26 * mm, 56 * mm])

y -= 12
y = bloque('node1 ya no hace dos cosas',
           'Hasta el 25 de agosto corría Besu para la 5550 Y polygon-edge para la 8532 en la '
           'misma t2.medium. Con la 8532 parada, las siete máquinas hacen exactamente lo mismo: '
           'un validador de la 5550 cada una.',
           y, color=JADE)

y = bloque('cada validador tiene su llave dentro del directorio de datos',
           'En `/opt/og5550-real/nodo/key`, al lado de la base de la cadena. Cualquier '
           'procedimiento que diga «vaciar el directorio de datos» tiene que decir también '
           '«conservando key»: sin eso los siete nodos arrancan con identidades nuevas, '
           'ninguno es validador, y la cadena no produce un solo bloque sin decir por qué.',
           y, color=ROJO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 5 · LO QUE HAY QUE DECIDIR
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('seis · lo abierto', AL - 26 * mm)
titulo('Lo que hay que decidir', AL - 40 * mm)
hilo(AL - 47 * mm)

y = AL - 58 * mm
y = bloque('1 · la 8532 · RESUELTO el 25-ago',
           'Estaba encendida sin vigilancia, que era lo peor de las dos opciones. Se paró y se '
           'deshabilitó, con sus datos intactos en disco. Queda decidir cuándo se borran esos '
           'datos y cuándo se retira la máquina — eso todavía cuesta dinero al mes.',
           y, color=JADE)

y = bloque('2 · el contrato de staking sigue sin dueño',
           'Es un asunto abierto desde antes de este informe y no ha cambiado: el contrato no '
           'tiene dueño, ni lista blanca, ni límite de validadores, y pide un solo ORIGEN para '
           'entrar. En la 8532 eso dejaba toda la garantía económica en diez ORIGEN. Antes de '
           'abrir la 5550 a validadores de fuera, esto hay que resolverlo.',
           y, color=ROJO)

y = bloque('3 · la 5550 está sana y sin usar',
           f"La cadena anterior registró {DATOS['c5550']['vieja_tx']} transacciones en "
           f"{DATOS['c5550']['vieja_dias']} días. Funciona perfectamente y está vacía. Eso no "
           'es un fallo técnico —es el estado normal de una red sin actividad todavía— pero '
           'conviene no confundir «sana» con «en uso» al presentarla. Fue justamente lo que '
           'hizo el reinicio barato: con gente moviendo dinero de verdad habría sido '
           'impensable.',
           y, color=AMBAR)

y = bloque('4 · avisar a quien haya usado MetaMask · MENOR de lo que parecía',
           'La red no hay que volver a agregarla: mismo chainId, misma URL, mismo símbolo. Y '
           'los nonces se conservaron uno por uno, así que tampoco hace falta borrar datos de '
           'actividad. Lo único que queda raro es el historial viejo de transacciones, que '
           'apunta a hashes que ya no existen.',
           y, color=ORO)

y = bloque('5 · lo que el reinicio enseñó, y hay que meter en los procedimientos',
           'Un vigilante nuestro que reinicia el nodo cada tres minutos partió la red en dos '
           'cadenas en el primer intento: hay que apagarlo ANTES de nada. Y comprobar la huella '
           'del archivo de génesis no basta — hay que comprobar, después de arrancar, que los '
           'siete nodos tengan el mismo bloque 0. Las dos cosas están ya en el plan.',
           y, color=ROJO)

y -= 4
hilo(y)
y -= 16
y = parrafo(
    'Cómo comprobar cualquiera de estas cifras sin depender de este PDF: la altura y los '
    'validadores de la 5550 salen de una llamada al RPC público; el estado de la 8532 y qué '
    'corre cada máquina, de AWS SSM. Los dos caminos están escritos en '
    'TRASPASO-CONOCIMIENTO.md y no necesitan entrar a ningún panel.',
    y, tam=9, color=HUMO)
pie()

c.save()
print(f'listo: {SALIDA}')
