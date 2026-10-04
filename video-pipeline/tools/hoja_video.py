#!/usr/bin/env python3
"""Hoja de contactos de una tanda de VÍDEO: por plano, sus tomas, y de cada
toma el primer y el último fotograma lado a lado.

Para elegir un still basta una imagen; para elegir un clip hace falta ver si
la acción que pedía el prompt ocurrió de verdad —el pulgar que aprieta, la
señora que voltea el teléfono—. Con el primer y el último fotograma de cada
toma se ve el arco entero de un vistazo sin reproducir 56 clips en un móvil.

    python3 tools/hoja_video.py /carpeta/con/clips /carpeta/de/hojas
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

F = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FM = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
PATRON = re.compile(r"^(?P<plano>.+?)_t(?P<toma>\d+)_\d+_\.mp4$")


def fotograma(clip: Path, cuando: str, destino: Path) -> Image.Image:
    """`cuando` es un tiempo de ffmpeg; para el último se usa 'sseof'."""
    if not destino.exists():
        cmd = ["ffmpeg", "-v", "error", "-y"]
        cmd += (["-sseof", "-0.15"] if cuando == "fin" else ["-ss", "0.15"])
        cmd += ["-i", str(clip), "-frames:v", "1", str(destino)]
        subprocess.run(cmd, check=True)
    return Image.open(destino)


def main():
    clips, hojas = Path(sys.argv[1]), Path(sys.argv[2])
    hojas.mkdir(parents=True, exist_ok=True)
    tmp = hojas / "_fot"; tmp.mkdir(exist_ok=True)

    por = {}
    for c in sorted(clips.glob("*.mp4")):
        m = PATRON.match(c.name)
        if m:
            por.setdefault(m["plano"], []).append((int(m["toma"]), c))

    for plano, tomas in sorted(por.items()):
        tomas.sort()
        celdas = []
        for n, c in tomas:
            a = fotograma(c, "ini", tmp / f"{c.stem}_a.png")
            b = fotograma(c, "fin", tmp / f"{c.stem}_b.png")
            for im in (a, b):
                im.thumbnail((250, 445))
            celdas.append((n, a, b))
        w, h = celdas[0][1].width, celdas[0][1].height
        # Cada toma: dos fotogramas pegados (inicio | fin), tomas en fila.
        ancho_toma = w * 2 + 6
        M = Image.new("RGB", (len(celdas) * (ancho_toma + 14) + 14, h + 100), (16, 16, 18))
        d = ImageDraw.Draw(M)
        d.text((12, 14), plano.replace("_", " ").upper(), font=ImageFont.truetype(F, 28),
               fill=(231, 195, 98))
        d.text((12, 50), "cada toma: inicio | fin", font=ImageFont.truetype(FM, 15),
               fill=(150, 142, 128))
        for k, (n, a, b) in enumerate(celdas):
            x = 14 + k * (ancho_toma + 14); y = 76
            M.paste(a, (x, y)); M.paste(b, (x + w + 6, y))
            d.rectangle([x, y + h, x + ancho_toma, y + h + 22], fill=(30, 30, 34))
            d.text((x + 8, y + h + 3), f"toma {n}", font=ImageFont.truetype(FM, 15),
                   fill=(240, 235, 225))
        M.save(hojas / f"hoja_{plano}.jpg", quality=90)
        print(f"  {plano}: {len(celdas)} tomas")
    print(f"{len(por)} planos -> {hojas}")


if __name__ == "__main__":
    main()
