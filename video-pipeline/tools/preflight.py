#!/usr/bin/env python3
"""Comprobación previa al encendido. Se corre SIEMPRE antes de crear una instancia.

Existe porque una lista de errores pasados no evita el siguiente. La sesión del
1-sep se perdió publicando el puerto 9000 cuando nginx escucha en el 8188: dos
números que tenían que coincidir y que nadie comparaba. El pod parecía muerto
estando perfecto. Costó $2.25 y una instalación entera.

La diferencia entre esto y un documento es que un documento se puede saltar.
Esto devuelve código 1 y no se enciende nada.

    python3 tools/preflight.py --guion prompts/pelicula1_cincuenta.json \\
        --cola prompts/q_p1_stills.json --puerto 8188 --disco 420
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib import request

RAIZ = Path(__file__).resolve().parent.parent
FALLOS: list[str] = []
AVISOS: list[str] = []


def ok(msg):
    print(f"  \033[32mOK\033[0m    {msg}")


def mal(msg):
    print(f"  \033[31mPARA\033[0m  {msg}")
    FALLOS.append(msg)


def avisa(msg):
    print(f"  \033[33mNOTA\033[0m  {msg}")
    AVISOS.append(msg)


def titulo(t):
    print(f"\n{t}")


# --------------------------------------------------------------------------
def credenciales():
    titulo("CREDENCIALES")
    k = os.environ.get("VAST_API_KEY")
    if not k:
        mal("falta VAST_API_KEY en el entorno")
        return None
    try:
        r = request.Request("https://console.vast.ai/api/v0/users/current/",
                            headers={"Authorization": f"Bearer {k}"})
        d = json.load(request.urlopen(r, timeout=60))
        ok(f"Vast responde · {d.get('email')} · saldo ${d.get('credit', 0):.2f}")
        return d.get("credit", 0)
    except Exception as e:
        mal(f"la clave de Vast no sirve: {type(e).__name__}")
        return None


def saldo(credito, minimo):
    if credito is None:
        return
    if credito < minimo:
        mal(f"saldo ${credito:.2f} por debajo del mínimo ${minimo:.2f}")
    else:
        ok(f"saldo suficiente (mínimo pedido ${minimo:.2f})")


def hf():
    t = os.environ.get("HF_TOKEN")
    if not t:
        mal("falta HF_TOKEN: los pesos no se pueden descargar")
        return
    try:
        r = request.Request("https://huggingface.co/api/whoami-v2",
                            headers={"Authorization": f"Bearer {t}"})
        d = json.load(request.urlopen(r, timeout=60))
        ok(f"Hugging Face responde · {d.get('name')}")
    except Exception as e:
        mal(f"el token de Hugging Face no sirve: {type(e).__name__}")


def instancias_vivas():
    titulo("MÁQUINAS")
    k = os.environ.get("VAST_API_KEY")
    if not k:
        return
    try:
        # v1, NO v0. Vast movió instances a v1 y el v0 sigue contestando 200
        # con una lista vacía en vez de un error: el 1-sep di por muerta una
        # máquina que seguía encendida y facturando, y le había matado el
        # guardián al relanzar. Un endpoint que miente vacío es peor que uno
        # que falla, así que aquí un fallo de consulta es PARA, no aviso.
        r = request.Request("https://console.vast.ai/api/v1/instances/",
                            headers={"Authorization": f"Bearer {k}"})
        ins = json.load(request.urlopen(r, timeout=60)).get("instances", [])
    except Exception as e:
        mal(f"no se pudo consultar las instancias ({type(e).__name__}): "
            f"sin esto no se sabe si ya hay una encendida gastando")
        return
    if not ins:
        ok("no hay ninguna encendida")
        return
    for i in ins:
        mal(f"YA HAY UNA ENCENDIDA: {i['id']} {i.get('actual_status')} "
            f"${i.get('dph_total', 0):.3f}/h — destrúyela o reutilízala antes "
            f"de crear otra")


# --------------------------------------------------------------------------
def puertos(puerto_pedido):
    """El fallo que costó la sesión del 1-sep, convertido en comprobación.

    ComfyUI escucha solo en 127.0.0.1; quien atiende desde fuera es nginx. Si el
    puerto que se publica no es el de nginx, no responde nadie y el pod parece
    muerto estando perfecto."""
    titulo("PUERTOS")
    s = (RAIZ / "cloud" / "onstart.sh").read_text()

    m = re.search(r"^PORT=\$\{UI_PORT:-(\d+)\}", s, re.M)
    if not m:
        mal("cloud/onstart.sh no toma el puerto de UI_PORT: se puede desacoplar otra vez")
        return
    defecto = int(m.group(1))
    ok(f"nginx escucha en UI_PORT (por defecto {defecto})")

    v = (RAIZ / "tools" / "vast_api.py").read_text()
    if 'env["UI_PORT"]' not in v:
        mal("vast_api.py no envía UI_PORT: nginx no sabrá dónde escuchar")
    else:
        ok("vast_api.py envía UI_PORT junto con el mapeo del puerto")

    interno = re.findall(r"--listen 127\.0\.0\.1 --port (\d+)", s)
    proxy = re.findall(r"proxy_pass\s+http://127\.0\.0\.1:(\d+)", s)
    if interno and proxy and interno[0] not in proxy:
        mal(f"ComfyUI escucha en {interno[0]} y nginx redirige a {proxy}: no coinciden")
    elif interno:
        ok(f"ComfyUI en 127.0.0.1:{interno[0]} y nginx redirige ahí")

    if interno and int(interno[0]) == puerto_pedido:
        mal(f"vas a publicar el {puerto_pedido}, que es el puerto INTERNO de "
            f"ComfyUI y solo escucha en localhost. Publica el de nginx "
            f"({defecto}) o no responderá nadie. Esto es exactamente lo que "
            f"pasó el 1-sep.")
    else:
        ok(f"se va a publicar el {puerto_pedido}")


def tamano_onstart():
    titulo("ARRANQUE")
    s = (RAIZ / "cloud" / "onstart.sh").read_bytes()
    st = (RAIZ / "cloud" / "selftest.py").read_bytes()
    import base64
    total = len(base64.b64encode(gzip.compress(s, 9))) + 200
    if total > 16000:
        mal(f"el onstart comprimido son {total} caracteres y el límite 16.384")
    else:
        ok(f"onstart comprimido: {total} caracteres de 16.384")
    ok(f"autoprueba presente ({len(st)} bytes)")

    # Sin el turno de espera, el pod muere al acabar su cola y la siguiente
    # tanda paga otra instalación entera: 40 minutos y $1.30 cada vez.
    if "colas/siguiente.json" in (RAIZ / "cloud" / "onstart.sh").read_text():
        ok("el pod esperará más colas por Hugging Face al acabar")
    else:
        avisa("el onstart no espera trabajo nuevo: al acabar la cola habrá que "
              "reinstalar desde cero para la siguiente tanda")

    g = RAIZ / "guardian.sh"
    if not g.exists():
        mal("no está guardian.sh: una máquina olvidada factura sola")
    elif not os.access(g, os.X_OK):
        mal("guardian.sh no es ejecutable")
    else:
        ok("guardian.sh listo — arráncalo ANTES de crear la instancia")


# --------------------------------------------------------------------------
def guion(ruta):
    titulo("GUION")
    if not ruta:
        avisa("sin guion que comprobar")
        return
    p = Path(ruta)
    if not p.exists():
        mal(f"no existe {ruta}")
        return
    r = subprocess.run([sys.executable, str(RAIZ / "tools" / "lint.py"),
                        "-g", str(p)], capture_output=True, text=True)
    ultimo = [l for l in r.stdout.splitlines() if l.startswith("PARA")]
    if ultimo and not ultimo[-1].startswith("PARA 0"):
        mal(f"el lint no pasa: {ultimo[-1]}")
    else:
        ok(f"lint limpio ({ultimo[-1] if ultimo else 'sin incidencias'})")
    d = json.loads(p.read_text())
    ok(f"{len(d['shots'])} planos · {d['defaults'].get('duration_s', '?')} s cada uno")


def cola(ruta, vertical):
    titulo("COLA")
    if not ruta:
        avisa("sin cola que comprobar")
        return
    p = Path(ruta)
    if not p.exists():
        mal(f"no existe {ruta}")
        return
    jobs = json.loads(p.read_text()).get("jobs", [])
    if not jobs:
        mal("la cola está vacía")
        return
    ok(f"{len(jobs)} trabajos")

    anchos = {(j.get("width"), j.get("height")) for j in jobs}
    for w, h in anchos:
        if vertical and w >= h:
            mal(f"la cola es apaisada ({w}x{h}) y la pieza es vertical")
        elif not vertical and h > w:
            mal(f"la cola es vertical ({w}x{h}) y la pieza es apaisada")
        else:
            ok(f"orientación correcta: {w}x{h}")

    faltan = sorted({j["workflow"] for j in jobs
                     if not (RAIZ / "prompts" / j["workflow"]).exists()})
    for f in faltan:
        mal(f"la cola pide un workflow que no existe: {f}")
    if not faltan:
        ok("todos los workflows que pide la cola existen")

    # MiniMax H3 exige length >= 5: no sabe generar un solo fotograma. El 1-sep
    # los 101 stills salieron con length=1 y fallaron uno por uno DESPUÉS de
    # pagar una hora de instalación. El modelo lo rechaza con
    # "Value 1 smaller than min of 5", así que se comprueba antes de encender.
    for j in jobs:
        n = max(1, int(round(j.get("duration_s", 0) * j.get("fps", 1))))
        if n < 5:
            mal(f"'{j['id']}' pide {n} fotograma(s) y H3 exige 5 como mínimo: "
                f"la tanda entera fallaría igual que el 1-sep")
            break
    else:
        ok(f"longitud correcta: {max(1, int(round(jobs[0].get('duration_s', 0) * jobs[0].get('fps', 1))))} fotogramas por trabajo")

    # 4n+1: lo resuelve 03_run_queue, pero conviene saber que sigue ahí.
    if "4n+1" in (RAIZ / "03_run_queue.py").read_text():
        ok("el runner sigue ajustando la longitud a 4n+1")
    else:
        avisa("no encuentro el ajuste 4n+1 en 03_run_queue.py")


def disco(gb):
    titulo("DISCO")
    if gb < 400:
        avisa(f"{gb} GB: con BF16 y FLUX no caben. Sube a 400 si la tarjeta "
              f"tiene 80 GB o más de VRAM")
    else:
        ok(f"{gb} GB")


# --------------------------------------------------------------------------
def main():
    a = argparse.ArgumentParser()
    a.add_argument("--guion")
    a.add_argument("--cola")
    a.add_argument("--puerto", type=int, default=8188)
    a.add_argument("--disco", type=int, default=400)
    a.add_argument("--saldo-minimo", type=float, default=10.0)
    a.add_argument("--apaisado", action="store_true")
    a = a.parse_args()

    print("COMPROBACIÓN PREVIA AL ENCENDIDO")
    credito = credenciales()
    saldo(credito, a.saldo_minimo)
    hf()
    instancias_vivas()
    puertos(a.puerto)
    tamano_onstart()
    guion(a.guion)
    cola(a.cola, vertical=not a.apaisado)
    disco(a.disco)

    print("\n" + "=" * 66)
    if FALLOS:
        print(f"{len(FALLOS)} PARA · {len(AVISOS)} NOTA")
        print("NO ENCIENDAS hasta corregir los PARA.")
        return 1
    print(f"0 PARA · {len(AVISOS)} NOTA")
    print("Listo para encender. Arranca el guardián primero.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
