#!/usr/bin/env python3
"""Planos largos por segmentos, sin perder la secuencia.

Dos formas de encadenar, y no dan el mismo resultado:

  ANCLADO (recomendado, `mode: anchored`)
      Generas los fotogramas clave como imágenes ANTES de animar, y cada
      segmento va de un clave al siguiente con FL2VA (first-last frame).
      Los dos extremos están fijos, así que el color y la identidad no
      pueden derivar: como mucho deriva el centro de un segmento, que dura
      5 s. Es la única forma de llegar a 20-30 s sin que se degrade.

  ENCADENADO (`mode: extend`)
      El último fotograma del segmento N se usa como primer fotograma del
      N+1. Es lo que casi todo el mundo hace, y funciona hasta el tercer
      segmento: a partir de ahí el error se acumula — el color se lava, las
      caras se ablandan y el estilo se va. Útil para continuar una toma que
      ya te gusta, no para construir 30 s.

Uso:

    # extraer el último fotograma de un clip
    python3 tools/extend.py lastframe salida.mp4 -o inputs/seg1_last.png

    # cola del siguiente segmento a partir de lo ya generado
    python3 tools/extend.py chain -s shotlist.json --out /workspace/outputs \\
        --shot 01_apertura --segment 2 -o prompts/q_seg2.json

    # unir los segmentos de un plano en un solo vídeo
    python3 tools/extend.py stitch -s shotlist.json --out /workspace/outputs \\
        --shot 01_apertura --crossfade 0.25
"""
from __future__ import annotations

import argparse, json, subprocess, sys
from pathlib import Path

VIDEO_EXT = (".mp4", ".webm", ".mkv", ".gif")


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode:
        sys.exit(f"ffmpeg falló:\n{p.stderr[-800:]}")


def lastframe(video: str, dst: str) -> str:
    """Último fotograma real del clip. `-sseof -0.1` evita el frame negro
    que a veces cierra el contenedor."""
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-sseof", "-0.1", "-i", video,
         "-vsync", "0", "-frames:v", "1", "-q:v", "2", dst])
    print(dst)
    return dst


def manifest_files(outdir: Path, job_id: str) -> list[str]:
    m = outdir / "manifest.json"
    if not m.exists():
        sys.exit(f"No hay manifiesto en {outdir}")
    return json.loads(m.read_text()).get(job_id, {}).get("files") or []


def seg_id(shot_id: str, n: int) -> str:
    return f"{shot_id}_seg{n:02d}"


def cmd_chain(sl: dict, outdir: Path, shot_id: str, segment: int) -> dict:
    shot = next((s for s in sl["shots"] if s["id"] == shot_id), None)
    if not shot:
        sys.exit(f"El shotlist no tiene el plano {shot_id!r}")
    chain = shot.get("chain", {})
    mode = chain.get("mode", "anchored")
    dflt = sl.get("defaults", {})

    job = {
        "id": seg_id(shot_id, segment),
        "negative": shot.get("negative", dflt.get("negative", "")),
        "seeds": shot.get("seeds", [1, 2, 3, 4]),
        "width": shot.get("width", 832), "height": shot.get("height", 480),
        "duration_s": shot.get("duration_s", dflt.get("duration_s", 5)),
        "fps": shot.get("fps", dflt.get("fps", 24)),
        "steps": shot.get("steps", 30), "cfg": shot.get("cfg", 5.0),
        "retries": 2,
    }

    # el prompt de movimiento puede variar por segmento
    motions = chain.get("motions") or [shot.get("motion", "")]
    job["prompt"] = motions[min(segment - 1, len(motions) - 1)]

    if mode == "anchored":
        # ambos extremos fijos: still del clave N -> still del clave N+1
        keys = chain.get("keyframe_picks") or []
        if len(keys) < segment + 1:
            sys.exit("Faltan 'keyframe_picks': necesitas un still elegido por cada "
                     f"extremo, {segment + 1} para el segmento {segment}.")
        a = manifest_files(outdir, keys[segment - 1])
        b = manifest_files(outdir, keys[segment])
        if not a or not b:
            sys.exit("Alguno de los stills clave no está en el manifiesto todavía.")
        job["image"] = a[0]
        job["image_last"] = b[0]        # el workflow FL2VA lo recibe como LAST_IMAGE
        job["workflow"] = shot.get("video_workflow",
                                   dflt.get("flf_workflow", "workflows/h3_fl2va_api.json"))
    else:
        # encadenado: último fotograma del segmento anterior
        prev = manifest_files(outdir, seg_id(shot_id, segment - 1))
        prev_vid = next((f for f in prev if f.lower().endswith(VIDEO_EXT)), None)
        if not prev_vid:
            sys.exit(f"No encuentro el vídeo del segmento {segment - 1}.")
        png = outdir / "inputs" / f"{seg_id(shot_id, segment - 1)}_last.png"
        lastframe(str(outdir / prev_vid), str(png))
        job["image"] = str(png.relative_to(outdir))
        job["workflow"] = shot.get("video_workflow",
                                   dflt.get("video_workflow", "workflows/h3_i2v_api.json"))
        if segment >= 4:
            print("!! Cuarto segmento encadenado: aquí ya se nota la deriva de "
                  "color y detalle. Considera 'anchored' o cortar el plano.",
                  file=sys.stderr)

    return {"version": 1, "defaults": {}, "jobs": [job]}


