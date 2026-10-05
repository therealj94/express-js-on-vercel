"""v9: arma codigo/tiempos_{lang}.json. Cada momento sale de las palabras de las voces (faster-whisper)."""
import json, sys
lang = sys.argv[1] if len(sys.argv) > 1 else 'es'
P9 = json.load(open('v9es/palabras.json')); P7 = {k.replace('.mp3', ''): v for k, v in json.load(open('v7es/palabras.json')).items()}
# voz → (archivo, palabras)
A = {'V0': 'v9es/V0_b', 'V1': 'v7es/V1_b', 'V2': 'v9es/V2_a', 'U': 'v9es/U_a', 'CA': 'v7es/CA_b', 'CB': 'v9es/CB_b', 'V3': 'v9es/V3_b',
     'V4': 'v9es/V4_b', 'VC': 'v9es/VC_a', 'V5n': 'v9es/V5n_a', 'VW': 'v9es/VW_b', 'V7': 'v9es/V7_a', 'V8': 'v7es/V8_b'}
def pal(k): d, n = A[k].split('/'); return (P9 if d == 'v9es' else P7)[n]
def dur(k): return pal(k)[-1][2]
V = {}; t = 0.6
def pon(k, a): V[k] = round(a, 2); return a + dur(k)
fin = pon('V0', .6); a0 = fin + .3
fin = pon('V1', a0 + 4.4); caida = fin + .6
fin = pon('V2', caida + 2.2); conv0 = fin + .8
fin = pon('U', conv0); fin = pon('CA', fin + .5); fin = pon('CB', fin + .6)
equipo = fin + .3; fin = pon('V3', equipo + .2); montaje = fin + .6
fin = pon('V4', montaje + .2); chat = fin + .6
fin = pon('VC', chat + .4); oro0 = fin + .4
fin = pon('V5n', oro0 + 1.0); escritorio = fin + .5
fin = pon('VW', escritorio + .6); eco = fin + .5
fin = pon('V7', eco + .2)
def w(v, palabra, n=1, fin=False):
    k = 0
    for p, a, b in pal(v):
        if p.lower().strip('.,!?¡¿…') == palabra.lower():
            k += 1
            if k == n: return round(V[v] + (b if fin else a), 2)
    raise SystemExit(f'{v} sin «{palabra}»')
s = dict(punto=.3, g1=V['V0'], g2=w('V0', 'de'), a0=a0, grid=V['V1'] - .8, dia=V['V1'], caida=caida, hola=V['V2'], conv0=conv0,
         ca=V['CA'], cb=V['CB'], equipo=equipo, montaje=montaje, chat=chat, oro0=oro0, v5=V['V5n'], escritorio=escritorio, eco=eco)
s.update(ca1=w('CA', 'no'), ca2=w('CA', 'mañana'), ca3=w('CA', 'y'), cb_mem=w('CB', 'recuerdo'),
         claudio=w('V3', 'claudio'), antonio=w('V3', 'antonio'), cuida=w('V3', 'y'),
         f_mem=w('V4', 'recuerdo'), f_correo=w('V4', 'ordeno'), f_post=w('V4', 'escribo'), f_compu=w('V4', 'y'),
         c_reply=w('VC', 'escribo'), c_si=w('VC', 'sí', fin=True), firma=w('V5n', 'tú'), visa=w('V5n', 'y'),
         w_oye=w('VW', 'oye'), w_apps=w('VW', 'abro'), w_junta=w('VW', 'aviso'), w_msj=w('VW', 'leo'), w_mus=w('VW', 'pongo'),
         e1=w('V7', 'tu'), e2=w('V7', 'tu', 2), e3=w('V7', 'tus'), e4=w('V7', 'tu', 3), unlugar=w('V7', 'todo'))
s['notch'] = s['w_oye'] - .7; s['formula'] = s['v5']; s['recibo'] = s['firma'] + 1.0; s['congela'] = s['visa'] + 1.8
s['aF'] = s['unlugar'] + 2.4; s['firmaF'] = s['aF'] + .7
V['V8'] = round(s['aF'] + .3, 2)
clips = [dict(k='C3', a=s['equipo'], b=s['claudio'], off=.3, fo=.01),
         dict(k='C1', a=s['claudio'], b=s['antonio'], off=3.4, fi=.01, fo=.01),
         dict(k='C2', a=s['antonio'], b=s['cuida'], off=1.2, fi=.01),
         dict(k='C4', a=s['montaje'], b=s['f_mem'], off=1.5),
         dict(k='C5', a=s['f_correo'], b=s['f_post'], off=1.8, fo=.01),
         dict(k='C6', a=s['f_post'], b=s['f_compu'], off=1.0, fi=.01),
         dict(k='C8', a=s['escritorio'], b=s['notch'], off=1.0),
         dict(k='C9', a=s['unlugar'] + .6, b=s['aF'], off=.3)]
for c in clips: c['n'] = 155
orden = ['reloj', 'cafe', 'calendario', 'sobre', 'pastel', 'regalo', 'libreta', 'avion', 'telefono', 'laptop', 'tarjeta', 'bolsa',
         'cartera', 'llave', 'boleto', 'audifonos', 'chat', 'nota', 'foco', 'planta']
total = round(s['aF'] + 4.7, 2)
json.dump({'s': s, 'total': total, 'lang': lang, 'voces': V, 'archivos': {k: A[k] + '.mp3' for k in V}, 'clips': clips,
           'objetos': [f'assets/obj/{n}.png' for n in orden]}, open(f'codigo/tiempos_{lang}.json', 'w'), indent=1)
print(V); print({k: s[k] for k in ('g2', 'a0', 'grid', 'conv0', 'equipo', 'montaje', 'chat', 'oro0', 'escritorio', 'w_oye', 'w_apps', 'w_junta', 'w_msj', 'w_mus', 'eco', 'aF')}, total)
