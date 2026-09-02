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
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from acabado import acabar, escalonar, salida, sombra_larga  # noqa: E402

W, H, FPS = 1080, 1920, 30
TEXTO = (244, 239, 228)
F_TIT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
F_ROT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
LOGOS = Path(__file__).resolve().parent.parent.parent / "logos-orden-global"


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

    def fotograma(self, frac: float) -> Image.Image:
        """Fotograma en la fracción [0,1] del clip. El clip se remapea al hueco
        que le toca en el montaje, así que 4 s de material pueden durar 4,2."""
        i = int(np.clip(frac, 0, 1) * (self.n - 1)) + 1
        if i not in self._cache:
            self._cache[i] = Image.open(self.carpeta / f"{i:04d}.png").convert("RGB")
        return self._cache[i]


def rotulo(im: Image.Image, texto: str, rel: float, dur: float, chico=False):
    """Un rótulo a la manera de Apple.

    Entra por MASCARA —cada palabra se revela desde una línea invisible— con
    dos fotogramas de desfase entre palabras, se queda lo justo, y se va por
    opacidad. Nada de deslizarse desde fuera del cuadro: eso es plantilla."""
    d = ImageDraw.Draw(im, "RGBA")
    lineas = texto.split("\n")
    f = ImageFont.truetype(F_ROT if chico else F_TIT, 44 if chico else 74)
    y = H * 0.72 if not chico else H * 0.70
    fuera = salida(np.clip((dur - rel) / 0.35, 0, 1), 3.0)
    k = 0
    for ln in lineas:
        palabras = ln.split(" ")
        anchos = [d.textlength(p + " ", font=f) for p in palabras]
        x = (W - sum(anchos)) / 2
        for p, an in zip(palabras, anchos):
            e = salida(np.clip((rel - escalonar(k, 2.5)) / 0.32, 0, 1), 4.0)
            k += 1
            if e <= 0:
                x += an
                continue
            # Máscara: la palabra crece desde su línea base hacia arriba.
            box = d.textbbox((x, y), p, font=f)
            alto = box[3] - box[1]
            cap = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(cap, "RGBA").text((x, y), p, font=f,
                                             fill=TEXTO + (int(255 * fuera),))
            mask = Image.new("L", (W, H), 0)
            ImageDraw.Draw(mask).rectangle(
                [0, box[3] - alto * e - 6, W, box[3] + 6], fill=255)
            cap.putalpha(Image.fromarray(
                np.minimum(np.array(cap.split()[3]), np.array(mask))))
            im.alpha_composite(cap)
            x += an
        y += (74 if not chico else 44) * 1.35


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
        if not activos:
            base = Image.new("RGB", (W, H), (0, 0, 0))
        else:
            b0, p0 = activos[0]
            base = p0.fotograma((t - b0["t"]) / b0["dur"]).copy()
            if len(activos) > 1:
                b1, p1 = activos[1]
                # Fundido: el segundo entra por opacidad durante fund segundos.
                a = salida(np.clip((t - b1["t"]) / fund, 0, 1), 2.5)
                base = Image.blend(base, p1.fotograma((t - b1["t"]) / b1["dur"]),
                                   float(a))
        im = base.convert("RGBA")
        for b, _ in activos:
            if b.get("logo"):
                logo(im, t - b["t"] - 0.6)
            for r in b.get("rotulos", []):
                rel = t - r["t"]
                if 0 <= rel <= r["dur"]:
                    rotulo(im, r["texto"], rel, r["dur"], r.get("chico", False))
        ff.stdin.write(acabar(im, semilla=fr).tobytes())
        if fr % 150 == 0:
            print(f"  {t:5.1f}s / {dur:.0f}s", flush=True)

    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg falló")
    print(f"listo: {salida_mp4} · {dur}s · {total} fotogramas")


if __name__ == "__main__":
    main()
