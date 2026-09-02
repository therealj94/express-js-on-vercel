#!/usr/bin/env python3
"""Predice cuánto tarda y cuánto cuesta una tanda, con números medidos.

Las constantes NO son estimaciones: salen de cronometrar quince clips reales
en dos tandas. La generación resultó ser lo más predecible de todo el sistema
(±3 s en seis clips seguidos); lo que varía es la instalación, porque depende
del host que toque.

    python3 tools/plan.py --planos 6                  # tanda nueva
    python3 tools/plan.py --planos 1 --viva           # con la maquina ya encendida
    python3 tools/plan.py --planos 6 --semillas 3     # tres versiones de cada uno
"""
from __future__ import annotations

import argparse

# --- Medido, no estimado ---------------------------------------------------
# 6 clips de 10 s a 720x1280 y 20 pasos: 531, 534, 534, 534, 534, 534 s.
SEG_POR_SEG_VIDEO = 53.4        # segundos de cálculo por segundo de vídeo
# A 768x1344 sube a ~85. Manda la resolución, no la duración.
FACTOR_768 = 85.2 / 53.4

INSTALL_MIN, INSTALL_MAX = 12, 22   # instalación en paralelo, según la red del host
ARRANQUE_MIN = 3                    # de crear la instancia a que el pod responda
PRECIO_HORA = 1.21                  # RTX PRO 6000 WS, precio real de estos días
SUBIDA_POR_CLIP = 4                 # segundos: subir el mp4 a Hugging Face


def calcula(planos: int, segundos: int, semillas: int, viva: bool, alta: bool):
    clips = planos * semillas
    por_clip = segundos * SEG_POR_SEG_VIDEO * (FACTOR_768 if alta else 1)
    gen = clips * (por_clip + SUBIDA_POR_CLIP) / 60

    if viva:
        return {"instalacion": (0, 0), "generacion": gen,
                "total": (gen, gen), "clips": clips}
    lo = ARRANQUE_MIN + INSTALL_MIN + gen
    hi = ARRANQUE_MIN + INSTALL_MAX + gen
    return {"instalacion": (INSTALL_MIN, INSTALL_MAX), "generacion": gen,
            "total": (lo, hi), "clips": clips}


def main() -> int:
    a = argparse.ArgumentParser()
    a.add_argument("--planos", type=int, default=6)
    a.add_argument("--segundos", type=int, default=10, help="duración de cada plano")
    a.add_argument("--semillas", type=int, default=1, help="versiones por plano")
    a.add_argument("--viva", action="store_true", help="la máquina ya está encendida")
    a.add_argument("--alta", action="store_true", help="768x1344 en vez de 720x1280")
    a = a.parse_args()

    r = calcula(a.planos, a.segundos, a.semillas, a.viva, a.alta)
    lo, hi = r["total"]
    print(f"{r['clips']} clips de {a.segundos}s"
          f"{' a 768x1344' if a.alta else ' a 720x1280'}"
          f"{' — máquina ya encendida' if a.viva else ''}")
    if not a.viva:
        i0, i1 = r["instalacion"]
        print(f"  arranque + instalación   {ARRANQUE_MIN + i0:.0f}-{ARRANQUE_MIN + i1:.0f} min")
    print(f"  generación               {r['generacion']:.0f} min")
    print(f"  TOTAL                    {lo:.0f}-{hi:.0f} min")
    print(f"  coste                    ${lo/60*PRECIO_HORA:.2f}-${hi/60*PRECIO_HORA:.2f}")
    if not a.viva and r["generacion"] < 15:
        print(f"\n  Aviso: la instalación pesa más que la generación. Con la máquina"
              f"\n  ya encendida esto serían {r['generacion']:.0f} min y "
              f"${r['generacion']/60*PRECIO_HORA:.2f}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
