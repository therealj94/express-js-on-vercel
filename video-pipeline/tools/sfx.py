#!/usr/bin/env python3
"""Efectos de sonido reales, generados por descripción (ElevenLabs).

Todo el sonido de la casa se sintetizaba aquí con osciladores y ruido. Para el
metal, el oro y los golpes abstractos de la película del ecosistema eso funciona
y es gratis. Para una bolsa de pan cruzando un mostrador, la risa corta de un
muchacho o el zumbido de una nevera, no: suena a maqueta de los ochenta, y ese
fue literalmente el reproche —"era sintetizador de los 80"—.

Esto los pide de verdad. Cada pieza se guarda en WAV mono a 48 kHz, sin
normalizar: el nivel lo decide la mezcla, no el fichero.

    export EL_KEY=...
    python3 tools/sfx.py /carpeta/de/salida
    python3 tools/sfx.py /carpeta/de/salida s_risa       # solo una

Cuesta dinero por segundo generado, así que no rehace lo que ya existe.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import requests
import soundfile as sf

API = "https://api.elevenlabs.io/v1/sound-generation"

# nombre -> (descripción, segundos). "no music, no voices" va en casi todas:
# sin eso el generador añade una cama musical y el ambiente deja de ser ambiente.
PIEZAS = {
    "s_bolsa": ("a paper bag of bread being handed across a wooden counter, "
                "rustling paper, close, dry, no music", 2.0),
    "s_vibra": ("a phone vibrating twice on a wooden shop counter, buzzing "
                "against wood, close, dry, no music", 2.5),
    "s_toque": ("a single fingertip tapping once on a glass phone screen, very "
                "close, dry, no music", 1.0),
    "s_risa": ("a young man laughs once, short and warm, more breath than "
               "voice, in a small shop, no music", 2.0),
    "s_datafono": ("a card payment terminal beeps once to confirm, single clean "
                   "electronic tone, dry, no music", 1.5),
    "s_tienda": ("quiet ambience inside a small latin american corner shop at "
                 "midday, distant street traffic, faint fan, no voices, no music", 15.0),
    "s_cocina": ("quiet small kitchen room tone at night, faint refrigerator "
                 "hum, distant city outside, no voices, no music", 15.0),
    "s_calle": ("quiet outdoor street ambience in a latin american "
                "neighbourhood, distant motorbike, faint birds, no voices, no music", 12.0),
}


def generar(nombre: str, texto: str, dur: float, destino: Path) -> None:
    wav = destino / f"{nombre}.wav"
    if wav.exists():
        print(f"{nombre}: ya estaba")
        return
    r = requests.post(API, headers={"xi-api-key": os.environ["EL_KEY"]},
                      json={"text": texto, "duration_seconds": dur,
                            "prompt_influence": 0.55}, timeout=300)
    if r.status_code != 200:
        print(f"{nombre}: FALLO {r.status_code} {r.text[:160]}")
        return
    mp3 = destino / f"{nombre}.mp3"
    mp3.write_bytes(r.content)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3),
                    "-ar", "48000", "-ac", "1", str(wav)], check=True)
    x, sr = sf.read(wav)
    print(f"{nombre}: {len(x)/sr:.2f}s · pico {abs(x).max():.2f}")


def main() -> int:
    if "EL_KEY" not in os.environ:
        sys.exit("Falta EL_KEY en el entorno.")
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    destino.mkdir(parents=True, exist_ok=True)
    quiere = sys.argv[2:]
    for nombre, (texto, dur) in PIEZAS.items():
        if quiere and nombre not in quiere:
            continue
        generar(nombre, texto, dur, destino)
    return 0


if __name__ == "__main__":
    sys.exit(main())
