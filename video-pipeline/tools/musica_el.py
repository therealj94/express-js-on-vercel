#!/usr/bin/env python3
"""Banda sonora compuesta, no sintetizada (ElevenLabs Music).

Toda la música de la casa se hacía aquí con osciladores: `musica_cine.py`,
`musica_lanzamiento.py`. Suena limpia y cae en el tiempo, pero es una maqueta.
José lo dijo del ecosistema: *"el sonido de fondo no es de un trailer y no se
escucha"*. Lo primero es verdad y no se arregla mezclando: hay que cambiar la
música.

Esto la encarga descrita. Sale un MP3, se pasa a WAV a 48 kHz y se recorta o
alarga al segundo exacto de la pieza.

    export EL_KEY=...
    python3 tools/musica_el.py /carpeta ecosistema 61.8
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import requests
import soundfile as sf

API = "https://api.elevenlabs.io/v1/music"

# La descripción es el encargo al compositor: instrumentación, arco, y dónde
# cae el golpe. "No vocals" va en todas: una voz de fondo pelearía con la
# narración.
PIEZAS = {
    "ecosistema": (
        "Cinematic technology product trailer score for a premium launch film. "
        "Dark, spacious and expensive. Deep sub-bass pulse from the first bar, "
        "sparse single piano notes with long decay, low sustained strings that "
        "swell slowly, restrained metallic percussion hits landing on the beat, "
        "a rising tension through the middle, one large orchestral impact near "
        "the end followed by a warm resolved major chord and a long fade. "
        "Patient, never busy, no melody in the foreground. No vocals, no choir."),
    "cincuenta": (
        "Intimate documentary film score, warm and restrained. Solo felt piano "
        "with soft sustained strings underneath, no drums, no percussion. Starts "
        "almost silent and sparse, builds very slowly into quiet hope, resolves "
        "warm and simple at the end. Human and unhurried, never sentimental. "
        "No vocals."),
}


def encargar(nombre: str, dur: float, destino: Path) -> Path:
    texto = PIEZAS[nombre]
    # Se pide un poco de más y se recorta: pedir justo deja el final cortado en
    # seco, y un final cortado se oye.
    ms = int((dur + 6) * 1000)
    r = requests.post(API, headers={"xi-api-key": os.environ["EL_KEY"]},
                      json={"prompt": texto, "music_length_ms": ms}, timeout=600)
    if r.status_code != 200:
        sys.exit(f"la API contestó {r.status_code}: {r.text[:200]}")
    mp3 = destino / f"cama_{nombre}.mp3"
    mp3.write_bytes(r.content)
    wav = destino / f"cama_{nombre}.wav"
    # apad + atrim: si la pieza viene corta se rellena con silencio en vez de
    # fallar, y el fundido de salida evita el corte seco.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3),
                    "-af", f"apad,atrim=0:{dur},afade=t=out:st={max(0, dur-2.5)}:d=2.5",
                    "-ar", "48000", "-ac", "1", str(wav)], check=True)
    x, sr = sf.read(wav)
    print(f"{wav.name} · {len(x)/sr:.1f}s · pico {abs(x).max():.2f}")
    return wav


def main() -> int:
    if "EL_KEY" not in os.environ:
        sys.exit("Falta EL_KEY en el entorno.")
    destino = Path(sys.argv[1])
    nombre = sys.argv[2]
    dur = float(sys.argv[3])
    if nombre not in PIEZAS:
        sys.exit(f"no conozco '{nombre}'; hay: {', '.join(PIEZAS)}")
    encargar(nombre, dur, destino)
    return 0


if __name__ == "__main__":
    sys.exit(main())
