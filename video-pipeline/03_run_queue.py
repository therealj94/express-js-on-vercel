#!/usr/bin/env python3
"""Ejecuta una cola JSON de clips contra la API de ComfyUI, sin intervención.

Convención: en el workflow exportado en formato *API* se renombran los nodos
(clic derecho -> Title) con estas etiquetas, y el runner inyecta los valores:

    PROMPT     -> inputs.text
    NEGATIVE   -> inputs.text
    SEED       -> inputs.seed / noise_seed
    STEPS      -> inputs.steps
    CFG        -> inputs.cfg
    LATENT     -> inputs.width / height / length   (length = duration_s * fps)
    IMAGE      -> inputs.image                     (i2v / primer frame)
    SAVE       -> inputs.filename_prefix           (= id del job)

Uso:
    python3 03_run_queue.py --queue prompts/queue.json --out /workspace/outputs
"""
from __future__ import annotations

import argparse, copy, json, os, subprocess, sys, time, uuid
from pathlib import Path
from urllib import request, error

SERVER = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
CLIENT_ID = str(uuid.uuid4())


def api(path: str, payload: dict | None = None) -> dict:
    url = f"{SERVER}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = request.Request(url, data=data,
                          headers={"Content-Type": "application/json"})
    with request.urlopen(req, timeout=60) as r:
        body = r.read()
    return json.loads(body) if body else {}


def wait_server(timeout: int = 600) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            api("/system_stats")
            return
        except Exception:
            time.sleep(5)
    sys.exit(f"ComfyUI no responde en {SERVER}")


def nodes_by_title(wf: dict) -> dict[str, str]:
    """{TITULO_MAYUSCULAS: node_id}"""
    out: dict[str, str] = {}
    for nid, node in wf.items():
        title = (node.get("_meta") or {}).get("title", "").strip().upper()
        if title:
            out.setdefault(title, nid)
    return out


def set_input(wf: dict, nid: str | None, key: str, value) -> None:
    """Fija inputs[key] en el nodo etiquetado; si no lo hay, en el único nodo
    que declare ese input. Así basta con etiquetar PROMPT/NEGATIVE/SAVE:
    seed, steps, cfg, width... se localizan solos aunque compartan nodo."""
    if nid and key in wf[nid].get("inputs", {}):
        wf[nid]["inputs"][key] = value
        return
    owners = [n for n, node in wf.items()
              if key in node.get("inputs", {})
              and not isinstance(node["inputs"][key], list)]  # list = viene por link
    if len(owners) == 1:
        wf[owners[0]]["inputs"][key] = value


def build(workflow_path: Path, job: dict) -> dict:
    wf = copy.deepcopy(json.loads(workflow_path.read_text()))
    t = nodes_by_title(wf)
    # H3 y Wan trabajan con longitudes 4n+1 (5 s a 24 fps = 121, no 120).
    # Pasar un valor no alineado hace que el VAE recorte o falle.
    raw = max(1, int(round(job["duration_s"] * job["fps"])))
    frames = round(raw / 4) * 4 + 1

    # Según el nodo el campo se llama "text" (CLIPTextEncode) o "prompt"
    # (MiniMaxH3ImageToVideo). Se prueban los dos: el que no exista se ignora.
    # Según el nodo el campo se llama "text" (CLIPTextEncode) o "prompt"
    # (MiniMaxH3ImageToVideo): se prueban los dos.
    for campo in ("text", "prompt"):
        set_input(wf, t.get("PROMPT"), campo, job["prompt"])
    # El negativo SOLO si hay un nodo etiquetado. Sin esa condición, la búsqueda
    # por nombre de campo cae en el mismo nodo del prompt y lo deja vacío —
    # el workflow se ejecuta y genera ruido, sin decir por qué.
    if t.get("NEGATIVE"):
        for campo in ("text", "prompt"):
            set_input(wf, t["NEGATIVE"], campo, job.get("negative", ""))
    for key in ("seed", "noise_seed"):
        set_input(wf, t.get("SEED"), key, job["seed"])
    set_input(wf, t.get("STEPS"), "steps", job["steps"])
    set_input(wf, t.get("CFG"), "cfg", job["cfg"])
    for key, val in (("width", job["width"]), ("height", job["height"]),
                     ("length", frames), ("batch_size", 1)):
        set_input(wf, t.get("LATENT"), key, val)
    if job.get("image"):
        set_input(wf, t.get("IMAGE"), "image", job["image"])
    # FL2VA: segundo extremo del plano. Anclar los dos extremos es lo que
    # impide que el color y la identidad deriven al encadenar segmentos.
    if job.get("image_last"):
        set_input(wf, t.get("LAST_IMAGE"), "image", job["image_last"])
    set_input(wf, t.get("SAVE"), "filename_prefix", job["id"])
    return wf


