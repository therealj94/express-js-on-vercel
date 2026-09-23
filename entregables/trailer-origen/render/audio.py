"""Banda sonora sintetizada del tráiler (sin muestras de terceros).

Mismos tiempos que trailer.html. Uso: python3 audio.py salida.wav
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR, DUR = 48000, 30.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(55)
L = np.zeros(N); R = np.zeros(N)

T_CORTES, PASO = 2.2, 0.525
tick_time = lambda i: 10.9 + 1.3 * np.sqrt(i / 54)
N_CIUDADES = 41
ciudad_t = lambda i: 17.6 + 2.6 * i / (N_CIUDADES - 1)


def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b): return sosfilt(butter(2, [a, b], 'band', fs=SR, output='sos'), x)
def env(a, b, fi, fo):
    e = np.clip((t - a) / max(fi, 1e-4), 0, 1) * np.clip((b - t) / max(fo, 1e-4), 0, 1)
    return e * e * (3 - 2 * e)


def put(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR); n = min(len(sig), N - i)
    if n <= 0: return
    L[i:i + n] += sig[:n] * gain * np.sqrt((1 - pan) / 2)
    R[i:i + n] += sig[:n] * gain * np.sqrt((1 + pan) / 2)


def impacto(dur=1.6, f0=70, f1=38, ruido=.25):
    tt = np.arange(int(dur * SR)) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 9)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 3.2)
    n = lp(rng.standard_normal(len(tt)), 1800) * np.exp(-tt * 28) * ruido
    return s + n


def campana(f, dur=4.0):
    tt = np.arange(int(dur * SR)) / SR
    mod = np.sin(2 * np.pi * f * 1.4 * tt) * 2.2 * np.exp(-tt * 1.8)
    s = np.sin(2 * np.pi * f * tt + mod) * np.exp(-tt * 1.1)
    s += .35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 2.5)
    return s * np.minimum(tt / .004, 1)


def pulso(f, dur=.9):
    tt = np.arange(int(dur * SR)) / SR
    s = sum(np.sin(2 * np.pi * f * k * tt) / k ** 1.5 for k in (1, 2, 3, 4))
    return lp(s * np.exp(-tt * 5) * np.minimum(tt / .003, 1), 3500)


def clic(f=3200):
    tt = np.arange(int(.03 * SR)) / SR
    return np.sin(2 * np.pi * f * tt) * np.exp(-tt * 260)


def silbido(dur, f0, f1, g=1.0):
    n = int(dur * SR); x = rng.standard_normal(n); out = np.zeros(n); blk = 1024
    for k in range(0, n, blk):
        u = k / n; fc = f0 * (f1 / f0) ** u
        out[k:k + blk] = bp(x[k:k + blk], fc * .7, min(fc * 1.4, SR / 2 - 100))
    e = np.linspace(0, 1, n) ** 2
    return out * e * g


# drone en La 55 Hz (el número del gramín), crece y respira
dr = sum(np.sin(2 * np.pi * 55 * k * t + k) / k ** 1.2 for k in (1, 2, 3, 5))
dr = lp(dr, 420) * (.55 + .15 * np.sin(2 * np.pi * .13 * t))
dr *= env(0, 29.9, 2.5, 1.2) * (1 - .6 * env(12.8, 21, .6, .6))
L += dr * .30; R += dr * .30

# pad de acordes Am–F–C–G
def acorde(notas, a, b):
    s = np.zeros(N)
    for fr in notas:
        for det in (-.18, .18):
            s += np.sin(2 * np.pi * (fr + det) * t + rng.uniform(0, 6))
    return lp(s, 1600) * env(a, b, .8, 1.0)

A3, C4, E4, F3, G3, B3, D4, A4 = 220, 261.63, 329.63, 174.61, 196, 246.94, 293.66, 440
pad = (acorde([A3, C4, E4], 6.2, 10.6) + acorde([F3, A3, C4], 10.0, 14.6) +
       acorde([C4 / 2 * 2, E4, 392], 14.0, 18.6) + acorde([G3, B3, D4], 18.0, 21.4) +
       acorde([A3, C4, E4, A4], 21.0, 29.95))
L += pad * .045; R += pad * .045

# subida inicial y golpe al entrar a los paisajes
put(silbido(2.2, 200, 5000, .18), 0.0)
put(impacto(2.2, 80, 36, .35), T_CORTES, .9)
for k in range(8):
    put(impacto(.9, 95, 50, .5), T_CORTES + k * PASO, .5, [-.3, .3][k % 2])
    put(silbido(.25, 3000, 800, .12), T_CORTES + k * PASO - .05, 1, [.4, -.4][k % 2])

# el oro
put(impacto(3.0, 60, 30, .3), 6.4, 1.1)
put(campana(880), 6.55, .10, -.2)
put(campana(1318.5), 7.5, .08, .25)
put(campana(659.25), 9.75, .09, -.1)
put(campana(987.8), 10.4, .09, .2)

# 55 marcas que aceleran
for i in range(55):
    put(clic(2600 + 20 * i), tick_time(i), .22, -0.7 + 1.4 * i / 54)
put(silbido(1.3, 400, 6000, .12), 10.9)
put(impacto(2.5, 55, 27.5, .15), 12.25, .8)
put(campana(1760, 5), 13.6, .16)
put(campana(880, 5), 13.6, .10)

# gramín
put(pulso(A3), 14.55, .10); put(pulso(C4), 15.2, .10); put(pulso(E4), 15.4, .12)

# ciudades: punteo pentatónico que baja de norte a sur
penta = [1760, 1567.98, 1318.51, 1174.66, 987.77, 880, 783.99, 659.25, 587.33, 493.88, 440]
for i in range(N_CIUDADES):
    if i % 2 == 0:
        f = penta[min(int(i / N_CIUDADES * len(penta)), len(penta) - 1)]
        put(pulso(f, .6), ciudad_t(i), .07, -.6 + 1.2 * ((i * 7) % 11) / 10)

# ecuación
put(impacto(2.0, 70, 35, .2), 21.3, .7)
put(pulso(A3 / 2, 1.5), 21.45, .25)
put(campana(1318.5), 22.35, .08)

# marca
put(silbido(1.2, 300, 7000, .16), 23.3)
put(impacto(4.5, 60, 27.5, .45), 24.5, 1.25)
put(campana(440, 6), 24.55, .16); put(campana(659.25, 6), 24.6, .10, -.3); put(campana(880, 6), 24.65, .08, .3)
put(campana(1760, 5), 25.45, .10)

# reverberación de sala grande
ir_n = int(3.2 * SR); ti = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-ti * 2.1); irR = rng.standard_normal(ir_n) * np.exp(-ti * 2.1)
irL = lp(irL, 5000); irR = lp(irR, 5000)
irL /= np.sqrt((irL ** 2).sum()); irR /= np.sqrt((irR ** 2).sum())
wetL = fftconvolve(L, irL)[:N]; wetR = fftconvolve(R, irR)[:N]
Lm = L * .8 + wetL * .45; Rm = R * .8 + wetR * .45
Lm = hp(Lm, 24); Rm = hp(Rm, 24)

# final: fundido y normalización con techo suave
f = env(0, 30, .05, .9)
Lm *= f; Rm *= f
pk = max(np.abs(Lm).max(), np.abs(Rm).max())
Lm = np.tanh(Lm / pk * 1.3) / np.tanh(1.3) * .89
Rm = np.tanh(Rm / pk * 1.3) / np.tanh(1.3) * .89
wavfile.write(sys.argv[1], SR, (np.stack([Lm, Rm], 1) * 32767).astype(np.int16))
print('ok', sys.argv[1])
