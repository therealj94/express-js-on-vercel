"""«Vení tranquilo» v2: tiempos, voces y lista de tomas (escribe codigo/tiempos.json)."""
import json, subprocess
EL = json.load(open('elegidas.json')); PAL = json.load(open('v/palabras.json'))
LIP = {'G01', 'G02', 'G04', 'G06', 'G09', 'G11', 'G13', 'G14'}   # tomas a cámara (pad .25 al inicio)
def dur(f): return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
V, W, S = {}, {}, {}
def voz(k, t0):
    """coloca la toma k en t0 (inicio del archivo); devuelve fin de la voz"""
    f = f'v/{k}_{EL[k]}.mp3'; pad = .25 if k in LIP else 0
    V[k] = {'f': f, 't': round(t0 + pad, 3)}
    W[k] = [[{'.000': 'mil', '60': 'Sesenta'}.get(w, w), round(t0 + pad + a, 3), round(t0 + pad + b, 3)] for w, a, b, p in PAL[f'{k}_{EL[k]}']]
    if k == 'G01': W[k] = [[w.replace('al', 'a El') if w == 'al' else w, a, b] for w, a, b in W[k]]
    return t0 + pad + dur(f)
def pal(k, palabra, n=1):
    c = 0
    for w, a, b in W[k]:
        if palabra.lower() in w.lower():
            c += 1
            if c == n: return a
    raise KeyError((k, palabra))
# ---------- línea de tiempo ----------
S['taps'] = .55; S['ring'] = .95
t = voz('G01', 1.5); S['g01'] = 1.5
S['sesenta'] = pal('G01', 'Sesenta'); S['salvador'] = pal('G01', 'Salvador'); S['morazanica'] = pal('G01', 'morazánica')
S['g02'] = t + .35; t = voz('G02', S['g02'])
S['cita'] = t + .1; t = S['cita'] + 2.6
S['g03'] = t; t = voz('G03', t)
S['fronteras'] = pal('G03', 'fronteras'); S['inventamos'] = pal('G03', 'inventamos'); S['morazan'] = pal('G03', 'Morazán'); S['una_sola'] = pal('G03', 'sola')
S['g04'] = t + .45; t = voz('G04', S['g04']); S['cruzar'] = pal('G04', 'cruzar')
S['g05'] = t + .5; t = voz('G05', S['g05'])
S['mar'] = pal('G05', 'mar'); S['montanas'] = pal('G05', 'montañas'); S['historia'] = pal('G05', 'historia'); S['gente'] = pal('G05', 'gente')
S['g06'] = t + .2; t = voz('G06', S['g06'])
S['g07'] = t + .35; t = voz('G07', S['g07']); S['secreta'] = pal('G07', 'secreta'); S['miedo'] = pal('G07', 'miedo')
S['g08'] = t + .45; t = voz('G08', S['g08']); S['semana'] = pal('G08', 'semana'); S['todos'] = pal('G08', 'todos')
S['g09'] = t + .45; t = voz('G09', S['g09']); S['secreto'] = pal('G09', 'secreto'); S['decidirlo'] = pal('G09', 'decidirlo')
S['g10'] = t + .35; t = voz('G10', S['g10']); S['hijos'] = pal('G10', 'hijos'); S['nietos'] = pal('G10', 'nietos')
S['g11'] = t + .4; t = voz('G11', S['g11']); S['cambio'] = pal('G11', 'cambio')
S['h1'] = t + .25; t = voz('H1', S['h1'])
S['h2'] = t + .2; t = voz('H2', S['h2'])
S['h3'] = t + .2; t = voz('H3', S['h3'])
S['g12'] = t + .3; t = voz('G12', S['g12']); S['mundo'] = pal('G12', 'mundo')
S['g13'] = t + .5; t = voz('G13', S['g13']); S['compartir'] = pal('G13', 'compartir'); S['decide'] = pal('G13', 'decide')
S['g14'] = t + .45; t = voz('G14', S['g14']); S['escuchen'] = pal('G14', 'escuchen')
S['g15'] = t + .55; t = voz('G15', S['g15']); S['decidan'] = V['G15']['t']
S['cae'] = t + .25                       # el micrófono empieza a caer (X2)
S['golpe'] = S['cae'] + 1.2              # toca el piso (D2 en 0,4 s a velocidad .6)
S['salida'] = S['golpe'] + 1.6           # plano abierto, el foco se apaga
S['luz'] = S['salida'] + 1.4
S['romeo'] = S['salida'] + .9            # su voz entra a oscuras
NP = json.load(open('../vt/nando/palabras.json'))
RN = [('RO1', 'N1a', 0, 4.15, 0), ('RO1', 'N1b', 4.15, 7.95, 4.15), ('RO4', 'N4', 42.6, 44.45, 8.45)]
ROMEO = []
for k, f, a, b, o in RN:
    t0 = S['romeo'] + o; ROMEO.append((f'../vt/nando/{f}.wav', round(t0, 3)))
    W.setdefault(k, []).extend([[w, round(t0 + x - a, 3), round(t0 + y - a, 3)] for w, x, y in NP if a - .05 <= x and y <= b + .05])
