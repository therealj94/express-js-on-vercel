"""Honduras Secreta «Vení tranquilo»: tiempos de voz (tomas de la guara), palabras y plano a plano."""
import json, subprocess
P = json.load(open('v/palabras.json'))
TP = {'T1': ['V01_a', 'V02_a'], 'T2': ['V04_b'], 'T3': ['V05_a', 'V06_a'], 'T4': ['V07_b', 'V08_b'], 'T5': ['V09_a'], 'T6': ['V10_a'],
      'T7': ['V11_a'], 'T8': ['V12_a'], 'T9': ['V13_a', 'V14_a']}
dur = lambda f: float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
# inicio de cada toma hablada y de la voz en off V03
INI = {'T1': 7.0, 'V03': None, 'T2': None, 'T3': None, 'T4': None, 'T5': None, 'T6': None, 'T7': None, 'T8': None, 'T9': None}
W, V, PARTE = {}, {}, {}
t = 7.0
def pon(k, toma_list, t0):
    o = 0
    for p in toma_list:
        V[p[:3]] = round(t0 + o, 3); W[p[:3]] = [[w, round(t0 + o + a, 3), round(t0 + o + b, 3)] for w, a, b in P[p]]
        o += dur(f'v/{p}.mp3') + .5
    return t0 + o - .5
fin = pon('T1', TP['T1'], 7.0); T = {'T1': 7.0}
S = {'pregunta': fin + .25}
t = S['pregunta'] + 2.9
fin = pon('V03', ['V03_a'], t); S['cita'] = fin + .2
t = S['cita'] + 2.9
for k, pausa in [('T2', 0), ('T3', .5), ('T4', .5), ('T5', 1.1), ('T6', .5), ('T7', .5), ('T8', .6)]:
    t += pausa; T[k] = round(t, 3); t = pon(k, TP[k], t)
S['buenos'] = t + .1
T['T9'] = round(t + 2.6, 3); t = pon('T9', TP['T9'], T['T9'])
S['dice'] = V['V14'] - .1
# drop the mic: suelta el micrófono, golpe, sale, se apaga el foco, silencio y título
S['drop'] = t + .5; S['golpe'] = S['drop'] + 2.6 + .4 / .6; S['salida'] = S['golpe'] + 1.9; S['luz'] = S['salida'] + 2.2 / 1.3
# la voz real de Romeo (@romeo_and_nando_adventures) toma el micrófono: primero por el PA a oscuras, luego de día
S['romeo'] = S['golpe'] + 1.5
NP = json.load(open('nando/palabras.json'))
RN = [('RO1', 'N1a', 0, 4.15, 0), ('RO1', 'N1b', 4.15, 7.95, 4.15), ('RO2', 'N2', 13.18, 20.42, 8.25), ('RO3', 'N3', 24.98, 31.62, 15.78), ('RO4', 'N4', 42.6, 44.45, 22.68)]
ROMEO = []
for k, f, a, b, o in RN:
    t0 = S['romeo'] + o; ROMEO.append((f'nando/{f}.wav', round(t0, 3)))
    W.setdefault(k, []).extend([[w, round(t0 + x - a, 3), round(t0 + y - a, 3)] for w, x, y in NP if a - .05 <= x and y <= b + .05])
S['dia'] = S['romeo'] + 4.24; S['seguras'] = S['romeo'] + 15.78 + 3.56
S['titulo'] = S['romeo'] + 22.68 + .8
S['pregunta2'] = S['titulo'] + 3.4
S['logo'] = S['pregunta2'] + 3.2
total = round(S['logo'] + 3.1, 2)
def pal(k, w, n=1):
    c = 0
    for p, a, b in W[k]:
        if p.lower().strip('.,!?¡¿…«»') == w.lower():
            c += 1
            if c == n: return a
    raise SystemExit(f'{k} sin {w}')
