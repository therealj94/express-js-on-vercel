"""Honduras Secreta 2: apertura histórica (hook, historia en luz, 2009 y conflicto del «pero»).

    python3 montaje/hs2_apertura.py --dir HN/ap --fuentes FUENTES --sal apertura.mp4 [--hasta SEG] [--desde SEG]

Material en --dir: V01…V09, V09D (Dubón), V10D.mp4 (MiniMax H3 Max, imagen de inicio/fin encadenadas S1…S10, así que los clips
se pegan sin corte), vo_*_b.mp3, hs2_copan_b.mp3, narr2010.m4a, musica_b.mp3 y sfx_*.mp3.
Todo el texto en pantalla (comentarios reales, fechas, «recreación artística») se dibuja aquí, no con IA.
"""
import argparse, math, subprocess
from collections import OrderedDict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
PUNTO = (540, 883)  # el punto de luz de luz_inicio.png (576, 942 sobre 1152x2048)

# (clip, velocidad). Cada clip termina en la imagen con la que empieza el siguiente.
HOOK = 7.8
CLIPS = [("V01", 1.5), ("V02", 1.5), ("V03", 1.4), ("V04", 1.4), ("V05", 1.4), ("V06", 1.4),
         ("V07", 1.1), ("V08", 1.1), ("V09", 0.9), ("V09D", 1.0), ("V10D", 1.0)]
ULTIMO = CLIPS[-1][0]  # su último cuadro es el fondo del conflicto
CONFLICTO = 10.6
RECORTE = {"V01": (0.30, 0), "V04": (0, 0.5), "V09": (0, 0.3)}  # quietos de MiniMax al inicio/fin

# Comentarios reales tal como llegaron (sin nombres). corte = palabra donde se parte el comentario.
COMENTARIOS = [
    ("Honduras es hermoso. Lástima la delincuencia.", "Lástima"),
    ("ROATAN ES DEMADIADO PELIGROSO", None),
    ("Nuestro país es lindo, lastimosamente es más barato salir del país que hacer turismo interno", "lastimosamente"),
    ("Es que hay muchas cosas bonitas, pero mucha inseguridad", "pero"),
    ("nuestro país es precioso .. lo malo son los exagerados de los precios .. sale mas barato ir a otros paises muchas veces", "lo malo"),
    ("De que sirve si es muy peligroso", None),
]
# posición (centro x, y), giro y momento de entrada de cada tarjeta en el conflicto
CAIDA = [(540, 470, -2.0, 0.0), (565, 700, 2.5, 0.35), (515, 930, -3.0, 0.7),
         (560, 1170, 2.0, 1.05), (525, 1440, 1.5, 1.4), (550, 1720, -1.5, 1.75)]


def tiempos():
    t, out = HOOK, []
    for n, v in CLIPS:
        out.append((n, t, v)); t += dur_clip(n) / v
    return out, t


_DUR = {}
def dur_clip(n):
    if n not in _DUR:
        c = cv2.VideoCapture(str(DIR / f"{n}.mp4")); d = c.get(7) / (c.get(5) or 24)
        a, b = RECORTE.get(n, (0, 0)); _DUR[n] = d - a - b
    return _DUR[n]


class Clip:
    def __init__(self, ruta):
        self.cap = cv2.VideoCapture(str(ruta)); self.fps = self.cap.get(5) or 24
        self.n = int(self.cap.get(7)); self.idx = -1; self.mem = OrderedDict()

    def _lee(self, k):
        k = max(0, min(self.n - 1, k))
        if k in self.mem: return self.mem[k]
        if k <= self.idx or k > self.idx + 30:
            self.cap.set(1, k); self.idx = k - 1
        while self.idx < k:
            ok, f = self.cap.read()
            if not ok: break
            self.idx += 1; self.mem[self.idx] = f
            if len(self.mem) > 6: self.mem.popitem(last=False)
        return self.mem.get(k, next(reversed(self.mem.values())))

    def cuadro(self, ts):
        x = max(0.0, min(self.n - 1.0, ts * self.fps)); k = int(x); f = x - k
        a = self._lee(k)
        return a if f < .05 else cv2.addWeighted(a, 1 - f, self._lee(k + 1), f, 0)


