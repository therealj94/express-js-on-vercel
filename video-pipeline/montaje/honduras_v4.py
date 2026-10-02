"""Honduras Secreta v4 — correcciones de José sobre la v3.

Cambios frente a v3:
- Sin congelados: los clips MiniMax con imagen de inicio/fin se quedan quietos ~0,3–1,2 s al principio y al
  final. Se detecta ese tramo quieto (diferencia media entre cuadros) y se recorta, y la rampa pasa a ser
  rápida en las uniones y lenta (cámara lenta) en el centro: g(u) = u + a·sin(2πu)/(2π). En lo rápido se
  mezclan cuadros vecinos (desenfoque de movimiento). Los tramos con voz a tiempo real ya no sostienen el
  último cuadro: si sobra tiempo, el clip se ralentiza.
- Tiburones nuevos con aspecto documental (GoPro, a distancia) y la guara/voz nombra al tiburón ballena.
- Nueva parada: pescado frito → La Ceiba (Pico Bonito detrás) → baleada → café vertiéndose en Marcala →
  Mosquitia. La voz de Marcala cae sobre el café, no sobre La Mosquitia.
- Sonido inmersivo: chapuzón, burbujas bajo el agua, rugido de la cascada, café vertiéndose, tambores con
  canto garífuna; música nueva estilo Odesza.

    python3 montaje/honduras_v4.py --dir HN --fuentes FUENTES --sal salida.mp4 [--hasta SEG]
    python3 montaje/honduras_v4.py --revisa salida.mp4     # busca congelados en un render
"""
import argparse, json, math, subprocess
from collections import OrderedDict
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from honduras_mg import MG, compone, W, H
from honduras_v3 import a_vertical, palabras_de, bloques

FPS = 30
A_RAMPA = 0.38  # velocidad en las uniones = 1+a, en el centro = 1−a
# (nombre, archivo relativo a --dir, velocidad media, rampa sí/no[, ini, fin])
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
    ("T17",  "v3/T17_olla_plato.mp4",         1.59, 1),
    ("TYC",  "v4/TYC_plato_ceiba.mp4",        1.89, 1),
    ("TCB",  "v4/TCB_ceiba_baleada.mp4",      1.89, 1),
    ("TBM",  "v4/TBM_baleada_cafe.mp4",       1.83, 1),
    ("TMM",  "v4/TMM_cafe_marcala.mp4",       1.34, 1),
    ("T19",  "v3/T19_cafe_mosquitia.mp4",     1.77, 1),
    ("T20",  "v3/T20_rio_viajera.mp4",        1.95, 1),
    ("T21",  "v3/T21_aterriza_guara.mp4",     1.46, 1),
    ("GU2",  "v3/GU2_habla.mp4",              1.00, 0),
]
LOGO_DUR = 4.2
MUSICA_GOLPE = 8.0  # segundo del primer golpe en audio4/musica_odesza.mp3
# duraciones fijas para tramos a tiempo real (el clip se ralentiza si hace falta, nunca se congela)
DUR_FIJA = {"hook": 9.95}
EXTRA = {"GU2": 0.7}

