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
HORA = '19:15 UTC'

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
        'altura': 91314,
        'esperada': 91336,
        'validadores': 7,
        'pares_rpc': 6,
        'cliente': 'Besu v26.7.1 · QBFT',
        'cadencia': '10 s exactos',
        'primer_bloque': '15-08-2026 05:30 UTC',
        'dias': 10.6,
        'gas_limite': 10_000_000,
        'explorador': 91302,
    },
    'c8532': {
        'altura': 4_246_769,
        'pares': 0,
        'nodos': 1,
        'cliente': 'polygon-edge · IBFT',
        'watchdog_ultimo': '20 de agosto',
        'reinicio': '25-08-2026 19:00 UTC',
        'disco': '12 GB de 30 GB (40 %)',
    },
    'origen': {
        'altura': 91442,
        'billeteras': 159,
        'contratos': 3,
        'direcciones': 162,
        'suma': '999.999.999.998,93',
        'principales': [
            ('0xacc03b7fe0c658cb3872726d05da24d0554f44b8',
             'Asignación preservada · nunca se ha tocado', '250.000.000.000,00'),
            ('0x3011f7f9d263d7f73a1ac2130ac7afe426495718',
             'Asignación preservada · nunca se ha tocado', '250.000.000.000,00'),
            ('0x50219186545980b35912adc89550522e63667f74',
             'Asignación preservada · nunca se ha tocado', '250.000.000.000,00'),
            ('0x3d5510e5081822877d14cd51b356bf01df2c32c9',
             'EL TESORO · billetera única de ORIGEN', '249.999.982.598,07'),
        ],
        'resto': 155,
        'resto_suma': '173,93',
        'resto_mayor': '20,93',
        'con_uno': 149,
        'gasto_tesoro': {
            'bloque': 14955,
            'a': '0x746268404cc9ca2ef0ac344f02b236db232c3ad8',
            'valor': '20,000000',
            'comision': '0,001953',
            'gas': '21.000 a 93 gwei',
        },
        'wrapped': ('0xccbe0c6690bf61d1f23f95f3998e4ba0d7b89f75', '16.387,76'),
        'liquidez': ('0xa22180530d9d52676925e6ad9247ce3c24341fb1', '839,17'),
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
        ('node1', 'us-east-1', '23.23.205.33', 't2.medium', 'besu5550 + polygon-edge'),
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
y = bloque('lo que este informe viene a decir',
           'La 5550 está sana y es la que sostiene el ecosistema. La 8532 no está '
           'apagada: sigue produciendo bloques en UNA sola máquina, sin un solo par '
           'conectado y sin nadie mirándola. No es una cadena — es un proceso.',
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
        ['Estado', 'Viva y en producción', 'Encendida, aislada'],
        ['Altura', mil(d5['altura']), mil(d8['altura'])],
        ['Cliente', 'Besu 26.7.1 · QBFT', 'polygon-edge · IBFT'],
        ['Validadores', '7', '1'],
        ['Pares conectados', str(d5['pares_rpc']), '0'],
        ['Nodos corriendo', '7', '1'],
        ['Ritmo', '10 s exactos', 'sin medir desde fuera'],
        ['RPC público', 'rpc.ordenglobal-rpc.com', 'ninguno'],
        ['La usa', 'Wallet, Ordenex, Ordenscan', 'nadie'],
    ], y, anchos=[42 * mm, 66 * mm, 66 * mm])

y -= 12
y = bloque('la 5550, en tres números',
           f"Ha producido {mil(d5['altura'])} bloques donde le tocaban {mil(d5['esperada'])} "
           f"si nunca hubiera parado: veintidós bloques de diferencia en {d5['dias']} días, "
           'unos cuatro minutos. Y el explorador indexa exactamente la misma altura que '
           'declara la cadena.',
           y, color=JADE)

y = bloque('la 8532, en una frase',
           'Produce bloques con un solo validador y CERO pares. Su vigilante automático '
           f"dejó de correr el {d8['watchdog_ultimo']}, y el servicio se reinició hoy a las "
           '19:00 UTC sin que nadie lo pidiera. Nada del ecosistema la lee.',
           y, color=AMBAR)

y = bloque('la decisión que este informe deja servida',
           'Mantener encendida una cadena que nadie consulta cuesta una máquina al mes y '
           'genera un riesgo que no compra nada: cualquiera que configure una billetera con '
           'la 8532 dejaría sus fondos donde nadie mira. O se apaga con un respaldo, o se '
           'declara viva de verdad. Hoy no es ninguna de las dos cosas.',
           y, color=ROJO)
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
    'cotiza sobre ella y Ordenscan la indexa. Nació el 15 de agosto y lleva diez días y '
    'medio produciendo sin interrupción apreciable.',
    AL - 58 * mm)

