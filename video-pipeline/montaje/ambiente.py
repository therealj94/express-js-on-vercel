#!/usr/bin/env python3
"""Diseño de sonido del anuncio, hecho a medida de lo que ocurre en pantalla.

Se analizó el montaje plano a plano antes de escribir una sola línea:

  p1  0.0-10.1  florería: ella envuelve el ramo en papel kraft y se lo pasa
  p2 10.1-20.3  manos sosteniendo el ramo hacia el lente
  p3 20.3-30.4  ella lo recibe en el pasillo de casa; cae el pétalo
  p4 30.4-40.5  el pétalo solo en el suelo de madera; un dedo lo recoge
  p5 40.5-50.6  ella con el ramo contra el pecho
  p6 50.6-56.7  negro, logo, cifras

De ahí sale todo: el papel suena donde hay papel, la casa suena distinta de
la tienda, y el plano del pétalo es el más silencioso de la pieza porque es
donde tiene que oírse una sola cosa.
"""
import numpy as np, soundfile as sf

SR, DUR = 48000, 56.71
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)


def ruido_rosa(n):
    """Ruido con más grave que agudo: es el color del aire de una habitación.
    El ruido blanco puro suena a televisor sin señal."""
    b = rng.standard_normal(n)
    x = np.zeros(n); v = np.zeros(3)
    for i in range(n):
        v[0] = 0.997 * v[0] + b[i] * 0.029
        v[1] = 0.985 * v[1] + b[i] * 0.076
        v[2] = 0.950 * v[2] + b[i] * 0.154
        x[i] = v.sum() + b[i] * 0.032
    return x / (np.max(np.abs(x)) + 1e-9)


def ventana(a, b, subida=0.4, bajada=0.4):
    """Una sección con entrada y salida suaves, para que no chasquee."""
    e = np.zeros(N)
    i0, i1 = int(a * SR), int(b * SR)
    e[i0:i1] = 1.0
    s, d = int(subida * SR), int(bajada * SR)
    e[i0:i0+s] = np.linspace(0, 1, s)
    e[i1-d:i1] = np.linspace(1, 0, d)
    return e


def paso_bajo(x, corte):
    a = np.exp(-2 * np.pi * corte / SR)
    y = np.zeros_like(x); prev = 0.0
    for i, v in enumerate(x):
        prev = (1 - a) * v + a * prev
        y[i] = prev
    return y


def cripar(centro, dur=0.55, nivel=0.05, brillo=0.55):
    """Papel kraft: ráfagas irregulares de ruido agudo. El papel no suena
    continuo, suena a golpecitos: por eso la envolvente va a trozos."""
    n = int(dur * SR)
    base = rng.standard_normal(n)
    base = base - paso_bajo(base, 900)          # quitar graves: es papel, no viento
    env = np.zeros(n)
    p = 0
    while p < n:
        L = rng.integers(int(0.012 * SR), int(0.06 * SR))
        pico = rng.uniform(0.25, 1.0)
        seg = np.hanning(min(L, n - p))
        env[p:p+len(seg)] += seg * pico
        p += len(seg) + rng.integers(0, int(0.05 * SR))
    x = base * env * brillo
    salida = np.zeros(N)
    i = int(centro * SR)
    salida[i:i+n] += x[:max(0, min(n, N - i))] * nivel
    return salida


def golpecito(cuando, f=2400, dur=0.05, nivel=0.02):
    """El pétalo tocando la madera: casi nada, pero el oído lo agradece."""
    n = int(dur * SR)
    x = np.sin(2*np.pi*f*np.arange(n)/SR) * np.exp(-np.arange(n)/(0.006*SR))
    x += rng.standard_normal(n) * np.exp(-np.arange(n)/(0.004*SR)) * 0.5
    s = np.zeros(N); i = int(cuando * SR)
    s[i:i+n] += x[:max(0, min(n, N - i))] * nivel
    return s


# --- Aire de cada espacio -------------------------------------------------
aire = ruido_rosa(N)
tienda = paso_bajo(aire, 3000) * ventana(0.0, 20.3) * 0.030   # local, algo vivo
casa   = paso_bajo(aire, 1500) * ventana(20.0, 30.6) * 0.022  # interior, más sordo
suelo  = paso_bajo(aire, 900)  * ventana(30.2, 40.7) * 0.011  # el plano callado
salon  = paso_bajo(aire, 1400) * ventana(40.3, 50.8) * 0.020
ambiente = tienda + casa + suelo + salon

# --- Lo que pasa en pantalla ---------------------------------------------
efectos = (
    cripar(2.4, 1.1, 0.055) +      # envuelve el ramo
    cripar(6.8, 0.9, 0.050) +      # dobla y aprieta el papel
    cripar(8.9, 0.5, 0.035) +      # se lo pasa por el mostrador
    cripar(11.0, 0.7, 0.040) +     # él lo agarra
    cripar(21.8, 0.8, 0.045) +     # ella lo recibe
    golpecito(30.9, 2100, 0.06, 0.016) +   # el pétalo toca la madera
    golpecito(38.4, 1500, 0.05, 0.012) +   # el dedo sobre la madera
    cripar(44.0, 0.6, 0.030)       # lo acomoda contra el pecho
)

x = ambiente + efectos
x = x / (np.max(np.abs(x)) + 1e-9) * 0.5
sf.write("ambiente.wav", np.column_stack([x, x]), SR)
print(f"ambiente.wav  {DUR:.2f}s  pico {20*np.log10(np.max(np.abs(x))):.1f} dBFS")