# Voz: (segmento, desfase en s, archivo, ini, fin)
VOZ = [
    ("hook", 0.00, "voz/hook_guara.mp3", 0, None),
    ("T01", 0.45, "voz/t3.mp3", 7.10, 10.95),    # Aquí el mar es parte del segundo arrecife más grande del mundo…
    ("T05", 1.30, "voz/t3.mp3", 10.95, 13.00),   # y los tiburones son de verdad.
    ("T06", 0.70, "voz/utila.mp3", 0, None),     # Y en Utila… nada el pez más grande del mundo.
    ("T07", 0.80, "voz/t3.mp3", 13.05, 16.15),   # Salimos del agua… y el río te sacude el alma,
    ("T08", 1.20, "voz/t3.mp3", 16.15, 18.30),   # cascadas de 43 metros.
    ("GC", 0.00, "voz/guara_copan.mp3", 0, None),
    ("T13", 1.60, "voz/t3.mp3", 22.95, 25.68),   # En Tela, el tambor garífuna te mueve los pies.
    ("T16", 0.60, "voz/t3.mp3", 25.68, 29.05),   # En La Campa, manos lencas hacen arte sin torno.
    ("T17", 1.30, "voz/t3.mp3", 29.10, 31.10),   # Pescado frito en el Lago de Yojoa,
    ("TYC", 2.50, "voz/ceiba.mp3", 0, None),     # Y en La Ceiba, donde dicen que nació… la baleada.
    ("TBM", 2.80, "voz/t3.mp3", 32.58, 36.75),   # y el café de Marcala, la primera denominación de origen…
    ("T19", 2.10, "voz/t3.mp3", 36.85, 40.75),   # En La Mosquitia, uno de los últimos bosques lluviosos…
    ("GU2", 0.00, "voz/guara_cierre.mp3", 0, None),
]

# cortes duros dentro de un clip (segundo del clip): se disfrazan de latigazo vertical con desenfoque
CORTES = {"T06": 2.54}

LUGARES = [(-86.60, 16.27), (-86.93, 16.10), (-86.75, 15.72), (-88.00, 15.01), (-89.14, 14.84),
           (-87.43, 15.78), (-88.58, 14.46), (-87.98, 14.87), (-86.79, 15.76), (-88.03, 14.15), (-85.04, 15.67)]
ROTULOS = [
    ("T01", 0.3, 2.6, "ROATÁN", "Islas de la Bahía", "16.3°N  86.6°W", 0),
    ("T06", 1.2, 2.6, "UTILA", "tiburón ballena", "16.1°N  86.9°W", 1),
    ("T07", 2.0, 2.2, "RÍO CANGREJAL", "La Ceiba · rápidos clase IV", "15.7°N  86.7°W", 2),
    ("T08", 1.4, 2.3, "PULHAPANZAK", "Cortés", "15.0°N  88.0°W", 3),
    ("T09", 2.2, 6.6, "COPÁN RUINAS", "Patrimonio de la Humanidad · 1980", "14.8°N  89.1°W", 4),
    ("T13", 2.2, 4.5, "TRIUNFO DE LA CRUZ", "Tela · cultura garífuna", "15.8°N  87.4°W", 5),
    ("T16", 2.0, 2.6, "LA CAMPA", "Lempira · cerámica lenca", "14.5°N  88.6°W", 6),
    ("T17", 1.8, 2.4, "LAGO DE YOJOA", "pescado frito", "14.9°N  88.0°W", 7),
    ("TCB", 0.05, 2.6, "LA CEIBA", "Atlántida · capital del ecoturismo", "15.8°N  86.8°W", 8),
    ("TMM", 0.4, 3.4, "MARCALA", "La Paz · café de altura", "14.2°N  88.0°W", 9),
    ("T19", 2.3, 3.4, "LA MOSQUITIA", "Biosfera del Río Plátano", "15.7°N  85.0°W", 10),
]
CIFRAS = [
    ("T01", 2.4, 2.0, 2, "", ".º", "arrecife más grande del mundo"),
    ("T08", 2.0, 1.9, 43, "", " m", "de caída"),
    ("T13", 0.3, 1.9, 2000, "+", "", "glifos mayas en la escalinata"),
    ("TMM", 2.4, 1.8, 1, "", ".ª", "denominación de origen de Centroamérica"),
]


def rampa(u):  # rápido en las uniones, cámara lenta en el centro; g(0)=0, g(1)=1, monótona
    u = min(1.0, max(0.0, u))
    return u + A_RAMPA * math.sin(2 * math.pi * u) / (2 * math.pi)


def d_rampa(u):
    return 1 + A_RAMPA * math.cos(2 * math.pi * u)


