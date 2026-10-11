"""Programa una base de punta garífuna golpe a golpe sobre la rejilla del jingle (v2C: 112,0 BPM, B0 = -0,012 s).
Escribe perc.wav (estéreo 48 kHz). Intensidad por sección: gancho suave, caída y coro a pleno."""
import numpy as np, subprocess, random, json
SR = 48000; BEAT = 0.5357; B0 = -0.012; DUR = 33.6; S16 = BEAT / 4
def carga(f):
    a = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '2', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True).stdout, np.int16).astype(np.float32) / 32768
    a = a.reshape(-1, 2)
    # recorta el silencio inicial para que el golpe caiga exacto
    e = np.abs(a).max(1)
    if e.max() < 10 ** (-40 / 20): return None          # variantes casi mudas: se descartan
    i0 = int(np.argmax(e > e.max() * .08)); a = a[max(0, i0 - 24):]
    f = np.ones(len(a), np.float32); n = min(len(a), int(.012 * SR)); f[-n:] = np.linspace(1, 0, n)   # cola sin clic
    return a / np.abs(a).max() * f[:, None]
import os
M = {n: [x for x in (carga(f'perc/{n}_{v}.mp3') for v in 'abc' if os.path.exists(f'perc/{n}_{v}.mp3')) if x is not None] for n in ['segunda', 'primero_abierto', 'primero_tapado', 'maraca', 'shaker', 'tortuga']}
print({k: len(v) for k, v in M.items()})
grito = carga('perc/grito_a.mp3')
out = np.zeros((int(DUR * SR) + SR, 2), np.float32)
random.seed(7)
def pon(n, t, g, pan=0):
    s = random.choice(M[n]); t += random.uniform(-.006, .006); i = int(t * SR)
    if i < 0: return
    j = min(len(out), i + len(s)); g *= random.uniform(.85, 1.05)
    out[i:j, 0] += s[:j - i, 0] * g * (1 - max(0, pan)); out[i:j, 1] += s[:j - i, 1] * g * (1 + min(0, pan))
def nivel(t):  # intensidad por sección (0..1)
    if t < 8.0: return .45
    if t < 12.9: return 1.0      # caída instrumental
    if t < 21.9: return .6       # verso
    if t < 32.4: return 1.0      # coro
    return 0
# patrón de un compás en semicorcheas (16 pasos)
SEG = {0: 1, 3: .7, 6: .8, 8: 1, 11: .7, 14: .8}             # segunda: 3-3-2 (tresillo)
PRI = {2: .8, 5: .6, 10: .8, 13: .6}                         # primero abierto
TAP = {7: .5, 15: .5}
TOR = {4: .5, 12: .5}
nb = int(DUR / BEAT / 4) + 1
for bar in range(nb):
    t0 = B0 + bar * 4 * BEAT
    for st in range(16):
        t = t0 + st * S16; L = nivel(t)
        if L <= 0 or t < 0: continue
        if st in SEG: pon('segunda', t, 1.0 * SEG[st] * (.6 + .4 * L))
        if L >= .6:
            if st in PRI: pon('primero_abierto', t, .7 * PRI[st] * L, pan=.35)
            if st in TAP: pon('primero_tapado', t, .6 * TAP[st] * L, pan=.35)
            if st in TOR: pon('tortuga', t, .45 * L, pan=-.4)
        if st % 2 == 1: pon('maraca', t, .35 * (.5 + .5 * L), pan=-.25)
        if L >= 1 and st % 2 == 0: pon('shaker', t, .18, pan=.2)
        # repiques del primero en el último tiempo de cada compás a pleno (llamado)
        if L >= 1 and bar % 2 == 1 and st in (12, 13, 14, 15): pon('primero_abierto', t, .55 + .1 * (st - 12), pan=.35)
pon_grito = [8.05, 21.95]
for tg in pon_grito:
    i = int(tg * SR); j = min(len(out), i + len(grito)); out[i:j] += grito[:j - i] * .5
out = out[:int(DUR * SR)]
pk = np.abs(out).max(); out = out / pk * .9
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', 'perc.wav'], input=out.astype(np.float32).tobytes())
print('perc.wav', DUR, 'pico', pk)
