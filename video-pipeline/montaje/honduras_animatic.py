"""Animatic (y montaje final con --clips) de «Honduras Secreta — Déjame demostrarte» con fotos fijas + voz + música + transiciones.

Sirve para aprobar ritmo, orden y transiciones antes de generar los clips MiniMax H3.
Cada plano: Ken Burns con rampa de velocidad; cada corte: transición tipo Sam Kolder
(whip, zoom, spin, caída/salida de agua, flash). Cortes ajustados al compás de la música.

    python3 montaje/honduras_animatic.py --dir HN --fuentes FUENTES --logo logo.jpg --sal salida.mp4
"""
import argparse, json, math, subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
VOZ_OFF = 0.5            # la voz arranca a 0,5 s
DROP, BEAT = 7.5, 0.536  # golpe de la música en el vídeo y duración de un tiempo (112 BPM)
MUS_INI = 17.08 - DROP   # segundo de musica_b.mp3 que suena en t=0

# (imagen, inicio, zoom0, zoom1, centro0, centro1, giro0, giro1) — centros normalizados sobre la imagen
PLANOS = [
    ("H01_movil",           0.00, 1.00, 1.18, (.50, .55), (.42, .45)),
    ("H01_movil",           2.70, 1.75, 2.05, (.42, .38), (.42, .30)),   # punch-in a la pantalla, «scroll»
    ("GU1_hook_a",          4.70, 1.12, 1.00, (.50, .42), (.50, .50)),
    ("R01_westbay",         7.50, 1.45, 1.00, (.55, .50), (.50, .50)),   # picada de dron
    ("R02_overunder",       9.11, 1.00, 1.15, (.50, .40), (.50, .62)),
    ("R03_tiburones",      11.79, 1.00, 1.22, (.45, .55), (.38, .62)),   # tiburón hacia cámara (lento)
    ("U01_tiburon_ballena", 13.39, 1.05, 1.18, (.55, .50), (.45, .52)),
    ("C01_cangrejal",      14.72, 1.30, 1.05, (.50, .62), (.50, .55)),
    ("P01_pulhapanzak",    16.83, 1.00, 1.20, (.50, .70), (.50, .45)),
    ("CP01_copan_plaza",   19.18, 1.10, 1.00, (.55, .45), (.50, .55)),
    ("CP02_escalinata",    21.00, 1.00, 1.25, (.50, .75), (.50, .35)),   # tilt hacia arriba
    ("G01_garifuna_tela",  23.40, 1.20, 1.00, (.55, .60), (.50, .55)),
    ("L01_lenca",          26.36, 1.00, 1.30, (.45, .60), (.40, .70)),
    ("Y01_pescado_yojoa",  29.58, 1.30, 1.05, (.50, .70), (.50, .65)),   # entra girando
    ("B01_baleada",        31.72, 1.00, 1.25, (.45, .60), (.40, .68)),
    ("M01_cafe_marcala",   33.33, 1.00, 1.15, (.50, .60), (.50, .50)),
    ("M01_cafe_marcala",   35.47, 1.60, 1.80, (.42, .78), (.42, .72)),   # la taza
    ("MQ01_mosquitia",     37.40, 1.00, 1.15, (.50, .40), (.50, .55)),
    ("MQ01_mosquitia",     39.50, 1.70, 1.45, (.35, .80), (.40, .75)),   # la guara del Río Plátano
    ("F01_viajera",        41.30, 1.20, 1.00, (.45, .60), (.50, .50)),
    ("GU2_cierre_b",       45.00, 1.15, 1.00, (.50, .40), (.50, .45)),
    ("LOGO",               48.40, 1.00, 1.00, (.5, .5), (.5, .5)),
]
FIN = 53.4

