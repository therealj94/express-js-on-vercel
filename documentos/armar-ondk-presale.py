# ONDK · the pre-sale document that goes to a buyer.
#
#   python3 documentos/armar-ondk-presale.py
#
# THREE RULES, AND ALL THREE ARE SUBSTANTIVE
#
# 1 · NOT ONE INVENTED FIGURE. Every number here is either a Board resolution
#     from the minute book —with its act number, its date and its signatory—
#     or a fact the reader can verify himself against the chain or the API. The
#     document hands him the URL. A price a buyer can check for himself is
#     worth more than any adjective we could put next to it.
#
# 2 · WHAT WE DON'T KNOW STAYS BLANK. Payment rails, minimums, the size of the
#     round, closing date, eligible countries, fees, lock-up, issuing entity —
#     those are Orden Global's to fill in. A filler number in a securities
#     offering is the kind of figure you later have to defend in front of
#     someone who already paid.
#
# 3 · THE RISK PAGE IS PART OF THE SALE, NOT A DISCLAIMER GLUED ON THE BACK.
#     Telling a buyer plainly that opening a book does not create liquidity is
#     what separates a pre-sale from a problem. The buyer who comes in knowing
#     that is the one who won't feel cheated in September.

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
MARCA = AQUI / 'marca'
SALIDA = AQUI / 'ONDK-Pre-Sale.pdf'

A, AL = A4
FECHA = 'August 17, 2026'
APERTURA = 'August 28, 2026'

# ── the house palette · the same one as the dossier ─────────────────────────
POZO   = (0.008, 0.106, 0.110)
VETA   = (0.024, 0.204, 0.188)
ORO    = (0.788, 0.663, 0.380)
OROHI  = (0.973, 0.937, 0.812)
CREMA  = (0.953, 0.925, 0.851)
BRUMA  = (0.682, 0.780, 0.765)
HUMO   = (0.431, 0.576, 0.561)
JADE   = (0.243, 0.851, 0.627)
ALERTA = (0.910, 0.620, 0.400)

# ── type: the brand serif if it is on disk, otherwise the system one ────────
# Cinzel only ships Bold in this repository, so the display face is Bold and
# the body stays in the sans. Faking a regular weight by scaling the bold is
# how a careful document starts looking cheap.
SERIF_B, SANS, SANS_B = 'Times-Bold', 'Helvetica', 'Helvetica-Bold'
_cinzel = AQUI.parent / 'orden-global-app' / 'assets' / 'fonts' / 'Cinzel-Bold.ttf'
if _cinzel.exists():
    try:
        pdfmetrics.registerFont(TTFont('MarcaB', str(_cinzel)))
        SERIF_B = 'MarcaB'
    except Exception:
        pass

c = lienzo.Canvas(str(SALIDA), pagesize=A4)
c.setTitle('ONDK · Pre-Sale')
c.setAuthor('Orden Global Corp')
c.setSubject('ONDK security token pre-sale · Orden Global Corp')

pagina = [0]
M = 18*mm                       # the margin the whole house uses


def fondo(oscuro=True):
    c.setFillColorRGB(*(POZO if oscuro else (0.992, 0.988, 0.976)))
    c.rect(0, 0, A, AL, fill=1, stroke=0)


def hilo(y, x0=M, x1=None, color=ORO, alpha=0.30, grosor=0.6):
    c.saveState(); c.setStrokeColorRGB(*color); c.setStrokeAlpha(alpha)
    c.setLineWidth(grosor); c.line(x0, y, x1 or (A - M), y); c.restoreState()


def sello(txt, y, x=M, color=ORO, tam=7.5):
    """The eyebrow: spaced capitals in the sans. The voice of the margins of a
    financial document, not a smaller headline."""
    c.setFillColorRGB(*color); c.setFont(SANS_B, tam)
    c.drawString(x, y, ' '.join(txt.upper()))


def titulo(txt, y, tam=26, x=M, color=CREMA):
    c.setFillColorRGB(*color); c.setFont(SERIF_B, tam)
    c.drawString(x, y, txt)


