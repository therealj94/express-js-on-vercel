#!/usr/bin/env python3
"""Monta «Un martes» (v3) a partir del plan de tiempos, las tomas elegidas, las
pantallas reales de Veta, las voces y la música. Todo en local, sin GPU.

    python3 montaje/un_martes.py --tomas tomas.json --clips DIR --pantallas DIR \
        --voces DIR --musica cama.wav --logo orden-global-oro-4000.png \
        --fuentes DIR -o un_martes.mp4

Dos pasadas:
1. Los planos, limpios: recorte a 1080x1920, look y grano. Cada segmento se
   fuerza a sus fotogramas exactos y se unen con el filtro concat (unir con
   `concat -c copy` perdía 15 s y descuadraba las voces).
2. Las capas encima, sobre el vídeo entero porque una nota de voz cruza varios
   planos: la app como tarjeta flotante (nunca a pantalla completa), la nota de
   voz, la llamada, los subtítulos y la hora. Todo dibujado con Pillow (este
   ffmpeg no tiene drawtext) y animado con fundidos y un deslizamiento corto.

Nadie habla a cámara: las voces entran como nota de voz o llamada y siempre
llevan subtítulo (en redes casi todo se ve sin sonido).
"""
from __future__ import annotations

import argparse, json, re, subprocess, tempfile, textwrap
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
RAIZ = Path(__file__).resolve().parent.parent
GRADE = ("eq=contrast=1.06:saturation=0.98,"
         "curves=all='0/0.01 0.25/0.23 0.75/0.78 1/0.99',noise=alls=5:allf=t+u")
CREMA = (243, 236, 217)
FONDO = (11, 14, 34)
TINTA = (14, 30, 34)          # el verde petróleo de la app
ORO = (214, 186, 112)


def ff(*args: str) -> None:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


