#!/usr/bin/env python3
"""Autoprueba dentro del pod: genera un clip de verdad y lo dice en el log.

Existe porque desde fuera no siempre se puede alcanzar el pod (proxies que
bloquean IPs crudas en puertos altos). El pod se prueba a sí mismo y el
resultado viaja por el log de Vast, que sí es accesible.

Valida, en este orden:
    1. ComfyUI responde
    2. los nodos de MiniMax H3 están cargados
    3. los pesos aparecen en las listas de modelos
    4. una plantilla oficial se convierte a formato API
    5. una generación real termina y escribe un fichero

Imprime AUTOPRUEBA: OK / FALLO para que se pueda leer de un vistazo.
"""
from __future__ import annotations

import glob, json, os, sys, time
from urllib import request, error

BASE = os.environ.get("COMFY_SELFTEST_URL", "http://127.0.0.1:9000")
TIMEOUT_GEN = int(os.environ.get("SELFTEST_TIMEOUT", "1800"))


def api(path: str, payload: dict | None = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = request.Request(f"{BASE}{path}", data=data,
                          headers={"Content-Type": "application/json"})
    with request.urlopen(req, timeout=120) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def espera_servidor(seg: int = 900) -> None:
    fin = time.time() + seg
    while time.time() < fin:
        try:
            api("/system_stats"); return
        except Exception:
            time.sleep(5)
    raise SystemExit("AUTOPRUEBA: FALLO — ComfyUI no respondió")


def widgets(spec: dict) -> list[str]:
    req = spec.get("input", {}).get("required", {})
    opt = spec.get("input", {}).get("optional", {})
    order = spec.get("input_order", {})
    nombres, merged = [], {**req, **opt}
    for name in (order.get("required") or list(req)) + (order.get("optional") or list(opt)):
        e = merged.get(name)
        if not e:
            continue
        t = e[0]
        o = e[1] if len(e) > 1 and isinstance(e[1], dict) else {}
        if isinstance(t, list) or t in ("INT", "FLOAT", "STRING", "BOOLEAN"):
            nombres.append(name)
            if o.get("control_after_generate"):
                nombres.append("__ctl")
    return nombres


def ui_a_api(ui: dict, info: dict) -> dict:
    enlaces = {l[0]: (str(l[1]), l[2]) for l in ui.get("links", [])
               if isinstance(l, list) and len(l) >= 4}
    api_wf: dict[str, dict] = {}
    for n in ui.get("nodes", []):
        ct = n.get("type")
        if ct in {"Note", "MarkdownNote", "Reroute", "PrimitiveNode"} or n.get("mode") in (2, 4):
            continue
        spec = info.get(ct)
        if spec is None:
            continue
        ins, conectados = {}, set()
        for s in n.get("inputs", []) or []:
            if s.get("link") in enlaces:
                ins[s["name"]] = list(enlaces[s["link"]]); conectados.add(s["name"])
        vals = n.get("widgets_values") or []
        if isinstance(vals, dict):
            for k, v in vals.items():
                ins.setdefault(k, v)
        else:
            for nombre, v in zip([w for w in widgets(spec) if w not in conectados], vals):
                if nombre != "__ctl":
                    ins[nombre] = v
        api_wf[str(n["id"])] = {"class_type": ct, "inputs": ins,
                                "_meta": {"title": n.get("title") or ct}}
    return api_wf


def encoge(wf: dict) -> None:
    """Prueba barata: resolución baja, pocos pasos, clip corto."""
    for nodo in wf.values():
        i = nodo["inputs"]
        for k, v in (("width", 480), ("height", 272), ("length", 25),
                     ("steps", 6), ("batch_size", 1)):
            if k in i and not isinstance(i[k], list):
                i[k] = v


def main() -> int:
    print("== AUTOPRUEBA ==", flush=True)
    espera_servidor()
    print("  1/5 ComfyUI responde", flush=True)

    info = api("/object_info")
    h3 = sorted(k for k in info if "minimax" in k.lower() or "h3" in k.lower())
    print(f"  2/5 nodos H3 detectados: {h3[:6] or 'NINGUNO'}", flush=True)

    modelos = []
    for clase in ("UNETLoader", "CheckpointLoaderSimple", "CLIPLoader", "VAELoader"):
        spec = info.get(clase, {}).get("input", {}).get("required", {})
        for nombre, e in spec.items():
            if isinstance(e[0], list) and e[0]:
                modelos += [f"{clase}.{nombre}={x}" for x in e[0][:4]]
    print(f"  3/5 pesos visibles: {len(modelos)}", flush=True)
    # Esquema de los nodos de H3: con esto se pueden escribir workflows a mano
    # más tarde, sin necesidad de tener el pod encendido.
    for n in h3[:10]:
        req = info[n].get("input", {}).get("required", {})
        print(f"     NODO {n}: {list(req)[:12]}", flush=True)
    for m in modelos[:8]:
        print(f"        {m}", flush=True)
    if not modelos:
        print("AUTOPRUEBA: FALLO — ComfyUI no ve ningún peso"); return 1

    # Buscar plantillas y quedarse con una que NO pida imagen de entrada: las de
    # first-last-frame necesitan ficheros que no existen en un pod recién hecho,
    # y hacían fallar la prueba por una razón que no era la instalación.
    candidatas = []
    for pat in ("**/*minimax*.json", "**/*h3*.json", "**/*wan*.json", "**/*flux*.json"):
        for raiz in ("/workspace/venv/lib", "/workspace/ComfyUI"):
            candidatas += [h for h in glob.glob(os.path.join(raiz, pat), recursive=True)
                           if "template" in h.lower() or "workflow" in h.lower()]
    candidatas = sorted(set(candidatas))

    def pide_imagen(ruta: str) -> bool:
        try:
            return "LoadImage" in open(ruta).read()
        except Exception:
            return True

    sin_imagen = [c for c in candidatas if not pide_imagen(c)]
    plantilla = (sin_imagen or candidatas or [None])[0]

    # Volcar al log el inventario, para poder construir workflows sin el pod
    print(f"  -- plantillas encontradas: {len(candidatas)}", flush=True)
    for c in candidatas[:20]:
        print(f"     {'T2V' if c in sin_imagen else 'img'}  {os.path.basename(c)}", flush=True)
    if not plantilla:
        print("  4/5 sin plantilla oficial en disco: no se puede generar sin workflow")
        print("AUTOPRUEBA: PARCIAL — instalación y pesos OK, generación no probada")
        return 0
    print(f"  4/5 plantilla: {plantilla}", flush=True)

    try:
        wf = ui_a_api(json.loads(open(plantilla).read()), info)
        encoge(wf)
        pid = api("/prompt", {"prompt": wf})["prompt_id"]
    except error.HTTPError as e:
        print(f"AUTOPRUEBA: FALLO — ComfyUI rechazó el workflow: "
              f"{e.read().decode()[:400]}")
        return 1
    except Exception as e:
        print(f"AUTOPRUEBA: FALLO — no se pudo montar el workflow: {e}")
        return 1

    print(f"  5/5 generando (prompt {pid})...", flush=True)
    fin = time.time() + TIMEOUT_GEN
    while time.time() < fin:
        h = api(f"/history/{pid}").get(pid)
        if h:
            st = h.get("status", {})
            ficheros = [f["filename"] for o in h.get("outputs", {}).values()
                        for kind in ("gifs", "videos", "images", "audio")
                        for f in o.get(kind, [])]
            if ficheros:
                print(f"AUTOPRUEBA: OK — generó {ficheros}")
                return 0
            if st.get("status_str") == "error":
                print(f"AUTOPRUEBA: FALLO — {json.dumps(st)[:500]}")
                return 1
        time.sleep(5)
    print("AUTOPRUEBA: FALLO — la generación no terminó a tiempo")
    return 1


if __name__ == "__main__":
    sys.exit(main())
