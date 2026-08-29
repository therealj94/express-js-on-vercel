#!/usr/bin/env python3
"""Control de Vast.ai solo por HTTPS — sin CLI y sin SSH.

Sirve para entornos donde el SSH saliente está bloqueado: crea la instancia con
el onstart de `cloud/onstart.sh`, que se instala sola, y luego se vigila y se
destruye por API.

    export VAST_API_KEY=...
    python3 tools/vast_api.py whoami
    python3 tools/vast_api.py search --gpu RTX_PRO_6000_WS --max-dph 1.00
    python3 tools/vast_api.py create --offer 12345678 --onstart cloud/onstart.sh \\
        --env HF_TOKEN=hf_xxx --env UI_PASS=micla
    python3 tools/vast_api.py status
    python3 tools/vast_api.py logs   <id>
    python3 tools/vast_api.py destroy <id>
"""
from __future__ import annotations

import argparse, json, os, sys, time
from pathlib import Path
from urllib import request, error, parse

BASE = "https://console.vast.ai/api"
V0, V1 = "/v0", "/v1"   # Vast movió instances a v1; bundles y asks siguen en v0


def api(path: str, method: str = "GET", body: dict | None = None) -> dict:
    key = os.environ.get("VAST_API_KEY")
    if not key:
        sys.exit("Falta VAST_API_KEY en el entorno.")
    data = json.dumps(body).encode() if body is not None else None
    req = request.Request(f"{BASE}{path}", data=data, method=method,
                          headers={"Authorization": f"Bearer {key}",
                                   "Content-Type": "application/json"})
    try:
        with request.urlopen(req, timeout=90) as r:
            raw = r.read()
    except error.HTTPError as e:
        raw = e.read()
    out = json.loads(raw) if raw else {}
    if out.get("success") is False:
        sys.exit(f"Vast: {out.get('error')} — {out.get('msg')}")
    return out


def search(gpu: str, max_dph: float, min_ram: int, min_disk: int, limit: int) -> list[dict]:
    q = {
        "verified": {"eq": True},
        "rentable": {"eq": True},
        "rented": {"eq": False},
        "reliability2": {"gt": 0.99},
        "gpu_name": {"eq": gpu.replace("_", " ")},
        "gpu_ram": {"gte": min_ram * 1024},
        "disk_space": {"gt": min_disk},
        "inet_down": {"gt": 500},
        "inet_up": {"gt": 200},
        "cuda_max_good": {"gte": 12.8},
        "duration": {"gt": 3 * 86400},
        "dph_total": {"lt": max_dph},
        "num_gpus": {"eq": 1},
        "order": [["dph_total", "asc"]],
        "type": "on-demand",
        "limit": limit,
    }
    return api(V0 + "/bundles/?q=" + parse.quote(json.dumps(q)))["offers"][:limit]


def fmt(o: dict) -> str:
    return (f'{o["id"]:>10}  ${o["dph_total"]:.3f}/h  {o["gpu_name"]:<22} '
            f'{o["gpu_ram"]//1024:>3}GB  disco {o.get("disk_space",0):.0f}GB  '
            f'↓{o.get("inet_down",0):.0f} ↑{o.get("inet_up",0):.0f}Mbps  '
            f'rel {o.get("reliability2",0):.3f}  {o.get("geolocation","?")}')


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("whoami")
    s = sub.add_parser("search")
    s.add_argument("--gpu", default="RTX_PRO_6000_WS")
    s.add_argument("--max-dph", type=float, default=1.00)
    s.add_argument("--min-ram", type=int, default=90)
    s.add_argument("--min-disk", type=int, default=300)
    s.add_argument("--limit", type=int, default=10)

    c = sub.add_parser("create")
    c.add_argument("--offer", type=int, required=True)
    c.add_argument("--onstart", default="cloud/onstart.sh")
    c.add_argument("--image", default="pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel")
    c.add_argument("--disk", type=float, default=350)
    c.add_argument("--port", type=int, default=8188)
    c.add_argument("--env", action="append", default=[], metavar="K=V")

    sub.add_parser("status")
    for name in ("logs", "destroy", "start", "stop"):
        p = sub.add_parser(name)
        p.add_argument("id", type=int)

    a = ap.parse_args()

    if a.cmd == "whoami":
        u = api(V0 + "/users/current/")
        print(f'{u.get("username")}  saldo ${u.get("credit", 0):.2f}  '
              f'{u.get("email","")}')

    elif a.cmd == "search":
        offers = search(a.gpu, a.max_dph, a.min_ram, a.min_disk, a.limit)
        if not offers:
            print("Sin ofertas con esos filtros. Sube --max-dph o cambia --gpu.")
            return 1
        for o in offers:
            print(fmt(o))

    elif a.cmd == "create":
        onstart = Path(a.onstart).read_text()
        # Un puerto se declara con la CADENA ENTERA como clave y "1" de valor
        # (así lo codifica parse_env del CLI oficial). Con {"-p": "8188:8188"}
        # el backend no da error: simplemente no mapea nada.
        env = {f"-p {a.port}:{a.port}": "1"}
        for kv in a.env:
            k, _, v = kv.partition("=")
            env[k] = v
        r = api(V0 + f"/asks/{a.offer}/", "PUT", {
            "client_id": "me", "image": a.image, "disk": a.disk,
            "onstart": onstart, "env": env, "runtype": "ssh",
            "label": "video-pipeline",
            # sin target_state la instancia se crea DETENIDA: se reserva la
            # máquina, corre el disco y el onstart nunca llega a ejecutarse.
            "target_state": "running",
        })
        print(json.dumps(r, indent=2))
        print(f'\nInstancia {r.get("new_contract")} creada. '
              f'Vigila con: status / logs {r.get("new_contract")}')

    elif a.cmd == "status":
        for i in api(V1 + "/instances/").get("instances", []):
            # los campos llegan a None mientras la instancia arranca
            estado = i.get("actual_status") or i.get("cur_state") or "arrancando"
            dph = i.get("dph_total") or 0.0
            puertos = ",".join(sorted((i.get("ports") or {}).keys())) or "-"
            print(f'{i["id"]:>10}  {estado:<12} ${dph:.3f}/h  '
                  f'{i.get("gpu_name") or "?":<12} {i.get("public_ipaddr") or "?":<16} '
                  f'puertos={puertos}  {i.get("status_msg") or ""}'.rstrip())

    elif a.cmd == "logs":
        r = api(V0 + f"/instances/request_logs/{a.id}/", "PUT", {"tail": "400"})
        url = r.get("result_url")
        if not url:
            print(json.dumps(r, indent=2)); return 1
        # El log se publica en un objeto firmado que tarda en existir: hasta
        # entonces devuelve AccessDenied (403), no un 404. Hay que reintentar.
        for intento in range(40):
            try:
                with request.urlopen(url, timeout=30) as f:
                    texto = f.read().decode("utf-8", "replace")
                if "<Code>AccessDenied" not in texto:
                    print(texto); return 0
            except error.HTTPError:
                pass
            time.sleep(1.5)
        print("El log no se publicó tras 60 s; reintenta.")

    elif a.cmd in ("start", "stop"):
        api(V0 + f"/instances/{a.id}/", "PUT",
            {"state": "running" if a.cmd == "start" else "stopped"})
        print(f"Instancia {a.id}: {a.cmd}. Ojo: detener NO para el cobro de disco.")

    elif a.cmd == "destroy":
        api(V0 + f"/instances/{a.id}/", "DELETE", {})
        print(f"Instancia {a.id} destruida. Deja de facturar (compute y disco).")

    return 0


if __name__ == "__main__":
    sys.exit(main())