def parrafo(txt, y, x=M, ancho=92, tam=9.8, inter=14.2, color=BRUMA, fuente=None, negrita=False):
    c.setFillColorRGB(*color); c.setFont(fuente or (SANS_B if negrita else SANS), tam)
    for linea in textwrap.wrap(txt, ancho):
        c.drawString(x, y, linea); y -= inter
    return y


def bloque(rotulo, cuerpo, y, x=M, ancho=44, anchoTxt=None):
    """A titled block. Used for the columns that explain what is being bought."""
    c.setFillColorRGB(*ORO); c.setFont(SANS_B, 8.4)
    c.drawString(x, y, rotulo.upper())
    return parrafo(cuerpo, y - 13, x=x, ancho=anchoTxt or ancho, tam=9.2, inter=13, color=BRUMA)


def cifra(valor, pie, x, y, tam=27, color=ORO, anchoPie=24):
    c.setFillColorRGB(*color); c.setFont(SERIF_B, tam)
    c.drawString(x, y, valor)
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.6)
    yy = y - 12
    for linea in textwrap.wrap(pie, anchoPie):
        c.drawString(x, yy, linea); yy -= 9.5
    return yy


def caja(y, alto, x=M, ancho=None, color=VETA, borde=ORO, alpha=0.55, alphaB=0.35):
    ancho = ancho or (A - 2*M)
    c.saveState()
    c.setFillColorRGB(*color); c.setFillAlpha(alpha)
    c.setStrokeColorRGB(*borde); c.setStrokeAlpha(alphaB); c.setLineWidth(0.7)
    c.roundRect(x, y, ancho, alto, 3*mm, fill=1, stroke=1)
    c.restoreState()


def pie_pagina(txt=''):
    pagina[0] += 1
    c.setFillColorRGB(*HUMO); c.setFont(SANS, 7)
    c.drawString(M, 12*mm, txt or 'ONDK pre-sale · Orden Global Corp')
    c.drawRightString(A - M, 12*mm, str(pagina[0]))


def hoja(txt_pie=''):
    pie_pagina(txt_pie); c.showPage()


# ── the constellation, drawn instead of photographed ────────────────────────
# The dossier puts a screenshot of the Núcleo behind its cover. This document
# does not, and the reason is not taste: that capture had AUBANK printed in it,
# and AUBANK stopped existing when the company renamed it AuCorp. A screenshot
# in a sales document ages, and it ages into contradicting the document it is
# decorating — the worst place to be caught by a reader who zooms in.
#
# So the constellation is drawn here, from coordinates. It is the same idea the
# Núcleo puts on screen —spheres hanging off a centre— and it cannot go stale.
# The positions are fixed, not random: a cover that comes out different on
# every build is a cover nobody can approve.
def constelacion():
    """The house's constellation, in gold, at the top third of the page."""
    # Placed in the dead band between the headline and the body copy, off to
    # the right. It does NOT sit behind the type: a constellation crossing the
    # words costs the headline more than it adds to the page.
    cx, cy = A * 0.72, AL * 0.46
    NODOS = [
        (0.00, 0.00, 5.2),                # the core
        (-0.30, 0.20, 2.6), (0.26, 0.30, 3.0), (0.40, -0.06, 2.2),
        (0.12, -0.34, 2.8), (-0.22, -0.28, 2.0), (-0.44, -0.04, 2.4),
        (0.05, 0.46, 1.9), (-0.52, 0.34, 1.6), (0.52, 0.44, 1.7),
        (0.34, -0.44, 1.5), (-0.34, -0.50, 1.8),
    ]
    R = 42*mm
    pts = [(cx + dx * R, cy + dy * R, r) for dx, dy, r in NODOS]

    c.saveState()
    # The threads first, so the spheres sit on top of them.
    c.setStrokeColorRGB(*ORO); c.setLineWidth(0.5)
    for i, (x, y, _) in enumerate(pts[1:], start=1):
        c.setStrokeAlpha(0.16 if i > 6 else 0.24)
        c.line(pts[0][0], pts[0][1], x, y)
    # A couple of threads between outer nodes: a network, not a star.
    c.setStrokeAlpha(0.10)
    for a_, b_ in [(1, 7), (2, 9), (3, 4), (5, 11), (6, 8), (4, 10)]:
        c.line(pts[a_][0], pts[a_][1], pts[b_][0], pts[b_][1])

    for i, (x, y, r) in enumerate(pts):
        # A wide halo, then the sphere. Two circles do what a glow would need a
        # raster image for — and this one scales to any print size.
        c.setFillColorRGB(*ORO); c.setFillAlpha(0.055)
        c.circle(x, y, r * 4.2*mm / 2.6, fill=1, stroke=0)
        c.setFillAlpha(0.85 if i == 0 else 0.55)
        c.setFillColorRGB(*(OROHI if i == 0 else ORO))
        c.circle(x, y, r * 0.9, fill=1, stroke=0)
    c.restoreState()

    # The veil, in bands rather than one rectangle. A single rectangle leaves a
    # hard horizontal edge cutting the drawing in half, which reads as a mistake
    # even to someone who cannot say why. Four bands fade it.
    c.saveState()
    c.setFillColorRGB(*POZO)
    for y0, y1, a in [(0, 62*mm, 0.74), (62*mm, 104*mm, 0.60),
                      (104*mm, 134*mm, 0.42), (134*mm, 166*mm, 0.20)]:
        c.setFillAlpha(a)
        c.rect(0, y0, A, y1 - y0, fill=1, stroke=0)
    c.restoreState()


