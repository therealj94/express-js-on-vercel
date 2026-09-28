#!/usr/bin/env python3
"""Monta «Siete» con las tomas elegidas, las voces, el sonido y la música.

    python3 montaje/siete.py --tomas DIR --voces DIR --buk buk_voz.mp3 \
        --musica musica.mp3 --fuentes DIR --logo og_crema_4000.png \
        --morazan morazan.jpg -o siete.mp4

DIR/elegidas.json sale de montaje/elegir_siete.py. El orden y el sentido de
cada plano salen de prompts/pelicula4_siete.json. Lo que cambia frente al plan:
los planos con diálogo duran lo que dura la voz de la toma elegida (la boca y
la voz se generaron juntas, así que se usa su propio audio), y todo lo que
viene detrás se corre lo que haga falta. La narración de Lucía entra con el
mismo desfase que tenía en el plan respecto de su plano.

Todo se dibuja con Pillow (este ffmpeg no tiene drawtext) y se une con el
filtro concat, forzando los fotogramas exactos de cada segmento.
"""
from __future__ import annotations

import argparse, json, re, subprocess, tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS, SR = 1080, 1920, 30, 48000
RAIZ = Path(__file__).resolve().parent.parent
P = json.loads((RAIZ / "prompts/pelicula4_siete.json").read_text())
TOMA = {t["id"]: t for t in P["tomas"]}
VOZ = {v["id"]: v for v in P["voz"]}
CREMA, ORO, TINTA = (243, 236, 217), (214, 186, 112), (14, 30, 34)
GRADE = ("eq=contrast=1.05:saturation=1.02,"
         "curves=all='0/0.012 0.25/0.235 0.75/0.775 1/0.985',noise=alls=4:allf=t+u")

# Retícula 2-3-2, en el orden del mapa: GT BZ / SV HN NI / CR PA.
CELDAS = [("aurelio", 0, 0, 540), ("marcus", 540, 0, 540),
          ("lucia", 0, 640, 360), ("chepe", 360, 640, 360), ("mercedes", 720, 640, 360),
          ("andres", 0, 1280, 540), ("rosa", 540, 1280, 540)]
PAIS = {"aurelio": "GUATEMALA", "marcus": "BELICE", "lucia": "EL SALVADOR", "chepe": "HONDURAS",
        "mercedes": "NICARAGUA", "andres": "COSTA RICA", "rosa": "PANAMÁ"}
PRESENTA = {"aurelio": "g01", "marcus": "g02", "lucia": "g03", "chepe": "g04",
            "mercedes": "g05", "andres": "g06", "rosa": "g07"}
SUB_EN = {"P2": "Soy Marcus, pescador de Dangriga, Belice."}


def ff(*a: str) -> None:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)


