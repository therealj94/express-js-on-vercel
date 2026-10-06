"""Orden Global v2 (cine): tiempos de voz, palabras y momentos."""
import json, subprocess
P = json.load(open('v/palabras.json'))
# (clave, toma, recorte_inicio_por_palabra, pausa_antes)
L = [('B01', 'B01_a', None, .6), ('B02', 'B02_a', None, .55), ('B03', 'B03_a', None, .9), ('B04', 'B04_a', None, .9),
     ('A03', 'A03_a', None, 1.3), ('A09', 'A09_a', 'hablo', .5), ('B07', 'B07_a', None, .9), ('B08', 'B08_a', None, .5),
     ('B09', 'B09_a', None, .8), ('B10', 'B10_a', None, .7), ('A11', 'A11_a', None, 1.0), ('A12', 'A12_b', None, .9)]
V, W, f = {}, {}, 0
for k, toma, corte, pausa in L:
    ws = P[toma]; ini = 0
    if corte: ini = next(a for p, a, b in ws if p.lower().strip('.,!?¡¿…') == corte) - .05
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(ini), '-i', f'v/{toma}.mp3', '-ar', '48000', f'v/q_{k}.wav'])
    t0 = round(f + pausa, 2); V[k] = t0
    W[k] = [[p, round(t0 + a - ini, 3), round(t0 + b - ini, 3)] for p, a, b in ws if a >= ini - .01]
    f = W[k][-1][2]
def pal(k, w, n=1):
    c = 0
    for p, a, b in W[k]:
        if p.lower().strip('.,!?¡¿…') == w.lower():
            c += 1
            if c == n: return a
    raise SystemExit(f'{k} sin {w}')
fin = lambda k: W[k][-1][2]
S = dict(dinero=pal('B01', 'dinero'), trabaja=V['B02'], negro1=fin('B02') + .25, somos=V['B03'] - .1, oro=pal('B03', 'oro'), litio=pal('B03', 'litio'),
         cafe=pal('B03', 'café'), seguimos=pal('B03', 'seguimos'), hasta=V['B04'] - .5, aura=V['A03'] - .9, hablo=V['A09'], firma=pal('A09', 'firma'),
         origen=V['B07'] - .4, oro2=pal('B07', 'oro', 2), mexico=V['B08'] - .2, patagonia=pal('B08', 'patagonia'), celular=pal('B08', 'celular'),
         electrum=V['B09'] - .3, agua=pal('B09', 'agua'), semanas=pal('B09', 'semanas'), minutos=pal('B09', 'minutos'), manana=V['B10'] - .2, capital=pal('B10', 'capital'),
         medidas=pal('B10', 'medidas'), clima=V['A11'] - .5, recursos=pal('A11', 'recursos'), empresas=pal('A11', 'empresas'), dinero2=pal('A11', 'dinero'),
         vara=pal('A11', 'medidos'), logo=V['A12'] - .3, quieres=pal('A12', 'saber') - .45)
total = round(fin('A12') + 1.6, 2)
json.dump({'voces': V, 'palabras': W, 's': S, 'total': total}, open('codigo/tiempos2.json', 'w'), ensure_ascii=False, indent=1)
print(V); print({k: round(v, 2) for k, v in S.items()}); print('total', total)