# ---------- clips ----------
def perfil_movimiento(ruta):
    c = cv2.VideoCapture(str(ruta)); prev, d = None, []
    while True:
        ok, f = c.read()
        if not ok: break
        g = cv2.cvtColor(cv2.resize(f, (96, 168)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev is not None: d.append(float(np.abs(g - prev).mean()))
        prev = g
    return np.array(d), c.get(cv2.CAP_PROP_FPS) or 24


def quieto(ruta, cache):
    """Segundos quietos al inicio y al final del clip (MiniMax sostiene las imágenes de inicio/fin)."""
    clave = str(ruta)
    if clave not in cache:
        d, fps = perfil_movimiento(ruta)
        u = max(.35, .08 * float(np.median(d)))
        i = 0
        while i < len(d) and d[i] < u: i += 1
        j = len(d)
        while j > 0 and d[j - 1] < u: j -= 1
        cache[clave] = [min(i / fps, 1.5), min((len(d) - j) / fps, 1.5)]
    return cache[clave]


class Clip:
    def __init__(self, ruta, ini=0.0, fin=None):
        self.cap = cv2.VideoCapture(str(ruta)); self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 24
        self.n = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT)); self.dur = self.n / self.fps
        self.ini, self.fin = ini, (fin if fin is not None else self.dur)
        self.idx, self.mem = -1, OrderedDict()

    def _lee(self, k):
        if k in self.mem: return self.mem[k]
        if k <= self.idx or k > self.idx + 40:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, k); self.idx = k - 1
        fr = None
        while self.idx < k:
            ok, f = self.cap.read()
            if not ok: break
            self.idx += 1; fr = f
            self.mem[self.idx] = f
            if len(self.mem) > 8: self.mem.popitem(last=False)
        return self.mem.get(k, fr if fr is not None else next(reversed(self.mem.values())))

    def cuadro(self, ts, mezcla=0.0):
        """Cuadro en ts (s). Con mezcla>0 promedia los vecinos: desenfoque de movimiento en lo rápido."""
        x = min(self.n - 1, max(0, ts * self.fps)); k = int(x)
        a = self._lee(k); b = self._lee(min(self.n - 1, k + 1)); f = x - k
        fr = cv2.addWeighted(a, 1 - f, b, f, 0) if f > .05 else a  # interpolación entre cuadros
        if mezcla > 0:
            c = self._lee(min(self.n - 1, k + 2)); p = self._lee(max(0, k - 1))
            fr = cv2.addWeighted(fr, 1 - mezcla, cv2.addWeighted(p, .5, c, .5, 0), mezcla, 0)
        return fr


def plan(D):
    cache_f = D / "v4" / "quieto.json"; cache = json.load(open(cache_f)) if cache_f.exists() else {}
    t, out = 0.0, {}
    for s in SEGMENTOS:
        nombre, arch, vel, rmp = s[:4]
        c = Clip(D / arch, *(s[4:6] if len(s) > 4 else ()))
        if rmp:
            q0, q1 = quieto(D / arch, cache); c.ini += q0; c.fin -= q1
        dur = DUR_FIJA.get(nombre, (c.fin - c.ini) / vel) + EXTRA.get(nombre, 0)
        out[nombre] = dict(t0=t, dur=dur, clip=c, vel=(c.fin - c.ini) / dur, rampa=rmp)
        t += dur
    json.dump(cache, open(cache_f, "w"), indent=1)
    out["LOGO"] = dict(t0=t, dur=LOGO_DUR)
    return out, t + LOGO_DUR


def dur_audio(ruta):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(ruta), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                         capture_output=True).stdout
    return len(pcm) / 16000


def en_linea(P, seg, ts):
    """Segundo de la línea final en que se ve el segundo ts del clip del segmento (invierte la rampa)."""
    s = P[seg]; c = s["clip"]; obj = (ts - c.ini) / (c.fin - c.ini); lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2; lo, hi = (mid, hi) if rampa(mid) < obj else (lo, mid)
    return s["t0"] + s["dur"] * lo


