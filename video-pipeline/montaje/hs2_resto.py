"""Honduras Secreta 2, partes 2–4: del «pero» a lo real, la ruta del agua y el cierre.

    python3 montaje/hs2_resto.py --hn HN --fuentes FUENTES --apertura apertura.mp4 --sal resto.mp4 [--desde S --hasta S]
    python3 montaje/hs2_resto.py ... --une final.mp4     # además pega apertura + resto en un solo archivo

Arranca en el último cuadro de la apertura (el «PERO» sobre la gente con teléfonos) y sigue en una sola escena:
tarjeta «guacamaya con colmillos» → el diente real de HS1 → la guacamaya de luz se vuelve la guara de HS →
«¿Colmillos?… Bueno, uno.» → entramos a su ojo: refleja a la gente mirando el teléfono («siempre vamos a encontrar
algo malo…») → parpadea, el «PERO» se hace polvo y el reflejo es otra Honduras («…¿y si empezamos a verla con otros
ojos?») → caemos por la pupila al mapa: «¿Cuál es tu lugar favorito de Honduras?» → la luz dibuja a Carlos →
Picacho → Los Naranjos (Romeo) → río → cenote (Samira) → Utila (Lenyn) → Santa Bárbara → Leiva en la tele →
la gente del pueblo → la guara vuela al atardecer → logo.
Testimonios reales con su voz; los enlaces son clips MiniMax encadenados por imagen y latigazos (whips) por código.
"""
import argparse, json, math, subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

import hs2_apertura as ha
from sin_dientes import sin_dientes
from hs2_apertura import (W, H, FPS, Clip, a_vertical, acabado, lineas, palabra, pega, suave, sale, tarjeta,
                          rotulo, punto, fuente)

UP = Path("/root/.claude/uploads/2611f717-6182-5311-8e6b-eee5393945e0")
REAL = {"carlos": "af89be14-copy_97417FB3-3353-4FE3-BBD3-6C8D6AC9A2DC_1.mp4", "romeo": "2990b56a-IMG_6044.mov",
        "samira": "37537b71-IMG_7392.mov", "lenyn": "8bc03e38-IMG_5166.MOV",
        "leiva": "ca51f74f-VIDEO-2026-10-02-16-51-40.mp4"}
ROMEO_MARCA = 9.0  # desde aquí su video trae el logo de CapCut
CARLOS_X0 = 995  # recorte vertical 810x1440 del video horizontal de Carlos (centrado en su cara)
COLMILLOS = "perame perame perameeeeee! una guacamaya con colmillos???? no saben hacer ni anuncios y quiere que uno les apoye! estos gobiernos van de mal en peor"
ORO = (150, 215, 255)  # BGR

# Lugares del mapa (lon, lat). Los cinco primeros son los testimonios.
LUGARES = [("Tegucigalpa", -87.21, 14.10), ("Lago de Yojoa", -87.98, 14.87), ("San Luis Planes", -88.12, 15.03),
           ("Santa Bárbara", -88.23, 14.92), ("Utila", -86.90, 16.10),
           (None, -89.14, 14.84), (None, -86.55, 16.32), (None, -87.65, 13.29), (None, -84.60, 15.40),
           (None, -86.78, 15.76), (None, -88.58, 14.59), (None, -86.13, 14.80), (None, -88.03, 15.50)]


def xy(lon, lat):
    """Proyección del mapa a pantalla: Honduras ocupa 1000 px de ancho centrada en y=900."""
    x = 40 + (lon + 89.40) / 6.30 * 1000
    y = 900 - 370 + (17.45 - lat) / 4.50 * 740
    return x, y


class Real:
    """Video real de un testimonio, recortado a 1080x1920."""
    def __init__(self, nombre):
        self.c = Clip(UP / REAL[nombre]); self.nombre = nombre

    def cuadro(self, ts):
        f = self.c.cuadro(ts)
        if self.nombre == "carlos": f = f[:, CARLOS_X0:CARLOS_X0 + 810]
        if self.nombre == "romeo" and ts >= ROMEO_MARCA: f = f[190:, 110:]  # recorte 9:16 sin el logo de CapCut (arriba a la izq.)
        return cv2.resize(f, (W, H), interpolation=cv2.INTER_LANCZOS4) if f.shape[:2] != (H, W) else f


