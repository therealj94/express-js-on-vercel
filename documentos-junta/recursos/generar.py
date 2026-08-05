#!/usr/bin/env python3
"""Convierte los HTML de la carpeta en PDF con el Chromium del entorno."""
import subprocess, sys, pathlib, os

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
BASE = pathlib.Path(__file__).resolve().parent.parent

def pdf(nombre):
    html = BASE / f"{nombre}.html"
    salida = BASE / f"{nombre}.pdf"
    subprocess.run([
        CHROME, "--headless", "--disable-gpu", "--no-sandbox",
        "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=12000",
        f"--print-to-pdf={salida}", html.as_uri(),
    ], check=True, capture_output=True)
    return salida, salida.stat().st_size

if __name__ == "__main__":
    for n in sys.argv[1:]:
        s, b = pdf(n)
        print(f"{s.name}: {b//1024} kB")
