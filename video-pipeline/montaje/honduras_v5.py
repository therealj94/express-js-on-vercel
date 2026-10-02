"""Honduras Secreta v5 — la versión de dos minutos: un día entero por Honduras, del mar a la noche estrellada.

Sobre la v4 (sin congelados, La Ceiba, sonido inmersivo):
- Arranque en frío: 1,7 s de destellos del viaje (tiburón ballena, cascada, Copán, tambor, Amapala, estrellas)
  con riser y golpe, antes de que la guara hable.
- Ruta Lenca: de las manos de La Campa a La Esperanza (pañuelos lencas en la neblina) y la Laguna de Chiligatoro.
- Valle de Ángeles: calle colonial empedrada y baúl tallado (icono artesanal del pueblo).
- Final en el sur: atardecer en Playa Negra de Amapala con el Cosigüina al fondo → se hace de noche en una sola
  toma → la guara cierra bajo las estrellas («…en dos minutos») → «YA NO ES UN SECRETO» → logo.
- Música estilo Odesza montada en dos tramos: el primer golpe en el despegue y el clímax en el atardecer de Amapala.

    python3 montaje/honduras_v5.py --dir HN --fuentes FUENTES --sal salida.mp4 [--solo-plan] [--hasta SEG]
    python3 montaje/honduras_v4.py --revisa salida.mp4
"""
import argparse, json, math, subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from honduras_mg import MG, compone, W, H, sale, suave, CREMA
from honduras_v3 import a_vertical, palabras_de, bloques
from honduras_v4 import rampa, d_rampa, quieto, Clip, dur_audio

FPS = 30
# (nombre, archivo, velocidad media, rampa sí/no[, ini, fin])
SEGMENTOS = [
    ("hook", "v3/GU_hook_habla.mp4",          1.00, 0),
    ("T02",  "v3/T02_despegue.mp4",           1.89, 1),
    ("T03",  "v3/T03_vuelo_playa.mp4",        1.83, 1),
    ("T01",  "v3/T_R01_R02.mp4",              1.83, 1),
    ("T05",  "v4/T05_arrecife_tiburones.mp4", 1.65, 1),
    ("T06",  "v4/T06_tiburones_ballena.mp4",  1.40, 1),
    ("T07",  "v3/T07_sale_rapidos.mp4",       1.59, 1),
    ("T08",  "v3/T08_rio_cascada.mp4",        1.95, 1),
    ("T09",  "v3/T09_niebla_copan.mp4",       1.83, 1),
    ("GC",   "v3/GC_habla.mp4",               1.00, 0),
    ("T11",  "v3/T11_estela_escalinata.mp4",  1.83, 1),
    ("T13",  "v3/T13_escalinata_tambor.mp4",  1.52, 1),
    ("T15",  "v3/T15_tambor_pies.mp4",        1.59, 1),
    ("T16",  "v3/T16_falda_lenca.mp4",        1.59, 1),
    ("TLE",  "v5/TLE_lenca_esperanza.mp4",    1.50, 1),
    ("TLL",  "v5/TLL_esperanza_laguna.mp4",   1.30, 1),
    ("TLY",  "v5/TLY_laguna_yojoa.mp4",       1.60, 1),
    ("TYC",  "v4/TYC_plato_ceiba.mp4",        1.89, 1),
    ("TCB",  "v4/TCB_ceiba_baleada.mp4",      1.89, 1),
    ("TBM",  "v4/TBM_baleada_cafe.mp4",       1.83, 1),
    ("TMM",  "v4/TMM_cafe_marcala.mp4",       1.34, 1),
    ("TMV",  "v5/TMV_marcala_valle.mp4",      1.60, 1),
    ("TVV",  "v5/TVV_calle_baul.mp4",         1.30, 1),
    ("TVM",  "v5/TVM_valle_mosquitia.mp4",    1.60, 1),
    ("TMA",  "v5/TMA_mosquitia_amapala.mp4",  1.40, 1),
    ("TAN",  "v5/TAN_atardecer_noche.mp4",    0.95, 1),
    ("TNG",  "v5/TNG_noche_guara.mp4",        1.20, 1),
    ("GU3",  "v5/GU3_habla.mp4",              1.00, 0),
]
TEASER = 1.7
FINAL = 3.6           # «YA NO ES UN SECRETO» sobre las estrellas
LOGO_DUR = 4.2
DUR_FIJA = {"hook": 9.95}
EXTRA = {"GU3": 0.5}
CORTES = {"T06": 2.54}
# destellos del arranque: (archivo, segundo del clip)
DESTELLOS = [("v4/T06_tiburones_ballena.mp4", 6.2), ("v3/T08_rio_cascada.mp4", 3.2), ("v3/T09_niebla_copan.mp4", 6.0),
             ("v3/T15_tambor_pies.mp4", 0.8), ("v3/T07_sale_rapidos.mp4", 3.4), ("v5/TMA_mosquitia_amapala.mp4", 6.2),
             ("v5/TAN_atardecer_noche.mp4", 6.3), ("v4/TCB_ceiba_baleada.mp4", 6.2)]

