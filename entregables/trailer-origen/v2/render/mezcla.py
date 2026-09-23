"""Música, efectos y mezcla con la voz de Damián. Todo cae en las palabras de tiempos.json.

Uso: python3 mezcla.py salida.wav
"""
import json, sys
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

AQUI = Path(__file__).resolve().parent
T = json.load(open(AQUI / 'tiempos.json'))
PW, FR = T['palabras'], T['frases']
P = lambda w, k=0: PW[w][k]
class _F:
    def __init__(s, d): s.ini, s.fin = d['ini'], d['fin']
F = lambda n: _F(FR[n - 1])
SR = 48000; DUR = T['duracion']; N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(55)
M = np.zeros((2, N))      # música
X = np.zeros((2, N))      # efectos

def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b): return sosfilt(butter(2, [a, b], 'band', fs=SR, output='sos'), x)
def env(a, b, fi, fo):
    e = np.clip((t - a) / max(fi, 1e-4), 0, 1) * np.clip((b - t) / max(fo, 1e-4), 0, 1)
    return e * e * (3 - 2 * e)
def put(buf, sig, at, g=1.0, pan=0.0):
    i = int(at * SR); n = min(len(sig), N - i)
    if n <= 0 or i < 0: return
    buf[0, i:i + n] += sig[:n] * g * np.sqrt((1 - pan) / 2)
    buf[1, i:i + n] += sig[:n] * g * np.sqrt((1 + pan) / 2)
def tt(d): return np.arange(int(d * SR)) / SR

def impacto(d=2.0, f0=70, f1=34, ruido=.3):
    x = tt(d); f = f1 + (f0 - f1) * np.exp(-x * 9)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 2.6) + lp(rng.standard_normal(len(x)), 1600) * np.exp(-x * 25) * ruido
def latido():
    return impacto(.5, 60, 40, .05) * .9
def campana(f, d=4.0):
    x = tt(d); mod = np.sin(2 * np.pi * f * 1.4 * x) * 2.2 * np.exp(-x * 1.8)
    s = np.sin(2 * np.pi * f * x + mod) * np.exp(-x * 1.1) + .35 * np.sin(2 * np.pi * f * 2.76 * x) * np.exp(-x * 2.5)
    return s * np.minimum(x / .004, 1)
def pulso(f, d=.8, dec=5):
    x = tt(d); s = sum(np.sin(2 * np.pi * f * k * x) / k ** 1.5 for k in (1, 2, 3, 4))
    return lp(s * np.exp(-x * dec) * np.minimum(x / .003, 1), 3500)
def clic(f=3000):
    x = tt(.03); return np.sin(2 * np.pi * f * x) * np.exp(-x * 260)
def silbido(d, f0, f1, g=1.0, subida=True):
    n = int(d * SR); x = rng.standard_normal(n); o = np.zeros(n); b = 1024
    for k in range(0, n, b):
        u = k / n; fc = f0 * (f1 / f0) ** u
        o[k:k + b] = bp(x[k:k + b], fc * .7, min(fc * 1.4, SR / 2 - 100))
    e = np.linspace(0, 1, n) ** 2 if subida else np.linspace(1, 0, n) ** 2
    return o * e * g
def grieta(d=.9):
    x = tt(d); s = np.zeros(len(x))
    for k in range(40):
        i = int(rng.uniform(0, .5) * SR); L = int(.004 * SR)
        s[i:i + L] += rng.standard_normal(L) * rng.uniform(.3, 1)
    return hp(s, 1500) * np.exp(-x * 3) + impacto(d, 50, 30, 0) * .6
def acorde(notas, a, b, brillo=1400, g=1.0):
    s = np.zeros(N)
    for fr in notas:
        for det in (-.2, .2):
            s += np.sin(2 * np.pi * (fr + det) * t + rng.uniform(0, 6)) + .3 * np.sin(2 * np.pi * 2 * (fr + det) * t)
    return lp(s, brillo) * env(a, b, 1.2, 1.4) * g

