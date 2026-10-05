"""Dr Electrum: arma codigo/tiempos.json (voces, tomas y momentos clave)."""
import json
P = json.load(open('v/palabras.json'))
TOMA = {'E01': 'E01_b', 'T01': 'T01_b', 'E02': 'E02_b', 'T02': 'T02_a', 'E03': 'E03_b', 'T03': 'T03_b', 'E04': 'E04_a', 'E05': 'E05_a',
        'T04': 'T04s_a', 'E06': 'E06_a', 'C01': 'C01_a', 'E07': 'E07n_a', 'C02': 'C02_b', 'E08': 'E08_a', 'E09': 'E09_b', 'E10': 'E10_b',
        'E11': 'E11_a', 'E12': 'E12_b', 'N01': 'N01_a', 'C03': 'C03_a', 'E13': 'E13_a', 'E14': 'E14_b', 'C04': 'C04_a'}
RECORTE = {'E03': 1.55}   # silencio al inicio de la toma
def fin(k): return P[TOMA[k]][-1][2] - RECORTE.get(k, 0)
def pal(k, w, n=1):
    c = 0
    for p, a, b in P[TOMA[k]]:
        if p.lower().strip('.,!?¡¿…') == w.lower():
            c += 1
            if c == n: return round(V[k] + a - RECORTE.get(k, 0), 2)
    raise SystemExit(f'{k} sin {w}')
V = {}
def pon(k, t): V[k] = round(t, 2); return t + fin(k)
f = pon('E01', 3.2)
f = pon('T01', f + .7)
f = pon('E02', f + 1.0)
f = pon('T02', f + 1.0); f = pon('E03', f + .4)
f = pon('T03', f + 1.0); f = pon('E04', f + .4)
f = pon('E05', f + .8); f = pon('T04', f + .4); f = V['T04'] + 2.68   # mantiene el tiempo de la toma anterior
f = pon('E06', f + .9)
f = pon('C01', f + .9); f = pon('E07', f + .4)
f = pon('C02', f + .9); f = pon('E08', f + .4)
f = pon('C03', f + .8); f = pon('E13', f + .4); f = pon('E14', f + .6); f = pon('C04', f + .2)
E09_VIEJO = 87.69; f = E09_VIEJO + round((f + .9 - E09_VIEJO) * 30) / 30 - .0001   # desplazamiento en cuadros enteros
f = pon('E09', f)
f = pon('E10', f + .8)
f = pon('E11', f + .9)
f = pon('E12', f + .9); f = pon('N01', f + .9)
S = dict(martillo=.75, aereo=3.0, papeles=V['T01'] - .4, heroe=V['E02'] - .5, titulo=pal('E02', 'soy'),
         mapa=V['T02'] - .5, mapa_cod=V['T02'] + 2.2, n176=pal('E03', 'se'), campo=V['T03'] - .4, gps=V['E04'] - .3,
         semaforo=V['E05'] - .4, rojo=pal('E05', 'semáforo'), tatiana=V['T04'], geo=V['E06'] - .4, indicio=pal('E06', 'eso'),
         nucleo=V['C01'] - .4, docs=V['E07'] - .3, cita=pal('E07', 'pagina'), cuenta=V['C02'] - .4, bruto=V['E08'],
         planta=V['E13'] - .4, p_tri=pal('E13', 'trituración'), p_mol=pal('E13', 'molienda'), p_tan=pal('E13', 'tanques'), p_fun=pal('E13', 'fundición'),
         p_armo=pal('E13', 'armo'), p_agua=pal('E14', 'agua'), p_rel=pal('E14', 'relaves'), p_cia=pal('E14', 'cianuro'), p_com=pal('E14', 'comunidad'), pclip=pal('E14', 'así') - .6,
         fisc=V['E09'] - .4, tablero=V['E09'] + 2.6, entreg=V['E10'] - .4, semanas=pal('E10', 'lo'), aprende=V['E11'] - .4,
         cierre=V['E12'] - .4, logo=V['N01'] - .2)
total = round(V['N01'] + fin('N01') + 2.6, 2)
clips = [dict(k='C3', a=.3, b=S['aereo'], off=.2, fi=.15, fo=.01),
         dict(k='C2', a=S['aereo'], b=S['papeles'], off=0, fi=.01, fo=.4),
         dict(k='C4', a=S['papeles'], b=S['heroe'], off=0, fi=.3, fo=.3),
         dict(k='C1', a=S['heroe'], b=S['mapa'], off=0, fi=.4, fo=.01),
         dict(k='C5', a=S['mapa'], b=S['mapa_cod'], off=1.0, fi=.01, fo=.5),
         dict(k='C6', a=S['campo'], b=S['gps'], off=.6, fi=.4, fo=.4),
         dict(k='C7', a=S['nucleo'], b=S['docs'], off=.5, fi=.4, fo=.4),
         dict(k='C11', a=S['pclip'], b=S['fisc'], off=0, fi=.5, fo=.4),
         dict(k='C8', a=S['fisc'], b=S['tablero'], off=1.0, fi=.4, fo=.5),
         dict(k='C9', a=S['entreg'] + 4.6, b=S['aprende'], off=.6, fi=.4, fo=.3),
         dict(k='C10', a=S['aprende'], b=S['cierre'], off=0, fi=.3, fo=.5),
         dict(k='C1', a=S['cierre'], b=S['logo'] + .3, off=1.0, fi=.5, fo=.6)]
for c in clips: c['n'] = 155
json.dump({'s': S, 'voces': V, 'dur': {k: round(fin(k), 2) for k in V}, 'archivos': {k: f'v/{TOMA[k]}.mp3' for k in V}, 'recorte': RECORTE, 'total': total, 'clips': clips},
          open('codigo/tiempos.json', 'w'), indent=1)
print(V); print(S); print('total', total)
