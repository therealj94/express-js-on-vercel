#!/usr/bin/env python3
"""Animatic de «Pésalo» (Documento 9): 2:00, 1920×1080, 24 fps. Sigue los tiempos de los dieciséis bloques."""
import numpy as np, subprocess, pathlib, math, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

AQUI = pathlib.Path(__file__).parent
REC = pathlib.Path('/home/user/express-js-on-vercel/documentos-junta/recursos')
W, H, FPS, DUR = 1920, 1080, 24, 120.0
FUENTE_SB = str(AQUI / 'fuentes/BarlowCondensed-SemiBold.ttf')
FUENTE_MD = str(AQUI / 'fuentes/BarlowCondensed-Medium.ttf')
def fuente(tam, peso='md'): return ImageFont.truetype(FUENTE_SB if peso == 'sb' else FUENTE_MD, tam)

IMG = {
 'S01': 'storyboard/01-web1-cibercafe.jpg', 'S02': 'storyboard/02-web2-madrugada.jpg', 'S03': 'storyboard/03-web3-ferreteria.jpg',
 'S04': 'storyboard/04-la-que-murio.jpg', 'S05': 'storyboard/05-mina-danli.jpg', 'S06': 'storyboard/06-balanza-oro.jpg',
 'S07': 'storyboard/07-mercado-cobro.jpg', 'S09': 'storyboard/09-vendedora-retrato.jpg', 'S10': 'storyboard/10-barra-manos.jpg',
 'C1': 'storyboard-continental/C1-capital-puesto.jpg', 'C2': 'storyboard-continental/C2-azotea-brasil.jpg',
 'C3': 'storyboard-continental/C3-mercado-balanza.jpg', 'C4': 'storyboard-continental/C4-kiosco-noche.jpg',
 'C5': 'storyboard-continental/C5-pescador-amanecer.jpg',
}
_src = {}
def fuente_img(k):
    if k not in _src: _src[k] = np.asarray(Image.open(REC / IMG[k]).convert('RGB')).astype(np.float32)
    return _src[k]

def gradar(a, modo):
    lum = (a[..., 0]*0.299 + a[..., 1]*0.587 + a[..., 2]*0.114)[..., None]
    if modo == 'frio':      # primera mitad: pico verde-cian, ninguna piel correcta, negros limpios
        a = lum + (a - lum) * 0.42
        mid = np.clip(1 - np.abs(lum - 118) / 118, 0, 1)
        a = a * np.array([0.86, 1.0, 0.97]) + mid * np.array([0, 12, 8])
        a = (a - 128) * 1.07 + 124
    elif modo == 'gris':    # latón deslustrado, casi gris: no hay oro antes del segundo 40
        a = lum + (a - lum) * 0.12
        a = a * np.array([0.93, 1.0, 1.0]) + np.array([0, 3, 4])
        a = (a - 128) * 1.05 + 124
    elif modo == 'natural':
        a = lum + (a - lum) * 0.95; a = (a - 128) * 1.03 + 128
    elif modo == 'calido':  # segunda mitad: luz motivada, pieles reales
        a = lum + (a - lum) * 1.05
        a = a * np.array([1.05, 1.0, 0.92]); a = (a - 128) * 1.05 + 128
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
_grad = {}
def imagen(k, modo, espejo=False):
    clave = (k, modo, espejo)
    if clave not in _grad:
        im = gradar(fuente_img(k), modo)
        _grad[clave] = im.transpose(Image.FLIP_LEFT_RIGHT) if espejo else im
    return _grad[clave]