def run_job(wf: dict, poll: float = 3.0, timeout: int = 3600) -> list[str]:
    """Encola y espera. Devuelve las rutas relativas de los ficheros generados."""
    try:
        pid = api("/prompt", {"prompt": wf, "client_id": CLIENT_ID})["prompt_id"]
    except error.HTTPError as e:
        # Un 400 de ComfyUI trae en el cuerpo QUÉ nodo y QUÉ campo falla.
        # Sin eso solo se ve "Bad Request" y hay que adivinar, que fue
        # exactamente lo que pasó con la primera tanda de nueve planos.
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8','replace')[:900]}")
    deadline = time.time() + timeout
    while time.time() < deadline:
        hist = api(f"/history/{pid}")
        entry = hist.get(pid)
        if entry:
            status = entry.get("status", {})
            if status.get("status_str") == "error" or status.get("completed") is False:
                raise RuntimeError(json.dumps(status)[:500])
            files: list[str] = []
            for out in entry.get("outputs", {}).values():
                for kind in ("gifs", "videos", "images", "audio"):
                    for f in out.get(kind, []):
                        files.append(os.path.join(f.get("subfolder", ""),
                                                  f["filename"]))
            if files:
                return files
            if status.get("completed"):
                return files
        time.sleep(poll)
    raise TimeoutError(f"prompt {pid} excedió {timeout}s")


def expand(queue: dict) -> list[dict]:
    """Aplica defaults y despliega los jobs con varias seeds."""
    defaults = queue.get("defaults", {})
    jobs: list[dict] = []
    for raw in queue["jobs"]:
        base = {**defaults, **raw}
        seeds = base.pop("seeds", None) or [base.get("seed", 0)]
        for i, seed in enumerate(seeds):
            job = dict(base)
            job["seed"] = int(seed)
            job["id"] = base["id"] if len(seeds) == 1 else f"{base['id']}_s{i+1}"
            jobs.append(job)
    return jobs


def main() -> int:
    global SERVER
    ap = argparse.ArgumentParser()
    ap.add_argument("--queue", required=True)
    ap.add_argument("--out", default="outputs")
    ap.add_argument("--server", default=SERVER)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    SERVER = args.server.rstrip("/")

    qpath = Path(args.queue).resolve()
    queue = json.loads(qpath.read_text())
    jobs = expand(queue)
    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    manifest_path = outdir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    if args.dry_run:
        print(json.dumps(jobs, indent=2, ensure_ascii=False))
        return 0

    wait_server()
    print(f"== {len(jobs)} clips en cola contra {SERVER}")

    failed = 0
    for n, job in enumerate(jobs, 1):
        if manifest.get(job["id"], {}).get("status") == "ok":
            print(f"[{n}/{len(jobs)}] {job['id']} ya generado, se omite")
            continue
        wf_path = (qpath.parent / job["workflow"]).resolve()
        if not wf_path.exists():
            print(f"[{n}/{len(jobs)}] !! workflow ausente: {wf_path}")
            manifest[job["id"]] = {"status": "error", "error": "workflow no encontrado"}
            failed += 1
            continue

        t0 = time.time()
        for attempt in range(1, int(job.get("retries", 2)) + 2):
            try:
                print(f"[{n}/{len(jobs)}] {job['id']} (intento {attempt})", flush=True)
                files = run_job(build(wf_path, job))
                manifest[job["id"]] = {
                    "status": "ok", "files": files, "seed": job["seed"],
                    "engine": job.get("engine"), "seconds": round(time.time() - t0, 1),
                    "prompt": job["prompt"],
                }
                print(f"    ok en {time.time()-t0:.0f}s -> {files}")
                # Subir AL VUELO, no al final: si la tanda muere en el plano 7,
                # los seis anteriores ya están fuera. Y el usuario puede ver
                # resultados mientras el resto se genera.
                for f in files:
                    ruta = outdir / f
                    if not ruta.exists():
                        continue
                    try:
                        r = subprocess.run(
                            ["curl", "-s", "--max-time", "300",
                             "-F", "reqtype=fileupload",
                             "-F", f"fileToUpload=@{ruta}",
                             "https://catbox.moe/user/api.php"],
                            capture_output=True, text=True, timeout=330)
                        print(f"    enlace: {r.stdout.strip()[:110]}", flush=True)
                    except Exception as e:
                        print(f"    subida falló: {e}", flush=True)
                break
            except Exception as exc:  # noqa: BLE001 - se reporta y se sigue
                print(f"    fallo: {exc}", file=sys.stderr)
                manifest[job["id"]] = {"status": "error", "error": str(exc)[:500]}
                time.sleep(5 * attempt)
        else:
            failed += 1
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

    ok = sum(1 for v in manifest.values() if v.get("status") == "ok")
    print(f"== Terminado: {ok} ok, {failed} con error. Manifiesto: {manifest_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
