#!/usr/bin/env python3
"""Monta «Un martes» a partir del plan de tiempos, las tomas elegidas, las
pantallas reales de Veta, las voces y la música. Todo en local, sin GPU.

    python3 montaje/un_martes.py --tomas tomas.json --clips DIR --pantallas DIR \
        --voces DIR --musica cama.wav --logo orden-global-oro-4000.png \
        --fuentes DIR -o un_martes.mp4

tomas.json: {"02_cocina_nota": "02_cocina_nota_r2_00001_.mp4", ...}

Cada bloque sale como un segmento 1080x1920 a 30 fps y se concatenan con corte
seco. Los rótulos se dibujan con Pillow (este ffmpeg no tiene drawtext). El
audio: voces colocadas a su tiempo, música que baja bajo la voz
(sidechaincompress) y el total normalizado a -14 LUFS, que es donde suenan las
redes.
"""
from __future__ import annotations

import argparse, json, re, subprocess, tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
RAIZ = Path(__file__).resolve().parent.parent

# El mismo look que la biblia de los prompts (apple_human), más grano fino.
GRADE = ("eq=contrast=1.06:saturation=0.98,"
         "curves=all='0/0.01 0.25/0.23 0.75/0.78 1/0.99',noise=alls=5:allf=t+u")
CREMA = (243, 236, 217)
FONDO = (11, 14, 34)

# Voces: bloque donde entran y desplazamiento en segundos respecto al inicio
# del bloque. La del proveedor que confirma entra antes para no pisar la noche.
VOCES = {"hija_1": ("negro", 0.35), "amiga": ("12_amiga_brinda", 0.05),
         "esceptico": ("13_dueno_restaurante", 0.05),
         "proveedor_1": ("15_llamada", 0.25), "proveedor_2": ("18_proveedor_ya", -0.7),
         "hija_2": ("21_hija_cuarto", 0.2)}


def ff(*args: str) -> None:
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


