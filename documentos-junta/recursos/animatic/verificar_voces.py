import numpy as np, json, pathlib, re, unicodedata
from scipy import signal
from faster_whisper import WhisperModel
AQUI = pathlib.Path(__file__).parent
m = WhisperModel('small', device='cpu', compute_type='int8')
guion = {int(l.split('(')[1].split(',')[0]): (l.split("'")[1], l.split("'")[3]) for l in open(AQUI/'voces.py', encoding='utf-8') if re.match(r"\s*\(\d+, '", l)}
guion[30] = ('coro', 'Un gramo pesa igual en todas partes.')
def norm(s): s = unicodedata.normalize('NFD', s.lower()); return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).split()
malos = []
for n, (quien, texto) in sorted(guion.items()):
    x = np.load(AQUI/'voz'/f'{n:03d}.npy'); x16 = signal.resample_poly(np.pad(x / (np.abs(x).max()+1e-9) * 0.9, (28800, 28800)), 1, 3).astype(np.float32)
    lang = 'pt' if quien in ('costurera', 'ingeniera') else 'es'
    segs, _ = m.transcribe(x16, language=lang, beam_size=5)
    oido = ' '.join(s.text for s in segs).strip()
    EQ = {'55': ['cincuenta','y','cinco'], 'bendo': ['vendo'], 'origem': ['origen']}
    a, b = norm(texto), [w for o in norm(oido) for w in EQ.get(o, [o])]
    acierto = sum(1 for w in a if w in b) / max(1, len(a))
    marca = 'OK ' if acierto >= 0.8 else 'MAL'
    if acierto < 0.8: malos.append(n)
    print(f'{marca} {n:3d} {quien:12} {acierto:4.0%}  guion: {texto:42} oído: {oido}')
print('a rehacer:', malos)