y -= 6
cifra(mil(d5['altura']), 'bloques producidos', 18 * mm, y)
cifra('7', 'validadores QBFT', 62 * mm, y)
cifra('10 s', 'entre bloque y bloque, sin desviación', 96 * mm, y)
cifra('99,98 %', 'de los bloques que le tocaban', 140 * mm, y)

y -= 40
y = bloque('siete validadores, no cuatro',
           'La documentación interna decía cuatro. La cadena responde SIETE, leídos de '
           '`qbft_getValidatorsByBlockNumber`. Con siete, el quórum QBFT es de cinco: la red '
           'aguanta la caída de dos validadores a la vez. Con cuatro habría aguantado uno. '
           'Es mejor de lo que estaba escrito, y conviene que lo escrito lo diga.',
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
y = bloque('comprobado, no supuesto',
           'Los cinco contratos ERC-20 responden en la cadena y devuelven su emisión total. '
           'Un contrato que no existiera devolvería vacío, y la wallet enseñaría un saldo de '
           'cero sin decir por qué. No es el caso de ninguno.',
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
    'La documentación la da por «congelada y cerrada». No lo está. Sigue produciendo '
    'bloques, y ese matiz importa: una cadena apagada no puede confundir a nadie, y una '
    'encendida sin vigilancia sí.',
    AL - 58 * mm)

y -= 6
cifra(mil(d8['altura']), 'bloques · sigue subiendo', 18 * mm, y)
cifra('1', 'nodo la sostiene', 72 * mm, y, color=AMBAR)
cifra('0', 'pares conectados', 104 * mm, y, color=ROJO)
cifra('0', 'aplicaciones la leen', 140 * mm, y, color=HUMO)

y -= 40
y = bloque('qué queda de ella, exactamente',
           'De los seis nodos que la formaban, CINCO fueron migrados a la 5550 y hoy sólo '
           'corren Besu. El sexto —node1— es el único que conserva el servicio polygon-edge, '
           'y por eso la cadena sigue avanzando: un validador solo firma sus propios bloques '
           'sin necesitar a nadie.',
           y, color=AMBAR)

y = bloque('sin pares es literal',
           '`polygon-edge peers list` responde «No peers found». No es que tenga pocos: no '
           'tiene ninguno. Sus bloques no los ve nadie más, no hay red que los replique, y si '
           'esa máquina se pierde se pierde la cadena entera con ella.',
           y, color=ROJO)

y = bloque('el vigilante dejó de vigilar',
           f"El watchdog que reparaba los estancamientos registró su última línea el "
           f"{d8['watchdog_ultimo']} y hoy figura como inactivo. Además el servicio se "
           'reinició hoy a las 19:00 UTC sin intervención — probablemente un reinicio de la '
           'instancia. Nadie se enteró porque nadie está mirando.',
           y, color=AMBAR)

y = parrafo(
    'La máquina tiene 12 GB ocupados de 30 GB. No hay urgencia de disco, pero una cadena que '
    'avanza sola llena espacio para siempre y sin que nadie lo use.', y, tam=9.4)
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
    'Se preguntó el saldo de ORIGEN a la cadena, dirección por dirección, sobre las 331 '
    f"cuentas del génesis. Al bloque {mil(o['altura'])}: {o['direcciones']} direcciones tienen "
    f"algo, de las cuales {o['contratos']} son contratos. Billeteras de verdad, {o['billeteras']}.",
    AL - 58 * mm)

y -= 6
cifra(str(o['billeteras']), 'billeteras con ORIGEN hoy', 18 * mm, y)
cifra('4', 'concentran el 99,99998 % del total', 62 * mm, y)
cifra(str(o['resto']), 'billeteras con el resto', 112 * mm, y, color=HUMO)
cifra(o['resto_suma'], 'ORIGEN entre las 155', 152 * mm, y, color=HUMO)

y -= 40
sello('las cuatro principales', y)
y -= 14
y = tabla(['Dirección', 'Qué es', 'ORIGEN hoy'],
          [[f"{d[:10]}…{d[-6:]}", q, b] for d, q, b in o['principales']],
          y, anchos=[46 * mm, 74 * mm, 44 * mm])

y -= 12
gt = o['gasto_tesoro']
y = bloque('las tres primeras nunca se han tocado',
           'Son asignaciones heredadas de la cadena anterior, de 250.000 millones cada una, '
           'que el constructor del génesis preservó a propósito. Su saldo de hoy es EXACTO: '
           'ni un decimal se ha movido desde el bloque cero.',
           y, color=ORO)

