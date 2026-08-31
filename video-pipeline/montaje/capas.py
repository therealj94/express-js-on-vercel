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
    im = Image.new("RGBA", (W, H), NEGRO + (255,))
    d = ImageDraw.Draw(im)
    lg = Image.open(logo).convert("RGBA")
    lg.thumbnail((360, 360))
    im.alpha_composite(lg, ((W - lg.width) // 2, 380))
    t = "ORDEN GLOBAL"; ft = f(R, 40)
    d.text(((W - d.textlength(t, font=ft)) / 2, 640), t, font=ft, fill=ORO)
    d.line((240, 712, 480, 712), fill=ORO + (90,), width=1)
    for y, txt, col in ((752, "ENVIADAS      24", BLANCO),
                        (800, "ENTREGADAS  23.9", ORO)):
        fm = f(M, 29)
        d.text(((W - d.textlength(txt, font=fm)) / 2, y), txt, font=fm, fill=col)
    return im


if __name__ == "__main__":
    hud("24", "17:30:00").save("cap_p1.png")
    hud("24", "17:30:01").save("cap_p2.png")
    hud("23.9", "17:30:04", resalta=True).save("cap_p3.png")
    hud("23.9", "17:30:04").save("cap_p4.png")
    hud("23.9", "17:30:04").save("cap_p5.png")
    menos().save("cap_menos.png")
    cierre().save("cap_cierre.png")
    print("capas dibujadas")