def cuadro_en(P, orden, t):
    seg = max((n for n in orden if P[n]["t0"] <= t), key=lambda n: P[n]["t0"])
    s = P[seg]; c = s["clip"]; u = (t - s["t0"]) / s["dur"]
    if s["rampa"]:
        ts = c.ini + (c.fin - c.ini) * rampa(u)
        v = s["vel"] * d_rampa(u)  # velocidad instantánea respecto al clip
        mezcla = min(.55, max(0.0, (v - 1.6) * .45))
    else:
        ts = c.ini + min(u, 1.0) * (c.fin - c.ini - 1 / c.fps); mezcla = 0
    fr = c.cuadro(ts, mezcla)
    if seg in CORTES:  # latigazo: desenfoque vertical que crece hacia el corte y se abre después
        cerca = 1 - abs(ts - CORTES[seg]) / .2
        if cerca > 0:
            n = int(9 + 70 * cerca) | 1; ker = np.zeros((n, 1), np.float32); ker[:, 0] = 1 / n
            fr = cv2.filter2D(fr, -1, ker)
    return seg, fr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir"); ap.add_argument("--fuentes"); ap.add_argument("--sal")
    ap.add_argument("--hasta", type=float, default=None); ap.add_argument("--revisa")
    ap.add_argument("--solo-plan", action="store_true")
    a = ap.parse_args()
    if a.revisa: return revisa(a.revisa)
    D = Path(a.dir)
    P, FIN = plan(D)
    print("duración", round(FIN, 2), {k: round(v["t0"], 2) for k, v in P.items()})
    voces = []
    for seg, off, arch, ini, fin in VOZ:
        largo = (fin if fin is not None else dur_audio(D / arch)) - ini
        voces.append((P[seg]["t0"] + off, P[seg]["t0"] + off + largo, seg))
    for (a0, a1, s0), (b0, b1, s1) in zip(voces, voces[1:]):
        print(f"  voz {s0:5s} {a0:6.2f}–{a1:6.2f}" + ("   ¡SE PISA con " + s1 + "!" if a1 > b0 - .15 else ""))
    if a.solo_plan: return
    if a.hasta: FIN = min(FIN, a.hasta)
    mg = MG(a.fuentes, D / "honduras_contorno.json"); mg.LUGARES = LUGARES
    logo = np.array(Image.open(D / "logo_hs.jpg").convert("RGB"))

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
    orden = [s[0] for s in SEGMENTOS]
    for k in range(int(FIN * FPS)):
        t = k / FPS
        if t >= P["LOGO"]["t0"]:
            fr = mg.logo(t - P["LOGO"]["t0"], logo)
        else:
            seg, fr = cuadro_en(P, orden, t)
            fr = a_vertical(fr)
            if seg == "hook":  # cámara viva en el gancho
                z = 1 + .30 * (1 - min(1, t / .55)) ** 3 + (.14 if t > 6.9 else 0) + .05 * t / 6.9 + .02 * math.sin(t * 1.3)
                M = cv2.getRotationMatrix2D((W / 2 + 30 * math.sin(t * .45), H * .42), 0, z); fr = cv2.warpAffine(fr, M, (W, H), borderMode=cv2.BORDER_REFLECT)
            elif not P[seg]["rampa"]:  # guara hablando: empuje lento para que la cámara nunca esté muerta
                tl = t - P[seg]["t0"]; u = tl / P[seg]["dur"]; z = 1.03 + .13 * u + .015 * math.sin(tl * 1.1)
                M = cv2.getRotationMatrix2D((W / 2 + 40 * math.sin(tl * .5), H * .45), 0, z); fr = cv2.warpAffine(fr, M, (W, H), borderMode=cv2.BORDER_REFLECT)
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
            if t > P["LOGO"]["t0"] - .5:
                fr = (fr * max(0, (P["LOGO"]["t0"] - t) / .5)).astype(np.uint8)
        ff.stdin.write(np.ascontiguousarray(fr).tobytes())
    ff.stdin.close(); ff.wait()
    json.dump({k: [v["t0"], v["dur"]] for k, v in P.items()}, open(Path(a.sal).with_suffix(".plan.json"), "w"))
    mezcla(D, P, FIN, tmp, a.sal)
    tmp.unlink()