def a_vertical(fr):
    h, w = fr.shape[:2]; s = H / h; nw = int(round(w * s))
    fr = cv2.resize(fr, (nw, H), interpolation=cv2.INTER_LANCZOS4)
    x = (nw - W) // 2
    return fr[:, x:x + W]


# Tramos donde MiniMax se fue a césped y jugadores fotorrealistas: se vuelven líneas de luz.
# (cuadro inicial, cuadro final, rampa en cuadros, color BGR de la línea)
A_LINEAS = {"V05": (80, 138, 12, (150, 215, 255)), "V08": (58, 110, 10, (150, 215, 255)), "V09": (28, 100, 10, (255, 200, 140)),
            "V09D": (36, 122, 10, (255, 200, 140)), "V10D": (46, 100, 10, (255, 200, 140))}


def lineas(f, col):
    """Convierte un cuadro en dibujo de luz: bordes con brillo y lo que ya brillaba se queda."""
    L = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32); b = cv2.GaussianBlur(L, (0, 0), 1.6)
    m = np.hypot(cv2.Sobel(b, cv2.CV_32F, 1, 0), cv2.Sobel(b, cv2.CV_32F, 0, 1))
    m = np.clip((m - 18) / 60, 0, 1) ** 1.3; hi = np.clip((L - 170) / 70, 0, 1)
    li = np.maximum(m * .85, hi); glow = cv2.GaussianBlur(li, (0, 0), 5) * .6
    out = f.astype(np.float32) * (.12 * (1 - hi) + .7 * hi)[..., None] + (li + glow)[..., None] * np.array(col, np.float32)
    return np.clip(out, 0, 255).astype(np.uint8)


def a_luz(n, fr, k):
    if n not in A_LINEAS: return fr
    a, b, r, col = A_LINEAS[n]; w = suave((k - a + r) / r) * (1 - suave((k - b) / r))
    return fr if w <= 0 else cv2.addWeighted(fr, 1 - w, lineas(fr, col), w, 0)


