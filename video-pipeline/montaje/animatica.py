#!/usr/bin/env python3
"""Animática de tiempos de un shotlist, sin tocar la GPU.

No enseña la fotografía —eso cuesta— pero enseña lo único que hay que aprobar
antes de gastar: cuánto dura cada plano, en qué orden van y dónde caen los
rótulos. Un plano que se hace largo se nota aquí gratis, y en la tanda de
verdad cuesta el clip entero.

Cada plano sale con su número, su duración y la descripción en cristiano, sobre
la misma barra de progreso que lleva el pulso de la música.

    python3 montaje/animatica.py prompts/pelicula1_cincuenta.json salida.mp4
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
NEGRO = (14, 13, 11)
ORO = (231, 195, 98)
TEXTO = (244, 239, 228)
APAGADO = (130, 122, 110)

F_TIT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
F_ROT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_DAT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

# Qué se ve en cada plano, en español. La animática es para que José apruebe el
# montaje, no para que lea prompts en inglés.
DESCRIPCIONES = {
    "01_pulperia": ("La pulpería", "Una señora de 58 detrás del mostrador,\nluz dura de mediodía. Entrega una bolsa de pan."),
    "02_telefono_mostrador": ("El teléfono", "Un teléfono rayado boca abajo sobre la madera,\njunto a la bandeja de las monedas. Vibra una vez."),
    "03_hija_cocina": ("La hija, en otro país", "31 años, todavía con el polo del trabajo,\nen una cocina alquilada y chiquita."),
    "04_abre_app": ("Abre", "Sus manos y el teléfono. El pulgar toca\nla pantalla oscura y se queda ahí."),
    "05_elige_contacto": ("La elige", "Cenital cerrado. El pulgar baja despacio\npor la lista y se detiene."),
    "06_pone_dedo": ("Firma", "Macro del pulgar apretando y manteniendo.\nLa luz raka el cristal rayado."),
    "07_suena_pulperia": ("Suena allá", "El mismo teléfono en el mostrador.\nLa mano de la señora entra y lo voltea."),
    "08_cara_senora": ("Lo lee", "Primer plano. Gafas caídas, boca cerrada,\nlas cejas se le suben un milímetro."),
    "09_ensena_pantalla": ("Se lo enseña", "Le da vuelta a la pantalla para el muchacho\nde las cajas. Él se ríe. ES EL PLANO."),
    "10_ve_detalle": ("El comprobante", "Ella toca una línea. Fecha, hora, estado.\nLegible, no un código de programador."),
    "11_tarjeta": ("La tarjeta", "En la farmacia del barrio, mete la tarjeta\nen el datáfono. Sin marca, hasta confirmarlo."),
    "11_caras_calle": ("Cara", "Un vendedor de mercado, quieto,\nmirando a cámara. Sin sonreír de más."),
    "12_caras_calle_b": ("Cara", "Una repartidora en moto, casco bajo el brazo,\nmirando a cámara."),
}

# Los rótulos y el segundo en que entran, contando desde el inicio.
ROTULOS = [
    (20.0, 2.6, "Cuatro segundos."),
    (36.0, 2.8, "Y podés ver exactamente qué pasó."),
    (46.5, 3.2, "Orden Global.\nUn sistema financiero que se puede comprobar."),
]


def envolver(d, texto, f, ancho):
    lineas = []
    for parrafo in texto.split("\n"):
        act = ""
        for p in parrafo.split():
            pr = (act + " " + p).strip()
            if d.textlength(pr, font=f) <= ancho:
                act = pr
            else:
                lineas.append(act); act = p
        lineas.append(act)
    return lineas


def fotograma(n, total, titulo, desc, t_plano, dur_plano, t_global, dur_total):
    im = Image.new("RGB", (W, H), NEGRO)
    d = ImageDraw.Draw(im, "RGBA")

    d.text((90, 240), f"{n:02d} / {total}", font=ImageFont.truetype(F_DAT, 34),
           fill=ORO)
    d.text((W - 90 - d.textlength(f"{dur_plano:.0f}s",
           font=ImageFont.truetype(F_DAT, 34)), 240),
           f"{dur_plano:.0f}s", font=ImageFont.truetype(F_DAT, 34), fill=APAGADO)

    f = ImageFont.truetype(F_TIT, 68)
    y = 420
    for ln in envolver(d, titulo, f, W - 180):
        d.text((90, y), ln, font=f, fill=TEXTO); y += 86

    f = ImageFont.truetype(F_ROT, 38)
    y += 30
    for ln in envolver(d, desc, f, W - 180):
        d.text((90, y), ln, font=f, fill=APAGADO); y += 58

    # Barra del plano y barra de la película: se ve de un vistazo si un plano
    # se está comiendo el anuncio.
    for yy, frac, col in ((H - 320, t_plano / dur_plano, ORO),
                          (H - 270, t_global / dur_total, (90, 84, 72))):
        d.rounded_rectangle([90, yy, W - 90, yy + 8], 4, fill=(46, 42, 35))
        d.rounded_rectangle([90, yy, 90 + (W - 180) * frac, yy + 8], 4, fill=col)

    for t0, dur, txt in ROTULOS:
        if t0 <= t_global < t0 + dur:
            f = ImageFont.truetype(F_TIT, 52)
            yy = H - 620
            for ln in envolver(d, txt, f, W - 200):
                a = d.textbbox((0, 0), ln, font=f)
                d.text(((W - (a[2]-a[0]))/2 - a[0], yy), ln, font=f, fill=ORO)
                yy += 70
    return im


def main():
    sl = json.loads(Path(sys.argv[1]).read_text())
    salida = sys.argv[2]
    planos = sl["shots"]
    dur = sl.get("defaults", {}).get("duration_s", 4)
    total = len(planos) * dur

    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
         "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20",
         "-preset", "fast", salida], stdin=subprocess.PIPE)

    for i, s in enumerate(planos):
        titulo, desc = DESCRIPCIONES.get(s["id"], (s["id"], ""))
        for fr in range(int(dur * FPS)):
            t = fr / FPS
            ff.stdin.write(fotograma(i + 1, len(planos), titulo, desc,
                                     t, dur, i * dur + t, total).tobytes())
        print(f"  {i+1:2d}. {titulo}", flush=True)

    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg falló")
    print(f"listo: {salida} · {total:.0f}s")


if __name__ == "__main__":
    main()
