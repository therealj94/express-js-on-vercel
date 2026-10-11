"""«Un día más» — jingle Honduras Secreta, versión 43 s: línea de tiempo sobre musica/v2_C_ext.wav
(la toma v2C con un puente nocturno de 16 pulsos insertado en b(41); ver extender_jg.py)."""
import json
A = json.load(open('musica/analisis.json'))['v2C']; Wd = A['w']
BEAT = 0.5357; B0 = -0.012                 # medido sobre los ataques de la toma v2C (112,0 BPM)
def b(n): return round(B0 + n * BEAT, 3)
EXT = json.load(open('musica/ext.json'))
def sh(t): return round(t + EXT['ins'], 3) if t >= EXT['corte'] - .05 else t   # tiempo original → tiempo en la versión extendida
def w(p, n=1):
    c = 0
    for x in Wd:
        if p.lower().strip('¡!') == x[0].lower().strip('.,¡!?'):
            c += 1
            if c == n: return sh(x[1])
    raise KeyError((p, n))
total = 42.3
C = [  # [clip, desde, hasta, offset, velocidad o [v0,v1,v2], z0, z1, transición, dur]
 ['S01', 0, b(2), 4.7, 1, 1.05, 1.15, 'corte', .2],
 ['S02', b(2), b(4), 1.0, 1, 1.0, 1.08, 'corte', .2],
 ['S03', b(4), b(8), 1.5, [1, 1, .55], 1.0, 1.06, 'zoom', .3],
 ['S04', b(8), b(10), .4, [1.7, 1.3, 1.0], 1.05, 1.15, 'whipv', .35],
 ['S05', b(10), b(12), .3, [1, .45, .45], 1.0, 1.08, 'whip', .3],
 ['S06B', b(12), b(14.5), .3, .9, 1.0, 1.1, 'flash', .25],
 # caída: suena el caracol, la cámara entra en la concha → la espiral se vuelve falda (T2) → tambores en vivo
 ['K1', b(14.5), b(17), 3.3, [1, 1.8, 2.6], 1.0, 1.05, 'zoom', .3],
 ['T2', b(17), b(19), .2, [1.8, 2.6, 2.0], 1.0, 1.0, 'corte', .2],
 ['G2', b(19), b(20.5), .5, .5, 1.05, 1.12, 'whip', .3],
 ['G3', b(20.5), b(22), 1.0, .8, 1.0, 1.08, 'whip', .3],
 ['G5', b(22), b(24), .3, .7, 1.0, 1.1, 'giro', .35],
 # verso
 ['S08', b(24), b(26), 1.0, .7, 1.0, 1.1, 'fuga', .5],
 ['S09', b(26), b(27), 3.6, .8, 1.0, 1.08, 'whip', .3],
 ['S10', b(27), b(28.5), .5, 1, 1.0, 1.12, 'giro', .4],
 ['S11', b(28.5), b(30), 1.4, .7, 1.0, 1.08, 'flash', .25],
 ['S12', b(30), b(31.8), .8, 1, 1.0, 1.08, 'whip', .3],
 ['S13', b(31.8), b(33), 1.5, 1, 1.05, 1.15, 'zoom', .3],
 ['K2', b(33), b(36.4), 3.2, [1, 1.3, 1.9], 1.0, 1.06, 'whip', .3],      # La Ceiba: la baleada tapa el lente
 ['S17', b(36.4), b(38), .5, 1, 1.0, 1.06, 'corte', .2],
 ['S18', b(38), b(41), .5, .9, 1.0, 1.08, 'fuga', .5],
 # puente nocturno (16 pulsos): West End → bola de luz → se enciende en fuego (T1) → malabarista
 ['N4', b(41), b(44), .3, .9, 1.0, 1.06, 'fuga', .6],
 ['N1', b(44), b(46.5), .4, .6, 1.0, 1.08, 'whip', .3],
 ['N2', b(46.5), b(50), 1.6, [1, 2, 2.8], 1.0, 1.04, 'giro', .35],
 ['T1', b(50), b(52.5), 1.6, [1.8, 3, 2.6], 1.0, 1.0, 'corte', .2],
 ['N3', b(52.5), b(57), .1, [.55, .45, .7], 1.0, 1.08, 'corte', .2],
 # coro (desplazado 16 pulsos): un corte por pulso
 ['S23', b(57), b(59), .6, .9, 1.0, 1.08, 'flash', .3],
 ['S05', b(59), b(60), 1.2, .5, 1.1, 1.18, 'whip', .2],
 ['S19', b(60), b(61), .8, 1, 1.05, 1.12, 'corte', .2],
 ['G1', b(61), b(62), 2.2, .7, 1.05, 1.12, 'whip', .2],
 ['N1', b(62), b(63), 2.6, .8, 1.05, 1.1, 'corte', .2],
 ['S22', b(63), b(64.5), .6, [1, .4, .4], 1.0, 1.06, 'whip', .2],
 ['G5', b(64.5), b(65.5), 1.2, .8, 1.05, 1.12, 'corte', .2],
 ['S24', b(65.5), b(68), .6, .8, 1.0, 1.1, 'flash', .3],
 ['N3', b(68), b(69), 3.0, .8, 1.05, 1.12, 'whip', .2],
 ['S25', b(69), total, .6, 1, 1.0, 1.08, 'fuga', .5],
]
H = []
def H1(t0, t1, pal): H.append([t0, t1, pal])
H1(w('Un') - .02, w('sólo') - .05, [['Un', w('Un'), 0], ['día', w('día'), 0], ['más', w('más'), 1]])
H1(w('sólo') - .02, w('día', 2) - .35, [['¡Solo', w('sólo'), 0], ['uno', w('uno'), 0], ['más!', w('más', 2), 1]])
H1(w('Un', 2) - .02, w('no') - .05, [['Un', w('Un', 2), 0], ['día', w('día', 2), 0], ['más', w('más', 3), 1]])
H1(w('no') - .02, w('ir') + .9, [['¡No', w('no'), 0], ['me', w('me'), 0], ['quiero', w('quiero'), 0], ['ir!', w('ir'), 1]])
H1(w('Un', 3) - .02, w('sólo', 2) - .05, [['Un', w('Un', 3), 0], ['día', w('día', 3), 0], ['más', w('más', 4), 1]])
H1(w('sólo', 2) - .02, w('Honduras') - .1, [['¡Solo', w('sólo', 2), 0], ['uno', w('uno', 2), 0], ['más!', w('más', 5), 1]])
H1(w('Honduras') - .05, w('no', 2) - .05, [['Honduras', w('Honduras'), 0], ['Secreta', w('secreta'), 1]])
H1(w('no', 2) - .02, w('Honduras', 2) - .05, [['¡No', w('no', 2), 0], ['me', w('me', 3), 0], ['quiero', w('quiero', 2), 0], ['ir!', w('ir', 2), 1]])
SUBS = [[0, w('sólo') - .05, 'One more day'], [w('sólo'), w('día', 2) - .3, 'Just one more!'], [w('día', 2) - .3, w('no') - .05, 'One more day'],
 [w('no'), w('ir') + 1.2, "I don't want to leave"], [w('Sale') - .1, w('Copán') - .1, 'Salt on my skin, the sea of Roatán'],
 [w('Copán') - .05, w('Baleada') - .1, 'Copán tells me its story'], [w('Baleada') - .05, w('avión') - .4, 'Baleadas and sun, your laugh and the drums'],
 [w('avión') - .4, EXT['corte'] + .3, 'and the plane… can leave without me'], [w('Un', 3), w('sólo', 2) - .05, 'One more day'],
 [w('sólo', 2), w('Honduras') - .1, 'Just one more!'], [w('Honduras') - .05, w('no', 2) - .05, 'Honduras Secreta'], [w('no', 2), w('Honduras', 2) - .05, "I don't want to leave!"],
 [w('Honduras', 2) - .05, total, 'Honduras Secreta — more than you imagine!']]
