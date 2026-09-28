#!/usr/bin/env python3
"""Iguala la voz de cada personaje en todos sus planos.

H3 genera la voz en cada toma a partir de la referencia de timbre, y el timbre
se mueve de una toma a otra (don Chepe sonaba a dos personas). Aquí el audio
de cada toma elegida pasa por el cambio de voz de ElevenLabs (speech-to-speech)
con la voz fija del personaje: se conservan el ritmo y las pausas, así que la
boca sigue sincronizada, y la voz es la misma en todos los planos.

    ELEVEN_API_KEY=... python3 montaje/voces_sts_siete.py --tomas DIR

Deja DIR/voz_sts/<toma>.wav, que montaje/siete.py usa si existe.
"""
import argparse, json, os, subprocess, sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from guion_siete import VOCES  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
P = json.loads((RAIZ / "prompts/pelicula4_siete.json").read_text())


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--tomas", type=Path, required=True)
    a = a.parse_args()
    el = json.loads((a.tomas / "elegidas.json").read_text())
    out = a.tomas / "voz_sts"; out.mkdir(exist_ok=True)
    for t in P["tomas"]:
        if not t.get("voz_ref") or t["id"] not in el:
            continue
        clip = a.tomas / "clips" / el[t["id"]]["clip"]
        dest = out / (clip.stem + ".wav")
        if dest.exists():
            continue
        src = out / (clip.stem + "_src.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(clip), "-vn", "-ac", "1",
                        "-ar", "44100", str(src)], check=True)
        vid = VOCES[t["quien"]][0]
        r = requests.post(f"https://api.elevenlabs.io/v1/speech-to-speech/{vid}?output_format=mp3_44100_128",
                          headers={"xi-api-key": os.environ["ELEVEN_API_KEY"]},
                          data={"model_id": "eleven_multilingual_sts_v2", "remove_background_noise": "true",
                                "voice_settings": json.dumps({"stability": 0.6, "similarity_boost": 0.85})},
                          files={"audio": src.open("rb")}, timeout=300)
        r.raise_for_status()
        # PCM pide un plan más alto; MP3 de 128k basta para una voz bajo música.
        pcm = out / (clip.stem + ".mp3")
        pcm.write_bytes(r.content)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(pcm), str(dest)], check=True)
        pcm.unlink(); src.unlink()
        print(f"{t['id']:5} {t['quien']:9} -> {dest.name}")


if __name__ == "__main__":
    main()