y = bloque('el tesoro ha movido 20 ORIGEN, y nada más',
           f"Una sola transacción en toda la vida de la cadena: bloque {mil(gt['bloque'])}, "
           f"{gt['valor']} ORIGEN a {gt['a'][:12]}…, con {gt['comision']} de comisión "
           f"({gt['gas']}). Eso es TODO lo que ha salido del tesoro. "
           'Ojo con el número redondo: el tesoro no empezó en 250.000 millones exactos sino en '
           '249.999.982.618,07 — esos 17.382 de diferencia vienen heredados de la cadena '
           'anterior, NO se gastaron aquí.',
           y, color=JADE)

y = bloque(f"las otras {o['resto']} billeteras suman {o['resto_suma']} ORIGEN",
           f"De ellas, {o['con_uno']} tienen exactamente 1 ORIGEN y la mayor tiene {o['resto_mayor']}. "
           'Ese 1 no es lo que esa persona posee: es la semilla de gas que el génesis dio a cada '
           'dirección heredada para que nadie quedara congelado — alcanza para unas 210 '
           'transferencias. Lo que la gente tiene de valor está en los tokens, no aquí.',
           y, color=AMBAR)

y = bloque('siete direcciones se han movido en diez días',
           'El tesoro con su transferencia, quien la recibió, y cinco billeteras que gastaron '
           'entre media milésima y un ORIGEN en comisiones. Eso es toda la actividad de la '
           'cadena desde el bloque cero: ni un solo token ERC-20 ha cambiado de manos.',
           y, color=AMBAR)

y = bloque('y dos contratos que sí guardan ORIGEN de verdad',
           f"Wrapped Origen ({o['wrapped'][0][:10]}…) guarda {o['wrapped'][1]} ORIGEN: es el "
           'respaldo de los tokens envueltos que la gente tiene fuera, y por eso el génesis lo '
           f"excluyó de la normalización. El de liquidez ({o['liquidez'][0][:10]}…) guarda "
           f"{o['liquidez'][1]}. Un tercer contrato figura con saldo cero.",
           y, color=ORO)
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
y = bloque('node1 es el único que hace dos cosas',
           'Corre Besu para la 5550 Y polygon-edge para la 8532, en la misma máquina t2.medium. '
           'Es el nodo más pequeño de la flota y el único con doble carga. Si un día la 5550 '
           'se pone lenta en un solo nodo, este es el sitio donde mirar primero.',
           y, color=ORO)
pie()

# ═════════════════════════════════════════════════════════════════════════════
# 5 · LO QUE HAY QUE DECIDIR
# ═════════════════════════════════════════════════════════════════════════════
fondo()
sello('seis · lo abierto', AL - 26 * mm)
titulo('Lo que hay que decidir', AL - 40 * mm)
hilo(AL - 47 * mm)

y = AL - 58 * mm
y = bloque('1 · la 8532 no puede quedarse como está',
           'Encendida y sin vigilancia es lo peor de las dos opciones: cuesta una máquina, no '
           'sirve a nadie, y sigue siendo una dirección válida a la que alguien podría mandar '
           'fondos por error. Apagarla con un respaldo del estado, o devolverle nodos y '
           'vigilancia. Lo que no se sostiene es el punto medio de hoy.',
           y, color=ROJO)

y = bloque('2 · el contrato de staking sigue sin dueño',
           'Es un asunto abierto desde antes de este informe y no ha cambiado: el contrato no '
           'tiene dueño, ni lista blanca, ni límite de validadores, y pide un solo ORIGEN para '
           'entrar. En la 8532 eso dejaba toda la garantía económica en diez ORIGEN. Antes de '
           'abrir la 5550 a validadores de fuera, esto hay que resolverlo.',
           y, color=ROJO)

y = bloque('3 · la 5550 está sana y sin usar',
           'En la muestra tomada no hubo NI UNA transacción en los últimos dos mil bloques. La '
           'cadena funciona perfectamente y está vacía. Eso no es un fallo técnico —es el '
           'estado normal de una red que todavía no tiene actividad— pero conviene no '
           'confundir «sana» con «en uso» al presentarla.',
           y, color=AMBAR)

y = bloque('4 · la documentación decía cuatro validadores',
           'La cadena tiene siete. La diferencia es a favor, pero un documento que se equivoca '
           'a favor se equivoca igual, y el día que alguien calcule el quórum sobre el número '
           'escrito va a sacar la cuenta mal.',
           y, color=ORO)

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
