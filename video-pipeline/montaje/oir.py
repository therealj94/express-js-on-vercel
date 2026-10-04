#!/usr/bin/env python3
"""Escucha el anuncio terminado y lo compara con el guion.

Nace de un límite real: no puedo oír. La voz, el click y el ambiente se
construyeron a ciegas, verificando niveles y tiempos pero nunca el sonido.
Esto cierra el hueco — no oigo, pero puedo transcribir y comparar.

A la primera pasada encontró algo invisible de otro modo: donde el guion dice
"llegó íntegro", la voz sintética pronuncia algo que se transcribe como
"integral". Una palabra rara para un motor de voz es una palabra rota.

    python3 montaje/oir.py --video final_em_alex.mp4 --guion guion_voz.json
"""
from __future__ import annotations

import argparse, json, re, subprocess, sys, unicodedata
from pathlib import Path


def normaliza(t: str) -> list[str]:
    """Sin tildes, sin signos y con los números en cifra, que es como los
    transcribe el reconocedor aunque el guion los escriba con letra."""
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    for palabra, cifra in (("veinticuatro", "24"), ("catorce", "14"),
                           ("veintitres punto nueve", "23.9"), ("diez", "10"),
                           ("cinco", "5"), ("cuatro", "4")):
        t = t.replace(palabra, cifra)
    # El punto solo cuenta si va entre cifras (23.9). Pegado al final de una
    # palabra es puntuación, y dejarlo ahí hacía que "ir." e "ir" salieran como
    # diferencia: nueve avisos falsos que enterraban el único de verdad.
    return [p.strip(".") if not re.fullmatch(r"\d+\.\d+", p) else p
            for p in re.findall(r"[a-z0-9.]+", t)]


def main() -> int:
    a = argparse.ArgumentParser()
    a.add_argument("--video", required=True)
    a.add_argument("--guion", default="guion_voz.json")
    a.add_argument("--modelo", default="small")
    a = a.parse_args()

    wav = Path(a.video).with_suffix(".oido.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.video,
                    "-ac", "1", "-ar", "16000", str(wav)], check=True)

    from faster_whisper import WhisperModel
    modelo = WhisperModel(a.modelo, device="cpu", compute_type="int8")
    segmentos, info = modelo.transcribe(str(wav), language="es", vad_filter=True)
    oido = " ".join(s.text for s in segmentos)

    esperado = " ".join(t for _, t in json.loads(Path(a.guion).read_text()))
    pe, po = normaliza(esperado), normaliza(oido)

    faltan = [p for p in pe if p not in po]
    sobran = [p for p in po if p not in pe]

    print(f"idioma {info.language} ({info.language_probability:.2f})\n")
    print("SE OYE:", oido.strip()[:400])
    if faltan:
        print("\n!! del guion NO se oye:", ", ".join(faltan))
    if sobran:
        print("!! se oye algo que no está en el guion:", ", ".join(sobran))
    if not faltan and not sobran:
        print("\nTodo el guion se oye y no se oye nada de más.")
    return 1 if faltan else 0


if __name__ == "__main__":
    sys.exit(main())
