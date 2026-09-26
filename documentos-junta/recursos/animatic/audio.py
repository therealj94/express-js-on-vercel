#!/usr/bin/env python3
"""Banda sonora del animatic «Pésalo»: todo sintetizado, siguiendo la sección 8.5 del Documento 9.
Primera mitad sin instrumentos (monedas, teclas, relé, cama de graves); silencio; pico en la roca;
percusión humana de seis golpes; corte un fotograma antes del impacto del plato."""
import numpy as np, wave, pathlib
from scipy import signal

SR = 48000
DUR = 120.0
N = int(SR * DUR)
rng = np.random.default_rng(55)
L = np.zeros(N); R = np.zeros(N)
MUS_L = np.zeros(N); MUS_R = np.zeros(N)   # bus de música (para poder cortarlo seco)

def t(n): return np.arange(n) / SR
def env_exp(n, tau): return np.exp(-t(n) / tau)
def ruido(n): return rng.standard_normal(n)
def bp(x, lo, hi, orden=2):
    b, a = signal.butter(orden, [lo / (SR/2), min(hi / (SR/2), 0.999)], 'band'); return signal.lfilter(b, a, x)
def lp(x, f, orden=2):
    b, a = signal.butter(orden, f / (SR/2), 'low'); return signal.lfilter(b, a, x)
def hp(x, f, orden=2):
    b, a = signal.butter(orden, f / (SR/2), 'high'); return signal.lfilter(b, a, x)

def poner(t0, x, g=1.0, pan=0.0, bus='fx'):
    i = int(t0 * SR)
    if i >= N or i + len(x) <= 0: return
    x = x[: N - i] * g
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    if bus == 'mus':
        MUS_L[i:i+len(x)] += x * gl; MUS_R[i:i+len(x)] += x * gr
    else:
        L[i:i+len(x)] += x * gl; R[i:i+len(x)] += x * gr

def reverb(x, seg=2.0, mezcla=0.5, brillo=4000):
    n = int(seg * SR); ir = ruido(n) * env_exp(n, seg / 5); ir = lp(ir, brillo); ir /= np.abs(ir).sum() ** 0.5 * 6
    y = signal.fftconvolve(x, ir)[: len(x) + n]
    out = np.zeros(len(y)); out[: len(x)] += x * (1 - mezcla); out += y * mezcla * 4
    return out

def metal(parciales, dur, tau, g=1.0):
    n = int(dur * SR); tt = t(n); x = np.zeros(n)
    for k, (f, a) in enumerate(parciales):
        x += a * np.sin(2 * np.pi * f * tt + k) * np.exp(-tt / (tau * (1.0 - 0.12 * k)))
    x += bp(ruido(n), 2000, 9000) * env_exp(n, 0.004) * 0.4
    return x * g

def golpe(f0, f1, dur, tau, ruido_g=0.3, ruido_banda=(800, 5000)):
    n = int(dur * SR); tt = t(n)
    f = f1 + (f0 - f1) * np.exp(-tt / 0.03)
    fase = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(fase) * np.exp(-tt / tau)
    x += bp(ruido(n), *ruido_banda) * env_exp(n, 0.012) * ruido_g
    return x

def rele():
    n = int(0.05 * SR)
    return hp(ruido(n), 1500) * env_exp(n, 0.0025) * 0.9 + np.sin(2*np.pi*2100*t(n)) * env_exp(n, 0.006) * 0.35

def moneda_madera():
    x = golpe(210, 160, 0.25, 0.06, 0.5, (1500, 6000))
    x[: int(0.12*SR)] += metal([(3800, .5), (5200, .35), (6900, .2)], 0.12, 0.03)
    return x