def contar(v: Path) -> int:
    r = subprocess.run(["ffmpeg", "-i", str(v), "-map", "0:v", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    m = re.findall(r"frame=\s*(\d+)", r)
    return int(m[-1]) if m else 0


class Tipos:
    def __init__(self, d: Path):
        self.hora = ImageFont.truetype(str(d / "JetBrainsMono.ttf"), 38)
        self.sub = ImageFont.truetype(str(d / "Manrope.ttf"), 44)
        self.nombre = ImageFont.truetype(str(d / "Manrope.ttf"), 40)
        self.chico = ImageFont.truetype(str(d / "Manrope.ttf"), 30)
        self.pie = ImageFont.truetype(str(d / "Manrope.ttf"), 32)
        self.frase = ImageFont.truetype(str(d / "Fraunces.ttf"), 68)
        self.url = ImageFont.truetype(str(d / "JetBrainsMono.ttf"), 44)
        self.msg = ImageFont.truetype(str(d / "Manrope.ttf"), 48)
        self.cita = ImageFont.truetype(str(d / "FrauncesItalic.ttf"), 50)
        self.chat = ImageFont.truetype(str(d / "ManropeMedium.ttf"), 44)
        self.hora_chat = ImageFont.truetype(str(d / "ManropeMedium.ttf"), 28)
        self.narra = ImageFont.truetype(str(d / "ManropeMedium.ttf"), 46)


def lienzo() -> Image.Image:
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def sombra_de(img: Image.Image, caja, r: int, fuerza: int = 150, radio: int = 26) -> Image.Image:
    s = lienzo()
    x0, y0, x1, y1 = caja
    ImageDraw.Draw(s).rounded_rectangle([x0, y0 + 14, x1, y1 + 14], r, fill=(0, 0, 0, fuerza))
    return Image.alpha_composite(img, s.filter(ImageFilter.GaussianBlur(radio)))


def espaciado(d: ImageDraw.ImageDraw, xy, txt: str, f, fill, sep: int = 4) -> None:
    """Texto con tracking: las versalitas sin aire se ven de plantilla."""
    x, y = xy
    for ch in txt:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + sep


def ancho_esp(d, txt, f, sep=4) -> float:
    return sum(d.textlength(c, font=f) + sep for c in txt) - sep


def subtitulo(img: Image.Image, texto: str, T: Tipos) -> Image.Image:
    d = ImageDraw.Draw(img)
    lineas = textwrap.wrap(texto, 34)
    alto = len(lineas) * 60 + 36
    y0 = 1640 - alto
    anchos = [d.textlength(l, font=T.sub) for l in lineas]
    x0 = (W - max(anchos)) / 2 - 34
    caja = [x0, y0, W - x0, y0 + alto]
    capa = lienzo()
    ImageDraw.Draw(capa).rounded_rectangle(caja, 28, fill=(8, 10, 16, 165))
    img = Image.alpha_composite(img, capa)
    d = ImageDraw.Draw(img)
    for i, l in enumerate(lineas):
        d.text(((W - anchos[i]) / 2, y0 + 18 + i * 60), l, font=T.sub, fill=CREMA + (255,))
    return img


def png_hora(txt: str, T: Tipos, dst: Path) -> None:
    img = lienzo()
    x, y = 72, 180
    s = lienzo()
    espaciado(ImageDraw.Draw(s), (x, y + 2), txt.upper(), T.hora, (0, 0, 0, 200), 3)
    img = Image.alpha_composite(img, s.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(img)
    espaciado(d, (x, y), txt.upper(), T.hora, CREMA + (240,), 3)
    d.line([(x, y + 58), (x + 64, y + 58)], fill=ORO + (230,), width=3)
    img.save(dst)


def png_tarjeta(pantalla: Path, recortes, pie: str | None, T: Tipos, dst: Path) -> None:
    """Solo la parte de la app que cuenta, flotando en el tercio inferior."""
    cap = Image.open(pantalla).convert("RGBA")
    trozos = [cap.crop(tuple(r)) for r in recortes]
    ancho = max(t.width for t in trozos)
    hueco = 14
    alto = sum(t.height for t in trozos) + hueco * (len(trozos) - 1)
    tarjeta = Image.new("RGBA", (ancho, alto), TINTA + (255,))
    y = 0
    for t in trozos:
        tarjeta.paste(t, (0, y)); y += t.height + hueco
    esc = min(880 / ancho, 760 / alto)
    tarjeta = tarjeta.resize((int(ancho * esc), int(alto * esc)), Image.LANCZOS)
    mask = Image.new("L", tarjeta.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *tarjeta.size], 34, fill=255)
    x0 = (W - tarjeta.width) // 2
    y0 = 1690 - tarjeta.height
    img = sombra_de(lienzo(), [x0, y0, x0 + tarjeta.width, y0 + tarjeta.height], 34, 170, 30)
    img.paste(tarjeta, (x0, y0), mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x0 + tarjeta.width, y0 + tarjeta.height], 34, outline=ORO + (120,), width=2)
    if pie:
        p = pie.upper()
        tw = ancho_esp(d, p, T.pie, 5)
        s = lienzo()
        espaciado(ImageDraw.Draw(s), ((W - tw) / 2, y0 - 70), p, T.pie, (0, 0, 0, 220), 5)
        img = Image.alpha_composite(img, s.filter(ImageFilter.GaussianBlur(7)))
        espaciado(ImageDraw.Draw(img), ((W - tw) / 2, y0 - 72), p, T.pie, CREMA + (255,), 5)
    img.save(dst)


def png_nota(quien: str, texto: str, dur: float, T: Tipos, dst: Path) -> None:
    """Nota de voz entrante arriba y su subtítulo abajo."""
    img = lienzo()
    x0, y0, x1, y1 = 90, 150, W - 90, 150 + 150
    img = sombra_de(img, [x0, y0, x1, y1], 40, 150, 22)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x1, y1], 40, fill=TINTA + (238,), outline=ORO + (90,), width=2)
    cx, cy = x0 + 75, y0 + 75
    d.ellipse([cx - 44, cy - 44, cx + 44, cy + 44], fill=ORO + (255,))
    ini = quien[0]
    d.text((cx - d.textlength(ini, font=T.nombre) / 2, cy - 26), ini, font=T.nombre, fill=TINTA + (255,))
    d.text((x0 + 145, y0 + 28), quien, font=T.nombre, fill=CREMA + (255,))
    d.text((x0 + 145, y0 + 84), f"Nota de voz · 0:{int(round(dur)):02d}", font=T.chico, fill=(170, 190, 186, 255))
    # onda: barras fijas por texto (la misma nota se dibuja igual siempre)
    rng = np.random.default_rng(len(texto))
    bx = x1 - 330
    for i in range(26):
        h = int(10 + 44 * abs(np.sin(i * 0.7)) * (0.5 + rng.random() * 0.5))
        d.rounded_rectangle([bx + i * 11, cy - h / 2, bx + i * 11 + 6, cy + h / 2], 3, fill=ORO + (230,))
    img = subtitulo(img, texto, T)
    img.save(dst)