# transición que ENTRA a cada plano (índice) y su duración
TRANS = {
    1: ("zoom", .30), 2: ("whip", .34), 3: ("zoom", .45), 4: ("baja", .34), 5: ("mix", .30),
    6: ("mix", .40), 7: ("sube", .34), 8: ("whip", .32), 9: ("flash", .55), 10: ("zoom", .32),
    11: ("whip", .32), 12: ("flash", .20), 13: ("spin", .50), 14: ("whip", .32), 15: ("mix", .45),
    16: ("zoom", .30), 17: ("sube", .34), 18: ("zoom", .35), 19: ("flash", .60), 20: ("whip", .34),
    21: ("mix", .70),
}

ROTULOS = [  # (inicio, fin, título, subtítulo, coordenadas)
    (7.7, 9.0, "ROATÁN", "Islas de la Bahía", "16.3°N  86.6°W"),
    (11.9, 13.3, "CARA A CARA", "Roatán · buceo con tiburones", ""),
    (13.5, 14.6, "UTILA", "tiburón ballena", "16.1°N  86.9°W"),
    (14.9, 16.7, "RÍO CANGREJAL", "La Ceiba · rápidos clase IV", "15.7°N  86.7°W"),
    (17.0, 19.0, "PULHAPANZAK", "Cortés · 43 metros", "15.0°N  88.0°W"),
    (19.4, 23.2, "COPÁN RUINAS", "Patrimonio de la Humanidad", "14.8°N  89.1°W"),
    (23.6, 26.2, "TRIUNFO DE LA CRUZ", "Tela · cultura garífuna", "15.8°N  87.4°W"),
    (26.6, 29.4, "LA CAMPA", "Lempira · cerámica lenca", "14.5°N  88.6°W"),
    (29.8, 31.6, "LAGO DE YOJOA", "pescado frito", "14.9°N  88.0°W"),
    (31.9, 33.2, "BALEADA", "sabor catracho", ""),
    (33.5, 37.2, "MARCALA", "La Paz · café de altura", "14.2°N  88.0°W"),
    (37.6, 41.1, "LA MOSQUITIA", "Biosfera del Río Plátano", "15.7°N  85.0°W"),
]

SUBS = [("Mientras en otros países", 0.0), ("te quieren convencer", 1.2), ("de que lo suyo es más bonito…", 2.3),
        ("déjame demostrarte", 4.4), ("lo que es bonito.", 5.8), ("Aquí el mar es parte", 7.2),
        ("del segundo arrecife", 8.5), ("más grande del mundo…", 9.5), ("y los tiburones", 10.7),
        ("son de verdad.", 11.7), ("Salimos del agua…", 13.1), ("y el río te sacude el alma.", 14.3),
        ("Cascadas de 43 metros.", 16.2), ("En Copán, las guaras vuelan", 18.6), ("sobre la escritura maya", 20.2),
        ("más larga que existe.", 21.4), ("En Tela, el tambor garífuna", 23.0), ("te mueve los pies.", 24.7),
        ("En La Campa, manos lencas", 25.7), ("hacen arte sin torno.", 27.6), ("Pescado frito en el Lago de Yojoa…", 29.2),
        ("una baleada recién hecha…", 31.2), ("y el café de Marcala,", 32.6), ("la primera denominación de origen", 34.2),
        ("de Centroamérica.", 35.8), ("En La Mosquitia,", 36.9), ("uno de los últimos bosques", 37.9),
        ("lluviosos de Centroamérica.", 39.2), ("Y esto es solo lo que", 41.0), ("te puedo enseñar en un minuto.", 42.4),
        ("Honduras…", 44.6), ("es más de lo que imaginas.", 45.1)]
SUBS_FIN = 47.4


# Montaje con clips: (segundo de inicio dentro del clip, velocidad) por plano y movimientos de cámara suaves,
# porque el clip ya trae su propio movimiento y el 768p no aguanta zooms fuertes.
# Elegidos mirando cada clip: la mejor parte de cada toma (p. ej. el tiburón pasa pegado a cámara entre 1,6 y 3,2 s,
# la niebla de Pulhapanzak llena el cuadro al final, las guaras de Copán cruzan después de 3 s).
CLIP_SS = {1: (2.7, 1.0), 2: (0.5, 1.0), 3: (2.5, 1.5), 4: (1.5, 1.3), 5: (1.6, 1.0), 6: (3.8, 1.4),
           7: (0.8, 1.0), 8: (3.6, 1.2), 9: (3.0, 1.2), 11: (1.0, 1.0), 12: (0.5, 1.0), 13: (1.0, 1.0),
           14: (1.0, 1.0), 16: (2.14, 1.0), 18: (2.1, 1.0), 19: (0.5, 1.0)}