# ═══════════════════════════════════════════════════════════════════════════
# 1 · COVER
# ═══════════════════════════════════════════════════════════════════════════
fondo()
constelacion()

logo = MARCA / 'orden-global.png'
if logo.exists():
    r_l = ImageReader(str(logo)); lw, lh = r_l.getSize()
    c.drawImage(r_l, M, AL - 40*mm, width=30*mm, height=30*mm * lh / lw, mask='auto')

sello('ONDK · Orden Global security token · Pre-sale', AL - 50*mm)
hilo(AL - 54*mm, x1=130*mm)

# The thesis, in two lines. Everything else in the document supports this one
# sentence, so it gets the whole page.
c.setFillColorRGB(*OROHI); c.setFont(SERIF_B, 38)
c.drawString(M, AL - 76*mm, 'BUY THE GOLD,')
c.setFillColorRGB(*ORO)
c.drawString(M, AL - 93*mm, 'OR BUY THE HOUSE.')

y = parrafo(
    'ORIGEN, AUKA and AGKA are the metal. ONDK is the company that mines it - and that '
    'built the chain, the wallet, the identity layer and the exchange the whole ecosystem '
    'runs on.',
    114*mm, ancho=64, tam=11.6, inter=16.8, color=CREMA)

y = parrafo(
    'The pre-sale is open at USD 2.10 to 2.15 per ONDK. On ' + APERTURA + ' the token opens '
    'to public trading on Ordenex.',
    y - 9, ancho=64, tam=10.2, inter=15, color=BRUMA)

hilo(50*mm, x1=96*mm)
c.setFillColorRGB(*HUMO); c.setFont(SANS, 8)
c.drawString(M, 44*mm, 'Board-declared price in force: USD 2.15 · minute JD-2026-08-16')
c.drawString(M, 38*mm, 'This document: ' + FECHA)
c.setFillColorRGB(*ALERTA); c.setFont(SANS_B, 8)
c.drawString(M, 30*mm, 'A SECURITY TOKEN. AN INVESTMENT, NOT A DEPOSIT. READ PAGE 6.')
hoja('Orden Global Corp')


# ═══════════════════════════════════════════════════════════════════════════
# 2 · WHAT YOU ARE ACTUALLY BUYING
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('What ONDK is', AL - 28*mm)
hilo(AL - 32*mm)
titulo('You are not buying a coin.', AL - 46*mm, tam=25, color=OROHI)
titulo('You are buying the company.', AL - 62*mm, tam=25, color=ORO)

