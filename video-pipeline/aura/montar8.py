"""v8 (inglés): arma codigo/tiempos_en.json. Cada momento sale de las palabras de la voz de AURA (faster-whisper)."""
import json
PAL = json.load(open('v6/palabras.json'))
TOMA = {'V1': 'b', 'V2': 'b', 'CA': 'a', 'CB': 'a', 'V3': 'b', 'V4': 'b', 'VC': 'a', 'V5n': 'a', 'V6': 'a', 'V7': 'a', 'V8': 'b'}
V = {'V1': 7.0, 'V2': 12.4, 'CA': 16.0, 'CB': 24.4, 'V3': 31.8, 'V4': 41.2, 'VC': 51.6, 'V5n': 57.0, 'V6': 67.0, 'V7': 70.8}
def w(v, palabra, n=1, fin=False):
    k = 0
    for p, a, b in PAL[f'{v}_{TOMA[v]}']:
        if p.lower().strip('.,!?…') == palabra.lower():
            k += 1
            if k == n: return round(V[v] + (b if fin else a), 2)
    raise SystemExit(f'{v} sin «{palabra}»')
s = dict(punto=.6, a0=2.0, grid=6.0, dia=7.0, caida=10.2, hola=12.4, conv0=14.6, ca=V['CA'], cb=V['CB'],
         equipo=31.6, montaje=41.0, chat=51.2, oro0=56.0, v5=V['V5n'], escritorio=66.4, notch=68.4, eco=70.6)
s.update(ca1=w('CA', 'nope'), ca2=w('CA', "it's"), ca3=w('CA', 'and'), cb_mem=w('CB', 'remember'),
         claudio=w('V3', 'claudio'), antonio=w('V3', 'antonio'), cuida=w('V3', 'and'),
         f_mem=w('V4', 'i', 2), f_correo=w('V4', 'i', 3), f_post=w('V4', 'i', 4), f_compu=w('V4', 'and'),
         c_reply=w('VC', 'write'), c_si=w('VC', 'yes', fin=True), firma=w('V5n', 'you'), visa=w('V5n', 'and'),
         e1=w('V7', 'your'), e2=w('V7', 'your', 2), e3=w('V7', 'your', 3), e4=w('V7', 'your', 4), unlugar=w('V7', 'all'))
s['formula'] = s['v5']; s['recibo'] = s['firma'] + 1.0; s['congela'] = s['visa'] + 1.8
s['aF'] = s['unlugar'] + 2.4; s['firmaF'] = s['aF'] + .7
clips = [dict(k='C3', a=s['equipo'], b=s['claudio'], off=.3, fo=.01),
         dict(k='C1', a=s['claudio'], b=s['antonio'], off=3.4, fi=.01, fo=.01),
         dict(k='C2', a=s['antonio'], b=s['cuida'], off=1.2, fi=.01),
         dict(k='C4', a=s['montaje'], b=s['f_mem'], off=1.5),
         dict(k='C5', a=s['f_correo'], b=s['f_post'], off=1.8, fo=.01),
         dict(k='C6', a=s['f_post'], b=s['f_compu'], off=1.0, fi=.01),
         dict(k='C8', a=s['escritorio'], b=s['notch'], off=1.6),
         dict(k='C9', a=s['unlugar'] + .6, b=s['aF'], off=.3)]
for c in clips: c['n'] = 155
voces = dict(V); voces['V8'] = s['aF'] + .3
orden = ['reloj', 'cafe', 'calendario', 'sobre', 'pastel', 'regalo', 'libreta', 'avion', 'telefono', 'laptop', 'tarjeta', 'bolsa',
         'cartera', 'llave', 'boleto', 'audifonos', 'chat', 'nota', 'foco', 'planta']
json.dump({'s': s, 'total': round(s['aF'] + 4.7, 2), 'lang': 'en', 'voces': voces, 'toma': TOMA, 'clips': clips,
           'objetos': [f'assets/obj/{n}.png' for n in orden]}, open('codigo/tiempos_en.json', 'w'), indent=1)
print({k: s[k] for k in ('ca1', 'ca2', 'ca3', 'cb_mem', 'claudio', 'cuida', 'f_compu', 'c_reply', 'c_si', 'firma', 'visa', 'unlugar', 'aF')}, s['aF'] + 4.7)
