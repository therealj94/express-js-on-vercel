#!/usr/bin/env python3
"""Voces provisionales del animatic: Piper (acentos de México, Argentina, España y Brasil) y Kokoro.
Todo corre local, sin cuenta. Cada personaje tiene su voz; ninguna se repite entre personajes."""
import numpy as np, pathlib, json, wave, io
from scipy import signal
AQUI = pathlib.Path(__file__).parent; M = AQUI / 'tts'; OUT = AQUI / 'voz'; OUT.mkdir(exist_ok=True)
SR = 48000

from kokoro_onnx import Kokoro
K = Kokoro(str(M / 'kokoro-v1.0.onnx'), str(M / 'voices-v1.0.bin'))
from piper import PiperVoice
_piper = {}
def piper(modelo, texto, velocidad=1.0, speaker=None):
    if modelo not in _piper: _piper[modelo] = PiperVoice.load(str(M / f'{modelo}.onnx'))
    v = _piper[modelo]
    try:
        from piper import SynthesisConfig
        cfg = SynthesisConfig(length_scale=1.0/velocidad, speaker_id=speaker, noise_scale=0.6, noise_w_scale=0.7)
        trozos = list(v.synthesize(texto, syn_config=cfg))
        x = np.concatenate([c.audio_float_array for c in trozos]); sr = trozos[0].sample_rate
    except ImportError:
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as w: v.synthesize(texto, w, length_scale=1.0/velocidad, speaker_id=speaker)
        buf.seek(0)
        with wave.open(buf) as w: sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2') / 32768
    return x.astype(np.float64), sr

def kokoro(voz, texto, velocidad=1.0, lang='es'):
    if isinstance(voz, tuple):   # mezcla de estilos: nueva voz
        estilo = sum(K.get_voice_style(n) * p for n, p in voz)
    else:
        estilo = voz
    x, sr = K.create(texto, voice=estilo, speed=velocidad, lang=lang)
    return np.asarray(x, np.float64), sr

def a48(x, sr):
    from math import gcd
    g = gcd(SR, sr); return signal.resample_poly(x, SR // g, sr // g)
def tono(x, semitonos):
    """Baja o sube el tono remuestreando (cambia también la duración, como una cinta)."""
    if not semitonos: return x
    r = 2 ** (semitonos / 12.0)
    return signal.resample(x, int(len(x) / r))
def limpiar(x):
    x = x - np.mean(x)
    umbral = 0.02 * np.abs(x).max()
    idx = np.where(np.abs(x) > umbral)[0]
    if len(idx): x = x[max(0, idx[0] - int(0.02*SR)): idx[-1] + int(0.08*SR)]
    n = int(0.01*SR); x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n)
    rms = np.sqrt(np.mean(x**2)) + 1e-9
    return x / rms * 0.1

# reparto: cada personaje, una voz
REPARTO = {   # elegido por casting automático: el reconocedor entiende al 100 % cada voz (ver casting.py)
 'repartidor':  lambda t: kokoro('em_alex', t, 1.0, 'es-419'),
 'enfermera':   lambda t: kokoro((('ef_dora', .55), ('af_heart', .45)), t, 0.95, 'es-419'),
 'estudiante':  lambda t: kokoro((('ef_dora', .6), ('af_nicole', .4)), t, 0.95, 'es-419'),
 'costurera':   lambda t: kokoro('pf_dora', t, 1.0, 'pt-br'),
 'vendedora':   lambda t: kokoro('ef_dora', t, 0.92, 'es-419'),
 'barbero':     lambda t: piper('es_MX-claude-high', t, 1.0),
 'minero':      lambda t: kokoro('em_alex', t, 0.86, 'es-419'),
 'operadora':   lambda t: kokoro('ef_dora', t, 0.95, 'es-419'),
 'ingeniera':   lambda t: kokoro((('pf_dora', 0.6), ('af_nicole', 0.4)), t, 1.0, 'pt-br'),
 'cumplimiento':lambda t: kokoro('em_santa', t, 0.95, 'es-419'),
}
TONO = {'vendedora': -1.5, 'minero': -2.5, 'cumplimiento': -1.0, 'ingeniera': +1.0, 'operadora': +1.0}

LINEAS = [
 (1, 'repartidor', 'Metí la plata del alquiler.'),
 (2, 'enfermera', 'Metí el aguinaldo.'),
 (3, 'estudiante', 'Metí la quincena.'),
 (4, 'costurera', 'Botei o salário. Ninguém me avisou.'),
 (5, 'vendedora', 'Un gramo pesa igual en todas partes.'),
 (6, 'vendedora', 'Pésalo.'),
 (7, 'barbero', 'Al principio no pedían nada.'),
 (8, 'estudiante', 'Después pidieron mi cara.'),
 (9, 'estudiante', 'Nadie me explicó nada.'),
 (10, 'costurera', 'Disseram que dobrava.'),
 (11, 'enfermera', 'La siguiente ni llegó.'),
 (111, 'vendedora', 'La siguiente ni llegó.'),
 (12, 'minero', 'No nos faltó coraje. Nos faltó peso.'),
 (13, 'minero', 'Esto sale de acá.'),
 (14, 'operadora', 'Un gramo, partido en cincuenta y cinco.'),
 (15, 'operadora', 'Eso es un Origen.'),
 (16, 'ingeniera', 'São sete máquinas nossas.'),
 (17, 'ingeniera', 'Origen se move sem taxa de rede.'),
 (18, 'estudiante', 'No la doy en cada aplicación.'),
 (19, 'estudiante', 'Me revisó una persona.'),
 (20, 'cumplimiento', 'Nadie se aprueba solo.'),
 (21, 'repartidor', 'Reparto.'),
 (22, 'vendedora', 'Vendo verdura.'),
 (23, 'costurera', 'Eu costuro.'),
 (24, 'barbero', 'Corto pelo.'),
 (25, 'operadora', 'Peso oro.'),
 (26, 'minero', 'Saco piedra.'),
 (31, 'repartidor', 'Esta vez lo pesé.'),
 (32, 'vendedora', 'No te pedimos que creas.'),
 (33, 'vendedora', 'Pésalo.'),
]
CORO = ['vendedora', 'repartidor', 'estudiante', 'enfermera', 'barbero', 'minero']

dur = {}
for n, quien, texto in LINEAS:
    x, sr = REPARTO[quien](texto); x = tono(a48(x, sr), TONO.get(quien, 0)); x = limpiar(x)
    np.save(OUT / f'{n:03d}.npy', x); dur[n] = round(len(x) / SR, 2)
    print(f'{n:3d} {quien:12} {dur[n]:5.2f} s  {texto}', flush=True)
# el unísono: seis voces a la vez, cinco en español y la costurera en portugués
partes = []
for quien in CORO:
    x, sr = REPARTO[quien]('Un gramo pesa igual en todas partes.'); partes.append(limpiar(tono(a48(x, sr), TONO.get(quien, 0))))
x, sr = REPARTO['costurera']('Um grama pesa igual em todo lugar.'); partes.append(limpiar(a48(x, sr)))
largo = len(partes[0]); coro = np.zeros(largo)
for i, p in enumerate(partes):
    p = signal.resample(p, largo) if abs(len(p) - largo) < 0.3*largo else np.pad(p, (0, max(0, largo - len(p))))[:largo]
    coro += p * (1.0 if i == 0 else 0.5)
coro = limpiar(coro); np.save(OUT / '030.npy', coro); dur[30] = round(len(coro) / SR, 2)
print(' 30 coro         ', dur[30], 's')
json.dump(dur, open(OUT / 'duraciones.json', 'w'), indent=1)
