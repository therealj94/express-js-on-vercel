#!/usr/bin/env python3
"""Acabado: lo que separa un clip generado de un plano de tráiler.

Un clip recién salido del modelo NO parece cine, por buena que sea la
generación: le falta encuadre de cine, curva de color, grano y respiración de
obturador. Esta cadena la aplica igual a todos los planos, que es justo lo que
hace que doce tomas parezcan una sola pieza.

    finish   un plano:  2.39:1 + curva + grano + interpolación
    qc       puntúa clips y marca los que tienen parpadeo o están blandos
    contact  hoja de contactos en vídeo para elegir entre semillas

Uso:
    python3 tools/post.py finish salida.mp4 -o final/01.mp4 --look cine_epic
    python3 tools/post.py qc /workspace/outputs
    python3 tools/post.py contact /workspace/outputs --prefix 01_apertura
"""
from __future__ import annotations

import argparse, json, re, subprocess, sys
from pathlib import Path

VIDEO_EXT = (".mp4", ".webm", ".mkv")

# Curvas de color por look. eq + curves de ffmpeg, no un LUT externo: así no
# dependes de ficheros .cube que haya que mover entre máquinas.
GRADES = {
    "cine_epic":      "eq=contrast=1.10:saturation=1.06,"
                      "curves=r='0/0.02 0.5/0.52 1/0.98':b='0/0.04 0.5/0.48 1/0.96'",
    "apple_human":    "eq=contrast=1.06:saturation=0.98,"
                      "curves=all='0/0.01 0.25/0.23 0.75/0.78 1/0.99'",
    "apple_product":  "eq=contrast=1.18:saturation=0.92,"
                      "curves=all='0/0.00 0.2/0.14 0.8/0.86 1/1.00'",
    "industrial_doc": "eq=contrast=1.04:saturation=0.90",
    "none":           None,
}


def run(cmd: list[str], quiet: bool = True) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode:
        sys.exit(f"ffmpeg falló:\n{p.stderr[-900:]}")
    return p.stderr if quiet else p.stdout


