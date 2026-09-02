#!/usr/bin/env python3
"""Sonido de la película del ecosistema, con efectos reales.

Se sintetizaba con osciladores y ruido, y José lo oyó exactamente donde estaba
el problema: *"no tiene sonido al principio, hay vacío"*. Cuatro senos no llenan
un plano de oro fundido sobre negro absoluto; y entre golpe y golpe no había
nada debajo, así que la pieza respiraba a huecos.

Dos cosas lo arreglan:

1. **Una cama de sala que no para nunca.** Un tono de estudio vacío, muy grave y
   muy bajo, de principio a fin. No se oye como sonido: se oye como que la pieza
   *tiene* sonido. Quitarla es lo que hacía el vacío.
2. **Efectos generados, no sintetizados** (`tools/sfx.py`): la colada del metal,
   el lingote sobre la piedra, la moneda girando, el pago sin contacto, el
   riser y el impacto del retrato de familia.

    python3 montaje/sonido_eco.py salida.wav 61.8 /carpeta/con/los/sfx
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000

# (segundo, pieza, nivel). Cada uno cae en su acción, no "por ahí".
EVENTOS = [
    (0.40, "e_metal",   0.55),   # 01 · la pepita, presencia desde el fotograma 1
    (4.55, "e_colada",  0.85),   # 02 · el metal cae en el molde
    (8.20, "e_metal",   0.45),   # 02 · el disco asienta: ORIGEN
    (9.40, "e_roce",    0.40),   # 03 · la luz barre las cuatro gotas
    (13.30, "e_roce",   0.34),   # 04 · la pantalla se enciende
    (17.10, "s_toque",  0.40),   # 05 · la yema toca el cristal
    (20.90, "e_roce",   0.34),   # 06 · la mano sube a la luz
    (25.40, "e_pago",   0.85),   # 07 · el pago sin contacto. Lo pidió José:
                                 #      "que suene como cuando se paga con Apple"
    (29.30, "s_datafono", 0.50),  # 08 · la tarjeta entra y el terminal acepta
    (32.90, "e_roce",   0.42),   # 09 · el teléfono pasa de una mano a otra
    (36.70, "e_roce",   0.38),   # 10 · el hilo de luz cruza entre los dos
    (40.50, "e_moneda", 0.70),   # 11 · la moneda gira y se posa
    (44.30, "e_metal",  0.50),   # 12 · el oro junto a la pila de monedas
    (47.60, "e_roce",   0.45),   # 13 · la luz viaja
    (50.30, "e_subida", 0.60),   # 14 · el riser que lleva al retrato de familia
    (51.60, "e_impacto", 0.80),  # 14 · y el impacto donde entra Orden Global
    (56.00, "e_metal",  0.45),   # 15 · el cierre
]

# La cama que nunca para. Es la diferencia entre una pieza con sonido y una
# pieza con golpes sueltos sobre silencio.
CAMAS = [(0.0, 999.0, "e_sala", 1.0)]


def cargar(carpeta: Path, nombre: str) -> np.ndarray:
    x, sr = sf.read(carpeta / f"{nombre}.wav")
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != SR:
        idx = np.linspace(0, len(x) - 1, int(len(x) * SR / sr))
        x = np.interp(idx, np.arange(len(x)), x)
    return x / (np.abs(x).max() + 1e-9)


def cama(x: np.ndarray, n: int, subida=1.0, bajada=2.0) -> np.ndarray:
    """Estira un ambiente hasta `n` muestras repitiéndolo con medio segundo de
    solape, para que no se oiga el empalme en cada vuelta."""
    solape = int(0.5 * SR)
    y = x.copy()
    while len(y) < n:
        cola = y[-solape:] * np.linspace(1, 0, solape)
        cabeza = x[:solape] * np.linspace(0, 1, solape)
        y = np.concatenate([y[:-solape], cola + cabeza, x[solape:]])
    y = y[:n]
    t = np.arange(n) / SR
    d = n / SR
    return y * np.clip(t / subida, 0, 1) * np.clip((d - t) / bajada, 0, 1)


def main() -> int:
    salida = sys.argv[1]
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 61.8
    carpeta = Path(sys.argv[3] if len(sys.argv) > 3 else ".")
    n = int(dur * SR)
    y = np.zeros(n)

    def poner(cuando: float, x: np.ndarray, nivel: float):
        a = max(0, int(cuando * SR))
        b = min(n, a + len(x))
        if b > a:
            y[a:b] += x[: b - a] * nivel

    for t, pieza, nivel in EVENTOS:
        poner(t, cargar(carpeta, pieza), nivel)
    y = y / (np.abs(y).max() + 1e-9) * 0.72
    sf.write(salida, y.astype(np.float32), SR)

    # La cama va en su PROPIO fichero y no mezclada con los golpes. Compartiendo
    # pista, normalizar por pico la aplastaba: el impacto del retrato de familia
    # marcaba el pico y la sala se quedaba treinta decibelios por debajo, que es
    # justamente el vacío que se oía. Aparte, se le puede fijar el suelo.
    b = np.zeros(n)
    for a, fin, pieza, nivel in CAMAS:
        x = cama(cargar(carpeta, pieza), int((min(fin, dur) - a) * SR))
        i, j = int(a * SR), min(n, int(a * SR) + len(x))
        b[i:j] += x[: j - i] * nivel
    rms = np.sqrt((b ** 2).mean()) + 1e-12
    b = b / rms * 10 ** (-18.5 / 20)          # suelo a -18,5 dBFS, medido en la mezcla
    sala = str(Path(salida).with_name("sala_eco.wav"))
    sf.write(sala, np.clip(b, -1, 1).astype(np.float32), SR)
    print(f"{salida} · {dur:.1f}s · {len(EVENTOS)} efectos reales")
    print(f"{sala} · cama de sala continua")
    return 0


if __name__ == "__main__":
    sys.exit(main())