# ---------------------------------------------------------------- planos
# cada plano: (t0, t1, img, grado, (cx,cy,w) inicial, (cx,cy,w) final, pulso de mano, extra)
P = []
def plano(t0, t1, img, grado, c0, c1=None, mano=0.0, **kw): P.append(dict(t0=t0, t1=t1, img=img, grado=grado, c0=c0, c1=c1 or c0, mano=mano, **kw))
REGLA = (1090, 880, 1250)          # el encuadre de la balanza: idéntico en el bloque 2 y en el 15
# 1 · lo que perdí
plano(0.0, 0.5, 'C3', 'gris', (1090, 935, 560), vibra=1)
plano(0.5, 2.55, 'C1', 'natural', (1123, 430, 1000), (1123, 420, 950))
plano(2.55, 4.05, 'C2', 'natural', (1007, 330, 900), (1007, 322, 860))
plano(4.05, 5.45, 'C4', 'natural', (1057, 470, 1000), (1057, 460, 950))
plano(5.45, 8.0, 'C5', 'natural', (800, 370, 1000), (800, 360, 950))
# 2 · la regla
plano(8.0, 10.2, 'C3', 'gris', REGLA, (1090, 890, 1180), mano=6)
plano(10.2, 11.2, 'C3', 'gris', (1090, 940, 620), mano=5)
plano(11.2, 13.0, 'C3', 'gris', (1057, 560, 1100), (1057, 570, 1060), mano=6)
# 3 · era uno — el cuaderno
plano(13.0, 14.4, 'S01', 'frio', (1632, 190, 520), mano=10)
plano(14.4, 15.7, 'S01', 'frio', (1180, 830, 700), mano=10)
plano(15.7, 17.0, 'S01', 'frio', (450, 520, 760), mano=10)
# 4 · era dos — la fotocopia y el espejo (8 planos)
for i, c in enumerate([(930, 290, 620), (870, 610, 460), (1632, 270, 700), (1020, 360, 820), (620, 830, 900), (860, 600, 360), (1500, 300, 520), (900, 610, 300)]):
    plano(17.0 + i*0.75, 17.0 + (i+1)*0.75, 'S02', 'frio', c, mano=12)
# 5 · era tres — la mesa que se plegaba (6 planos)
for i, c in enumerate([(848, 860, 600), (1018, 250, 480), (1008, 650, 600), (330, 400, 700), (848, 880, 430), (1008, 540, 400)]):
    plano(23.0 + i*5/6, 23.0 + (i+1)*5/6, 'S03', 'frio', c, mano=14)
# 6 · era cuatro — la que ni llegó (9 planos, el último sostenido)
cortes4 = [(1100, 250, 700), (1200, 720, 600), (520, 720, 620), (1000, 450, 800), (1300, 960, 600), (1700, 760, 520), (820, 620, 560), (1500, 560, 640)]
for i, c in enumerate(cortes4):
    plano(28.0 + i*0.41, 28.0 + (i+1)*0.41, 'S04', 'frio', c, mano=16)
plano(28.0 + 8*0.41, 32.0, 'S04', 'frio', (1150, 690, 880), (1165, 690, 860), mano=4)
# 8 · nos faltó peso — el cuadro se abre sobre el minero
plano(38.9, 41.5, 'S05', 'calido', (1097, 390, 900), (1097, 370, 800))
# 9 · el foso
plano(41.5, 43.8, 'S05', 'calido', (980, 600, 1800), (990, 590, 1650))
plano(43.8, 46.0, 'S05', 'calido', (420, 560, 900), (450, 560, 820))
plano(46.0, 51.0, 'S10', 'calido', (960, 610, 900), (969, 595, 700))
# 10 · siete máquinas (procedural)
P.append(dict(t0=51.0, t1=55.6, proc='maquinas'))
# 11 · nadie se aprueba solo: la misma cara de la era dos, ahora entera y cálida
plano(55.6, 59.4, 'S02', 'calido', (870, 560, 1150), (870, 560, 1000))
P.append(dict(t0=59.4, t1=66.0, proc='cumplimiento'))
# 12 · los oficios: seis planos de 1,4 s exactos, misma talla
relevo = [('C2', (1007, 340, 900)), ('S09', (1050, 420, 950)), ('C1', (1123, 430, 1000)), ('C4', (1057, 470, 1000)), ('S06', (900, 560, 1200)), ('S05', (1097, 400, 950))]
for j, (k, c) in enumerate(relevo):
    plano(66.0 + 1.4*j, 66.0 + 1.4*(j+1), k, 'calido', c, (c[0], c[1] - 8, c[2] * 0.95))