VOZ = [  # (segmento, desfase, archivo, ini, fin)
    ("hook", 0.00, "voz/hook_guara.mp3", 0, None),
    ("T01", 0.45, "voz/t3.mp3", 7.10, 10.95),
    ("T05", 1.10, "voz/t3.mp3", 10.95, 13.00),
    ("T06", 0.50, "voz/utila.mp3", 0, None),
    ("T07", 0.70, "voz/t3.mp3", 13.05, 16.15),
    ("T08", 1.00, "voz/t3.mp3", 16.15, 18.30),
    ("GC", 0.00, "voz/guara_copan.mp3", 0, None),
    ("T13", 1.40, "voz/t3.mp3", 22.95, 25.68),
    ("T16", 0.50, "voz/t3.mp3", 25.68, 29.05),
    ("TLE", 2.20, "voz/esperanza.mp3", 0, None),
    ("TLY", 2.10, "voz/t3.mp3", 29.10, 31.10),
    ("TYC", 2.30, "voz/ceiba.mp3", 0, None),
    ("TBM", 2.30, "voz/t3.mp3", 32.58, 36.75),
    ("TMV", 2.20, "voz/valle.mp3", 0, None),
    ("TVM", 2.40, "voz/t3.mp3", 36.85, 40.75),
    ("TMA", 3.20, "voz/amapala.mp3", 0, None),
    ("GU3", 0.00, "voz/guara_cierre2.mp3", 0, None),
]

LUGARES = [(-86.60, 16.27), (-86.93, 16.10), (-86.75, 15.72), (-88.00, 15.01), (-89.14, 14.84), (-87.43, 15.78),
           (-88.58, 14.46), (-88.18, 14.31), (-87.98, 14.87), (-86.79, 15.76), (-88.03, 14.15), (-87.03, 14.11),
           (-85.04, 15.67), (-87.64, 13.29)]
