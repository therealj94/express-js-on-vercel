import wave, numpy as np, json, re, unicodedata, pathlib
from scipy import signal
from faster_whisper import WhisperModel
m = WhisperModel('small', device='cpu', compute_type='int8')
w = wave.open('banda.wav'); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, 2).mean(1) / 32767; sr = 48000
dur = json.load(open('voz/duraciones.json'))
src = open('audio.py', encoding='utf-8').read()
col = {int(k): float(v) for k, v in re.findall(r"(\d+): \(([\d.]+), '", src.split('COLOCACION = {')[1].split('}')[0])}
txt = {int(a): c for a, b, c in re.findall(r"\((\d+), '(\w+)', '([^']+)'\)", open('voces.py', encoding='utf-8').read())}
txt[30] = 'Un gramo pesa igual en todas partes.'
pt = {4, 10, 16, 17, 23}
def norm(s): s = unicodedata.normalize('NFD', s.lower()); return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).split()
EQ = {'55': ['cincuenta', 'y', 'cinco'], 'bendo': ['vendo'], 'origem': ['origen'], 'pc': ['pese'], 'e': ['eu'], 'o': []}
tot = []; malos = []
for n in sorted(col):
    if n == 111: continue
    a = col[n]; b = a + dur[str(n)] + 0.35
    seg = x[int((a - 0.15) * sr): int(b * sr)]
    x16 = signal.resample_poly(np.pad(seg, (24000, 24000)), 1, 3).astype(np.float32)
    segs, _ = m.transcribe(x16, language='pt' if n in pt else 'es', beam_size=5)
    oido = ' '.join(s.text for s in segs).strip(); o = [w for t in norm(oido) for w in EQ.get(t, [t])]
    ref = norm(txt[n]); ac = sum(1 for w_ in ref if w_ in o) / max(1, len(ref)); tot.append(ac)
    if ac < 0.8: malos.append(n)
    print(f"{'OK ' if ac >= 0.8 else 'MAL'} {n:3d} {a:6.2f}s {ac:4.0%}  {txt[n]:40} → {oido}")
print(f'media {np.mean(tot):.0%} · a revisar: {malos}')