for j in range(12):   # el unísono: 5,6 s en relevo rápido
    k, c = relevo[j % 6]
    plano(74.4 + j*(5.6/12), 74.4 + (j+1)*(5.6/12), k, 'calido', (c[0], c[1], c[2]*0.8))
# 13 · el mismo gramo: dos manos distintas, la misma pieza
plano(80.0, 81.5, 'S06', 'calido', (960, 570, 720))
plano(81.5, 83.0, 'S10', 'calido', (969, 600, 720))
# 14 · la salida (siete planos, el último largo)
plano(83.0, 86.0, 'S07', 'calido', (1024, 560, 1800), (1024, 560, 1650))
plano(86.0, 89.0, 'S07', 'calido', (1060, 280, 620), (1060, 270, 560))
plano(89.0, 92.5, 'S06', 'calido', (900, 600, 1150), (920, 600, 1000))
plano(92.5, 95.5, 'S07', 'calido', (786, 960, 560), (786, 960, 500))
plano(95.5, 99.0, 'S07', 'calido', (1560, 360, 760), (1560, 350, 700))
plano(99.0, 105.0, 'S10', 'calido', (880, 700, 1200), (905, 680, 880))
# 15 · el fiel vuelve al centro: el mismo encuadre del bloque 2, ahora con luz
plano(105.0, 108.5, 'C3', 'calido', REGLA, (1090, 885, 1200))
plano(108.5, 112.6, 'S06', 'calido', (900, 560, 1150), (930, 640, 950), golpe=112.0)
plano(112.6, 115.0, 'C3', 'calido', (1057, 430, 950), (1057, 400, 800))   # la misma vendedora que enseñó la regla, al lente

def plano_en(t):
    for p in P:
        if p['t0'] <= t < p['t1']: return p
    return None

# ---------------------------------------------------------------- ventana
def ease(x): x = min(max(x, 0), 1); return x*x*(3-2*x)
def ventana(t):
    """Rectángulo visible (x, y, w, h). None = negro."""
    if t < 17.0: s = 1.0
    elif t < 23.0: s = 1.0 - 0.20*ease((t-17.0)/0.25)
    elif t < 28.0: s = 0.80 - 0.22*ease((t-23.0)/0.25)
    elif t < 32.0: s = 0.58 - 0.24*ease((t-28.0)/0.25)
    elif t < 32.25:
        k = ease((t-32.0)/0.25); w = W*0.34; h = max(1, H*0.34*(1-k)); return ((W-w)/2, (H-h)/2, w, h)
    elif t < 38.9: return None
    elif t < 38.9 + 0.5:   # doce fotogramas: de una línea a pantalla completa
        k = ease((t-38.9)/0.5); h = max(1, H*k); return (0, (H-h)/2, W, h)
    elif 115.0 <= t: return None
    else: s = 1.0
    return ((W - W*s)/2, (H - H*s)/2, W*s, H*s)

