#!/usr/bin/env python3
"""Película 2: el ecosistema, renderizada entera aquí. Sin GPU y sin coste.

Es todo lo que el modelo de vídeo NO sabe hacer —tipografía nítida, interfaz,
logos— y que en cambio un dibujante de píxeles hace perfecto y gratis. Por eso
esta película sale a cero mientras la otra cuesta cinco dólares.

El único truco de la pieza sale del propio logo. La marca son líneas que, donde
se cruzan, se rompen en una retícula de puntos; así que aquí todo se hace y se
deshace en puntos. Y los puntos no van a posiciones inventadas: se muestrean del
PNG real del logo, de modo que el enjambre converge exactamente en la marca.

    python3 montaje/ecosistema.py prompts/pelicula2_ecosistema.json salida.mp4
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from acabado import acabar, escalonar, salida, salida_rebote, sombra_larga

W, H, FPS = 1080, 1920, 30
NEGRO = (11, 11, 12)
ORO = (231, 195, 98)
TEXTO = (244, 239, 228)
APAGADO = (138, 131, 120)

RAIZ = Path(__file__).resolve().parent
LOGOS = RAIZ.parent.parent / "logos-orden-global"

# DejaVu es lo que hay en esta máquina. La serif para los titulares y la mono
# para los datos mantienen la misma jerarquía del tratamiento.
F_TIT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
F_ROT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_DAT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"


def fuente(ruta, px):
    return ImageFont.truetype(ruta, px)


def suave(x):
    """Ease-out exponencial: el 80 % del camino en el primer 20 % del tiempo.

    Antes era smoothstep, que es simétrico y por tanto blando en los dos
    extremos. "Si tu curva de velocidad parece un triángulo, es amateur: debe
    tener entrada vertical y salida muy larga." Cambiar solo esta función
    cambia el carácter de TODOS los movimientos de la película."""
    return salida(x, 4.6)


def centrar(d, texto, f, y, color, sep=0):
    """Texto centrado. Devuelve la y de la línea siguiente."""
    lineas = texto.split("\n")
    for ln in lineas:
        a = d.textbbox((0, 0), ln, font=f)
        d.text(((W - (a[2] - a[0])) / 2 - a[0], y), ln, font=f, fill=color)
        y += (a[3] - a[1]) + sep
    return y


def puntos_del_logo(ruta, n=900, ancho=680):
    """Muestrea el PNG del logo y devuelve las posiciones donde hay marca.

    Sacar los destinos del archivo real, en vez de inventarlos, es lo que hace
    que el enjambre termine formando el logo de verdad y no una aproximación."""
    im = Image.open(ruta).convert("RGBA")
    alto = int(im.height * ancho / im.width)
    im = im.resize((ancho, alto), Image.LANCZOS)
    a = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(a > 90)
    if len(xs) == 0:
        return np.zeros((0, 2)), im
    idx = np.random.default_rng(7).choice(len(xs), size=min(n, len(xs)),
                                          replace=False)
    ox, oy = (W - ancho) / 2, (H - alto) / 2
    return np.stack([xs[idx] + ox, ys[idx] + oy], 1).astype(float), im


def enjambre(d, destinos, avance, dispersion=1.0, rng=None):
    """Los puntos van de su posición dispersa a la del logo.

    Cada punto lleva su propio retardo: si todos llegaran a la vez el gesto
    sería una transición, y lo que se busca es que parezca que se juntan."""
    rng = rng or np.random.default_rng(11)
    n = len(destinos)
    ang = rng.uniform(0, 2 * np.pi, n)
    rad = rng.uniform(420, 1500, n) * dispersion
    ini = destinos + np.stack([np.cos(ang) * rad, np.sin(ang) * rad], 1)
    retardo = rng.uniform(0, 0.45, n)
    for i in range(n):
        t = suave((avance - retardo[i]) / (1 - 0.45)) if avance > retardo[i] else 0.0
        x, y = ini[i] + (destinos[i] - ini[i]) * t
        r = 2.4 + 1.6 * (1 - t)
        op = int(90 + 165 * t)
        d.ellipse([x - r, y - r, x + r, y + r], fill=ORO + (op,))


def lienzo():
    return Image.new("RGBA", (W, H), NEGRO + (255,))


def pegar_centrado(base, im, ancho, dy=0, opacidad=1.0):
    ancho = max(2, int(ancho))
    alto = max(2, int(im.height * ancho / im.width))
    im = im.resize((ancho, alto), Image.LANCZOS)
    if opacidad < 1:
        al = im.split()[3].point(lambda v: int(v * opacidad))
        im.putalpha(al)
    base.alpha_composite(im, ((W - ancho) // 2, (H - alto) // 2 + dy))


def bloque_nace(t, dur, destinos, logo_im):
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    a = t / dur
    if a < 0.80:
        enjambre(d, destinos, a / 0.80)
    else:
        # Al final se cambia el enjambre por el PNG: los puntos dan el gesto,
        # el archivo da el filo. Ninguno de los dos solo consigue las dos cosas.
        enjambre(d, destinos, 1.0)
        pegar_centrado(im, logo_im, 680, opacidad=suave((a - 0.80) / 0.20))
    return im


def bloque_rotulos(t, rotulos, t0):
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    for r in rotulos:
        rel = t + t0 - r["t"]
        if 0 <= rel <= r["dur"]:
            op = suave(min(rel, 0.35) / 0.35) * suave(min(r["dur"] - rel, 0.35) / 0.35)
            f = fuente(F_TIT, 76)
            a = d.textbbox((0, 0), r["texto"], font=f)
            d.text(((W - (a[2] - a[0])) / 2 - a[0], H / 2 - 50),
                   r["texto"], font=f, fill=TEXTO + (int(255 * op),))
    return im


def bloque_icono(t, dur, icono, nombre):
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    a = suave(min(t / 0.9, 1.0))
    pegar_centrado(im, icono, int(560 + 180 * a), dy=-90, opacidad=a)
    if t > 1.4:
        op = int(255 * suave(min((t - 1.4) / 0.5, 1.0)))
        centrar(d, nombre, fuente(F_DAT, 34), H / 2 + 150, APAGADO + (op,))
    return im


ICONOS = {}


def _cargar_iconos():
    """Los iconos reales del paquete. Se cargan una vez y se reusan."""
    if ICONOS:
        return
    for nombre, ruta in (("Genesis ID", "genesis-id/genesis-id-icono.png"),
                         ("MyTokenPay", "mytokenpay/mytokenpay-icono.png"),
                         ("Chat", "pulse2chat/pulse2chat-logo.png"),
                         # Estos dos llegaron despues, en JPG con fondo solido;
                         # se les quito por luminancia y se guardaron en PNG.
                         ("Ordenexchange", "ordenex/ordenex-logo.png"),
                         ("AuCorp", "aucorp/aucorp-logo.png")):
        f = LOGOS / ruta
        if f.exists():
            ICONOS[nombre] = Image.open(f).convert("RGBA")


def bloque_sistema_solar(t, dur, icono, orbitas):
    """El sistema solar REAL de la app: Veta en el centro y el resto orbitando.

    La primera version ponia un icono suelto, y antes de eso un dock de seis que
    ademas contradecia el rotulo. Las dos eran interfaces inventadas peores que
    la suya: la app de verdad coloca Veta Wallet en un halo dorado con Chat,
    MyTokenPay, Genesis ID, Ordenexchange y AuCorp girando alrededor, unidos por
    lineas finas. Y el gesto orbital rima con el logo, que tambien son anillos."""
    _cargar_iconos()
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    cx, cy = W / 2, H / 2 - 60
    a = suave(min(t / 1.1, 1.0))

    # Primero las lineas: son lo que dice que el centro sostiene al resto.
    for k, o in enumerate(orbitas):
        ap = suave(min(max((t - 0.55 - escalonar(k, 3.0)) / 0.55, 0), 1))
        if ap <= 0:
            continue
        rad = np.radians(o["ang"])
        x = cx + np.cos(rad) * o["r"] * a
        y = cy + np.sin(rad) * o["r"] * a
        d.line([cx, cy, cx + (x - cx) * ap, cy + (y - cy) * ap],
               fill=(120, 104, 62, int(150 * ap)), width=2)

    # El halo de Veta. Apilar elipses no sirve: por poco alfa que lleve cada
    # una, se suman y sale un disco amarillo macizo. Un degradado de verdad se
    # calcula por pixel, con la opacidad cayendo con el radio.
    if a > 0.02:
        R = int(330 * a)
        yy, xx = np.mgrid[-R:R + 1, -R:R + 1]
        dist = np.sqrt(xx ** 2 + yy ** 2) / R
        alfa = np.clip(1.0 - dist, 0, 1) ** 2.2 * 150 * a
        halo = np.zeros((2 * R + 1, 2 * R + 1, 4), np.uint8)
        halo[..., 0], halo[..., 1], halo[..., 2] = ORO
        halo[..., 3] = alfa.astype(np.uint8)
        im.alpha_composite(Image.fromarray(halo, "RGBA"),
                           (int(cx) - R, int(cy) - R))
        pegar_centrado(im, icono, max(8, int(440 * a)), dy=-60, opacidad=a)
    # El nombre bien lejos del halo, que encima quedaba blanco sobre oro.
    centrar(d, "Veta Wallet", fuente(F_DAT, 32), cy + 372, TEXTO + (int(235 * a),))

    # Y los mundos que orbitan, cada uno entrando con su retardo.
    for k, o in enumerate(orbitas):
        # Con sobrepaso: el circulo se pasa un 5 % y vuelve, como algo que
        # tiene masa y un buen amortiguador.
        ap = salida_rebote(min(max((t - 0.55 - escalonar(k, 3.0)) / 0.55, 0), 1))
        if ap <= 0:
            continue
        rad = np.radians(o["ang"])
        x = cx + np.cos(rad) * o["r"] * a
        y = cy + np.sin(rad) * o["r"] * a
        rr = 62 * ap
        d.ellipse([x - rr, y - rr, x + rr, y + rr],
                  fill=(26, 34, 33, int(235 * ap)),
                  outline=(150, 132, 80, int(180 * ap)), width=2)
        # El icono real dentro del circulo. Ordenexchange y AuCorp no tienen
        # archivo en el paquete y se quedan solo con su marca.
        # Sombra muy difusa y al 30 %: despega el elemento sin ensuciar.
        if ap > 0.3:
            disco = Image.new("RGBA", (int(rr * 2) + 4, int(rr * 2) + 4), (0, 0, 0, 0))
            ImageDraw.Draw(disco).ellipse([2, 2, rr * 2, rr * 2], fill=(0, 0, 0, 255))
            sombra_larga(im, disco, (int(x - rr), int(y - rr)),
                         radio=int(rr * 1.1), opacidad=0.30, dy=int(rr * 0.42))
        arch = ICONOS.get(o["nombre"])
        if arch is not None and ap > 0.05:
            ic = arch.copy()
            lado = max(6, int(rr * 1.45))
            ic.thumbnail((lado, lado), Image.LANCZOS)
            if ap < 1:
                ic.putalpha(ic.split()[3].point(lambda v: int(v * ap)))
            im.alpha_composite(ic, (int(x - ic.width / 2), int(y - ic.height / 2)))
        f = fuente(F_DAT, 22)
        an = d.textbbox((0, 0), o["nombre"], font=f)
        ancho_t = an[2] - an[0]
        # Sin esto "Chat" y "Ordenexchange" se salian por los bordes.
        tx = min(max(x - ancho_t / 2 - an[0], 10), W - ancho_t - 10)
        d.text((tx, y + rr + 14), o["nombre"], font=f,
               fill=APAGADO + (int(230 * ap),))
    return im


def bloque_funciones(t, t0, items, paso=2.7):
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    for it in items:
        rel = t + t0 - it["t"]
        if not (0 <= rel <= paso):
            continue
        op = suave(min(rel, 0.3) / 0.3) * suave(min(paso - rel, 0.45) / 0.45)
        # El verbo grande y la marca pequeña debajo: el espectador de la prueba
        # se perdía entre nombres que todavía no significan nada para él.
        f = fuente(F_TIT, 66)
        y = H / 2 - 90
        for ln in envolver(d, it["verbo"], f, W - 190):
            a = d.textbbox((0, 0), ln, font=f)
            d.text(((W - (a[2] - a[0])) / 2 - a[0], y), ln,
                   font=f, fill=TEXTO + (int(255 * op),))
            y += (a[3] - a[1]) + 22
        if it.get("marca"):
            _cargar_iconos()
            ic = ICONOS.get(it["marca"])
            yl = y + 34
            if ic is not None:
                # El icono de la marca junto a su nombre: estaban sin usar.
                g = ic.copy(); g.thumbnail((92, 92), Image.LANCZOS)
                if op < 1:
                    g.putalpha(g.split()[3].point(lambda v: int(v * op)))
                im.alpha_composite(g, (int(W / 2 - g.width / 2), int(yl + 6)))
                yl += g.height + 14
            centrar(d, it["marca"], fuente(F_DAT, 30), yl,
                    ORO + (int(210 * op),))
        # Una barra de puntos que avanza con el compás: mide el paso sin reloj.
        n = 26
        for k in range(n):
            x = W / 2 - (n * 15) / 2 + k * 15
            viva = k / n <= rel / paso
            d.ellipse([x - 3, H - 230 - 3, x + 3, H - 230 + 3],
                      fill=(ORO if viva else (60, 55, 44)) + (int(255 * op),))
    return im


def envolver(d, texto, f, ancho):
    palabras, lineas, act = texto.split(), [], ""
    for p in palabras:
        pr = (act + " " + p).strip()
        if d.textlength(pr, font=f) <= ancho:
            act = pr
        else:
            lineas.append(act); act = p
    if act:
        lineas.append(act)
    return lineas


def marca_origen(d, cx, cy, r, op):
    """La marca de ORIGEN: un anillo con una barra vertical que lo atraviesa.

    Va dibujada y no pegada porque el archivo del paquete mide 93 px y en
    pantalla se rompe. Siendo geometria pura, sale identica a cualquier tamano."""
    g = max(3, int(r * 0.17))
    d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=ORO + (op,), width=g)
    d.rectangle([cx - g*0.55, cy - r*1.34, cx + g*0.55, cy + r*1.34],
                fill=ORO + (op,))


from pepita import pepita as _pepita_render

_CACHE_PEPITA = {}


def pepita(im, cx, cy, r, op, semilla=21):
    """Pega la pepita renderizada. Ya no se dibuja: se ilumina.

    La versión anterior era un polígono amarillo con manchas claras y parecía
    masa. Un metal casi no tiene componente difusa —es casi todo reflejo, y su
    color sale del tinte de ese reflejo—, así que sombrearlo como plástico da
    plastilina por bien que se elija el amarillo. pepita.py construye un relieve
    fractal, saca sus normales y le calcula reflejo de entorno, dos especulares
    y oclusión. Se cachea porque generar 460x460 en cada fotograma sería absurdo.
    """
    lado = max(8, int(r * 2))
    if lado not in _CACHE_PEPITA:
        _CACHE_PEPITA[lado] = _pepita_render(lado, semilla)
    src = _CACHE_PEPITA[lado]
    if op < 255:
        src = src.copy()
        src.putalpha(src.split()[3].point(lambda v: int(v * op / 255)))
    im.alpha_composite(src, (int(cx - lado / 2), int(cy - lado / 2)))


def bloque_origen(t, dur, rotulos, t0):
    """La pepita no se convierte en la moneda: se DIVIDE en 55.

    Un ORIGEN es un gramo de oro entre 55, asi que esto es la formula publica
    animada. La diferencia importa: una pepita que se transforma en la moneda
    afirma que la moneda es oro, y eso el acta de Junta no lo permite. Una
    pepita que se parte en 55 ensena la medida, que es lo que si es cierto."""
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    cy = H / 2 - 120
    if t < 1.5:                              # la pepita, sola
        pepita(im, W/2, cy, 470, 255)
    elif t < 3.4:                            # se reparte en 55
        a = suave((t - 1.5) / 1.9)
        pepita(im, W/2, cy, int(470 - 180 * a), int(255 * (1 - a)))
        cols, fil = 11, 5                    # 11 x 5 = 55, y se pueden contar
        paso, r = 94, 30
        x0 = W/2 - (cols-1)*paso/2
        y0 = cy - (fil-1)*paso/2
        for k in range(55):
            dx, dy = x0 + (k % cols)*paso, y0 + (k // cols)*paso
            px = W/2 + (dx - W/2) * a
            py = cy + (dy - cy) * a
            marca_origen(d, px, py, r * (0.35 + 0.65*a), int(235 * a))
    else:                                    # una crece y se queda
        a = suave((t - 3.4) / 1.0)
        cols, fil, paso, r = 11, 5, 94, 30
        x0, y0 = W/2 - (cols-1)*paso/2, cy - (fil-1)*paso/2
        for k in range(55):
            if k == 27:
                continue
            dx, dy = x0 + (k % cols)*paso, y0 + (k // cols)*paso
            marca_origen(d, dx, dy, r, int(235 * (1 - a)))
        marca_origen(d, W/2, cy, 22 + 96*a, int(235 + 20*a))
    for r_ in rotulos:
        rel = t + t0 - r_["t"]
        if 0 <= rel <= r_["dur"]:
            op = int(255 * suave(min(rel, .3)/.3) * suave(min(r_["dur"]-rel, .35)/.35))
            centrar(d, r_["texto"], fuente(F_TIT, 58), H/2 + 330, TEXTO + (op,))
    return im


def bloque_oro_apertura(t, dur, rotulos, t0):
    """El oro abriendo la película, con una luz cruzándolo.

    Es la corrección de fondo: la versión anterior abría con puntos dorados y un
    espectador frío lo llamó "el recurso más viejo del manual para que algo
    parezca elegante sin tener que filmar nada real". Si el oro es lo que
    distingue a la marca, tiene que ser lo PRIMERO, no un bloque del minuto 30.

    La pepita se renderiza una vez y encima pasa una banda de luz: volver a
    calcular el relieve en cada fotograma costaría minutos por segundo de vídeo,
    y el barrido de un reflejo sobre metal se lee igual de bien como una banda
    que cruza."""
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    lado = 940
    a = suave(min(t / 1.6, 1.0))
    if a > 0.02:
        if lado not in _CACHE_PEPITA:
            _CACHE_PEPITA[lado] = _pepita_render(lado, 21)
        src = _CACHE_PEPITA[lado].copy()

        # La banda de luz: una franja diagonal que recorre la pieza de izquierda
        # a derecha y solo suma donde ya hay metal.
        avance = (t / dur) * 2.2 - 0.4
        yy, xx = np.mgrid[0:lado, 0:lado]
        eje = (xx / lado) * 0.75 + (yy / lado) * 0.25
        banda = np.exp(-((eje - avance) ** 2) / 0.010) * 165
        arr = np.array(src).astype(np.int16)
        vivo = arr[..., 3] > 8
        for c in range(3):
            arr[..., c] = np.where(vivo,
                                   np.clip(arr[..., c] + banda * (1.0 - c * 0.14),
                                           0, 255),
                                   arr[..., c])
        src = Image.fromarray(arr.astype(np.uint8), "RGBA")
        if a < 1:
            src.putalpha(src.split()[3].point(lambda v: int(v * a)))
        im.alpha_composite(src, ((W - lado) // 2, (H - lado) // 2 - 120))

    for r in rotulos:
        rel = t + t0 - r["t"]
        if 0 <= rel <= r["dur"]:
            op = int(255 * suave(min(rel, .45)/.45) * suave(min(r["dur"]-rel, .45)/.45))
            centrar(d, r["texto"], fuente(F_TIT, 62), H / 2 + 500, TEXTO + (op,))
    return im


def bloque_recibo(t, dur, recibo, rotulos, t0):
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    for r in rotulos:
        rel = t + t0 - r["t"]
        if 0 <= rel <= r["dur"]:
            op = int(255 * suave(min(rel, .3)/.3) * suave(min(r["dur"]-rel, .3)/.3))
            grande = r["tipo"] == "titular"
            centrar(d, r["texto"], fuente(F_TIT if grande else F_DAT,
                    62 if grande else 34),
                    260 if grande else H - 330,
                    (TEXTO if grande else ORO) + (op,))
    # El recibo entra a partir de 1,2 s. Es legible a propósito: el hash largo
    # que había antes se leyó como "qué pereza andar copiando ese chorro".
    if t > 1.2:
        op = suave(min((t - 1.2) / 0.7, 1.0))
        x0, x1 = 150, W - 150
        y0 = 640
        alto = 150 + 92 * len(recibo["campos"])
        d.rounded_rectangle([x0, y0, x1, y0 + alto], 14,
                            fill=(24, 22, 18, int(255 * op)),
                            outline=ORO + (int(160 * op),), width=2)
        d.text((x0 + 46, y0 + 42), recibo["titulo"], font=fuente(F_ROT, 38),
               fill=TEXTO + (int(255 * op),))
        y = y0 + 118
        for k, (campo, valor) in enumerate(recibo["campos"]):
            vis = suave(min(max((t - 1.6 - k * 0.28) / 0.4, 0), 1))
            o2 = int(255 * op * vis)
            d.text((x0 + 46, y), campo, font=fuente(F_DAT, 30),
                   fill=APAGADO + (o2,))
            f = fuente(F_DAT, 34)
            d.text((x1 - 46 - d.textlength(valor, font=f), y - 2), valor,
                   font=f, fill=TEXTO + (o2,))
            y += 92
        if t > dur - 2.2:
            o3 = int(255 * suave(min((t - (dur - 2.2)) / 0.6, 1.0)))
            f = fuente(F_ROT, 34)
            for i, ln in enumerate(envolver(d, recibo["pie"], f, W - 300)):
                a = d.textbbox((0, 0), ln, font=f)
                d.text(((W - (a[2]-a[0]))/2 - a[0], y0 + alto + 60 + i*52), ln,
                       font=f, fill=ORO + (o3,))
    return im


def bloque_cierre(t, dur, destinos, logo_im, rotulos, t0):
    im = lienzo(); d = ImageDraw.Draw(im, "RGBA")
    a = t / dur
    if a < 0.55:
        enjambre(d, destinos, suave(a / 0.55))
    else:
        enjambre(d, destinos, 1.0)
        pegar_centrado(im, logo_im, 680, opacidad=suave((a - 0.55) / 0.25))
    for r in rotulos:
        rel = t + t0 - r["t"]
        if 0 <= rel <= r["dur"]:
            op = int(230 * suave(min(rel, .5)/.5))
            f = fuente(F_ROT, 34)
            y = H / 2 + 340
            for ln in envolver(d, r["texto"], f, W - 200):
                aa = d.textbbox((0, 0), ln, font=f)
                d.text(((W - (aa[2]-aa[0]))/2 - aa[0], y), ln,
                       font=f, fill=APAGADO + (op,))
                y += 50
    return im


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    salida = sys.argv[2] if len(sys.argv) > 2 else "pelicula2.mp4"
    dur_total = spec["salida"]["dur_s"]

    destinos, logo_im = puntos_del_logo(
        LOGOS / "orden-global" / "orden-global-logo.png")
    icono = Image.open(LOGOS / "veta-wallet" / "veta-wallet-icono.png").convert("RGBA")

    bloques = {b["id"]: b for b in spec["bloques"]}
    n = int(dur_total * FPS)

    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
         "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "17",
         "-preset", "medium", salida], stdin=subprocess.PIPE)

    for fr in range(n):
        t = fr / FPS
        b = next((x for x in spec["bloques"]
                  if x["t"] <= t < x["t"] + x["dur"]), None)
        if b is None:
            im = lienzo()
        else:
            tl = t - b["t"]
            e = b["escena"]
            if e == "puntos_a_logo":
                im = bloque_nace(tl, b["dur"], destinos, logo_im)
            elif e == "rotulos":
                im = bloque_rotulos(tl, b["rotulos"], b["t"])
            elif e == "icono_unico":
                im = bloque_icono(tl, b["dur"], icono,
                                  b["rotulos"][0]["texto"])
            elif e == "sistema_solar":
                im = bloque_sistema_solar(tl, b["dur"], icono, b["orbitas"])
            elif e == "funciones_dentro":
                im = bloque_funciones(tl, b["t"], b["items"],
                                      paso=(b["items"][1]["t"] - b["items"][0]["t"])
                                      if len(b["items"]) > 1 else b["dur"])
            elif e == "oro_apertura":
                im = bloque_oro_apertura(tl, b["dur"], b["rotulos"], b["t"])
            elif e == "origen":
                im = bloque_origen(tl, b["dur"], b["rotulos"], b["t"])
            elif e == "recibo":
                im = bloque_recibo(tl, b["dur"], b["recibo"],
                                   b["rotulos"], b["t"])
            else:
                im = bloque_cierre(tl, b["dur"], destinos, logo_im,
                                   b["rotulos"], b["t"])
        # Aberración cromática, viñeta y 2 % de grano. "El diseño digital
        # limpio se ve barato": esto es lo que rompe la perfección de render y
        # de paso mata el bandeado de los degradados del halo.
        ff.stdin.write(acabar(im, semilla=fr).tobytes())
        if fr % 150 == 0:
            print(f"  {t:5.1f}s / {dur_total:.0f}s", flush=True)

    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg falló")
    print(f"listo: {salida}  ·  {dur_total:.0f}s  ·  {n} fotogramas")


if __name__ == "__main__":
    main()