# momentos
S.update(sesenta=pal('V02', '60') if any(x[0].startswith('60') for x in W['V02']) else V['V02'] + .6, pais=pal('V02', 'país'),
         historia=pal('V03', 'historia'), moderno=pal('V03', 'moderno'), uno=pal('V03', 'uno'),
         familia=pal('V04', 'familia'), casa=pal('V04', 'casa'), mira=V['V05'], mar=pal('V05', 'mar'), montanas=pal('V05', 'montañas'), mil=pal('V05', 'mil'),
         gente=pal('V05', 'gente'), enamorar=pal('V06', 'enamorar'), carretera=pal('V07', 'carretera'), emergencia=pal('V07', 'emergencia'),
         noche=pal('V07', 'noche'), nosotros=V['V08'], apoyar=pal('V08', 'apoyar'), exigir=pal('V08', 'exigir'),
         gobiernan=pal('V09', 'gobiernan'), historia2=pal('V09', 'historia'), nacieron=pal('V10', 'nacieron'), hijos=pal('V10', 'hijos'), nietos=pal('V10', 'nietos'),
         todo=pal('V11', 'todo'), rumbo=pal('V11', 'rumbo'), aman=pal('V12', 'aman'), escuchen=pal('V12', 'escuchen'), mejor=V['V13'])