def png_llamada(quien: str, texto: str, T: Tipos, dst: Path) -> None:
    img = lienzo()
    d = ImageDraw.Draw(img)
    txt = f"{quien}  ·  llamada en curso"
    tw = d.textlength(txt, font=T.chico) + 60
    x0, y0 = (W - tw) / 2, 160
    img = sombra_de(img, [x0, y0, x0 + tw, y0 + 70], 35, 140, 16)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x0 + tw, y0 + 70], 35, fill=TINTA + (235,))
    d.ellipse([x0 + 24, y0 + 28, x0 + 38, y0 + 42], fill=(80, 200, 120, 255))
    d.text((x0 + 50, y0 + 17), txt, font=T.chico, fill=CREMA + (255,))
    img = subtitulo(img, texto, T)
    img.save(dst)


def png_narra(texto: str, T: Tipos, dst: Path) -> None:
    """Lo que cuenta Lucía, abajo del todo y sin caja: texto limpio con sombra,
    por debajo de las tarjetas para no pisarlas nunca."""
    img = lienzo()
    d = ImageDraw.Draw(img)
    lineas = textwrap.wrap(texto, 34)
    y0 = 1795 - (len(lineas) - 1) * 62
    s = lienzo(); ds = ImageDraw.Draw(s)
    for i, l in enumerate(lineas):
        tw = d.textlength(l, font=T.narra)
        ds.text(((W - tw) / 2, y0 + i * 62 + 3), l, font=T.narra, fill=(0, 0, 0, 255))
        d.text(((W - tw) / 2, y0 + i * 62), l, font=T.narra, fill=(255, 255, 255, 245))
    img = Image.alpha_composite(s.filter(ImageFilter.GaussianBlur(9)), img)
    img.save(dst)


def png_sub(texto: str, T: Tipos, dst: Path) -> None:
    subtitulo(lienzo(), texto, T).save(dst)


def png_mensaje(texto: str, T: Tipos, dst: Path) -> None:
    img = lienzo()
    d = ImageDraw.Draw(img)
    tw = d.textlength(texto, font=T.msg)
    x1, y0 = W - 90, 1420
    caja = [x1 - tw - 70, y0, x1, y0 + 116]
    img = sombra_de(img, caja, 44, 160, 20)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(caja, 44, fill=ORO + (255,))
    d.text((x1 - tw - 35, y0 + 28), texto, font=T.msg, fill=TINTA + (255,))
    d.text((x1 - 290, y0 + 132), "Enviado · 9:18 p. m.", font=T.chico, fill=CREMA + (220,))
    img.save(dst)