# ---- lecho: drone en La 55 Hz con respiración ----
dr = sum(np.sin(2 * np.pi * 55 * k * t + k) / k ** 1.2 for k in (1, 2, 3, 5))
dr = lp(dr, 380) * (.6 + .15 * np.sin(2 * np.pi * .11 * t))
dr *= env(0, DUR - .2, 2.0, 2.0) * (1 - .75 * env(F(4).ini - .4, F(5).ini + .2, .4, .6))
M += dr * .32

# ---- armonía por actos ----
A2, C3, E3, F2, G2, A3, C4, E4, F3, G3, B3, D4 = 110, 130.81, 164.81, 87.31, 98, 220, 261.63, 329.63, 174.61, 196, 246.94, 293.66
pad = (acorde([A2, C3, E3], 0, F(4).ini, 700, .8)                         # oscuro: fronteras
       + acorde([A3, C4, E4], F(5).ini - .3, F(6).ini + 2, 1500)          # el oro
       + acorde([F3, A3, C4], F(6).ini + 1.5, F(8).ini + .5, 1700)
       + acorde([C4, E4, 392], F(8).ini, F(9).ini + 1, 1900)
       + acorde([G3, B3, D4], F(9).ini, F(10).ini + 1, 2100)
       + acorde([F3, A3, C4, 440], F(10).ini, F(11).ini + .5, 2400)
       + acorde([G3, B3, D4, 392], F(11).ini, F(12).ini, 2800, 1.2)
       + acorde([A3, C4, E4, 440, 659.25], F(12).ini - .3, DUR, 3000, 1.2))
M += pad * .05

# ---- pulso rítmico (corazón del avance) desde el oro hasta la potencia ----
bpm = 96; paso = 60 / bpm / 2
for n_, a, b, f in [(0, F(6).ini, F(9).ini - .5, A2 / 2), (1, F(9).ini, F(11).ini, G2 / 2), (2, F(11).ini, F(12).ini - .2, A2 / 2)]:
    x = a
    while x < b:
        put(M, pulso(f * 2, .35, 9), x, .12 * (1 + .6 * (n_ == 2)))
        x += paso

# ---- efectos, palabra por palabra ----
put(X, latido(), .35, .9); put(X, latido(), .75, .6); put(X, latido(), 1.9, .9); put(X, latido(), 2.3, .6)
put(X, silbido(2.2, 300, 6000, .10), F(1).ini)                        # contador
for i in range(20): put(X, clic(2200 + 60 * i), F(2).ini + .1 + i * .075, .18, -.6 + 1.2 * i / 19)
put(X, grieta(), P('fronteras') - .05, .9)
t0, t1 = F(3).ini + .2, P('camino') + .1
for k in range(8):                                                     # tropiezos del envío
    put(X, impacto(.6, 90, 55, .4), t0 + (t1 - t0) * k / 8, .35, -.3 + .6 * k / 7)
for d in (P('dias') - .9, P('dias') - .2, P('dias')): put(X, campana(196, 1.5), d, .05)
put(X, silbido(1.4, 5000, 400, .08, False), F(4).ini - .3)             # congelado
put(X, silbido(1.6, 800, 9000, .10), P('regla') - .2)                  # regla que barre
put(X, silbido(1.8, 200, 7000, .15), F(5).ini)
c0 = F(5).ini + .55; paso8 = (P('oro') - c0) / 8
for k in range(8): put(X, impacto(.7, 95, 50, .45), c0 + k * paso8, .35, [-.3, .3][k % 2])
put(X, impacto(3.2, 62, 28, .35), P('oro') - .05, 1.1)
put(X, campana(880), P('oro'), .10); put(X, campana(1318.5), P('oro') + .05, .06, .3)
put(X, campana(440, 3), P('gramo'), .08)
tD, t55 = P('dividelo') + .1, P('55') + .35
for i in range(55): put(X, clic(3400 + 15 * i), tD + (t55 - tD) * i / 54, .16, -.7 + 1.4 * i / 54)
put(X, impacto(2.0, 55, 27.5, .15), P('55'), .7)
put(X, campana(1760, 5), P('gramin'), .14); put(X, campana(880, 5), P('gramin'), .08)
put(X, campana(1318.5, 5), P('origen'), .12); put(X, impacto(2.2, 60, 30, .1), P('origen'), .6)
for w, f0, f1 in [('sube', 300, 900), ('baja', 900, 300)]:           # tono que sube / baja
    x = tt(1.0); f = f0 * (f1 / f0) ** x
    put(X, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x) * .5, P(w), .10)