VIN = None
def acabado(fr, t):
    """Brillo suave (bloom), viñeta y grano fijo por cuadro: une todos los clips en un mismo look."""
    global VIN
    if VIN is None:
        yy, xx = np.mgrid[0:H, 0:W]; r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
        VIN = np.clip(1.08 - .32 * r ** 2, .55, 1)[..., None].astype(np.float32)
    f = fr.astype(np.float32)
    peq = cv2.resize(fr, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    b = cv2.resize(cv2.GaussianBlur(peq, (0, 0), 9), (W, H)).astype(np.float32)
    f = f + .35 * b
    rng = np.random.default_rng(int(t * FPS) + 7)
    g = rng.normal(0, 3.2, (H // 2, W // 2)).astype(np.float32)
    f = f * VIN + cv2.resize(g, (W, H))[..., None]
    return np.clip(f, 0, 255).astype(np.uint8)


# ---------- texto ----------
def fuente(nombre, tam, peso=None):
    f = ImageFont.truetype(str(FUENTES / f"{nombre}.ttf"), tam)
    if peso: f.set_variation_by_name(peso)
    return f


def envuelve(texto, f, ancho):
    lineas, cur = [], ""
    for p in texto.split(" "):
        prueba = (cur + " " + p).strip()
        if f.getlength(prueba) <= ancho or not cur: cur = prueba
        else: lineas.append(cur); cur = p
    lineas.append(cur)
    return lineas


def tarjeta(texto, corte, ancho=820, tam=44):
    """Tarjeta de comentario oscura y genérica. Avatar y nombre van borrados: no mostramos quién lo escribió.
    Devuelve capas RGBA del mismo tamaño: completa, marco (sin texto), texto antes del corte y texto desde el
    corte, más la caja de la palabra de corte."""
    f = fuente("Manrope", tam); pad = 44; lh = int(tam * 1.36)
    lineas = envuelve(texto, f, ancho - 2 * pad)
    alto = pad + 74 + len(lineas) * lh + pad - 8
    marco = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0)); d = ImageDraw.Draw(marco)
    d.rounded_rectangle((0, 0, ancho - 1, alto - 1), 34, fill=(22, 24, 30, 236), outline=(255, 255, 255, 30), width=2)
    av = Image.new("RGBA", (56, 56), (0, 0, 0, 0)); ImageDraw.Draw(av).ellipse((0, 0, 55, 55), fill=(120, 126, 140, 255))
    marco.alpha_composite(av.filter(ImageFilter.GaussianBlur(3)), (pad, pad - 6))
    d.rounded_rectangle((pad + 74, pad + 6, pad + 74 + 190, pad + 26), 10, fill=(90, 95, 108, 255))
    d.rounded_rectangle((pad + 74 + 204, pad + 9, pad + 74 + 264, pad + 23), 7, fill=(60, 64, 74, 255))
    antes = Image.new("RGBA", marco.size, (0, 0, 0, 0)); resto = Image.new("RGBA", marco.size, (0, 0, 0, 0))
    da, dr = ImageDraw.Draw(antes), ImageDraw.Draw(resto)
    caja = None; tras = False; y = pad + 74
    for li in lineas:
        x = pad; ps = li.split(" ")
        for i, p in enumerate(ps):
            tok = p + (" " if i < len(ps) - 1 else "")
            if corte and not tras and p.strip(".,").lower() == corte.split()[0].lower():
                tras = True; caja = [x, y, x + f.getlength(corte if " " in corte else p.rstrip(".,")), y + lh]
            (dr if tras else da).text((x, y), tok, font=f, fill=(238, 240, 245, 255))
            x += f.getlength(tok)
        y += lh
    completa = Image.alpha_composite(Image.alpha_composite(marco, antes), resto)
    return completa, marco, antes, resto, caja


def palabra(texto, tam, peso="Bold", color=(255, 255, 255), espaciado=0):
    f = fuente("Montserrat", tam, peso)
    w = int(f.getlength(texto) + espaciado * len(texto)) + 20; h = int(tam * 1.4)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im); x = 10
    for ch in texto:
        d.text((x, tam * .15), ch, font=f, fill=color + (255,)); x += f.getlength(ch) + espaciado
    return im


def pega(base, img, cx, cy, alpha=1.0, escala=1.0, giro=0.0):
    """Compone una imagen RGBA centrada en (cx, cy) sobre un cuadro BGR uint8."""
    if alpha <= 0.003: return base
    if escala != 1.0:
        img = img.resize((max(1, int(img.width * escala)), max(1, int(img.height * escala))), Image.LANCZOS)
    if giro: img = img.rotate(giro, Image.BICUBIC, expand=True)
    a = np.asarray(img).astype(np.float32); x0 = int(cx - a.shape[1] / 2); y0 = int(cy - a.shape[0] / 2)
    x1, y1 = max(0, x0), max(0, y0); x2, y2 = min(W, x0 + a.shape[1]), min(H, y0 + a.shape[0])
    if x2 <= x1 or y2 <= y1: return base
    s = a[y1 - y0:y2 - y0, x1 - x0:x2 - x0]; m = s[..., 3:4] / 255 * alpha
    zona = base[y1:y2, x1:x2].astype(np.float32)
    base[y1:y2, x1:x2] = (zona * (1 - m) + s[..., 2::-1] * m).astype(np.uint8)
    return base


def suave(x): x = min(1, max(0, x)); return x * x * (3 - 2 * x)
def sale(x): x = min(1, max(0, x)); return 1 - (1 - x) ** 3