def cmd_stitch(sl: dict, outdir: Path, shot_id: str, crossfade: float) -> None:
    shot = next((s for s in sl["shots"] if s["id"] == shot_id), None)
    if not shot:
        sys.exit(f"El shotlist no tiene el plano {shot_id!r}")
    n = int(shot.get("chain", {}).get("segments", 0))
    vids: list[str] = []
    for i in range(1, n + 1):
        files = manifest_files(outdir, seg_id(shot_id, i))
        v = next((f for f in files if f.lower().endswith(VIDEO_EXT)), None)
        if not v:
            sys.exit(f"Falta el vídeo del segmento {i}.")
        vids.append(str(outdir / v))

    dst = outdir / f"{shot_id}_completo.mp4"
    if crossfade <= 0:
        lst = outdir / f"_{shot_id}.txt"
        lst.write_text("".join(f"file '{v}'\n" for v in vids))
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
             "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", str(dst)])
        lst.unlink()
    else:
        # xfade encadenado: cada corte se disuelve, esconde el salto de unión
        dur = float(shot.get("duration_s", 5))
        inputs, filt, last = [], [], "0:v"
        for i, v in enumerate(vids):
            inputs += ["-i", v]
        for i in range(1, len(vids)):
            off = i * (dur - crossfade)
            out = f"x{i}"
            filt.append(f"[{last}][{i}:v]xfade=transition=fade:"
                        f"duration={crossfade}:offset={off:.3f}[{out}]")
            last = out
        run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filt),
             "-map", f"[{last}]", "-c:v", "libx264", "-crf", "16",
             "-pix_fmt", "yuv420p", str(dst)])
    print(f"{dst}   ({len(vids)} segmentos)")


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    lf = sub.add_parser("lastframe")
    lf.add_argument("video"); lf.add_argument("-o", "--output", required=True)

    for name in ("chain", "stitch"):
        p = sub.add_parser(name)
        p.add_argument("-s", "--shotlist", required=True)
        p.add_argument("--out", default="/workspace/outputs")
        p.add_argument("--shot", required=True)
        if name == "chain":
            p.add_argument("--segment", type=int, required=True)
            p.add_argument("-o", "--output")
        else:
            p.add_argument("--crossfade", type=float, default=0.0)

    a = ap.parse_args()
    if a.cmd == "lastframe":
        lastframe(a.video, a.output); return 0

    sl = json.loads(Path(a.shotlist).read_text())
    outdir = Path(a.out)
    if a.cmd == "chain":
        q = cmd_chain(sl, outdir, a.shot, a.segment)
        dst = Path(a.output or f"prompts/q_{a.shot}_seg{a.segment}.json")
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(q, indent=2, ensure_ascii=False))
        print(f"segmento {a.segment} -> {dst}")
    else:
        cmd_stitch(sl, outdir, a.shot, a.crossfade)
    return 0


if __name__ == "__main__":
    sys.exit(main())
