"""Casting automático de voces: para cada personaje prueba varias voces y elige la que el reconocedor entiende mejor."""
import numpy as np, json, pathlib, re, unicodedata, itertools, sys
from scipy import signal
sys.argv = ['x']
import importlib.util
spec = importlib.util.spec_from_file_location('v', 'voces_base.py'); v = importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
from faster_whisper import WhisperModel
m = WhisperModel('small', device='cpu', compute_type='int8')
def norm(s): s = unicodedata.normalize('NFD', s.lower()); return re.sub(r'[^a-z0-9 ]', '', ''.join(c for c in s if unicodedata.category(c) != 'Mn')).split()
EQUIV = {'55': ['cincuenta', 'y', 'cinco'], 'vendo': ['bendo'], 'origem': ['origen']}
def puntaje(x, texto, lang):
    x16 = signal.resample_poly(np.pad(x / (np.abs(x).max() + 1e-9) * 0.9, (int(.6*48000), int(.6*48000))), 1, 3).astype(np.float32)
    segs, _ = m.transcribe(x16, language=lang, beam_size=5)
    oido = norm(' '.join(s.text for s in segs)); oido = [w for o in oido for w in EQUIV.get(o, [o])]
    a = norm(texto)
    return sum(1 for w in a if w in oido) / max(1, len(a)), ' '.join(oido)

LINEAS = {
 'repartidor': ['Metí la plata del alquiler.', 'Reparto.', 'Esta vez lo pesé.'],
 'enfermera': ['Metí el aguinaldo.', 'La siguiente ni llegó.'],
 'estudiante': ['Metí la quincena.', 'Después pidieron mi cara.', 'Nadie me explicó nada.', 'No la doy en cada aplicación.', 'Me revisó una persona.'],
 'barbero': ['Al principio no pedían nada.', 'Corto pelo.'],
 'operadora': ['Un gramo, partido en cincuenta y cinco.', 'Eso es un Origen.', 'Peso oro.'],
}
P, K = v.piper, v.kokoro
FEM = {
 'K_dora_+1':      (lambda t: K('ef_dora', t, 0.95), +1.0),
 'K_dora_heart':   (lambda t: K((('ef_dora', .55), ('af_heart', .45)), t, 0.95), 0),
 'K_dora_bella':   (lambda t: K((('ef_dora', .6), ('af_bella', .4)), t, 0.95), 0),
 'K_dora_nicole':  (lambda t: K((('ef_dora', .6), ('af_nicole', .4)), t, 0.95), 0),
 'K_dora_sarah':   (lambda t: K((('ef_dora', .65), ('af_sarah', .35)), t, 0.95), 0),
 'K_dora_emma':    (lambda t: K((('ef_dora', .6), ('bf_emma', .4)), t, 0.95), 0),
 'P_daniela_1.0':  (lambda t: P('es_AR-daniela-high', t, 1.0), 0),
 'P_daniela_0.9':  (lambda t: P('es_AR-daniela-high', t, 0.9), 0),
 'P_sharvard_0':   (lambda t: P('es_ES-sharvard-medium', t, 0.95, speaker=0), 0),
 'P_sharvard_1':   (lambda t: P('es_ES-sharvard-medium', t, 0.95, speaker=1), 0),
}
MASC = {
 'P_claude_1.0':   (lambda t: P('es_MX-claude-high', t, 1.0), 0),
 'P_claude_0.9':   (lambda t: P('es_MX-claude-high', t, 0.9), 0),
 'P_ald_1.0':      (lambda t: P('es_MX-ald-medium', t, 1.0), 0),
 'P_ald_0.9':      (lambda t: P('es_MX-ald-medium', t, 0.9), 0),
 'K_alex_1.0':     (lambda t: K('em_alex', t, 1.0), 0),
 'K_alex_michael': (lambda t: K((('em_alex', .6), ('am_michael', .4)), t, 0.95), -0.5),
 'K_alex_adam':    (lambda t: K((('em_alex', .6), ('am_adam', .4)), t, 0.95), 0),
 'K_santa_onyx':   (lambda t: K((('em_santa', .6), ('am_onyx', .4)), t, 0.95), 0),
}
res = {}
for quien, lineas in LINEAS.items():
    pool = MASC if quien in ('repartidor', 'barbero') else FEM
    for nombre, (f, st) in pool.items():
        ps = []
        for tx in lineas:
            x, sr = f(tx); x = v.limpiar(v.tono(v.a48(x, sr), st)); s, o = puntaje(x, tx, 'es'); ps.append(s)
        res[(quien, nombre)] = float(np.mean(ps))
        print(f'{quien:11} {nombre:15} {np.mean(ps):5.0%}  {[round(p,2) for p in ps]}', flush=True)
json.dump({f'{a}|{b}': s for (a, b), s in res.items()}, open('casting.json', 'w'), indent=1)
# asignación sin repetir voz entre personajes
fem = ['enfermera', 'estudiante', 'operadora']; mas = ['repartidor', 'barbero']
mejor = None
for combo in itertools.permutations(FEM, 3):
    s = sum(res[(q, c)] for q, c in zip(fem, combo))
    if not mejor or s > mejor[0]: mejor = (s, dict(zip(fem, combo)))
mejorm = None
for combo in itertools.permutations(MASC, 2):
    s = sum(res[(q, c)] for q, c in zip(mas, combo))
    if not mejorm or s > mejorm[0]: mejorm = (s, dict(zip(mas, combo)))
eleccion = {**mejor[1], **mejorm[1]}
print('ELECCIÓN:', eleccion, {q: round(res[(q, c)], 2) for q, c in eleccion.items()})
json.dump(eleccion, open('eleccion.json', 'w'), indent=1)
