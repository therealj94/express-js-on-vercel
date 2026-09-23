"""Corta la toma de voz en 13 frases y las vuelve a espaciar con pausas de cine.

Salida: voz.wav (48 kHz mono) y tiempos.json con el inicio de cada frase y de
las palabras clave en la línea de tiempo final. Uso: python3 construir_voz.py
"""
import json, re, subprocess, unicodedata
from pathlib import Path
import numpy as np
from scipy.io import wavfile

AQUI = Path(__file__).resolve().parent
FFMPEG = '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2'
SR = 48000
subprocess.run([FFMPEG, '-loglevel', 'error', '-y', '-i', str(AQUI / 'voz-zabra-tomaA.mp3'), '-ac', '1', '-ar', str(SR), '/tmp/voz-toma.wav'], check=True)
_, x = wavfile.read('/tmp/voz-toma.wav'); x = x.astype(np.float64) / 32768

norm = lambda s: re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())
W = [(norm(w), s, e) for w, s, e in json.load(open(AQUI / 'palabras.json'))]

INICIOS = [['somos'], ['20', 'paises'], ['mandar'], ['y', 'si', 'todos'], ['una', 'que'], ['toma'], ['cada', 'parte'],
           ['si', 'el', 'oro'], ['un', 'comerciante'], ['y', 'si', 'dejamos'], ['nos', 'convertimos'], ['origen', 'de']]
idx, i = [], 0
for st in INICIOS:
    while [W[i + k][0] for k in range(len(st))] != st: i += 1
    idx.append(i); i += 1
idx.append(next(j for j in range(len(W)) if W[j][0].startswith('conos')))

# corte en el punto más silencioso entre frases
ven = int(.02 * SR)
energia = np.sqrt(np.convolve(x ** 2, np.ones(ven) / ven, 'same'))
def corte(a, b):
    ia, ib = int(a * SR), max(int(b * SR), int(a * SR) + 1)
    return (ia + int(np.argmin(energia[ia:ib]))) / SR
bordes = [0.0]
for k in range(1, len(idx)):
    bordes.append(corte(W[idx[k] - 1][2], W[idx[k]][1]))
bordes.append(len(x) / SR)

# pausa antes de cada frase (s): respiración de tráiler
INTRO = 2.2
PAUSAS = [INTRO, .6, .8, 1.1, .7, .9, .7, 1.0, .9, 1.0, .5, 1.3, .8]
COLA = 6.5
salida = []; t = 0.0; tiempos = {'frases': [], 'palabras': {}}
for k in range(len(idx)):
    a, b = bordes[k], bordes[k + 1]
    seg = x[int(a * SR):int(b * SR)].copy()
    f = int(.012 * SR); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
    salida.append(np.zeros(int(PAUSAS[k] * SR))); t += PAUSAS[k]
    desfase = t - a
    fin_palabras = (idx[k + 1] if k + 1 < len(idx) else len(W))
    tiempos['frases'].append({'n': k + 1, 'ini': round(W[idx[k]][1] + desfase, 3), 'fin': round(W[fin_palabras - 1][2] + desfase, 3)})
    for j in range(idx[k], fin_palabras):
        tiempos['palabras'].setdefault(W[j][0], []).append(round(W[j][1] + desfase, 3))
    salida.append(seg); t += len(seg) / SR
salida.append(np.zeros(int(COLA * SR))); t += COLA
voz = np.concatenate(salida)
tiempos['palabras'].setdefault('gramo', tiempos['palabras'].get('gramos'))
tiempos['duracion'] = round(len(voz) / SR, 3)
wavfile.write(AQUI / 'voz.wav', SR, (np.clip(voz, -1, 1) * 32767).astype(np.int16))
json.dump(tiempos, open(AQUI / 'tiempos.json', 'w'), ensure_ascii=False, indent=1)
print('duración', tiempos['duracion'])
for f in tiempos['frases']: print(f)