def mezcla(D, P, FIN, tmp, sal):
    """Voz + música Odesza + canto garífuna + diseño sonoro inmersivo."""
    T = lambda s, off=0: P[s]["t0"] + off
    F = lambda s, f: P[s]["t0"] + P[s]["dur"] * f
    pistas = []  # (archivo, inicio, ini, fin, volumen, bucle, tipo)
    for seg, off, arch, ini, fin in VOZ:
        pistas.append((arch, T(seg, off), ini, fin, 1.0, False, "voz"))
    amb = [("audio2/a_playa.mp3", T("hook"), T("T01"), .5), ("audio2/a_picada.mp3", T("T02"), F("T01", .6), .5),
           ("audio4/burbujas.mp3", F("T01", .62), F("T07", .45), 1.3),       # bajo el agua: respiración y burbujas
           ("audio2/a_rapidos.mp3", F("T07", .45), T("T08"), .55),
           ("audio4/cascada.mp3", T("T08"), F("T09", .45), .85),               # rugido de Pulhapanzak
           ("audio2/a_selva.mp3", F("T09", .45), T("T13"), .45),
           ("audio2/a_barro.mp3", T("T16"), T("T17"), .7), ("audio2/a_fritura.mp3", T("T17"), T("TYC"), .4),
           ("audio2/a_playa.mp3", T("TYC"), F("TCB", .6), .35), ("audio2/a_fritura.mp3", F("TCB", .5), F("TBM", .5), .45),
           ("audio2/a_selva.mp3", F("T19", .45), T("T21"), .35), ("audio2/a_viento.mp3", T("T21"), T("LOGO"), .8)]
    for f, t0, t1, vol in amb:
        pistas.append((f, t0, 0, t1 - t0 + .2, vol, True, "amb"))
    golpes = [("audio/sfx_guara.mp3", T("T02", .2), .9), ("audio/sfx_swish.mp3", T("T02") - .45, .45),
              ("audio4/splash.mp3", F("T01", .6), 1.0),                       # chapuzón al entrar al agua
              ("audio/sfx_sale_agua.mp3", F("T07", .42), .9),
              ("audio/sfx_whoosh.mp3", F("T13", .45), .5), ("audio/sfx_swish.mp3", en_linea(P, "T06", CORTES["T06"]) - .45, .5),
              ("audio/sfx_swish.mp3", T("T16", .3), .45), ("audio/sfx_whoosh.mp3", T("TYC", .3), .5),
              ("audio/sfx_swish.mp3", T("TCB", .2), .4),
              ("audio4/cafe.mp3", T("TMM", .05), 1.1),                         # café vertiéndose
              ("audio/sfx_whoosh.mp3", T("T19", .4), .45),
              ("audio/sfx_guara.mp3", F("T21", .5), .7), ("audio2/sfx_logo.mp3", T("LOGO") - .15, .8)]
    for f, t0, vol in golpes:
        pistas.append((f, t0, 0, 4.0, vol, False, "golpe"))
    # canto garífuna: entra con el tambor y sale al llegar a La Campa
    g0, g1 = F("T13", .35), T("T16", .4)
    pistas.append(("audio4/garifuna.mp3", g0, 0, g1 - g0, 1.0, True, "gari"))

    entradas = ["-i", str(tmp), "-i", str(D / "audio4" / "musica_odesza.mp3")]
    for f, *_r in pistas:
        if _r[4]: entradas += ["-stream_loop", "-1"]
        entradas += ["-i", str(D / f)]
    fc, voz, amb_l, gol, gari = [], [], [], [], []
    for i, (f, t0, ini, fin, vol, bucle, tipo) in enumerate(pistas):
        ms = int(t0 * 1000)
        cad = f"[{i+2}:a]" + ("silenceremove=start_periods=1:start_threshold=-40dB," if tipo == "golpe" else "")
        cad += f"atrim={ini:.2f}" + (f":{fin:.2f}" if fin is not None else "") + ",asetpts=PTS-STARTPTS,"
        if tipo != "voz": cad += "afade=t=in:d=0.15,"
        if tipo in ("amb", "gari"): cad += f"afade=t=out:st={max(0, fin - ini - .5):.2f}:d=0.5,"
        cad += f"volume={vol},adelay={ms}|{ms},aresample=48000,aformat=channel_layouts=mono[p{i}]"
        fc.append(cad); {"voz": voz, "amb": amb_l, "golpe": gol, "gari": gari}[tipo].append(f"[p{i}]")
    fc.append("".join(voz) + f"amix=inputs={len(voz)}:normalize=0,asplit=4[v1][v2][v3][v4]")
    # música: entra suave bajo el gancho, sube en el despegue; baja bajo el canto garífuna
    m_on, gd0, gd1 = T("T02"), g0, g1
    vol = (f"if(lt(t,{m_on:.2f}),0.45,if(between(t,{gd0:.2f},{gd1:.2f}),0.35,0.9))")
    # la pista tiene su golpe a los 8 s: se retrasa para que caiga justo en el despegue de la guara
    md = max(0.0, m_on - MUSICA_GOLPE); mms = int(md * 1000)
    fc.append(f"[1:a]aresample=48000,aformat=channel_layouts=mono,afade=t=in:d=0.8,adelay={mms}|{mms},"
              f"atrim=0:{FIN:.2f},volume='{vol}':eval=frame,afade=t=out:st={FIN - 2.5:.2f}:d=2.5[mu]")
    fc.append("[mu][v2]sidechaincompress=threshold=0.07:ratio=4:attack=20:release=350[mx]")
    fc.append("".join(amb_l) + f"amix=inputs={len(amb_l)}:normalize=0[am]")
    fc.append("[am][v3]sidechaincompress=threshold=0.1:ratio=2.5:attack=30:release=400[amd]")
    fc.append(f"{gari[0]}[v4]sidechaincompress=threshold=0.08:ratio=3:attack=20:release=300[gd]")
    todo = ["[v1]", "[mx]", "[amd]", "[gd]"] + gol
    fc.append("".join(todo) + f"amix=inputs={len(todo)}:normalize=0,loudnorm=I=-14:TP=-1.5,aresample=48000,atrim=0:{FIN:.2f}[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *entradas, "-filter_complex", ";".join(fc),
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ac", "2", "-b:a", "192k", sal], check=True)


def revisa(ruta, rel=.25, min_seg=.3):
    """Lista los tramos donde la imagen casi no cambia (congelados) en un render final.
    Umbral relativo a la mediana: el grano y los rótulos impiden que un congelado llegue a 0."""
    d, fps = perfil_movimiento(ruta)
    umbral = max(.6, rel * float(np.median(d)))
    d = np.convolve(d, np.ones(3) / 3, mode="same")  # que un cuadro repetido suelto no cuente
    malos, i = [], 0
    while i < len(d):
        if d[i] < umbral:
            j = i
            while j < len(d) and d[j] < umbral: j += 1
            if (j - i) / fps >= min_seg: malos.append((round(i / fps, 2), round((j - i) / fps, 2)))
            i = j
        else: i += 1
    print("congelados (inicio s, duración s):", malos or "ninguno")
    return malos


if __name__ == "__main__":
    main()