def duracion(path: str) -> float:
    """Segundos del clip. Se lee del propio ffmpeg: algunas compilaciones
    (la de imageio, por ejemplo) no traen ffprobe."""
    p = subprocess.run(["ffmpeg", "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)", p.stderr)
    if not m:
        return 0.0
    h, mi, se = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(se)


def cmd_finish(src: str, dst: str, look: str, ratio: float, fps_out: int,
               grain: float, fade: float) -> None:
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    filtros = []

    # 1. Encuadre de cine. Recortar a 2.39:1 no es decorativo: cambia dónde
    #    cae el ojo y esconde los bordes, que es donde el modelo falla más.
    if ratio:
        # ancho completo, alto = ancho/relación, centrado. Par para yuv420p.
        filtros.append(f"crop=iw:2*floor(iw/{ratio}/2):0:(ih-iw/{ratio})/2")

    # 2. Curva de color. Sin esto se ve "de IA" aunque el modelo sea perfecto.
    g = GRADES.get(look)
    if g:
        filtros.append(g)

    # 3. Grano. Una capa finísima unifica el ruido entre planos y engaña al
    #    ojo, que asocia el grano con captura real.
    if grain > 0:
        filtros.append(f"noise=alls={grain:.0f}:allf=t+u")

    # 4. Interpolación de movimiento. 24 -> 48 da la fluidez de obturador
    #    que el modelo no genera. minterpolate es lento pero limpio.
    if fps_out and fps_out > 24:
        filtros.append(f"minterpolate=fps={fps_out}:mi_mode=mci:"
                       f"mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=fdiff")

    if fade > 0:
        dur = duracion(src)
        filtros.append(f"fade=t=in:st=0:d={fade}")
        if dur > 2 * fade:
            filtros.append(f"fade=t=out:st={dur - fade:.3f}:d={fade}")

    run(["ffmpeg", "-y", "-i", src,
         "-vf", ",".join(filtros) if filtros else "null",
         "-c:v", "libx264", "-crf", "16", "-preset", "slow",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-c:a", "aac", "-b:a", "192k", dst])
    print(f"{dst}")


def cmd_qc(outdir: str, prefix: str | None) -> None:
    """Puntúa cada clip sin verlo: nitidez y estabilidad temporal.

    No sustituye tu ojo — reduce cuántos clips tiene que mirar tu ojo, que es
    el cuello de botella real cuando generas 96 candidatos.
    """
    out = Path(outdir)
    vids = sorted(p for p in out.rglob("*") if p.suffix.lower() in VIDEO_EXT
                  and (not prefix or p.name.startswith(prefix)))
    if not vids:
        sys.exit(f"Sin vídeos en {out}")

    filas = []
    for v in vids:
        # signalstats: YDIF alto y errático = parpadeo temporal
        err = run(["ffmpeg", "-i", str(v), "-vf",
                   "signalstats,metadata=print:key=lavfi.signalstats.YDIF",
                   "-f", "null", "-"])
        difs = [float(m) for m in re.findall(r"YDIF=([0-9.]+)", err)]
        if not difs:
            continue
        media = sum(difs) / len(difs)
        var = (sum((d - media) ** 2 for d in difs) / len(difs)) ** 0.5
        # parpadeo = variación brusca entre fotogramas contiguos
        flicker = var / media if media else 0
        filas.append((v.name, media, flicker))

    filas.sort(key=lambda r: r[2])
    print(f"{'clip':<46}{'movimiento':>11}{'parpadeo':>10}")
    for nombre, media, fl in filas:
        marca = "  <- revisar" if fl > 0.9 else ("  ok" if fl < 0.5 else "")
        print(f"{nombre:<46}{media:>11.2f}{fl:>10.2f}{marca}")
    print("\nparpadeo bajo = estable. Por encima de 0.9 suele haber morphing "
          "o cambio de luz entre fotogramas.")


def cmd_contact(outdir: str, prefix: str, cols: int) -> None:
    """Mosaico en vídeo de todas las semillas de un plano: eliges viendo
    las 8 a la vez en lugar de abrirlas una por una."""
    out = Path(outdir)
    vids = sorted(p for p in out.rglob("*") if p.suffix.lower() in VIDEO_EXT
                  and p.name.startswith(prefix))
    if not vids:
        sys.exit(f"Sin clips que empiecen por {prefix!r}")
    n = len(vids)
    rows = -(-n // cols)
    inputs = [x for v in vids for x in ("-i", str(v))]
    escala = "".join(f"[{i}:v]scale=480:-2,setsar=1[v{i}];" for i in range(n))
    layout = "|".join(f"{(i % cols) * 480}_{(i // cols) * 270}" for i in range(n))
    filtro = (escala + "".join(f"[v{i}]" for i in range(n)) +
              f"xstack=inputs={n}:layout={layout}:fill=black[out]")
    dst = out / f"contactos_{prefix}.mp4"
    run(["ffmpeg", "-y", *inputs, "-filter_complex", filtro,
         "-map", "[out]", "-c:v", "libx264", "-crf", "20",
         "-pix_fmt", "yuv420p", str(dst)])
    print(f"{dst}   ({n} clips, {rows}x{cols})")


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("finish")
    f.add_argument("src"); f.add_argument("-o", "--output", required=True)
    f.add_argument("--look", default="cine_epic", choices=list(GRADES))
    f.add_argument("--ratio", type=float, default=2.39,
                   help="relación de aspecto final; 0 = no recortar")
    f.add_argument("--fps", type=int, default=48, help="0 = no interpolar")
    f.add_argument("--grain", type=float, default=6)
    f.add_argument("--fade", type=float, default=0.0)

    q = sub.add_parser("qc")
    q.add_argument("outdir"); q.add_argument("--prefix")

    c = sub.add_parser("contact")
    c.add_argument("outdir"); c.add_argument("--prefix", required=True)
    c.add_argument("--cols", type=int, default=4)

    a = ap.parse_args()
    if a.cmd == "finish":
        cmd_finish(a.src, a.output, a.look, a.ratio, a.fps, a.grain, a.fade)
    elif a.cmd == "qc":
        cmd_qc(a.outdir, a.prefix)
    else:
        cmd_contact(a.outdir, a.prefix, a.cols)
    return 0


if __name__ == "__main__":
    sys.exit(main())
