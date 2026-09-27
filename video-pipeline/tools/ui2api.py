#!/usr/bin/env python3
"""Convierte un workflow de ComfyUI en formato UI al formato API, y le pone
las etiquetas que espera `03_run_queue.py`.

Evita el paso manual de "exportar en API format" desde el navegador: las
plantillas oficiales (MiniMax H3 FL2VA/Ref2VA, Wan 2.2 I2V...) vienen en
formato UI dentro del propio ComfyUI, y esto las deja listas para la cola.

    # dentro del pod, con ComfyUI arriba
    python3 tools/ui2api.py --list-templates
    python3 tools/ui2api.py --template "MiniMax H3" -o prompts/workflows/h3_fl2va_api.json

    # o desde un fichero UI que ya tengas
    python3 tools/ui2api.py -i mi_workflow.json -o prompts/workflows/x_api.json

La conversión usa /object_info del servidor para saber el orden real de los
widgets de cada nodo — que es exactamente lo que hace el frontend.
"""
from __future__ import annotations

import argparse, glob, json, os, re, sys
from pathlib import Path
from urllib import request

# Nodos que existen solo en el lienzo y no se ejecutan.
SKIP_TYPES = {"Note", "MarkdownNote", "Reroute", "PrimitiveNode"}
MODE_MUTED, MODE_BYPASS = 2, 4

# Heurísticas para etiquetar los nodos que la cola necesita manipular.
LABEL_RULES: list[tuple[str, dict]] = [
    ("PROMPT",   {"class_re": r"CLIPTextEncode|TextEncode", "not_title_re": r"neg", "first": True}),
    ("NEGATIVE", {"class_re": r"CLIPTextEncode|TextEncode", "title_re": r"neg"}),
    ("SEED",     {"input": "seed"}),
    ("LATENT",   {"input": "length"}),
    ("IMAGE",      {"class_re": r"^LoadImage", "not_title_re": r"last|final|end"}),
    ("LAST_IMAGE", {"class_re": r"^LoadImage"}),
    ("SAVE",     {"input": "filename_prefix"}),
]


def object_info(server: str) -> dict:
    with request.urlopen(f"{server}/object_info", timeout=60) as r:
        return json.loads(r.read())


def widget_names(spec: dict) -> list[str]:
    """Nombres de los inputs que el frontend guarda como widgets_values, en orden.

    Un input es widget si su tipo es una lista (combo) o un primitivo
    (INT/FLOAT/STRING/BOOLEAN); si es el nombre de otro tipo (MODEL, LATENT...)
    llega por link, no por widget. `control_after_generate` añade un valor extra.
    """
    names: list[str] = []
    req = spec.get("input", {}).get("required", {})
    opt = spec.get("input", {}).get("optional", {})
    order = spec.get("input_order", {})
    ordered = (order.get("required") or list(req)) + (order.get("optional") or list(opt))
    merged = {**req, **opt}
    for name in ordered:
        entry = merged.get(name)
        if not entry:
            continue
        typ = entry[0]
        opts = entry[1] if len(entry) > 1 and isinstance(entry[1], dict) else {}
        if isinstance(typ, list) or typ in ("INT", "FLOAT", "STRING", "BOOLEAN"):
            names.append(name)
            if opts.get("control_after_generate"):
                names.append(f"__control_{name}")
    return names


def convert(ui: dict, info: dict) -> dict:
    nodes = ui.get("nodes", ui.get("workflow", {}).get("nodes", []))
    if not nodes:
        sys.exit("El JSON no parece un workflow en formato UI (sin 'nodes').")

    # link_id -> (nodo_origen, slot_origen)
    links: dict[int, tuple[str, int]] = {}
    for lk in ui.get("links", []):
        if isinstance(lk, list) and len(lk) >= 4:
            links[lk[0]] = (str(lk[1]), lk[2])

    api: dict[str, dict] = {}
    unknown: list[str] = []

    for node in nodes:
        ctype = node.get("type")
        if ctype in SKIP_TYPES or node.get("mode") in (MODE_MUTED, MODE_BYPASS):
            continue
        spec = info.get(ctype)
        if spec is None:
            unknown.append(ctype)
            continue

        nid = str(node["id"])
        inputs: dict = {}

        # 1. entradas conectadas
        connected: set[str] = set()
        for slot in node.get("inputs", []) or []:
            if slot.get("link") is not None and slot["link"] in links:
                inputs[slot["name"]] = list(links[slot["link"]])
                connected.add(slot["name"])

        # 2. widgets, en el orden declarado por el servidor
        values = node.get("widgets_values", []) or []
        if isinstance(values, dict):           # formato nuevo: ya viene por nombre
            for k, v in values.items():
                if not k.startswith("__"):
                    inputs.setdefault(k, v)
        else:
            wnames = [w for w in widget_names(spec) if w not in connected]
            for name, val in zip(wnames, values):
                if not name.startswith("__control_"):
                    inputs[name] = val

        api[nid] = {"class_type": ctype, "inputs": inputs,
                    "_meta": {"title": node.get("title") or ctype}}

    if unknown:
        print(f"!! Nodos que el servidor no conoce (¿custom node sin instalar?): "
              f"{sorted(set(unknown))}", file=sys.stderr)
    return api