ROTULOS = [
    ("T01", 0.3, 2.4, "ROATÁN", "Islas de la Bahía", "16.3°N  86.6°W", 0),
    ("T06", 1.0, 2.4, "UTILA", "tiburón ballena", "16.1°N  86.9°W", 1),
    ("T07", 1.8, 2.0, "RÍO CANGREJAL", "La Ceiba · rápidos clase IV", "15.7°N  86.7°W", 2),
    ("T08", 1.2, 2.1, "PULHAPANZAK", "Cortés", "15.0°N  88.0°W", 3),
    ("T09", 2.0, 5.8, "COPÁN RUINAS", "Patrimonio de la Humanidad · 1980", "14.8°N  89.1°W", 4),
    ("T13", 2.0, 4.0, "TRIUNFO DE LA CRUZ", "Tela · cultura garífuna", "15.8°N  87.4°W", 5),
    ("T16", 1.8, 2.4, "LA CAMPA", "Lempira · cerámica lenca", "14.5°N  88.6°W", 6),
    ("TLE", 2.4, 3.0, "LA ESPERANZA", "Intibucá · corazón de la Ruta Lenca", "14.3°N  88.2°W", 7),
    ("TLY", 2.2, 2.2, "LAGO DE YOJOA", "pescado frito", "14.9°N  88.0°W", 8),
    ("TCB", 0.05, 2.4, "LA CEIBA", "Atlántida · capital del ecoturismo", "15.8°N  86.8°W", 9),
    ("TMM", 0.4, 3.0, "MARCALA", "La Paz · café de altura", "14.2°N  88.0°W", 10),
    ("TMV", 2.4, 2.8, "VALLE DE ÁNGELES", "Francisco Morazán · cuna de artesanos", "14.1°N  87.0°W", 11),
    ("TVM", 2.4, 2.8, "LA MOSQUITIA", "Biosfera del Río Plátano", "15.7°N  85.0°W", 12),
    ("TMA", 3.0, 3.6, "AMAPALA", "Isla del Tigre · Golfo de Fonseca", "13.3°N  87.6°W", 13),
]
CIFRAS = [
    ("T01", 2.3, 1.9, 2, "", ".º", "arrecife más grande del mundo"),
    ("T08", 1.8, 1.8, 43, "", " m", "de caída"),
    ("T13", 0.3, 1.8, 2000, "+", "", "glifos mayas en la escalinata"),
    ("TLL", 0.6, 1.8, 1700, "+", " m", "la ciudad más alta de Honduras"),
    ("TMM", 2.2, 1.8, 1, "", ".ª", "denominación de origen de Centroamérica"),
]
MUSICA_GOLPE = 10.0     # primer golpe de audio5/musica_v5.mp3 (se ajusta tras analizar la pista)
MUSICA_CLIMAX = 100.0   # inicio del clímax de la pista → atardecer de Amapala


# ---------- línea de tiempo ----------
def plan(D):
    cache_f = D / "v4" / "quieto.json"; cache = json.load(open(cache_f)) if cache_f.exists() else {}
    t, out = TEASER, {"TEASER": dict(t0=0.0, dur=TEASER)}
    for s in SEGMENTOS:
        nombre, arch, vel, rmp = s[:4]
        c = Clip(D / arch, *(s[4:6] if len(s) > 4 else ()))
        if rmp:
            q0, q1 = quieto(D / arch, cache); c.ini += q0; c.fin -= q1
        dur = DUR_FIJA.get(nombre, (c.fin - c.ini) / vel) + EXTRA.get(nombre, 0)
        out[nombre] = dict(t0=t, dur=dur, clip=c, vel=(c.fin - c.ini) / dur, rampa=rmp)
        t += dur
    json.dump(cache, open(cache_f, "w"), indent=1)
    out["FINAL"] = dict(t0=t, dur=FINAL); t += FINAL
    out["LOGO"] = dict(t0=t, dur=LOGO_DUR)
    return out, t + LOGO_DUR


def en_linea(P, seg, ts):
    s = P[seg]; c = s["clip"]; obj = (ts - c.ini) / (c.fin - c.ini); lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2; lo, hi = (mid, hi) if rampa(mid) < obj else (lo, mid)
    return s["t0"] + s["dur"] * lo


def cuadro_en(P, orden, t):
    seg = max((n for n in orden if P[n]["t0"] <= t), key=lambda n: P[n]["t0"])
    s = P[seg]; c = s["clip"]; u = (t - s["t0"]) / s["dur"]
    if s["rampa"]:
        ts = c.ini + (c.fin - c.ini) * rampa(u)
        v = s["vel"] * d_rampa(u); mezcla = min(.55, max(0.0, (v - 1.6) * .45))
    else:
        ts = c.ini + min(u, 1.0) * (c.fin - c.ini - 1 / c.fps); mezcla = 0
    fr = c.cuadro(ts, mezcla)
    if seg in CORTES:
        cerca = 1 - abs(ts - CORTES[seg]) / .2
        if cerca > 0:
            n = int(9 + 70 * cerca) | 1; ker = np.zeros((n, 1), np.float32); ker[:, 0] = 1 / n
            fr = cv2.filter2D(fr, -1, ker)
    return seg, fr


