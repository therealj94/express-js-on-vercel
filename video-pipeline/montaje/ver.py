#!/usr/bin/env python3
"""Mira un clip de verdad y devuelve sus defectos. La pareja de oir.py.

Quita mi segundo punto ciego. Yo solo puedo sacar fotogramas sueltos: el
movimiento —morphing, parpadeo, deriva de la cara, un zoom que se va— no se ve
en fotos. Esto manda el vídeo entero a un modelo que sí lo ve.

Probado en los dos sentidos, que es lo que decide si una herramienta sirve:

  - Sobre el plano 06 fallido encontró el idioma inventado, los dientes que se
    deforman, el morphing de la cara y el labial descuadrado. Los cuatro.
  - Sobre el plano del pétalo, que está bien, no inventó defectos.

    export GEMINI_API_KEY=...
    python3 montaje/ver.py clips/06_la_pregunta.mp4
    python3 montaje/ver.py a.mp4 b.mp4 --corte     # ¿casan para cortar?

Los modelos Pro NO están en la capa gratuita: dan cuota 0. Flash sí, y para
esto llega de sobra.
"""
from __future__ import annotations

import argparse, os, sys, time
from pathlib import Path

MODELOS = ("gemini-3-flash-preview", "gemini-2.5-flash", "gemini-flash-latest")

DEFECTOS = """Este clip forma parte de un anuncio y se generó con IA.
Dime SOLO los defectos concretos que lo harían inservible, en español, en lista
corta y con los segundos. Si NO tiene defectos serios, dilo en una línea y no
inventes ninguno. Revisa:
- si una cara cambia de forma, de edad o de rasgos a lo largo del plano
- si el encuadre se acerca o se aleja solo
- boca y dientes: deformaciones, huecos, dientes que se funden
- si alguien habla, y en qué idioma
- manos: dedos de más, dedos fundidos
- parpadeos de luz, texturas que se deslizan, objetos que se transforman"""

CORTE = """Estos dos clips van seguidos en un anuncio y el corte entre ellos es
lo más importante de la pieza: el mismo gesto en dos sitios distintos. Dime en
español si CASAN para cortar del primero al segundo, mirando: la altura y la
posición del objeto en el cuadro, el tamaño en pantalla, y la velocidad del
movimiento. Si no casan, di exactamente qué habría que cambiar."""


def sube(c, ruta: str):
    f = c.files.upload(file=ruta)
    while c.files.get(name=f.name).state == "PROCESSING":
        time.sleep(2)
    return f


def pregunta(c, partes, texto: str) -> str:
    ultimo = ""
    for m in MODELOS:
        try:
            return c.models.generate_content(model=m, contents=[*partes, texto]).text
        except Exception as e:                      # noqa: BLE001
            ultimo = f"{m}: {str(e)[:120]}"
    return f"ningún modelo respondió — {ultimo}"


def main() -> int:
    a = argparse.ArgumentParser()
    a.add_argument("videos", nargs="+")
    a.add_argument("--corte", action="store_true",
                   help="comprobar si dos clips casan para cortar")
    a = a.parse_args()

    clave = os.environ.get("GEMINI_API_KEY")
    if not clave:
        sys.exit("Falta GEMINI_API_KEY en el entorno.")
    from google import genai
    c = genai.Client(api_key=clave)

    if a.corte:
        if len(a.videos) != 2:
            sys.exit("--corte necesita exactamente dos vídeos.")
        partes = [sube(c, v) for v in a.videos]
        print(f"== corte {Path(a.videos[0]).name} -> {Path(a.videos[1]).name}\n")
        print(pregunta(c, partes, CORTE))
        return 0

    for v in a.videos:
        print(f"\n===== {Path(v).name} =====\n")
        print(pregunta(c, [sube(c, v)], DEFECTOS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