LUG = [[b(19) + .1, b(22) - .1, 'COSTA GARÍFUNA'], [b(27) + .1, b(28.5) - .05, 'ROATÁN'], [b(28.5) + .1, b(31.8) - .1, 'COPÁN RUINAS'], [b(33) + .15, b(35.8), 'LA CEIBA'], [b(44) + .1, b(46.5) - .1, 'WEST END · ROATÁN']]
S = {'tel': [b(36.4) + .1, b(38) - .1], 'fin': w('Honduras', 2) - .1, 'lema': w('imaginas') - .6, 'atardecer': b(38), 'logo_ini': [.15, 2.0], 'noche': [b(41), b(57)]}
GOLPES = [[b(n), 1.0 if n % 2 == 0 else .7] for n in list(range(17, 24))] + [[b(n), .6] for n in range(49, 57, 2)] + [[b(n), 1.0 if n % 4 == 0 else .5] for n in range(57, 69)] + [[0.05, .8], [b(4), 1], [b(8), .8], [w('Honduras'), 1.3], [w('Honduras', 2), 1.3]]
json.dump({'C': C, 'hook': H, 'subs': SUBS, 'lugares': LUG, 's': S, 'golpes': GOLPES, 'total': total}, open('codigo/tiempos.json', 'w'), ensure_ascii=False, indent=1)
print('ok', len(C), 'tomas; fin', S['fin'], 'total', total)
