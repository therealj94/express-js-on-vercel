"""v8 en español: arma codigo/tiempos_es.json desde las palabras de la voz de AURA en español (faster-whisper)."""
import json
PAL = {k.replace('.mp3', ''): v for k, v in json.load(open('v7es/palabras.json')).items()}
TOMA = {'V1': 'b', 'V2': 'a', 'CA': 'b', 'CB': 'b', 'V3': 'b', 'V4': 'b', 'VC': 'b', 'V5n': 'b', 'V6': 'a', 'V7': 'b', 'V8': 'b'}
V = {'V1': 7.0, 'V2': 12.4, 'CA': 16.0, 'CB': 25.6, 'V3': 33.0, 'V4': 41.8, 'VC': 52.2, 'V5n': 57.8, 'V6': 68.0, 'V7': 71.6}
def w(v, palabra, n=1, fin=False):
    k = 0
    for p, a, b in PAL[f'{v}_{TOMA[v]}']:
        if p.lower().strip('.,!?¡¿…') == palabra.lower():
            k += 1
            if k == n: return round(V[v] + (b if fin else a), 2)
    raise SystemExit(f'{v} sin «{palabra}»')
s = dict(punto=.6, a0=2.0, grid=6.0, dia=7.0, caida=10.2, hola=12.4, conv0=14.6, ca=V['CA'], cb=V['CB'],
         equipo=32.8, montaje=41.6, chat=51.8, oro0=56.8, v5=V['V5n'], escritorio=67.4, notch=69.4, eco=71.4)
s.update(ca1=w('CA', 'no'), ca2=w('CA', 'mañana'), ca3=w('CA', 'y'), cb_mem=w('CB', 'recuerdo'),
         claudio=w('V3', 'claudio'), antonio=w('V3', 'antonio'), cuida=w('V3', 'y'),
         f_mem=w('V4', 'recuerdo'), f_correo=w('V4', 'ordeno'), f_post=w('V4', 'escribo'), f_compu=w('V4', 'y'),
         c_reply=w('VC', 'escribo'), c_si=w('VC', 'sí', fin=True), firma=w('V5n', 'tú'), visa=w('V5n', 'y'),
         e1=w('V7', 'tu'), e2=w('V7', 'tu', 2), e3=w('V7', 'tus'), e4=w('V7', 'tu', 3), unlugar=w('V7', 'todo'))
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
json.dump({'s': s, 'total': round(s['aF'] + 4.7, 2), 'lang': 'es', 'voces': voces, 'toma': TOMA, 'clips': clips,
           'objetos': [f'assets/obj/{n}.png' for n in orden]}, open('codigo/tiempos_es.json', 'w'), indent=1)
print({k: s[k] for k in ('ca1', 'ca2', 'ca3', 'cb_mem', 'claudio', 'antonio', 'cuida', 'f_mem', 'f_correo', 'f_post', 'f_compu', 'c_reply', 'c_si', 'firma', 'visa', 'unlugar', 'aF')}, s['aF'] + 4.7)
