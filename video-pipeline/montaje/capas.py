"""Dibuja las capas del anuncio como PNG transparentes.

ffmpeg de este contenedor viene sin freetype, así que drawtext no existe.
Pillow sí, y además da control real sobre la tipografía.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 720, 1280
ORO, BLANCO, NEGRO = (212, 162, 76), (245, 242, 236), (11, 10, 8)
R = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
M = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
f = lambda ruta, t: ImageFont.truetype(ruta, t)


def pastilla(d, caja, radio=14, alfa=150):
    d.rounded_rectangle(caja, radio, fill=(0, 0, 0, alfa))


def hud(rosas: str, reloj: str, resalta=False) -> Image.Image:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Contador arriba al centro
    pastilla(d, (150, 46, 570, 118), alfa=170 if resalta else 140)
    d.text((174, 60), "ROSAS ENVIADAS", font=f(R, 22), fill=BLANCO + (200,))
    n = f(M, 40)
    an = d.textlength(rosas, font=n)
    d.text((546 - an, 54), rosas, font=n, fill=ORO + (255,))
    if resalta:
        d.rounded_rectangle((150, 46, 570, 118), 14, outline=ORO + (140,), width=2)
    # Reloj arriba a la izquierda
    pastilla(d, (150, 130, 372, 178))
    d.text((168, 140), reloj, font=f(M, 26), fill=BLANCO + (210,))
    return im


def menos(valor="−0.1") -> Image.Image:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((492, 8), valor, font=f(M, 34), fill=ORO + (255,))
    return im


def cierre(logo="og.png") -> Image.Image:
    """Solo el logo y las dos cifras. El nombre se oye, no se lee."""
    im = Image.new("RGBA", (W, H), NEGRO + (255,))
    d = ImageDraw.Draw(im)
    lg = Image.open(logo).convert("RGBA")
    lg.thumbnail((400, 400))
    im.alpha_composite(lg, ((W - lg.width) // 2, 430))
    d.line((250, 700, 470, 700), fill=ORO + (70,), width=1)
    fm = f(M, 30)
    for y, txt, col in ((744, "ENVIADAS      24", BLANCO),
                        (794, "ENTREGADAS  23.9", ORO)):
        d.text(((W - d.textlength(txt, font=fm)) / 2, y), txt, font=fm, fill=col)
    return im


if __name__ == "__main__":
    hud("24", "17:30:00").save("cap_p1.png")
    hud("24", "17:30:01").save("cap_p2.png")
    # El plano 03 cambia A MITAD: hasta que cae el pétalo el contador sigue
    # en 24 y el reloj en 17:30:00. Ponerlo en 23.9 desde el primer fotograma
    # hacía que el número cambiara seis segundos ANTES de lo que lo causa, y
    # ahí es exactamente donde el espectador se perdía.
    hud("24", "17:30:00").save("cap_p3_antes.png")
    hud("23.9", "17:30:04", resalta=True).save("cap_p3_despues.png")
    hud("23.9", "17:30:04").save("cap_p4.png")
    hud("23.9", "17:30:04").save("cap_p5.png")
    menos().save("cap_menos.png")
    cierre().save("cap_cierre.png")
    print("capas dibujadas")