def duracion(p: Path) -> float:
    e = subprocess.run(["ffmpeg", "-i", str(p)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", e).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


class F:
    def __init__(self, d: Path):
        t = lambda n, s: ImageFont.truetype(str(d / n), s)
        self.sub, self.lugar, self.mono = t("ManropeMedium.ttf", 46), t("Manrope.ttf", 34), t("JetBrainsMono.ttf", 34)
        self.monog, self.titulo, self.frase = t("JetBrainsMono.ttf", 64), t("FrauncesItalic.ttf", 150), t("Fraunces.ttf", 78)
        self.tarj, self.tarjc, self.chico = t("Manrope.ttf", 44), t("ManropeMedium.ttf", 32), t("Manrope.ttf", 26)
        self.cita = t("FrauncesItalic.ttf", 64)


def lienzo() -> Image.Image:
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def sombra(img: Image.Image, caja, r=28, fuerza=160, radio=24) -> Image.Image:
    s = lienzo()
    x0, y0, x1, y1 = caja
    ImageDraw.Draw(s).rounded_rectangle([x0, y0 + 12, x1, y1 + 12], r, fill=(0, 0, 0, fuerza))
    return Image.alpha_composite(img, s.filter(ImageFilter.GaussianBlur(radio)))


def envolver(d, txt, f, ancho):
    lineas, cur = [], ""
    for w in txt.split():
        prueba = (cur + " " + w).strip()
        if d.textlength(prueba, font=f) <= ancho or not cur:
            cur = prueba
        else:
            lineas.append(cur); cur = w
    return lineas + ([cur] if cur else [])


# --- capas (PNG a pantalla completa con transparencia) ---

def capa_sub(f: F, txt: str) -> Image.Image:
    img = lienzo(); d = ImageDraw.Draw(img)
    ls = envolver(d, txt, f.sub, 900)[-2:]
    y = 1500
    for l in ls:
        w = d.textlength(l, font=f.sub)
        x = (W - w) / 2
        for dx, dy in ((0, 3), (2, 2), (-2, 2)):
            d.text((x + dx, y + dy), l, font=f.sub, fill=(0, 0, 0, 170))
        d.text((x, y), l, font=f.sub, fill=(255, 255, 255, 255))
        y += 62
    return img


def capa_lugar(f: F, pais: str, ciudad: str, hora: str | None = None) -> Image.Image:
    img = lienzo(); d = ImageDraw.Draw(img)
    y = 150
    if hora:
        d.text((72, y), hora, font=f.mono, fill=(*ORO, 255)); y += 52
    d.rectangle([72, y + 8, 78, y + 84], fill=(*ORO, 255))
    d.text((98, y), pais, font=f.tarj, fill=(*CREMA, 255))
    d.text((98, y + 52), ciudad, font=f.lugar, fill=(*CREMA, 210))
    return img


def capa_ruta(f: F, hora: str, de: str, a: str, que: str) -> Image.Image:
    img = lienzo(); d = ImageDraw.Draw(img)
    d.text((72, 150), hora, font=f.mono, fill=(*ORO, 255))
    d.text((72, 200), f"{de}  →  {a}", font=f.tarj, fill=(*CREMA, 255))
    d.text((72, 256), que, font=f.lugar, fill=(*CREMA, 200))
    return img


def capa_tarjeta(f: F, titulo: str, lineas: list[str], y0=420, marca="Veta Wallet") -> Image.Image:
    img = lienzo()
    x0, x1 = 120, W - 120
    alto = 150 + 52 * len(lineas)
    img = sombra(img, (x0, y0, x1, y0 + alto))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x1, y0 + alto], 30, fill=(*TINTA, 238), outline=(*ORO, 150), width=2)
    d.ellipse([x0 + 36, y0 + 36, x0 + 84, y0 + 84], outline=(*ORO, 255), width=3)
    d.line([x0 + 48, y0 + 61, x0 + 57, y0 + 70, x0 + 73, y0 + 50], fill=(*ORO, 255), width=4)
    d.text((x0 + 108, y0 + 30), titulo, font=f.tarj, fill=(*CREMA, 255))
    d.text((x1 - 36 - d.textlength(marca, font=f.chico), y0 + 44), marca, font=f.chico, fill=(*ORO, 220))
    for i, l in enumerate(lineas):
        d.text((x0 + 108, y0 + 100 + 52 * i), l, font=f.tarjc, fill=(*CREMA, 215))
    return img


def capa_centro(f: F, txt: str, fuente, y=None, color=CREMA, sombra_=True, banda=False) -> Image.Image:
    img = lienzo(); d = ImageDraw.Draw(img)
    ls = envolver(d, txt, fuente, 900)
    alto = fuente.size * 1.25
    y = (H - alto * len(ls)) / 2 if y is None else y
    if banda:
        ancho = max(d.textlength(l, font=fuente) for l in ls)
        d.rounded_rectangle([(W - ancho) / 2 - 40, y - 24, (W + ancho) / 2 + 40, y + alto * len(ls) + 10],
                            24, fill=(*TINTA, 225), outline=(*ORO, 160), width=2)
    for l in ls:
        w = d.textlength(l, font=fuente)
        if sombra_:
            d.text(((W - w) / 2 + 2, y + 4), l, font=fuente, fill=(0, 0, 0, 160))
        d.text(((W - w) / 2, y), l, font=fuente, fill=(*color, 255))
        y += alto
    return img