CLIP_MOV = {1: (1.25, 1.35, (.42, .40), (.42, .34))}


def usa_clips(carpeta):
    for i, pl in enumerate(PLANOS):
        if pl[0] == "LOGO": continue
        z0, z1, c0, c1 = CLIP_MOV.get(i, (1.0, 1.06, (.5, .5), (.5, .5)))
        PLANOS[i] = (pl[0], pl[1], z0, z1, c0, c1)


def suave(p):
    p = min(1, max(0, p)); return p * p * (3 - 2 * p)


def rampa(p):  # arranca rápido y frena: rampa de velocidad tipo Kolder
    p = min(1, max(0, p)); return 1 - (1 - p) ** 2.4


class Fuente:
    def __init__(self, img):
        self.img = img; self.h, self.w = img.shape[:2]

    def pon_t(self, tl):  # las fotos no dependen del tiempo
        pass

    def render(self, z, c, rot=0.0, extra=1.0, dx=0.0, dy=0.0):
        s = W / self.w * z * extra
        zz = z * extra
        cx = min(max(c[0], .5 / zz), 1 - .5 / zz) if zz >= 1 else .5
        cy = min(max(c[1], .5 / zz), 1 - .5 / zz) if zz >= 1 else .5
        M = cv2.getRotationMatrix2D((cx * self.w, cy * self.h), rot, s)
        M[0, 2] += W / 2 - cx * self.w + dx
        M[1, 2] += H / 2 - cy * self.h + dy
        return cv2.warpAffine(self.img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


class VideoFuente(Fuente):
    """Clip MiniMax: devuelve el cuadro del instante local del plano (ss + tl*vel), leyendo hacia adelante."""
    def __init__(self, ruta, ss=0.0, vel=1.0):
        self.ruta, self.ss, self.vel = str(ruta), ss, vel
        self.cap = cv2.VideoCapture(self.ruta)
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 24
        self.n = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.idx, self.img = -1, None
        self.pon_t(0)

    def pon_t(self, tl):
        k = int(min(self.n - 1, max(0, round((self.ss + tl * self.vel) * self.fps))))
        if k == self.idx: return
        if k < self.idx or k > self.idx + 30:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, k); self.idx = k - 1
        while self.idx < k:
            ok, fr = self.cap.read()
            if not ok: break
            self.idx += 1; self.img = fr
        self.h, self.w = self.img.shape[:2]


def carga(dirref, nombre, logo):
    if nombre == "LOGO":
        lienzo = np.zeros((2048, 1152, 3), np.uint8); lienzo[:] = (12, 10, 9)
        return lienzo
    return cv2.imread(str(dirref / f"{nombre}.png"))


def plano_frame(i, t, fuentes, extra=1.0, rot=0.0, dx=0.0, dy=0.0):
    nombre, t0, z0, z1, c0, c1 = PLANOS[i]
    t1 = PLANOS[i + 1][1] if i + 1 < len(PLANOS) else FIN
    p = rampa((t - t0) / max(.01, t1 - t0))
    z = z0 + (z1 - z0) * p
    c = (c0[0] + (c1[0] - c0[0]) * p, c0[1] + (c1[1] - c0[1]) * p)
    fuentes[i].pon_t(t - t0)
    return fuentes[i].render(z, c, rot, extra, dx, dy)


def desenfoque(img, kx, ky):
    kx, ky = max(1, int(kx)) | 1, max(1, int(ky)) | 1
    return cv2.blur(img, (kx, ky)) if kx > 1 or ky > 1 else img