def desenfoque_dir(fr, px, vertical):
    """Desenfoque de movimiento: núcleo lineal de px píxeles en la dirección del movimiento."""
    n = int(min(161, abs(px)))
    if n < 3: return fr
    k = np.zeros((n, n), np.float32)
    if vertical: k[:, n // 2] = 1
    else: k[n // 2, :] = 1
    return cv2.filter2D(fr, -1, k / n, borderType=cv2.BORDER_REPLICATE)


DIRS = {"l": (-1, 0), "r": (1, 0), "u": (0, -1), "d": (0, 1)}
def whip_par(fa, fb, p, dire):
    """Latigazo continuo como un paneo rápido: el plano que sale y el que entra están lado a lado y se desplazan
    juntos (sin espejos en los bordes). p ∈ [0, 1] a lo largo de toda la transición; velocidad en campana."""
    dx, dy = DIRS[dire]; L = W if dx else H
    e = p * p * (3 - 2 * p); vel = 6 * p * (1 - p)  # posición suave, velocidad máxima en el corte
    s = e * L
    Ma = np.float32([[1, 0, -s * dx], [0, 1, -s * dy]]); Mb = np.float32([[1, 0, (L - s) * dx], [0, 1, (L - s) * dy]])
    lienzo = cv2.warpAffine(fa, Ma, (W, H), borderValue=0)
    mb = cv2.warpAffine(np.full((H, W), 255, np.uint8), Mb, (W, H), borderValue=0)
    fbw = cv2.warpAffine(fb, Mb, (W, H), borderValue=0)
    lienzo[mb > 0] = fbw[mb > 0]
    out = desenfoque_dir(lienzo, vel * L / FPS * 1.4, vertical=bool(dy))
    # el operador gira un poco la muñeca y la cámara «respira» hacia adentro en el centro del latigazo
    b = math.sin(math.pi * p)
    ang = 7 * b * (dx - dy if dx else dy)
    M = cv2.getRotationMatrix2D((W / 2, H / 2), ang, 1 + .12 * b)
    out = cv2.warpAffine(out, M, (W, H), borderMode=cv2.BORDER_REFLECT)
    out = aberracion(out, 10 * vel / 1.5, dx, dy)
    return fuga_luz(out, max(0.0, 1 - abs(p - .5) * 3.2), dx, dy)


def aberracion(fr, px, dx=1, dy=0):
    """Separación de color en la dirección del movimiento (como un lente a toda velocidad)."""
    k = int(round(px))
    if k < 1: return fr
    out = fr.copy()
    out[..., 2] = np.roll(fr[..., 2], (k * dy, k * dx), (0, 1)); out[..., 0] = np.roll(fr[..., 0], (-k * dy, -k * dx), (0, 1))
    return out


FUGA = {}
def fuga_luz(fr, a, dx=1, dy=0):
    """Fuga de luz cálida que barre desde el lado por donde entra el plano nuevo."""
    if a <= .01: return fr
    clave = (dx, dy)
    if clave not in FUGA:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        cx = W * (.5 + .55 * dx); cy = H * (.5 + .45 * dy) if dy else H * .38
        r = np.hypot((xx - cx) / (W * .55), (yy - cy) / (H * .45))
        m = np.exp(-r * r * 1.6)[..., None]
        FUGA[clave] = m * np.array([60, 150, 255], np.float32)  # BGR: naranja
    return np.clip(fr.astype(np.float32) + FUGA[clave] * (.75 * a), 0, 255).astype(np.uint8)


def giro(fa, fb, p):
    """Giro de cámara (Sam Kolder): el plano que sale rota y se acerca con desenfoque rotacional; el que entra
    llega girando desde el lado contrario. p ∈ [0, 1]."""
    if p < .5:
        q = p / .5; fr, ang, z = fa, 60 * q * q, 1 + .45 * q * q
    else:
        q = (1 - p) / .5; fr, ang, z = fb, -60 * q * q, 1 + .45 * q * q
    n = 5 if q > .15 else 1; acc = np.zeros(fr.shape, np.float32); paso = 9 * q
    for k in range(n):
        M = cv2.getRotationMatrix2D((W / 2, H / 2), ang + paso * (k / max(1, n - 1) - .5), z)
        acc += cv2.warpAffine(fr, M, (W, H), borderMode=cv2.BORDER_REFLECT)
    out = (acc / n).astype(np.uint8)
    out = zoom_radial(out, 1, fuerza=.12 * q) if q > .2 else out
    return fuga_luz(out, max(0.0, 1 - abs(p - .5) * 3), 1, 0)


def zoom_radial(fr, z, cx=W / 2, cy=H / 2, fuerza=0.0):
    """Zoom con desenfoque radial (varias capas de escala promediadas)."""
    if fuerza < .01: return zoom(fr, z, cx, cy)
    acc = np.zeros(fr.shape, np.float32); n = 7
    for k in range(n):
        acc += zoom(fr, z * (1 + fuerza * k / (n - 1)), cx, cy)
    return (acc / n).astype(np.uint8)


def grado(fr, tipo):
    """Une el color de la IA y de lo real: la IA baja saturación y brillo de cielo; lo real gana contraste y calidez."""
    f = fr.astype(np.float32)
    g = f.mean(2, keepdims=True)
    if tipo == "ia":
        f = g + (f - g) * .82
        f = 255 * ((f / 255) ** 1.06)
        f[..., 2] *= 1.02; f[..., 0] *= .97
    elif tipo == "real":
        f = g + (f - g) * 1.10
        f = (f - 128) * 1.06 + 128
        f[..., 2] *= 1.03; f[..., 0] *= .96
    return np.clip(f, 0, 255).astype(np.uint8)


VIN2 = None
def acabar(fr, t, bloom=0.0):
    """Viñeta suave y grano fijo por cuadro, iguales para IA y real; bloom solo donde hay luz."""
    global VIN2
    if VIN2 is None:
        yy, xx = np.mgrid[0:H, 0:W]; r = np.hypot((xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2))
        VIN2 = np.clip(1.06 - .22 * r ** 2, .7, 1)[..., None].astype(np.float32)
    f = fr.astype(np.float32)
    if bloom:
        peq = cv2.resize(fr, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        f += bloom * cv2.resize(cv2.GaussianBlur(peq, (0, 0), 9), (W, H)).astype(np.float32)
    rng = np.random.default_rng(int(t * FPS) + 11)
    gr = cv2.resize(rng.normal(0, 2.6, (H // 2, W // 2)).astype(np.float32), (W, H))
    return np.clip(f * VIN2 + gr[..., None], 0, 255).astype(np.uint8)


def zoom(fr, z, cx=W / 2, cy=H / 2):
    if abs(z - 1) < 1e-3: return fr
    M = np.float32([[z, 0, cx * (1 - z)], [0, z, cy * (1 - z)]])
    return cv2.warpAffine(fr, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


# ---------- textos ----------
CACHE = {}
def usuario(handle):
    if handle not in CACHE:
        from PIL import ImageDraw
        f = fuente("FrauncesItalic", 62); w = int(f.getlength(handle)) + 40
        im = Image.new("RGBA", (w, 110), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((20, 10), handle, font=f, fill=(255, 238, 205, 255))
        g = Image.new("RGBA", im.size, (255, 200, 120, 0))
        g.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(9)).point(lambda v: int(v * .8)))
        CACHE[handle] = Image.alpha_composite(g, im)
    return CACHE[handle]


def icono_ig(d=104):
    """Ícono genérico de cámara sobre degradado tipo Instagram, dibujado por código."""
    from PIL import ImageDraw
    k = 4; D = d * k
    yy, xx = np.mgrid[0:D, 0:D].astype(np.float32); t = np.clip((xx + (D - yy)) / (2 * D), 0, 1)[..., None]
    c0, c1, c2 = np.array([254, 218, 117]), np.array([214, 41, 118]), np.array([79, 91, 213])  # RGB
    g = np.where(t < .5, c0 + (c1 - c0) * (t / .5), c1 + (c2 - c1) * ((t - .5) / .5))
    im = Image.fromarray(np.dstack([g, np.full((D, D), 255)]).astype(np.uint8), "RGBA")
    m = Image.new("L", (D, D), 0); ImageDraw.Draw(m).ellipse((0, 0, D - 1, D - 1), fill=255); im.putalpha(m)
    dr = ImageDraw.Draw(im); w = int(D * .055); a, b = D * .27, D * .73
    dr.rounded_rectangle((a, a, b, b), radius=D * .13, outline=(255, 255, 255, 255), width=w)
    r = D * .115; dr.ellipse((D / 2 - r, D / 2 - r, D / 2 + r, D / 2 + r), outline=(255, 255, 255, 255), width=w)
    r2 = D * .03; dr.ellipse((D * .63 - r2, D * .36 - r2, D * .63 + r2, D * .36 + r2), fill=(255, 255, 255, 255))
    return im.resize((d, d), Image.LANCZOS)


def burbuja(nombre, handle):
    """Burbuja blanca: ícono, nombre grande y la cuenta de Instagram debajo (texto por código)."""
    clave = ("burbuja", nombre, handle)
    if clave not in CACHE:
        from PIL import ImageDraw
        fn, fh = fuente("Montserrat", 58, "ExtraBold"), fuente("Montserrat", 44, "SemiBold")
        ic = icono_ig(128); pad = 24
        w = pad + ic.width + 24 + int(max(fn.getlength(nombre), fh.getlength(handle))) + 44; h = ic.height + 2 * pad
        sh = 30; im = Image.new("RGBA", (w + 2 * sh, h + 2 * sh), (0, 0, 0, 0))
        sombra = Image.new("L", im.size, 0); ImageDraw.Draw(sombra).rounded_rectangle((sh, sh + 8, sh + w, sh + h + 8), h // 2, fill=120)
        im.putalpha(sombra.filter(ImageFilter.GaussianBlur(14)))
        caja = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(caja)
        d.rounded_rectangle((sh, sh, sh + w, sh + h), h // 2, fill=(255, 255, 255, 242))
        caja.alpha_composite(ic, (sh + pad, sh + pad))
        x = sh + pad + ic.width + 24
        d.text((x, sh + pad + 2), nombre, font=fn, fill=(18, 18, 24, 255))
        d.text((x, sh + pad + 70), handle, font=fh, fill=(90, 92, 104, 255))
        CACHE[clave] = Image.alpha_composite(im, caja)
    return CACHE[clave]


def capa_usuario(fr, usu, u, dur=3.2):
    """La burbuja aparece con rebote, se queda y sale. Va arriba o abajo según dónde esté la persona."""
    nombre, handle, y0 = usu; arriba = y0 < H / 2
    if u < 0 or u > dur: return fr
    im = burbuja(nombre, handle)
    e = min(1.0, u / .5); rebote = 1 + .08 * math.sin(math.pi * e) * (1 - e) * 2 if e < 1 else 1.0
    esc = (.75 + .25 * sale(e)) * rebote
    salida = suave((u - dur + .35) / .35)
    a = suave(u / .2) * (1 - salida)
    d = -1 if arriba else 1  # entra y sale hacia el borde más cercano
    y = y0 + d * (40 * (1 - sale(e)) + 50 * salida)
    return pega(fr, im, 40 + im.width * esc / 2, y, a, esc)


def bloques(palabras, a, b, max_pal=3, max_dur=1.5):
    """Agrupa palabras [(texto, ini, fin)] dentro de [a, b) en subtítulos cortos."""
    out, cur = [], []
    for p, s, e in palabras:
        if s < a - .05 or s >= b: continue
        if cur and (len(cur) >= max_pal or e - cur[0][1] > max_dur or cur[-1][0].endswith((".", ","))):
            out.append(cur); cur = []
        cur.append((p, s, e))
    if cur: out.append(cur)
    return [(" ".join(p for p, _, _ in c), c[0][1], c[-1][2]) for c in out]


def subtitulos(T):
    """Subtítulos en tiempo de salida: testimonios (siguen los J-cuts) y las frases de la guara."""
    P = json.load(open(HN / "p2/loc/palabras_test.json"))
    out = []
    for quien, t0, src, dur in TRAMOS(T):
        for txt, s, e in bloques(P[quien], src, src + dur):
            out.append((txt, t0 + s - src, min(t0 + dur, t0 + e - src)))
    out += [("¿Una guacamaya con colmillos?", T["lee"] + .0, T["lee"] + 2.75),
            ("¿Yo?", T["lee"] + 3.25, T["lee"] + 3.95),
            ("Bueno…", T["bueno"] + .05, T["bueno"] + 1.2), ("uno.", T["bueno"] + 1.3, T["bueno"] + 1.85)]
    v1, v2 = T_VO(T)[:2]
    out += [("Siempre vamos a encontrar", v1, v1 + 1.5), ("algo malo…", v1 + 1.5, v1 + 2.75),
            ("si es lo único que buscamos.", v1 + 2.85, v1 + 4.5),
            ("Pero…", v2, v2 + .85), ("¿y si empezamos", v2 + .9, v2 + 1.95), ("a ver Honduras", v2 + 1.95, v2 + 2.6),
            ("con otros ojos?", v2 + 2.6, v2 + 3.55)]
    out.sort(key=lambda x: x[1])
    for j in range(len(out) - 1):  # nunca dos subtítulos a la vez (los J-cuts se solapan)
        if out[j][2] > out[j + 1][1] - .3: out[j] = (out[j][0], out[j][1], out[j + 1][1] - .3)
    return out


def T_VO(T):
    """Inicio de las tres voces del puente: «algo malo», «otros ojos» (su «Pero» cae en el parpadeo) y la pregunta."""
    v1 = T["ojo_entra"] + .35
    v2 = T["ojo_parpadeo"] + PARPADEO - .08
    v3 = max(T["mapa"] + .45, v2 + 3.48 + .4)
    return v1, v2, v3


def TRAMOS(T):
    """(persona, inicio en la salida, inicio en su video, duración) de cada tramo de voz real."""
    return [("carlos", T["carlos"], 0.0, 6.6), ("romeo", T["romeo"] - 1.0, 0.0, 1.0 + ROMEO_CORTE),
            ("romeo", T["romeo"] + ROMEO_CORTE, 11.70, ROMEO_PIR), ("samira", T["samira"] - .2, 1.35, 11.05),
            ("lenyn", T["lenyn"] - 2.24, 6.1, 8.02), ("leiva", T["leiva_tv"] - LEIVA_SRC, 0.0, 8.85)]


GUARA_SUBS = ("¿Una guacamaya con colmillos?", "¿Yo?", "Bueno…", "uno.", "Siempre vamos a encontrar", "algo malo…",
              "si es lo único que buscamos.", "Pero…", "¿y si empezamos", "a ver Honduras", "con otros ojos?")


def capa_sub(fr, subs, ts):
    for txt, s, e in subs:
        if s - .05 <= ts <= e + .25:
            img = CACHE.get(("sub", txt))
            if img is None:
                img = palabra(txt, 60, "Bold", (255, 255, 255), 1)
                sh = Image.new("RGBA", img.size, (0, 0, 0, 0)); sh.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(6)))
                img = Image.alpha_composite(sh, img)
                if img.width > 1000: img = img.resize((1000, int(img.height * 1000 / img.width)), Image.LANCZOS)
                CACHE[("sub", txt)] = img
            a = suave((ts - s + .05) / .12) * (1 - suave((ts - e - .1) / .15))
            fr = pega(fr, img, 540, 1640 if txt in GUARA_SUBS else 1470, a, 1.0)
    return fr


def capa_rotulo(fr, txt, sub, u, dur):
    if 0 <= u <= dur:
        a = suave(u / .45) * (1 - suave((u - dur + .5) / .5))
        fr = pega(fr, CACHE.setdefault(("rot", txt), rotulo(txt, sub)), 540, 1560 - 12 * sale(u / .6), a)
    return fr


# ---------- segmentos ----------
class Seg:
    """trans: cómo se entra a este segmento desde el anterior: None (corte o continuidad),
    "whip-l/r/u/d" (latigazo en esa dirección), "giro" (giro de cámara, de lugar a persona), "zoom" (empuje radial)
    o "fundido"."""
    def __init__(self, nombre, dur, fn, trans=None, rot=None, usu=None, tipo="ia", bloom=0.0):
        self.nombre, self.dur, self.fn, self.trans = nombre, dur, fn, trans
        self.rot, self.usu, self.tipo, self.bloom = rot, usu, tipo, bloom
        self.rampa = False


def seg_clip(nombre, archivo, vel, ini=0.0, fin=None, **kw):
    c = Clip(HN / "p2" / archivo) if not str(archivo).startswith("/") else Clip(archivo)
    fin = fin if fin is not None else c.n / c.fps
    def fn(u):
        ts = ini + u * vel
        f = c.cuadro(ts)
        return a_vertical(f)
    sg = Seg(nombre, (fin - ini) / vel, fn, **kw); sg.rampa = True
    return sg


def tarjeta_resaltada(texto, frase, ancho=980, tam=54):
    """Tarjeta de comentario (autor borrado) con la frase clave marcada en amarillo, sin cambiar el texto."""
    from PIL import ImageDraw
    f = fuente("Manrope", tam); pad = 46; lh = int(tam * 1.38)
    lineas_ = ha.envuelve(texto, f, ancho - 2 * pad)
    alto = pad + 78 + len(lineas_) * lh + pad - 8
    im = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, ancho - 1, alto - 1), 36, fill=(24, 26, 32, 246), outline=(255, 255, 255, 40), width=2)
    av = Image.new("RGBA", (60, 60), (0, 0, 0, 0)); ImageDraw.Draw(av).ellipse((0, 0, 59, 59), fill=(120, 126, 140, 255))
    im.alpha_composite(av.filter(ImageFilter.GaussianBlur(3)), (pad, pad - 6))
    d.rounded_rectangle((pad + 78, pad + 6, pad + 78 + 200, pad + 28), 10, fill=(90, 95, 108, 255))
    objetivo = frase.split(); i_obj = 0; y = pad + 78
    for li in lineas_:
        x = pad; ps = li.split(" ")
        for j, pal in enumerate(ps):
            tok = pal + (" " if j < len(ps) - 1 else "")
            marcada = i_obj < len(objetivo) and pal == objetivo[i_obj]
            if marcada:
                w = f.getlength(pal); d.rounded_rectangle((x - 6, y + 4, x + w + 6, y + lh - 2), 8, fill=(255, 205, 40, 235))
                i_obj += 1
            elif i_obj and i_obj < len(objetivo): i_obj = 0
            d.text((x, y), tok, font=f, fill=(20, 20, 24, 255) if marcada else (240, 242, 247, 255))
            x += f.getlength(tok)
        y += lh
    return im


def telefono(pantalla, ancho=700):
    """Marco de teléfono genérico (sin marca) alrededor de un cuadro 9:16."""
    h = int(ancho * 16 / 9); bez = 22
    scr = cv2.resize(pantalla, (ancho - 2 * bez, h - 2 * bez), interpolation=cv2.INTER_AREA)
    img = np.zeros((h, ancho, 4), np.uint8)
    cv2.rectangle(img, (0, 0), (ancho - 1, h - 1), (18, 18, 20, 255), -1)
    rgba = np.dstack([scr[..., ::-1], np.full(scr.shape[:2], 255, np.uint8)])
    img[bez:h - bez, bez:ancho - bez] = rgba
    m = np.zeros((h, ancho), np.uint8); cv2.rectangle(m, (0, 0), (ancho - 1, h - 1), 255, -1)
    r = 60
    for cx, cy in ((r, r), (ancho - r, r), (r, h - r), (ancho - r, h - r)):
        cv2.rectangle(m, (cx - r if cx < ancho / 2 else cx, cy - r if cy < h / 2 else cy),
                      (cx if cx < ancho / 2 else cx + r, cy if cy < h / 2 else cy + r), 0, -1)
        cv2.circle(m, (cx, cy), r, 255, -1)
    img[..., 3] = np.minimum(img[..., 3], m)
    return Image.fromarray(img, "RGBA")


VEL_OJO1, VEL_OJO2 = 1.3, 1.15  # velocidad de los clips del ojo
E2_FIN = 5.3                     # en 5,6 s el clip regresa a un plano abierto: se corta antes
PARPADEO = 1.7 / VEL_OJO2        # s de salida en que el párpado queda cerrado (cuadro 1,7 s de E2)
PUPILA = (.5, .55)               # centro del reflejo al final del empuje de E2 (proporción del cuadro)
MAPA_EXTRA = 1.2
ROMEO_CORTE = 5.75                # «…de Santa Cruz de Yojoa» termina (6,70 de su video) y salta a las pirámides
ROMEO_PIR = 1.4                   # «tenemos pirámides,» completo y una pausa (11,70–13,10; «también» entra en 13,30)
SAMIRA_DUR = 6.95                 # ella en cuadro hasta «…su información» (8,5); el resto de su frase va sobre el cenote
LENYN_DUR = 2.6                   # él hasta «…belleza natural,»; «playas… vida marina» va sobre el arrecife y la ballena
ARRIBA, ABAJO = 330, 1690         # altura de la burbuja: arriba sobre el fondo o abajo bajo los subtítulos
LEIVA_SRC, LEIVA_DUR = 1.0, 7.25  # la tele se enciende en «…de Honduras» y lo vemos hasta «principalmente su»                 # el mapa se sostiene más para leer la pregunta


def construir(bg_final):
    reales = {k: Real(k) for k in REAL}
    S = []
    pero = palabra("PERO", 230, "Black")
    pero_frio = palabra("PERO", 230, "Black", (215, 228, 255))

    # 1. Fin de la historia: la guacamaya de luz aterriza frente a la gente y se vuelve la guara de HS.
    #    El «PERO» sube y queda flotando arriba.
    w01 = Clip(HN / "p2/W01_luz_guara.mp4")
    def f_luz_guara(u):
        fr = a_vertical(sin_dientes(w01.cuadro(u * 1.9)))  # la IA le pintó dientes blancos en el pico
        e = sale(u / .9); y = 940 * (1 - e) + 380 * e
        return pega(fr, pero, 540, y, .9 - .35 * e, 1 - .3 * e)
    S.append(Seg("luz_guara", w01.n / w01.fps / 1.9, f_luz_guara, bloom=.2))

    # 2. Le llega el comentario real; lo lee en voz alta (la frase clave va marcada) — 4,2 s para leerlo.
    card = tarjeta_resaltada(COLMILLOS, "una guacamaya con colmillos????", 920, 46)
    l02 = Clip(HN / "p2/L02_lee.mp4"); dur_lee = l02.n / l02.fps
    # OmniHuman inventó un recuadro de subtítulos ilegible (filas 1534–1753) y un «YO»: se tapa con el piso
    # de la imagen fija original, con borde suave
    quieta = cv2.resize(cv2.imread(str(HN / "p2/P_guara_colmillo_b.png")), (1088, 1920), interpolation=cv2.INTER_AREA)
    mezcla_piso = np.clip((np.arange(1920, dtype=np.float32) - 1420) / 70, 0, 1)[:, None, None]
    def f_lee(u):
        f = sin_dientes(l02.cuadro(u)).astype(np.float32)
        fr = a_vertical((f * (1 - mezcla_piso) + quieta * mezcla_piso).astype(np.uint8))
        y = 360 - 260 * (1 - sale(u / .35))
        fr = pega(fr, pero, 540, 380 - 200 * sale(u / .3), .55 * (1 - sale(u / .3)), .7)
        return pega(fr, card, 540, y, sale(u / .25), 1.0, -1.5 * (1 - sale(u / .5)))
    S.append(Seg("lee", dur_lee, f_lee))

    # 3. «Pausa»: la repetición del video pasado en un teléfono, congelada en el diente, con aro rojo.
    hs1 = Clip(HN / "v3/GU_hook_habla.mp4"); tx, ty = .474, .396  # el diente, cuadro 9,8 s (proporción)
    fondo_lee = cv2.GaussianBlur(a_vertical(l02.cuadro(dur_lee - .05)), (0, 0), 18)
    fondo_lee = (fondo_lee * .45).astype(np.uint8)
    etiqueta = palabra("Honduras Secreta · video anterior", 36, "SemiBold", (240, 240, 245), 2)
    def f_replay(u):
        fr = fondo_lee.copy()
        ts = 9.36 + min(u, .55) * .8  # corre un instante y se congela en el diente
        pant = a_vertical(hs1.cuadro(ts))
        z = 1 + 1.4 * suave((u - .7) / .8)
        pant = zoom(pant, z, tx * W, ty * H)
        if u > 1.3:  # aro rojo que se dibuja alrededor del diente
            ang = int(360 * sale((u - 1.3) / .4))
            cv2.ellipse(pant, (int(tx * W), int(ty * H)), (115, 115), -90, 0, ang, (40, 40, 235), 12, cv2.LINE_AA)
        tel = telefono(pant)
        y = 1000 + 900 * (1 - sale(u / .35))
        fr = pega(fr, tel, 540, y)
        fr = pega(fr, etiqueta, 540, y - tel.height / 2 - 50, sale((u - .2) / .3))
        if .55 < u < .62: fr = cv2.addWeighted(fr, .7, np.full_like(fr, 255), .3, 0)  # clic de pausa
        return fr
    S.append(Seg("replay", 2.3, f_replay, trans="zoom"))

    # 4. «Bueno… uno.» — sonríe enseñando el diente
    l01 = Clip(HN / "p2/L01_colmillo.mp4")
    S.append(Seg("bueno", 2.0, lambda u: zoom(a_vertical(l01.cuadro(1.25 + u)), 1 + .06 * u, W / 2, H * .38),
                 trans="zoom"))

    # 5. «Otros ojos». La cámara entra al ojo de la guara: en su reflejo, la gente mirando el teléfono
    #    (lo malo que buscamos). El «PERO» vuelve, frío, flotando delante.
    e1 = Clip(HN / "p2/E1_ojo_entra.mp4")
    def f_ojo_entra(u):
        f = e1.cuadro(u * VEL_OJO1)
        fr = a_vertical(sin_dientes(f) if u * VEL_OJO1 < 2.4 else f)  # mientras se ve el pico entero
        k = suave((u - 3.4) / .6)  # antes de esto el sombrero (con letras) está en cuadro
        return pega(fr, pero_frio, 540, 330 + 10 * u, .42 * k, .62 + .015 * u)
    S.append(Seg("ojo_entra", e1.n / e1.fps / VEL_OJO1, f_ojo_entra, trans="fundido", bloom=.1))
    # 6. Parpadea: el «PERO» se deshace en polvo y el reflejo cambia a la Honduras que no miramos.
    #    Al final la cámara cae dentro de la pupila y de su negro nace el mapa.
    e2 = Clip(HN / "p2/E2_ojo_parpadeo.mp4")
    polvo_pero = ha.Polvo(pero_frio, 540, 380, 6000, 21, deriva=(0, -380))
    dur_e2 = E2_FIN / VEL_OJO2
    def f_ojo_parpadeo(u):
        fr = a_vertical(e2.cuadro(u * VEL_OJO2))
        if u < PARPADEO: fr = pega(fr, pero_frio, 540, 380, .42, .7)
        else: fr = polvo_pero.dibuja(fr, min(1, (u - PARPADEO) / 1.2), (255, 236, 200), 1.2)
        q = suave((u - (dur_e2 - .9)) / .9)  # caída dentro de la pupila
        if q > 0:
            fr = zoom(fr, 1 + 5 * q * q, PUPILA[0] * W, PUPILA[1] * H)
            fr = zoom_radial(fr, 1, PUPILA[0] * W, PUPILA[1] * H, .2 * q)
            fr = (fr * (1 - .9 * q)).astype(np.uint8)
        return fr
    S.append(Seg("ojo_parpadeo", dur_e2, f_ojo_parpadeo, bloom=.15))
    # 7. Del negro de la pupila nace el mapa con la pregunta que les hicimos
    S.append(Seg("mapa", 3.8 + MAPA_EXTRA, f_mapa(), tipo=None))
    # 8. De la luz a lo real: una línea recorre la silueta de Carlos y él aparece dentro
    S.append(Seg("luz_carlos", 1.5, f_luz_carlos(reales["carlos"]), tipo="real"))
    # 8. Carlos
    S.append(Seg("carlos", 6.8, lambda u: zoom(reales["carlos"].cuadro(min(u, 6.5)), 1 + .05 * suave((u - 6.3) / .5)), usu=("Carlos Quintana", "@carlosquintanamx", .4, ABAJO), tipo="real"))
    # 9–10. Mira arriba (latigazo hacia arriba) → Picacho → vuelo a Los Naranjos
    S.append(seg_clip("picacho", "W03_cielo_picacho.mp4", 1.7, ini=1.5, trans="whip-u",
                      rot=("Cerro El Picacho", "Tegucigalpa", 1.0)))  # 0,8–1,5 s: interior de carro (error de IA)
    S.append(seg_clip("naranjos", "W04_picacho_naranjos.mp4", 1.9, rot=("Los Naranjos", "Lago de Yojoa", 1.6)))
    # 11. Romeo (su voz entra 1 s antes de verlo)
    def f_romeo(u):
        if u < ROMEO_CORTE: return reales["romeo"].cuadro(1.0 + u)
        fr = reales["romeo"].cuadro(11.70 + (u - ROMEO_CORTE))
        k = (u - ROMEO_CORTE) / .35  # salto con empuje radial (aterriza en «tenemos pirámides»)
        return zoom_radial(fr, 1.18 - .14 * sale(k), fuerza=.14 * (1 - sale(k))) if k < 1 else zoom(fr, 1.04 - .03 * (u - ROMEO_CORTE - .35))
    S.append(Seg("romeo", ROMEO_CORTE + ROMEO_PIR, f_romeo, trans="giro", usu=("Romeo y Nando", "@romeo_and_nando_adventures", .3, ARRIBA), tipo="real"))
    # 12. Del río de Romeo al río de Samira (agua con agua)
    S.append(Seg("samira", SAMIRA_DUR, lambda u: reales["samira"].cuadro(1.55 + u), trans="whip-l", usu=("Samira.HN", "@samirafer_hn", .3, ARRIBA),
                 tipo="real"))
    # 13. Lo que ella nombra: el cenote (recreación) → bajo el agua
    S.append(seg_clip("cenote", "W05_rio_cenote.mp4", .52, ini=4.5, trans="zoom",  # en cámara lenta, bajo su voz
                      rot=("Cenote de San Luis Planes", "Santa Bárbara", .3)))
    # 14–16. Sale del agua en Utila → Lenyn → el arrecife → tiburón ballena
    S.append(seg_clip("utila", "W06_cenote_utila.mp4", 1.8, trans="whip-d", rot=("Utila", "Islas de la Bahía", 1.9)))
    S.append(Seg("lenyn", LENYN_DUR, lambda u: reales["lenyn"].cuadro(8.34 + u), trans="giro", usu=("Lenyn Reyes", "@lenynreye", .05, ABAJO),
                 tipo="real"))
    S.append(seg_clip("arrecife", "W07_utila_snorkel.mp4", 1.6, ini=1.5, fin=5.5, trans="whip-d"))
    S.append(seg_clip("ballena", str(HN / "v4/T06_tiburones_ballena.mp4"), 1.0, ini=2.0, fin=3.0, trans="fundido"))
    # 17–19. Sube al cielo → vuelo sobre los cafetales → Santa Bárbara → la casa con la tele (Leiva)
    S.append(seg_clip("utila_sb", "W08_utila_sb.mp4", 1.5, ini=3.0, trans="whip-u",
                      rot=("Santa Bárbara", "Occidente de Honduras", .9)))
    S.append(seg_clip("sb_casa", "W09_sb_casa.mp4", 1.8))
    S[-1].fn_crudo = S[-1].fn; S[-1].fn = tele_apagada(S[-1].fn)
    S.append(Seg("leiva_tv", LEIVA_DUR, f_leiva_tv(reales["leiva"], S[-1], LEIVA_SRC), usu=("Miguel Caballero Leiva", "@caballeroleiva", 2.4, ABAJO),
                 tipo=None))
    # 20–21. Gira hacia la ventana → la gente del pueblo → la guara al atardecer
    S.append(seg_clip("gente", "W10_casa_gente.mp4", 1.3, ini=1.6, trans="whip-l"))
    S.append(Seg("cierre", 6.59, f_cierre()))
    S.append(Seg("luz_final", 1.4, f_luz_final(), tipo=None))
    S.append(Seg("logo", 3.5, f_logo(), tipo=None))
    return S


def pregunta_grande(txt, ancho=900, tam=76):
    """La pregunta en dos líneas centradas, con sombra suave (texto por código, nunca generado)."""
    from PIL import ImageDraw
    f = fuente("Montserrat", tam, "ExtraBold")
    lineas_ = ha.envuelve(txt, f, ancho); lh = int(tam * 1.18)
    im = Image.new("RGBA", (ancho + 60, lh * len(lineas_) + 40), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for j, li in enumerate(lineas_):
        d.text(((im.width - f.getlength(li)) / 2, 20 + j * lh), li, font=f, fill=(255, 255, 255, 255))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); sh.putalpha(im.getchannel("A").filter(ImageFilter.GaussianBlur(10)))
    return Image.alpha_composite(sh, im)


def f_mapa():
    import json as _j
    poli = _j.load(open(HN / "honduras_contorno.json"))
    pts_poli = [np.array([xy(lo, la) for lo, la in p], np.float32) for p in poli]
    rng = np.random.default_rng(5)
    n = 5000
    # el polvo baja desde arriba (donde quedó el «PERO») y cada partícula se posa en un lugar
    p0 = np.stack([rng.uniform(140, 940, n), rng.uniform(-200, 600, n)], 1).astype(np.float32)
    destinos = np.array([xy(lo, la) for _, lo, la in LUGARES], np.float32)
    peso = np.array([3, 3, 2, 2, 3] + [1] * (len(LUGARES) - 5), np.float32); peso /= peso.sum()
    asig = rng.choice(len(LUGARES), n, p=peso)
    d = destinos[asig] + rng.normal(0, 4, (n, 2)).astype(np.float32)
    ret = rng.uniform(0, .5, n).astype(np.float32); giro = rng.uniform(-1, 1, n).astype(np.float32)
    teg = destinos[0]; X = MAPA_EXTRA
    preg1 = palabra("Le preguntamos a quienes la recorren:", 44, "SemiBold", (235, 225, 210), 1)
    preg2 = pregunta_grande("¿Cuál es tu lugar favorito de Honduras?")
    def fn(u):
        fr = np.zeros((H, W, 3), np.float32); fr[:] = (22, 12, 6)
        yy0 = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
        fr += (1 - np.abs(yy0 - .47) * 2) .clip(0, 1) * np.array([24, 14, 6], np.float32)  # halo cálido al centro
        capa = np.zeros((H, W), np.float32)
        # contorno que se dibuja
        k = suave(u / 1.4)
        for p in pts_poli:
            m = max(2, int(len(p) * k)); cv2.polylines(capa, [p[:m].astype(np.int32)], False, 1.0, 3, cv2.LINE_AA)
        # polvo
        e = np.clip((u - .2 - ret) / 1.8, 0, 1)[:, None]; e = e * e * (3 - 2 * e)
        q = p0 * (1 - e) + d * e + np.stack([giro * 60, -giro * 30], 1) * np.sin(np.pi * e)
        xi = np.clip(q[:, 0].astype(int), 0, W - 1); yi = np.clip(q[:, 1].astype(int), 0, H - 1)
        np.add.at(capa, (yi, xi), 1.3)
        # puntos encendidos y nombres de los testimonios
        for i, (nom, lo, la) in enumerate(LUGARES):
            x, y = destinos[i]; a = suave((u - 1.3 - .12 * i) / .4)
            if a > 0: cv2.circle(capa, (int(x), int(y)), 6 if nom else 4, 1.5 * a, -1)
        # la ruta del viaje (Tegucigalpa → Yojoa → San Luis Planes → Utila → Santa Bárbara) se dibuja
        ruta = destinos[[0, 1, 2, 4, 3]]; kr = suave((u - 1.5) / 1.3) * 4
        for j in range(4):
            fr_j = min(1, max(0, kr - j))
            if fr_j > 0:
                a0, a1 = ruta[j], ruta[j] + (ruta[j + 1] - ruta[j]) * fr_j
                cv2.line(capa, tuple(a0.astype(int)), tuple(a1.astype(int)), .9, 3, cv2.LINE_AA)
        glow = cv2.GaussianBlur(capa, (0, 0), 1.2) * 1.6 + cv2.GaussianBlur(capa, (0, 0), 10) * 2.6
        fr += np.clip(glow, 0, 2)[..., None] * np.array(ORO, np.float32)
        fr = np.clip(fr, 0, 255).astype(np.uint8)
        for i, (nom, lo, la) in enumerate(LUGARES[:5]):
            a = suave((u - 1.3 - .15 * i) / .35) * (1 - suave((u - 3.05 - X) / .3))
            if a > 0:
                x, y = destinos[i]; img = CACHE.setdefault(("map", nom), palabra(nom, 42, "Bold", (255, 240, 215), 2))
                dx = 0 if nom != "Santa Bárbara" else -40; dy = -34 if nom not in ("San Luis Planes",) else -30
                if nom == "Santa Bárbara": dy = 34
                fr = pega(fr, img, x + dx, y + dy, a)
        # la pregunta que les hicimos (texto por código)
        a = suave((u - .55) / .4) * (1 - suave((u - 3.75 - X) / .35))
        if a > 0:
            fr = pega(fr, preg1, 540, 250 - 14 * (1 - sale((u - .55) / .6)), a)
            a2 = suave((u - 1.0) / .45) * (1 - suave((u - 3.75 - X) / .35))
            fr = pega(fr, preg2, 540, 380 - 18 * (1 - sale((u - 1.0) / .6)), a2)
        # la cámara se lanza a Tegucigalpa
        z = 1 + 9 * suave((u - 3.1 - X) / 1.1) ** 2
        fr = zoom(fr, z, teg[0], teg[1])
        fr = zoom_radial(fr, 1, teg[0], teg[1], .25 * suave((u - 3.2 - X) / .6))
        # nace del negro de la pupila
        if u < .45: fr = (fr * suave(u / .45)).astype(np.uint8)
        return fr
    return fn


def contorno_luz(f, col=ORO):
    """Solo los contornos de la persona, como trazos finos de luz sobre negro."""
    g = cv2.cvtColor(cv2.bilateralFilter(f, 9, 60, 60), cv2.COLOR_BGR2GRAY).astype(np.float32)
    g = cv2.GaussianBlur(g, (0, 0), 2.2)
    m = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    m = np.clip((m - 22) / 45, 0, 1) ** 1.6
    glow = cv2.GaussianBlur(m, (0, 0), 6) * .9 + cv2.GaussianBlur(m, (0, 0), 1) * 1.2
    return np.clip(glow[..., None] * np.array(col, np.float32), 0, 255).astype(np.uint8)


def f_luz_carlos(real):
    f0 = real.cuadro(0.0)
    m = cv2.imread(str(HN / "p2/loc/carlos_mask.png"), cv2.IMREAD_GRAYSCALE)
    cs, _ = cv2.findContours((m > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)[:, 0, :].astype(np.float32)
    lejos = (c[:, 0] > 12) & (c[:, 0] < W - 12) & (c[:, 1] > 12) & (c[:, 1] < H - 12)
    c = c[lejos]  # solo la silueta real (pelo y hombros), no los bordes del cuadro
    mf = cv2.GaussianBlur((m > 127).astype(np.float32), (0, 0), 6)[..., None]
    rasgos = contorno_luz(f0)  # rasgos interiores, muy suaves
    def fn(u):
        capa = np.zeros((H, W), np.float32)
        k = sale(u / .75); n = max(2, int(len(c) * k))
        tramos, ini = [], 0  # se corta la línea donde la silueta toca el borde (saltos grandes)
        for j in range(1, n):
            if np.hypot(*(c[j] - c[j - 1])) > 30: tramos.append(c[ini:j]); ini = j
        tramos.append(c[ini:n])
        cv2.polylines(capa, [t_.astype(np.int32) for t_ in tramos if len(t_) > 1], False, 1.0, 4, cv2.LINE_AA)
        cab = c[n - 1].astype(int); cv2.circle(capa, tuple(cab), 9, 1.6 * (1 - suave((u - .7) / .2)), -1)  # la punta de luz
        glow = cv2.GaussianBlur(capa, (0, 0), 1.5) * 1.4 + cv2.GaussianBlur(capa, (0, 0), 12) * 2.4
        linea = np.clip(glow, 0, 2)[..., None] * np.array(ORO, np.float32)
        dentro = suave((u - .2) / .6)
        fr = f0.astype(np.float32) * mf * dentro + rasgos.astype(np.float32) * .35 * mf * (1 - dentro)
        fr = fr + f0.astype(np.float32) * (1 - mf) * suave((u - .5) / .6)  # el fondo del carro entra después
        fr = fr + linea * (1 - .6 * suave((u - 1.0) / .5))
        return np.clip(fr, 0, 255).astype(np.uint8)
    return fn


def pantalla_tv(fr):
    """Cuadrilátero de la pantalla blanca del televisor en el cuadro de la casa."""
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
    _, b = cv2.threshold(g, 225, 255, cv2.THRESH_BINARY)
    b[:, :W // 3] = 0  # la ventana (cielo brillante) está a la izquierda
    cs, _ = cv2.findContours(b, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    q = cv2.boxPoints(cv2.minAreaRect(c))
    s = q.sum(1); d = np.diff(q, axis=1)[:, 0]
    return np.float32([q[np.argmin(s)], q[np.argmin(d)], q[np.argmax(s)], q[np.argmax(d)]])  # tl, tr, br, bl


def tele_apagada(fn):
    """La pantalla del televisor sale blanca en el clip: se pinta apagada (gris oscuro) hasta que se enciende."""
    def g(u):
        fr = fn(u).copy()
        gr = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY); _, b = cv2.threshold(gr, 215, 255, cv2.THRESH_BINARY)
        b[:, :W // 3] = 0
        cs, _ = cv2.findContours(b, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cs:
            x, y, w, h = cv2.boundingRect(c)
            if cv2.contourArea(c) > 1500 and cv2.contourArea(c) > .75 * w * h and 1.3 < w / max(h, 1) < 2.2:
                m = np.zeros(gr.shape, np.uint8); cv2.drawContours(m, [c], -1, 255, -1)
                m = cv2.GaussianBlur(cv2.dilate(m, np.ones((5, 5), np.uint8)), (5, 5), 0)[..., None] / 255.
                apagada = np.full_like(fr, (22, 20, 18)); apagada[:, :] += np.uint8(6)
                fr = (fr * (1 - m) + apagada * m).astype(np.uint8)
        return fr
    return g


def f_leiva_tv(real, seg_casa, src0):
    base = seg_casa.fn(seg_casa.dur - 1 / FPS)
    quad = pantalla_tv(seg_casa.fn_crudo(seg_casa.dur - 1 / FPS))  # la pantalla blanca, antes de apagarla
    tvw, tvh = 640, 360
    src = np.float32([[0, 0], [tvw, 0], [tvw, tvh], [0, tvh]])
    M = cv2.getPerspectiveTransform(src, quad)
    tvc = quad.mean(0); ancho_tv = quad[:, 0].max() - quad[:, 0].min()
    z_lleno = W / ancho_tv * 1.15  # zoom con el que la tele llena el cuadro
    def color(f):
        f = grado(f, "real"); fh = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
        fh[..., 1] = (fh[..., 1] * .75).astype(np.uint8); return cv2.cvtColor(fh, cv2.COLOR_HSV2BGR)  # menos magenta del set
    def fn(u):
        # 0–1,3 s: la tele se enciende sin destello (la imagen se abre del centro) y lo vemos en el cuarto;
        # 1,3–2,4 s: la cámara entra a la pantalla; luego su video vertical llena el cuadro hasta «su gente»
        CORTE = 2.1
        if u >= CORTE:  # dentro de la tele: su video vertical, el empuje radial se disipa
            q = suave((u - CORTE) / .3); fr = color(real.cuadro(src0 + u))
            return zoom_radial(fr, 1 + .25 * (1 - q), fuerza=.2 * (1 - q)) if q < 1 else fr
        a_lleno = 0.0
        f = real.c.cuadro(src0 + u)  # 478x850: plano medio 16:9 de su cara y pecho
        f = color(cv2.resize(f[40:309], (tvw, tvh), interpolation=cv2.INTER_CUBIC))
        if u < .28:
            e = sale(u / .28); h = max(2, int(tvh * e)); g = np.full_like(f, 8)
            y0 = (tvh - h) // 2; g[y0:y0 + h] = cv2.resize(f, (tvw, h)); f = g
        f[::3] = (f[::3] * (.9 + .1 * a_lleno)).astype(np.uint8)  # líneas de televisor
        warp = cv2.warpPerspective(f, M, (W, H)); mask = cv2.warpPerspective(np.full((tvh, tvw), 255, np.uint8), M, (W, H))
        m = cv2.GaussianBlur(mask, (3, 3), 0)[..., None] / 255.
        fr = (base * (1 - m) + warp * m).astype(np.uint8)
        glow = cv2.GaussianBlur((warp * m).astype(np.uint8), (0, 0), 25)
        fr = cv2.add(fr, (glow * .35).astype(np.uint8))
        fr = zoom(fr, 1 + .12 * suave(u / 1.3) + (z_lleno - 1.12) * suave((u - 1.3) / 1.1) ** 2, tvc[0], tvc[1])
        q = suave((u - (CORTE - .3)) / .3)
        return zoom_radial(fr, 1, tvc[0], tvc[1], .22 * q) if q > 0 else fr
    return fn


def f_cierre():
    c = Clip(HN / "p2/W11_cierre.mp4")
    def fn(u):
        fr = a_vertical(c.cuadro(u))
        k = suave((u - 4.6) / 1.9)
        return fr if k <= 0 else cv2.addWeighted(fr, 1 - k, lineas(fr, ORO), k, 0)
    return fn


def f_luz_final():
    c = Clip(HN / "p2/W11_cierre.mp4"); ult = a_vertical(c.cuadro(c.n / c.fps)); li = lineas(ult, ORO)
    def fn(u):
        fr = zoom(li, 1 + .03 * u)
        return (fr * (1 - suave((u - .8) / .6))).astype(np.uint8)
    return fn


def f_logo():
    from honduras_mg import MG
    mg = MG(ha.FUENTES, HN / "honduras_contorno.json")
    logo = np.array(Image.open(HN / "logo_hs.jpg").convert("RGB"))
    return lambda u: np.ascontiguousarray(mg.logo(u, logo))


def tiempos(S):
    t, T = 0.0, {}
    for s in S: T[s.nombre] = t; t += s.dur
    return T, t


MEDIA = .22  # media duración de cada transición (s)


RAMPA = .4  # s de rampa a cada lado de un corte con transición
def rampa(s, u):
    """Rampa de velocidad: el dron acelera hacia el corte (hasta ~3x) y sale frenando. Solo en planos de IA."""
    if not s.rampa: return min(max(u, 0), s.dur - 1e-3)
    u = max(u, 0.0); v = u
    if s.sale_t and u > s.dur - RAMPA: v += 1.1 * RAMPA * ((u - s.dur + RAMPA) / RAMPA) ** 2
    if s.entra_t: x = min(u, RAMPA) / RAMPA; v += 1.1 * RAMPA * (1 - (1 - x) ** 2)
    return v


def cuadro_seg(s, u, t):
    fr = s.fn(rampa(s, u))
    if s.tipo: fr = grado(fr, s.tipo)
    if s.nombre not in ("mapa", "logo", "luz_final"): fr = acabar(fr, t, s.bloom)
    return fr


def render(S, sal, desde=0, hasta=None):
    global SUBS
    T, total = tiempos(S); hasta = min(hasta or total, total); SUBS = subtitulos(T)
    for i, sg in enumerate(S):  # qué cortes llevan transición (para la rampa de velocidad)
        sg.entra_t = bool(sg.trans and i > 0 and sg.trans != "fundido")
        sg.sale_t = bool(i + 1 < len(S) and S[i + 1].trans and S[i + 1].trans != "fundido")
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", str(sal)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for k in range(int(desde * FPS), int(hasta * FPS)):
        t = k / FPS
        i = max(j for j, s in enumerate(S) if T[s.nombre] <= t + 1e-9)
        s = S[i]; u = t - T[s.nombre]
        sig = S[i + 1] if i + 1 < len(S) else None
        fr = cuadro_seg(s, u, t)
        # transición de entrada (segunda mitad) y de salida hacia el siguiente (primera mitad)
        if s.trans and s.trans.startswith("whip") and u < MEDIA and i > 0:
            prev = S[i - 1]; fa = cuadro_seg(prev, prev.dur - 1e-3 + u, t)
            fr = whip_par(fa, fr, .5 + .5 * u / MEDIA, s.trans[-1])
        elif s.trans == "giro" and u < MEDIA and i > 0:
            prev = S[i - 1]; fr = giro(cuadro_seg(prev, prev.dur - 1e-3 + u, t), fr, .5 + .5 * u / MEDIA)
        elif s.trans and u < MEDIA:
            q = u / MEDIA
            if False: pass
            elif s.trans == "zoom": fr = zoom_radial(fr, 1 + .5 * (1 - q) ** 2, fuerza=.18 * (1 - q))
            elif s.trans == "fundido" and i > 0:
                prev = S[i - 1]; fp = cuadro_seg(prev, prev.dur - 1e-3, t)
                fr = cv2.addWeighted(fp, 1 - q, fr, q, 0)
        if sig and sig.trans and s.dur - u < MEDIA:
            q = 1 - (s.dur - u) / MEDIA
            if sig.trans.startswith("whip"): fr = whip_par(fr, cuadro_seg(sig, 0.0, t), .5 * q, sig.trans[-1])
            elif sig.trans == "giro": fr = giro(fr, cuadro_seg(sig, 0.0, t), .5 * q)
            elif sig.trans == "zoom": fr = zoom_radial(fr, 1 + 1.2 * q ** 2, fuerza=.22 * q)
        fr = capa_sub(fr, SUBS, t)
        if s.usu: fr = capa_usuario(fr, (s.usu[0], s.usu[1], s.usu[3]), u - s.usu[2], min(3.2, s.dur - s.usu[2] - .05))
        if s.rot: fr = capa_rotulo(fr, s.rot[0], s.rot[1], u - s.rot[2], 2.2)
        p.stdin.write(np.ascontiguousarray(fr).tobytes())
    p.stdin.close(); p.wait()
    return T, total


def mezcla(S, T, total, video, sal):
    """Cada grupo (voces, efectos, música, colchón) se mezcla en su propio ffmpeg a WAV y luego se juntan.
    Ojo: tras adelay hay que reiniciar los tiempos (asetpts) antes de atrim, o el corte cae antes de tiempo."""
    grupos = {"voz": [], "sfx": [], "mus": [], "col": []}
    def at(x): return int(max(0, x) * 1000)
    def add(f, t0, vol=1.0, ss=None, d=None, tipo="sfx", norm=False, fin=.3, extra=""):
        arg = (["-ss", f"{ss:.3f}"] if ss is not None else []) + (["-t", f"{d:.3f}"] if d is not None else []) + ["-i", str(f)]
        cad = "aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo" + extra
        if norm: cad += ",loudnorm=I=-15:TP=-1.5:LRA=7,aresample=48000"
        if d: cad += f",afade=t=out:st={max(0, d - fin):.2f}:d={fin}"
        cad += f",volume={vol},adelay={at(t0)}|{at(t0)}"
        grupos[tipo].append((arg, cad))
    p2, ap = HN / "p2", HN / "ap"
    add(p2 / "vo_lee_a.mp3", T["lee"] + .0, 1.0, tipo="voz", norm=True)
    add(p2 / "vo_colmillo_b.mp3", T["bueno"] - .05, 1.0, 1.2, 2.0, "voz", True, .1)
    v1, v2, v3 = T_VO(T)
    add(p2 / "vo_puente1_b.mp3", v1, 1.0, tipo="voz", norm=True)
    add(p2 / "vo_puente2_a.mp3", v2, 1.0, tipo="voz", norm=True)
    add(p2 / "vo_puente3_a.mp3", v3, 1.0, tipo="voz", norm=True)
    t_parp = T["ojo_parpadeo"] + PARPADEO
    add(p2 / "vo_cierre_b.mp3", T["cierre"] + .25, 1.0, tipo="voz", norm=True)
    for quien, t0, src, dur in TRAMOS(T):  # testimonios con su voz original (J-cuts)
        add(UP / REAL[quien], t0, 1.0, src, dur, "voz", True, .3)
    lista = [
            (ap / "sfx_nace.mp3", T["luz_guara"] + .2, .55, 0, 3),
            (ap / "sfx_pings_b.mp3", T["lee"] + .05, .7, 0, .6),
            (p2 / "sfx_scratch_a.mp3", T["replay"] - .05, .8),
            (p2 / "sfx_ting_a.mp3", T["bueno"] + 1.25, .8),
            (HN / "audio5/riser_boom.mp3", t_parp - 2.0, .6),
            (ap / "sfx_nace.mp3", t_parp + .05, .5, 0, 2.5),
            (HN / "audio5/estrellas.mp3", T["mapa"] + .4, .5, 0, 4), (ap / "sfx_nace.mp3", T["luz_carlos"], .5, 0, 1.8),
            (HN / "audio5/pinos.mp3", T["picacho"] + .5, .45, 0, 5),
            (p2 / "sfx_viento_humedal_a.mp3", T["naranjos"], .5, 0, 5),
            (p2 / "sfx_rio_a.mp3", T["cenote"], .45, 0, 3),
            (p2 / "sfx_superficie_a.mp3", T["utila"] + .3, .6, 0, 4.5),
            (HN / "audio5/olas_atardecer.mp3", T["arrecife"], .3, 0, 3.5),
            (p2 / "sfx_tv_a.mp3", T["leiva_tv"] + .05, .55, 0, 1.2),
            (p2 / "sfx_pueblo_a.mp3", T["gente"], .5, 0, 5),
            (HN / "audio5/final_swell.mp3", T["cierre"] + 2.0, .6, 0, 6), (HN / "audio2/sfx_logo.mp3", T["logo"] - .15, .9)]
    for j, sg in enumerate(S):
        if sg.trans and (sg.trans.startswith("whip") or sg.trans in ("zoom", "giro")):
            lista.append((p2 / ("sfx_whoosh_a.mp3" if j % 2 else "sfx_whoosh_b.mp3"), T[sg.nombre] - .3, .55))
    for f, t0, vol, *r in lista:
        add(f, t0, vol, *(r or [None, None]))
    # música: entra con el parpadeo (el «PERO» se deshace); su bajada para narrador (segundo 58) cae en la frase final
    t_m = t_parp
    tramo = T["cierre"] + .25 - t_m
    tempo = min(1.1, max(.85, 58.0 / tramo)); m_ini = max(0.0, 58.0 - tramo * tempo)
    add(p2 / "musica2_a.mp3", t_m, .62, m_ini, None, "mus",
        extra=f",atempo={tempo:.4f},afade=t=in:d=0.4,afade=t=out:st={total - t_m - 1.5:.2f}:d=1.5")
    # colchón grave antes de la ruptura (continúa el de la apertura)
    add(ap / "musica_b.mp3", 0, .55, 0, t_m + .5, "col", extra=f",asetrate=48000*0.84,aresample=48000,lowpass=f=900,"
        f"afade=t=out:st={t_m - .6:.2f}:d=0.8")
    tmp = Path(sal).with_suffix("")
    def stem(nombre):
        ent, fil = [], []
        for i, (arg, cad) in enumerate(grupos[nombre]):
            ent += arg; fil.append(f"[{i}:a]{cad}[x{i}]")
        n = len(grupos[nombre])
        fil.append("".join(f"[x{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0:duration=longest,"
                   f"apad=whole_dur={total},asetpts=N/SR/TB,atrim=0:{total}[o]")
        out = f"{tmp}_{nombre}.wav"
        r = subprocess.run(["ffmpeg", "-y", "-v", "error", *ent, "-filter_complex", ";".join(fil), "-map", "[o]",
                            "-c:a", "pcm_s16le", out], capture_output=True, text=True)
        if r.returncode: raise SystemExit(r.stderr[:2000])
        return out
    w = {k: stem(k) for k in grupos}
    g = (f"[1:a]asplit=2[v1][vsc];[3:a][vsc]sidechaincompress=threshold=0.04:ratio=5:attack=25:release=400[musd];"
         f"[v1][2:a][musd][4:a]amix=inputs=4:normalize=0:duration=longest,apad=whole_dur={total},asetpts=N/SR/TB,atrim=0:{total},"
         f"alimiter=limit=0.89,afade=t=out:st={total - .8:.2f}:d=0.8[a]")
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-i", w["voz"], "-i", w["sfx"], "-i", w["mus"],
                        "-i", w["col"], "-filter_complex", g, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac",
                        "-b:a", "256k", str(sal)], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[:2000])


def main():
    global HN
    ap = argparse.ArgumentParser()
    ap.add_argument("--hn"); ap.add_argument("--fuentes"); ap.add_argument("--apertura"); ap.add_argument("--sal")
    ap.add_argument("--desde", type=float, default=0); ap.add_argument("--hasta", type=float)
    ap.add_argument("--solo-plan", action="store_true"); ap.add_argument("--solo-mezcla", action="store_true")
    ap.add_argument("--une")
    a = ap.parse_args(); HN = Path(a.hn); ha.FUENTES = Path(a.fuentes); ha.DIR = HN / "ap"
    c = cv2.VideoCapture(a.apertura); c.set(1, int(c.get(7)) - 1); ok, bg = c.read()
    S = construir(bg); T, total = tiempos(S)
    for s in S: print(f"{s.nombre:11s} {T[s.nombre]:6.2f}  {s.dur:5.2f}")
    print(f"total {total:.2f}")
    if a.solo_plan: return
    sal = Path(a.sal); mudo = sal.with_suffix(".mudo.mp4")
    if not a.solo_mezcla:
        render(S, mudo, a.desde, a.hasta)
    if a.desde == 0 and not a.hasta:
        mezcla(S, T, total, mudo, sal)
        if a.une:
            lista = sal.with_suffix(".txt"); lista.write_text(f"file '{Path(a.apertura).resolve()}'\nfile '{sal.resolve()}'\n")
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lista),
                            "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", a.une], check=True)
    else:
        mudo.rename(sal)


if __name__ == "__main__":
    main()