def capa_costuras() -> Image.Image:
    img = lienzo(); d = ImageDraw.Draw(img)
    for y in (640, 1280):
        d.rectangle([0, y - 3, W, y + 3], fill=(*ORO, 255))
    for x, y0, y1 in ((540, 0, 640), (360, 640, 1280), (720, 640, 1280), (540, 1280, 1920)):
        d.rectangle([x - 3, y0, x + 3, y1], fill=(*ORO, 255))
    return img


def capa_paises(f: F) -> Image.Image:
    img = lienzo(); d = ImageDraw.Draw(img)
    for n, x, y, w in CELDAS:
        t = PAIS[n]
        d.text((x + 22, y + 22), t, font=f.chico, fill=(0, 0, 0, 150))
        d.text((x + 20, y + 20), t, font=f.chico, fill=(*CREMA, 240))
    return img


# --- segmentos ---

class Seg:
    def __init__(self, id_, dur, video, capas=(), audio_clip=None, nota=""):
        self.id, self.dur, self.video, self.capas = id_, dur, video, list(capas)
        self.audio_clip, self.nota = audio_clip, nota  # audio_clip: (ruta, desde, gan)
        self.t = 0.0


def v_clip(ruta: Path, desde: float = 0.0, lento: float = 1.0, zoom: bool = False):
    return ("clip", ruta, desde, lento, zoom)


def v_reticula(rutas: dict, desde: float = 0.0):
    return ("reticula", rutas, desde)


def v_imagen(ruta: Path):
    return ("imagen", ruta)


def v_negro():
    return ("negro",)


def render_video(s: Seg, out: Path, tmp: Path) -> None:
    n = round((s.t + s.dur) * FPS) - round(s.t * FPS)
    k = s.video[0]
    if k == "clip":
        _, ruta, desde, lento, zoom = s.video
        vf = f"setpts={lento}*PTS,fps={FPS},scale=-2:{H}:flags=lanczos,crop={W}:{H}"
        if zoom:
            vf += f",scale={int(W*1.08)}:{int(H*1.08)},zoompan=z='min(1+0.0009*on,1.06)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}"
        entrada = ["-ss", f"{desde:.3f}", "-i", str(ruta)]
        filtro = f"[0:v]{vf},{GRADE},tpad=stop_mode=clone:stop_duration=5[v]"
    elif k == "reticula":
        _, rutas, desde = s.video
        entrada, partes = [], []
        for i, (nombre, x, y, w) in enumerate(CELDAS):
            entrada += ["-ss", f"{desde:.3f}", "-i", str(rutas[nombre])]
            partes.append(f"[{i}:v]fps={FPS},scale={w}:640:force_original_aspect_ratio=increase,crop={w}:640:(iw-{w})/2:(ih-640)*0.3,"
                          f"tpad=stop_mode=clone:stop_duration=5[c{i}]")
        lay = "|".join(f"{x}_{y}" for _, x, y, _ in CELDAS)
        filtro = ";".join(partes) + ";" + "".join(f"[c{i}]" for i in range(7)) + \
            f"xstack=inputs=7:layout={lay},{GRADE}[v]"
    elif k == "imagen":
        entrada = ["-loop", "1", "-i", str(s.video[1])]
        filtro = (f"[0:v]scale={int(W*1.15)}:{int(H*1.15)}:force_original_aspect_ratio=increase,crop={int(W*1.15)}:{int(H*1.15)},"
                  f"zoompan=z='1+0.0012*on':d=1:x='iw/2-(iw/zoom/2)':y='ih/3-(ih/zoom/3)':s={W}x{H}:fps={FPS},{GRADE}[v]")
    else:
        entrada = ["-f", "lavfi", "-i", f"color=c=0x0a0c12:s={W}x{H}:r={FPS}"]
        filtro = "[0:v]null[v]"
    # Capas: (png, ini, fin) en segundos relativos al segmento, con fundido de 0,25 s.
    base = len([x for x in entrada if x == "-i"])
    ult = "[v]"
    for j, (img, a, b) in enumerate(s.capas):
        png = tmp / f"{s.id}_{j}.png"; img.save(png)
        entrada += ["-loop", "1", "-t", f"{s.dur + 0.5:.3f}", "-i", str(png)]
        fi = max(0.0, a); fo = max(fi + 0.3, b - 0.25)
        filtro += (f";[{base + j}:v]format=rgba,fade=t=in:st={fi:.2f}:d=0.25:alpha=1,"
                   f"fade=t=out:st={fo:.2f}:d=0.25:alpha=1[l{j}];{ult}[l{j}]overlay=0:0:format=auto[o{j}]")
        ult = f"[o{j}]"
    filtro += f";{ult}trim=end_frame={n},setpts=PTS-STARTPTS,format=yuv420p[fin]"
    ff(*entrada, "-filter_complex", filtro, "-map", "[fin]", "-frames:v", str(n), "-an",
       "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-r", str(FPS), str(out))


