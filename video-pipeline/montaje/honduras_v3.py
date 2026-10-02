"""Honduras Secreta v3 — un solo viaje continuo siguiendo a la guara.

Las transiciones están DENTRO de los clips (MiniMax con imagen de inicio y de fin), así que el montaje
empalma tramos cuyo último cuadro es el primero del siguiente. Cada tramo se reproduce con una rampa
lento→rápido→lento (las uniones van lentas y casan; el centro vuela), estilo Sam Kolder.
Encima: motion graphics de marca (honduras_mg), subtítulos con la palabra activa, grade de cine.

    python3 montaje/honduras_v3.py --dir HN --fuentes FUENTES --sal salida.mp4 [--hasta SEG]
"""
import argparse, json, math, subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from honduras_mg import MG, compone, W, H

FPS = 30
# (nombre, archivo relativo a --dir, velocidad media, intensidad de rampa 0..1)
SEGMENTOS = [
    ("hook",   "v3/GU_hook_habla.mp4",           1.00, 0.0),
    ("T02",    "v3/T02_despegue.mp4",            1.65, 0.6),
    ("T03",    "v3/T03_vuelo_playa.mp4",         1.70, 0.6),
    ("T01",    "v3/T_R01_R02.mp4",               1.60, 0.6),
    ("T05",    "v3/T05_arrecife_tiburones.mp4",  1.50, 0.5),
    ("T06",    "v3/T06_tiburones_ballena.mp4",   1.50, 0.5),
    ("T07",    "v3/T07_sale_rapidos.mp4",        1.30, 0.6),
    ("T08",    "v3/T08_rio_cascada.mp4",         1.80, 0.6),
    ("T09",    "v3/T09_niebla_copan.mp4",        1.60, 0.6),
    ("GC",     "v3/GC_habla.mp4",                1.00, 0.0),
    ("T11",    "v3/T11_estela_escalinata.mp4",   1.60, 0.6),
    ("T13",    "v3/T13_escalinata_tambor.mp4",   1.30, 0.6),
    ("T15",    "v3/T15_tambor_pies.mp4",         1.40, 0.4),
    ("T16",    "v3/T16_falda_lenca.mp4",         1.30, 0.6),
    ("T17",    "v3/T17_olla_plato.mp4",          1.30, 0.6),
    ("B01",    "clips/B01.mp4",                  1.00, 0.0, 1.0, 2.3),   # baleada: tramo corto del clip
    ("T19",    "v3/T19_cafe_mosquitia.mp4",      1.80, 0.6),
    ("T20",    "v3/T20_rio_viajera.mp4",         1.80, 0.6),
    ("T21",    "v3/T21_aterriza_guara.mp4",      1.20, 0.4),
    ("GU2",    "v3/GU2_habla.mp4",               1.00, 0.0),
]
LOGO_DUR = 4.2

# Voz: (segmento, desfase en s, archivo, ini, fin) — ini/fin dentro del audio
VOZ = [
    ("hook", 0.00, "voz/hook_guara.mp3", 0, None),
    ("T01", 0.45, "voz/t3.mp3", 7.10, 10.95),    # Aquí el mar es parte del segundo arrecife más grande del mundo…
    ("T05", 2.40, "voz/t3.mp3", 10.95, 13.00),   # y los tiburones son de verdad.
    ("T07", 0.55, "voz/t3.mp3", 13.05, 16.15),   # Salimos del agua… y el río te sacude el alma,
    ("T08", 1.20, "voz/t3.mp3", 16.15, 18.30),   # cascadas de 43 metros.
    ("GC", 0.00, "voz/guara_copan.mp3", 0, None),
    ("T13", 1.60, "voz/t3.mp3", 22.95, 25.68),   # En Tela, el tambor garífuna te mueve los pies.
    ("T16", 0.60, "voz/t3.mp3", 25.68, 29.05),   # En La Campa, manos lencas hacen arte sin torno.
    ("T17", 1.10, "voz/t3.mp3", 29.10, 32.55),   # Pescado frito en el Lago de Yojoa… una baleada recién hecha…
    ("T19", 0.00, "voz/t3.mp3", 32.55, 36.85),   # y el café de Marcala, la primera denominación de origen…
    ("T20", 0.30, "voz/t3.mp3", 36.85, 40.75),   # En La Mosquitia, uno de los últimos bosques lluviosos…
    ("GU2", 0.00, "voz/guara_cierre.mp3", 0, None),
]