def zoom(fr, z, cx=W / 2, cy=H / 2):
    M = cv2.getRotationMatrix2D((cx, cy), 0, z)
    return cv2.warpAffine(fr, M, (W, H), borderMode=cv2.BORDER_REFLECT)


# ---------- piezas nuevas ----------
def teaser(D, t, cache={}):
    """Destellos de 0,21 s con golpe de zoom y desenfoque radial al entrar."""
    n = len(DESTELLOS); k = min(n - 1, int(t / TEASER * n)); tl = t - k * TEASER / n
    arch, ts = DESTELLOS[k]
    if (arch, ts) not in cache:
        c = Clip(D / arch); cache[(arch, ts)] = a_vertical(c.cuadro(min(ts, c.dur - .1)))
    fr = cache[(arch, ts)]
    p = min(1, tl / (TEASER / n)); z = 1.22 - .16 * sale(p)
    fr = zoom(fr, z)
    if p < .35:  # entra con un destello blanco corto
        fr = cv2.addWeighted(fr, 1, np.full_like(fr, 255), .55 * (1 - p / .35), 0)
    return fr


def frase_final(mg, tl, dur):
    """«Ahora ya lo sabes» + «YA NO ES / UN SECRETO» en Monoton con el degradado del logo, centrado."""
    capa = np.zeros((H, W, 4), np.uint8)
    salida = 1 - suave((tl - (dur - .45)) / .45)
    img = Image.new("RGBA", (W, 120), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    a = int(255 * suave(tl / .5) * salida); txt = "Ahora ya lo sabes:"
    d.text(((W - d.textlength(txt, font=mg.f["cap"])) / 2, 20), txt, font=mg.f["cap"], fill=CREMA + (a,))
    mg._pega(capa, np.array(img), 0, 640)
    for j, linea in enumerate(("YA NO ES", "UN SECRETO")):
        letras, ancho, alto = mg._letras(linea); x0 = (W - ancho) // 2; y0 = 780 + j * (alto + 10)
        for k, (x, w, rgba) in enumerate(letras):
            p = sale((tl - .45 - .55 * j - .05 * k) / .4)
            if p <= 0: continue
            lo = rgba.copy(); lo[..., 3] = (lo[..., 3] * p * salida).astype(np.uint8)
            mg._pega(capa, lo[:, x:x + w + 4], x0 + x, y0 + int((1 - p) * 40))
    return capa


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir"); ap.add_argument("--fuentes"); ap.add_argument("--sal")
    ap.add_argument("--hasta", type=float, default=None); ap.add_argument("--solo-plan", action="store_true")
    a = ap.parse_args()
    D = Path(a.dir)
    P, FIN = plan(D)
    print("duración", round(FIN, 2), {k: round(v["t0"], 2) for k, v in P.items()})
    voces = []
    for seg, off, arch, ini, fin in VOZ:
        largo = (fin if fin is not None else dur_audio(D / arch)) - ini
        voces.append((P[seg]["t0"] + off, P[seg]["t0"] + off + largo, seg))
    for (a0, a1, s0), (b0, b1, s1) in zip(voces, voces[1:] + [(1e9, 0, "")]):
        print(f"  voz {s0:5s} {a0:6.2f}–{a1:6.2f}" + ("   ¡SE PISA con " + s1 + "!" if a1 > b0 - .15 else ""))
    if a.solo_plan: return
    if a.hasta: FIN = min(FIN, a.hasta)
    mg = MG(a.fuentes, D / "honduras_contorno.json"); mg.LUGARES = LUGARES
    logo = np.array(Image.open(D / "logo_hs.jpg").convert("RGB"))
    estrellas = a_vertical(cv2.imread(str(D / "ref5" / "AM02_noche.png")))

    subs = []
    for seg, off, arch, ini, fin in VOZ:
        subs += bloques(palabras_de(D, arch, ini, fin, P[seg]["t0"] + off))
    subs = [(b[0][0], (subs[i + 1][0][0] if i + 1 < len(subs) and subs[i + 1][0][0] - b[-1][1] < .6 else b[-1][1] + .35), b)
            for i, b in enumerate(subs)]

    x = np.arange(256) / 255
    lut = [np.clip(255 * (x + .05 * np.sin(2 * np.pi * x) * k), 0, 255).astype(np.uint8) for k in (.5, .8, 1.0)]
    lut[0] = np.clip(lut[0].astype(int) - (x * 10).astype(int) + 6, 0, 255).astype(np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]; v = ((xx - W / 2) / (W * .78)) ** 2 + ((yy - H / 2) / (H * .72)) ** 2
    vin = (1 - .32 * np.clip(v, 0, 1))[..., None].astype(np.float32)
    rng = np.random.default_rng(3); granos = [rng.normal(0, 3, (H, W, 1)).astype(np.int16) for _ in range(6)]

    tmp = Path(a.sal).with_suffix(".mudo.mp4")
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
                           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                           "-pix_fmt", "yuv420p", str(tmp)], stdin=subprocess.PIPE)
    orden = [s[0] for s in SEGMENTOS]; ultimo = None
    for k in range(int(FIN * FPS)):
        t = k / FPS
        if t >= P["LOGO"]["t0"]:
            fr = mg.logo(t - P["LOGO"]["t0"], logo)
        else:
            if t < TEASER:
                fr = teaser(D, t); seg = "TEASER"
            elif t >= P["FINAL"]["t0"]:
                tl = t - P["FINAL"]["t0"]; seg = "FINAL"
                fr = zoom(estrellas, 1.04 + .05 * tl / FINAL)
                if tl < .6 and ultimo is not None:  # fundido de la guara a las estrellas
                    fr = cv2.addWeighted(ultimo, 1 - suave(tl / .6), fr, suave(tl / .6), 0)
            else:
                seg, fr = cuadro_en(P, orden, t); fr = a_vertical(fr)
                tl = t - P[seg]["t0"]
                if seg == "hook":
                    z = 1 + .30 * (1 - min(1, tl / .55)) ** 3 + (.14 if tl > 6.9 else 0) + .05 * tl / 6.9 + .02 * math.sin(tl * 1.3)
                    fr = zoom(fr, z, W / 2 + 30 * math.sin(tl * .45), H * .42)
                elif not P[seg]["rampa"]:
                    u = tl / P[seg]["dur"]
                    fr = zoom(fr, 1.03 + .13 * u + .015 * math.sin(tl * 1.1), W / 2 + 40 * math.sin(tl * .5), H * .45)
                ultimo = fr
            fr = cv2.merge([cv2.LUT(ch, lut[i]) for i, ch in enumerate(cv2.split(fr))])
            fr = np.clip((fr.astype(np.float32) * vin).astype(np.int16) + granos[k % 6], 0, 255).astype(np.uint8)
            for sg, off, dur, tit, sub, coord, im in ROTULOS:
                tl = t - (P[sg]["t0"] + off)
                if 0 <= tl < dur: fr = compone(fr, mg.rotulo(tl, dur, tit, sub, coord, im))
            for sg, off, dur, val, pre, suf, txt in CIFRAS:
                tl = t - (P[sg]["t0"] + off)
                if 0 <= tl < dur: fr = compone(fr, mg.cifra(tl, dur, val, pre, suf, txt, y0=780))
            for a0, a1, b in subs:
                if a0 <= t < a1: fr = compone(fr, mg.subtitulo(t, b)); break
            if seg == "FINAL":
                fr = compone(fr, frase_final(mg, t - P["FINAL"]["t0"], FINAL))
            if t > P["LOGO"]["t0"] - .5:
                fr = (fr * max(0, (P["LOGO"]["t0"] - t) / .5)).astype(np.uint8)
        ff.stdin.write(np.ascontiguousarray(fr).tobytes())
    ff.stdin.close(); ff.wait()
    json.dump({k: [v["t0"], v["dur"]] for k, v in P.items()}, open(Path(a.sal).with_suffix(".plan.json"), "w"))
    mezcla(D, P, FIN, tmp, a.sal)
    tmp.unlink()


