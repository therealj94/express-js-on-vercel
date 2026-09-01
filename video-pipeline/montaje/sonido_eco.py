#!/usr/bin/env python3
"""Diseño de sonido de la película del ecosistema. Sintetizado aquí.

La música sola deja la pieza plana: en un tráiler de producto lo que vende el
movimiento es el sonido de cada cosa al pasar. Y como todo lo que se ve está
dibujado por código, lo que suena también se calcula — sin bancos de sonido,
sin licencias y con el golpe exactamente en el fotograma que toca.

Cada efecto sale de lo que hace la imagen:

  polvo     los puntos del enjambre, un siseo con altura que sube al juntarse
  impacto   cuando la marca se cierra: un golpe grave con cola
  clic      la entrada de cada función, seco y corto
  barrido   la luz del lector cruzando el QR
  moneda    el timbre metálico del oro, dos parciales inarmónicos
  sello     el comprobante confirmado: dos notas que resuelven

    python3 montaje/sonido_eco.py salida.wav 46.5
"""
from __future__ import annotations

import sys

import numpy as np
import soundfile as sf

SR = 48000


def _t(dur):
    return np.arange(int(SR * dur)) / SR


def polvo(dur=2.2):
    """Siseo filtrado cuya altura sube: los puntos encontrando su sitio."""
    t = _t(dur)
    rng = np.random.default_rng(3)
    x = rng.standard_normal(len(t))
    # Un pasa-banda barato que se abre con el tiempo.
    for k in range(3):
        x = x - np.convolve(x, np.ones(40) / 40, mode="same")
    env = np.clip(t / dur, 0, 1) ** 1.5 * np.exp(-((t - dur * 0.8) ** 2) / 0.6)
    return x * env * 0.5


def impacto(dur=2.6):
    """El golpe de la marca al cerrarse. Barrido de altura hacia abajo."""
    t = _t(dur)
    f = 120 * np.exp(-t * 9) + 38
    cuerpo = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6)
    rng = np.random.default_rng(11)
    aire = rng.standard_normal(len(t))
    aire = (aire - np.convolve(aire, np.ones(12) / 12, mode="same")) * np.exp(-t * 26)
    return cuerpo * 0.85 + aire * 0.25


def clic(dur=0.13):
    """Entrada de una función. Corto, con cuerpo, sin llegar a ser un pitido."""
    t = _t(dur)
    return (np.sin(2 * np.pi * 880 * t) * 0.5 +
            np.sin(2 * np.pi * 1320 * t) * 0.25) * np.exp(-t * 46)


def barrido(dur=0.9):
    """La luz del lector cruzando el código."""
    t = _t(dur)
    f = 400 + 2600 * (t / dur)
    env = np.sin(np.pi * t / dur) ** 2
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env * 0.32


def moneda(dur=2.4):
    """El oro. Parciales inarmónicos, que es lo que separa un metal de una nota."""
    t = _t(dur)
    x = np.zeros(len(t))
    for f, a, d in ((1180, 0.5, 2.2), (2630, 0.32, 3.0), (4310, 0.18, 4.4),
                    (5870, 0.10, 6.0)):
        x += a * np.sin(2 * np.pi * f * t) * np.exp(-t * d)
    return x * 0.55


def sello(dur=1.6):
    """El comprobante confirmado: dos notas que resuelven hacia arriba."""
    t = _t(dur)
    x = np.zeros(len(t))
    for f, ini in ((523.25, 0.0), (783.99, 0.16)):
        m = t >= ini
        tt = t - ini
        x[m] += (np.sin(2 * np.pi * f * tt[m]) +
                 0.3 * np.sin(2 * np.pi * f * 2 * tt[m])) * np.exp(-tt[m] * 3.4)
    return x * 0.42


def pista(dur, eventos):
    """Coloca cada efecto en su segundo exacto y los suma."""
    x = np.zeros(int(SR * dur))
    for t0, gen, gan in eventos:
        s = gen() * gan
        i = int(t0 * SR)
        fin = min(len(x), i + len(s))
        if fin > i:
            x[i:fin] += s[:fin - i]
    pico = np.max(np.abs(x))
    return x / pico * 0.72 if pico > 0 else x


if __name__ == "__main__":
    sal = sys.argv[1] if len(sys.argv) > 1 else "sonido_eco.wav"
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 46.5

    ev = [
        (0.4, polvo, 0.9),          # los puntos buscándose
        (3.3, impacto, 1.0),        # la marca se cierra
        (7.2, polvo, 0.5),          # los puntos se rehacen en la app
        (8.0, impacto, 0.45),       # el halo de Veta asienta
    ]
    # Un clic por función. Coinciden con los cortes, que van a 2,7 s.
    for k in range(7):
        ev.append((11.0 + k * 2.7, clic, 0.85))
    ev += [
        (16.4, barrido, 1.0),       # el lector barre el QR
        (30.2, moneda, 1.0),        # la pepita entra
        (32.4, moneda, 0.55),       # se divide en 55
        (36.6, sello, 1.0),         # el comprobante confirma
        (41.0, impacto, 0.8),       # el cierre
    ]
    y = pista(dur, ev)
    sf.write(sal, np.column_stack([y, y]), SR)
    print(f"{sal} · {dur}s · {len(ev)} efectos · "
          f"pico {20*np.log10(np.max(np.abs(y))+1e-9):.1f} dBFS")