# Rótulos: (segmento, desfase, duración, título, subtítulo, coordenadas, índice en el mapa)
ROTULOS = [
    ("T01", 0.3, 2.6, "ROATÁN", "Islas de la Bahía", "16.3°N  86.6°W", 0),
    ("T06", 2.0, 2.4, "UTILA", "tiburón ballena", "16.1°N  86.9°W", 1),
    ("T07", 2.4, 2.2, "RÍO CANGREJAL", "La Ceiba · rápidos clase IV", "15.7°N  86.7°W", 2),
    ("T08", 1.6, 2.3, "PULHAPANZAK", "Cortés", "15.0°N  88.0°W", 3),
    ("T09", 2.6, 6.6, "COPÁN RUINAS", "Patrimonio de la Humanidad · 1980", "14.8°N  89.1°W", 4),
    ("T13", 2.4, 4.5, "TRIUNFO DE LA CRUZ", "Tela · cultura garífuna", "15.8°N  87.4°W", 5),
    ("T16", 2.2, 2.6, "LA CAMPA", "Lempira · cerámica lenca", "14.5°N  88.6°W", 6),
    ("T17", 2.0, 3.2, "LAGO DE YOJOA", "pescado frito", "14.9°N  88.0°W", 7),
    ("T19", 0.1, 1.9, "MARCALA", "La Paz · café de altura", "14.2°N  88.0°W", 8),
    ("T19", 2.1, 3.6, "LA MOSQUITIA", "Biosfera del Río Plátano", "15.7°N  85.0°W", 9),
]
# Cifras: (segmento, desfase, duración, valor, prefijo, sufijo, texto)
CIFRAS = [
    ("T01", 2.4, 2.0, 2, "", ".º", "arrecife más grande del mundo"),
    ("T08", 2.0, 1.9, 43, "", " m", "de caída"),
    ("T13", 0.3, 1.9, 2000, "+", "", "glifos mayas en la escalinata"),
    ("T19", 0.6, 1.5, 1, "", ".ª", "denominación de origen de Centroamérica"),
]


def ease(u, k):  # rampa lento→rápido→lento con intensidad k
    u = min(1.0, max(0.0, u)); s = u * u * (3 - 2 * u)
    return (1 - k) * u + k * s


class Clip:
    def __init__(self, ruta, ini=0.0, fin=None):
        self.cap = cv2.VideoCapture(str(ruta)); self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 24
        self.n = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT)); self.dur = self.n / self.fps
        self.ini, self.fin = ini, (fin if fin is not None else self.dur)
        self.idx, self.img = -1, None

    def cuadro(self, ts):
        k = int(min(self.n - 1, max(0, round(ts * self.fps))))
        if k < self.idx or k > self.idx + 40:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, k); self.idx = k - 1
        while self.idx < k:
            ok, fr = self.cap.read()
            if not ok: break
            self.idx += 1; self.img = fr
        return self.img


def a_vertical(fr):  # cualquier clip → 1080×1920 llenando el cuadro
    h, w = fr.shape[:2]; s = max(W / w, H / h)
    fr = cv2.resize(fr, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_LANCZOS4)
    y0 = (fr.shape[0] - H) // 2; x0 = (fr.shape[1] - W) // 2
    return fr[y0:y0 + H, x0:x0 + W]


def plan(D):
    """Calcula inicio/duración de cada segmento en la línea de tiempo final."""
    t, out = 0.0, {}
    for s in SEGMENTOS:
        nombre, arch, vel, k = s[:4]
        c = Clip(D / arch, *(s[4:6] if len(s) > 4 else ()))
        dur = (c.fin - c.ini) / vel
        if nombre == "hook": dur = min(dur, 9.95)
        if nombre == "GU2": dur += .7  # que «imaginas» respire antes del fundido al logo
        out[nombre] = dict(t0=t, dur=dur, clip=c, vel=vel, k=k)
        t += dur
    out["LOGO"] = dict(t0=t, dur=LOGO_DUR)
    return out, t + LOGO_DUR


def palabras_de(D, archivo, ini, fin, desplaza):
    """Palabras con tiempos (Whisper, cacheado) del tramo [ini, fin] del audio, movidas a la línea final."""
    cache = D / "voz" / (Path(archivo).stem + "_palabras.json")
    if not cache.exists():
        from faster_whisper import WhisperModel
        m = WhisperModel("small", compute_type="int8")
        segs, _ = m.transcribe(str(D / archivo), language="es", word_timestamps=True)
        json.dump([[w.start, w.end, w.word.strip()] for s in segs for w in s.words], open(cache, "w"), ensure_ascii=False)
    fixes = {"Yohua": "Yojoa", "Yohua,": "Yojoa,", "tela,": "Tela,", "tela": "Tela", "campa,": "Campa,", "malla": "maya",
             "Copán,": "Copán,", "Mosquitia,": "Mosquitia,", "Maya": "maya", "Escritura": "escritura"}
    ps = []
    for a, b, w in json.load(open(cache)):
        if a >= ini - .05 and (fin is None or b <= fin + .1):
            w = fixes.get(w, w)
            ps.append([a - ini + desplaza, b - ini + desplaza, w])
    for i in range(1, len(ps)):  # «la Campa», «la Mosquitia» con mayúscula
        if ps[i][2].startswith(("Campa", "Mosquitia")) and ps[i - 1][2] == "la": ps[i - 1][2] = "La"
    return ps