def mezcla(D, P, FIN, tmp, sal):
    T = lambda s, off=0: P[s]["t0"] + off
    F = lambda s, f: P[s]["t0"] + P[s]["dur"] * f
    pistas = []
    for seg, off, arch, ini, fin in VOZ:
        pistas.append((arch, T(seg, off), ini, fin, 1.0, False, "voz"))
    amb = [("audio2/a_playa.mp3", T("hook"), T("T01"), .5), ("audio2/a_picada.mp3", T("T02"), F("T01", .6), .5),
           ("audio4/burbujas.mp3", F("T01", .62), F("T07", .45), 1.3),
           ("audio2/a_rapidos.mp3", F("T07", .45), T("T08"), .55),
           ("audio4/cascada.mp3", T("T08"), F("T09", .45), .85),
           ("audio2/a_selva.mp3", F("T09", .45), T("T13"), .45),
           ("audio2/a_barro.mp3", T("T16"), F("TLE", .5), .7),
           ("audio5/pinos.mp3", F("TLE", .45), F("TLY", .5), 1.0),                 # viento entre pinos, pueblo frío
           ("audio2/a_fritura.mp3", F("TLY", .7), T("TYC"), .4),
           ("audio2/a_playa.mp3", T("TYC"), F("TCB", .6), .35), ("audio2/a_fritura.mp3", F("TCB", .5), F("TBM", .5), .45),
           ("audio2/a_selva.mp3", F("TVM", .5), F("TMA", .6), .4),
           ("audio5/olas_atardecer.mp3", F("TMA", .55), F("TAN", .6), .9),       # lanchas regresando
           ("audio5/noche.mp3", F("TAN", .45), T("LOGO"), .9)]                    # grillos y olas de noche
    for f, t0, t1, vol in amb:
        pistas.append((f, t0, 0, t1 - t0 + .2, vol, True, "amb"))
    golpes = [("audio5/riser_boom.mp3", 0.0, 1.0),
              ("audio/sfx_guara.mp3", T("T02", .2), .9), ("audio/sfx_swish.mp3", T("T02") - .45, .45),
              ("audio4/splash.mp3", F("T01", .6), 1.0), ("audio/sfx_swish.mp3", en_linea(P, "T06", CORTES["T06"]) - .45, .5),
              ("audio/sfx_sale_agua.mp3", F("T07", .42), .9), ("audio/sfx_whoosh.mp3", F("T13", .45), .5),
              ("audio/sfx_swish.mp3", T("T16", .3), .45), ("audio5/swipe.mp3", T("TLE", .2), .5),
              ("audio5/swipe.mp3", T("TLY", .3), .45), ("audio/sfx_whoosh.mp3", T("TYC", .3), .5),
              ("audio/sfx_swish.mp3", T("TCB", .2), .4), ("audio4/cafe.mp3", T("TMM", .05), 1.1),
              ("audio5/campanas.mp3", F("TMV", .55), .8),                               # campanas del pueblo colonial
              ("audio5/swipe.mp3", T("TVM", .3), .5), ("audio/sfx_whoosh.mp3", T("TMA", .3), .45),
              ("audio/sfx_guara.mp3", F("TNG", .5), .6), ("audio2/sfx_logo.mp3", T("LOGO") - .15, .8)]
    for f, t0, vol in golpes:
        pistas.append((f, t0, 0, 8.0 if "campanas" in f else 4.0, vol, False, "golpe"))
    g0, g1 = F("T13", .35), T("T16", .4)
    pistas.append(("audio4/garifuna.mp3", g0, 0, g1 - g0, 1.0, True, "gari"))

    # música en dos tramos: (a) desde el inicio, con el primer golpe en el despegue de la guara;
    # (b) a partir del puente, recolocada para que el clímax caiga en el atardecer de Amapala. Cruce de 2 s.
    t_golpe, t_climax = T("T02"), F("TMA", .62)
    off_a = t_golpe - MUSICA_GOLPE            # la pista suena desplazada off_a s
    off_b = t_climax - MUSICA_CLIMAX
    xf = T("T16")                              # el cruce entre tramos, en La Campa (puente tranquilo)
    entradas = ["-i", str(tmp), "-i", str(D / "audio5" / "musica_v5.mp3"), "-i", str(D / "audio5" / "musica_v5.mp3")]
    for f, *_r in pistas:
        if _r[4]: entradas += ["-stream_loop", "-1"]
        entradas += ["-i", str(D / f)]
    fc, voz, amb_l, gol, gari = [], [], [], [], []
    for i, (f, t0, ini, fin, vol, bucle, tipo) in enumerate(pistas):
        ms = int(t0 * 1000)
        cad = f"[{i+3}:a]" + ("silenceremove=start_periods=1:start_threshold=-40dB," if tipo == "golpe" and "riser" not in f else "")
        cad += f"atrim={ini:.2f}" + (f":{fin:.2f}" if fin is not None else "") + ",asetpts=PTS-STARTPTS,"
        if tipo not in ("voz",) and "riser" not in f: cad += "afade=t=in:d=0.15,"
        if tipo in ("amb", "gari"): cad += f"afade=t=out:st={max(0, fin - ini - .5):.2f}:d=0.5,"
        cad += f"volume={vol},adelay={ms}|{ms},aresample=48000,aformat=channel_layouts=mono[p{i}]"
        fc.append(cad); {"voz": voz, "amb": amb_l, "golpe": gol, "gari": gari}[tipo].append(f"[p{i}]")
    fc.append("".join(voz) + f"amix=inputs={len(voz)}:normalize=0,asplit=4[v1][v2][v3][v4]")

    def tramo(idx, off, t_ini, t_fin, etq, fade_in, fade_out):
        # coloca la pista con desplazamiento off y deja solo [t_ini, t_fin] de la línea final
        if off >= 0:
            pre = f"adelay={int(off*1000)}|{int(off*1000)}"
        else:
            pre = f"atrim=start={-off:.3f},asetpts=PTS-STARTPTS"
        f = f"[{idx}:a]aresample=48000,aformat=channel_layouts=mono,{pre},atrim=0:{t_fin:.2f},"
        if fade_in: f += f"afade=t=in:st={t_ini:.2f}:d={fade_in},"
        if fade_out: f += f"afade=t=out:st={t_fin - fade_out:.2f}:d={fade_out},"
        f += f"volume='if(lt(t,{t_ini - .01:.2f}),0,1)':eval=frame[{etq}]"
        fc.append(f)
    tramo(1, off_a, 0.0, xf + 1.0, "ma", 0, 2.0)
    tramo(2, off_b, xf - 1.0, FIN, "mb", 2.0, 3.0)
    gd0, gd1 = g0, g1
    vol = (f"if(lt(t,{t_golpe:.2f}),0.5,if(between(t,{gd0:.2f},{gd1:.2f}),0.35,0.9))")
    fc.append(f"[ma][mb]amix=inputs=2:normalize=0,volume='{vol}':eval=frame[mu]")
    fc.append("[mu][v2]sidechaincompress=threshold=0.07:ratio=4:attack=20:release=350[mx]")
    fc.append("".join(amb_l) + f"amix=inputs={len(amb_l)}:normalize=0[am]")
    fc.append("[am][v3]sidechaincompress=threshold=0.1:ratio=2.5:attack=30:release=400[amd]")
    fc.append(f"{gari[0]}[v4]sidechaincompress=threshold=0.08:ratio=3:attack=20:release=300[gd]")
    todo = ["[v1]", "[mx]", "[amd]", "[gd]"] + gol
    fc.append("".join(todo) + f"amix=inputs={len(todo)}:normalize=0,loudnorm=I=-14:TP=-1.5,aresample=48000,atrim=0:{FIN:.2f}[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *entradas, "-filter_complex", ";".join(fc),
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ac", "2", "-b:a", "192k", sal], check=True)


if __name__ == "__main__":
    main()