class Polvo:
    """Partículas tomadas de los píxeles de un texto; se deshacen hacia un destino con un remolino."""
    def __init__(self, img, cx, cy, n=5000, semilla=1, destino=None, deriva=(0, 260)):
        a = np.asarray(img)[..., 3]; ys, xs = np.nonzero(a > 120)
        rng = np.random.default_rng(semilla); k = rng.choice(len(xs), min(n, len(xs)), replace=False)
        self.p0 = np.stack([xs[k] - img.width / 2 + cx, ys[k] - img.height / 2 + cy], 1).astype(np.float32)
        self.ret = rng.uniform(0, .45, len(k)).astype(np.float32)  # cada partícula sale a su tiempo
        self.dest = destino; self.giro = rng.uniform(-1, 1, len(k)).astype(np.float32)
        self.der = np.array(deriva, np.float32) * rng.uniform(.4, 1.3, (len(k), 1)).astype(np.float32)
        self.ruido = rng.normal(0, 1, (len(k), 2)).astype(np.float32)

    def dibuja(self, base, u, color=(255, 236, 200), brillo=1.0):
        u = np.clip((u - self.ret) / (1 - self.ret.max() + 1e-6), 0, 1)[:, None]
        if self.dest is not None:
            e = u * u * (3 - 2 * u); d = np.array(self.dest, np.float32)
            rem = np.stack([-(self.p0[:, 1] - d[1]), self.p0[:, 0] - d[0]], 1) * self.giro[:, None] * .35
            p = self.p0 * (1 - e) + d * e + rem * np.sin(np.pi * e)
            v = np.ones(len(p), np.float32)
        else:
            p = self.p0 + self.der * u + self.ruido * 60 * u + np.array([0, 120], np.float32) * u ** 2
            v = (1 - u[:, 0]) ** 1.5
        capa = np.zeros((H, W), np.float32)
        xi = np.clip(p[:, 0].astype(int), 0, W - 1); yi = np.clip(p[:, 1].astype(int), 0, H - 1)
        np.add.at(capa, (yi, xi), v * brillo)
        capa = cv2.GaussianBlur(capa, (0, 0), 1.1) * 3 + cv2.GaussianBlur(capa, (0, 0), 6) * 6
        col = np.array(color[::-1], np.float32)
        f = base.astype(np.float32) + np.clip(capa, 0, 1.6)[..., None] * col
        return np.clip(f, 0, 255).astype(np.uint8)


def punto(base, cx, cy, r, intensidad):
    capa = np.zeros((H, W), np.float32); cv2.circle(capa, (int(cx), int(cy)), max(1, int(r)), 1.0, -1)
    capa = cv2.GaussianBlur(capa, (0, 0), 2) + cv2.GaussianBlur(capa, (0, 0), 22) * 1.5
    f = base.astype(np.float32) + np.clip(capa * intensidad, 0, 2)[..., None] * np.array([200, 236, 255], np.float32)
    return np.clip(f, 0, 255).astype(np.uint8)