put(X, pulso(A3, 1.2), P('precio') - .2, .12)
put(X, campana(1046.5, 2), P('guadalajara'), .07, -.4); put(X, campana(1318.5, 2), P('lima'), .07, .4)
put(X, silbido(.9, 600, 8000, .22), P('segundos') - .15)
put(X, campana(1760, 4), P('segundos') + .7, .14); put(X, campana(2637, 3), P('segundos') + .72, .06)
put(X, silbido(2.4, 150, 3000, .10), P('fragmentos') - .8)
put(X, impacto(3.0, 55, 27.5, .1), P('fragmentos') + .3, .6)
put(X, silbido(2.6, 200, 9000, .20), P('mundial') - 2.4)
put(X, impacto(4.5, 62, 27.5, .5), P('mundial') - .05, 1.3)
put(X, impacto(4.5, 60, 27.5, .45), F(12).ini - .35, 1.1)
for f, d, pn in [(440, 0, 0), (659.25, .05, -.3), (880, .1, .3)]: put(X, campana(f, 6), F(12).ini - .3 + d, .12, pn)
put(X, campana(1760, 5), P('origen', 2) + 1.0, .09)
put(X, campana(880, 6), F(13).ini, .10)

# ---- reverberación de sala ----
def reverb(buf, mezcla=.45, d=3.2):
    n = int(d * SR); x = np.arange(n) / SR
    out = np.zeros_like(buf)
    for c in range(2):
        ir = lp(rng.standard_normal(n) * np.exp(-x * 2.0), 5000); ir /= np.sqrt((ir ** 2).sum())
        out[c] = buf[c] * .85 + fftconvolve(buf[c], ir)[:N] * mezcla
    return out
M = reverb(M, .4); X = reverb(X, .5)

# ---- voz: compresión suave, presencia y un poco de sala ----
_, v = wavfile.read(AQUI / 'voz.wav'); v = v.astype(np.float64) / 32768
v = np.pad(v, (0, max(0, N - len(v))))[:N]
v = hp(v, 70)
v = v + .18 * bp(v, 2500, 5500)                                          # presencia
e = np.sqrt(np.maximum(lp(v ** 2, 8), 0)); g = 1 / np.maximum(1, (e / .08) ** .5)      # compresor 3:1 aprox.
v = v * g
irn = int(1.2 * SR); xi = np.arange(irn) / SR
ir = lp(rng.standard_normal(irn) * np.exp(-xi * 5), 4000); ir /= np.sqrt((ir ** 2).sum())
vr = v + fftconvolve(v, ir)[:N] * .10
V = np.stack([vr, vr])

# ---- ducking: la música baja cuando habla Damián ----
ve = lp(np.abs(v), 3); ve = ve / (ve.max() + 1e-9)
duck = 1 - .55 * np.clip(lp(np.clip(ve * 6, 0, 1), 2), 0, 1)
Vn = V / (np.abs(V).max() + 1e-9) * .95
Mn = M / (np.abs(M).max() + 1e-9) * .55 * duck
Xn = X / (np.abs(X).max() + 1e-9) * .62 * (1 - .35 * (duck < .8))
mix = Vn + Mn + Xn
mix = hp(mix, 25)
fade = env(0, DUR, .05, 1.2); mix *= fade
pk = np.abs(mix).max()
mix = np.tanh(mix / pk * 1.4) / np.tanh(1.4) * .9
wavfile.write(sys.argv[1], SR, (mix.T * 32767).astype(np.int16))
print('ok', sys.argv[1], round(DUR, 2), 's')