def transicion(tipo, p, i, t, fu):
    e = suave(p); b = math.sin(math.pi * p)
    if tipo in ("whip", "baja", "sube"):
        horiz = tipo == "whip"
        sgn = -1 if tipo == "sube" else 1
        off = e * (W if horiz else H)
        a = plano_frame(i - 1, t, fu, dx=-off if horiz else 0, dy=0 if horiz else -sgn * off)
        bb = plano_frame(i, t, fu, dx=(W - off) if horiz else 0, dy=0 if horiz else sgn * (H - off))
        lim = int(off)
        out = a.copy()
        if lim > 0:
            if horiz: out[:, W - lim:] = bb[:, W - lim:]
            elif sgn > 0: out[H - lim:, :] = bb[H - lim:, :]
            else: out[:lim, :] = bb[:lim, :]
        k = 170 * b * b
        out = desenfoque(out, k if horiz else 1, 1 if horiz else k)
        if tipo == "sube": out = cv2.addWeighted(out, 1 - .3 * b, np.full_like(out, 255), .3 * b, 0)
        return out
    if tipo in ("zoom", "spin"):
        giro = 70 if tipo == "spin" else 0
        if p < .5:
            q = p / .5; img = plano_frame(i - 1, t, fu, extra=1 + 1.2 * q * q, rot=-giro * q * q)
        else:
            q = (1 - p) / .5; img = plano_frame(i, t, fu, extra=1 + .8 * q * q, rot=giro * q * q)
        k = 60 * b
        return cv2.GaussianBlur(img, (0, 0), max(.1, k / 6)) if k > 2 else img
    a = plano_frame(i - 1, t, fu); bb = plano_frame(i, t, fu)
    out = cv2.addWeighted(a, 1 - e, bb, e, 0)
    if tipo == "flash":
        out = cv2.addWeighted(out, 1 - .8 * b, np.full_like(out, 255), .8 * b, 0)
    return out


