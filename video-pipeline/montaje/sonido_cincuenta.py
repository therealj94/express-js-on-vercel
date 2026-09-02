#!/usr/bin/env python3
"""Sonido de *Cincuenta*: efectos reales colocados en el fotograma exacto.

Dos cosas cambiaron respecto de la primera versión y las dos importan.

**Los efectos ya no se sintetizan.** Cuatro osciladores y ruido rosa sirven para
metal abstracto —la película del ecosistema vive de eso—, pero una bolsa de pan,
la risa de un muchacho y el zumbido de una nevera suenan a maqueta. Estos vienen
de ElevenLabs (`tools/sfx.py`), que los genera de verdad.

**Y ya no se colocan a ojo.** Antes puse cada efecto donde creía que pasaba la
acción y varios llegaban hasta 0,9 s tarde. Ahora los tiempos salen de medir la
diferencia entre fotogramas consecutivos de cada toma elegida: el pico es el
instante en que algo se mueve, y ahí cae el sonido. Los números de EVENTOS son
esos picos, en tiempo de montaje.

Una sola licencia con la realidad: en el plano 07 el teléfono empieza a vibrar
0,8 s ANTES de que entre la mano. Si sonara a la vez, la mano parecería adivinar.

    python3 montaje/sonido_cincuenta.py salida.wav 44.0 /carpeta/con/los/sfx
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 48000

# (segundo, pieza, nivel).  Los segundos salen de tools/picos.py.
EVENTOS = [
    (1.30, "s_bolsa",    0.55),   # 01 · le pasa la bolsa de pan (pico 1,41)
    (3.80, "s_mensaje",  0.55),   # 02 · le entra el mensaje de su madre
    (5.30, "s_mensaje",  0.40),   # 02 · y el segundo
    (11.30, "s_toque",   0.42),   # 04 · ella contesta (pico 11,75)
    (14.82, "s_toque",   0.32),   # 05 · el pulgar baja por la lista (14,88)
    (15.50, "s_toque",   0.38),   # 05 · y se detiene (15,55)
    (16.37, "s_toque",   0.50),   # 06 · aprieta y mantiene (16,41)
    (18.20, "s_vibra",   0.62),   # 07 · suena ALLÁ, antes de la mano (18,98)
    # La risa del muchacho fuera: Jose la oyo y distrae del momento en que
    # ella lee que le llego. El plano se sostiene solo con el ambiente.
    (32.80, "s_datafono", 0.55),  # 11 · el datáfono acepta (32,94)
    (37.10, "s_bolsa",   0.45),   # 13 · saca el pan en la mesa (37,19)
    (40.10, "s_mensaje", 0.55),   # 15 · le llega la foto de su madre
]

# (desde, hasta, pieza, nivel).  Cada sitio suena distinto, y se solapan medio
# segundo para que un corte de imagen no sea también un corte de aire.
CAMAS = [
    (0.0,  8.0,  "s_tienda", 1.00),   # abre en la pulpería, Santa Ana
    (7.6,  14.4, "s_cocina", 1.15),   # su cocina, Pensilvania
    (14.0, 18.4, "s_cocina", 1.00),   # sigue allá mientras manda
    (18.0, 30.0, "s_tienda", 0.95),   # el aviso llega a la pulpería
    (29.6, 33.2, "s_tienda", 0.70),   # la farmacia
    (32.8, 36.4, "s_calle",  0.90),   # se va a la casa con las bolsas
    (36.0, 44.8, "s_cocina", 1.05),   # la mesa de su casa, y la hija leyendo
]


def cargar(carpeta: Path, nombre: str) -> np.ndarray:
    """Un efecto, en mono a 48 kHz y normalizado. ElevenLabs los devuelve con
    niveles muy dispares —la nevera venía a 0,01 y el toque a 1,00—, así que el
    nivel lo decide la tabla de arriba y no el fichero."""
    x, sr = sf.read(carpeta / f"{nombre}.wav")
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != SR:
        idx = np.linspace(0, len(x) - 1, int(len(x) * SR / sr))
        x = np.interp(idx, np.arange(len(x)), x)
    return x / (np.abs(x).max() + 1e-9)


def cama(x: np.ndarray, n: int, subida=0.6, bajada=0.6) -> np.ndarray:
    """Estira un ambiente hasta `n` muestras repitiéndolo con solape, y le pone
    entrada y salida. Sin el solape se oye el empalme en cada vuelta."""
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
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 44.0
    carpeta = Path(sys.argv[3] if len(sys.argv) > 3 else ".")
    n = int(dur * SR)
    y = np.zeros(n)

    def poner(cuando: float, x: np.ndarray, nivel: float):
        a = max(0, int(cuando * SR))
        b = min(n, a + len(x))
        if b > a:
            y[a:b] += x[: b - a] * nivel

    for a, b, pieza, nivel in CAMAS:
        x = cargar(carpeta, pieza)
        poner(a, cama(x, int((b - a) * SR)), nivel * 0.30)

    for t, pieza, nivel in EVENTOS:
        poner(t, cargar(carpeta, pieza), nivel)

    pico = np.abs(y).max()
    y = y / (pico + 1e-9) * 0.72
    sf.write(salida, y.astype(np.float32), SR)
    print(f"{salida} · {dur:.1f}s · {len(EVENTOS)} efectos reales · "
          f"{len(CAMAS)} ambientes · pico {20*np.log10(0.72):.1f} dBFS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