def pad_ruido(dur, lo, hi, g, ataque=0.02, caida=0.02):
    n = int(dur * SR); x = bp(ruido(n), lo, hi)
    e = np.ones(n); a = int(ataque*SR); c = int(caida*SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if c: e[-c:] = np.linspace(1, 0, c)
    return x * e * g

# ---------- BLOQUE 1 · 0–8 s ----------
poner(0.0, metal([(1210, 1), (1873, .7), (2690, .5), (3450, .35), (4480, .2)], 0.9, 0.18, 0.55))       # el fiel disparado
for k in range(5):  # traqueteo del fiel
    poner(0.06 + k * 0.045, metal([(2400 + 90*k, .5), (3900, .3)], 0.05, 0.01, 0.25 / (k + 1)))
caras = [(0.5, 2.3, (300, 2500)), (2.3, 4.1, (150, 1800)), (4.1, 5.9, (400, 4000)), (5.9, 7.7, (200, 3000))]
for i, (a, b, banda) in enumerate(caras):   # tono de cada lugar, cortado seco en cada cambio
    x = pad_ruido(b - a - 0.2, *banda, 0.035, 0.005, 0.0)      # 4-6 fotogramas de silencio duro al final
    poner(a, x, pan=(-0.3 + 0.2*i))
# cama de sub-graves desde el segundo 3, un escalón por era
n = int((32.0 - 3.0) * SR); tt = t(n)
nivel = np.interp(tt + 3.0, [3, 8, 13, 17, 23, 28, 32], [0, .08, .12, .17, .23, .30, .34])
cama = (np.sin(2*np.pi*41*tt) + 0.6*np.sin(2*np.pi*55*tt + 1) + 0.25*np.sin(2*np.pi*82*tt)) * nivel
cama += lp(ruido(n), 120) * nivel * 0.5
poner(3.0, cama * 0.9)
# el relé: clic en el uno de cada compás de diez segundos
for s in (6.0, 16.0, 26.0):
    poner(s, rele(), 0.8, 0.25)

# ---------- BLOQUE 2 · la regla, 8–13 ----------
poner(8.0, pad_ruido(5.0, 250, 3500, 0.03, 0.05, 0.02))                      # mercado adentro
for k in range(26):
    poner(8.0 + rng.uniform(0, 4.8), bp(ruido(int(.08*SR)), 1500, 5000) * env_exp(int(.08*SR), .015) * rng.uniform(.02, .06), pan=rng.uniform(-.8, .8))
poner(8.45, metal([(640, 1), (1010, .6), (1590, .4)], 0.8, 0.12, 0.4), pan=-0.2)   # pesa de hierro, plato izq.
poner(9.35, metal([(610, 1), (980, .6), (1520, .4)], 0.8, 0.12, 0.4), pan=0.2)     # pesa de hierro, plato der.
poner(9.5, metal([(2300, .6), (3100, .4)], 0.5, 0.05, 0.12))                       # cadena asentándose
poner(10.9, bp(ruido(int(.35*SR)), 1200, 7000) * env_exp(int(.35*SR), .08) * 0.18)  # el papel doblado

# ---------- ERAS · 13–32: el pulso de monedas sobre madera ----------
def pulso(a, b, bpm, g):
    paso = 60.0 / bpm; s = a
    while s < b - 1e-6:
        poner(s, moneda_madera(), g, rng.uniform(-.2, .2)); s += paso
pulso(13.0, 17.0, 60, 0.45); pulso(17.0, 23.0, 92, 0.5); pulso(23.0, 28.0, 120, 0.55); pulso(28.0, 32.0, 140, 0.6)
# era uno: ventilador y teclas duras
poner(13.0, pad_ruido(4.0, 90, 600, 0.05, .01, 0))
for k in range(22):
    poner(13.0 + rng.uniform(0, 3.9), golpe(900, 700, .05, .012, .8, (2000, 7000)), 0.12, rng.uniform(-.5, .5))
# era dos: fotocopiadora, sellos, notificaciones que se vuelven enjambre, obturadores
for s in np.arange(17.1, 23.0, 0.72):
    n = int(.6*SR); sweep = bp(ruido(n), 300, 2500) * np.sin(np.linspace(0, np.pi, n)) * 0.09
    poner(s, sweep, pan=-0.4)
dens = np.linspace(17.0, 23.0, 40) ** 1.0
for k, s in enumerate(sorted(rng.uniform(17.2, 23.0, 46) ** 1)):
    f = rng.choice([1320, 1568, 1760, 2093]); n = int(.09*SR)
    poner(s, np.sin(2*np.pi*f*t(n)) * env_exp(n, .03) * 0.07 * (0.5 + k/46), pan=rng.uniform(-.9, .9))
for s in (18.2, 19.7, 21.1, 22.3):
    poner(s, hp(ruido(int(.04*SR)), 2500) * env_exp(int(.04*SR), .006) * 0.25)
# era tres: fiesta oída desde otro cuarto, vibración de teléfono
n = int(5.0*SR); tt = t(n); fiesta = np.zeros(n)
for s in np.arange(0, 5.0, 60/124):
    i = int(s*SR); m = min(int(.2*SR), n-i); fiesta[i:i+m] += np.sin(2*np.pi*55*t(m)) * env_exp(m, .08)
fiesta += (np.sin(2*np.pi*220*tt) + np.sin(2*np.pi*277*tt) + np.sin(2*np.pi*330*tt)) * 0.08 * (1 + np.sin(2*np.pi*2.07*tt)) / 2
poner(23.0, lp(fiesta, 320) * 0.35, pan=0.3)
for s in (23.6, 24.9, 26.2, 27.3):
    n = int(.45*SR); zz = signal.square(2*np.pi*150*t(n)) * 0.5 * (np.sin(2*np.pi*14*t(n)) > 0)
    poner(s, lp(zz, 900) * 0.08, pan=-0.5)
# era cuatro: aire acondicionado y un tono que no resuelve
n = int(4.0*SR); tt = t(n)
poner(28.0, (lp(ruido(n), 400) * 0.12 + (np.sin(2*np.pi*440*tt) + np.sin(2*np.pi*446.5*tt)) * 0.025))
# el pulso se corta a mitad de compás en el 32,0 (ya cortado arriba), y el relé calla con él

# ---------- BLOQUE 7 · CERO, 32–34,5 ----------
for k, s in enumerate(np.arange(32.05, 33.9, 0.23)):     # la cadena de la balanza terminando de asentarse
    poner(s, metal([(2600 + 40*k, .5), (3700, .3)], 0.3, 0.05, 0.08 * (1 - k/9)))
n = int(2.4*SR); poner(32.05, np.sin(2*np.pi*35*t(n)) * np.linspace(.12, 0, n))   # sub a 35 Hz

# ---------- BLOQUE 8 · el segundo aire, 34,5–40 ----------
def pico():
    x = golpe(160, 60, 0.6, 0.12, 1.4, (900, 6000))
    x[: int(.3*SR)] += metal([(1850, .8), (2710, .6), (3960, .4)], .3, .04, .6)
    return reverb(x, 3.2, 0.55, 3000)
poner(34.6, pico(), 0.9, -0.1); poner(35.45, pico(), 0.8, 0.12)
for s in np.arange(35.9, 40.0, 1.35):    # goteo
    n = int(.12*SR); f = np.linspace(2200, 1500, n)
    poner(s, reverb(np.sin(2*np.pi*np.cumsum(f)/SR) * env_exp(n, .03) * 0.08, 1.5, .5), pan=rng.uniform(-.6, .6))
n = int(4.5*SR); tt = t(n)
poner(35.6, lp(ruido(n), 700) * (0.5 + 0.5*np.sin(2*np.pi*0.28*tt - 1.5)) * 0.05)   # respiración en el casco
poner(39.5, rele(), 0.7, 0.25)

# ---------- MÚSICA · 39,5–111,96 ----------
def chelo(f, dur, g, ataque=1.5):
    n = int(dur*SR); tt = t(n)
    vib = 1 + 0.003*np.sin(2*np.pi*5*tt)
    fase = 2*np.pi*np.cumsum(f*vib)/SR
    x = signal.sawtooth(fase) + 0.4*signal.sawtooth(2*fase)
    x = lp(x, 900); e = np.minimum(1, tt/ataque)
    return x * e * g
poner(39.5, chelo(73.42, 72.46, 0.10), bus='mus')                   # re grave, una sola nota larga
poner(66.0, chelo(110.0, 45.96, 0.06, 2.0), pan=0.2, bus='mus')     # la quinta entra con los oficios
def coro(fs, dur, g, ataque=2.0):
    n = int(dur*SR); tt = t(n); x = np.zeros(n)
    for f in fs:
        for d in (-0.4, 0.0, 0.5):
            x += signal.sawtooth(2*np.pi*(f + d)*tt + rng.uniform(0, 6))
    y = bp(x, 650, 950) * 1.0 + bp(x, 1050, 1300) * 0.6 + bp(x, 2600, 3100) * 0.25   # vocal «a»
    return y * np.minimum(1, tt/ataque) * g
poner(74.4, coro([146.83, 174.61, 220.0], 30.6, 0.05), bus='mus')           # re menor
poner(105.0, coro([146.83, 185.0, 220.0], 6.96, 0.06, 1.0), bus='mus')      # re mayor antes del golpe

def bombo():  return golpe(95, 50, .7, .22, .25, (300, 1500))
def cajon():  x = golpe(120, 75, .3, .07, .6, (1500, 5000)); return x
def surdo():  return golpe(75, 55, .9, .3, .2, (200, 900))
def tambora(): return golpe(190, 140, .25, .06, .7, (1200, 6000))
def zapateo(): return bp(ruido(int(.05*SR)), 2000, 7000) * env_exp(int(.05*SR), .008)
def pico_seco(): return golpe(150, 70, .3, .05, 1.0, (1000, 6000))
def figura(a, b, bpm, capas, g=1.0):
    paso = 60.0 / bpm / 4; s = a; k = 0
    while s < b - 1e-6:
        st = k % 16
        if 'pico' in capas and st == 0: poner(s, pico_seco(), .45*g, -.1, 'mus')
        if 'bombo' in capas and st in (0, 10): poner(s, bombo(), .55*g, 0, 'mus')
        if 'surdo' in capas and st == 8: poner(s, surdo(), .5*g, .15, 'mus')
        if 'cajon' in capas and st in (4, 12): poner(s, cajon(), .4*g, -.25, 'mus')
        if 'cajon' in capas and st in (7, 15): poner(s, cajon(), .12*g, -.25, 'mus')
        if 'tambora' in capas and st in (3, 6, 11, 14): poner(s, tambora(), .22*g, .3, 'mus')
        if 'zapateo' in capas: poner(s, zapateo(), (.14 if st % 4 == 0 else .06)*g, .4, 'mus')
        s += paso; k += 1
figura(40.0, 44.0, 84, {'pico', 'bombo'})
figura(44.0, 48.0, 84, {'pico', 'bombo', 'cajon'})
figura(48.0, 51.0, 84, {'pico', 'bombo', 'cajon', 'surdo'})
figura(51.0, 55.0, 84, {'pico', 'bombo', 'cajon', 'surdo', 'tambora'})
figura(55.0, 59.0, 84, {'pico', 'bombo', 'cajon', 'surdo', 'tambora', 'zapateo'})
figura(59.0, 61.5, 84, {'bombo'}, 0.35)                                   # se bajan las capas en el gesto
figura(61.5, 66.0, 84, {'pico', 'bombo', 'cajon', 'surdo', 'tambora', 'zapateo'})
figura(66.0, 83.0, 96, {'pico', 'bombo', 'cajon', 'surdo', 'tambora', 'zapateo'})    # único escalón, 84 → 96
figura(83.0, 99.0, 96, {'bombo', 'cajon', 'surdo', 'zapateo'}, 0.55)
figura(99.0, 105.0, 96, {'bombo', 'surdo'}, 0.35)
figura(105.0, 111.95, 96, {'pico', 'bombo', 'cajon', 'surdo', 'tambora', 'zapateo'}, 0.9)
# golpes de oficio en el relevo (1:06–1:14,4), cada uno en su subdivisión
for i, s in enumerate([66.0 + 1.4*j for j in range(6)]):
    poner(s + (i % 3) * 0.078, [golpe(400, 300, .15, .03, 1.0, (3000, 9000)), metal([(900, .6), (1400, .4)], .2, .04),
          golpe(90, 70, .4, .1, .3), golpe(220, 180, .2, .05, .6), pico_seco(), golpe(1200, 1000, .06, .01, .9, (3000, 8000))][i], .3, 0, 'mus')

# ---------- efectos de la segunda mitad ----------
poner(40.0, pad_ruido(11.0, 80, 900, .03, .5, .5))                            # el foso
poner(49.0, np.sin(2*np.pi*2800*t(int(.14*SR))) * 0.06)                          # bip de la balanza de precisión
poner(51.0, pad_ruido(4.0, 120, 1400, .05, .2, .1), pan=.1)                       # ventiladores de rack
poner(51.25, rele(), 0.8, -0.2)                                                     # el relé de la sala
poner(55.0, pad_ruido(11.0, 100, 700, .02, .3, .3))                                # oficina
n = int(.06*SR); clic = hp(ruido(n), 1500) * env_exp(n, .004)
clic_grave = signal.resample(clic, n * 4)                                           # dos octavas abajo
g_ = golpe(70, 45, .8, .25, 0); g_[:len(clic_grave)] += clic_grave * 1.2
poner(60.0, reverb(g_, 1.2, .35), 0.9)  # RECHAZAR
poner(63.6, hp(ruido(n), 1500) * env_exp(n, .004) * 0.35)                          # aprueba el siguiente
poner(83.0, pad_ruido(22.0, 250, 3500, .03, .5, .5))                               # mercado en el mostrador
for k in range(40):
    poner(83.0 + rng.uniform(0, 21.5), bp(ruido(int(.08*SR)), 1500, 5000) * env_exp(int(.08*SR), .015) * rng.uniform(.02, .05), pan=rng.uniform(-.8, .8))
poner(91.0, np.sin(2*np.pi*2800*t(int(.14*SR))) * 0.06)                           # bip de la balanza
poner(93.5, bp(ruido(int(.4*SR)), 1200, 7000) * env_exp(int(.4*SR), .1) * 0.2)     # papel
poner(95.0, golpe(140, 90, .3, .05, .9, (800, 4000)), 0.6)                         # el sello
poner(99.0, bp(ruido(int(.5*SR)), 1000, 6000) * env_exp(int(.5*SR), .12) * 0.12)  # la mano cerrándose
poner(105.0, pad_ruido(7.0, 250, 3500, .025, .3, 0))
for k in range(6):
    poner(108.6 + k*0.55, metal([(2400 + 50*k, .5), (3300, .3)], .25, .04, .07))     # la cadena se tensa

# el bus de música se corta un fotograma antes del impacto
corte = int((112.0 - 1/24) * SR)
MUS_L[corte:] = 0; MUS_R[corte:] = 0

# ---------- EL IMPACTO · 1:52 ----------
parciales = [(220, 1), (347, .8), (512, .6), (781, .45), (1105, .3)]
bajado = [(f / 4, a) for f, a in parciales]                      # dos octavas abajo
imp = metal(bajado, 3.0, 0.9, 1.0); _g = golpe(70, 38, 2.0, .5, .4, (100, 2000)); imp[:len(_g)] += _g
imp3 = np.zeros(len(imp) + int(.01*SR))
for d in (0, .003, .006):
    i = int(d*SR); imp3[i:i+len(imp)] += imp / 2.2
poner(112.0, reverb(imp3, 3.0, .35, 2500), 1.0)
for k in range(2):   # el fiel oscila dos veces y se clava
    poner(112.35 + k*0.42, metal([(1210, .5), (1873, .35)], .3, .06, .12 / (k+1)))
poner(117.6, metal([(2600, .5), (3700, .3), (5100, .2)], .8, .15, .09))   # último tintineo sobre el negro

# ---------- mezcla ----------
Lf = L + MUS_L * 1.0; Rf = R + MUS_R * 1.0
Lf[int(119.95*SR):] = 0; Rf[int(119.95*SR):] = 0           # corte a seco, sin cola
pico_max = max(np.abs(Lf).max(), np.abs(Rf).max())
Lf = np.tanh(Lf / pico_max * 1.25) / np.tanh(1.25) * 0.89; Rf = np.tanh(Rf / pico_max * 1.25) / np.tanh(1.25) * 0.89
estereo = np.stack([Lf, Rf], axis=1)
salida = pathlib.Path(__file__).parent / 'banda.wav'
with wave.open(str(salida), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((estereo * 32767).astype('<i2').tobytes())
print('banda.wav', round(DUR, 2), 's · pico', round(float(np.abs(estereo).max()), 3))