# ---------------------------------------------------------------- textos
LINEAS = [  # (t0, t1, texto, traducción, estilo)
 (0.55, 2.2, 'Metí la plata del alquiler.', None, 'sub'),
 (2.35, 4.0, 'Metí el aguinaldo.', None, 'sub'),
 (4.15, 5.8, 'Metí la quincena.', None, 'sub'),
 (5.95, 7.9, 'Botei o salário. Ninguém me avisou.', 'Metí el sueldo. Nadie me avisó.', 'sub'),
 (8.3, 10.6, 'Un gramo pesa igual en todas partes.', None, 'sub'),
 (11.3, 12.8, 'Pésalo.', None, 'bajo'),
 (13.6, 16.6, 'Al principio no pedían nada.', None, 'sub'),
 (17.4, 19.8, 'Después pidieron mi cara.', None, 'sub'),
 (20.2, 22.6, 'Nadie me explicó nada.', None, 'sub'),
 (23.6, 26.8, 'Disseram que dobrava.', 'Dijeron que se duplicaba.', 'sub'),
 (28.5, 31.5, 'La siguiente ni llegó.', None, 'sub'),
 (35.9, 37.5, 'No nos faltó coraje. Nos faltó peso.', None, 'centro'),
 (38.6, 39.9, 'Esto sale de acá.', None, 'sub'),
 (46.3, 48.8, 'Un gramo, partido en cincuenta y cinco.', None, 'sub'),
 (49.4, 50.8, 'Eso es un ORIGEN.', None, 'sub'),
 (51.4, 53.0, 'São sete máquinas nossas.', 'Son siete máquinas nuestras.', 'sub'),
 (53.1, 54.9, 'ORIGEN se move sem taxa de rede.', 'ORIGEN se mueve sin comisión de red.', 'sub'),
 (55.6, 57.1, 'No la doy en cada aplicación.', None, 'sub'),
 (57.3, 58.8, 'Me revisó una persona.', None, 'sub'),
 (63.8, 65.8, 'Nadie se aprueba solo.', None, 'sub'),
 (66.1, 67.3, 'Reparto.', None, 'sub'), (67.5, 68.7, 'Vendo verdura.', None, 'sub'),
 (68.9, 70.1, 'Eu costuro.', 'Coso.', 'sub'), (70.3, 71.5, 'Corto pelo.', None, 'sub'),
 (71.7, 72.9, 'Peso oro.', None, 'sub'), (73.1, 74.3, 'Saco piedra.', None, 'sub'),
 (74.5, 79.8, 'Un gramo pesa igual en todas partes.', 'Um grama pesa igual em todo lugar.', 'grande'),
 (100.3, 102.8, 'Esta vez lo pesé.', None, 'sub'),
 (106.4, 109.2, 'No te pedimos que creas.', None, 'sub'),
 (112.05, 114.8, 'Pésalo.', None, 'remate'),
]
import json as _json, re as _re
_DV = _json.load(open(AQUI / 'voz' / 'duraciones.json'))
_COL = {int(k): float(v) for k, v in _re.findall(r"(\d+): \(([\d.]+), '", open(AQUI / 'audio.py', encoding='utf-8').read().split('COLOCACION = {')[1].split('}')[0])}
_ORDEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 31, 32, 33]
LINEAS = [(_COL[n] - 0.05, _COL[n] + _DV[str(n)] + (0.5 if n in (12, 30, 33) else 0.3), tx, tr, es) for n, (a_, b_, tx, tr, es) in zip(_ORDEN, LINEAS)]
_EXT = {12: 38.9, 30: 79.8, 33: 114.8}
LINEAS = [(a_, _EXT.get(n, b_), tx, tr, es) for n, (a_, b_, tx, tr, es) in zip(_ORDEN, LINEAS)]
LINEAS = [(a_, min(b_, LINEAS[i+1][0] - 0.02) if i + 1 < len(LINEAS) else b_, tx, tr, es) for i, (a_, b_, tx, tr, es) in enumerate(LINEAS)]
def capa_texto(texto, trad, estilo):
    """Capa RGBA de 1920×1080 con sombra suave; se cachea por línea."""
    capa = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    tam, y, alfa = {'sub': (50, 950, 255), 'bajo': (40, 960, 170), 'centro': (66, 540, 255), 'grande': (66, 900, 255), 'remate': (92, 905, 255)}[estilo]
    f1 = fuente(tam, 'md'); f2 = fuente(int(tam*0.66), 'md')
    sombra = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ds = ImageDraw.Draw(sombra); d = ImageDraw.Draw(capa)
    y1 = y - (int(tam*0.45) if trad else 0)
    for dd, col in ((ds, (0, 0, 0, 200)), (d, (255, 255, 255, alfa))):
        dd.text((W/2, y1), texto, font=f1, fill=col, anchor='mm')
        if trad: dd.text((W/2, y1 + tam*0.95), trad, font=f2, fill=col if dd is ds else (205, 205, 205, alfa), anchor='mm')
    sombra = sombra.filter(ImageFilter.GaussianBlur(5))
    return Image.alpha_composite(sombra, capa)
