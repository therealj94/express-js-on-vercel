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
    centrar(d, "  ".join("VETA WALLET"), ImageFont.truetype(F_ROT, 21),
            int(H * 0.045), GRIS, W)
    y = int(H * 0.13)
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



# ---------------------------------------------------------------- el chat ---
# José: "burbujas de mensaje texto entre mamá y hija". Es lo que arregla el
# arranque: en cuanto se ven dos burbujas con "Mamá" arriba, el espectador ya
# sabe quiénes son la una de la otra, sin que nadie se lo diga.
BURBUJA_ELLA = (38, 40, 45)      # lo que escribe la madre, gris
BURBUJA_HIJA = (150, 116, 30)    # lo que escribe la hija, oro apagado
CHAT_FONDO = (12, 13, 15)


def _burbuja(d, txt, y, mia, W, f, radio=22):
    """Una burbuja de chat. Devuelve su alto."""
    pad = 22
    an = d.textlength(txt, font=f)
    ancho = min(int(an) + pad * 2, int(W * 0.78))
    x = W - ancho - int(W * 0.06) if mia else int(W * 0.06)
    alto = 44 + 26
    d.rounded_rectangle([x, y, x + ancho, y + alto], radio,
                        fill=BURBUJA_HIJA if mia else BURBUJA_ELLA)
    d.text((x + pad, y + 24), txt, font=f, fill=TEXTO)
    return alto + 16


def _cabecera(d, W, f):
    d.text((int(W * 0.06), 40), "Mamá", font=f, fill=TEXTO)
    d.line([(0, 108), (W, 108)], fill=(44, 46, 52), width=2)


def chat(mensajes, W=560, H=1200, foto=None):
    """Una pantalla de chat con las burbujas que ya han aparecido."""
    im = Image.new("RGB", (W, H), CHAT_FONDO)
    d = ImageDraw.Draw(im)
    _cabecera(d, W, ImageFont.truetype(F_ROT, 34))
    y = 150
    for txt, mia in mensajes:
        if txt == "@foto" and foto is not None:
            ancho = int(W * 0.62)
            ft = foto.resize((ancho, int(foto.height * ancho / foto.width)), Image.LANCZOS)
            im.paste(ft, (int(W * 0.06), y))
            y += ft.height + 16
            continue
        y += _burbuja(d, txt, y, mia, W, ImageFont.truetype(F_ROT, 27))
    return im


def secuencia(destino: Path, nombre: str, guion, fps=24, foto=None,
              W=560, H=1200):
    """Los fotogramas del chat: cada mensaje aparece en su segundo.

    `guion` es [(segundo, texto, es_de_la_hija)]. Se escribe una carpeta de PNG
    numerados que `montaje/pantalla.py` pega dentro del teléfono."""
    carpeta = destino / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    dur = max(t for t, _, _ in guion) + 2.0
    for n in range(int(dur * fps)):
        t = n / fps
        vistos = [(txt, mia) for s, txt, mia in guion if s <= t]
        chat(vistos, W, H, foto).save(carpeta / f"{n:04d}.png")
    print(f"{nombre}/  {int(dur*fps)} fotogramas")
    return carpeta


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