y = parrafo(
    'ONDK is the security token of Orden Global Corp. It represents participation in the '
    'business itself — not a currency, not a utility token, not a claim on a specific bar '
    'of metal. When the house grows, ONDK is the instrument that holds that growth.',
    AL - 78*mm, ancho=94, tam=10.2, inter=15, color=CREMA)

y -= 10
c.setFillColorRGB(*BRUMA); c.setFont(SANS_B, 9.4)
c.drawString(M, y, 'And the house is already built. Not a roadmap — deployed, running, and yours to check:')
y -= 22

COL = (A - 2*M - 12*mm) / 2
izq, der = M, M + COL + 12*mm

y1 = bloque('Its own Layer 1 blockchain',
            'Chain 8532 is Orden Global\'s. Not a contract rented on somebody else\'s network: '
            'the validators, the gas floor and the rules are the house\'s. Every ONDK movement '
            'is public at ordenscan.com.', y, x=izq, anchoTxt=46)
y2 = bloque('Verified identity, built in',
            'Genesis ID carries KYC, KYB, AML screening and single sign-on across the whole '
            'ecosystem. It is what lets a regulated security token move at all — and most '
            'token projects do not have it.', y, x=der, anchoTxt=46)

y = min(y1, y2) - 18
y1 = bloque('A wallet people already use',
            'Veta Wallet holds ORIGEN, AUKA, AGKA and ONDK, sends and receives, and settles '
            'card and merchant payments through MyTokenPay. It is the front door for '
            'everything the house issues.', y, x=izq, anchoTxt=46)
y2 = bloque('An exchange and a fiat side',
            'Ordenex is the house\'s own exchange. AuCorp gives local-currency accounts in 21 '
            'currencies across Latin America, Canada and the euro — the road out to cash '
            'without leaving the ecosystem.', y, x=der, anchoTxt=46)

y = min(y1, y2) - 22
caja(y - 30*mm, 30*mm)
yy = y - 9*mm
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 8.4)
c.drawString(M + 7*mm, yy, 'THE MINING BUSINESS UNDERNEATH')
parrafo(
    'Orden Global is not a software company that discovered gold as a theme. The metal side is '
    'the origin of the house, and it is what the tokens are referenced to. ONDK is the '
    'instrument that holds participation in all of it at once — the mining operation, the '
    'chain, and the products above it.',
    yy - 13, x=M + 7*mm, ancho=88, tam=9.2, inter=12.6, color=CREMA)

hoja()


# ═══════════════════════════════════════════════════════════════════════════
# 3 · THE PRICE, AND ITS RECORD
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('The price', AL - 28*mm)
hilo(AL - 32*mm)
titulo('Twenty-five months of', AL - 46*mm, tam=25, color=OROHI)
titulo('signed resolutions.', AL - 62*mm, tam=25, color=ORO)

y = parrafo(
    'ONDK does not trade anywhere yet, so its price today is the one the Board of Directors '
    'sets by resolution. Every figure below has a minute number, a date and a signatory, and '
    'every one of them can be checked against the minute book.',
    AL - 78*mm, ancho=94, tam=10.2, inter=15, color=CREMA)

# ── the table ──────────────────────────────────────────────────────────────
y -= 16
FILAS = [
    ('July 1, 2024',     '1.00', 'JD-2024-11',    'Board Secretary'),
    ('December 1, 2024', '1.50', 'JD-2024-12-01', 'Board Secretary'),
    ('July 1, 2025',     '1.70', 'JD-2025-07-01', 'Board Secretary'),
    ('January 1, 2026',  '2.10', 'JD-2026-01-01', 'Board Secretary'),
    ('August 16, 2026',  '2.15', 'JD-2026-08-16', 'Board Secretary'),
]
cx = [M, M + 46*mm, M + 74*mm, M + 112*mm]
c.setFillColorRGB(*HUMO); c.setFont(SANS_B, 7.4)
for t, x in zip(['DATE', 'USD', 'MINUTE', 'SIGNED BY'], cx):
    c.drawString(x, y, ' '.join(t))
