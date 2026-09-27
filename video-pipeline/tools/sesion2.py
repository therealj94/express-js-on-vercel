#!/usr/bin/env python3
"""De lo que José elige en el móvil a la cola de la sesión 2.

José contesta mirando las hojas: «lucia 3, 02=3 03=1 05=4 …». Esto lo apunta
en el guion (campo pick) y escribe la cola de vídeo:

    python3 tools/sesion2.py --picks "02=3 03=1 05=4 ..." --metodo i2v
    python3 tools/sesion2.py --picks "..." --metodo t2v      # si la prueba i2v falló

- i2v: cada plano parte de su still elegido; el prompt es solo el movimiento.
- t2v: el camino probado (45 de 46 clips): composición + movimiento en texto.

Tomas: 2 por plano, 3 en los que sostienen la historia. Ids `<plano>_tN`, que
es lo que lee hoja_video.py, y nuevos: el pod salta en silencio lo ya hecho.
"""
from __future__ import annotations

import argparse, json, re, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CLAVE = {"02_cocina_nota", "11_un_qr_cada_uno", "15_llamada", "22_lucia_sonrie", "23b_abrazo"}


def leer_picks(texto: str, ids: list[str]) -> dict[str, int]:
    """«02=3 3=1 19b=2» -> {"02_cocina_nota": 3, ...}. El número de plano basta."""
    picks = {}
    for num, n in re.findall(r"([0-9]+[a-z]?)\s*[=:]\s*(\d+)", texto.lower()):
        num = num.zfill(2) if num.isdigit() else num.zfill(3)
        cand = [i for i in ids if i.split("_")[0] == num]
        if len(cand) != 1:
            sys.exit(f"«{num}» no corresponde a un solo plano: {cand or 'ninguno'}")
        picks[cand[0]] = int(n)
    return picks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--picks", required=True)
    ap.add_argument("--metodo", choices=("i2v", "t2v"), required=True)
    ap.add_argument("--guion", default=str(RAIZ / "prompts/pelicula3_un_martes.json"))
    ap.add_argument("--look", default=str(RAIZ / "prompts/pelicula3_look.json"))
    ap.add_argument("-o", "--salida", default=str(RAIZ / "prompts/q_p3_sesion2.json"))
    ap.add_argument("--tomas", type=int, default=2)
    ap.add_argument("--tomas-clave", type=int, default=3)
    ap.add_argument("--pasos", type=int, default=20)
    a = ap.parse_args()

    guion = json.loads(Path(a.guion).read_text())
    look = {s["id"]: s for s in json.loads(Path(a.look).read_text())["shots"]}
    ids = [s["id"] for s in guion["shots"]]
    picks = leer_picks(a.picks, ids)
    faltan = [i for i in ids if i not in picks]
    if a.metodo == "i2v" and faltan:
        sys.exit(f"En i2v cada plano necesita su still. Faltan: {', '.join(faltan)}")

    d = guion["defaults"]
    jobs = []
    for s in guion["shots"]:
        s["pick"] = picks.get(s["id"])
        ls = look[s["id"]]
        n = a.tomas_clave if s["id"] in CLAVE else a.tomas
        for t in range(1, n + 1):
            job = {"id": f"{s['id']}_t{t}", "seed": int(s["seeds"][0]) * 10 + t,
                   "negative": d["negative"], "width": d["width"], "height": d["height"],
                   "duration_s": s.get("duration_s", d["duration_s"]), "fps": d["fps"],
                   "steps": a.pasos, "cfg": 1.0, "retries": 1}
            if a.metodo == "i2v":
                job["workflow"] = "workflows/h3_i2v_api.json"
                job["image"] = f"still_{s['id']}_{s['pick']:02d}_00001_.mp4"
                job["prompt"] = f"{ls['motion']}, {s['move']} camera"
            else:
                job["workflow"] = "workflows/h3_calidad_api.json"
                job["prompt"] = f"{ls['still']} {ls['motion']}, {s['move']} camera"
            jobs.append(job)

    Path(a.guion).write_text(json.dumps(guion, ensure_ascii=False, indent=2))
    cola = {"version": 1, "defaults": {},
            "_nota": f"Sesion 2 de «Un martes» ({a.metodo}): {len(jobs)} tomas a {a.pasos} pasos, 124 fotogramas.",
            "jobs": jobs}
    Path(a.salida).write_text(json.dumps(cola, ensure_ascii=False, indent=1))
    horas = len(jobs) * 11 / 60
    print(f"{len(jobs)} tomas -> {a.salida}  (~{horas:.1f} h de GPU: "
          f"~${horas*2.04:.0f} Spot / ~${horas*5.49:.0f} On-Demand)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