def autolabel(api: dict) -> dict[str, str]:
    """Aplica _meta.title = ETIQUETA a los nodos que la cola inyecta."""
    assigned: dict[str, str] = {}
    used: set[str] = set()
    for label, rule in LABEL_RULES:
        best = None
        for nid, node in sorted(api.items(), key=lambda kv: int(kv[0])):
            if nid in used:
                continue
            title = node["_meta"]["title"].lower()
            ctype = node["class_type"]
            if "input" in rule and rule["input"] not in node["inputs"]:
                continue
            if "class_re" in rule and not re.search(rule["class_re"], ctype, re.I):
                continue
            if "title_re" in rule and not re.search(rule["title_re"], title, re.I):
                continue
            if "not_title_re" in rule and re.search(rule["not_title_re"], title, re.I):
                continue
            best = nid
            break
        if best:
            api[best]["_meta"]["title"] = label
            assigned[label] = f'{best} ({api[best]["class_type"]})'
            used.add(best)
    return assigned


def find_templates(roots: list[str]) -> list[Path]:
    found: list[Path] = []
    for root in roots:
        for pat in ("**/templates/*.json", "**/workflow_templates/*.json",
                    "**/user/default/workflows/*.json"):
            found += [Path(p) for p in glob.glob(os.path.join(root, pat), recursive=True)]
    return sorted(set(found))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("-i", "--input", help="workflow en formato UI")
    ap.add_argument("-o", "--output", help="destino en formato API")
    ap.add_argument("--template", help="busca una plantilla instalada por nombre")
    ap.add_argument("--list-templates", action="store_true")
    ap.add_argument("--server", default=os.environ.get("COMFY_URL", "http://127.0.0.1:8188"))
    ap.add_argument("--object-info", help="fichero con /object_info (uso offline)")
    ap.add_argument("--comfy-root", default="/workspace/ComfyUI")
    ap.add_argument("--no-autolabel", action="store_true")
    args = ap.parse_args()

    roots = [args.comfy_root, os.path.expanduser("~/video-ai/ComfyUI"), "."]
    if args.list_templates:
        for p in find_templates(roots):
            print(p)
        return 0

    src = Path(args.input) if args.input else None
    if args.template:
        hits = [p for p in find_templates(roots)
                if args.template.lower().replace(" ", "") in p.stem.lower().replace("_", "").replace("-", "")]
        if not hits:
            print(f"!! Sin plantilla que case con {args.template!r}. Prueba --list-templates",
                  file=sys.stderr)
            return 1
        src = hits[0]
        print(f"==> Plantilla: {src}")
    if not src:
        return ap.error("indica -i/--input o --template")

    info = (json.loads(Path(args.object_info).read_text()) if args.object_info
            else object_info(args.server.rstrip("/")))
    api = convert(json.loads(src.read_text()), info)

    if not args.no_autolabel:
        assigned = autolabel(api)
        for label, where in assigned.items():
            print(f"    {label:<9} -> nodo {where}")
        # steps/cfg no se etiquetan: comparten nodo con seed y el runner los
        # localiza por nombre de input.
        faltan = [l for l, _ in LABEL_RULES
                  if l not in assigned and l not in ("IMAGE", "LAST_IMAGE", "NEGATIVE")]
        if faltan:
            print(f"!! Sin asignar: {faltan}. Renómbralos a mano en ComfyUI "
                  f"(clic derecho -> Title) o edita el JSON.", file=sys.stderr)

    out = Path(args.output) if args.output else src.with_name(src.stem + "_api.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(api, indent=2, ensure_ascii=False))
    print(f"==> {len(api)} nodos -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
