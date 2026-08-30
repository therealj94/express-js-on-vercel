#!/usr/bin/env python3
"""Convierte el guion (orden_global.json) en la cola que ejecuta el pod.

Existe porque la primera tanda se generó con un script improvisado que cortaba
la descripción del plano en la primera coma: al modelo le llegó "Deep inside a
narrow wet mine tunnel." — sin minero, sin mineral, sin nadie. Nueve clips
correctos técnicamente y vacíos de historia.

Dos reglas que salieron de aquel fallo:

1. **Nada se recorta nunca.** El texto del guion viaja entero, y al final se
   verifica que cada frase del plano está dentro del prompt enviado.
2. **Los personajes viajan con el plano.** Si en la toma sale RAMIRO, su
   retrato completo entra en el prompt. Sin eso cada plano inventa una cara
   distinta y nueve tomas no parecen la misma película.

    python3 tools/guion.py -g prompts/orden_global.json -o prompts/cola.json
    python3 tools/guion.py -g prompts/orden_global.json -o prompts/cola.json \\
        --segundos 15          # forzar la duración de todos los planos
"""
from __future__ import annotations

import argparse, json, sys
from pathlib import Path

# H3 se entrenó con clips cortos: pasado cierto punto la cara se ablanda y el
# color se lava. Más allá de esto conviene encadenar segmentos, no alargar.
MAX_FIABLE_S = 10


def prompt_de(shot: dict, guion: dict, segundos: int) -> str:
    """Compone el prompt completo: look + escena + personajes + tiempo."""
    partes = [guion.get("look_base", "").strip().rstrip(".") + "."]

    # La escena, ENTERA. Aquí es donde se perdía todo.
    partes.append(shot["still"].strip().rstrip(".") + ".")

    # Quién sale. El retrato completo, no el nombre: el modelo no sabe quién es
    # RAMIRO, solo entiende "minero de 58 años, piel curtida, casco rayado".
    fichas = {p["id"]: p for p in guion.get("casting", [])}
    for pid in shot.get("reparto", []):
        ficha = fichas.get(pid)
        if ficha and ficha.get("rol") != "objeto":
            partes.append(f'{ficha["retrato"].strip().rstrip(".")}.')

    texto = " ".join(partes)

    # El movimiento va en su propio bloque temporal: separar lo que se ve de lo
    # que pasa es lo que evita el morphing.
    texto += (f'\n\nTimeline:\n[0s-{segundos}s] '
              f'{shot["motion"].strip()}\n')
    if shot.get("move") and shot["move"] != "static":
        texto += f'\nCamera: {shot["move"]}, one single movement, no cuts.\n'

    texto += ('\nSingle continuous shot, one take, no cuts, vertical 9:16 '
              'framing.\n\nAudio: natural ambience of the location, no music, '
              'no voice.')
    return texto


def verificar(shot: dict, prompt: str) -> list[str]:
    """Comprueba que nada del guion se quedó fuera. Es el fallo que costó
    nueve clips: el prompt salía plausible y le faltaba el 80%."""
    fallos = []
    for frase in shot["still"].split(","):
        frase = frase.strip()
        if len(frase) > 12 and frase not in prompt:
            fallos.append(f'falta del plano: "{frase[:60]}"')
    if shot["motion"].strip() not in prompt:
        fallos.append("falta el movimiento entero")
    return fallos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-g", "--guion", required=True)
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--segundos", type=int,
                    help="fuerza la duración de todos los planos")
    ap.add_argument("--workflow", default="workflows/h3_calidad_api.json")
    ap.add_argument("--steps", type=int, default=20)
    a = ap.parse_args()

    guion = json.loads(Path(a.guion).read_text())
    fmt, dfl = guion.get("formato", {}), guion.get("defaults", {})

    jobs, problemas = [], []
    for i, shot in enumerate(guion["shots"], 1):
        seg = a.segundos or shot.get("segundos") or dfl.get("duration_s", 5)
        prompt = prompt_de(shot, guion, seg)
        fallos = verificar(shot, prompt)
        if fallos:
            problemas.append((shot["id"], fallos))
        if seg > MAX_FIABLE_S:
            print(f'   aviso: {shot["id"]} pide {seg}s; por encima de '
                  f'{MAX_FIABLE_S}s H3 pierde la cara y lava el color.',
                  file=sys.stderr)
        jobs.append({
            "id": shot["id"], "workflow": a.workflow,
            "prompt": prompt, "negative": dfl.get("negative", ""),
            "seed": 1000 + i * 7, "steps": a.steps, "cfg": 1.0,
            "width": fmt.get("gen_w", 720), "height": fmt.get("gen_h", 1280),
            "duration_s": seg, "fps": fmt.get("fps", 24),
            "post": shot.get("post"),
        })

    if problemas:
        print("\n!! EL GUION NO VIAJA ENTERO:", file=sys.stderr)
        for pid, fallos in problemas:
            for f in fallos:
                print(f"   {pid}: {f}", file=sys.stderr)
        return 1

    Path(a.out).write_text(json.dumps(
        {"defaults": {}, "jobs": jobs}, indent=2, ensure_ascii=False))
    total = sum(j["duration_s"] for j in jobs)
    print(f'{len(jobs)} planos, {total}s de metraje -> {a.out}')
    print(f'Prompt más corto: {min(len(j["prompt"]) for j in jobs)} caracteres '
          f'(antes del arreglo: 45)')
    return 0


if __name__ == "__main__":
    sys.exit(main())
