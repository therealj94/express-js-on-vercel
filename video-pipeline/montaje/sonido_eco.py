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


def _rug(n, semilla, suav=1):
    """Ruido rugoso: la base de todo lo que suena a materia y no a sintetizador."""
    rng = np.random.default_rng(semilla)
    x = rng.standard_normal(n)
    if suav > 1:
        x = np.convolve(x, np.ones(suav) / suav, mode="same")
    return x


def roce_metal(dur=2.6, semilla=5):
    """Dos piezas de metal rozando. Sustituye al timbre de campana.

    El anterior eran cuatro senos inarmónicos y sonaba "a sintetizador de los
    80". Un metal real no es una nota: es fricción -ruido filtrado muy
    estrecho- con resonancias que se mueven mientras la superficie raspa."""
    t = _t(dur)
    x = np.zeros(len(t))
    base = _rug(len(t), semilla)
    # Tres resonancias que se deslizan: es el "raspado", no un acorde.
    for f0, f1, a in ((1750, 1180, 0.5), (3300, 2450, 0.3), (5400, 4100, 0.16)):
        f = f0 + (f1 - f0) * (t / dur)
        # Filtro resonante barato: modular el ruido por una portadora que barre.
        x += a * base * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x * np.exp(-t * 1.7) * 0.9


def pulso_pecho(dur=3.0, f=41.0):
    """El golpe que se siente en el pecho, no el que se oye.

    "Un pulso de baja frecuencia que vibre en el pecho, no ruiditos
    electrónicos." A 41 Hz un altavoz de móvil casi no lo reproduce, pero unos
    auriculares o un equipo sí, y es lo que da autoridad."""
    t = _t(dur)
    cuerpo = np.sin(2 * np.pi * f * t) * np.exp(-t * 1.5)
    # Un armónico para que exista también en altavoces pequeños.
    cuerpo += 0.35 * np.sin(2 * np.pi * f * 2.5 * t) * np.exp(-t * 3.2)
    return cuerpo


def polvo(dur=2.2, semilla=3):
    """Aire, no siseo. Una masa de ruido grave que se abre y se cierra."""
    t = _t(dur)
    x = _rug(len(t), semilla, 6)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    return x * env * 0.55


def impacto(dur=3.0, semilla=11):
    """Golpe: pulso de pecho + un chasquido de madera encima."""
    t = _t(dur)
    madera = _rug(len(t), semilla, 3) * np.exp(-t * 34)
    return pulso_pecho(dur) * 0.9 + madera * 0.35


def clic(dur=0.20, semilla=7):
    """Toque seco de madera. El anterior eran dos senos y sonaba a notificación."""
    t = _t(dur)
    x = _rug(len(t), semilla, 2) * np.exp(-t * 60)
    # Un par de modos de resonancia: la madera suena a algo, no a nada.
    for f, a in ((420, 0.5), (930, 0.25)):
        x += a * np.sin(2 * np.pi * f * t) * np.exp(-t * 40)
    return x * 0.7


def barrido(dur=1.0, semilla=13):
    """Aire comprimido cruzando, no un pitido que sube."""
    t = _t(dur)
    x = _rug(len(t), semilla, 3)
    centro = 700 + 3200 * (t / dur)
    x = x * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(centro) / SR))
    return x * np.sin(np.pi * t / dur) ** 2 * 0.45


def moneda(dur=2.6, semilla=5):
    """El oro: roce de metal, con un poco de cuerpo grave debajo."""
    return roce_metal(dur, semilla) * 0.85 + pulso_pecho(dur, 55.0) * 0.30


def sello(dur=1.8, semilla=17):
    """El comprobante: un golpe de sello sobre papel y su resonancia."""
    t = _t(dur)
    papel = _rug(len(t), semilla, 2) * np.exp(-t * 46) * 0.8
    cuerpo = pulso_pecho(dur, 68.0) * 0.5
    # Una sola nota corta y seca, sin la resolucion de dos notas que sonaba
    # a musiquita de aplicacion.
    tono = np.sin(2 * np.pi * 660 * t) * np.exp(-t * 9) * 0.18
    return papel + cuerpo + tono


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

    # Reordenado sobre la estructura nueva: el oro abre, las funciones son tres
    # golpes y no siete, y el clímax es el comprobante.
    # Colocados sobre pelicula2_montaje.json (material fotografico), no sobre
    # la version dibujada: el oro abre, el polvo cae, el telefono se enciende,
    # la yema aprieta, la mano recibe, la tarjeta entra, las manos se pasan el
    # telefono, la cara lee, la luz viaja, la gota, el logo, el cierre.
    # Sobre el montaje de material fotografico, segunda version: un producto
    # por bloque. Cada marca que entra suena a metal; cada gesto de la mano,
    # a clic; el comprobante, a sello.
    ev = [
        (0.9, moneda, 1.0),          # el oro entra
        (4.6, polvo, 0.8),           # la colada
        (8.6, impacto, 0.6),         # el disco asienta: ORIGEN
        (10.0, moneda, 0.45),        # las cuatro gotas, una a una
        (10.5, moneda, 0.45),
        (11.0, moneda, 0.45),
        (11.5, moneda, 0.45),
        (14.3, impacto, 0.5),        # Veta Wallet
        (17.7, clic, 0.9),           # la huella
        (21.5, polvo, 0.5),          # recibi
        (25.5, clic, 0.9),           # el telefono toca el terminal
        (29.2, clic, 0.9),           # la tarjeta entra
        (33.0, barrido, 0.8),        # de mano en mano
        (36.9, barrido, 0.6),        # el hilo entre telefonos
        (40.7, moneda, 0.9),         # la moneda gira
        (43.8, barrido, 1.0),        # la luz viaja
        (46.1, sello, 1.0),          # ordenscan: el comprobante
        (47.9, impacto, 1.0),        # Orden Global en el centro
        (48.6, clic, 0.5),           # las seis marcas, una a una
        (48.83, clic, 0.5),
        (49.07, clic, 0.5),
        (49.3, clic, 0.5),
        (49.53, clic, 0.5),
        (49.77, clic, 0.5),
        (52.4, impacto, 0.85),       # el cierre
    ]
    y = pista(dur, ev)
    sf.write(sal, np.column_stack([y, y]), SR)
    print(f"{sal} · {dur}s · {len(ev)} efectos · "
          f"pico {20*np.log10(np.max(np.abs(y))+1e-9):.1f} dBFS")
