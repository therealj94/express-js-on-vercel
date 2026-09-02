#!/usr/bin/env python3
"""Las pantallas de Veta Wallet que se componen dentro de los teléfonos.

Se dibujan aquí, no se generan: un modelo de vídeo no sabe escribir una interfaz
—sale texto ilegible— y por eso todas las pantallas de los clips van encendidas
pero vacías. Estas se pegan encima con `montaje/pantalla.py`, siguiendo el
teléfono al moverse.

Lo que puede aparecer está limitado por el acta de Junta del 14/08/2026: ningún
importe, ningún saldo, ninguna cifra. Solo lo que es verdad y comprobable: que
llegó, cuándo, y el número que cualquiera puede pegar en ordenscan.com.

    python3 montaje/interfaz.py /carpeta/de/salida
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ORO = (231, 195, 98)
TEXTO = (238, 234, 226)
APAGADO = (150, 143, 130)
FONDO = (10, 11, 13)
F_ROT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_MON = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
LOGOS = Path(__file__).resolve().parent.parent.parent / "logos-orden-global"


def centrar(d, txt, f, y, color, W):
    d.text(((W - d.textlength(txt, font=f)) / 2, y), txt, font=f, fill=color)


def splash(W=560, H=1200) -> Image.Image:
    """Lo que se ve al abrir la app. El contenido vive en la mitad de arriba:
    abajo está el pulgar de ella, y componer luz sobre un dedo se nota."""
    im = Image.new("RGB", (W, H), FONDO)
    d = ImageDraw.Draw(im)
    lg = Image.open(LOGOS / "veta-wallet" / "veta-wallet-icono.png").convert("RGBA")
    ancho = int(W * 0.42)
    lg = lg.resize((ancho, int(lg.height * ancho / lg.width)), Image.LANCZOS)
    im.paste(lg, ((W - lg.width) // 2, int(H * 0.20)), lg)
    centrar(d, "  ".join("VETA WALLET"), ImageFont.truetype(F_ROT, 26),
            H * 0.40, TEXTO, W)
    return im


# El comprobante va en CLARO, no en la paleta oscura de la marca, y no es un
# capricho: en ese plano la pantalla le ilumina la cara desde abajo. Una
# pantalla oscura dejaría la luz de su cara sin fuente y el plano se caería.
CLARO = (243, 241, 236)
TINTA = (26, 27, 30)
GRIS = (122, 120, 114)
ORO_OSCURO = (156, 120, 32)


def comprobante(W=560, H=1200) -> Image.Image:
    """El comprobante de la hija. Sin importe: es decisión de José —"quita la
    cifra y solo enseña que llegó"— y además el acta prohíbe cifras."""
    im = Image.new("RGB", (W, H), CLARO)
    d = ImageDraw.Draw(im)
    y = int(H * 0.11)
    # La marca de verificación, dibujada: un círculo y su palomita.
    r = 34
    cx, cy = W // 2, y + r
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=ORO_OSCURO, width=4)
    d.line([(cx - 15, cy + 1), (cx - 4, cy + 13), (cx + 16, cy - 13)],
           fill=ORO_OSCURO, width=5)
    y += 2 * r + 30
    centrar(d, "  ".join("ENTREGADO"), ImageFont.truetype(F_ROT, 25), y, ORO_OSCURO, W)
    centrar(d, "Hoy, 5:34 p. m.", ImageFont.truetype(F_ROT, 37), y + 46, TINTA, W)
    d.line([(W * 0.16, y + 122), (W * 0.84, y + 122)], fill=(206, 203, 196), width=2)
    centrar(d, "Comprobante", ImageFont.truetype(F_ROT, 23), y + 146, GRIS, W)
    centrar(d, "0x7f3a…c19d", ImageFont.truetype(F_MON, 29), y + 180, TINTA, W)
    d.line([(W * 0.16, y + 244), (W * 0.84, y + 244)], fill=(206, 203, 196), width=2)
    centrar(d, "ordenscan.com", ImageFont.truetype(F_ROT, 25), y + 270, ORO_OSCURO, W)
    return im


PANTALLAS = {"ui_splash": splash, "ui_comprobante": comprobante}


def main() -> int:
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    destino.mkdir(parents=True, exist_ok=True)
    for nombre, hacer in PANTALLAS.items():
        im = hacer()
        im.save(destino / f"{nombre}.png")
        print(f"{nombre}.png  {im.size[0]}x{im.size[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