# ---------- hook ----------
VO_HOOK = 0.45  # la voz del hook entra aquí
class Hook:
    def __init__(self):
        txt, corte = COMENTARIOS[0]
        self.card, self.marco, self.antes, self.resto, _ = tarjeta(txt, corte, 900, 52)
        self.polvo_resto = Polvo(self.resto, 540, 900, 3500, 3, deriva=(160, 340))
        self.polvo_frase = None

    def cuadro(self, t):
        fr = np.zeros((H, W, 3), np.uint8)
        pero = VO_HOOK + 2.78; mira = VO_HOOK + 5.32
        if t < pero + .1:  # tarjeta completa
            a = sale((t - .35) / .35); s = .94 + .06 * sale((t - .35) / .4)
            return pega(fr, self.card, 540, 900 + 30 * (1 - a), a, s)
        # «Lástima la delincuencia.» se deshace en polvo y se apaga el marco
        u = (t - pero - .1) / 1.3
        fr = pega(fr, self.marco, 540, 900, 1 - suave((t - pero - .2) / .7))
        if u < 1: fr = self.polvo_resto.dibuja(fr, u, (235, 238, 245), .55)
        # «Honduras es hermoso.» sale de la tarjeta, crece y se centra
        m = suave((t - pero - .3) / 1.6); esc = 1 + .45 * m
        ox, oy = self.centro_frase()  # texto respecto al centro de la capa
        cx = 540 - ox * esc * m; cy = 900 * (1 - m) + (PUNTO[1] - oy * esc) * m
        if t < mira:
            return pega(fr, self.antes, cx, cy, 1, esc)
        if self.polvo_frase is None:
            img = self.antes.resize((int(self.antes.width * esc), int(self.antes.height * esc)), Image.LANCZOS)
            self.polvo_frase = Polvo(img, cx, cy, 6000, 5, destino=PUNTO)
        u = (t - mira) / 1.9
        fr = pega(fr, self.antes, cx, cy, 1 - suave(u * 2.5), esc)
        tono = (255, int(236 - 30 * suave(u)), int(200 - 90 * suave(u)))
        fr = self.polvo_frase.dibuja(fr, min(u, 1), tono, 1.0 - .6 * suave((u - .7) / .3))
        if u > .55: fr = punto(fr, *PUNTO, 3 + 2 * math.sin(t * 9), suave((u - .55) / .45) * 1.2)
        return fr

    def centro_frase(self):
        a = np.asarray(self.antes)[..., 3]; xs = np.nonzero(a.max(0))[0]; ys = np.nonzero(a.max(1))[0]
        return (xs.min() + xs.max()) / 2 - a.shape[1] / 2, (ys.min() + ys.max()) / 2 - a.shape[0] / 2


