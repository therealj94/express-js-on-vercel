"""Motion graphics de Honduras Secreta con la identidad del logo.

- Títulos de lugar en Monoton (letras de líneas paralelas, como «HONDURAS» del logo) con el degradado
  arcoíris del logo; entran letra a letra y salen con fundido.
- Subtítulo y coordenadas (máquina de escribir) con una línea dorada que crece.
- Mapa de Honduras (contorno real, Natural Earth) con la ruta del viaje dibujándose de punto en punto.
- Cifras que cuentan (43 m, +2.000 glifos…) y subtítulos con la palabra que suena en dorado.
- Logo final: la guara entra volando, «HONDURAS» se dibuja de izquierda a derecha y luego «Secreta».
Todas las funciones devuelven capas RGBA (numpy) del tamaño del cuadro para componer encima del vídeo.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
ARCOIRIS = [(76, 175, 80), (33, 150, 243), (103, 58, 183), (156, 39, 176), (233, 30, 99), (244, 67, 54),
            (255, 152, 0), (255, 214, 0)]
CREMA, DORADO = (255, 241, 214), (255, 201, 74)


def suave(p):
    p = min(1.0, max(0.0, p)); return p * p * (3 - 2 * p)


def sale(p):  # ease-out fuerte
    p = min(1.0, max(0.0, p)); return 1 - (1 - p) ** 3


def degradado(w, h):
    xs = np.linspace(0, len(ARCOIRIS) - 1, w)
    i0 = np.floor(xs).astype(int).clip(0, len(ARCOIRIS) - 2); f = (xs - i0)[:, None]
    c = np.array(ARCOIRIS, np.float32)
    fila = c[i0] * (1 - f) + c[i0 + 1] * f
    return np.repeat(fila[None], h, 0).astype(np.uint8)


class MG:
    def __init__(self, fuentes, contorno_json):
        F = Path(fuentes)
        self.f = {
            "titulo": ImageFont.truetype(str(F / "Monoton.ttf"), 112),
            "cifra": ImageFont.truetype(str(F / "Monoton.ttf"), 200),
            "sub": ImageFont.truetype(str(F / "Montserrat.ttf"), 40),
            "cap": ImageFont.truetype(str(F / "Montserrat.ttf"), 44),
            "subs": ImageFont.truetype(str(F / "Montserrat.ttf"), 54),
            "mono": ImageFont.truetype(str(F / "JetBrainsMono.ttf"), 30),
        }
        for k, peso in (("sub", "SemiBold"), ("cap", "Bold"), ("subs", "SemiBold")):
            self.f[k].set_variation_by_name(peso)
        self.contorno = json.load(open(contorno_json))
        self._cache = {}

    # ---------- títulos de lugar ----------
    def _letras(self, texto):
        if texto in self._cache: return self._cache[texto]
        f = self.f["titulo"]; d = ImageDraw.Draw(Image.new("L", (10, 10)))
        tam = f.size
        while d.textlength(texto, font=f) > W - 140:  # que quepa con margen
            tam -= 6; f = ImageFont.truetype(f.path, tam)
        ancho = int(sum(d.textlength(c, font=f) if c.strip() else tam * .45 for c in texto)) + 8; alto = tam + 30
        grad = degradado(ancho + 4, alto)
        letras, x = [], 0
        for ch in texto:
            w = int(d.textlength(ch, font=f)) if ch.strip() else int(tam * .45)  # Monoton tiene el espacio casi nulo
            if ch.strip():
                m = Image.new("L", (ancho + 4, alto)); ImageDraw.Draw(m).text((x, 0), ch, font=f, fill=255)
                ma = np.array(m)
                sombra = np.array(m.filter(ImageFilter.GaussianBlur(7)))  # halo oscuro para leer sobre cielo o arena
                al = np.maximum(ma, (sombra * .55).astype(np.uint8))
                col = (grad.astype(np.float32) * (ma[..., None] / np.maximum(al[..., None], 1))).astype(np.uint8)
                rgba = np.dstack([col, al])
                letras.append((x, w, rgba))
            x += w
        self._cache[texto] = (letras, ancho, alto)
        return self._cache[texto]

    def rotulo(self, tl, dur, titulo, sub, coord, idx_mapa=None, x0=70, y0=230):
        """Capa del rótulo de lugar en el instante local tl (0 = entra) de un rótulo que dura dur."""
        capa = np.zeros((H, W, 4), np.uint8)
        salida = 1 - suave((tl - (dur - .3)) / .3)
        if tl < 0 or salida <= 0: return capa
        letras, ancho, alto = self._letras(titulo)
        for k, (x, w, rgba) in enumerate(letras):
            p = sale((tl - .05 * k) / .35)
            if p <= 0: continue
            dy = int((1 - p) * 40)
            lo = rgba.copy(); lo[..., 3] = (lo[..., 3] * p * salida).astype(np.uint8)
            ys, ye = y0 + dy, y0 + dy + alto
            self._pega(capa, lo[:, x:x + w + 4], x0 + x, ys)
        # línea dorada que crece y textos pequeños
        img = Image.new("RGBA", (W, 260), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        lw = int(260 * sale((tl - .25) / .5))
        if lw > 0: d.line([(x0, 12), (x0 + lw, 12)], fill=DORADO + (int(255 * salida),), width=3)
        a_sub = int(255 * suave((tl - .35) / .35) * salida)
        if sub and a_sub: d.text((x0, 28), sub, font=self.f["sub"], fill=CREMA + (a_sub,))
        if coord:
            n = int(len(coord) * min(1, max(0, (tl - .6) / .6)))
            if n: d.text((x0, 86), coord[:n] + ("▌" if n < len(coord) and int(tl * 8) % 2 else ""),
                         font=self.f["mono"], fill=DORADO + (int(255 * salida),))
        sombra = img.filter(ImageFilter.GaussianBlur(5)); s = np.array(sombra); s[..., :3] = 0
        s[..., 3] = (s[..., 3] * .7).astype(np.uint8)
        self._pega(capa, s, 3, y0 + alto + 3); self._pega(capa, np.array(img), 0, y0 + alto)
        if idx_mapa is not None:
            self._pega(capa, self.mapa(tl, idx_mapa, salida), x0 - 10, y0 + alto + 140)
        return capa

    # ---------- mapa ----------
    LUGARES = [(-86.60, 16.27), (-86.93, 16.10), (-86.75, 15.72), (-88.00, 15.01), (-89.14, 14.84),
               (-87.43, 15.78), (-88.58, 14.46), (-87.98, 14.87), (-88.03, 14.15), (-85.04, 15.67)]

    def _xy(self, lon, lat, w, h, pad=10):
        x = pad + (lon + 89.40) / (89.40 - 83.10) * (w - 2 * pad)
        y = pad + (17.45 - lat) / (17.45 - 12.95) * (h - 2 * pad)
        return x, y

    def mapa(self, tl, idx, alfa=1.0, w=400, h=286):
        S = 2  # supermuestreo para líneas finas limpias
        img = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        a = int(255 * suave(tl / .4) * alfa)
        for poly in self.contorno:
            pts = [tuple(c * S for c in self._xy(lo, la, w, h)) for lo, la in poly]
            d.polygon(pts, fill=(255, 255, 255, int(a * .10)), outline=CREMA + (int(a * .85),), width=S + 1)
        pts = [tuple(c * S for c in self._xy(lo, la, w, h)) for lo, la in self.LUGARES[:idx + 1]]
        for p in pts[:-1]:
            d.ellipse([p[0] - 4 * S, p[1] - 4 * S, p[0] + 4 * S, p[1] + 4 * S], fill=CREMA + (int(a * .8),))
        if len(pts) > 1:  # la ruta ya hecha, y el último tramo dibujándose
            for p, q in zip(pts[:-2], pts[1:-1]):
                d.line([p, q], fill=DORADO + (int(a * .7),), width=2 * S)
            p, q = pts[-2], pts[-1]; e = sale((tl - .2) / .6)
            d.line([p, (p[0] + (q[0] - p[0]) * e, p[1] + (q[1] - p[1]) * e)], fill=DORADO + (a,), width=3 * S)
        p = pts[-1]; pul = (tl * 1.4) % 1
        r = (6 + 14 * pul) * S
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], outline=DORADO + (int(a * (1 - pul)),), width=2 * S)
        d.ellipse([p[0] - 6 * S, p[1] - 6 * S, p[0] + 6 * S, p[1] + 6 * S], fill=DORADO + (a,))
        return np.array(img.resize((w, h), Image.LANCZOS))

    # ---------- cifras ----------
    def cifra(self, tl, dur, valor, prefijo, sufijo, texto, y0=1080):
        capa = np.zeros((H, W, 4), np.uint8)
        al = suave(tl / .25) * (1 - suave((tl - (dur - .35)) / .35))
        if al <= 0: return capa
        ordinal = sufijo in (".º", ".ª")  # Monoton no tiene º/ª: el número va en Monoton y el ordinal en Montserrat
        n = valor if valor < 10 else valor * sale(tl / 1.0)  # solo cuentan las cifras grandes
        num = f"{prefijo}{int(round(n)):,}{'.' if ordinal else sufijo}".replace(",", ".")
        img = Image.new("RGBA", (W, 330), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        f = self.f["cifra"]; wn = d.textlength(num, font=f)
        fo = ImageFont.truetype(self.f["cap"].path, 110) if ordinal else None
        if fo: fo.set_variation_by_name("Black"); wn += d.textlength(sufijo[1:], font=fo) + 10
        esc = .85 + .15 * sale(tl / .35)  # pequeño «pop» de entrada
        m = Image.new("L", (W, 330)); dm = ImageDraw.Draw(m); x0 = (W - wn) / 2
        dm.text((x0, 0), num, font=f, fill=255)
        if fo: dm.text((x0 + d.textlength(num, font=f) + 10, 20), sufijo[1:], font=fo, fill=255)
        if esc < 1:
            mm = m.resize((int(W * esc), int(330 * esc))); m = Image.new("L", (W, 330))
            m.paste(mm, ((W - mm.width) // 2, (330 - mm.height) // 2))
        grad = np.zeros((330, W, 3), np.uint8); gx = max(0, int(x0) - 10); gw = min(W - gx, int(wn) + 20)
        grad[:, gx:gx + gw] = degradado(gw, 330)  # el arcoíris del logo abarca solo la cifra
        rgba = np.dstack([grad, (np.array(m) * al).astype(np.uint8)])
        wt = d.textlength(texto, font=self.f["cap"])
        d.text(((W - wt) / 2 + 2, 252), texto, font=self.f["cap"], fill=(0, 0, 0, int(160 * al)))
        d.text(((W - wt) / 2, 250), texto, font=self.f["cap"], fill=CREMA + (int(255 * al),))
        self._pega(capa, np.array(img), 0, y0); self._pega(capa, rgba, 0, y0)
        return capa

    # ---------- subtítulos ----------
    def subtitulo(self, t, palabras, y0=1400):
        """palabras: [(inicio, fin, texto)] de un bloque; resalta en dorado la que está sonando."""
        capa = np.zeros((H, W, 4), np.uint8)
        f = self.f["subs"]; img = Image.new("RGBA", (W, 220), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
        lineas, cur, ancho = [], [], 0
        for p in palabras:
            wp = d.textlength(p[2] + " ", font=f)
            if ancho + wp > 900 and cur: lineas.append(cur); cur, ancho = [], 0
            cur.append(p); ancho += wp
        lineas.append(cur)
        sombra = Image.new("RGBA", img.size, (0, 0, 0, 0)); ds = ImageDraw.Draw(sombra)
        for k, li in enumerate(lineas):
            tx = " ".join(p[2] for p in li); x = (W - d.textlength(tx, font=f)) / 2; y = 10 + k * 70
            ds.text((x, y + 3), tx, font=f, fill=(0, 0, 0, 210))
            for p in li:
                col = DORADO if p[0] <= t < p[1] + .08 else (255, 255, 255)
                d.text((x, y), p[2], font=f, fill=col + (255,)); x += d.textlength(p[2] + " ", font=f)
        sombra = sombra.filter(ImageFilter.GaussianBlur(6))
        self._pega(capa, np.array(Image.alpha_composite(sombra, img)), 0, y0)
        return capa

    # ---------- logo final ----------
    def logo(self, tl, logo_rgb):
        """logo_rgb: imagen del logo sobre negro (1284×500). Devuelve el cuadro completo BGR."""
        fondo = np.zeros((H, W, 3), np.uint8); fondo[:] = (9, 8, 10)
        lh, lw = logo_rgb.shape[:2]; s = 1000 / lw
        L = np.array(Image.fromarray(logo_rgb).resize((int(lw * s), int(lh * s)), Image.LANCZOS))
        lh, lw = L.shape[:2]; ox, oy = (W - lw) // 2, (H - lh) // 2 - 80
        guara = L[: int(225 * s), int(880 * s):].copy(); texto = L[int(225 * s): int(385 * s)].copy()
        lema = L[int(385 * s):].copy()
        def sobre(img, x, y, a):
            h, w = img.shape[:2]; reg = fondo[y:y + h, x:x + w]
            fondo[y:y + h, x:x + w] = np.maximum(reg, (img * a).astype(np.uint8))
        # HONDURAS se dibuja de izquierda a derecha con borde suave
        e = sale((tl - .15) / .9)
        if e > 0:
            m = np.clip((np.arange(lw) - (lw + 80) * e + 80) / -80, 0, 1)[None, :, None]
            sobre(texto, ox, oy + int(225 * s), m)
        # la guara entra volando desde la derecha
        g = sale((tl - .55) / .7)
        if g > 0:
            gx = ox + int(880 * s) + int((1 - g) * 420); gy = oy - int((1 - g) * 160)
            gh, gw = guara.shape[:2]
            if gx + gw <= W and gy >= 0: sobre(guara, gx, gy, min(1, g * 1.5))
        # «Secreta · más de lo que imaginas!» aparece después
        e2 = sale((tl - 1.0) / .8)
        if e2 > 0:
            m = np.clip((np.arange(lw) - (lw + 80) * e2 + 80) / -80, 0, 1)[None, :, None]
            sobre(lema, ox, oy + int(385 * s), m)
        return fondo[..., ::-1]

    @staticmethod
    def _pega(capa, rgba, x, y):
        h, w = rgba.shape[:2]
        x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        if x1 <= x0 or y1 <= y0: return
        src = rgba[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
        dst = capa[y0:y1, x0:x1].astype(np.float32)
        a = src[..., 3:4] / 255; b = dst[..., 3:4] / 255
        out_a = a + b * (1 - a)
        rgb = (src[..., :3] * a + dst[..., :3] * b * (1 - a)) / np.maximum(out_a, 1e-6)
        capa[y0:y1, x0:x1] = np.dstack([rgb, out_a * 255]).astype(np.uint8)


def compone(fr_bgr, capa):
    """Mezcla una capa RGBA (orden RGB) sobre un cuadro BGR."""
    a = capa[..., 3:4].astype(np.float32) / 255
    if a.max() == 0: return fr_bgr
    col = capa[..., 2::-1].astype(np.float32)
    return (fr_bgr * (1 - a) + col * a).astype(np.uint8)