S['sesenta'] = next(a for w, a, b in W['V02'] if w.startswith('60'))
# plano a plano: [clip, desde, hasta, offset, velocidad, zoom0, zoom1, transición, duración]
L = lambda k, a, b, z0=1.0, z1=1.08, tr='corte', d=.3: [k, round(a, 3), round(b, 3), round(a - T[k], 3), 1, z0, z1, tr, d]
C = [
 ['M3', 1.6, 4.2, .3, 1, 1.0, 1.1, 'negro', .5],
 ['M1', 4.2, 5.6, .5, 1.4, 1.0, 1.12, 'whip', .35],
 ['M2', 5.6, 7.0, .4, 1, 1.05, 1.15, 'flash', .2],
 L('T1', 7.0, S['sesenta'] - .1, 1.0, 1.1, 'flash', .25),
 ['B01', S['sesenta'] - .1, S['pais'] - .2, .5, 1, 1.05, 1.18, 'whip', .35],
 L('T1', S['pais'] - .2, S['pregunta'], 1.12, 1.2, 'corte'),
 ['CP01', S['historia'] - .3, S['moderno'] - .25, .8, 1, 1.05, 1.15, 'negro', .4],
 ['B07', S['moderno'] - .25, S['uno'] - .2, .6, 1, 1.05, 1.12, 'whip', .35],
 ['M4', S['uno'] - .2, S['cita'], .3, 1, 1.0, 1.08, 'fuga', .5],
 L('T2', T['T2'], S['familia'] - .3, 1.0, 1.06, 'negro', .5),
 ['B02', S['familia'] - .3, S['casa'] - .6, .4, 1, 1.0, 1.1, 'fuga', .5],
 ['B03', S['casa'] - .6, T['T3'] - .1, .6, 1, 1.05, 1.15, 'corte', .3],
 L('T3', T['T3'] - .1, S['mar'] - .15, 1.0, 1.08, 'zoom', .45),
 ['R01', S['mar'] - .15, S['montanas'] - .1, .8, 1, 1.05, 1.15, 'whip', .3],
 ['B04', S['montanas'] - .1, S['mil'] - .1, .6, 1, 1.05, 1.15, 'whip', .3],
 ['CP02', S['mil'] - .1, S['gente'] - .1, 1.0, 1, 1.05, 1.15, 'whip', .3],
 ['B06', S['gente'] - .1, S['gente'] + 1.3, .8, 1, 1.0, 1.1, 'whip', .3],
 ['L01', S['gente'] + 1.3, V['V06'] - .1, 1.0, 1, 1.05, 1.12, 'corte', .3],
 ['U01', V['V06'] - .1, S['enamorar'] - .2, 1.2, 1, 1.05, 1.15, 'flash', .2],
 L('T3', S['enamorar'] - .2, T['T4'] - .2, 1.05, 1.15, 'zoom', .4),
 ['B01', T['T4'] - .2, S['emergencia'] - .15, 2.2, 1, 1.1, 1.2, 'fuga', .45],
 L('T4', S['emergencia'] - .15, S['noche'] - .5, 1.0, 1.08, 'corte'),
 ['B09', S['noche'] - .5, S['nosotros'] - .1, .8, 1, 1.05, 1.15, 'whip', .3],
 ['B08', S['nosotros'] - .1, S['apoyar'] - .1, .6, 1, 1.05, 1.15, 'whip', .3],
 ['B05', S['apoyar'] - .1, S['exigir'] - .1, .8, 1, 1.05, 1.12, 'whip', .3],
 L('T4', S['exigir'] - .1, T['T5'] - .3, 1.05, 1.12, 'zoom', .4),
 L('T5', T['T5'] - .3, S['historia2'] - .3, 1.0, 1.12, 'negro', .6),
 ['B10', S['historia2'] - .3, T['T6'] - .1, .6, .9, 1.0, 1.12, 'fuga', .6],
 L('T6', T['T6'] - .1, S['hijos'] - .15, 1.0, 1.08, 'corte'),
 ['B11', S['hijos'] - .15, S['nietos'] - .05, .8, 1, 1.0, 1.1, 'fuga', .4],
 ['B12', S['nietos'] - .05, T['T7'] - .1, .8, 1, 1.0, 1.1, 'fuga', .4],
 L('T7', T['T7'] - .1, S['todo'] - .2, 1.0, 1.1, 'corte'),
 ['B10', S['todo'] - .2, S['rumbo'] + .6, 2.0, .8, 1.15, 1.3, 'fuga', .5],
 L('T8', T['T8'] - .3, S['buenos'] + .2, 1.0, 1.18, 'flash', .25),
 ['B13', S['buenos'] + .2, S['dice'], .3, 1, 1.0, 1.12, 'fuga', .6],
 L('T9', S['dice'], S['drop'], 1.0, 1.1, 'zoom', .4),
 ['D1', S['drop'], S['drop'] + 2.6, .4, 1, 1.0, 1.14, 'corte', .3],
 ['D2', S['drop'] + 2.6, S['salida'], 0, .6, 1.1, 1.0, 'corte', .3],
 ['D3', S['salida'], S['dia'], 1.0, 1.3, 1.0, 1.06, 'corte', .3],
 ['ROM1', S['dia'], S['romeo'] + 8.1, 4.4, 1, 1.0, 1.08, 'flash', .25],
 ['ROM2', S['romeo'] + 8.1, S['romeo'] + 10.8, 0, .5, 1.0, 1.1, 'whip', .3],
 ['ROM3', S['romeo'] + 10.8, S['romeo'] + 12.5, .5, 1, 1.05, 1.12, 'whip', .3],
 ['ROM1', S['romeo'] + 12.5, S['romeo'] + 15.6, .5, 1, 1.0, 1.1, 'whip', .3],
 ['B14', S['romeo'] + 15.6, S['romeo'] + 17.4, .4, 1, 1.0, 1.1, 'fuga', .4],
 ['B09', S['romeo'] + 17.4, S['seguras'] - .05, .6, 1, 1.05, 1.15, 'whip', .3],
 ['B11', S['seguras'] - .05, S['romeo'] + 20.8, .6, 1, 1.0, 1.1, 'flash', .2],
 ['B05', S['romeo'] + 20.8, S['romeo'] + 22.5, .6, 1, 1.05, 1.15, 'whip', .3],
 ['ROM3', S['romeo'] + 22.5, S['titulo'], 5.6, 1, 1.0, 1.06, 'fuga', .3],
 ['D3', S['titulo'], S['pregunta2'] + .2, 6.5, 0, 1.0, 1.0, 'corte', .2],
]
for c in C:
    if c[0].startswith('T') and c[3] < 0: c[3] = 0
json.dump({'romeo': ROMEO, 'voces': V, 'palabras': W, 's': S, 't': T, 'total': total, 'C': C}, open('codigo/tiempos.json', 'w'), ensure_ascii=False, indent=1)
print('T', T); print({k: round(v, 2) for k, v in S.items()}); print('total', total)