def bloques(ps, maxp=5):
    """Agrupa palabras en bloques de subtítulo (corta en puntuación o cada maxp palabras)."""
    out, cur = [], []
    for p in ps:
        cur.append(p)
        if p[2][-1:] in ".,…?!" or len(cur) >= maxp:
            out.append(cur); cur = []
    if cur: out.append(cur)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True); ap.add_argument("--fuentes", required=True)
    ap.add_argument("--sal", required=True); ap.add_argument("--hasta", type=float, default=None)
    a = ap.parse_args()
    D = Path(a.dir)
    P, FIN = plan(D)
    if a.hasta: FIN = min(FIN, a.hasta)
    print("duración", round(FIN, 2), {k: round(v["t0"], 2) for k, v in P.items()})
    mg = MG(a.fuentes, D / "honduras_contorno.json")
    logo = np.array(Image.open(D / "logo_hs.jpg").convert("RGB"))

    # subtítulos con tiempos finales
    subs = []
    for seg, off, arch, ini, fin in VOZ:
        ps = palabras_de(D, arch, ini, fin, P[seg]["t0"] + off)
        subs += bloques(ps)
    subs = [(b[0][0], (subs[i + 1][0][0] if i + 1 < len(subs) and subs[i + 1][0][0] - b[-1][1] < .6 else b[-1][1] + .35), b)
            for i, b in enumerate(subs)]

    # grade de cine
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
            seg = max((n for n in orden if P[n]["t0"] <= t), key=lambda n: P[n]["t0"])
            s = P[seg]; c = s["clip"]; u = (t - s["t0"]) / s["dur"]
            if s["k"] == 0:  # tramos con voz sincronizada: tiempo real, y el último cuadro se sostiene si sobra
                ts = c.ini + min((t - s["t0"]) * s["vel"], c.fin - c.ini - 1 / c.fps)
            else:
                ts = c.ini + (c.fin - c.ini) * ease(u, s["k"])
            fr = a_vertical(c.cuadro(ts))
            if seg == "hook":  # cámara viva en el gancho: entrada con zoom y punch-in en «déjame»
                z = 1 + .30 * (1 - min(1, t / .55)) ** 3 + (.14 if t > 6.9 else 0) + .02 * math.sin(t * 1.3)
                M = cv2.getRotationMatrix2D((W / 2, H * .42), 0, z); fr = cv2.warpAffine(fr, M, (W, H), borderMode=cv2.BORDER_REFLECT)
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
            if t > P["LOGO"]["t0"] - .5:  # fundido a negro hacia el logo
                fr = (fr * max(0, (P["LOGO"]["t0"] - t) / .5)).astype(np.uint8)
        ff.stdin.write(np.ascontiguousarray(fr).tobytes())
    ff.stdin.close(); ff.wait()
    json.dump({k: [v["t0"], v["dur"]] for k, v in P.items()}, open(Path(a.sal).with_suffix(".plan.json"), "w"))
    mezcla(D, P, FIN, tmp, a.sal)
    tmp.unlink()