y -= 6
hilo(y, alpha=0.22)
y -= 14

for i, (fecha, precio, acta, firma) in enumerate(FILAS):
    ultima = (i == len(FILAS) - 1)
    col = OROHI if ultima else CREMA
    c.setFillColorRGB(*col); c.setFont(SANS_B if ultima else SANS, 10)
    c.drawString(cx[0], y, fecha)
    c.setFillColorRGB(*(ORO if ultima else BRUMA)); c.setFont(SERIF_B if ultima else SANS, 11 if ultima else 10)
    c.drawString(cx[1], y, precio)
    c.setFillColorRGB(*(BRUMA if ultima else HUMO)); c.setFont(SANS, 9.2)
    c.drawString(cx[2], y, acta)
    c.drawString(cx[3], y, firma)
    if ultima:
        c.setFillColorRGB(*ORO); c.setFont(SANS_B, 7.4)
        c.drawString(cx[3] + 34*mm, y, 'IN FORCE')
    y -= 16
    hilo(y + 11, alpha=0.10)

# From here down the page is laid out with ABSOLUTE positions, not by
# subtracting from a running `y`. Relative arithmetic is what let the figures
# land on top of the table the first time this page was built: every block
# guesses how tall the one above it turned out, and one wrong guess cascades
# through everything below.
YCIF = 128*mm                       # the three headline figures
YCAJA = 74*mm                       # the "check it yourself" box, bottom edge
ALTOCAJA = 34*mm
YNOTA = 60*mm                       # what a declared price is, and is not

cifra('USD 2.15', 'in force today, by minute JD-2026-08-16', M, YCIF, tam=23, anchoPie=24)
cifra('+115%', 'from the first declared price, July 2024', M + 62*mm, YCIF, tam=23, anchoPie=24)
cifra('2.10 - 2.15', 'the pre-sale band, per ONDK', M + 124*mm, YCIF, tam=23, anchoPie=24)

caja(YCAJA, ALTOCAJA)
yy = YCAJA + ALTOCAJA - 9*mm
c.setFillColorRGB(*ORO); c.setFont(SANS_B, 8.4)
c.drawString(M + 7*mm, yy, 'CHECK IT YOURSELF. YOU DO NOT NEED OUR PERMISSION.')
c.setFillColorRGB(*CREMA); c.setFont(SANS, 9.2)
c.drawString(M + 7*mm, yy - 14, 'The full series is public and unauthenticated. Open it in any browser:')
c.setFillColorRGB(*JADE); c.setFont(SANS, 8.6)
c.drawString(M + 7*mm, yy - 27, 'ordenex-api-ba4b27b8b51a.herokuapp.com/precio-declarado/ONDK')
c.setFillColorRGB(*BRUMA); c.setFont(SANS, 8.6)
c.drawString(M + 7*mm, yy - 42,
             'The ONDK contract is 0xfb83eEA4B384a4b18E5A1EBa7a4bb4C0b7CA19c1 on chain 8532;')
c.drawString(M + 7*mm, yy - 53, 'every transfer is visible at ordenscan.com.')

c.setFillColorRGB(*ALERTA); c.setFont(SANS_B, 8.6)
c.drawString(M, YNOTA, 'WHAT A DECLARED PRICE IS - AND WHAT IT IS NOT')
parrafo(
    'A declared price is the verifiable fact that the Board, on a given date, in a given '
    'minute, signed by a given officer, resolved to publish that figure. It is not a market '
    'price, it is not an independent valuation, and it does not predict what the token will '
    'trade at once the book opens. It also does not drift between resolutions: it stays flat '
    'at the last signed figure until the Board signs another.',
    YNOTA - 14, ancho=104, tam=9.0, inter=12.4, color=BRUMA)

hoja()


# ═══════════════════════════════════════════════════════════════════════════
# 4 · HOW TO BUY
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('The pre-sale', AL - 28*mm)
hilo(AL - 32*mm)
titulo('Four steps.', AL - 46*mm, tam=25, color=OROHI)

