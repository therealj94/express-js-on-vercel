#!/usr/bin/env python3
"""Manda una cola nueva a un pod que ya está encendido, o le dice que termine.

El pod no se puede alcanzar desde fuera: este contenedor solo tiene salida por
los puertos 80 y 443, y el que publica Vast no es ninguno de los dos. Pero el
pod sí llega a Hugging Face, así que el trabajo viaja por ahí: se deja
`colas/siguiente.json` en el repo y el pod, que está esperando, lo recoge, lo
ejecuta y sube los resultados.

Con esto una instalación —40 minutos y $1.30— sirve para todas las tandas de la
noche en vez de para una.

    python3 tools/encolar.py prompts/q_p2_video.json      # manda trabajo
    python3 tools/encolar.py --fin                        # que termine
    python3 tools/encolar.py --estado                     # ¿hay cola pendiente?
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi

DESTINO = "colas/siguiente.json"
FIN = "colas/FIN"


def main() -> int:
    a = argparse.ArgumentParser()
    a.add_argument("cola", nargs="?")
    a.add_argument("--repo", default=os.environ.get(
        "HF_REPO", "Therealjose54/orden-global-videos"))
    a.add_argument("--fin", action="store_true", help="pídele al pod que termine")
    a.add_argument("--estado", action="store_true")
    a = a.parse_args()

    api = HfApi(token=os.environ["HF_TOKEN"])
    hay = set(api.list_repo_files(a.repo, repo_type="dataset"))

    if a.estado:
        print(f"cola pendiente : {'SI' if DESTINO in hay else 'no'}")
        print(f"fin pedido     : {'SI' if FIN in hay else 'no'}")
        return 0

    if a.fin:
        api.upload_file(path_or_fileobj=b"", path_in_repo=FIN,
                        repo_id=a.repo, repo_type="dataset")
        print("FIN dejado en el repo: el pod terminará en su próxima vuelta")
        return 0

    if not a.cola:
        sys.exit("dime qué cola mandar, o usa --fin / --estado")

    # Si queda una cola sin recoger, el pod aún no ha llegado a ella y esta la
    # pisaría. Vale más parar que perder una tanda entera sin enterarse.
    if DESTINO in hay:
        sys.exit(f"YA hay una cola pendiente en {a.repo}/{DESTINO}. "
                 f"El pod no la ha recogido todavía; espera o bórrala a mano.")
    # El FIN de una sesión anterior haría que el pod se fuera nada más arrancar.
    if FIN in hay:
        api.delete_file(FIN, repo_id=a.repo, repo_type="dataset")
        print("(quitado un FIN viejo que habría cortado la espera)")

    p = Path(a.cola)
    n = len(json.loads(p.read_text()).get("jobs", []))
    if n == 0:
        sys.exit("la cola está vacía")
    api.upload_file(path_or_fileobj=str(p), path_in_repo=DESTINO,
                    repo_id=a.repo, repo_type="dataset")
    print(f"{n} trabajos puestos en {a.repo}/{DESTINO}")
    print("el pod la recogerá en menos de un minuto")
    return 0


if __name__ == "__main__":
    sys.exit(main())
