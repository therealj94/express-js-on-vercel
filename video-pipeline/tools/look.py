#!/usr/bin/env python3
"""Biblia de estilo: un mismo "look" en todos los planos.

Lo que hace que un tráiler parezca de Apple no es el modelo — es que los doce
planos parezcan rodados el mismo día, con la misma cámara y el mismo colorista.
Escribir cada prompt a mano garantiza lo contrario: cada toma sale de un mundo
distinto.

Aquí el prompt de cada plano se compone de dos partes:

    LOOK  (idéntico en los 12 planos)   óptica, película, luz, paleta, grano
    PLANO (único de cada toma)          sujeto, acción, encuadre, movimiento

Uso:
    python3 tools/look.py list
    python3 tools/look.py apply -s prompts/shotlist.json -o prompts/shotlist_look.json
    python3 tools/look.py preview -s prompts/shotlist.json --shot 01_apertura
"""
from __future__ import annotations

import argparse, json, sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Looks. Cada uno es una decisión de fotografía completa, no una lista de
# adjetivos bonitos: óptica + película + luz + paleta se sostienen entre sí.
# ---------------------------------------------------------------------------
LOOKS: dict[str, dict] = {
    "apple_product": {
        "desc": "Producto Apple: negro absoluto, luz suave enorme, cero desorden",
        "optics": "shot on ARRI Alexa 35, Zeiss Supreme Prime 50mm, T1.8",
        "light": "single large soft source with deep falloff, controlled specular "
                 "highlights, pure black background, subtle rim separation",
        "palette": "monochrome with one accent colour, crushed blacks, "
                   "clean neutral whites",
        "texture": "immaculate surfaces, macro-level detail, no dust, no grain",
        "grade": "high contrast, lifted nothing, HDR-ready",
    },
    "apple_human": {
        "desc": "Apple humano: gente real, luz natural, calidez contenida",
        "optics": "shot on ARRI Alexa 35, Panavision Primo 85mm, T2.0",
        "light": "large north-facing window light, soft wrap, gentle negative fill, "
                 "natural catchlights in the eyes",
        "palette": "warm neutral skin tones, desaturated surroundings, "
                   "soft teal shadows",
        "texture": "natural skin texture with visible pores and fine hair, "
                   "no plastic smoothing, no beauty retouch",
        "grade": "filmic contrast, gentle highlight rolloff, 35mm-like",
    },
    "cine_epic": {
        "desc": "Épico cinematográfico: paisaje, escala, hora dorada",
        "optics": "shot on 35mm anamorphic, Panavision C-series 40mm, T2.8, horizontal flares",
        "light": "golden hour backlight, long shadows, atmospheric haze, "
                 "volumetric god rays",
        "palette": "warm amber highlights against deep blue shadows",
        "texture": "fine 35mm grain, subtle halation on highlights, dust in air",
        "grade": "cinematic teal and orange, filmic latitude, no clipping",
    },
    "industrial_doc": {
        "desc": "Documental industrial: minería, maquinaria, verdad de fábrica",
        "optics": "shot on Sony Venice 2, 24mm prime, T2.8",
        "light": "hard overhead daylight with practical work lights, "
                 "real bounce off metal and dust",
        "palette": "desaturated steel and earth tones with safety-orange accents",
        "texture": "real dust, scratched metal, worn hi-vis fabric, honest wear",
        "grade": "documentary neutral, mild contrast, true colour",
    },
}

# Negativo base: los defectos que delatan una imagen generada.
NEGATIVE_BASE = (
    "plastic skin, waxy face, smoothed pores, extra fingers, deformed hands, "
    "warped face, dead eyes, text, watermark, logo, subtitles, "
    "oversaturated, HDR halo, blown highlights, banding, "
    "flicker, temporal jitter, morphing, ghosting, "
    "fisheye distortion, tilted horizon, low resolution, blurry, jpeg artifacts"
)

# Vocabulario de movimiento: lo que el modelo de vídeo entiende de verdad.
# Un movimiento por plano. Dos movimientos simultáneos producen deriva.
MOVES = {
    "static": "locked-off camera, no camera movement, only subject moves",
    "push": "slow dolly push in, steady, constant speed",
    "pull": "slow dolly pull out, steady, revealing context",
    "orbit": "slow orbit around the subject, constant radius",
    "descend": "smooth aerial descent, no rotation",
    "tilt_up": "slow tilt up, no pan",
    "handheld": "subtle handheld float, small organic drift, no shake",
}


def compose(look: dict, shot: dict, kind: str = "still") -> str:
    """Un prompt = qué se ve + con qué se rodó. En ese orden: los modelos
    pesan más el principio, y el sujeto debe ir primero."""
    move = shot.get("move")
    if kind == "video":
        # En vídeo el sujeto ya está resuelto en la imagen: manda el movimiento.
        # UNA sola instrucción de cámara; dos producen deriva y morphing.
        motion = (shot.get("motion") or shot["still"]).strip().rstrip(".")
        partes = [motion, MOVES.get(move, MOVES["static"])]
    else:
        # El still es una fotografía fija: nada de movimiento en el prompt.
        partes = [shot["still"].strip().rstrip("."), "cinematic still frame"]
    partes += [look["optics"], look["light"], look["palette"],
               look["texture"], look["grade"]]
    return ", ".join(p for p in partes if p)


def cmd_apply(sl: dict, name: str) -> dict:
    if name not in LOOKS:
        sys.exit(f"Look desconocido: {name}. Opciones: {', '.join(LOOKS)}")
    look = LOOKS[name]
    sl.setdefault("defaults", {})["negative"] = NEGATIVE_BASE
    sl["defaults"]["look"] = name
    for shot in sl["shots"]:
        shot["still"] = compose(look, shot, "still")
        if shot.get("motion") or shot.get("move"):
            shot["motion"] = compose(look, shot, "video")
        shot["negative"] = NEGATIVE_BASE
    return sl


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    for name in ("apply", "preview"):
        p = sub.add_parser(name)
        p.add_argument("-s", "--shotlist", required=True)
        p.add_argument("-l", "--look", default="cine_epic")
        p.add_argument("-o", "--output") if name == "apply" else \
            p.add_argument("--shot")
    a = ap.parse_args()

    if a.cmd == "list":
        for k, v in LOOKS.items():
            print(f"  {k:<16} {v['desc']}")
        print(f"\n  movimientos: {', '.join(MOVES)}")
        return 0

    sl = json.loads(Path(a.shotlist).read_text())

    if a.cmd == "preview":
        look = LOOKS[a.look]
        for shot in sl["shots"]:
            if a.shot and shot["id"] != a.shot:
                continue
            print(f'--- {shot["id"]} ---')
            print("STILL :", compose(look, shot, "still"), "\n")
            if shot.get("motion") or shot.get("move"):
                print("VIDEO :", compose(look, shot, "video"), "\n")
        return 0

    out = cmd_apply(sl, a.look)
    dst = Path(a.output or a.shotlist)
    dst.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f'look "{a.look}" aplicado a {len(out["shots"])} planos -> {dst}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