# ---------- textos de época ----------
def rotulo(t1, t2=None):
    a = palabra(t1.upper(), 46, "SemiBold", (255, 244, 225), 8)
    b = palabra(t2, 32, "Regular", (232, 222, 200), 2) if t2 else None
    im = Image.new("RGBA", (max(a.width, b.width if b else 0) + 60, a.height + (b.height + 4 if b else 0) + 60), (0, 0, 0, 0))
    im.alpha_composite(a, ((im.width - a.width) // 2, 30))
    if b: im.alpha_composite(b, ((im.width - b.width) // 2, 30 + a.height + 4))
    sombra = Image.new("RGBA", im.size, (0, 0, 0, 0)); sombra.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(10)).point(lambda v: min(255, v * 1.6)))
    out = Image.alpha_composite(sombra, im); d = ImageDraw.Draw(out); cx = out.width // 2
    d.line((cx - 30, 22, cx + 30, 22), fill=(255, 230, 190, 190), width=2)
    return out


# (texto, subtítulo, clip, segundo dentro del tramo de salida, duración)
ROTULOS = [  # cada uno entra cuando su escena ya está dibujada
    ("Copán", "siglo VIII", "V01", 1.2, 3.0),
    ("Guanaja", "1502", "V03", 2.6, 2.6),
    ("Peñol de Cerquín", "Lempira · 1537", "V04", 2.1, 2.6),
    ("15 de septiembre", "1821", "V05", 2.4, 2.4),
    ("Francisco Morazán", "República Federal de Centroamérica", "V06", 2.3, 2.6),
    ("Costa norte", "siglo XX", "V07", 2.0, 3.2),
    ("España", "1982", "V08", 2.2, 3.0),
    ("14 de octubre", "2009", "V09", 1.3, 3.0),
    ("Mauricio Dubón", "San Pedro Sula · Serie Mundial 2022 · 2 Guantes de Oro", "V09D", 3.6, 3.4),
]


def capa_textos(fr, t, T0):
    for txt, sub, clip, ini, dur in ROTULOS:
        t0 = T0[clip] + ini; u = t - t0
        if 0 <= u <= dur:
            a = suave(u / .45) * (1 - suave((u - dur + .5) / .5))
            fr = pega(fr, CACHE_ROT.setdefault(txt, rotulo(txt, sub)), 540, 1560 - 12 * sale(u / .6), a)
    if T0["V01"] + .6 <= t <= T0["V01"] + 5.5:  # aviso discreto: son recreaciones artísticas
        u = t - T0["V01"] - .6; a = suave(u / .5) * (1 - suave((u - 4.4) / .5)) * .55
        fr = pega(fr, CACHE_ROT.setdefault("_rec", palabra("RECREACIÓN ARTÍSTICA", 24, "Medium", (230, 225, 215), 4)), 540, 1810, a)
    return fr
CACHE_ROT = {}


# ---------- conflicto: el «pero» ----------
VO_PERO = 0.9  # segundos tras el inicio del conflicto
class Conflicto:
    def __init__(self, fondo):
        self.fondo = fondo
        self.items = []
        for (txt, corte), (cx, cy, g, t0) in zip(COMENTARIOS, CAIDA):
            card, marco, antes, resto, caja = tarjeta(txt, corte, 760)
            letras = Image.alpha_composite(antes, resto)
            pal = None
            if corte:
                cw = caja[0] + (caja[2] - caja[0]) / 2 - card.width / 2; ch = caja[1] + 30 - card.height / 2
                pal = (palabra(corte.upper() if corte != "Lástima" else "LÁSTIMA", 96, "ExtraBold"), cw, ch)
            self.items.append(dict(card=card, resto=resto, pal=pal, cx=cx, cy=cy, g=g, t0=t0,
                                   marco=marco, polvo=Polvo(letras, cx, cy, 2600, int(t0 * 10) + 11, deriva=(0, 380))))
        self.pero = palabra("PERO", 230, "Black")

    def cuadro(self, t):
        z = 1 + .05 * t / CONFLICTO
        f = cv2.resize(self.fondo, None, fx=z, fy=z); y = (f.shape[0] - H) // 2; x = (f.shape[1] - W) // 2
        fr = (f[y:y + H, x:x + W].astype(np.float32) * (1 - .55 * suave(t / 1.5))).astype(np.uint8)
        v = VO_PERO
        t_corte = v + 1.04       # «Siempre hay un pero»
        t_junta = v + 4.98       # «Pero cuando solo miramos el pero»
        t_fin = v + 7.38         # «dejamos de ver lo que vale la pena cuidar»
        for it in self.items:
            u = t - it["t0"]
            if u < 0: continue
            g = it["g"] * (1 - sale(u / .4)) * 2 + it["g"]
            caida = (1 - sale(u / .45)) * -140
            if t < t_corte:
                fr = pega(fr, it["card"], it["cx"], it["cy"] + caida, sale(u / .25), 1.0, g)
                continue
            w = (t - t_corte) / 1.2
            if w < 1: fr = it["polvo"].dibuja(fr, w, (225, 230, 240), .8)
            if w < .5: fr = pega(fr, it["marco"], it["cx"], it["cy"], 1 - w / .5, 1.0, g)
            if it["pal"]:
                img, dx, dy = it["pal"]
                px, py = it["cx"] + dx * .9, it["cy"] + dy
                j = suave((t - t_junta + .3) / 1.1)
                px, py = px * (1 - j) + 540 * j, py * (1 - j) + 940 * j
                media = img.width * .8 / 2 + 30; px = min(W - media, max(media, px))  # nunca se sale del cuadro
                a = suave((t - t_corte) / .4) * (1 - suave((t - t_junta) / .5))
                fr = pega(fr, img, px, py, a, .55 + .25 * suave((t - t_corte) / .6), g * (1 - j))
        if t >= t_junta - .1:
            a = suave((t - t_junta + .1) / .5) * (1 - suave((t - t_fin - .6) / 1.8))
            fr = pega(fr, self.pero, 540, 940, a, 1 + .06 * (t - t_junta) / 4)
        if t > CONFLICTO - 1.2: fr = (fr * (1 - suave((t - CONFLICTO + 1.2) / 1.0))).astype(np.uint8)
        return fr


def render(sal, desde=0.0, hasta=None):
    T, fin = tiempos(); T0 = {n: t for n, t, _ in T}; total = fin + CONFLICTO
    hasta = min(hasta or total, total)
    hook = Hook(); clips = {}; conf = None
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", str(sal)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for k in range(int(desde * FPS), int(hasta * FPS)):
        t = k / FPS
        if t < HOOK:
            fr = hook.cuadro(t)
        elif t < fin:
            n, t0, v = [x for x in T if x[1] <= t][-1]
            if n not in clips:
                clips.clear(); clips[n] = Clip(DIR / f"{n}.mp4")
            ts = RECORTE.get(n, (0, 0))[0] + (t - t0) * v
            fr = acabado(a_vertical(a_luz(n, clips[n].cuadro(ts), ts * clips[n].fps)), t)
            fr = capa_textos(fr, t, T0)
        else:
            if conf is None:
                c = Clip(DIR / f"{ULTIMO}.mp4"); conf = Conflicto(acabado(a_vertical(c.cuadro(c.n / c.fps)), fin))
            fr = conf.cuadro(t - fin)
        p.stdin.write(fr.tobytes())
    p.stdin.close(); p.wait()
    return T, fin, total


# ---------- sonido ----------
def mezcla(T, fin, total, video, sal):
    T0 = {n: t for n, t, _ in T}; tc = fin
    def at(s): return int(s * 1000)
    vo = [("vo_hook_b.mp3", VO_HOOK), ("hs2_copan_b.mp3", T0["V01"] + .35), ("vo_1502_b.mp3", T0["V03"] + .2),
          ("vo_1821_b.mp3", T0["V05"] + .45), ("vo_banano_b.mp3", T0["V07"] + .3), ("vo_1982_b.mp3", T0["V08"] + .3), ("vo_dubon2_b.mp3", T0["V09D"] + DUBON_VO),
          ("vo_pero_b.mp3", tc + VO_PERO)]
    # (archivo, inicio, volumen, desde, duración)
    sfx = [("sfx_pings_b.mp3", .33, .9, 0, .7),                       # la notificación del hook
           ("sfx_nace.mp3", HOOK - .6, .8, 0, 4),
           ("sfx_cincel.mp3", T0["V02"] + 1.4, .7, 0, 3),
           ("sfx_mar_b.mp3", T0["V03"] + .5, .55, 0, 6),
           ("sfx_monte_b.mp3", T0["V04"] + .1, .6, 0, 6),
           ("sfx_pluma_b.mp3", T0["V05"] + 1.2, .6, 0, 6),
           ("sfx_caballo_b.mp3", T0["V06"] + 1.3, .6, 0, 5),
           ("sfx_tren_b.mp3", T0["V07"], .55, 0, 6),
           ("sfx_estadio_b.mp3", T0["V08"] + .8, .55, 0, 6),
           ("sfx_estadio_a.mp3", T0["V09"] + 3.6, .45, 1.5, 4.5),
           ("sfx_bate_b.mp3", T0["V09D"] + BATE, .8, 0, 5),
           ("sfx_pings_a.mp3", T0["V10D"] + 3.8, .75, 0, 6)]
    sfx += [("sfx_pings_b.mp3", tc + c[3], .55, 0, .6) for c in CAIDA]  # un aviso por tarjeta que cae
    entradas, filtros, mixv, mixs = [], [], [], []
    idx = 1
    for f, t0 in vo:
        entradas += ["-i", str(DIR / f)]
        filtros.append(f"[{idx}:a]loudnorm=I=-15:TP=-1.5:LRA=7,aresample=48000,adelay={at(t0)}|{at(t0)}[v{idx}]")
        mixv.append(f"[v{idx}]"); idx += 1
    # narración real de 2009: «¡GOL!» en 2,42 s, cae cuando el remate entra
    entradas += ["-i", str(DIR / "narr2010.m4a")]; t_n = T0["V09"] + NARR_OFF
    filtros.append(f"[{idx}:a]loudnorm=I=-15:TP=-1.5,aresample=48000,afade=t=out:st={T0['V09D'] + DUBON_VO - 1.2 - t_n:.2f}:d=1.2,adelay={at(t_n)}|{at(t_n)}[v{idx}]")
    mixv.append(f"[v{idx}]"); idx += 1
    for f, t0, vol, ss, d in sfx:
        entradas += ["-ss", str(ss), "-t", str(d), "-i", str(DIR / f)]
        filtros.append(f"[{idx}:a]aresample=48000,volume={vol},afade=t=out:st={max(0, d - .5):.2f}:d=0.5,adelay={at(t0)}|{at(t0)}[s{idx}]")
        mixs.append(f"[s{idx}]"); idx += 1
    # música: entra suave con el hook, sube con el punto de luz y se corta en seco en el último «gol»
    corte = T0["V10D"] + 1.2
    entradas += ["-i", str(DIR / "musica_b.mp3")]
    vol = (f"volume='if(lt(t,{HOOK - .3}),0.35,1)':eval=frame")
    filtros.append(f"[{idx}:a]aresample=48000,atrim=0:{corte},{vol},afade=t=in:d=1.2,afade=t=out:st={corte - .9}:d=0.9,"
                   f"adelay=200|200[mus]"); idx += 1
    # bajo el conflicto solo un colchón grave (el inicio de la misma música, lento y filtrado)
    entradas += ["-i", str(DIR / "musica_b.mp3")]
    filtros.append(f"[{idx}:a]aresample=48000,atrim=0:9,asetrate=48000*0.84,aresample=48000,lowpass=f=900,volume=0.7,"
                   f"afade=t=in:d=2,afade=t=out:st=6.5:d=2.5,adelay={at(tc + .4)}|{at(tc + .4)}[col]"); idx += 1
    filtros.append(f"{''.join(mixv)}amix=inputs={len(mixv)}:normalize=0:duration=longest,apad=whole_dur={total}[voz]")
    filtros.append("[voz]asplit=2[voz1][vozsc]")
    filtros.append("[mus][vozsc]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=350[musd]")
    filtros.append(f"{''.join(mixs)}amix=inputs={len(mixs)}:normalize=0:duration=longest[sf]")
    filtros.append(f"[voz1][musd][sf][col]amix=inputs=4:normalize=0:duration=longest,atrim=0:{total},"
                   f"alimiter=limit=0.89,afade=t=out:st={total - .6}:d=0.6[a]")
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(video), *entradas, "-filter_complex", ";".join(filtros),
           "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", str(sal)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[:1500])


DUBON_VO = 2.2  # «Y un sampedrano, Mauricio Dubón…» entra cuando aparece el estadio de béisbol
BATE = 4.18     # el chasquido del bate (0,40 s dentro del efecto) cae en el destello del contacto, cuadro ~110
NARR_OFF = 1.5  # «¡GOL!» (2,42 s de la narración) cae cuando el remate de V09 entra (cuadro ~85 a x0,9)


def main():
    global DIR, FUENTES
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir"); ap.add_argument("--fuentes"); ap.add_argument("--sal")
    ap.add_argument("--desde", type=float, default=0); ap.add_argument("--hasta", type=float)
    ap.add_argument("--solo-plan", action="store_true")
    ap.add_argument("--solo-mezcla", action="store_true", help="reusa el .mudo.mp4 ya renderizado")
    a = ap.parse_args(); DIR = Path(a.dir); FUENTES = Path(a.fuentes)
    T, fin = tiempos()
    for n, t, v in T: print(f"{n} {t:6.2f}  x{v}  ({dur_clip(n) / v:.2f} s)")
    print(f"conflicto {fin:.2f} → fin {fin + CONFLICTO:.2f}")
    if a.solo_plan: return
    sal = Path(a.sal); mudo = sal.with_suffix(".mudo.mp4")
    if a.solo_mezcla:
        return mezcla(T, fin, fin + CONFLICTO, mudo, sal)
    T, fin, total = render(mudo, a.desde, a.hasta)
    if a.desde == 0 and not a.hasta:
        mezcla(T, fin, total, mudo, sal)
    else:
        mudo.rename(sal)


if __name__ == "__main__":
    main()
