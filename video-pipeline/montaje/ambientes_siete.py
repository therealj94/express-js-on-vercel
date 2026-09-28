#!/usr/bin/env python3
"""Ambiente de cada lugar de «Siete» (ElevenLabs Sound Effects).

Al igualar las voces se pierde el aire de cada toma y la gente parece hablar en
un vacío: eso suena a IA. Cada lugar tiene aquí su cama de ambiente, que el
montaje pone muy baja debajo de sus planos. Nada de máquinas de coser ni
cortinas metálicas (en la v3 sonaban mal).

    EL_KEY=... python3 montaje/ambientes_siete.py DIR
"""
import json, os, subprocess, sys, urllib.request
from pathlib import Path

LUGARES = {
    "aurelio": "Early morning on a coffee farm in the Guatemalan highlands: tropical birds, a distant rooster, soft wind in the coffee leaves, faint voices far away. Calm, natural, no music.",
    "marcus": "A wooden fishing dock on the Caribbean coast of Belize in the morning: gentle waves lapping the dock, seagulls, palm leaves in the breeze, a small boat creaking. No music.",
    "lucia": "Inside a small upholstery workshop on a quiet street in San Salvador in the morning: distant street traffic, birds outside, a soft room tone. No sewing machine, no music.",
    "chepe": "Inside a fabric warehouse in San Pedro Sula, Honduras: a ceiling fan humming, distant trucks outside, a far forklift beeping once, hot afternoon room tone. No music.",
    "mercedes": "A small village bakery in Nicaragua: a wood-fired oven crackling softly, birds outside the open door, a distant dog, calm morning. No music.",
    "andres": "A roadside in the dry plains of Guanacaste, Costa Rica: warm wind across dry grass, cicadas, a truck engine idling softly nearby, a car passing far away. No music.",
    "rosa": "A small clothing workshop in Panama City: a fan humming, city traffic outside the window, distant voices, a radio very faint in another room. No sewing machine, no music.",
    "aire": "High altitude wind over mountains and sea at sunrise, a soft deep airy whoosh, calm and cinematic. No music.",
}


def main(d: Path):
    d.mkdir(parents=True, exist_ok=True)
    for k, txt in LUGARES.items():
        o = d / f"{k}.mp3"
        if o.exists():
            continue
        body = json.dumps({"text": txt, "duration_seconds": 15, "prompt_influence": 0.5}).encode()
        r = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation", body,
                                   {"xi-api-key": os.environ["EL_KEY"], "Content-Type": "application/json"})
        o.write_bytes(urllib.request.urlopen(r, timeout=300).read())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(o), "-ac", "2", "-ar", "48000",
                        str(o.with_suffix(".wav"))], check=True)
        print("ok", k)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