y = parrafo(
    'The pre-sale is open now and closes when the market opens on ' + APERTURA + '. Buying '
    'before then means buying at the Board-declared band rather than at whatever the market '
    'sets afterwards.',
    AL - 60*mm, ancho=94, tam=10.2, inter=15, color=CREMA)

PASOS = [
    ('01', 'Verify your identity in Genesis ID',
     'Mandatory, and not a rule of ours: it is what any anti-money-laundering regime requires '
     'of a regulated security. You do it once, from the Veta Wallet app, and it works across '
     'the whole ecosystem.'),
    ('02', 'Get your Veta Wallet ready',
     'This is where your ONDK will land. Write your twelve recovery words on paper and keep '
     'them off the phone. Without them, if you lose the device, nobody — including us — can '
     'give you back access.'),
    ('03', 'Reserve your allocation',
     'You will need your Genesis ID, the amount in US dollars you want to commit, and your '
     'Veta Wallet address.\n'
     '[COMPLETE: purchase channel · minimum · maximum · size of the round · closing date]'),
    ('04', 'Pay, and receive your ONDK',
     '[COMPLETE: payment rails — transfer to the AuCorp account, AuCorp balance, or crypto. '
     'Include the account and the reference the buyer must use.]\n'
     'Once payment is confirmed against the bank statement, your ONDK are credited to your '
     'wallet at the band price. That confirmation is done by a person today, so allow a few '
     'business hours.'),
]

y -= 12
for num, tit, cuerpo in PASOS:
    c.setFillColorRGB(*ORO); c.setFont(SERIF_B, 17)
    c.drawString(M, y, num)
    c.setFillColorRGB(*OROHI); c.setFont(SANS_B, 11)
    c.drawString(M + 16*mm, y, tit)
    yy = y - 14
    for parte in cuerpo.split('\n'):
        esHueco = parte.startswith('[COMPLETE')
        yy = parrafo(parte, yy, x=M + 16*mm, ancho=82, tam=9.2, inter=12.8,
                     color=ALERTA if esHueco else BRUMA)
    hilo(yy + 3, x0=M, alpha=0.10)
    y = yy - 12

hoja()


# ═══════════════════════════════════════════════════════════════════════════
# 5 · AUGUST 28
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('Market opening · ' + APERTURA, AL - 28*mm)
hilo(AL - 32*mm)
titulo('The book opens.', AL - 46*mm, tam=25, color=OROHI)

y = parrafo(
    'On ' + APERTURA + ' ONDK begins public trading on Ordenex, the ecosystem\'s own '
    'exchange. You sign in with the same Veta Wallet account — there is no second password.',
    AL - 60*mm, ancho=94, tam=10.2, inter=15, color=CREMA)

y -= 12
for rot, cuerpo in [
    ('BUY', 'Anyone verified can buy ONDK publicly, at whatever price the order book shows.'),
    ('SELL', 'You can offer the ONDK you hold. An order rests in the book until someone takes it.'),
    ('CASH OUT', 'Proceeds move to your AuCorp account in local currency — US dollars, lempiras, '
                 'euros and eighteen more — and out to your bank.'),
]:
    c.setFillColorRGB(*ORO); c.setFont(SANS_B, 9)
    c.drawString(M, y, rot)
    parrafo(cuerpo, y, x=M + 30*mm, ancho=74, tam=9.6, inter=13, color=BRUMA)
    y -= 30

# Absolute anchors again, for the same reason as page 3: the box below is the
# most important thing in the document and it cannot be allowed to land on top
# of the line that follows it.
YCAJA5 = 108*mm
ALTO5 = 62*mm
caja(YCAJA5, ALTO5, borde=ALERTA, alphaB=0.55)
yy = YCAJA5 + ALTO5 - 10*mm
c.setFillColorRGB(*ALERTA); c.setFont(SANS_B, 9)
c.drawString(M + 7*mm, yy, 'THE ONE THING TO UNDERSTAND BEFORE YOU COMMIT')
yy = parrafo(
    'A sell order does not execute because you placed it. It executes when somebody on the '
    'other side buys it.',
    yy - 16, x=M + 7*mm, ancho=82, tam=10.4, inter=14.4, color=OROHI, negrita=True)