_capas = {}
def texto_en(t):
    for i, (a, b, tx, tr, es) in enumerate(LINEAS):
        if a <= t < b:
            if i not in _capas: _capas[i] = capa_texto(tx, tr, es)
            return _capas[i]
    return None

MARCA = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(MARCA).text((W - 48, 44), 'ANIMATIC · MÁSTER BASE · PREVISUALIZACIÓN', font=fuente(22), fill=(255, 255, 255, 95), anchor='rm')

def contador(t, d):
    num = 4 if t < 17 else 3 if t < 23 else 2 if t < 28 else 1
    if 13.0 <= t < 32.25:
        d.text((86, H - 70), str(num), font=fuente(72, 'sb'), fill=(255, 255, 255), anchor='lm')

LEGAL = ('ORIGEN es un activo digital respaldado en oro certificado. No es moneda de curso legal, no es un depósito, no paga rendimiento y su valor puede variar.',
         'Otros servicios del ecosistema pueden tener costos. La custodia del metal y la operación de la red están a cargo de la empresa. Disponible sólo donde se indique.',
         'Condiciones y disponibilidad en [dirección web pendiente].')

def cartelas(t, lienzo):
    d = ImageDraw.Draw(lienzo)
    if 32.25 <= t < 34.5:        # el 0 crece desde la esquina y se vuelve CERO
        if t < 32.85:
            k = ease((t - 32.25) / 0.6)
            x = 86 + (W/2 - 86) * k; y = (H - 70) + (H/2 - (H - 70)) * k; tam = int(72 + (230 - 72) * k)
            d.text((x, y), '0', font=fuente(tam, 'sb'), fill=(255, 255, 255), anchor='mm')
        else:
            a = int(255 * min(1, (34.5 - t) / 0.2))
            d.text((W/2, H/2), 'CERO', font=fuente(230, 'sb'), fill=(a, a, a), anchor='mm')
    if 115.0 <= t < 117.5:
        d.text((W/2, H/2 - 70), 'ORIGEN', font=fuente(230, 'sb'), fill=(255, 255, 255), anchor='mm')
        d.text((W/2, H/2 + 95), '1 ORIGEN = 1/55 DE GRAMO DE ORO CERTIFICADO', font=fuente(34, 'md'), fill=(225, 225, 225), anchor='mm')
        for i, l in enumerate(LEGAL):
            d.text((W/2, H - 120 + i*30), l, font=fuente(21, 'md'), fill=(165, 165, 165), anchor='mm')
    if 118.0 <= t < 120.0:
        d.text((W/2, H/2), 'PÉSALO', font=fuente(230, 'sb'), fill=(255, 255, 255), anchor='mm')

# ---------------------------------------------------------------- procedurales
def maquinas(t):
    p = (t - 51.0) / 4.0
    im = Image.new('RGB', (W, H)); a = np.zeros((H, W, 3), np.float32)
    grad = np.linspace(0, 1, H)[:, None]
    a[...] = (np.array([4, 9, 20]) * (1 - grad) + np.array([8, 22, 48]) * grad)[:, :, :] if False else 0
    a += (np.array([4, 9, 20])[None, None, :] * (1 - grad[..., None]) + np.array([9, 24, 52])[None, None, :] * grad[..., None])
    im = Image.fromarray(a.astype(np.uint8)); d = ImageDraw.Draw(im)
    cx = 1080 - 170 * ease(p)
    for off, osc in ((-620, .35), (620, .35)):      # racks vecinos, fuera de foco
        d.rectangle([cx + off - 230, 30, cx + off + 230, H - 30], fill=(int(14*osc*2), int(20*osc*2), int(34*osc*2)))
    d.rectangle([cx - 250, 20, cx + 250, H - 20], fill=(16, 22, 34), outline=(40, 52, 72), width=3)
    luces = Image.new('RGB', (W, H)); dl = ImageDraw.Draw(luces)
    rng = np.random.default_rng(int(t * 24))
    for i in range(7):                                # siete validadores apilados en columna
        y0 = 70 + i * 138
        d.rectangle([cx - 225, y0, cx + 225, y0 + 112], fill=(24, 31, 45), outline=(52, 64, 86), width=2)
        for j in range(12):
            on = rng.random() > 0.35 or j == 0
            col = (70, 255, 190) if j == 0 else ((80, 200, 255) if on else (20, 40, 55))
            x = cx - 190 + j * 30; y = y0 + 56
            dl.ellipse([x - 5, y - 5, x + 5, y + 5], fill=col if on else (0, 0, 0))
            d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=col)
    halo = luces.filter(ImageFilter.GaussianBlur(9))
    out = np.clip(np.asarray(im, np.float32) + np.asarray(halo, np.float32) * 1.4, 0, 255)
    borde = Image.fromarray(out.astype(np.uint8))
    return borde

