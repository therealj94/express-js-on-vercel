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
from hs2_apertura import (W, H, FPS, Clip, a_vertical, acabado, lineas, palabra, pega, suave, sale, tarjeta,
                          rotulo, punto, fuente)

UP = Path("/root/.claude/uploads/2611f717-6182-5311-8e6b-eee5393945e0")
REAL = {"carlos": "af89be14-copy_97417FB3-3353-4FE3-BBD3-6C8D6AC9A2DC_1.mp4", "romeo": "2990b56a-IMG_6044.mov",
        "samira": "37537b71-IMG_7392.mov", "lenyn": "8bc03e38-IMG_5166.MOV",
        "leiva": "ca51f74f-VIDEO-2026-10-02-16-51-40.mp4"}
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
    luz = max(0.0, 1 - abs(p - .5) * 6)
    return cv2.addWeighted(out, 1, np.full_like(out, 255), .10 * luz, 0) if luz > 0 else out


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


def capa_usuario(fr, handle, u, dur=2.6):
    """El usuario se escribe de izquierda a derecha con luz y se borra igual."""
    if u < 0 or u > dur: return fr
    im = usuario(handle); arr = np.array(im); x = np.arange(im.width, dtype=np.float32)[None, :]
    m = np.clip((im.width * sale(u / .7) - x) / 40, 0, 1)
    s = suave((u - dur + .6) / .6)
    if s > 0: m = m * np.clip((x - im.width * s) / 40 + 1, 0, 1)
    arr[..., 3] = (arr[..., 3] * m).astype(np.uint8)
    return pega(fr, Image.fromarray(arr), 540, 230)


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
    out += [("Siempre vamos a encontrar algo malo…", v1, v1 + 2.75), ("si es lo único que buscamos.", v1 + 2.85, v1 + 4.5),
            ("Pero…", v2, v2 + .85), ("¿y si empezamos a ver Honduras", v2 + .9, v2 + 2.6),
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
    return [("carlos", T["carlos"], 0.0, 6.5), ("romeo", T["romeo"] - 1.0, 0.0, 6.6),
            ("romeo", T["romeo"] + 5.6, 11.70, 1.05), ("samira", T["samira"] - 1.0, 1.35, 5.0),
            ("lenyn", T["lenyn"] - 2.24, 6.1, 7.9), ("leiva", T["leiva_tv"] - 3.3, 0.0, 8.6)]


GUARA_SUBS = ("¿Una guacamaya con colmillos?", "¿Yo?", "Bueno…", "uno.", "Siempre vamos a encontrar algo malo…",
              "si es lo único que buscamos.", "Pero…", "¿y si empezamos a ver Honduras", "con otros ojos?")


def capa_sub(fr, subs, ts):
    for txt, s, e in subs:
        if s - .05 <= ts <= e + .25:
            img = CACHE.get(("sub", txt))
            if img is None:
                img = palabra(txt, 60, "Bold", (255, 255, 255), 1)
                sh = Image.new("RGBA", img.size, (0, 0, 0, 0)); sh.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(6)))
                img = Image.alpha_composite(sh, img); CACHE[("sub", txt)] = img
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
    "whip-l/r/u/d" (latigazo en esa dirección), "zoom" (empuje radial) o "fundido"."""
    def __init__(self, nombre, dur, fn, trans=None, rot=None, usu=None, tipo="ia", bloom=0.0):
        self.nombre, self.dur, self.fn, self.trans = nombre, dur, fn, trans
        self.rot, self.usu, self.tipo, self.bloom = rot, usu, tipo, bloom


def seg_clip(nombre, archivo, vel, ini=0.0, fin=None, **kw):
    c = Clip(HN / "p2" / archivo) if not str(archivo).startswith("/") else Clip(archivo)
    fin = fin if fin is not None else c.n / c.fps
    def fn(u):
        ts = ini + u * vel
        f = c.cuadro(ts)
        return a_vertical(f)
    return Seg(nombre, (fin - ini) / vel, fn, **kw)


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


VEL_OJO1, VEL_OJO2 = 1.15, 1.3   # velocidad de los clips del ojo
PARPADEO = 1.0                   # s de salida en que el párpado cierra (medido en E2)
PUPILA = (.5, .45)               # centro de la pupila al final de E2 (proporción del cuadro)
MAPA_EXTRA = 1.2                 # el mapa se sostiene más para leer la pregunta


def construir(bg_final):
    reales = {k: Real(k) for k in REAL}
    S = []
    pero = palabra("PERO", 230, "Black")
    pero_frio = palabra("PERO", 230, "Black", (215, 228, 255))

    # 1. Fin de la historia: la guacamaya de luz aterriza frente a la gente y se vuelve la guara de HS.
    #    El «PERO» sube y queda flotando arriba.
    w01 = Clip(HN / "p2/W01_luz_guara.mp4")
    def f_luz_guara(u):
        fr = a_vertical(w01.cuadro(u * 1.9))
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
        f = l02.cuadro(u).astype(np.float32)
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
        fr = a_vertical(e1.cuadro(u * VEL_OJO1))
        k = suave((u - .8) / .9)
        return pega(fr, pero_frio, 540, 330 + 10 * u, .42 * k, .62 + .015 * u)
    S.append(Seg("ojo_entra", e1.n / e1.fps / VEL_OJO1, f_ojo_entra, trans="fundido", bloom=.1))
    # 6. Parpadea: el «PERO» se deshace en polvo y el reflejo cambia a la Honduras que no miramos.
    #    Al final la cámara cae dentro de la pupila y de su negro nace el mapa.
    e2 = Clip(HN / "p2/E2_ojo_parpadeo.mp4")
    polvo_pero = ha.Polvo(pero_frio, 540, 380, 6000, 21, deriva=(0, -380))
    dur_e2 = e2.n / e2.fps / VEL_OJO2
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
    S.append(Seg("carlos", 6.5, lambda u: reales["carlos"].cuadro(u), usu=("@carlosquintanamx", .4), tipo="real"))
    # 9–10. Mira arriba (latigazo hacia arriba) → Picacho → vuelo a Los Naranjos
    S.append(seg_clip("picacho", "W03_cielo_picacho.mp4", 1.7, trans="whip-u", rot=("Cerro El Picacho", "Tegucigalpa", 2.1)))
    S.append(seg_clip("naranjos", "W04_picacho_naranjos.mp4", 1.9, rot=("Los Naranjos", "Lago de Yojoa", 1.6)))
    # 11. Romeo (su voz entra 1 s antes de verlo)
    def f_romeo(u):
        if u < 5.6: return reales["romeo"].cuadro(1.0 + u)
        fr = reales["romeo"].cuadro(11.70 + (u - 5.6))
        return zoom(fr, 1.12 - .08 * sale((u - 5.6) / .4))  # salto con empuje, no con destello
    S.append(Seg("romeo", 5.6 + 1.05, f_romeo, trans="whip-l", usu=("@romeo_and_nando_adventures", .3), tipo="real"))
    # 12. Del río de Romeo al río de Samira (agua con agua)
    S.append(Seg("samira", 4.0, lambda u: reales["samira"].cuadro(2.35 + u), trans="whip-l", usu=("@samirafer_hn", .3),
                 tipo="real"))
    # 13. Lo que ella nombra: el cenote (recreación) → bajo el agua
    S.append(seg_clip("cenote", "W05_rio_cenote.mp4", 1.0, ini=4.5, trans="zoom",
                      rot=("Cenote de San Luis Planes", "Santa Bárbara", .3)))
    # 14–16. Sale del agua en Utila → Lenyn → el arrecife → tiburón ballena
    S.append(seg_clip("utila", "W06_cenote_utila.mp4", 1.8, trans="whip-d", rot=("Utila", "Islas de la Bahía", 1.9)))
    S.append(Seg("lenyn", 2.16, lambda u: reales["lenyn"].cuadro(8.34 + u), trans="whip-r", usu=("@lenynreye", .1),
                 tipo="real"))
    S.append(seg_clip("arrecife", "W07_utila_snorkel.mp4", 1.6, ini=1.5, fin=5.5, trans="whip-d"))
    S.append(seg_clip("ballena", str(HN / "v4/T06_tiburones_ballena.mp4"), 1.0, ini=2.0, fin=3.0, trans="fundido"))
    # 17–19. Sube al cielo → vuelo sobre los cafetales → Santa Bárbara → la casa con la tele (Leiva)
    S.append(seg_clip("utila_sb", "W08_utila_sb.mp4", 1.5, ini=3.0, trans="whip-u",
                      rot=("Santa Bárbara", "Occidente de Honduras", .9)))
    S.append(seg_clip("sb_casa", "W09_sb_casa.mp4", 1.8))
    S.append(Seg("leiva_tv", 3.7, f_leiva_tv(reales["leiva"], S[-1], 3.3), usu=("@caballeroleiva", .5), tipo=None))
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


def f_leiva_tv(real, seg_casa, src0):
    base = seg_casa.fn(seg_casa.dur - 1 / FPS)
    quad = pantalla_tv(base)
    tvw, tvh = 640, 360
    src = np.float32([[0, 0], [tvw, 0], [tvw, tvh], [0, tvh]])
    M = cv2.getPerspectiveTransform(src, quad)
    tvc = quad.mean(0)
    def fn(u):
        f = real.c.cuadro(src0 + u)  # 478x850: plano medio 16:9 de su cara y pecho
        f = cv2.resize(f[40:309], (tvw, tvh), interpolation=cv2.INTER_CUBIC)
        f = grado(f, "real"); fh = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
        fh[..., 1] = (fh[..., 1] * .75).astype(np.uint8); f = cv2.cvtColor(fh, cv2.COLOR_HSV2BGR)  # menos magenta del set
        # encendido de televisor: negro → línea blanca → la imagen se abre en vertical
        if u < .12: f = np.full_like(f, 8)
        elif u < .4:
            e = sale((u - .12) / .28); h = max(2, int(tvh * e)); g = np.full_like(f, 8)
            y0 = (tvh - h) // 2; g[y0:y0 + h] = cv2.resize(f, (tvw, h)); f = cv2.addWeighted(g, 1, np.full_like(g, 255), .5 * (1 - e), 0)
        f[::3] = (f[::3] * .9).astype(np.uint8)  # líneas de televisor
        warp = cv2.warpPerspective(f, M, (W, H)); mask = cv2.warpPerspective(np.full((tvh, tvw), 255, np.uint8), M, (W, H))
        m = cv2.GaussianBlur(mask, (3, 3), 0)[..., None] / 255.
        fr = (base * (1 - m) + warp * m).astype(np.uint8)
        glow = cv2.GaussianBlur((warp * m).astype(np.uint8), (0, 0), 25)
        fr = cv2.add(fr, (glow * .35).astype(np.uint8))
        return zoom(fr, 1 + .28 * suave(u / 3.7), tvc[0], tvc[1])
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


def cuadro_seg(s, u, t):
    fr = s.fn(min(max(u, 0), s.dur - 1e-3))
    if s.tipo: fr = grado(fr, s.tipo)
    if s.nombre not in ("mapa", "logo", "luz_final"): fr = acabar(fr, t, s.bloom)
    return fr


def render(S, sal, desde=0, hasta=None):
    global SUBS
    T, total = tiempos(S); hasta = min(hasta or total, total); SUBS = subtitulos(T)
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
            prev = S[i - 1]; fa = cuadro_seg(prev, prev.dur - 1e-3, t)
            fr = whip_par(fa, fr, .5 + .5 * u / MEDIA, s.trans[-1])
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
            elif sig.trans == "zoom": fr = zoom_radial(fr, 1 + 1.2 * q ** 2, fuerza=.22 * q)
        fr = capa_sub(fr, SUBS, t)
        if s.usu: fr = capa_usuario(fr, s.usu[0], u - s.usu[1])
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
        add(UP / REAL[quien], t0, 1.0, src, dur, "voz", True, .15)
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
        if sg.trans and (sg.trans.startswith("whip") or sg.trans == "zoom"):
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