yy = parrafo(
    'On ' + APERTURA + ' the book opens. Buyers arrive on their own, or they do not. If you '
    'offer 1,000 ONDK at USD 2.15 and nobody wants to buy at that price, your order simply '
    'sits there. You can lower your price to find a buyer - and then you are not selling at '
    '2.15 any more.',
    yy - 8, x=M + 7*mm, ancho=88, tam=9.2, inter=12.8, color=CREMA)
parrafo(
    'Cashing out needs two things: an open market, and someone buying. Only the first is in '
    'our hands.',
    yy - 4, x=M + 7*mm, ancho=88, tam=9.2, inter=12.8, color=CREMA)

parrafo(
    'We would rather you hear that from us now than discover it in September. Everything on '
    'the next page is written for the same reason.',
    92*mm, ancho=94, tam=9.6, inter=13.4, color=HUMO)

hoja()


# ═══════════════════════════════════════════════════════════════════════════
# 6 · BEFORE YOU COMMIT
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('Read this twice', AL - 28*mm, color=ALERTA)
hilo(AL - 32*mm, color=ALERTA, alpha=0.45)
titulo('What we would rather', AL - 46*mm, tam=25, color=OROHI)
titulo('tell you ourselves.', AL - 62*mm, tam=25, color=ALERTA)

y = AL - 80*mm
RIESGOS = [
    ('In the pre-sale you cannot sell.',
     'You are buying before a market exists. Between today and ' + APERTURA + ' there is '
     'nowhere to sell ONDK — not because we restrict it, but because the other half of the '
     'trade does not exist yet. Your money is committed until the book opens. Commit only '
     'what you can leave still.'),
    ('The market price can settle below 2.10.',
     'The Board-declared price and the market price are two different things. Once the book '
     'opens, ONDK is worth what people pay for it — which can be more than 2.15 or less than '
     '2.10. Buying the pre-sale band does not guarantee selling above it.'),
    ('A new book is a thin book.',
     'A market that has just opened has few participants. Expect days with little or no '
     'volume, and wide gaps between what sellers ask and what buyers offer. That is normal in '
     'a new order book, and it means selling in a hurry can be expensive.'),
    ('This is an investment. You can lose money.',
     'ONDK is a security token: participation in a real company, with a real mining business '
     'behind it, and with the risks any company carries. You can lose part or all of what you '
     'commit. There is no deposit insurance, no guaranteed return, and nobody will refund you '
     'if the business does not go the way it is expected to.'),
]
for tit, cuerpo in RIESGOS:
    c.setFillColorRGB(*ALERTA); c.setFont(SANS_B, 11)
    c.drawString(M, y, tit)
    y = parrafo(cuerpo, y - 15, ancho=94, tam=9.4, inter=13, color=CREMA)
    y -= 16

hilo(y + 4)
parrafo(
    'None of this is here because a lawyer asked for it. It is here because a buyer who '
    'understands it is a buyer who stays — and because the fastest way to lose a house\'s '
    'name is to let somebody find out afterwards.',
    y - 12, ancho=94, tam=9.4, inter=13.2, color=HUMO)

hoja()


# ═══════════════════════════════════════════════════════════════════════════
# 7 · QUESTIONS, AND THE FINE PRINT THAT IS NOT FINE
# ═══════════════════════════════════════════════════════════════════════════
fondo()
sello('Questions', AL - 28*mm)
hilo(AL - 32*mm)
titulo('Before you ask.', AL - 46*mm, tam=25, color=OROHI)