# ---------- gráficos ----------
def rotulo_png(tit, sub, coord, F):
    im = Image.new("RGBA", (W, 260), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x = 72
    for k in range(3):  # líneas finas como las letras del logo
        d.line([(x, 40 + k * 7), (x + 120, 40 + k * 7)], fill=(255, 255, 255, 230), width=2)
    sombra = Image.new("RGBA", im.size, (0, 0, 0, 0)); ds = ImageDraw.Draw(sombra)
    for dd, txt, f, y in ((ds, tit, F["tit"], 70), (ds, sub, F["sub"], 150)):
        dd.text((x + 3, y + 3), txt, font=f, fill=(0, 0, 0, 170))
    if coord: ds.text((x + 3, 203), coord, font=F["mono"], fill=(0, 0, 0, 170))
    sombra = sombra.filter(ImageFilter.GaussianBlur(6))
    im = Image.alpha_composite(sombra, im); d = ImageDraw.Draw(im)
    d.text((x, 70), tit, font=F["tit"], fill=(255, 255, 255, 255))
    d.text((x, 150), sub, font=F["sub"], fill=(255, 236, 200, 255))
    if coord: d.text((x, 200), coord, font=F["mono"], fill=(255, 200, 90, 255))
    return np.array(im)


def sub_png(txt, F):
    im = Image.new("RGBA", (W, 200), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = F["subs"]; lineas, cur = [], ""
    for w in txt.split():
        if d.textlength((cur + " " + w).strip(), font=f) > 900: lineas.append(cur); cur = w
        else: cur = (cur + " " + w).strip()
    lineas.append(cur)
    sombra = Image.new("RGBA", im.size, (0, 0, 0, 0)); ds = ImageDraw.Draw(sombra)
    for k, l in enumerate(lineas):
        y = 20 + k * 68; x = (W - d.textlength(l, font=f)) / 2
        ds.text((x, y + 3), l, font=f, fill=(0, 0, 0, 200))
    sombra = sombra.filter(ImageFilter.GaussianBlur(5)); im = Image.alpha_composite(sombra, im); d = ImageDraw.Draw(im)
    for k, l in enumerate(lineas):
        y = 20 + k * 68; x = (W - d.textlength(l, font=f)) / 2
        d.text((x, y), l, font=f, fill=(255, 255, 255, 255))
    return np.array(im)


def pega(frame, rgba, y, alpha=1.0, revela=1.0):
    h, w = rgba.shape[:2]; reg = frame[y:y + h, :w]
    a = rgba[:, :, 3:4].astype(np.float32) / 255 * alpha
    if revela < 1:
        m = np.zeros((1, w, 1), np.float32); m[:, :int(w * revela)] = 1; a = a * m
    col = rgba[:, :, 2::-1].astype(np.float32)
    reg[:] = (reg * (1 - a) + col * a).astype(np.uint8)


def logo_frame(t, logo_bgr, F):
    fr = np.zeros((H, W, 3), np.uint8); fr[:] = (12, 10, 9)
    p = (t - PLANOS[-1][1]) / 1.2
    lh, lw = logo_bgr.shape[:2]; s = 1000 / lw * (1.06 - .06 * suave(p))
    lg = cv2.resize(logo_bgr, (int(lw * s), int(lh * s)), interpolation=cv2.INTER_AREA)
    y = (H - lg.shape[0]) // 2 - 60; x = (W - lg.shape[1]) // 2
    ancho = int(lg.shape[1] * suave(p))
    if ancho > 0:
        reg = fr[y:y + lg.shape[0], x:x + ancho]
        fr[y:y + lg.shape[0], x:x + ancho] = np.maximum(reg, lg[:, :ancho])
    return fr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True); ap.add_argument("--fuentes", required=True)
    ap.add_argument("--logo", required=True); ap.add_argument("--sal", required=True)
    ap.add_argument("--clips", help="carpeta con los clips MiniMax (H01.mp4…); sin ella usa las fotos")
    a = ap.parse_args()
    if a.clips: usa_clips(Path(a.clips))
    D = Path(a.dir); FU = Path(a.fuentes)
    F = {"tit": ImageFont.truetype(str(FU / "Manrope.ttf"), 64), "sub": ImageFont.truetype(str(FU / "ManropeMedium.ttf"), 38),
         "mono": ImageFont.truetype(str(FU / "JetBrainsMono.ttf"), 30), "subs": ImageFont.truetype(str(FU / "ManropeMedium.ttf"), 54)}
    try: F["tit"].set_variation_by_name("ExtraBold")
    except Exception: pass
    logo = cv2.imread(a.logo)
    fu = []
    for i, (n, *_) in enumerate(PLANOS):
        clip = Path(a.clips) / f"{n.split('_')[0]}.mp4" if a.clips else None
        if clip and clip.exists():
            ss, vel = CLIP_SS.get(i, (0.0, 1.0)); fu.append(VideoFuente(clip, ss, vel))
        else:
            fu.append(Fuente(carga(D / "ref", n, logo)))
    rot = [rotulo_png(*r[2:], F) for r in ROTULOS]
    subs = [sub_png(s, F) for s, _ in SUBS]

    # grade: curva cálida + viñeta + grano
    x = np.arange(256) / 255
    lut = [np.clip(255 * (x + .06 * np.sin(2 * np.pi * x) * k), 0, 255).astype(np.uint8) for k in (.4, .7, 1.0)]  # B,G,R
    lut[0] = np.clip(lut[0].astype(int) - (x * 12).astype(int) + 6, 0, 255).astype(np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]; v = ((xx - W / 2) / (W * .75)) ** 2 + ((yy - H / 2) / (H * .7)) ** 2
    vin = (1 - .38 * np.clip(v, 0, 1))[..., None].astype(np.float32)
    rng = np.random.default_rng(7); granos = [rng.normal(0, 3, (H, W, 1)).astype(np.int16) for _ in range(6)]

    tmp = Path(a.sal).with_suffix(".mudo.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
                           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "21",
                           "-pix_fmt", "yuv420p", str(tmp)], stdin=subprocess.PIPE)
    n = int(FIN * FPS)
    for k in range(n):
        t = k / FPS
        i = max(j for j, pl in enumerate(PLANOS) if pl[1] <= t)
        fr = None
        for j in (i, i + 1):  # transición centrada en el corte del plano j
            if j in TRANS and j < len(PLANOS):
                tipo, d = TRANS[j]; c = PLANOS[j][1]
                if c - d / 2 <= t < c + d / 2 and PLANOS[j][0] != "LOGO":
                    fr = transicion(tipo, (t - (c - d / 2)) / d, j, t, fu); break
        if fr is None:
            fr = logo_frame(t, logo, F) if PLANOS[i][0] == "LOGO" else plano_frame(i, t, fu)
            if PLANOS[i][0] == "LOGO" and t < PLANOS[i][1] + .7:  # fundido del último plano al logo
                e = suave((t - PLANOS[i][1]) / .7)
                fr = cv2.addWeighted(plano_frame(i - 1, t, fu), 1 - e, fr, e, 0)
        if PLANOS[i][0] != "LOGO":
            fr = cv2.merge([cv2.LUT(ch, lut[c]) for c, ch in enumerate(cv2.split(fr))])
            fr = (fr.astype(np.float32) * vin).astype(np.int16) + granos[k % 6]
            fr = np.clip(fr, 0, 255).astype(np.uint8)
            for (t0, t1, *_), png in zip(ROTULOS, rot):
                if t0 <= t < t1:
                    al = min(1, (t1 - t) / .25); fr_ = suave((t - t0) / .45)
                    pega(fr, png, 250, al, fr_)
            for idx, (s, ts) in enumerate(SUBS):
                ini = ts + VOZ_OFF; fin = (SUBS[idx + 1][1] + VOZ_OFF) if idx + 1 < len(SUBS) else SUBS_FIN + VOZ_OFF
                if ini <= t < fin: pega(fr, subs[idx], 1330)
        ff.stdin.write(fr.tobytes())
    ff.stdin.close(); ff.wait()

    A = D / "audio"
    sfx = [("sfx_guara.mp3", 7.0, .9), ("sfx_bajo_agua.mp3", 8.95, .7), ("sfx_sale_agua.mp3", 14.5, .9)]
    sfx += [("sfx_whoosh.mp3", PLANOS[j][1] - .35, .55) for j, (tp, _) in TRANS.items() if tp in ("whip", "zoom", "spin") and j < len(PLANOS) - 1]
    entradas = ["-i", str(tmp), "-i", str(D / "voz" / "t3.mp3"), "-ss", f"{MUS_INI:.2f}", "-i", str(A / "musica_b.mp3")]
    for f, *_ in sfx: entradas += ["-i", str(A / f)]
    fc = [f"[1:a]adelay={int(VOZ_OFF*1000)}|{int(VOZ_OFF*1000)},volume=1.0[voz]", "[voz]asplit[v1][v2]",
          f"[2:a]volume='if(lt(t,{DROP-.2}),0.45,0.85)':eval=frame,afade=t=out:st={FIN-3}:d=3[mus]",
          "[mus][v2]sidechaincompress=threshold=0.08:ratio=4:attack=20:release=300[mx]"]
    mez = ["[v1]", "[mx]"]
    for k, (f, st, vol) in enumerate(sfx):
        fc.append(f"[{k+3}:a]silenceremove=start_periods=1:start_threshold=-40dB,volume={vol},adelay={int(st*1000)}|{int(st*1000)}[s{k}]")
        mez.append(f"[s{k}]")
    fc.append("".join(mez) + f"amix=inputs={len(mez)}:normalize=0,loudnorm=I=-14:TP=-1.5,aresample=48000,atrim=0:{FIN}[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *entradas, "-filter_complex", ";".join(fc),
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ac", "2", "-b:a", "192k", a.sal], check=True)
    tmp.unlink()


if __name__ == "__main__":
    main()
