#!/usr/bin/env python3
"""Cadena de dos fases: primero los stills, luego el movimiento.

Es el mayor salto de realismo del pipeline. Un I2V que parte de un still bueno
gana siempre a un T2V, porque la composición, la luz y el encuadre dejan de
depender del muestreador: los fijas tú en una imagen que cuesta céntimos.

Flujo:

    # 1. de la lista de planos saca la cola de stills
    python3 tools/shotlist.py stills -s shotlist.json -o prompts/q_stills.json
    python3 03_run_queue.py --queue prompts/q_stills.json --out /workspace/outputs

    # 2. hoja de contactos para elegir de un vistazo
    python3 tools/shotlist.py sheet -s shotlist.json --out /workspace/outputs

    # 3. anota tu elección en el shotlist ("pick": 3) y saca la cola de vídeo
    python3 tools/shotlist.py video -s shotlist.json -o prompts/q_video.json
    python3 03_run_queue.py --queue prompts/q_video.json --out /workspace/outputs

Formato de `shotlist.json`:

    {
      "defaults": {"still_workflow": "workflows/flux2_api.json",
                   "video_workflow": "workflows/h3_i2v_api.json",
                   "negative": "...", "duration_s": 5, "fps": 24},
      "shots": [
        {"id": "01_apertura",
         "still":  "Aerial view of an open-pit mine at golden hour, ...",
         "motion": "slow descent, dust drifting, heavy machinery below",
         "stills": 6,
         "seeds":  [101, 102, 103, 104, 105, 106, 107, 108],
         "pick":   null}
      ]
    }
"""
from __future__ import annotations

import argparse, json, sys
from pathlib import Path

# MiniMax H3 NO puede generar un solo fotograma: su nodo exige length >= 5
# ("Value 1 smaller than min of 5"). Con duration_s=0 salía length=1 y el
# 1-sep los 101 stills fallaron uno por uno, después de pagar una hora de
# instalación. Cinco fotogramas a 1 fps dan length=5, que además ya cae en la
# rejilla 4n+1 que el modelo necesita; del clip resultante se toma el primer
# fotograma como still.
STILL_DEFAULTS = {"width": 1280, "height": 720, "steps": 28, "cfg": 3.5,
                  "duration_s": 5, "fps": 1, "retries": 1}
VIDEO_DEFAULTS = {"width": 832, "height": 480, "steps": 30, "cfg": 5.0,
                  "duration_s": 5, "fps": 24, "retries": 2}


def load(path: str) -> dict:
    d = json.loads(Path(path).read_text())
    if not d.get("shots"):
        sys.exit("El shotlist no tiene 'shots'.")
    return d


def still_id(shot_id: str, n: int) -> str:
    return f"still_{shot_id}_{n:02d}"


def cmd_stills(sl: dict) -> dict:
    dflt = sl.get("defaults", {})
    jobs = []
    for shot in sl["shots"]:
        n = int(shot.get("stills", 6))
        base_seed = int(shot.get("still_seed", 1000))
        for i in range(n):
            jobs.append({
                "id": still_id(shot["id"], i + 1),
                "prompt": shot["still"],
                "negative": shot.get("negative", dflt.get("negative", "")),
                "seed": base_seed + i,
                "workflow": shot.get("still_workflow",
                                     dflt.get("still_workflow", "workflows/flux2_api.json")),
                # duration_s/fps NO heredan de defaults: un still es un frame,
                # y el 5 del bloque de vídeo lo convertiría en un clip.
                **{k: shot.get(k, v if k in ("duration_s", "fps") else dflt.get(k, v))
                   for k, v in STILL_DEFAULTS.items()},
            })
    return {"version": 1, "defaults": {}, "jobs": jobs}


def cmd_video(sl: dict, outdir: str) -> dict:
    dflt = sl.get("defaults", {})
    manifest = {}
    mpath = Path(outdir) / "manifest.json"
    if mpath.exists():
        manifest = json.loads(mpath.read_text())

    jobs, sin_pick = [], []
    for shot in sl["shots"]:
        pick = shot.get("pick")
        if not pick:
            sin_pick.append(shot["id"])
            continue
        sid = still_id(shot["id"], int(pick))
        files = manifest.get(sid, {}).get("files") or []
        if not files:
            sin_pick.append(f'{shot["id"]} (still {pick} no encontrado en el manifiesto)')
            continue
        # el prompt de movimiento describe QUÉ se mueve; la composición ya está
        # resuelta en la imagen, así que no se repite aquí.
        jobs.append({
            "id": shot["id"],
            "prompt": shot.get("motion") or shot["still"],
            "negative": shot.get("negative", dflt.get("negative", "")),
            "image": files[0],
            "seeds": shot.get("seeds", [1, 2, 3, 4, 5, 6, 7, 8]),
            "workflow": shot.get("video_workflow",
                                 dflt.get("video_workflow", "workflows/h3_i2v_api.json")),
            **{k: shot.get(k, dflt.get(k, v)) for k, v in VIDEO_DEFAULTS.items()},
        })

    if sin_pick:
        print("!! Planos sin 'pick' válido (se omiten): " + ", ".join(sin_pick),
              file=sys.stderr)
    if not jobs:
        sys.exit("Ningún plano tiene still elegido. Pon \"pick\": N en el shotlist.")
    return {"version": 1, "defaults": {}, "jobs": jobs}


def cmd_sheet(sl: dict, outdir: str, cols: int) -> None:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        sys.exit("Falta Pillow: pip install pillow")

    out = Path(outdir)
    manifest = json.loads((out / "manifest.json").read_text())
    for shot in sl["shots"]:
        imgs = []
        for i in range(int(shot.get("stills", 6))):
            files = manifest.get(still_id(shot["id"], i + 1), {}).get("files") or []
            if files and (out / files[0]).exists():
                imgs.append((i + 1, out / files[0]))
        if not imgs:
            continue
        thumb = 480
        rows = -(-len(imgs) // cols)
        sheet = Image.new("RGB", (cols * thumb, rows * (thumb + 28)), "black")
        draw = ImageDraw.Draw(sheet)
        for k, (num, path) in enumerate(imgs):
            im = Image.open(path).convert("RGB")
            im.thumbnail((thumb, thumb))
            x, y = (k % cols) * thumb, (k // cols) * (thumb + 28)
            sheet.paste(im, (x, y + 28))
            draw.text((x + 8, y + 7), f'{shot["id"]}  ->  pick: {num}', fill="white")
        dst = out / f'contactos_{shot["id"]}.jpg'
        sheet.save(dst, quality=90)
        print(f"{dst}   ({len(imgs)} stills)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["stills", "video", "sheet"])
    ap.add_argument("-s", "--shotlist", required=True)
    ap.add_argument("-o", "--output")
    ap.add_argument("--out", default="/workspace/outputs", help="carpeta de resultados")
    ap.add_argument("--cols", type=int, default=3)
    a = ap.parse_args()

    sl = load(a.shotlist)
    if a.cmd == "sheet":
        cmd_sheet(sl, a.out, a.cols)
        return 0

    queue = cmd_stills(sl) if a.cmd == "stills" else cmd_video(sl, a.out)
    dst = Path(a.output or f"prompts/q_{a.cmd}.json")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(queue, indent=2, ensure_ascii=False))
    print(f"{len(queue['jobs'])} trabajos -> {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