def png_cierre(logo: Path, T: Tipos, url: str, dst: Path) -> None:
    im = Image.new("RGB", (W, H), FONDO)
    lg = Image.open(logo).convert("RGBA")
    lg.thumbnail((600, 600))
    im.paste(lg, ((W - lg.width) // 2, int(H * 0.30)), lg)
    d = ImageDraw.Draw(im)
    y = int(H * 0.30) + lg.height + 120
    for linea in ("Orden Global.", "Un sistema financiero", "que se puede comprobar."):
        tw = d.textlength(linea, font=T.frase)
        d.text(((W - tw) / 2, y), linea, font=T.frase, fill=CREMA)
        y += 86
    tw = d.textlength(url, font=T.url)
    d.text(((W - tw) / 2, y + 70), url, font=T.url, fill=(179, 189, 214))
    im.save(dst)


def tink(sr: int = 48000) -> np.ndarray:
    """Aviso suave de la app: dos senos cortos, nada de «caja registradora»."""
    t = np.arange(int(sr * 0.32)) / sr
    env = np.exp(-t * 14) * np.clip(t * 400, 0, 1)
    s = (np.sin(2 * np.pi * 1318.5 * t) + 0.6 * np.sin(2 * np.pi * 1975.5 * t)) * env * 0.16
    return np.stack([s, s], 1)


def pago(sr: int = 48000, fuerza: float = 1.0) -> np.ndarray:
    """El sonido de «ya está pagado»: dos campanas cálidas (sol-si, una tercera
    mayor que suena a resuelto), con parciales de campana de verdad y una cola
    que respira. El «tink» de antes sonaba a aviso; esto suena a cierre."""
    dur = 1.6
    t = np.arange(int(sr * dur)) / sr
    out = np.zeros_like(t)
    for f0, t0, a in ((783.99, 0.0, 0.55), (987.77, 0.09, 0.75)):
        tt = np.clip(t - t0, 0, None)
        env = (tt > 0) * np.clip(tt * 900, 0, 1)
        for r, g, dec in ((1.0, 1.0, 3.2), (2.0, 0.35, 5.0), (2.76, 0.18, 7.5), (5.4, 0.06, 12.0)):
            out += a * g * np.sin(2 * np.pi * f0 * r * tt) * env * np.exp(-tt * dec)
    cuerpo = np.sin(2 * np.pi * 196 * t) * np.exp(-t * 9) * np.clip(t * 600, 0, 1) * 0.25
    s = (out + cuerpo) * 0.09 * fuerza
    izq = s; der = np.concatenate([np.zeros(int(sr * 0.012)), s[:-int(sr * 0.012)]])
    return np.stack([izq, der], 1)


def timbre(sr: int = 48000) -> np.ndarray:
    """Un teléfono que suena: dos tonos alternos, dos veces, algo lejano."""
    out = []
    for _ in range(2):
        t = np.arange(int(sr * 0.9)) / sr
        tono = np.where((t * 12).astype(int) % 2 == 0, np.sin(2 * np.pi * 880 * t), np.sin(2 * np.pi * 1109 * t))
        env = np.clip(t * 60, 0, 1) * np.clip((0.9 - t) * 60, 0, 1)
        out += [tono * env * 0.07, np.zeros(int(sr * 0.5))]
    s = np.concatenate(out)
    return np.stack([s, s], 1)


COLORES = {"Sofía": (214, 186, 112), "Textiles del Valle": (110, 200, 150), "Don Chepe": (110, 200, 150),
           "amiga": (232, 140, 110), "amigo": (150, 175, 210), "Lucía": (243, 236, 217)}


def onda_de(wav: Path, barras: int = 44) -> list[float]:
    """Alturas de la onda sacadas de la voz de verdad, no dibujadas a ojo."""
    x, _ = sf.read(str(wav), always_2d=True)
    x = np.abs(x.mean(1))
    trozos = np.array_split(x, barras)
    r = np.array([np.sqrt((t ** 2).mean()) if len(t) else 0 for t in trozos])
    r = r / (r.max() or 1)
    return list(0.12 + 0.88 * r ** 0.7)


def png_onda(alturas, etiqueta: str | None, T, dst: Path, y: int = 1170) -> None:
    img = lienzo()
    d = ImageDraw.Draw(img)
    paso, ancho = 13, 5
    x0 = (W - paso * len(alturas)) / 2
    s = lienzo(); ds = ImageDraw.Draw(s)
    for i, h in enumerate(alturas):
        hh = 8 + 170 * h
        caja = [x0 + i * paso, y - hh / 2, x0 + i * paso + ancho, y + hh / 2]
        ds.rounded_rectangle(caja, 3, fill=(0, 0, 0, 170))
        d.rounded_rectangle(caja, 3, fill=(255, 255, 255, 235))
    img = Image.alpha_composite(s.filter(ImageFilter.GaussianBlur(8)), img)
    if etiqueta:
        d = ImageDraw.Draw(img)
        e = etiqueta.upper()
        tw = ancho_esp(d, e, T.pie, 5)
        espaciado(d, ((W - tw) / 2, y - 150), e, T.pie, CREMA + (230,), 5)
    img.save(dst)


def png_cita(texto: str, quien: str | None, fila: int, T, dst: Path, y0: int = 640) -> None:
    """Una línea de lo que se dice, flotando, con el punto de quien habla."""
    img = lienzo()
    d = ImageDraw.Draw(img)
    tw = d.textlength(texto, font=T.cita)
    y = y0 + fila * 74
    x = (W - tw) / 2 + (18 if quien else 0)
    s = lienzo()
    ImageDraw.Draw(s).text((x, y + 2), texto, font=T.cita, fill=(0, 0, 0, 230))
    img = Image.alpha_composite(img, s.filter(ImageFilter.GaussianBlur(7)))
    d = ImageDraw.Draw(img)
    if quien:
        c = COLORES.get(quien, CREMA)
        d.ellipse([x - 40, y + 12, x - 14, y + 38], fill=c + (255,))
    d.text((x, y), texto, font=T.cita, fill=(255, 255, 255, 250))
    img.save(dst)


def png_burbuja(texto: str, lado: str, hora: str, fila: int, T, dst: Path, y0: int = 560) -> None:
    """Globo de chat flotando: entra a la izquierda (blanco), sale a la
    derecha (crema dorada) con doble check."""
    img = lienzo()
    d = ImageDraw.Draw(img)
    lineas = textwrap.wrap(texto, 26)
    tw = max(d.textlength(l, font=T.chat) for l in lineas)
    bw, bh = tw + 76, len(lineas) * 58 + 88
    y = y0 + fila * 30 + (0 if fila == 0 else 160)
    x = 80 if lado == "entra" else W - 80 - bw
    fondo = (250, 250, 247) if lado == "entra" else (236, 222, 180)
    img = sombra_de(img, [x, y, x + bw, y + bh], 30, 120, 18)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x, y, x + bw, y + bh], 30, fill=fondo + (250,))
    for i, l in enumerate(lineas):
        d.text((x + 38, y + 24 + i * 58), l, font=T.chat, fill=(28, 30, 34, 255))
    marca = hora + ("  ✓✓" if lado == "sale" else "")
    mw = d.textlength(marca, font=T.hora_chat)
    d.text((x + bw - mw - 30, y + bh - 50), marca, font=T.hora_chat, fill=(110, 118, 124, 255))
    img.save(dst)