y = AL - 62*mm
FAQ = [
    ('Where do I see my ONDK?',
     'In your Veta Wallet, and in the public explorer at ordenscan.com. Every movement is on '
     'the chain and you can verify it without asking us for anything.'),
    ('Can I transfer ONDK to someone else before ' + APERTURA + '?',
     '[COMPLETE: yes / no. If there is a lock-up, state it here with its exact term.]'),
    ('What if I change my mind before the opening?',
     '[COMPLETE: cancellation and refund policy — or say plainly that there is none.]'),
    ('What are the fees?',
     '[COMPLETE: pre-sale fee, and buy/sell fees on Ordenex.]'),
    ('Can I buy from any country?',
     '[COMPLETE: eligible and excluded jurisdictions. This is set by the regime the offering '
     'is made under, and it has to be said before anyone pays.]'),
    ('What if I lose my phone?',
     'Your twelve recovery words restore your wallet on another device. Without them, nothing '
     'can. Write them on paper and keep them somewhere safe.'),
]
for q, a in FAQ:
    c.setFillColorRGB(*OROHI); c.setFont(SANS_B, 9.6)
    c.drawString(M, y, q)
    esHueco = a.startswith('[COMPLETE')
    y = parrafo(a, y - 13, ancho=98, tam=9.1, inter=12.4,
                color=ALERTA if esHueco else BRUMA)
    y -= 9

# Absolute anchors: the legal block is the tallest thing on the page and it
# cannot be allowed to climb into the box above it.
YCAJA7 = 124*mm
ALTO7 = 25*mm
caja(YCAJA7, ALTO7, borde=ALERTA, alphaB=0.55)
yy = YCAJA7 + ALTO7 - 8*mm
c.setFillColorRGB(*ALERTA); c.setFont(SANS_B, 9)
c.drawString(M + 7*mm, yy, 'BEWARE OF SCAMS')
parrafo(
    'We will never ask you for your twelve recovery words, or for your password - not by chat, '
    'not by phone, not by email. Nobody at Orden Global ever will. If someone does, it is a '
    'scam.',
    yy - 14, x=M + 7*mm, ancho=96, tam=9.0, inter=12.4, color=CREMA)

YLEG = 120*mm
c.setFillColorRGB(*HUMO); c.setFont(SANS_B, 8)
c.drawString(M, YLEG, ' '.join('LEGAL'))
hilo(YLEG - 5, alpha=0.18)

LEGAL = [
    'ONDK is a SECURITY TOKEN. This is an offering of securities, not the sale of a consumer '
    'product or of a utility cryptocurrency.',
    '[COMPLETE: issuing entity, jurisdiction of the offering, and the regime it is issued under.]',
    'The USD 2.10-2.15 band is the price DECLARED BY THE BOARD OF DIRECTORS by resolution '
    '(minute JD-2026-08-16). It is not an independent valuation, not a market price, and not a '
    'forecast of any future price.',
    'Nothing in this document is a promise of return. The historical figures shown are past '
    'Board resolutions and do not indicate future results.',
    'The market opening on ' + APERTURA + ' is a planned date. OPENING A MARKET DOES NOT CREATE '
    'LIQUIDITY: the ability to sell depends on buyers existing, which nobody guarantees.',
    'AuCorp, which provides the local-currency accounts used to cash out, is a financial '
    'technology institution incorporated in Prospera ZEDE under FinTech Regulation A. It is NOT '
    'a licensed bank and balances are NOT covered by deposit insurance.',
    '[COMPLETE: reference to the subscription agreement / terms the buyer signs.]',
]
y = YLEG - 18
for t in LEGAL:
    esHueco = t.startswith('[COMPLETE')
    c.setFillColorRGB(*(ALERTA if esHueco else HUMO))
    c.setFont(SANS, 7.7)
    for linea in textwrap.wrap(t, 118):
        c.drawString(M, y, linea); y -= 10.2
    y -= 3.5

hilo(34*mm)
c.setFillColorRGB(*HUMO); c.setFont(SANS, 7.6)
c.drawString(M, 28*mm, 'Support and questions: [COMPLETE: official email and channel]')
c.drawString(M, 22*mm,
             'Document dated ' + FECHA + ' - price in force at issue: USD 2.15 - minute JD-2026-08-16')

hoja()

c.save()
print('  ' + str(SALIDA) + ' · ' + str(pagina[0]) + ' pages')
