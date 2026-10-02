#!/usr/bin/env python3
"""Montaje de «El cuaderno»: planos de MiniMax H3 + voz de José + efectos + música + subtítulos.

Cada página es [D = la mano dibuja] + [V = el dibujo vive y se pasa la página]. El último
fotograma de cada plano es la imagen inicial del siguiente, así que se pegan sin cortes.
La voz de cada página entra al empezar su dibujo; el dibujo se acelera (hasta 2x) para que
la página dure lo que dura la voz más un respiro.

    python3 montaje/cuaderno.py --dir P5 --fuentes FUENTES --logo og_crema_4000.png --sal salida.mp4
P5 tiene video/planos/*.mp4, video/sfx/*.mp3, video/musica.mp3 y voz/palabras.json.
"""
from __future__ import annotations

import argparse, json, re, subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 24
ORO, CREMA = (214, 175, 92), (244, 236, 220)
CORRIGE = {"4": "cuatro", "Origen": "ORIGEN", "Origen,": "ORIGEN,"}


def dur(f: Path) -> float:
    e = subprocess.run(["ffmpeg", "-i", str(f)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", e).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def ff(*a):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *a], check=True)


def tramo(src: Path, out: Path, ini=0.0, fin=None, vel=1.0, pausa=0.0):
    """Recorta, acelera y lleva a 1080x1920/24 fps sin audio; `pausa` congela el último cuadro."""
    fin = fin or dur(src)
    ff("-ss", f"{ini:.3f}", "-to", f"{fin:.3f}", "-i", str(src), "-an", "-vf",
       f"setpts=PTS/{vel:.4f},scale=-2:{int(H*1.07)}:flags=lanczos,crop={W}:{H}:iw-ow:(ih-oh)/2,setsar=1,fps={FPS}"
       + (f",tpad=stop_mode=clone:stop_duration={pausa:.2f}" if pausa > 0 else ""),
       "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", str(out))
    return dur(out)


def texto_png(path: Path, lineas, fuente, tam, y, color=CREMA, sombra=True):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(str(fuente), tam)
    alto = tam * 1.25
    for i, l in enumerate(lineas):
        x = (W - d.textlength(l, font=f)) / 2; yy = y + i * alto
        if sombra:
            s = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(s).text((x, yy + 3), l, font=f, fill=(0, 0, 0, 230))
            im = Image.alpha_composite(im, s.filter(ImageFilter.GaussianBlur(6))); d = ImageDraw.Draw(im)
        d.text((x, yy), l, font=f, fill=(*color, 255))
    im.save(path)


def partir(palabras, maxc=30):
    """Frases cortas para subtítulos: corta en puntuación o a ~2 líneas."""
    bloques, cur = [], []
    for w, a, b in palabras:
        w = CORRIGE.get(w, w); cur.append((w, a, b))
        txt = " ".join(x[0] for x in cur)
        if w[-1:] in ".?!," and len(txt) > 14 or len(txt) > maxc * 2 - 8:
            bloques.append(cur); cur = []
    if cur:
        bloques.append(cur)
    out = []
    for bl in bloques:
        txt = " ".join(x[0] for x in bl).strip(" ,")
        lin, l = [], ""
        for w in txt.split():
            if len(l) + len(w) + 1 > maxc and l:
                lin.append(l); l = w
            else:
                l = (l + " " + w).strip()
        lin.append(l)
        out.append((lin, bl[0][1], bl[-1][2]))
    return out


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--dir", type=Path, required=True)
    a.add_argument("--fuentes", type=Path, required=True)
    a.add_argument("--logo", type=Path, required=True)
    a.add_argument("--sal", type=Path, required=True)
    a = a.parse_args()
    P, V = a.dir, a.dir / "video"
    tmp = V / "_monta"; tmp.mkdir(exist_ok=True)
    voz = json.loads((P / "voz/palabras.json").read_text())
    voz = {int(k): v for k, v in voz.items()}
    for p in voz:
        voz[p]["dur"] = voz[p]["palabras"][-1][2]

    segs, t = [], 0.0          # (archivo, ini_en_timeline)
    voces, sfx = [], []        # (mp3, t) ; (nombre, t, vol)

    # Página 0: apertura completa (oscuridad, lámpara, la mano dibuja la llamita) + solo el giro de V00.
    d0 = tramo(V / "planos/P00.mp4", tmp / "s00a.mp4")
    segs.append((tmp / "s00a.mp4", t)); sfx += [("lampara", t + 3.0, 0.9), ("lapiz", t + 6.0, 0.35)]
    voces.append((voz[0]["mp3"], t + 2.8)); t += d0
    d = tramo(V / "planos/V00.mp4", tmp / "s00b.mp4", ini=3.6)
    segs.append((tmp / "s00b.mp4", t)); sfx.append(("pagina", t + 0.6, 0.8)); t += d

    for p in range(1, 11):
        D, Vv = V / f"planos/D{p:02d}.mp4", V / f"planos/V{p:02d}.mp4"
        dd, dv = dur(D), dur(Vv)
        objetivo = voz[p]["dur"] + 1.6
        # El dibujo se acelera para que la página no se alargue más que la voz (máx. 2x);
        # la lágrima (D06) y la punta rota (D08) van a velocidad real.
        vel = 1.0 if p in (6, 8) else min(2.0, max(1.0, dd / max(1.5, objetivo - dv)))
        dd2 = tramo(D, tmp / f"s{p:02d}a.mp4", vel=vel)
        segs.append((tmp / f"s{p:02d}a.mp4", t)); voces.append((voz[p]["mp3"], t + 0.4))
        sfx.append(("lapiz", t + 0.1, 0.32))
        if p == 6: sfx.append(("gota", t + dd2 - 1.3, 1.0))
        if p == 8: sfx.append(("punta", t + dd2 - 0.9, 1.0))
        t += dd2
        # Si la voz es más larga que la página, el último cuadro espera a que termine.
        # V10: se corta cuando el cuaderno termina de cerrarse (después el modelo mete otra mano).
        dv2 = tramo(Vv, tmp / f"s{p:02d}b.mp4", fin=4.8 if p == 10 else None,
                    pausa=max(0.0, objetivo - dd2 - (4.8 if p == 10 else dv)))
        segs.append((tmp / f"s{p:02d}b.mp4", t))
        if p == 6: sfx.append(("arranca", t + 2.2, 0.9))
        elif p == 9: sfx.append(("rueda", t + 2.0, 0.8))
        elif p == 10: sfx.append(("cierra", t + 3.6, 0.9))
        else: sfx.append(("pagina", t + dv2 * 0.55, 0.8))
        t += dv2

    # Cierre de marca: logo, nombre y dirección.
    lienzo = Image.new("RGBA", (W, H), (10, 8, 6, 255))
    br = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(br).ellipse([W / 2 - 330, 560, W / 2 + 330, 1220], fill=(*ORO, 46))
    lienzo = Image.alpha_composite(lienzo, br.filter(ImageFilter.GaussianBlur(120)))
    lg = Image.open(a.logo).convert("RGBA"); lg.thumbnail((440, 440))
    lienzo.alpha_composite(lg, ((W - lg.width) // 2, 880 - lg.height // 2))
    dn = ImageDraw.Draw(lienzo)
    for txt, fu, tam, y, col in (("ORDEN GLOBAL", "Manrope.ttf", 64, 1200, CREMA),
                                 ("ordenglobal.org", "JetBrainsMono.ttf", 40, 1300, ORO)):
        f = ImageFont.truetype(str(a.fuentes / fu), tam)
        dn.text(((W - dn.textlength(txt, font=f)) / 2, y), txt, font=f, fill=(*col, 255))
    lienzo.convert("RGB").save(tmp / "marca.png")
    ff("-loop", "1", "-t", "4.5", "-i", str(tmp / "marca.png"), "-vf",
       f"fade=in:0:{int(FPS*0.8)},fps={FPS},format=yuv420p", "-c:v", "libx264", "-crf", "16", str(tmp / "s99.mp4"))
    segs.append((tmp / "s99.mp4", t)); fin_peli = t + 4.5
    total = fin_peli

    (tmp / "lista.txt").write_text("".join(f"file '{s.name}'\n" for s, _ in segs))
    ff("-f", "concat", "-safe", "0", "-i", str(tmp / "lista.txt"), "-c", "copy", str(tmp / "imagen.mp4"))

    # Subtítulos (frases cortas, tercio inferior) y la pregunta final grande.
    capas = []
    for p, t0 in [(i, vt) for i, (_, vt) in enumerate(voces)]:
        for k, (lin, i0, i1) in enumerate(partir(voz[p]["palabras"])):
            if p == 10 and "vas a hacer" in " ".join(lin):
                continue
            png = tmp / f"sub_{p}_{k}.png"
            texto_png(png, lin, a.fuentes / "ManropeMedium.ttf", 50, 1470)
            capas.append((png, t0 + i0, t0 + i1 + 0.15))
    pq = next(w for w in voz[10]["palabras"] if w[0].startswith("¿"))
    png = tmp / "pregunta.png"
    texto_png(png, ["¿Qué vas a hacer?"], a.fuentes / "FrauncesItalic.ttf", 92, 880)
    capas.append((png, voces[10][1] + pq[1], segs[-1][1]))

    ent, fil, last = ["-i", str(tmp / "imagen.mp4")], [], "[0:v]"
    for i, (png, i0, i1) in enumerate(capas, 1):
        ent += ["-i", str(png)]
        fil.append(f"{last}[{i}:v]overlay=0:0:enable='between(t,{i0:.2f},{i1:.2f})'[v{i}]"); last = f"[v{i}]"
    n = len(capas) + 1
    # Audio: voz, música (agachada bajo la voz), ambiente de noche en bucle y efectos.
    ent += ["-i", str(V / "musica_A.mp3"), "-stream_loop", "-1", "-i", str(V / "sfx/noche.mp3")]
    am, an = n, n + 1
    vi = []
    for j, (mp3, vt) in enumerate(voces):
        ent += ["-i", str(P / mp3)]; ms = int(vt * 1000)
        fil.append(f"[{n + 2 + j}:a]adelay={ms}|{ms},aformat=channel_layouts=stereo,volume=1.0[vz{j}]"); vi.append(f"[vz{j}]")
    base = n + 2 + len(voces)
    si = []
    for k, (nom, st, vol) in enumerate(sfx):
        ent += ["-i", str(V / f"sfx/{nom}.mp3")]; ms = int(max(0, st) * 1000)
        largo = ",atrim=0:2.6,afade=t=out:st=2.0:d=0.6" if nom == "lapiz" else ""
        fil.append(f"[{base + k}:a]aformat=channel_layouts=stereo{largo},volume={vol},adelay={ms}|{ms}[fx{k}]"); si.append(f"[fx{k}]")
    fil.append("".join(vi) + f"amix=inputs={len(vi)}:normalize=0,apad,atrim=0:{total:.2f},asplit=2[voz][llave]")
    fil.append(f"[{am}:a]aformat=channel_layouts=stereo,adelay=2900|2900,volume=0.34,afade=t=in:st=2.9:d=1.5,afade=t=out:st={total-3:.2f}:d=3,apad,atrim=0:{total:.2f}[mus0]")
    fil.append("[mus0][llave]sidechaincompress=threshold=0.12:ratio=1.5:attack=40:release=500[mus]")
    fil.append(f"[{an}:a]aformat=channel_layouts=stereo,volume=0.22,atrim=0:{total:.2f}[noche]")
    fil.append("".join(si) + f"amix=inputs={len(si)}:normalize=0,apad,atrim=0:{total:.2f}[fx]")
    fil.append("[voz][mus][noche][fx]amix=inputs=4:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9[a]")
    ff(*ent, "-filter_complex", ";".join(fil), "-map", last, "-map", "[a]", "-t", f"{total:.2f}",
       "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(a.sal))
    print(f"{a.sal}  {total:.1f} s, {len(segs)} tramos, {len(capas)} textos, {len(sfx)} efectos")


if __name__ == "__main__":
    main()