# --- el guion hecho segmentos ---

def armar(a, f: F) -> list[Seg]:
    el = json.loads((a.tomas / "elegidas.json").read_text())
    clip = lambda pid: a.tomas / "clips" / el[pid]["clip"]
    def toma_extra(pid, k):
        return a.tomas / "clips" / f"s7_{pid}_t{k}_00001_.mp4"
    def mejor_existente(pid):
        if pid in el:
            return clip(pid)
        for k in (1, 2, 3):
            if toma_extra(pid, k).exists():
                return toma_extra(pid, k)
        raise SystemExit(f"falta toma para {pid}")

    segs: list[Seg] = []

    # 1. Apertura: la voz de Bukele sobre el istmo, un país por golpe.
    buk = json.loads(a.buk_stt.read_text())
    palabras = [w for w in buk["words"] if w["type"] == "word"]
    frases = [(0.2, 2.9, "«Ya llegó el momento de que unamos Centroamérica.»"),
              (3.0, 7.6, "«Tal vez no logremos el proyecto completo, pero logremos al menos una integración aduanera…»"),
              (7.7, 10.2, "«…o alguna especie parecida de comunidad de naciones…»"),
              (10.2, 12.2, "«…así como la Unión Europea.»")]
    aereos = ["ap_guatemala", "ap_belice", "ap_elsalvador", "ap_honduras", "ap_nicaragua",
              "ap_costarica", "ap_panama", "ap_istmo"]
    cortes = [0.0, 1.5, 3.0, 4.5, 5.9, 7.3, 8.7, 10.1, 12.6]
    tag = capa_centro(f, "ARCHIVO · VOZ DE NAYIB BUKELE · FORO REGIONAL ESQUIPULAS · 2018", f.chico, y=1800)
    for i, ap in enumerate(aereos):
        a0, a1 = cortes[i], cortes[i + 1]
        capas = [(tag, 0, a1 - a0 + 1)]
        for (s0, s1, txt) in frases:
            if s0 < a1 and s1 > a0:
                capas.append((capa_sub(f, txt), max(0, s0 - a0), min(a1, s1) - a0 + (0.3 if s1 > a1 else 0)))
        for (pal, t0) in (("INTEGRACIÓN ADUANERA", 6.06), ("COMUNIDAD DE NACIONES", 9.32)):
            if a0 <= t0 < a1:
                capas.append((capa_centro(f, pal, f.monog, y=860, color=ORO), t0 - a0, a1 - a0 + 0.3))
        segs.append(Seg(ap, a1 - a0, v_clip(mejor_existente(ap), 0.6, lento=1.15), capas, nota="bukele"))
    segs.append(Seg("g00", 0.9, v_negro(), [(capa_centro(f, "05:59", f.monog, color=CREMA), 0.1, 1.0)]))

    def dialogo(pid, capas_extra=(), sub=None, lugar=None):
        e = el[pid]
        ini, fin = e["voz"]
        desde = max(0.0, ini - 0.35)
        dur = (fin + 0.45) - desde
        dur = min(dur, duracion(clip(pid)) - desde)
        linea = TOMA[pid]["linea"]
        txt = sub or SUB_EN.get(linea) or VOZ[linea]["escrito"]
        capas = [(capa_sub(f, txt), ini - desde - 0.1, dur + 1)] + list(capas_extra)
        if lugar:
            capas.append((lugar, 0.1, dur + 1))
        return Seg(pid, dur, v_clip(clip(pid), desde), capas, audio_clip=(clip(pid), desde, 1.0))

    # 2. Las presentaciones.
    for n in ("aurelio", "marcus", "lucia", "chepe", "mercedes", "andres", "rosa"):
        pid = PRESENTA[n]
        pais, ciudad = TOMA[pid]["texto"].strip("«»").split(" · ")
        segs.append(dialogo(pid, lugar=capa_lugar(f, pais, " ".join(w if w in ("de",) else w.capitalize() for w in ciudad.lower().split()), "05:59")))

    # 06:00: las siete puertas a la vez.
    abre = {n: mejor_existente(f"abre_{n}") for n, *_ in CELDAS}
    segs.append(Seg("g08", 2.6, v_reticula(abre, 0.3),
                    [(capa_costuras(), 0, 3), (capa_paises(f), 0, 3),
                     (capa_centro(f, "06:00 · PANAMÁ 07:00", f.monog, color=CREMA, y=900, banda=True), 0.1, 3)], nota="cortina"))

    # 3. ORIGEN, Genesis ID y la app.
    vivos = {n: clip(PRESENTA[n]) for n, *_ in CELDAS}
    segs.append(Seg("o01", 6.52, v_reticula(vivos, 0.2),
                    [(capa_costuras(), 0, 7), (capa_paises(f), 0, 7),
                     (capa_centro(f, "ORIGEN", f.titulo, color=ORO), 5.2, 7)]))
    segs.append(Seg("o02", 5.06, v_clip(mejor_existente("o02"), 0.3),
                    [(capa_tarjeta(f, "1 ORIGEN", ["= el precio de 1/55 de gramo de oro", "Fórmula pública"], y0=1320, marca="ORIGEN"), 1.8, 6)]))
    segs.append(Seg("o03", 5.52, v_clip(mejor_existente("o03"), 0.3),
                    [(capa_tarjeta(f, "Genesis ID", ["Una sola verificación", "Ya sos parte del ecosistema", "Beta"], y0=1260), 1.4, 6)]))
    segs.append(Seg("o04", 5.72, v_reticula(vivos, 1.2),
                    [(capa_costuras(), 0, 6),
                     (capa_tarjeta(f, "Veta Wallet", ["Pagar · Cobrar", "Guardar · Comprobar", "Todo en una sola app"], y0=780), 0.8, 6)]))

    # 4. Seis pagos y una inversión.
    pagos = P["pagos"]
    nombres = {"AURELIO": "aurelio", "MARCUS": "marcus", "LUCÍA": "lucia", "CHEPE": "chepe",
               "MERCEDES": "mercedes", "ANDRÉS": "andres", "ROSA": "rosa"}
    for i, (hora, de, a_, que, la, lb) in enumerate(pagos, 1):
        pa, pb = f"p{i}a", f"p{i}b"
        segs.append(dialogo(pa, capas_extra=[(capa_ruta(f, hora, PAIS[nombres[de]], PAIS[nombres[a_]], que), 0.1, 9)]))
        if i < 7:
            tarj = capa_tarjeta(f, "Recibido", ["Comisión: US$ 0,01", "Llegó en segundos"], y0=300)
        else:
            tarj = capa_tarjeta(f, "Inversión recibida", ["Una parte de la cooperativa", "Cooperativa de café · Huehuetenango", "Ejemplo ilustrativo"], y0=300)
        s = dialogo(pb, capas_extra=[(tarj, 0.2, 9)])
        s.nota = "pago"
        segs.append(s)
        if i == 1:
            segs.append(Seg("p1n", 4.5, v_clip(mejor_existente("p1n"), 0.4),
                            [(capa_centro(f, "Comisión: US$ 0,01 · llegó en segundos", f.tarj, y=1500), 0.4, 5)]))

    # Lo que hace la inversión.
    k01 = mejor_existente("k01")
    segs.append(Seg("k01", 7.1, v_clip(k01, 0.2, lento=1.0)))
    pasaporte = capa_tarjeta(f, "Pasaporte del activo", ["Emisor: cooperativa de café", "Qué hay detrás: una parte de ella",
                                                         "Riesgo: puede perder valor", "Quién puede tenerla: reglas de Guatemala",
                                                         "Ejemplo ilustrativo"], y0=560, marca="ORIGEN")
    otra_k01 = next((toma_extra("k01", k) for k in (2, 1) if toma_extra("k01", k).exists() and toma_extra("k01", k) != k01), k01)
    segs.append(Seg("k02", 4.58, v_clip(otra_k01, 0.8), [(pasaporte, 0.2, 5)]))

    # 5. El día entero y la pregunta.
    horas = [p[0] for p in pagos]
    ruta = " → ".join(PAIS[nombres[p[1]]].title() for p in pagos) + " → Guatemala"
    img = lienzo(); d = ImageDraw.Draw(img)
    y = 520
    for hh, de, a_, *_ in pagos:
        d.text((150, y), hh, font=f.monog, fill=(*ORO, 255))
        d.text((380, y + 12), f"{PAIS[nombres[de]].title()} → {PAIS[nombres[a_]].title()}", font=f.tarj, fill=(*CREMA, 255))
        y += 110
    segs.append(Seg("r01", 6.96, v_clip(mejor_existente("ap_istmo") if not toma_extra("ap_istmo", 2).exists() else toma_extra("ap_istmo", 2), 0.5, lento=1.3),
                    [(img, 0.3, 7.2), (capa_centro(f, "Un día · siete países", f.lugar, y=1360), 0.6, 7.2)]))
    segs.append(Seg("r02", 5.32, v_negro(),
                    [(capa_centro(f, "¿Cuánto tardaría en moverse tu dinero?", f.frase), 0.3, 5.6)]))

    # 6. Morazán y los siete.
    segs.append(Seg("m01", 2.8, v_imagen(a.morazan), [(capa_centro(f, "Francisco Morazán (1792–1842)", f.lugar, y=1640), 0.2, 3.1)]))
    for j, (n, *_) in enumerate(CELDAS):
        segs.append(Seg(f"m02_{n}", 0.5, v_clip(clip(PRESENTA[n]), 0.5)))

    # 7. Lo que ganan los países.
    crece = ["k01", "abre_rosa", "p1n", "abre_mercedes", "abre_chepe", "abre_andres", "o02"]
    for j, pid in enumerate(crece):
        segs.append(Seg(f"k03_{j}", 8.15 / 7, v_clip(mejor_existente(pid) if pid != "k01" else otra_k01, 1.5 + 0.3 * j)))
    frases_k04 = ["El capital, del mundo.", "El trabajo, aquí.", "Las reglas, de casa."]
    capas = [(capa_costuras(), 0, 6)]
    for j, fr in enumerate(frases_k04):
        capas.append((capa_centro(f, fr, f.frase, y=640 + 190 * j, banda=True), 0.3 + 1.35 * j, 6))
    segs.append(Seg("k04", 5.52, v_reticula(vivos, 2.0), capas))

    # 8. El cierre: el Pacífico, las puertas se cierran, Lucía, Latinoamérica, logo.
    segs.append(Seg("f00a", 1.8, v_clip(mejor_existente("ci_pacifico"), 0.5, lento=1.2), nota="cortina_cierra"))
    cierra = {n: mejor_existente(f"cierra_{n}") for n, *_ in CELDAS}
    segs.append(Seg("f00", 2.4, v_reticula(cierra, 0.8), [(capa_costuras(), 0, 3), (capa_paises(f), 0, 3)]))
    segs.append(dialogo("f01"))
    segs.append(Seg("f02", 3.9, v_clip(mejor_existente("ci_luces"), 0.5, lento=1.2),
                    [(capa_centro(f, "¿Y mañana… Latinoamérica?", f.frase), 0.4, 4.2)]))
    logo = lienzo()
    lg = Image.open(a.logo).convert("RGBA"); lg.thumbnail((620, 620))
    logo.alpha_composite(lg, ((W - lg.width) // 2, 640))
    d = ImageDraw.Draw(logo)
    for y, txt, fu, al in ((1380, "ordenglobal.org", f.mono, 255),
                           (1700, "Material informativo; no constituye oferta de valores ni de inversión.", f.chico, 170),
                           (1740, "Imágenes y voces ilustrativas generadas con IA. Genesis ID en beta.", f.chico, 170)):
        w = d.textlength(txt, font=fu); d.text(((W - w) / 2, y), txt, font=fu, fill=(*CREMA, al))
    segs.append(Seg("f03", 4.0, v_negro(), [(logo, 0.2, 4.5)]))

    t = 0.0
    for s in segs:
        s.t = t; t += s.dur
    return segs


# --- el audio ---

def cargar(p: Path, desde=0.0, dur=None) -> np.ndarray:
    tmp = Path(tempfile.mktemp(suffix=".wav"))
    ff("-ss", f"{desde:.3f}", *(["-t", f"{dur:.3f}"] if dur else []), "-i", str(p), "-vn",
       "-ac", "2", "-ar", str(SR), str(tmp))
    x, _ = sf.read(tmp, always_2d=True); tmp.unlink()
    return x


def poner(buf, x, t, g=1.0):
    i = int(t * SR)
    if i >= len(buf):
        return
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * g


def campana() -> np.ndarray:
    tt = np.arange(int(1.4 * SR)) / SR; o = np.zeros_like(tt)
    for f0, t0, a in ((783.99, 0, 0.55), (987.77, 0.09, 0.75)):
        q = np.clip(tt - t0, 0, None); env = (q > 0) * np.clip(q * 900, 0, 1)
        for r, gg, dc in ((1, 1, 3.2), (2, .35, 5), (2.76, .18, 7.5)):
            o += a * gg * np.sin(2 * np.pi * f0 * r * q) * env * np.exp(-q * dc)
    return np.repeat((o * 0.09)[:, None], 2, 1)


def audio(a, segs: list[Seg], total: float, out: Path) -> None:
    N = int((total + 1) * SR)
    voz, fx = np.zeros((N, 2)), np.zeros((N, 2))
    idx = {s.id: s for s in segs}
    # Bukele, limpio, sobre la apertura.
    poner(voz, cargar(a.buk, 0.4, 11.7), 0.15)
    # Diálogos: el audio de su propia toma. Ambiente de la toma, muy bajo, debajo.
    for s in segs:
        if s.audio_clip:
            r, d0, g = s.audio_clip
            x = cargar(r, d0, s.dur)
            fade = int(0.04 * SR); x[:fade] *= np.linspace(0, 1, fade)[:, None]; x[-fade:] *= np.linspace(1, 0, fade)[:, None]
            poner(voz, x, s.t, 1.0)
    # Narración de Lucía: mismo desfase que en el plan respecto de su plano.
    for v in P["voz"]:
        if v["a_camara"] or v["id"] == "B00":
            continue
        plano = max((t for t in P["tomas"] if t["t"] <= v["t"] + 1e-6), key=lambda t: t["t"])
        pid = plano["id"]
        s = idx.get(pid) or idx.get({"m02": "m02_aurelio", "k03": "k03_0", "f00": "f00a", "f02": "f02"}.get(pid, ""))
        if s is None:
            raise SystemExit(f"narración {v['id']}: no encuentro el plano {pid}")
        poner(voz, cargar(a.voces / f"{v['id']}.wav"), s.t + (v["t"] - plano["t"]), 0.95)
    # Sonido: pulso dramático bajo Bukele (el mismo de la guía), golpe, cortinas, campanas.
    t = np.arange(int(12.6 * SR)) / SR
    dron = 0.05 * np.sin(2 * np.pi * 41.2 * t) + 0.03 * np.sin(2 * np.pi * 61.7 * t)
    lat = np.zeros_like(t)
    for k in np.arange(0.5, 12.4, 0.92):
        for off, am in ((0, 1), (0.18, 0.6)):
            i = int((k + off) * SR); n = int(0.12 * SR)
            lat[i:i + n] += am * 0.18 * np.sin(2 * np.pi * 52 * np.arange(n) / SR) * np.exp(-np.arange(n) / SR * 30)
    cuerda = 0.035 * np.clip(t / 12, 0, 1) ** 2 * (np.sin(2 * np.pi * 220 * t) + 0.5 * np.sin(2 * np.pi * 329.6 * t))
    poner(fx, np.repeat((dron * np.clip(t / 1.5, 0, 1) + lat + cuerda)[:, None], 2, 1), 0.0)
    golpe = 0.3 * np.sin(2 * np.pi * 36 * np.arange(int(1.4 * SR)) / SR) * np.exp(-np.arange(int(1.4 * SR)) / SR * 3)
    poner(fx, np.repeat(golpe[:, None], 2, 1), idx["g00"].t)
    cortina = cargar(a.cortina)
    poner(fx, cortina, idx["g08"].t, 0.7)
    poner(fx, cortina[::-1].copy(), idx["f00"].t, 0.5)
    for s in segs:
        if s.nota == "pago":
            poner(fx, campana(), s.t + 0.2)
    sf.write(out.with_suffix(".voz.wav"), voz, SR)
    sf.write(out.with_suffix(".fx.wav"), fx, SR)
    ini_mus = idx["g00"].t + 0.3
    ff("-i", str(out.with_suffix(".voz.wav")), "-i", str(out.with_suffix(".fx.wav")), "-i", str(a.musica),
       "-filter_complex",
       f"[2:a]aresample={SR},afade=t=in:d=1.5,adelay={int(ini_mus * 1000)}:all=1,volume={a.vol_musica},apad,atrim=0:{total}[m];"
       f"[0:a]asplit[v][sc];[m][sc]sidechaincompress=threshold=0.025:ratio=5:attack=30:release=500[md];"
       f"[md][v][1:a]amix=inputs=3:normalize=0,afade=t=out:st={total - 1.5}:d=1.5,atrim=0:{total},"
       f"loudnorm=I=-15:TP=-1.5:LRA=9[o]", "-map", "[o]", "-ar", str(SR), str(out))


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--tomas", type=Path, required=True)
    a.add_argument("--voces", type=Path, required=True)
    a.add_argument("--buk", type=Path, required=True)
    a.add_argument("--buk-stt", type=Path, required=True)
    a.add_argument("--cortina", type=Path, required=True)
    a.add_argument("--musica", type=Path, required=True)
    a.add_argument("--vol-musica", default="0.55")
    a.add_argument("--fuentes", type=Path, required=True)
    a.add_argument("--logo", type=Path, required=True)
    a.add_argument("--morazan", type=Path, required=True)
    a.add_argument("--solo-tiempos", action="store_true")
    a.add_argument("-o", type=Path, required=True)
    a = a.parse_args()
    f = F(a.fuentes)
    segs = armar(a, f)
    total = segs[-1].t + segs[-1].dur
    tiempos = [{"id": s.id, "t": round(s.t, 2), "dur": round(s.dur, 2)} for s in segs]
    a.o.with_suffix(".tiempos.json").write_text(json.dumps(tiempos, indent=0))
    print(f"{len(segs)} segmentos · {total:.1f} s")
    if a.solo_tiempos:
        return
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        partes = []
        for s in segs:
            o = tmp / f"{len(partes):03d}_{s.id}.mp4"
            render_video(s, o, tmp)
            partes.append(o)
            print(f"  {s.id:14} {s.t:6.2f}  {s.dur:5.2f}", flush=True)
        entrada = sum((["-i", str(p)] for p in partes), [])
        lista = "".join(f"[{i}:v]" for i in range(len(partes)))
        ff(*entrada, "-filter_complex", f"{lista}concat=n={len(partes)}:v=1:a=0[v]", "-map", "[v]",
           "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-r", str(FPS), str(tmp / "video.mp4"))
        wav = tmp / "mezcla.wav"
        audio(a, segs, total, wav)
        ff("-i", str(tmp / "video.mp4"), "-i", str(wav), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(a.o))
    print(f"listo: {a.o}")


if __name__ == "__main__":
    main()
