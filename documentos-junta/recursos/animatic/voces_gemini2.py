#!/usr/bin/env python3
"""Segunda pasada de voces Gemini: indicaciones cortas (no se leen en voz alta), ritmo pausado, cambio de modelo
si uno se satura, y control inmediato de duración y de lo que oye el reconocedor; si falla, se repite."""
import json, base64, urllib.request, urllib.error, pathlib, time, io, wave, sys, re, unicodedata
import numpy as np
from scipy import signal
from faster_whisper import WhisperModel
AQUI = pathlib.Path(__file__).parent; OUT = AQUI / 'voz'
KEY = (AQUI.parent / '.gk').read_text().strip(); SR = 48000
MODELOS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-lite-tts']
bloqueado = {}
W = WhisperModel('small', device='cpu', compute_type='int8')
def log(*a): print(*a, flush=True)

def tts(texto, voz):
    for vuelta in range(12):
        for modelo in MODELOS:
            if bloqueado.get(modelo, 0) > time.time(): continue
            cuerpo = {"contents": [{"parts": [{"text": texto}]}], "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}}}}}
            req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent', data=json.dumps(cuerpo).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
            try:
                with urllib.request.urlopen(req, timeout=180) as r: d = json.load(r)
                raw = base64.b64decode(d['candidates'][0]['content']['parts'][0]['inlineData']['data'])
                if raw[:4] == b'RIFF':
                    with wave.open(io.BytesIO(raw)) as w: sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2') / 32768
                else: sr = 24000; x = np.frombuffer(raw, '<i2') / 32768
                time.sleep(7)              # ritmo pausado
                return x.astype(np.float64), sr, modelo
            except urllib.error.HTTPError as e:
                e.read()
                if e.code == 429: bloqueado[modelo] = time.time() + 75; log(f'     {modelo} saturado, paso al siguiente'); continue
                if e.code in (500, 503): time.sleep(10); continue
                raise
            except (KeyError, IndexError): time.sleep(5); continue
        espera = min(bloqueado.values()) - time.time() + 1 if bloqueado else 30
        log(f'     todos saturados, espero {int(max(espera, 5))} s'); time.sleep(max(espera, 5))
    raise RuntimeError('sin cuota')

def a48(x, sr):
    from math import gcd
    g = gcd(SR, sr); return signal.resample_poly(x, SR // g, sr // g)
def limpiar(x):
    x = x - np.mean(x); umbral = 0.03 * np.abs(x).max(); idx = np.where(np.abs(x) > umbral)[0]
    if len(idx): x = x[max(0, idx[0] - int(0.02*SR)): idx[-1] + int(0.10*SR)]
    n = int(0.01*SR); x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n)
    return x / (np.sqrt(np.mean(x**2)) + 1e-9) * 0.1
def norm(s): s = unicodedata.normalize('NFD', s.lower()); return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).split()
EQ = {'55': ['cincuenta', 'y', 'cinco'], 'bendo': ['vendo'], 'origem': ['origen'], 'pc': ['pese']}
def oido(x, lang):
    x16 = signal.resample_poly(np.pad(x / (np.abs(x).max() + 1e-9) * .9, (28800, 28800)), 1, 3).astype(np.float32)
    segs, _ = W.transcribe(x16, language=lang, beam_size=5); return ' '.join(s.text for s in segs).strip()
def nota(texto, o):
    ref = norm(texto); got = [w for t in norm(o) for w in EQ.get(t, [t])]
    extra = len(got) - len(ref)
    return sum(1 for w in ref if w in got) / max(1, len(ref)), extra

VOZ = {'repartidor': 'Zubenelgenubi', 'enfermera': 'Kore', 'estudiante': 'Leda', 'costurera': 'Sulafat', 'vendedora': 'Gacrux',
       'barbero': 'Algieba', 'minero': 'Algenib', 'operadora': 'Erinome', 'ingeniera': 'Autonoe', 'cumplimiento': 'Alnilam'}
TAG = {'repartidor': 'seco', 'enfermera': 'cansada', 'estudiante': 'voz baja', 'costurera': 'cansada', 'vendedora': 'firme',
       'barbero': 'seco', 'minero': 'grave, cansado', 'operadora': 'tranquila', 'ingeniera': 'segura', 'cumplimiento': 'firme'}
