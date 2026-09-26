#!/usr/bin/env python3
"""Arreglos finales: las tres líneas que leyeron la indicación, y el coro (cada parte guardada en disco)."""
import numpy as np, json, pathlib, sys
from scipy import signal
sys.argv = ['x']
import importlib.util
spec = importlib.util.spec_from_file_location('g', pathlib.Path(__file__).parent / 'voces_gemini2.py'); g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
OUT = g.OUT; SR = g.SR
PALABRAS_TAG = {'seco', 'seca', 'tranquila', 'tranquilo', 'prisa', 'segura', 'firme', 'cansada', 'cansado', 'baja', 'grave', 'despacio'}
def generar(clave, quien, texto, tag=None):
    lang = 'pt' if quien in g.PT else 'es'
    for intento in range(5):
        t_ = f'[{tag}] {texto}' if (tag and intento == 0) else texto
        x, sr, modelo = g.tts(t_, g.VOZ[quien]); x = g.limpiar(g.a48(x, sr))
        o = g.oido(x, lang); ac, extra = g.nota(texto, o); leidas = PALABRAS_TAG & set(g.norm(o))
        ok = ac >= 0.85 and extra <= 0 and not leidas
        g.log(f'  {clave:6} {quien:12} {len(x)/SR:5.2f}s {ac:4.0%} extra={extra} [{modelo}] {"OK" if ok else "repito"} → {o}')
        if ok: return x
    return None
dur = json.load(open(OUT / 'duraciones.json'))
for n, quien, texto in [(21, 'repartidor', 'Reparto.'), (25, 'operadora', 'Peso oro.'), (31, 'repartidor', 'Esta vez lo pesé.')]:
    x = generar(str(n), quien, texto)
    if x is not None: np.save(OUT / f'{n:03d}.npy', x); dur[str(n)] = round(len(x) / SR, 2); json.dump(dur, open(OUT / 'duraciones.json', 'w'), indent=1)
for clave, quien, texto in g.CORO:
    f = OUT / f'coro_{clave}.npy'
    if f.exists(): continue
    x = generar(clave, quien, texto)
    if x is not None: np.save(f, x)
partes = [np.load(OUT / '005.npy')] + [np.load(p) for p in sorted(OUT.glob('coro_c_*.npy'))]
largo = len(partes[0]); coro = np.zeros(largo)
for i, p in enumerate(partes):
    p = signal.resample(p, largo) if abs(len(p) - largo) < 0.35*largo else np.pad(p, (0, max(0, largo - len(p))))[:largo]
    coro += p * (1.0 if i == 0 else 0.5)
coro = g.limpiar(coro); np.save(OUT / '030.npy', coro); dur['30'] = round(len(coro) / SR, 2)
json.dump(dur, open(OUT / 'duraciones.json', 'w'), indent=1)
g.log('LISTO · coro con', len(partes), 'voces')