def mezcla(D, P, FIN, tmp, sal):
    """Voz + música + diseño sonoro por segmento."""
    T = lambda s, off=0: P[s]["t0"] + off
    pistas = []  # (archivo, inicio en la línea, ini, fin, volumen, bucle, golpe)
    for seg, off, arch, ini, fin in VOZ:
        pistas.append((arch, T(seg, off), ini, fin, 1.0, False, "voz"))
    amb = [("audio2/a_playa.mp3", "hook", "T02", .5), ("audio2/a_picada.mp3", "T02", "T01", .5),
           ("audio/sfx_bajo_agua.mp3", "T05", "T07", .45), ("audio2/a_rapidos.mp3", "T07", "T08", .55),
           ("audio2/a_cascada.mp3", "T08", "GC", .45), ("audio2/a_selva.mp3", "GC", "T13", .45),
           ("audio2/a_aplausos.mp3", "T15", "T16", .25), ("audio2/a_barro.mp3", "T16", "T17", .7),
           ("audio2/a_fritura.mp3", "T17", "T19", .4), ("audio2/a_cafe.mp3", "T19", "T20", 1.2),
           ("audio2/a_selva.mp3", "T20", "T21", .35), ("audio2/a_viento.mp3", "T21", "LOGO", .8)]
    for f, s0, s1, vol in amb:
        pistas.append((f, T(s0), 0, T(s1) - T(s0) + .2, vol, True, "amb"))
    golpes = [("audio/sfx_guara.mp3", T("T02", .2), .9), ("audio/sfx_swish.mp3", T("T02") - .45, .45),
              ("audio/sfx_bajo_agua.mp3", T("T01", P["T01"]["dur"] * .62), .6),
              ("audio/sfx_sale_agua.mp3", T("T07", P["T07"]["dur"] * .45), .9),
              ("audio/sfx_whoosh.mp3", T("T13", P["T13"]["dur"] * .45), .6),
              ("audio/sfx_swish.mp3", T("T16", .3), .45), ("audio/sfx_whoosh.mp3", T("T17", .5), .45),
              ("audio/sfx_guara.mp3", T("T21", P["T21"]["dur"] * .5), .7), ("audio2/sfx_logo.mp3", T("LOGO") - .15, .8)]
    for f, t0, vol in golpes:
        pistas.append((f, t0, 0, 3.0, vol, False, "golpe"))
    # música: musica_v3b desde 7 s (su golpe del s17 cae en el despegue, t≈10) y, para el cierre, la salida
    # suave de musica_b (50–68 s) entrando en fundido cruzado bajo la viajera y la guara.
    entradas = ["-i", str(tmp), "-ss", "7.0", "-i", str(D / "audio" / "musica_v3b.mp3"),
                "-ss", "50.0", "-i", str(D / "audio" / "musica_b.mp3")]
    for f, *_r in pistas:
        if _r[4]: entradas += ["-stream_loop", "-1"]
        entradas += ["-i", str(D / f)]
    fc, voz, amb_l, gol = [], [], [], []
    for i, (f, t0, ini, fin, vol, bucle, tipo) in enumerate(pistas):
        ms = int(t0 * 1000)
        cad = f"[{i+3}:a]" + ("silenceremove=start_periods=1:start_threshold=-40dB," if tipo == "golpe" else "")
        cad += f"atrim={ini:.2f}" + (f":{fin:.2f}" if fin is not None else "") + ",asetpts=PTS-STARTPTS,"
        if tipo != "voz": cad += "afade=t=in:d=0.15,"
        if tipo == "amb": cad += f"afade=t=out:st={max(0, fin - ini - .4):.2f}:d=0.4,"
        cad += f"volume={vol},adelay={ms}|{ms},aresample=48000,aformat=channel_layouts=mono[p{i}]"
        fc.append(cad); {"voz": voz, "amb": amb_l, "golpe": gol}[tipo].append(f"[p{i}]")
    fc.append("".join(voz) + f"amix=inputs={len(voz)}:normalize=0,asplit=3[v1][v2][v3]")
    xf = T("T20", 1.0)  # inicio del fundido cruzado a la salida suave
    fc.append(f"[1:a]aresample=48000,aformat=channel_layouts=mono,atrim=0:{xf + 2.5:.2f},volume='if(lt(t,9.9),0.55,0.85)':eval=frame,"
              f"afade=t=out:st={xf:.2f}:d=2.5[m1]")
    fc.append(f"[2:a]aresample=48000,aformat=channel_layouts=mono,atrim=0:{FIN - xf + 1:.2f},volume=1.1,afade=t=in:d=2.5,"
              f"afade=t=out:st={FIN - xf - 2.2:.2f}:d=2.2,adelay={int(xf*1000)}|{int(xf*1000)}[m2]")
    fc.append("[m1][m2]amix=inputs=2:normalize=0[mu]")
    fc.append("[mu][v2]sidechaincompress=threshold=0.07:ratio=4:attack=20:release=350[mx]")
    fc.append("".join(amb_l) + f"amix=inputs={len(amb_l)}:normalize=0[am]")
    fc.append("[am][v3]sidechaincompress=threshold=0.1:ratio=2.5:attack=30:release=400[amd]")
    todo = ["[v1]", "[mx]", "[amd]"] + gol
    fc.append("".join(todo) + f"amix=inputs={len(todo)}:normalize=0,loudnorm=I=-14:TP=-1.5,aresample=48000,atrim=0:{FIN:.2f}[a]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *entradas, "-filter_complex", ";".join(fc),
                    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ac", "2", "-b:a", "192k", sal], check=True)


if __name__ == "__main__":
    main()
