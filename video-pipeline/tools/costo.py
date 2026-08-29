#!/usr/bin/env python3
"""Calculadora de costo real del pipeline. Todos los supuestos son editables:
después de la sesión 1 sustituye los tiempos estimados por los medidos y vuelve
a correrla — es la única forma de tener un presupuesto que no sea adivinanza.

    python3 tools/costo.py                       # escenarios por defecto
    python3 tools/costo.py --dph 0.95 --min-clip 5.0
    python3 tools/costo.py --trailer 12 --intentos 8
"""
from __future__ import annotations

import argparse

HORAS_MES = 730


def main() -> None:
    p = argparse.ArgumentParser()
    # --- precios (verificados 29-ago-2026) ---
    p.add_argument("--dph", type=float, default=0.70, help="USD/hora de la GPU")
    p.add_argument("--disco-gb", type=float, default=350)
    p.add_argument("--disco-gb-mes", type=float, default=0.12, help="USD/GB/mes")
    p.add_argument("--bw-gb", type=float, default=0.01, help="USD/GB de tráfico")
    p.add_argument("--pesos-gb", type=float, default=75, help="descarga por sesión")
    # --- tiempos (ESTIMADOS: medir en la sesión 1) ---
    p.add_argument("--min-instalar", type=float, default=45)
    p.add_argument("--min-clip", type=float, default=3.5, help="clip 5 s @832x480")
    p.add_argument("--min-still", type=float, default=0.6, help="imagen FLUX.2")
    p.add_argument("--min-upscale", type=float, default=3.0, help="SeedVR2 a 2K")
    # --- escenarios ---
    p.add_argument("--horas-sesion", type=float, default=4)
    p.add_argument("--sesiones-mes", type=float, default=3)
    p.add_argument("--trailer", type=int, default=12, help="planos del tráiler")
    p.add_argument("--intentos", type=int, default=8, help="semillas por plano")
    p.add_argument("--stills", type=int, default=6, help="imágenes por plano")
    a = p.parse_args()

    disco_h = a.disco_gb * a.disco_gb_mes / HORAS_MES
    hora = a.dph + disco_h
    arranque = (a.min_instalar / 60) * hora + a.pesos_gb * a.bw_gb

    print(f"Costo por hora encendido : ${hora:.3f}  "
          f"(GPU ${a.dph:.2f} + disco ${disco_h:.3f})")
    print(f"Arranque en frío         : ${arranque:.2f}  "
          f"({a.min_instalar:.0f} min + {a.pesos_gb:.0f} GB)")
    print(f"Clip de 5 s              : ${a.min_clip/60*hora:.3f}")
    print(f"Imagen (still)           : ${a.min_still/60*hora:.3f}")
    print(f"Upscale 2K               : ${a.min_upscale/60*hora:.3f}")

    ses = a.horas_sesion * hora + arranque
    print(f"\nSesión de {a.horas_sesion:.0f} h            : ${ses:.2f}"
          f"   ({(a.horas_sesion*60 - a.min_instalar)/a.min_clip:.0f} clips de margen)")
    print(f"Mes de {a.sesiones_mes:.0f} sesiones       : ${ses*a.sesiones_mes:.2f}")

    # Tráiler completo, de punta a punta
    n_stills = a.trailer * a.stills
    n_clips = a.trailer * a.intentos
    min_gpu = n_stills * a.min_still + n_clips * a.min_clip + a.trailer * a.min_upscale
    horas = min_gpu / 60
    sesiones = max(1, -(-horas // (a.horas_sesion - a.min_instalar / 60)))  # ceil
    total = horas * hora + sesiones * arranque

    print(f"\nTráiler de {a.trailer} planos:")
    print(f"  {n_stills} stills + {n_clips} clips + {a.trailer} upscales")
    print(f"  {horas:.1f} h de GPU repartidas en {sesiones:.0f} sesión(es)")
    print(f"  TOTAL ${total:.2f}   (${total/a.trailer:.2f} por plano final)")

    # Comparación con API, mismo número de intentos
    seg = 5
    api_h3 = n_clips * seg * 0.08
    api_seed = n_clips * seg * 0.23
    print(f"\n  Los mismos {n_clips} intentos por API:")
    print(f"    MiniMax H3   ${api_h3:.0f}")
    print(f"    Seedance 2.5 ${api_seed:.0f}")
    print(f"  Ahorro alquilando: ${api_h3-total:.0f} / ${api_seed-total:.0f}")


if __name__ == "__main__":
    main()
