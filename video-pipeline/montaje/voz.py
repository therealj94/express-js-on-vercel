#!/usr/bin/env python3
"""Genera la narración con Kokoro (CPU, sin coste).

Piper sonaba robótico. Kokoro es más pesado pero suena claramente más humano,
y sigue corriendo en CPU sin GPU ni servicios de pago.

Voces masculinas en español: em_alex, em_santa.

    python3 voz.py --voz em_alex --guion guion_voz.json

Instalación en un contenedor limpio: num2words arrastra docopt, que ya no
compila con setuptools moderno. Se resuelve con docopt-ng antes de nada:

    pip install docopt-ng && pip install --no-deps num2words
    pip install kokoro soundfile torch --index-url .../cpu
"""
import argparse, json
import numpy as np, soundfile as sf
from kokoro import KPipeline


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--voz", default="em_alex")
    a.add_argument("--guion", default="guion_voz.json")
    a.add_argument("--velocidad", type=float, default=0.92,
                   help="por debajo de 1 suena más asentado, más de anuncio")
    a = a.parse_args()

    pipe = KPipeline(lang_code="e")
    for i, (_, texto) in enumerate(json.load(open(a.guion)), 1):
        audio = np.concatenate([x for _, _, x in
                                pipe(texto, voice=a.voz, speed=a.velocidad)])
        sf.write(f"k_{a.voz}_{i}.wav", audio, 24000)
        print(f"  {i}. {texto[:50]}")


if __name__ == "__main__":
    main()
