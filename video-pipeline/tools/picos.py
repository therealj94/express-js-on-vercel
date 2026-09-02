#!/usr/bin/env python3
"""¿En qué segundo del montaje ocurre de verdad cada acción?

Colocar los efectos de oído sale mal: en la primera mezcla de *Cincuenta* varios
llegaban hasta 0,9 s tarde, y un sonido tarde se nota aunque no se sepa por qué.

Esto lo mide. Saca la diferencia media entre fotogramas consecutivos de la toma
elegida de cada plano, se queda solo con el tramo que se ve en el montaje —un
plano de 4 s del que se usan 2,4 puede tener el pico en el trozo descartado— y
traduce los picos a tiempo de la película.

    python3 tools/picos.py prompts/pelicula1_montaje.json /carpeta/con/clips
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

FPS = 24


def perfil(clip: Path, cache: Path) -> np.ndarray:
    cache.mkdir(parents=True, exist_ok=True)
    if not any(cache.glob("*.png")):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(clip),
                        "-vf", "scale=120:-1", "-r", str(FPS),
                        str(cache / "%03d.png")], check=True)
    fs = sorted(cache.glob("*.png"))
    a = [np.asarray(Image.open(f).convert("L"), float) for f in fs]
    return np.array([np.abs(a[i + 1] - a[i]).mean() for i in range(len(a) - 1)])


def main() -> int:
    spec = json.loads(Path(sys.argv[1]).read_text())
    clips = Path(sys.argv[2])
    picks = {k: v for k, v in spec.get("picks", {}).items() if not k.startswith("_")}
    fuera = {}
    print(f"{'plano':24} {'se ve':>13}   picos en el montaje")
    for b in spec["bloques"]:
        p = b["plano"]
        if b.get("negro"):
            continue
        toma = picks.get(p, 1)
        cand = sorted(clips.glob(f"{p}_t{toma}_*.mp4"))
        if not cand:
            print(f"{p:24}  (sin clip)")
            continue
        dif = perfil(cand[0], clips / "_picos" / f"{p}_t{toma}")
        t = np.arange(len(dif)) / FPS
        desde = b.get("desde", 0.0)
        m = (t >= desde) & (t <= desde + b["dur"])
        tv, dv = t[m], dif[m]
        if not len(tv):
            continue
        orden = np.argsort(dv)[::-1]
        picos = [tv[orden[0]]]
        for i in orden[1:]:
            if all(abs(tv[i] - x) > 0.6 for x in picos):
                picos.append(tv[i])
            if len(picos) >= 2:
                break
        fuera[p] = [round(float(b["t"] + (x - desde)), 2) for x in sorted(picos)]
        print(f"{p:24} {desde:5.1f}-{desde+b['dur']:4.1f}s   {fuera[p]}")
    Path("picos.json").write_text(json.dumps(fuera, indent=1))
    print("\n-> picos.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
