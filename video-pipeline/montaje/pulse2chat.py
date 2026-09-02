#!/usr/bin/env python3
"""Las pantallas de PULSE2CHAT, redibujadas para que se lean DENTRO del plano.

Por qué no vale meter una captura de pantalla, que fue el primer intento y salió
mal: en un vídeo vertical de 1080 de ancho, el teléfono ocupa unos 200 píxeles.
Una captura real tiene cuarenta elementos y tipografía de 30 píxeles pensada
para mirarse a un palmo; metida ahí dentro es un borrón gris. José lo dijo de
las dos: *"se mira super mal"*.

Así que se redibuja el MISMO diseño —los colores, el oro, la tarjeta de la
transacción, la barra de abajo salen medidos de su captura— pero con cuatro
elementos y tipografía enorme. A tamaño de plano se lee; de cerca sigue siendo
su app.

    python3 montaje/pulse2chat.py /carpeta   # saca las pantallas de muestra
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Medidos con cuentagotas sobre la captura que mandó José.
FONDO = (6, 26, 51)          # el azul marino del chat
BARRA = (4, 20, 40)          # cabecera y pie, un punto más oscuro
TARJETA = (5, 24, 30)        # el fondo de la tarjeta de transacción
ORO = (214, 173, 90)
ORO_TENUE = (150, 122, 66)
AZUL = (62, 131, 248)        # el botón ENVIAR ORIGEN
VERDE = (58, 196, 122)       # "confirmado"
BLANCO = (238, 243, 250)
APAGADO = (126, 150, 182)
BURBUJA_OTRO = (16, 41, 72)
BURBUJA_MIA = (32, 74, 132)

TIPO = Path("/usr/local/share/fonts/og")
F_400 = str(TIPO / "Inter-400.ttf")
F_500 = str(TIPO / "Inter-500.ttf")
F_600 = str(TIPO / "Inter-600.ttf")
F_700 = str(TIPO / "Inter-700.ttf")
_f: dict = {}


def f(ruta: str, tam: int):
    if (ruta, tam) not in _f:
        _f[(ruta, tam)] = ImageFont.truetype(ruta, tam)
    return _f[(ruta, tam)]


def _track(d, xy, txt, fu, fill, track=0.0):
    x, y = xy
    for c in txt:
        d.text((x, y), c, font=fu, fill=fill)
        x += d.textlength(c, font=fu) + track


def _ancho(d, txt, fu, track=0.0):
    return sum(d.textlength(c, font=fu) for c in txt) + track * max(0, len(txt) - 1)


def cabecera(d, W, nombre: str, gen: str):
    d.rectangle([0, 0, W, 150], fill=BARRA)
    d.text((26, 52), "‹", font=f(F_400, 54), fill=AZUL)
    d.ellipse([64, 46, 122, 104], fill=(12, 44, 60), outline=ORO_TENUE, width=2)
    d.text((140, 44), nombre, font=f(F_600, 44), fill=BLANCO)
    d.text((140, 96), gen, font=f(F_400, 26), fill=APAGADO)
    # El botón ENVIAR ORIGEN: es lo que dice que el dinero se manda DESDE el chat.
    an = _ancho(d, "ENVIAR ORIGEN", f(F_700, 24), 1.6) + 44
    d.rounded_rectangle([W - an - 24, 52, W - 24, 104], 26, fill=AZUL)
    _track(d, (W - an - 2, 66), "ENVIAR ORIGEN", f(F_700, 24), (255, 255, 255), 1.6)


def pie(d, W, H):
    d.rectangle([0, H - 190, W, H], fill=BARRA)
    d.rounded_rectangle([26, H - 168, W - 118, H - 96], 36, fill=(10, 33, 62),
                        outline=(24, 60, 104), width=2)
    d.text((56, H - 148), "Escribe…", font=f(F_400, 30), fill=APAGADO)
    d.ellipse([W - 100, H - 168, W - 28, H - 96], fill=AZUL)
    d.text((W - 74, H - 152), "↑", font=f(F_600, 38), fill=(255, 255, 255))
    for i, (txt, col) in enumerate((("Orden", APAGADO), ("Chat", ORO), ("Ajustes", APAGADO))):
        fu = f(F_500, 24)
        x = W * (i * 2 + 1) / 6 - _ancho(d, txt, fu) / 2
        d.text((x, H - 62), txt, font=fu, fill=col)


def tarjeta_envio(d, W, y: int, cantidad: str, hora: str, hash_: str) -> int:
    """La tarjeta de transacción dentro del chat: es la prueba de que el dinero
    salió por aquí. Alta y con poco texto, para que se lea a tamaño de plano."""
    x0, x1 = 40, W - 40
    alto = 348
    d.rounded_rectangle([x0, y, x1, y + alto], 26, fill=TARJETA, outline=ORO, width=3)
    _track(d, (x0 + 34, y + 30), "ENVIASTE", f(F_700, 26), ORO, 4.0)
    d.text((x0 + 34, y + 74), cantidad, font=f(F_700, 92), fill=BLANCO)
    an = d.textlength(cantidad, font=f(F_700, 92))
    d.text((x0 + 46 + an, y + 118), "ORIGEN", font=f(F_600, 40), fill=ORO)
    d.ellipse([x0 + 36, y + 192, x0 + 66, y + 222], outline=VERDE, width=3)
    d.line([(x0 + 43, y + 208), (x0 + 50, y + 215), (x0 + 60, y + 199)], fill=VERDE, width=3)
    d.text((x0 + 78, y + 190), f"confirmado · {hora}", font=f(F_600, 32), fill=VERDE)
    d.line([(x0 + 34, y + 244), (x1 - 34, y + 244)], fill=(30, 62, 70), width=2)
    # El hash va en su propia línea: en la misma que la etiqueta se pisaban, y a
    # tamaño de plano dos textos encima son una mancha.
    d.text((x0 + 34, y + 258), "Ver en el explorador  ↗", font=f(F_600, 28), fill=ORO)
    d.text((x0 + 34, y + 300), hash_, font=f(F_400, 26), fill=APAGADO)
    return alto + 26


def burbuja(d, W, y: int, txt: str, mia: bool) -> int:
    fu = f(F_400, 34)
    pad, maxw = 30, int(W * 0.74)
    lineas, act = [], ""
    for p in txt.split():
        if d.textlength((act + " " + p).strip(), font=fu) <= maxw - pad * 2:
            act = (act + " " + p).strip()
        else:
            lineas.append(act); act = p
    lineas.append(act)
    an = max(d.textlength(l, font=fu) for l in lineas) + pad * 2
    alto = len(lineas) * 46 + 32
    x = W - an - 40 if mia else 40
    d.rounded_rectangle([x, y, x + an, y + alto], 26,
                        fill=BURBUJA_MIA if mia else BURBUJA_OTRO)
    for i, l in enumerate(lineas):
        d.text((x + pad, y + 16 + i * 46), l, font=fu, fill=BLANCO)
    return alto + 18


def pantalla(elementos, nombre="Mamá", gen="GEN-BQ3N-JCFV-X", W=560, H=1200):
    """Una pantalla de chat. `elementos` es una lista de:
        ("txt", texto, mia)            una burbuja
        ("envio", cantidad, hora, id)  la tarjeta de transacción
    """
    im = Image.new("RGB", (W, H), FONDO)
    d = ImageDraw.Draw(im)
    cabecera(d, W, nombre, gen)
    y = 196
    chip = "mié., 2 sep."
    fu = f(F_500, 26)
    an = d.textlength(chip, font=fu)
    d.rounded_rectangle([(W - an) / 2 - 22, y, (W + an) / 2 + 22, y + 48], 24,
                        fill=(12, 38, 68))
    d.text(((W - an) / 2, y + 10), chip, font=fu, fill=APAGADO)
    y += 76
    for e in elementos:
        if e[0] == "envio":
            y += tarjeta_envio(d, W, y, e[1], e[2], e[3])
        else:
            y += burbuja(d, W, y, e[1], e[2])
    pie(d, W, H)
    return im


# --- la pantalla de firmar el envío, para la película del ecosistema --------
# Misma lógica: la captura real tiene ocho filas de datos que a 200 píxeles son
# un borrón. Aquí van tres cosas: cuánto, a quién, y el botón.
VETA_FONDO = (10, 38, 42)
VETA_CAJA = (7, 30, 34)


def confirmar(cantidad="5", destino_="Mamá", red="Orden Global · 5550",
              W=560, H=1200):
    im = Image.new("RGB", (W, H), VETA_FONDO)
    d = ImageDraw.Draw(im)
    tit = "Revisa antes de enviar"
    fu = f(F_600, 38)
    d.text(((W - d.textlength(tit, font=fu)) / 2, 132), tit, font=fu, fill=BLANCO)
    d.ellipse([W // 2 - 52, 210, W // 2 + 52, 314], fill=(4, 18, 20), outline=ORO, width=3)
    d.ellipse([W // 2 - 26, 236, W // 2 + 26, 288], outline=ORO, width=3)
    d.line([(W // 2, 224), (W // 2, 300)], fill=ORO, width=3)
    can = f"{cantidad} ORIGEN"
    fu = f(F_700, 86)
    d.text(((W - d.textlength(can, font=fu)) / 2, 356), can, font=fu, fill=BLANCO)
    d.rounded_rectangle([44, 486, W - 44, 700], 24, fill=VETA_CAJA)
    filas = [("Para", destino_), ("Red", red), ("Comisión", "0.001953")]
    for i, (a, b) in enumerate(filas):
        y = 512 + i * 62
        d.text((76, y), a, font=f(F_400, 32), fill=APAGADO)
        d.text((W - 76 - d.textlength(b, font=f(F_600, 32)), y), b,
               font=f(F_600, 32), fill=BLANCO)
    d.rounded_rectangle([44, 782, W - 44, 892], 30, fill=ORO)
    bt = "↑  Firmar y enviar"
    fu = f(F_700, 38)
    d.text(((W - d.textlength(bt, font=fu)) / 2, 812), bt, font=fu, fill=(28, 22, 6))
    return im


def secuencia(destino: Path, nombre: str, guion, fps=24, W=560, H=1200,
              contacto="Mamá"):
    """Los fotogramas: cada elemento aparece en su segundo, como al chatear."""
    carpeta = destino / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    dur = max(g[0] for g in guion) + 2.2
    for n in range(int(dur * fps)):
        t = n / fps
        pantalla([g[1:] for g in guion if g[0] <= t], contacto, W=W, H=H).save(
            carpeta / f"{n:04d}.png")
    print(f"{nombre}/  {int(dur*fps)} fotogramas")
    return carpeta


def main() -> int:
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    destino.mkdir(parents=True, exist_ok=True)
    pantalla([("txt", "¿Cómo amaneciste, mi hija?", False),
              ("txt", "Bien, ma. Hoy te mando.", True)]).save(destino / "p2c_inicio.png")
    pantalla([("txt", "Bien, ma. Hoy te mando.", True),
              ("envio", "10", "07:57", "0xb3eedb8e…")]).save(destino / "p2c_envio.png")
    pantalla([("envio", "10", "07:57", "0xb3eedb8e…"),
              ("txt", "Ya compré todo, mi hija.", False)]).save(destino / "p2c_final.png")
    confirmar().save(destino / "p2c_confirmar.png")
    print("cuatro pantallas de muestra")
    return 0


if __name__ == "__main__":
    sys.exit(main())