TAG_LINEA = {6: 'en voz baja', 12: 'despacio, grave', 31: 'tranquilo', 32: 'sin prisa', 33: 'firme'}
PT = {'costurera', 'ingeniera'}
PEND = [(1, 'repartidor', 'Metí la plata del alquiler.'), (2, 'enfermera', 'Metí el aguinaldo.'), (11, 'enfermera', 'La siguiente ni llegó.'),
 (111, 'vendedora', 'La siguiente ni llegó.'), (12, 'minero', 'No nos faltó coraje. Nos faltó peso.'), (13, 'minero', 'Esto sale de acá.'),
 (14, 'operadora', 'Un gramo, partido en cincuenta y cinco.'), (15, 'operadora', 'Eso es un Origen.'), (16, 'ingeniera', 'São sete máquinas nossas.'),
 (17, 'ingeniera', 'Origen se move sem taxa de rede.'), (18, 'estudiante', 'No la doy en cada aplicación.'), (19, 'estudiante', 'Me revisó una persona.'),
 (20, 'cumplimiento', 'Nadie se aprueba solo.'), (21, 'repartidor', 'Reparto.'), (22, 'vendedora', 'Vendo verdura.'), (23, 'costurera', 'Eu costuro.'),
 (24, 'barbero', 'Corto pelo.'), (25, 'operadora', 'Peso oro.'), (26, 'minero', 'Saco piedra.'), (31, 'repartidor', 'Esta vez lo pesé.'),
 (32, 'vendedora', 'No te pedimos que creas.'), (33, 'vendedora', 'Pésalo.')]
CORO = [('c_rep', 'repartidor', 'Un gramo pesa igual en todas partes.'), ('c_est', 'estudiante', 'Un gramo pesa igual en todas partes.'),
        ('c_enf', 'enfermera', 'Un gramo pesa igual en todas partes.'), ('c_bar', 'barbero', 'Un gramo pesa igual en todas partes.'),
        ('c_min', 'minero', 'Un gramo pesa igual en todas partes.'), ('c_cos', 'costurera', 'Um grama pesa igual em todo lugar.')]

def generar(clave, quien, texto, n=None):
    tag = TAG_LINEA.get(n, TAG[quien]); lang = 'pt' if quien in PT else 'es'
    esperado = 0.09 * len(texto) + 0.6
    for intento in range(4):
        t_ = f'[{tag}] {texto}' if intento < 2 else texto         # si insiste en leer la indicación, sin indicación
        x, sr, modelo = tts(t_, VOZ[quien]); x = limpiar(a48(x, sr)); d = len(x) / SR
        o = oido(x, lang); ac, extra = nota(texto, o)
        ok = ac >= 0.8 and extra <= 1 and d <= esperado * 2.2
        log(f'  {str(clave):6} {quien:12} {d:5.2f}s {ac:4.0%} extra={extra} [{modelo}] {"OK" if ok else "repito"} → {o}')
        if ok: return x, modelo
    return x, modelo   # la mejor aproximación tras cuatro intentos

if __name__ == '__main__':
    dur = json.load(open(OUT / 'duraciones.json')); origen = {}
    for n, quien, texto in PEND:
        x, modelo = generar(n, quien, texto, n); np.save(OUT / f'{n:03d}.npy', x); dur[str(n)] = round(len(x) / SR, 2); origen[n] = modelo
        json.dump(dur, open(OUT / 'duraciones.json', 'w'), indent=1)
    partes = [np.load(OUT / '005.npy')]
    for clave, quien, texto in CORO:
        x, _ = generar(clave, quien, texto); partes.append(x)
    largo = len(partes[0]); coro = np.zeros(largo)
    for i, p in enumerate(partes):
        p = signal.resample(p, largo) if abs(len(p) - largo) < 0.35*largo else np.pad(p, (0, max(0, largo - len(p))))[:largo]
        coro += p * (1.0 if i == 0 else 0.5)
    coro = limpiar(coro); np.save(OUT / '030.npy', coro); dur['30'] = round(len(coro) / SR, 2)
    json.dump(dur, open(OUT / 'duraciones.json', 'w'), indent=1); json.dump(origen, open(OUT / 'modelos.json', 'w'), indent=1)
    log('LISTO', len(PEND), 'líneas y el coro')