def repartir(texto: str, dur: float, ancho: int = 30) -> list[tuple[str, float]]:
    """Parte el texto en líneas y le da a cada una su momento, según su largo."""
    lineas = textwrap.wrap(texto, ancho)
    tot = sum(len(l) for l in lineas)
    t, out = 0.15, []
    for l in lineas:
        out.append((l, t))
        t += (dur - 0.6) * len(l) / tot
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", default=str(RAIZ / "prompts/pelicula3_montaje.json"))
    for k in ("tomas", "clips", "pantallas", "voces", "musica", "logo", "fuentes"):
        ap.add_argument(f"--{k}", required=True)
    ap.add_argument("-o", "--salida", required=True)
    a = ap.parse_args()

    plan = json.loads(Path(a.plan).read_text())
    tomas = json.loads(Path(a.tomas).read_text())
    T = Tipos(Path(a.fuentes))
    tmp = Path(tempfile.mkdtemp(prefix="un_martes_"))
    bloques = plan["bloques"]
    total = sum(b["dur"] for b in bloques)

    # --- 1. planos ------------------------------------------------------------
    segs = []
    for k, b in enumerate(bloques):
        seg, dur, tipo = tmp / f"s{k:02d}.mp4", b["dur"], b.get("tipo", "plano")
        if tipo == "plano":
            clip = Path(a.clips) / tomas[b["plano"]]
            ff("-ss", str(b.get("desde", 0.4)), "-t", f"{dur}", "-i", str(clip), "-vf",
               f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},{GRADE},format=yuv420p",
               "-an", "-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-preset", "medium", str(seg))
        elif tipo == "negro":
            ff("-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={FPS}:d={dur}",
               "-c:v", "libx264", "-pix_fmt", "yuv420p", str(seg))
        elif tipo == "cierre":
            p = tmp / "cierre.png"
            png_cierre(Path(a.logo), T, plan.get("cierre", {}).get("direccion", ""), p)
            ff("-loop", "1", "-framerate", str(FPS), "-t", f"{dur}", "-i", str(p), "-vf",
               "fade=in:st=0:d=0.8,format=yuv420p", "-c:v", "libx264", "-crf", "16", str(seg))
        N = round(dur * FPS)
        if contar(seg) != N:
            fijo = seg.with_suffix(".fijo.mp4")
            ff("-i", str(seg), "-vf", f"tpad=stop_mode=clone:stop=-1,setpts=N/({FPS}*TB)",
               "-frames:v", str(N), "-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(fijo))
            fijo.replace(seg)
        segs.append(seg)
        print(f"  {k+1:2d}/{len(bloques)} {b['plano']:<22} {dur:.1f}s", flush=True)

    base = tmp / "base.mp4"
    ents = [x for s in segs for x in ("-i", str(s))]
    cad = "".join(f"[{i}:v]setpts=PTS-STARTPTS,fps={FPS}[c{i}];" for i in range(len(segs)))
    cad += "".join(f"[c{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=0[v]"
    ff(*ents, "-filter_complex", cad, "-map", "[v]", "-r", str(FPS),
       "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", str(base))
    if abs(contar(base) - round(total * FPS)) > 2:
        raise SystemExit("la base no dura lo que el plan")

    # --- 2. capas -------------------------------------------------------------
    capas = []
    for b in bloques:
        if b.get("hora"):
            p = tmp / f"hora_{len(capas)}.png"
            png_hora(b["hora"], T, p)
            # un lugar se lee más despacio que una hora
            capas.append({"png": p, "t": b["t"] + 0.25, "dur": min(3.4 if len(b["hora"]) > 14 else 2.2, b["dur"] - 0.4), "desliza": False})
    for c in plan.get("capas", []):
        p = tmp / f"capa_{len(capas)}.png"
        if c["tipo"] in ("nota", "llamada", "dialogo"):
            # onda con la voz real (nota y llamada) y las frases apareciendo
            if c["tipo"] != "dialogo":
                png_onda(onda_de(Path(a.voces) / f"{c['voz']}.wav"),
                         f"Nota de voz · {c['quien']}" if c["tipo"] == "nota" else f"Llamada · {c['quien']}", T, p)
                capas.append({"png": p, "t": c["t"], "dur": c["dur"], "desliza": False})
            y0 = 1300 if c["tipo"] != "dialogo" else 1420
            for i, (l, off) in enumerate(repartir(c["texto"], c["dur"])):
                q = tmp / f"capa_{len(capas)}.png"
                png_cita(f"«{l}»" if len(repartir(c['texto'], c['dur'])) == 1 else l, c.get("quien") if i == 0 else None, i, T, q, y0)
                capas.append({"png": q, "t": c["t"] + off, "dur": c["dur"] - off, "desliza": False})
            continue
        if c["tipo"] == "chat":
            for i, b in enumerate(c["burbujas"]):
                q = tmp / f"capa_{len(capas)}.png"
                png_burbuja(b["texto"], b["lado"], b["hora"], i, T, q)
                capas.append({"png": q, "t": c["t"] + b["t"], "dur": c["dur"] - b["t"], "desliza": True})
            continue
        if c["tipo"] == "tarjeta":
            png_tarjeta(Path(a.pantallas) / c["pantalla"], c["recortes"], c.get("pie"), T, p)
        elif c["tipo"] == "nota":
            png_nota(c["quien"], c["texto"], c["dur"], T, p)
        elif c["tipo"] == "llamada":
            png_llamada(c["quien"], c["texto"], T, p)
        elif c["tipo"] == "sub":
            png_sub(c["texto"], T, p)
        elif c["tipo"] == "narra":
            if not c["texto"]:
                continue
            png_narra(c["texto"], T, p)
        elif c["tipo"] == "mensaje":
            png_mensaje(c["texto"], T, p)
        capas.append({"png": p, "t": c["t"], "dur": c["dur"], "desliza": c["tipo"] in ("tarjeta", "mensaje")})

    ents, cad, prev = ["-i", str(base)], [], "0:v"
    for i, c in enumerate(capas, start=1):
        ents += ["-loop", "1", "-framerate", str(FPS), "-t", f"{c['dur']}", "-i", str(c["png"])]
        t0, d = c["t"], c["dur"]
        cad.append(f"[{i}:v]format=rgba,fade=in:st=0:d=0.35:alpha=1,"
                   f"fade=out:st={max(0, d - 0.35)}:d=0.35:alpha=1,setpts=PTS+{t0}/TB[l{i}]")
        y = f"if(lt(t\\,{t0 + 0.45})\\,({t0 + 0.45}-t)*110\\,0)" if c["desliza"] else "0"
        cad.append(f"[{prev}][l{i}]overlay=x=0:y='{y}':eof_action=pass[o{i}]")
        prev = f"o{i}"
    video = tmp / "video.mp4"
    ff(*ents, "-filter_complex", ";".join(cad), "-map", f"[{prev}]", "-r", str(FPS),
       "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", str(video))

    # --- 3. audio -------------------------------------------------------------
    sr = 48000
    voz = np.zeros((int(total * sr) + sr, 2))
    for c in plan.get("capas", []):
        if c.get("voz"):
            x, s0 = sf.read(str(Path(a.voces) / f"{c['voz']}.wav"), always_2d=True)
            if s0 != sr:
                x = np.stack([np.interp(np.arange(int(len(x) * sr / s0)) * s0 / sr,
                                        np.arange(len(x)), x[:, j]) for j in range(x.shape[1])], 1)
            x = np.repeat(x, 2, 1) if x.shape[1] == 1 else x
            i = int(max(0, c["t"]) * sr)
            voz[i:i + len(x)] += x[: len(voz) - i]
    # Planos con diálogo a la vista: su audio sale del propio clip (voz y boca
    # generadas juntas). Se toma el mismo tramo que la imagen.
    for b in bloques:
        if b.get("audio_clip"):
            wav = tmp / f"clip_{b['plano']}.wav"
            ff("-ss", str(b.get("desde", 0.4)), "-t", f"{b['dur']}", "-i",
               str(Path(a.clips) / tomas[b["plano"]]), "-vn", "-ac", "2", "-ar", str(sr), str(wav))
            x, _ = sf.read(str(wav), always_2d=True)
            x = x * float(b["audio_clip"])
            i = int(b["t"] * sr)
            voz[i:i + len(x)] += x[: len(voz) - i]
    fx = np.zeros_like(voz)
    for c in plan.get("capas", []):
        if c["tipo"] == "tarjeta" and c.get("sonido", "tink"):
            s = pago(sr, c.get("fuerza", 1.0)) if c.get("sonido") == "pago" else tink(sr)
            i = int(c["t"] * sr)
            fx[i:i + len(s)] += s[: len(fx) - i]
    for e in plan.get("efectos", []):
        if e["tipo"] == "timbre":
            s = timbre(sr); i = int(e["t"] * sr)
            fx[i:i + len(s)] += s
    sf.write(str(tmp / "voz.wav"), voz, sr)
    sf.write(str(tmp / "fx.wav"), fx, sr)
    audio = tmp / "audio.wav"
    ff("-i", a.musica, "-i", str(tmp / "voz.wav"), "-i", str(tmp / "fx.wav"), "-filter_complex",
       f"[0:a]aresample={sr},volume=0.55,apad=whole_dur={total},atrim=0:{total}[mus];"
       f"[1:a]asplit=2[v][vsc];"
       f"[mus][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=450[musd];"
       f"[musd][v][2:a]amix=inputs=3:normalize=0,afade=t=out:st={total - 2.5}:d=2.5,"
       f"loudnorm=I=-14:TP=-1.5:LRA=9,atrim=0:{total}[aout]",
       "-map", "[aout]", "-ar", str(sr), str(audio))

    ff("-i", str(video), "-i", str(audio), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
       "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", a.salida)
    print(f"listo: {a.salida} · {total:.1f}s · {len(capas)} capas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
