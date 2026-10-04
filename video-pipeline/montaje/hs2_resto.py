"""Honduras Secreta 2, partes 2–4: del «pero» a lo real, la ruta del agua y el cierre.

    python3 montaje/hs2_resto.py --hn HN --fuentes FUENTES --apertura apertura.mp4 --sal resto.mp4 [--desde S --hasta S]
    python3 montaje/hs2_resto.py ... --une final.mp4     # además pega apertura + resto en un solo archivo

Arranca en el último cuadro de la apertura (el «PERO» sobre la gente con teléfonos) y sigue en una sola escena:
tarjeta «guacamaya con colmillos» → el diente real de HS1 → la guacamaya de luz se vuelve la guara de HS →
«¿Colmillos?… Bueno, uno.» → la guara rompe el «PERO» → el polvo cae sobre el mapa → la luz dibuja a Carlos →
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


def latigazo(fr, w, vertical):
    """Whip pan: corrimiento y desenfoque direccional, w en [0, 1]."""
    if w <= 0.02: return fr
    n = int(3 + 80 * w); k = np.zeros((n, n), np.float32)
    if vertical: k[:, n // 2] = 1
    else: k[n // 2, :] = 1
    out = cv2.filter2D(fr, -1, k / n)
    d = int(w * 120)
    M = np.float32([[1, 0, 0 if vertical else d], [0, 1, d if vertical else 0]])
    return cv2.warpAffine(out, M, (W, H), borderMode=cv2.BORDER_REFLECT)


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
    """Subtítulos en tiempo de salida para cada tramo de voz real (siguen los J-cuts)."""
    P = json.load(open(HN / "p2/loc/palabras_test.json"))
    out = []
    for quien, t0, src, dur in TRAMOS(T):
        for txt, s, e in bloques(P[quien], src, src + dur):
            out.append((txt, t0 + s - src, min(t0 + dur, t0 + e - src)))
    return out


def TRAMOS(T):
    """(persona, inicio en la salida, inicio en su video, duración) de cada tramo de voz real."""
    return [("carlos", T["carlos"], 0.0, 6.5), ("romeo", T["romeo"] - 1.0, 0.0, 6.6),
            ("romeo", T["romeo"] + 5.6, 11.70, 1.05), ("samira", T["samira"] - 1.0, 1.35, 5.0),
            ("lenyn", T["lenyn"] - .9, 6.1, 7.9), ("leiva", T["leiva_tv"] - 2.34, 0.0, 8.6)]


def capa_sub(fr, subs, ts):
    for txt, s, e in subs:
        if s - .05 <= ts <= e + .25:
            img = CACHE.get(("sub", txt))
            if img is None:
                img = palabra(txt, 60, "Bold", (255, 255, 255), 1)
                sh = Image.new("RGBA", img.size, (0, 0, 0, 0)); sh.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(6)))
                img = Image.alpha_composite(sh, img); CACHE[("sub", txt)] = img
            a = suave((ts - s + .05) / .12) * (1 - suave((ts - e - .1) / .15))
            fr = pega(fr, img, 540, 1470, a)
    return fr


def capa_rotulo(fr, txt, sub, u, dur):
    if 0 <= u <= dur:
        a = suave(u / .45) * (1 - suave((u - dur + .5) / .5))
        fr = pega(fr, CACHE.setdefault(("rot", txt), rotulo(txt, sub)), 540, 1560 - 12 * sale(u / .6), a)
    return fr


# ---------- segmentos ----------
class Seg:
    def __init__(self, nombre, dur, fn, whip_in=None, rot=None, usu=None):
        self.nombre, self.dur, self.fn, self.whip_in = nombre, dur, fn, whip_in
        self.rot, self.usu = rot, usu


def seg_clip(nombre, archivo, vel, ini=0.0, fin=None, **kw):
    c = Clip(HN / "p2" / archivo) if not str(archivo).startswith("/") else Clip(archivo)
    fin = fin if fin is not None else c.n / c.fps
    def fn(u):
        ts = ini + u * vel
        f = c.cuadro(ts)
        return a_vertical(f)
    return Seg(nombre, (fin - ini) / vel, fn, **kw)


def construir(bg_final):
    reales = {k: Real(k) for k in REAL}
    S = []

    # 1. Cae la tarjeta «guacamaya con colmillos» sobre el final de la apertura
    card, *_ = tarjeta(COLMILLOS, None, 920, 50)
    def f_card(u):
        fr = zoom(bg_final, 1 + .02 * u)
        a = sale(u / .3); y = 980 - 160 * (1 - sale(u / .45))
        return pega(fr, card, 540, y, a, 1.0, -3 + 2 * sale(u / .5))
    S.append(Seg("tarjeta", 1.6, f_card))

    # 2. El diente real de Honduras Secreta 1 (lipsync del video pasado), con zoom y aro de luz
    hs1 = Clip(HN / "v3/GU_hook_habla.mp4"); tx, ty = .474 * W, .396 * H  # el diente, cuadro 9,8 s
    def f_diente(u):
        fr = a_vertical(hs1.cuadro(9.40 + u * .45))
        z = 1 + .9 * suave(u / 1.1); fr = zoom(fr, z, tx, ty)
        if u > .75:
            capa = np.zeros((H, W), np.float32); cv2.circle(capa, (int(tx), int(ty)), 105, 1.0, 5)
            capa = cv2.GaussianBlur(capa, (0, 0), 2) * 1.5 + cv2.GaussianBlur(capa, (0, 0), 10)
            k = suave((u - .75) / .25) * (.8 + .2 * math.sin(u * 20))
            fr = np.clip(fr + (capa * k)[..., None] * np.array([210, 240, 255], np.float32), 0, 255).astype(np.uint8)
        return fr
    S.append(Seg("diente", 1.35, f_diente, whip_in="h"))

    # 3. La guacamaya de luz aterriza y se vuelve la guara de HS (fin de la historia)
    S.append(seg_clip("luz_guara", "W01_luz_guara.mp4", 2.3, whip_in="h"))
    # 4. «¿Colmillos?… Bueno, uno.»
    lip = Clip(HN / "p2/L01_colmillo.mp4")
    S.append(Seg("colmillo", lip.n / lip.fps, lambda u: a_vertical(lip.cuadro(u))))
    # 5. La guara despega y rompe el «PERO»
    pero = palabra("PERO", 230, "Black"); VEL_VUELO = 1.85; RUPTURA = 4.88 / VEL_VUELO
    polvo_pero = ha.Polvo(pero, 540, 940, 7000, 21, deriva=(0, -420))
    w02 = Clip(HN / "p2/W02_vuelo.mp4")
    def f_vuelo(u):
        fr = a_vertical(w02.cuadro(u * VEL_VUELO))
        if u < RUPTURA: fr = pega(fr, pero, 540, 940, .9 * suave((u - .9) / .5), 1 + .05 * u)
        else: fr = polvo_pero.dibuja(fr, min(1, (u - RUPTURA) / 1.0), (255, 236, 200), 1.2)
        return fr
    S.append(Seg("vuelo", w02.n / w02.fps / VEL_VUELO, f_vuelo))

    # 6. Las letras se vuelven el mapa de Honduras
    S.append(Seg("mapa", 3.8, f_mapa()))
    # 7. De la luz a lo real: la línea dibuja a Carlos
    S.append(Seg("luz_carlos", 1.5, f_luz_carlos(reales["carlos"])))
    # 8. Carlos
    S.append(Seg("carlos", 6.5, lambda u: reales["carlos"].cuadro(u), usu=("@carlosquintanamx", .4)))
    # 9–10. Mira arriba → Picacho → Los Naranjos
    S.append(seg_clip("picacho", "W03_cielo_picacho.mp4", 1.7, whip_in="v", rot=("Cerro El Picacho", "Tegucigalpa", 2.1)))
    S.append(seg_clip("naranjos", "W04_picacho_naranjos.mp4", 1.9, rot=("Los Naranjos", "Lago de Yojoa", 1.6)))
    # 11. Romeo (su voz entra 1 s antes de verlo)
    def f_romeo(u):
        ts = 1.0 + u if u < 5.6 else 11.70 + (u - 5.6)
        fr = reales["romeo"].cuadro(ts)
        if 5.6 <= u < 5.75: fr = cv2.addWeighted(fr, .6, np.full_like(fr, 255), .4, 0)  # salto con destello
        return fr
    S.append(Seg("romeo", 5.6 + 1.05, f_romeo, whip_in="h", usu=("@romeo_and_nando_adventures", .3)))
    # 12–13. El río se vuelve turquesa → cenote → Samira
    S.append(seg_clip("rio", "W05_rio_cenote.mp4", 1.9, whip_in="h"))
    S.append(Seg("samira", 4.0, lambda u: reales["samira"].cuadro(2.35 + u), usu=("@samirafer_hn", .3),
                 rot=("San Luis Planes", "Santa Bárbara", 1.0)))
    # 14–16. Bajo el agua del cenote → Utila → Lenyn → arrecife
    S.append(seg_clip("utila", "W06_cenote_utila.mp4", 1.8, whip_in="v", rot=("Utila", "Islas de la Bahía", 1.7)))
    S.append(Seg("lenyn", 1.6, lambda u: reales["lenyn"].cuadro(7.0 + u), whip_in="h", usu=("@lenynreye", .1)))
    S.append(seg_clip("arrecife", "W07_utila_snorkel.mp4", 1.15))
    # 17–19. Atardecer en Utila → Santa Bárbara → la casa con la tele (Leiva)
    S.append(seg_clip("utila_sb", "W08_utila_sb.mp4", 1.9, whip_in="h", rot=("Santa Bárbara", "Occidente de Honduras", 1.6)))
    S.append(seg_clip("sb_casa", "W09_sb_casa.mp4", 1.8))
    S.append(Seg("leiva_tv", 4.7, f_leiva_tv(reales["leiva"], S[-1]), usu=("@caballeroleiva", .2)))
    # 20–21. Sale por la ventana a la gente → la guara al atardecer
    S.append(seg_clip("gente", "W10_casa_gente.mp4", 1.45, ini=1.0))
    S.append(Seg("cierre", 6.59, f_cierre()))
    S.append(Seg("luz_final", 1.4, f_luz_final()))
    S.append(Seg("logo", 3.5, f_logo()))
    return S


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
    teg = destinos[0]
    def fn(u):
        fr = np.zeros((H, W, 3), np.float32); fr[:] = (14, 8, 4)
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
        glow = cv2.GaussianBlur(capa, (0, 0), 1.2) * 1.4 + cv2.GaussianBlur(capa, (0, 0), 9) * 2.2
        fr += np.clip(glow, 0, 2)[..., None] * np.array(ORO, np.float32)
        fr = np.clip(fr, 0, 255).astype(np.uint8)
        for i, (nom, lo, la) in enumerate(LUGARES[:5]):
            a = suave((u - 1.6 - .15 * i) / .4) * (1 - suave((u - 3.0) / .4))
            if a > 0:
                x, y = destinos[i]; img = CACHE.setdefault(("map", nom), palabra(nom, 36, "SemiBold", (255, 238, 210), 2))
                dx = 0 if nom != "Santa Bárbara" else -40; dy = -34 if nom not in ("San Luis Planes",) else -30
                if nom == "Santa Bárbara": dy = 34
                fr = pega(fr, img, x + dx, y + dy, a)
        # la cámara se lanza a Tegucigalpa
        z = 1 + 9 * suave((u - 3.1) / 1.1) ** 2
        fr = zoom(fr, z, teg[0], teg[1])
        if u > 3.7: fr = cv2.addWeighted(fr, 1, np.full_like(fr, 255), suave((u - 3.7) / .5) * .9, 0)
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
    li = contorno_luz(f0)
    yy, xx = np.mgrid[0:H, 0:W]; r = np.hypot(xx - 540, yy - 820).astype(np.float32)
    def fn(u):
        rad = 1500 * sale(u / .8)
        m = np.clip((rad - r) / 160, 0, 1)[..., None]
        fl = np.full_like(f0, 255).astype(np.float32) * (1 - suave(u / .25))
        fr = np.clip(fl * (1 - m) + li * m, 0, 255).astype(np.uint8)
        if u > .75:
            k = suave((u - .75) / .7)
            fr = np.clip(f0.astype(np.float32) * k + fr * (1 - .7 * k), 0, 255).astype(np.uint8)  # lo real entra y el trazo queda de borde
        return fr
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


def f_leiva_tv(real, seg_casa):
    base = seg_casa.fn(seg_casa.dur - 1 / FPS)
    quad = pantalla_tv(base)
    tvw, tvh = 640, 360
    src = np.float32([[0, 0], [tvw, 0], [tvw, tvh], [0, tvh]])
    M = cv2.getPerspectiveTransform(src, quad)
    tvc = quad.mean(0)
    def fn(u):
        f = real.c.cuadro(2.34 + u)  # 478x850: plano medio 16:9 de su cara y pecho
        f = cv2.resize(f[40:309], (tvw, tvh), interpolation=cv2.INTER_CUBIC)
        f = cv2.convertScaleAbs(f, alpha=1.05, beta=6)
        f[::3] = (f[::3] * .9).astype(np.uint8)  # líneas de televisor
        warp = cv2.warpPerspective(f, M, (W, H)); mask = cv2.warpPerspective(np.full((tvh, tvw), 255, np.uint8), M, (W, H))
        m = cv2.GaussianBlur(mask, (3, 3), 0)[..., None] / 255.
        fr = (base * (1 - m) + warp * m).astype(np.uint8)
        glow = cv2.GaussianBlur((warp * m).astype(np.uint8), (0, 0), 25)
        fr = cv2.add(fr, (glow * .35).astype(np.uint8))
        return zoom(fr, 1 + .32 * suave(u / 4.7), tvc[0], tvc[1])
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


def render(S, sal, desde=0, hasta=None):
    global SUBS
    T, total = tiempos(S); hasta = min(hasta or total, total); SUBS = subtitulos(T)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", str(sal)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    WH = .18
    for k in range(int(desde * FPS), int(hasta * FPS)):
        t = k / FPS
        i = max(j for j, s in enumerate(S) if T[s.nombre] <= t + 1e-9)
        s = S[i]; u = t - T[s.nombre]
        fr = s.fn(min(u, s.dur - 1e-3))
        if s.nombre not in ("mapa", "logo", "luz_final", "tarjeta", "luz_carlos") + tuple(REAL) + ("leiva_tv",):
            fr = acabado(fr, t)
        fr = capa_sub(fr, SUBS, t)
        if s.usu: fr = capa_usuario(fr, s.usu[0], u - s.usu[1])
        if s.rot: fr = capa_rotulo(fr, s.rot[0], s.rot[1], u - s.rot[2], 2.2)
        # latigazo en la unión con el siguiente / anterior
        if s.whip_in and u < WH: fr = latigazo(fr, 1 - u / WH, s.whip_in == "v")
        if i + 1 < len(S) and S[i + 1].whip_in and s.dur - u < WH:
            fr = latigazo(fr, 1 - (s.dur - u) / WH, S[i + 1].whip_in == "v")
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
    add(p2 / "vo_colmillo_b.mp3", T["colmillo"] + .02, 1.0, tipo="voz", norm=True)
    add(p2 / "vo_mira_b.mp3", T["mapa"] + .5, 1.0, tipo="voz", norm=True)
    add(p2 / "vo_cierre_b.mp3", T["cierre"] + .25, 1.0, tipo="voz", norm=True)
    for quien, t0, src, dur in TRAMOS(T):  # testimonios con su voz original (J-cuts)
        add(UP / REAL[quien], t0, 1.0, src, dur, "voz", True, .15)
    for f, t0, vol, *r in [
            (ap / "sfx_pings_b.mp3", T["tarjeta"] + .1, .6, 0, .6),
            (p2 / "sfx_whoosh_a.mp3", T["diente"] - .15, .6), (p2 / "sfx_whoosh_b.mp3", T["luz_guara"] - .15, .5),
            (ap / "sfx_nace.mp3", T["luz_guara"] + .3, .55, 0, 3), (p2 / "sfx_pop_alas_a.mp3", T["vuelo"] + .3, .8),
            (HN / "audio5/riser_boom.mp3", T["vuelo"] + 4.88 / 1.85 - 2.0, .7),
            (HN / "audio5/estrellas.mp3", T["mapa"] + .4, .5, 0, 4), (ap / "sfx_nace.mp3", T["luz_carlos"], .5, 0, 1.8),
            (p2 / "sfx_whoosh_a.mp3", T["picacho"] - .2, .55), (HN / "audio5/pinos.mp3", T["picacho"] + .5, .45, 0, 5),
            (p2 / "sfx_viento_humedal_a.mp3", T["naranjos"], .5, 0, 5), (p2 / "sfx_whoosh_b.mp3", T["romeo"] - .2, .45),
            (p2 / "sfx_whoosh_a.mp3", T["rio"] - .2, .5), (p2 / "sfx_rio_a.mp3", T["rio"], .5, 0, 5),
            (p2 / "sfx_whoosh_b.mp3", T["utila"] - .2, .5), (p2 / "sfx_superficie_a.mp3", T["utila"] + .6, .6, 0, 4.5),
            (p2 / "sfx_whoosh_a.mp3", T["lenyn"] - .2, .4), (HN / "audio5/olas_atardecer.mp3", T["arrecife"], .35, 0, 5),
            (p2 / "sfx_whoosh_b.mp3", T["utila_sb"] - .2, .5), (p2 / "sfx_pueblo_a.mp3", T["gente"], .5, 0, 5),
            (HN / "audio5/final_swell.mp3", T["cierre"] + 2.0, .6, 0, 6), (HN / "audio2/sfx_logo.mp3", T["logo"] - .15, .9)]:
        add(f, t0, vol, *(r or [None, None]))
    # música: entra con la ruptura del «PERO»; su bajada para narrador (segundo 58) cae en la frase final
    t_m = T["vuelo"] + 4.88 / 1.85
    tramo = T["cierre"] + .25 - t_m
    tempo = min(1.1, max(.85, 58.0 / tramo)); m_ini = max(0.0, 58.0 - tramo * tempo)
    add(p2 / "musica2_a.mp3", t_m, .62, m_ini, None, "mus",
        extra=f",atempo={tempo:.4f},afade=t=in:d=0.4,afade=t=out:st={total - t_m - 1.5:.2f}:d=1.5")
    # colchón grave antes de la ruptura (continúa el de la apertura)
    add(ap / "musica_b.mp3", 0, .55, 0, 9, "col", extra=f",asetrate=48000*0.84,aresample=48000,lowpass=f=900,"
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