def cumplimiento(t):
    base = Image.new('RGB', (W, H), (10, 12, 16)); d = ImageDraw.Draw(base)
    d.rectangle([140, 180, 820, 620], fill=(70, 90, 120)); d.rectangle([1100, 160, 1800, 600], fill=(60, 80, 108))
    base = base.filter(ImageFilter.GaussianBlur(38)); d = ImageDraw.Draw(base)
    siguiente = t >= 61.4
    k = ease((t - 61.0) / 0.4) if 61.0 <= t < 61.4 else (1.0 if siguiente else 0.0)
    x0 = 610 + (0 if t < 61.0 else (-900 * k if not siguiente else 0))
    if t >= 61.0 and not siguiente: pass
    tarjeta = [x0, 330, x0 + 700, 700]
    d.rounded_rectangle(tarjeta, 18, fill=(28, 32, 40), outline=(64, 72, 88), width=2)
    for i in range(4):   # el expediente, fuera de foco: renglones sin texto legible
        d.rounded_rectangle([x0 + 50, 380 + i * 44, x0 + 50 + [520, 430, 480, 300][i], 398 + i * 44], 6, fill=(58, 64, 78))
    rech = [x0 + 50, 590, x0 + 330, 660]; apro = [x0 + 370, 590, x0 + 650, 660]
    pulsado_r = (not siguiente) and 60.0 <= t < 61.0
    pulsado_a = siguiente and t >= 63.6
    d.rounded_rectangle(rech, 10, fill=(170, 40, 40) if pulsado_r else (28, 32, 40), outline=(200, 70, 70), width=3)
    d.rounded_rectangle(apro, 10, fill=(40, 140, 90) if pulsado_a else (28, 32, 40), outline=(70, 180, 120), width=3)
    f = fuente(34, 'sb')
    d.text(((rech[0]+rech[2])/2, 625), 'RECHAZAR', font=f, fill=(255, 235, 235) if pulsado_r else (225, 120, 120), anchor='mm')
    d.text(((apro[0]+apro[2])/2, 625), 'APROBAR', font=f, fill=(235, 255, 245) if pulsado_a else (130, 210, 160), anchor='mm')
    if not siguiente:   # el cursor llega a RECHAZAR
        k = ease((t - 59.4) / 0.55); cx = 1500 + ((rech[0]+rech[2])/2 - 1500) * k; cy = 900 + (630 - 900) * k
    else:
        k = ease((t - 62.4) / 1.0); cx = (rech[0]+rech[2])/2 + ((apro[0]+apro[2])/2 - (rech[0]+rech[2])/2) * k; cy = 630
    d.polygon([(cx, cy), (cx, cy + 34), (cx + 9, cy + 25), (cx + 16, cy + 40), (cx + 22, cy + 37), (cx + 15, cy + 22), (cx + 27, cy + 22)], fill=(245, 245, 245), outline=(0, 0, 0))
    return base

