#!/usr/bin/env python3
"""Compositor de la película del ecosistema sobre material fotográfico.

Lee prompts/pelicula2_montaje.json, coge los clips reales elegidos de cada
plano, los encadena con fundidos, y compone encima la tipografía siguiendo las
reglas técnicas de la pieza de Apple: mascara de recorte para que el texto
aparezca desde la nada, desfase de dos fotogramas entre palabras, y ninguna
palabra viva en pantalla más de lo que se tarda en leerla. Al final, la pasada
de acabado de acabado.py.

    python3 montaje/ecosistema_material.py prompts/pelicula2_montaje.json \\
        /ruta/a/clips salida_muda.mp4
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from acabado import acabar, escalonar, salida, salida_rebote, sombra_larga  # noqa: E402

W, H, FPS = 1080, 1920, 30
TEXTO = (244, 239, 228)

# La tipografía era DejaVu, que es la fuente POR DEFECTO de Linux. José lo vio
# sin saber el nombre: "las letras se ven pobres". Una serif genérica de sistema
# en un rótulo grande delata la pieza entera. Inter es la familia con la que se
# rotula este tipo de cine de producto: neogrotesca, muchos pesos, y aguanta
# tamaños grandes con interletraje negativo sin deshacerse.
TIPO = Path("/usr/local/share/fonts/og")
F_TIT = str(TIPO / "Inter-300.ttf")      # titulares: grandes y ligeros
F_MED = str(TIPO / "Inter-400.ttf")      # frases de varias líneas
F_ROT = str(TIPO / "Inter-500.ttf")      # nombres de producto, en versalitas
F_FUE = str(TIPO / "Inter-600.ttf")      # el nombre de la casa en el cierre
_fuentes: dict = {}


def fuente(ruta: str, tam: int) -> ImageFont.FreeTypeFont:
    if (ruta, tam) not in _fuentes:
        _fuentes[(ruta, tam)] = ImageFont.truetype(ruta, tam)
    return _fuentes[(ruta, tam)]


def ancho_con_track(d, txt: str, f, track: float) -> float:
    """Ancho de un texto con interletraje. Pillow no tiene tracking, así que se
    dibuja carácter a carácter y hay que medir igual."""
    return sum(d.textlength(c, font=f) for c in txt) + track * max(0, len(txt) - 1)


def dibujar_track(d, xy, txt: str, f, fill, track: float):
    x, y = xy
    for c in txt:
        d.text((x, y), c, font=f, fill=fill)
        x += d.textlength(c, font=f) + track


def texto_con_sombra(im: Image.Image, xy, txt: str, f, fill, track: float = 0.0,
                     sombra: float = 0.55, radio: int = 26):
    """Texto con una sombra difusa detrás.

    Sin ella el rótulo se pierde en cuanto pasa por una zona clara del plano, y
    subir el peso de la letra para compensar es lo que la hace parecer barata.
    La sombra va muy difusa y baja: no se ve, se nota."""
    capa = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dc = ImageDraw.Draw(capa, "RGBA")
    dibujar_track(dc, xy, txt, f, fill, track)
    if sombra > 0:
        a = capa.split()[3]
        sm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sm.putalpha(a.filter(ImageFilter.GaussianBlur(radio)).point(
            lambda v: int(v * sombra)))
        im.alpha_composite(sm, (0, 3))
    im.alpha_composite(capa)


LOGOS = Path(__file__).resolve().parent.parent.parent / "logos-orden-global"

# Las marcas tal como se usan en pantalla. Los logos vienen de ocho manos
# distintas —dos son azules, uno lleva un lema en inglés, dos son cuadrados de
# app—, y un trailer de Apple no enseña logos ajenos a media pieza: enseña el
# OBJETO, el NOMBRE en su propia tipografía, y la marca pequeña, siempre del
# mismo tamaño y en el mismo sitio. 'recorte' se queda con el símbolo y tira el
# nombre y el lema, que ya van en tipografía nuestra.
MARCAS = {
    "og":         ("orden-global/orden-global-logo.png", None),
    "veta":       ("veta-wallet/veta-wallet-icono.png", None),
    "genesis":    ("genesis-id/genesis-id-icono.png", None),
    "mytokenpay": ("mytokenpay/mytokenpay-icono.png", None),
    "pulse":      ("pulse2chat/pulse2chat-logo.png", 0.57),   # solo la P
    "ordenex":    ("ordenex/ordenex-logo.png", 0.84),         # sin la palabra
    "aucorp":     ("aucorp/aucorp-logo.png", 0.80),           # sin la palabra
}
_marcas: dict = {}


def marca(clave: str, lado: int) -> Image.Image:
    """La marca lista para componer: recortada a su símbolo, con las esquinas
    redondeadas si es un cuadrado de app, encajada en un cuadro de `lado`."""
    if (clave, lado) in _marcas:
        return _marcas[(clave, lado)]
    ruta, recorte = MARCAS[clave]
    im = Image.open(LOGOS / ruta)
    cuadrado = im.mode != "RGBA"       # icono de app: fondo propio, sin alfa
    im = im.convert("RGBA")
    if recorte:
        im = im.crop((0, 0, im.width, int(im.height * recorte)))
    if cuadrado:
        m = Image.new("L", im.size, 0)
        r = int(min(im.size) * 0.22)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
        im.putalpha(m)
    else:
        a = np.array(im)
        # Ordenex trae el fondo casi blanco como pixeles opacos —en la prueba
        # salió metido en una caja gris—: si la esquina es clara y opaca, todo
        # lo casi blanco pasa a transparente y queda solo el trazo dorado.
        # Medido: Ordenex trae un velo gris a alfa 67 en todo el lienzo y AuCorp
        # uno oscuro a 62. Se quita todo lo que no sea trazo firme.
        a[a[..., 3] < 120, 3] = 0
        # El recorte va por percentiles y no por extremos: Veta tiene píxeles
        # sueltos en los bordes del lienzo y con min/max la marca salía diminuta.
        ys, xs = np.where(a[..., 3] > 120)
        x0, x1 = np.percentile(xs, [0.3, 99.7]).astype(int)
        y0, y1 = np.percentile(ys, [0.3, 99.7]).astype(int)
        im = Image.fromarray(a).crop((x0, y0, x1 + 1, y1 + 1))
    esc = lado / max(im.size)
    im = im.resize((max(1, int(im.width * esc)), max(1, int(im.height * esc))), Image.LANCZOS)
    _marcas[(clave, lado)] = im
    return im


def _pegar(im: Image.Image, capa: Image.Image, cx: int, cy: int, a: float,
           escala: float = 1.0, sombra: bool = True):
    if a <= 0.02:
        return
    if escala != 1.0:
        capa = capa.resize((max(1, int(capa.width * escala)),
                            max(1, int(capa.height * escala))), Image.LANCZOS)
    capa = capa.copy()
    capa.putalpha(capa.split()[3].point(lambda v: int(v * a)))
    pos = (cx - capa.width // 2, cy - capa.height // 2)
    if sombra:
        sombra_larga(im, capa, pos, radio=60, opacidad=0.32 * a, dy=26)
    im.alpha_composite(capa, pos)


def _velo(im: Image.Image, cx: int, cy: int, radio: int, fuerza: float):
    """Un velo oscuro y muy difuso detrás de un grupo de marcas.

    Sin esto, AuCorp y Ordenex —que son líneas doradas finas— desaparecen dentro
    de un plano claro, y engordarlas para compensar las afea. Es lo que hace un
    grafista al poner tipografía sobre una foto clara, y no se ve como una
    mancha porque cae en coseno hasta cero."""
    if fuerza <= 0.01:
        return
    n = 220
    y, x = np.mgrid[0:n, 0:n]
    r = np.sqrt(((x - n / 2) / (n / 2)) ** 2 + ((y - n / 2) / (n / 2)) ** 2)
    g = np.clip(1 - r, 0, 1) ** 1.6
    capa = Image.fromarray((g * 255 * fuerza).astype(np.uint8)).resize(
        (radio * 2, radio * 2), Image.BICUBIC)
    negro = Image.new("RGBA", capa.size, (0, 0, 0, 0))
    negro.putalpha(capa)
    im.alpha_composite(negro, (cx - radio, cy - radio))


def producto(im: Image.Image, nombre: str, clave: str, rel: float, dur: float):
    """La ficha de producto: la marca entra con sobrepaso —tiene masa—, y el
    nombre debajo en versalitas. El interletraje es de VERDAD y no dos espacios
    entre letras, que era lo que había y se notaba en las palabras con acento."""
    e = salida_rebote(float(np.clip(rel / 0.55, 0, 1)))
    fuera = salida(float(np.clip((dur - rel) / 0.35, 0, 1)), 3.0)
    a = float(np.clip(rel / 0.25, 0, 1)) * fuera
    # La ficha vive en el TERCIO INFERIOR. A media altura la marca caía encima
    # del objeto —sobre la moneda de Ordenex parecía una pegatina— y ahí es
    # donde está el sujeto en la mitad de los planos.
    # Un velo detrás de la marca: a esta altura cae sobre el sujeto en la mitad
    # de los planos, y sin él vuelve a parecer una pegatina.
    _velo(im, W // 2, int(H * 0.617), 300, 0.34 * a)
    _pegar(im, marca(clave, 132), W // 2, int(H * 0.617), a, escala=0.86 + 0.14 * e)
    d = ImageDraw.Draw(im, "RGBA")
    f = fuente(F_ROT, 27)
    txt = nombre.upper()
    track = 7.5
    an = ancho_con_track(d, txt, f, track)
    ta = salida(float(np.clip((rel - 0.18) / 0.35, 0, 1)), 4.0) * fuera
    texto_con_sombra(im, ((W - an) / 2, H * 0.673), txt, f,
                     TEXTO + (int(215 * ta),), track, sombra=0.5, radio=18)


# Dónde se coloca cada marca alrededor de Orden Global en el retrato de
# familia: ángulo en grados y orden de entrada. Es el sistema solar real de la
# app —Veta arriba, el resto girando— y no dos entran a la vez.
FAMILIA = [("veta", 270), ("genesis", 330), ("mytokenpay", 30),
           ("pulse", 90), ("ordenex", 150), ("aucorp", 210)]


def familia(im: Image.Image, rel: float):
    """Todo el ecosistema en un cuadro: Orden Global en el centro y las seis
    marcas entrando una a una en órbita, con sobrepaso y sombra larga."""
    cx, cy, radio = W // 2, int(H * 0.42), 372
    e0 = salida_rebote(float(np.clip(rel / 0.9, 0, 1)))
    _velo(im, cx, cy, 640, 0.62 * float(np.clip(rel / 0.5, 0, 1)))
    _pegar(im, marca("og", 330), cx, cy, float(np.clip(rel / 0.4, 0, 1)),
           escala=0.9 + 0.1 * e0)
    for k, (clave, ang) in enumerate(FAMILIA):
        t0 = 0.7 + escalonar(k, 7.0)
        e = salida_rebote(float(np.clip((rel - t0) / 0.6, 0, 1)))
        a = float(np.clip((rel - t0) / 0.25, 0, 1))
        x = cx + int(radio * np.cos(np.radians(ang)))
        y = cy + int(radio * np.sin(np.radians(ang)))
        _pegar(im, marca(clave, 134), x, y, a, escala=0.8 + 0.2 * e)


def extraer(clip: Path, destino: Path) -> int:
    """Convierte un clip en una carpeta de fotogramas a 30 fps y 1080x1920.

    Se hace una vez por clip elegido. Leer PNG por índice es lo que permite
    remapear el tiempo y fundir dos clips fotograma a fotograma."""
    destino.mkdir(parents=True, exist_ok=True)
    if not any(destino.glob("*.png")):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(clip),
                        "-vf", f"fps={FPS},scale={W}:{H}:flags=lanczos",
                        str(destino / "%04d.png")], check=True)
    return len(list(destino.glob("*.png")))


class Plano:
    def __init__(self, carpeta: Path, n: int):
        self.carpeta, self.n = carpeta, n
        self._cache = {}

    def natural(self, segundos: float) -> Image.Image:
        """Fotograma a velocidad real, `segundos` desde el inicio del clip.
        Para gente: remapear 4 s de material a 2,4 s acelera los gestos y se
        nota falso. Si el bloque pide más de lo que hay, se congela el último."""
        return self.fotograma(segundos * FPS / max(1, self.n - 1))

    def fotograma(self, frac: float) -> Image.Image:
        """Fotograma en la fracción [0,1] del clip. El clip se remapea al hueco
        que le toca en el montaje, así que 4 s de material pueden durar 4,2."""
        i = int(np.clip(frac, 0, 1) * (self.n - 1)) + 1
        if i not in self._cache:
            # Solo se guarda el último fotograma: el montaje avanza en orden y
            # cada uno se pide varias veces seguidas. Guardarlos todos eran
            # 6 MB x 121 x 14 planos = 10 GB, y la prueba murió sin aviso a
            # los 48,7 s, justo al entrar en el retrato de familia.
            self._cache = {i: Image.open(self.carpeta / f"{i:04d}.png").convert("RGB")}
        return self._cache[i]


def rotulo(im: Image.Image, texto: str, rel: float, dur: float, chico=False,
           alto=None, escala=1.0):
    """Un rótulo a la manera de Apple.

    Entra por MASCARA —cada palabra se revela desde una línea invisible— con
    dos fotogramas de desfase entre palabras, se queda lo justo, y se va por
    opacidad. Nada de deslizarse desde fuera del cuadro: eso es plantilla.

    El tamaño y el interletraje son lo que separa un rótulo de cine de uno de
    plantilla: los titulares van grandes y LIGEROS con el interletraje cerrado,
    porque una letra gorda a ese cuerpo se lee como cartel de oferta."""
    lineas = texto.split("\n")
    if chico:
        f, track, salto = fuente(F_MED, int(52 * escala)), 0.0, 1.40
    else:
        f, track, salto = fuente(F_TIT, int(86 * escala)), -1.8, 1.22
    y = H * (alto if alto is not None else (0.725 if chico else 0.728))
    fuera = salida(float(np.clip((dur - rel) / 0.35, 0, 1)), 3.0)
    d = ImageDraw.Draw(im, "RGBA")
    # Defensa: si una línea no cabe, se encoge la fuente hasta que quepa. Sin
    # esto, subir el cuerpo de un rótulo lo saca del cuadro sin avisar —pasó con
    # la línea de las cuatro monedas, que se cortaba en "ONDK"—.
    tope = W * 0.90
    while max(ancho_con_track(d, ln, f, track) for ln in lineas) > tope and f.size > 20:
        f = fuente(F_MED if chico else F_TIT, f.size - 2)
    k = 0
    for ln in lineas:
        palabras = ln.split(" ")
        anchos = [ancho_con_track(d, p + " ", f, track) for p in palabras]
        x = (W - sum(anchos)) / 2
        for p, an in zip(palabras, anchos):
            e = salida(float(np.clip((rel - escalonar(k, 2.5)) / 0.32, 0, 1)), 4.0)
            k += 1
            if e <= 0:
                x += an
                continue
            capa = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            dibujar_track(ImageDraw.Draw(capa, "RGBA"), (x, y), p, f,
                          TEXTO + (int(255 * fuera),), track)
            caja = capa.split()[3].getbbox()
            if caja:
                # Máscara: la palabra crece desde su línea base hacia arriba.
                alto_p = caja[3] - caja[1]
                mask = Image.new("L", (W, H), 0)
                ImageDraw.Draw(mask).rectangle(
                    [0, caja[3] - alto_p * e - 6, W, caja[3] + 6], fill=255)
                capa.putalpha(Image.fromarray(
                    np.minimum(np.array(capa.split()[3]), np.array(mask))))
                sm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                sm.putalpha(capa.split()[3].filter(
                    ImageFilter.GaussianBlur(26)).point(lambda v: int(v * 0.55)))
                im.alpha_composite(sm, (0, 3))
            im.alpha_composite(capa)
            x += an
        y += (52 if chico else 86) * escala * salto


def burbuja(im: Image.Image, texto: str, rel: float, dur: float, foto=None,
            alto=0.30):
    """El mensaje del final, con el aspecto de PULSE2CHAT.

    La primera versión era un rectángulo gris con una foto recortada a la altura
    del pecho de la madre —sin cabeza— y José la despachó en tres palabras: "se
    mira super mal". Ahora es una burbuja de su app: azul marino, la etiqueta de
    quién escribe en oro, y la foto con las esquinas redondeadas.

    Va sobreimpresa y no dentro de la pantalla porque en ese plano el teléfono
    se ve de espaldas y desenfocado; texto nítido ahí dentro se vería pegado."""
    e = salida(float(np.clip(rel / 0.45, 0, 1)), 4.0)
    fuera = salida(float(np.clip((dur - rel) / 0.4, 0, 1)), 3.0)
    a = e * fuera
    if a <= 0.02:
        return
    d = ImageDraw.Draw(im, "RGBA")
    f = fuente(F_MED, 40)
    pad = 30
    # Más estrecha que antes: con la foto vertical la burbuja bajaba hasta la
    # franja que tapan el pie de foto y los botones de la red social.
    ancho = int(W * 0.54)
    alto_foto = 0
    if foto is not None:
        af = ancho - pad * 2
        foto = foto.resize((af, int(foto.height * af / foto.width)), Image.LANCZOS)
        alto_foto = foto.height + 20
    altura = alto_foto + 148
    x, y = int(W * 0.10), int(H * alto)

    capa = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dc = ImageDraw.Draw(capa, "RGBA")
    # Azul marino de Pulse2Chat, con un filo de oro a la izquierda.
    dc.rounded_rectangle([x, y, x + ancho, y + altura], 30,
                         fill=(16, 41, 72, int(240 * a)))
    dc.rounded_rectangle([x, y + 22, x + 7, y + altura - 22], 4,
                         fill=(214, 173, 90, int(230 * a)))
    dc.text((x + pad, y + 20), "MAMÁ", font=fuente(F_ROT, 24),
            fill=(214, 173, 90) + (int(235 * a),))
    if foto is not None:
        m = Image.new("L", foto.size, 0)
        ImageDraw.Draw(m).rounded_rectangle(
            [0, 0, foto.width - 1, foto.height - 1], 18, fill=int(255 * a))
        capa.paste(foto.convert("RGB"), (x + pad, y + 62), m)
    dc.text((x + pad, y + alto_foto + 74), texto, font=f,
            fill=TEXTO + (int(255 * a),))

    # Máscara: la burbuja crece desde su base, como los rótulos.
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rectangle(
        [0, y + altura - (altura + 24) * e, W, y + altura + 24], fill=255)
    capa.putalpha(Image.fromarray(
        np.minimum(np.array(capa.split()[3]), np.array(mask))))
    sm = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sm.putalpha(capa.split()[3].filter(
        ImageFilter.GaussianBlur(28)).point(lambda v: int(v * 0.45)))
    im.alpha_composite(sm, (0, 6))
    im.alpha_composite(capa)


def logo(im: Image.Image, rel: float):
    """El logo de Orden Global formándose sobre la gota de oro, con sombra larga."""
    a = salida(np.clip(rel / 1.4, 0, 1), 3.5)
    if a <= 0.02:
        return
    lg = Image.open(LOGOS / "orden-global" / "orden-global-logo.png").convert("RGBA")
    ancho = int(520 * (0.85 + 0.15 * a))
    lg = lg.resize((ancho, int(lg.height * ancho / lg.width)), Image.LANCZOS)
    lg.putalpha(lg.split()[3].point(lambda v: int(v * a)))
    pos = ((W - lg.width) // 2, int(H * 0.30) - lg.height // 2)
    sombra_larga(im, lg, pos, radio=70, opacidad=0.35 * a, dy=30)
    im.alpha_composite(lg, pos)


_fotos: dict = {}


def _foto(ruta: str) -> Image.Image:
    if ruta not in _fotos:
        _fotos[ruta] = Image.open(ruta).convert("RGB")
    return _fotos[ruta]


def main():
    spec = json.loads(Path(sys.argv[1]).read_text())
    clips = Path(sys.argv[2])
    salida_mp4 = sys.argv[3]
    picks = {k: v for k, v in spec.get("picks", {}).items() if not k.startswith("_")}
    fund = spec.get("fundido_s", 0.45)
    dur = spec["salida"]["dur_s"]
    cache = clips / "_frames"

    planos = []
    for b in spec["bloques"]:
        if b.get("negro"):
            planos.append((b, None))
            continue
        toma = picks.get(b["plano"], 1)
        # El runner nombra 'ID_tN_00001_.mp4'.
        cand = sorted(clips.glob(f"{b['plano']}_t{toma}_*.mp4")) or \
               sorted(clips.glob(f"{b['plano']}_t1_*.mp4"))
        if not cand:
            sys.exit(f"falta el clip del plano {b['plano']}")
        n = extraer(cand[0], cache / cand[0].stem)
        planos.append((b, Plano(cache / cand[0].stem, n)))
        print(f"  {b['plano']:24} toma {toma} · {n} fotogramas", flush=True)

    ff = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0",
         "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-tune", "grain",
         "-pix_fmt", "yuv420p", salida_mp4], stdin=subprocess.PIPE)

    total = int(dur * FPS)
    for fr in range(total):
        t = fr / FPS
        # Los bloques que cubren este instante (dos, durante un fundido).
        activos = [(b, p) for b, p in planos if b["t"] <= t < b["t"] + b["dur"]]
        def cuadro(b, p):
            """El fotograma de un bloque: negro, a velocidad natural desde
            `desde` segundos del clip, o remapeado al hueco (material)."""
            if p is None:
                return Image.new("RGB", (W, H), (0, 0, 0))
            if spec.get("natural"):
                return p.natural(t - b["t"] + b.get("desde", 0.0))
            return p.fotograma((t - b["t"]) / b["dur"])

        if not activos:
            base = Image.new("RGB", (W, H), (0, 0, 0))
        else:
            b0, p0 = activos[0]
            base = cuadro(b0, p0).copy()
            if len(activos) > 1:
                b1, p1 = activos[1]
                # Fundido: el segundo entra por opacidad durante fund segundos.
                # Con fundido 0 es un corte seco: el bloque nuevo manda.
                a = 1.0 if fund <= 0 else salida(np.clip((t - b1["t"]) / fund, 0, 1), 2.5)
                base = Image.blend(base, cuadro(b1, p1), float(a))
        im = base.convert("RGBA")
        for b, _ in activos:
            if b.get("logo"):
                logo(im, t - b["t"] - 0.6)
            if b.get("familia"):
                familia(im, t - b["t"] - 0.5)
            for bu in b.get("burbujas", []):
                rel = t - bu["t"]
                if 0 <= rel <= bu["dur"]:
                    foto = _foto(bu["foto"]) if bu.get("foto") else None
                    burbuja(im, bu["texto"], rel, bu["dur"], foto,
                            bu.get("alto", 0.30))
            for r in b.get("rotulos", []):
                rel = t - r["t"]
                if 0 <= rel <= r["dur"]:
                    # La ficha de producto acompaña al primer rótulo del bloque.
                    if b.get("producto") and r is b["rotulos"][0]:
                        producto(im, b["producto"]["nombre"], b["producto"]["marca"],
                                 rel, r["dur"])
                    rotulo(im, r["texto"], rel, r["dur"], r.get("chico", False),
                           r.get("alto"), r.get("escala", 1.0))
        ff.stdin.write(acabar(im, semilla=fr).tobytes())
        if fr % 150 == 0:
            print(f"  {t:5.1f}s / {dur:.0f}s", flush=True)

    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg falló")
    print(f"listo: {salida_mp4} · {dur}s · {total} fotogramas")


if __name__ == "__main__":
    main()
