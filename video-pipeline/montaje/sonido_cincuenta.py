#!/usr/bin/env python3
"""Sonido de *Cincuenta*, hecho a medida del montaje (prompts/pelicula1_montaje.json).

Es documental: no hay efectos de trailer. Hay dos sitios que suenan distinto
—la pulpería, con calle y chapa caliente, y la cocina alquilada, con la nevera
y el silencio de un piso chico— y cuatro cosas que pasan: el teléfono vibra
sobre la madera, la hija toca el cristal tres veces, el teléfono vibra otra vez
allá, y el datáfono pita. El resto es aire.

    python3 montaje/sonido_cincuenta.py salida.wav 44.0
"""
from __future__ import annotations

import sys

import numpy as np
import soundfile as sf

SR = 48000
rng = np.random.default_rng(50)


def ruido(n, color=1.0):
    """Ruido con caída 1/f^color, normalizado."""
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    X[1:] /= f[1:] ** (color / 2)
    X[0] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)


def banda(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def ventana(n, sube, baja):
    t = np.arange(n) / SR
    d = n / SR
    return np.clip(t / max(sube, 1e-3), 0, 1) * np.clip((d - t) / max(baja, 1e-3), 0, 1)


def calle(dur):
    """Pulpería: calle lejana (ruido marrón), un motor que pasa, chapa."""
    n = int(dur * SR)
    fondo = banda(ruido(n, 1.6), 60, 2500) * 0.55
    # Un motor que pasa: banda estrecha que sube y baja de tono (doppler).
    t = np.arange(n) / SR
    paso = np.sin(2 * np.pi * (85 + 25 * np.sin(np.pi * t / dur)) * t)
    paso *= np.exp(-((t - dur * 0.45) ** 2) / (2 * (dur * 0.18) ** 2)) * 0.12
    return fondo + paso


def cocina(dur):
    """Cocina alquilada: zumbido de nevera a 50 Hz con armónicos, y aire."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    nevera = sum(np.sin(2 * np.pi * 50 * k * t + k) / (k ** 1.7) for k in range(1, 6)) * 0.05
    return nevera + banda(ruido(n, 1.2), 200, 4000) * 0.16


def vibrar(dur=0.9, fmot=170.0):
    """Teléfono vibrando sobre madera: motor a 170 Hz con la carcasa
    golpeteando el tablero (modulación) y resonancia de la madera."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    motor = np.sin(2 * np.pi * fmot * t) + 0.5 * np.sin(2 * np.pi * fmot * 2 * t)
    golpeteo = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 27 * t))
    madera = banda(ruido(n, 0.8), 120, 900) * 0.6
    y = (motor * golpeteo + madera) * ventana(n, 0.02, 0.15)
    # Dos ráfagas, como un aviso.
    y *= (np.sin(2 * np.pi * 1.6 * t) > -0.2)
    return y / (np.abs(y).max() + 1e-9) * 0.5


def toque(dur=0.09):
    """Yema contra cristal: casi nada, un golpe sordo y corto."""
    n = int(dur * SR)
    y = banda(ruido(n, 0.5), 700, 5000) * np.exp(-np.arange(n) / (SR * 0.012))
    return y / (np.abs(y).max() + 1e-9) * 0.35


def pitido(dur=0.32, f=2093.0):
    """Datáfono: un tono limpio, breve, con un clic de relé delante."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * ventana(n, 0.004, 0.06)
    y[: int(0.006 * SR)] += banda(ruido(int(0.006 * SR), 0.3), 1500, 8000) * 0.8
    return y * 0.32


def main():
    salida = sys.argv[1]
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 44.0
    n = int(dur * SR)
    y = np.zeros(n)

    def poner(cuando, x, nivel=1.0):
        a = int(cuando * SR)
        b = min(n, a + len(x))
        y[a:b] += x[: b - a] * nivel

    # Camas por sitio, siguiendo los bloques del montaje. Se solapan medio
    # segundo para que el corte de imagen no sea un corte de aire.
    #   pulpería 0.0-6.2 · cocina 6.2-17.0 · pulpería 17.0-30.6 (la tarjeta
    #   es otra tienda: misma cama más baja) · caras 33.8-38.6 (calle) · negro.
    for a, b, sitio, nivel in ((0.0, 6.5, calle, 1.0), (6.0, 17.3, cocina, 1.0),
                               (16.8, 30.9, calle, 0.9), (30.4, 34.0, calle, 0.55),
                               (33.6, 39.0, calle, 0.7)):
        x = sitio(b - a) * ventana(int((b - a) * SR), 0.5, 0.5)
        poner(a, x, nivel * 0.22)

    # Lo que pasa.
    poner(4.4, vibrar())                       # 02: vibra sobre el mostrador
    poner(10.3, toque())                       # 04: abre
    poner(12.7, toque(), 0.8)                  # 05: elige
    poner(15.0, toque(0.16), 1.2)              # 06: aprieta y mantiene
    poner(17.5, vibrar(1.1), 0.75)             # 07: suena allá (entra la música: más bajo)
    poner(31.7, pitido())                      # 11: el datáfono acepta

    y = y / (np.abs(y).max() + 1e-9) * 0.7
    sf.write(salida, y.astype(np.float32), SR)
    print(f"{salida} · {dur:.1f}s · pico {20*np.log10(np.abs(y).max()):.1f} dBFS")


if __name__ == "__main__":
    main()