# ---------------------------------------------------------------- composición
rng_g = np.random.default_rng(7)
GRANO = [np.repeat(np.repeat(rng_g.normal(0, 5.5, (H//2, W//2, 1)), 2, 0), 2, 1).astype(np.float32) for _ in range(12)]

def jitter(t, p):
    if p.get('vibra'):
        u = t - p['t0']; A = 22 * math.exp(-u / 0.18)
        return A * math.sin(2*math.pi*14*u), A * 0.5 * math.cos(2*math.pi*11*u)
    A = p['mano']
    if not A: return 0.0, 0.0
    s = p['t0'] * 3.7
    return (A * (0.6*math.sin(2*math.pi*0.9*t + s) + 0.4*math.sin(2*math.pi*2.3*t + 2*s)),
            A * (0.6*math.sin(2*math.pi*0.7*t + 1.3*s) + 0.4*math.sin(2*math.pi*1.9*t + 0.5*s)))

def recorte(p, t, ww, wh):
    k = (t - p['t0']) / max(1e-6, p['t1'] - p['t0']); k = ease(k) * 0.5 + k * 0.5
    c0, c1 = p['c0'], p['c1']
    cx = c0[0] + (c1[0] - c0[0]) * k; cy = c0[1] + (c1[1] - c0[1]) * k; w = c0[2] + (c1[2] - c0[2]) * k
    h = w * wh / ww
    jx, jy = jitter(t, p); esc = w / ww
    cx += jx * esc; cy += jy * esc
    if p.get('golpe'):
        u = t - p['golpe']
        if u >= 0: cy -= (10 if u < 1/24 else 4 if u < 2/24 else 0) * esc + 5 * math.exp(-u / 0.25) * math.sin(2*math.pi*3.2*u) * esc
    im = imagen(p['img'], p['grado'], p.get('espejo', False))
    iw, ih = im.size
    w = min(w, iw); h = min(h, ih)
    x0 = min(max(cx - w/2, 0), iw - w); y0 = min(max(cy - h/2, 0), ih - h)
    return im.resize((max(1, int(round(ww))), max(1, int(round(wh)))), Image.BILINEAR, box=(x0, y0, x0 + w, y0 + h))

def cuadro(i):
    t = i / FPS
    lienzo = Image.new('RGB', (W, H), (0, 0, 0))
    v = ventana(t); p = plano_en(t)
    if v and p:
        x, y, ww, wh = v
        if p.get('proc'):
            src = maquinas(t) if p['proc'] == 'maquinas' else cumplimiento(t)
            pieza = src.resize((max(1, int(ww)), max(1, int(wh))), Image.BILINEAR) if (ww, wh) != (W, H) else src
        else:
            pieza = recorte(p, t, ww, wh)
        lienzo.paste(pieza, (int(round(x)), int(round(y))))
    d = ImageDraw.Draw(lienzo)
    contador(t, d); cartelas(t, lienzo)
    capa = texto_en(t)
    lienzo = lienzo.convert('RGBA')
    if capa is not None: lienzo = Image.alpha_composite(lienzo, capa)
    lienzo = Image.alpha_composite(lienzo, MARCA).convert('RGB')
    a = np.asarray(lienzo, np.float32) + GRANO[i % 12] * (0.6 if (v is None or t >= 115) else 1.0)
    return np.clip(a, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'muestras':
        for s in [float(x) for x in sys.argv[2:]]:
            Image.fromarray(cuadro(int(s * FPS))).save(AQUI / f'muestra-{s:06.2f}.jpg', quality=85)
        sys.exit()
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    salida = AQUI / 'pesalo-animatic.mp4'
    cmd = [ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-i', str(AQUI / 'banda.wav'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-maxrate', '5M', '-bufsize', '10M',
           '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(salida)]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(DUR * FPS)
    for i in range(total):
        pr.stdin.write(cuadro(i).tobytes())
        if i % 240 == 0: print(f'{i/FPS:6.1f} s', flush=True)
    pr.stdin.close(); pr.wait()
    print('listo', salida, salida.stat().st_size // 1024, 'kB')