def contar(v: Path) -> int:
    """Fotogramas reales de un vídeo (no hay ffprobe en este contenedor)."""
    r = subprocess.run(["ffmpeg", "-i", str(v), "-map", "0:v", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    m = re.findall(r"frame=\s*(\d+)", r)
    return int(m[-1]) if m else 0


def fuente(d: Path, nombre: str, tam: int):
    return ImageFont.truetype(str(d / nombre), tam)


def png_rotulo(txt: str, f, dst: Path, pos: str) -> None:
    """La hora del día: arriba a la izquierda, sobre una pastilla oscura para
    que se lea sobre cualquier fondo (una pared clara se la comía)."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    tw = d.textlength(txt, font=f)
    x, y = 72, 190
    d.rounded_rectangle([x - 26, y - 18, x + tw + 26, y + f.size + 22], 22, fill=(8, 10, 20, 150))
    d.text((x, y), txt, font=f, fill=CREMA + (255,))
    im.save(dst)


def png_pantalla(src: Path, verbo: str | None, fv, dst: Path, mensaje: str | None, fm) -> None:
    """La captura real, algo más pequeña y con esquinas redondeadas sobre el
    azul de la marca; la palabra va debajo, sin tapar ningún dato."""
    fondo = Image.new("RGBA", (W, H), FONDO + (255,))
    esc = 0.80
    sw, sh = int(W * esc), int(H * esc)
    cap = Image.open(src).convert("RGBA").resize((sw, sh))
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, sw, sh], 46, fill=255)
    x0, y0 = (W - sw) // 2, 110
    sombra = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle([x0, y0 + 16, x0 + sw, y0 + sh + 16], 46, fill=(0, 0, 0, 160))
    fondo = Image.alpha_composite(fondo, sombra.filter(ImageFilter.GaussianBlur(24)))
    fondo.paste(cap, (x0, y0), mask)
    d = ImageDraw.Draw(fondo)
    base = y0 + sh + 70
    if verbo:
        tw = d.textlength(verbo, font=fv)
        d.text(((W - tw) / 2, base), verbo, font=fv, fill=CREMA + (255,))
    if mensaje:  # «Bien, mija. Un martes.» como mensaje enviado
        tw = d.textlength(mensaje, font=fm)
        x1 = (W + tw) / 2 + 32
        d.rounded_rectangle([x1 - tw - 64, base, x1, base + 110], 40, fill=(214, 186, 112, 255))
        d.text((x1 - tw - 32, base + 26), mensaje, font=fm, fill=(20, 22, 30, 255))
    fondo.convert("RGB").save(dst)


def png_cierre(logo: Path, fr, fu, frase: str, url: str, dst: Path) -> None:
    im = Image.new("RGB", (W, H), FONDO)
    lg = Image.open(logo).convert("RGBA")
    lg.thumbnail((620, 620))
    im.paste(lg, ((W - lg.width) // 2, int(H * 0.30)), lg)
    d = ImageDraw.Draw(im)
    y = int(H * 0.30) + lg.height + 120
    for linea in ("Orden Global.", "Un sistema financiero", "que se puede comprobar."):
        tw = d.textlength(linea, font=fr)
        d.text(((W - tw) / 2, y), linea, font=fr, fill=CREMA)
        y += 86
    tw = d.textlength(url, font=fu)
    d.text(((W - tw) / 2, y + 70), url, font=fu, fill=(179, 189, 214))
    im.save(dst)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", default=str(RAIZ / "prompts/pelicula3_montaje.json"))
    ap.add_argument("--tomas", required=True)
    ap.add_argument("--clips", required=True)
    ap.add_argument("--pantallas", required=True)
    ap.add_argument("--voces", required=True)
    ap.add_argument("--musica", required=True)
    ap.add_argument("--logo", required=True)
    ap.add_argument("--fuentes", required=True)
    ap.add_argument("-o", "--salida", required=True)
    a = ap.parse_args()

    plan = json.loads(Path(a.plan).read_text())
    tomas = json.loads(Path(a.tomas).read_text())
    F = Path(a.fuentes)
    f_hora = fuente(F, "JetBrainsMono.ttf", 64)
    f_verbo = fuente(F, "Fraunces.ttf", 110)
    f_frase = fuente(F, "Fraunces.ttf", 68)
    f_url = fuente(F, "JetBrainsMono.ttf", 44)
    f_msg = fuente(F, "Manrope.ttf", 50)
    PANT = {"A": "A_enviar.png", "B": "B_tarjeta.png", "C": "C_pagar.png", "J": "J_ondk.png",
            "E": "E_dividir.png", "G": "G_comprobante.png", "H": "H_actividad.png"}
    tmp = Path(tempfile.mkdtemp(prefix="un_martes_"))
    segs = []

    for k, b in enumerate(plan["bloques"]):
        seg = tmp / f"s{k:02d}.mp4"
        dur = b["dur"]
        tipo = b.get("tipo", "plano")
        rot = b.get("rotulos", [])
        if tipo == "plano":
            clip = Path(a.clips) / tomas[b["plano"]]
            vf = (f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                  f"fps={FPS},{GRADE},format=yuv420p")
            hora = [r for r in rot if r.get("tipo") == "dato"]
            if hora:
                p = tmp / f"r{k:02d}.png"
                png_rotulo(hora[0]["texto"], f_hora, p, "hora")
                ini = hora[0]["t"] - b["t"]
                ff("-ss", str(b.get("desde", 0.4)), "-t", f"{dur}", "-i", str(clip),
                   "-loop", "1", "-framerate", str(FPS), "-t", f"{dur}", "-i", str(p),
                   "-filter_complex",
                   f"[0:v]{vf}[v];[1:v]format=rgba,fade=in:st={ini}:d=0.4:alpha=1,"
                   f"fade=out:st={ini + hora[0]['dur'] - 0.4}:d=0.4:alpha=1[t];"
                   f"[v][t]overlay=0:0:shortest=1,format=yuv420p",
                   "-an", "-r", str(FPS), "-c:v", "libx264", "-crf", "17", "-preset", "medium", str(seg))
            else:
                ff("-ss", str(b.get("desde", 0.4)), "-t", f"{dur}", "-i", str(clip), "-vf", vf,
                   "-an", "-r", str(FPS), "-c:v", "libx264", "-crf", "17", "-preset", "medium", str(seg))
        elif tipo == "pantalla":
            verbo = next((r["texto"] for r in rot if r.get("tipo") == "titular"), None)
            p = tmp / f"p{k:02d}.png"
            png_pantalla(Path(a.pantallas) / PANT[b["plano"]], verbo, f_verbo, p,
                         "Bien, mija. Un martes." if b["plano"] == "H" else None, f_msg)
            # Un empuje lentísimo: una pantalla quieta se lee como diapositiva.
            ff("-loop", "1", "-framerate", str(FPS), "-t", f"{dur}", "-i", str(p), "-vf",
               f"scale={W*2}:{H*2},zoompan=z='1+0.035*on/({dur}*{FPS})':"
               f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},format=yuv420p",
               "-r", str(FPS), "-c:v", "libx264", "-crf", "17", str(seg))
        elif tipo == "negro":
            ff("-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={FPS}:d={dur}",
               "-c:v", "libx264", "-pix_fmt", "yuv420p", str(seg))
        elif tipo == "cierre":
            p = tmp / "cierre.png"
            c = plan.get("cierre", {})
            png_cierre(Path(a.logo), f_frase, f_url, c.get("frase", ""), c.get("direccion", ""), p)
            ff("-loop", "1", "-framerate", str(FPS), "-t", f"{dur}", "-i", str(p), "-vf",
               f"fade=in:st=0:d=0.8,fps={FPS},format=yuv420p", "-c:v", "libx264", "-crf", "17", str(seg))
        n = contar(seg)
        N = round(dur * FPS)
        if n != N:  # clonar el último fotograma o recortar: cada bloque exacto
            fijo = seg.with_suffix(".fijo.mp4")
            ff("-i", str(seg), "-vf", f"tpad=stop_mode=clone:stop={FPS},setpts=N/({FPS}*TB)",
               "-frames:v", str(N), "-r", str(FPS), "-c:v", "libx264", "-crf", "17",
               "-pix_fmt", "yuv420p", str(fijo))
            fijo.replace(seg); n = contar(seg)
        if abs(n - round(dur * FPS)) > 2:
            raise SystemExit(f"segmento {b['plano']}: {n} fotogramas, esperaba {round(dur*FPS)}")
        segs.append(seg)
        print(f"  {k+1:2d}/{len(plan['bloques'])} {b['plano']:<22} {dur:.1f}s", flush=True)

    lista = tmp / "lista.txt"
    lista.write_text("".join(f"file '{s}'\n" for s in segs))
    video = tmp / "video.mp4"
    # Cada segmento trae su propia base de tiempo; unirlos con -c copy dejaba
    # huecos y el vídeo salía 15 s más corto que el plan (y las voces fuera de
    # sitio). Se reescriben los tiempos por número de fotograma.
    ents = [x for sg in segs for x in ("-i", str(sg))]
    cadena = "".join(f"[{i}:v]setpts=PTS-STARTPTS,fps={FPS}[c{i}];" for i in range(len(segs)))
    cadena += "".join(f"[c{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=0[v]"
    ff(*ents, "-filter_complex", cadena, "-map", "[v]", "-r", str(FPS),
       "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p", str(video))
    nv, esperado = contar(video), round(sum(b["dur"] for b in plan["bloques"]) * FPS)
    if abs(nv - esperado) > len(segs):
        raise SystemExit(f"el vídeo unido tiene {nv} fotogramas y el plan {esperado}")

    # --- audio ---------------------------------------------------------------
    t0 = {b["plano"]: b["t"] for b in plan["bloques"]}
    total = sum(b["dur"] for b in plan["bloques"])
    entradas, filtros, etiquetas = ["-i", a.musica], [], []
    for n, (bloque, off) in VOCES.items():
        entradas += ["-i", str(Path(a.voces) / f"{n}.wav")]
        i = len(entradas) // 2 - 1
        ms = int(max(0.0, t0[bloque] + off) * 1000)
        filtros.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,"
                       f"adelay={ms}|{ms},volume=1.0[v{i}]")
        etiquetas.append(f"[v{i}]")
    # apad hasta el final: sidechaincompress termina cuando termina su
    # sidechain, y sin esto la música se cortaba con la última voz (67,9 s).
    filtros.append(f"{''.join(etiquetas)}amix=inputs={len(etiquetas)}:normalize=0,"
                   f"apad=whole_dur={total},asplit=2[voz][voz_sc]")
    filtros.append(f"[0:a]aresample=48000,volume=0.55,atrim=0:{total}[mus]")
    filtros.append("[mus][voz_sc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=450[musd]")
    filtros.append(f"[musd][voz]amix=inputs=2:normalize=0,afade=t=out:st={total-2.5}:d=2.5,"
                   f"loudnorm=I=-14:TP=-1.5:LRA=9[aout]")
    audio = tmp / "audio.wav"
    ff(*entradas, "-filter_complex", ";".join(filtros), "-map", "[aout]",
       "-t", f"{total}", "-ar", "48000", str(audio))

    ff("-i", str(video), "-i", str(audio), "-map", "0:v", "-map", "1:a",
       "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
       "-movflags", "+faststart", a.salida)
    print(f"listo: {a.salida} · {total:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