S['dia'] = S['romeo'] + 4.24
S['titulo'] = S['romeo'] + 8.45 + .8      # «vení» de Romeo
S['cta'] = S['titulo'] + 3.0
S['logo'] = S['cta'] + 3.4
total = round(S['logo'] + 3.4, 2)
# ---------- tomas: [clip, desde, hasta, offset, vel, z0, z1, transición, dur] ----------
def L(k, a, b, z0=1.0, z1=1.06, tr='corte', d=.3, clip=None):
    return [clip or 'L' + k, a, b, max(0, a - (V[k]['t'] - .25)), 1, z0, z1, tr, d]
C = [
 ['X1', 0, S['g01'], .3, 1, 1.0, 1.08, 'negro', 1.0],
 L('G01', S['g01'], S['salvador'] - .05, 1.0, 1.1, 'corte'),
 ['MAPA', S['salvador'] - .05, S['morazanica'] + 1.1, 0, 1, 1, 1, 'whip', .3],
 L('G02', S['g02'] - .05, S['cita'], 1.0, 1.06, 'corte'),
 ['NEGRO', S['cita'], S['g03'], 0, 1, 1, 1, 'corte', .2],
 ['MAPA', S['g03'], S['morazan'] - .1, 0, 1, 1, 1, 'negro', .6],
 ['B10', S['morazan'] - .1, S['una_sola'] - .4, .6, .8, 1.0, 1.12, 'fuga', .5],
 ['MAPA', S['una_sola'] - .4, S['g04'] - .05, 0, 1, 1, 1, 'fuga', .5],
 L('G04', S['g04'] - .05, S['g05'] - .1, 1.0, 1.18, 'negro', .5),
 ['R01', S['g05'] - .1, S['montanas'] - .1, .8, 1, 1.05, 1.15, 'flash', .25],
 ['B04', S['montanas'] - .1, S['historia'] - .5, .6, 1, 1.05, 1.15, 'whip', .3],
 ['CP01', S['historia'] - .5, S['gente'] - .2, .8, 1, 1.05, 1.15, 'whip', .3],
 ['B06', S['gente'] - .2, S['g06'] - .05, .8, 1, 1.0, 1.1, 'whip', .3],
 L('G06', S['g06'] - .05, S['g07'] - .1, 1.0, 1.08, 'zoom', .4),
 ['LOGO', S['g07'] - .1, S['g08'] - .1, 0, 1, 1, 1, 'negro', .5],
 ['B15', S['g08'] - .1, S['semana'] - .2, .4, 1, 1.0, 1.1, 'fuga', .5],
 ['B01', S['semana'] - .2, S['todos'] - .3, 1.5, 1, 1.05, 1.12, 'whip', .3],
 ['B16', S['todos'] - .3, S['g09'] - .05, .5, 1, 1.0, 1.1, 'whip', .3],
 L('G09', S['g09'] - .05, V['G09']['t'] + 4.85, 1.0, 1.06, 'negro', .5),
 ['LG09B', V['G09']['t'] + 4.85, S['g10'] - .1, V['G09']['t'] + 4.85 - (V['G09']['t'] + 5.0 - .25), 1, 1.0, 1.1, 'corte', .3],
 ['B11', S['g10'] - .1, S['hijos'] + .3, .8, 1, 1.0, 1.1, 'fuga', .5],
 ['B12', S['hijos'] + .3, V['G11']['t'] + .35, .8, 1, 1.0, 1.1, 'fuga', .4],
 L('G11', V['G11']['t'] + .35, S['h1'] - .1, 1.0, 1.12, 'flash', .25),
 ['B17', S['h1'] - .1, S['h2'] - .1, .4, 1, 1.0, 1.1, 'corte', .3],
 ['B14', S['h2'] - .1, S['h3'] - .1, .8, 1, 1.05, 1.12, 'corte', .3],
 ['B05', S['h3'] - .1, S['g12'] - .1, .8, 1, 1.05, 1.12, 'corte', .3],
 ['BANDERA', S['g12'] - .1, S['g13'] - .1, 0, 1, 1, 1, 'flash', .3],
 L('G13', S['g13'] - .1, S['compartir'] - .2, 1.0, 1.08, 'negro', .5),
 ['B18', S['compartir'] - .2, S['decide'] - .3, .4, 1, 1.0, 1.08, 'whip', .3],
 ['ONDA', S['decide'] - .3, V['G14']['t'] + .4, 0, 1, 1, 1, 'corte', .3],
 L('G14', V['G14']['t'] + .4, S['g15'] - .05, 1.0, 1.2, 'corte', .3),
 ['S5', S['g15'] - .05, S['cae'], 1.2, .8, 1.0, 1.12, 'corte', .3],
 ['X2', S['cae'], S['golpe'] - .67, .4, 1.3, 1.0, 1.05, 'corte', .2],
 ['D2', S['golpe'] - .67, S['salida'], 0, .6, 2.15, 2.05, 'corte', .2, -820],
 ['D3', S['salida'], S['dia'], 2.0, 1.3, 1.0, 1.06, 'corte', .3],
 ['ROM1', S['dia'], S['romeo'] + 8.2, 4.4, 1, 1.0, 1.08, 'flash', .25],
 ['ROM3', S['romeo'] + 8.2, S['titulo'], 5.6, 1, 1.0, 1.06, 'whip', .3],
 ['NEGRO', S['titulo'], total, 0, 1, 1, 1, 'corte', .2],
]
json.dump({'romeo': ROMEO, 'voces': V, 'palabras': W, 's': S, 'total': total, 'C': C}, open('codigo/tiempos.json', 'w'), ensure_ascii=False, indent=1)
print({k: round(v, 2) for k, v in S.items()}); print('total', total)
