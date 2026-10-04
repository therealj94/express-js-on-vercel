"""Arma tiempos_{en,es}.json: los segundos de cada momento salen de las palabras de la voz (faster-whisper)."""
import json
V = {'V1': 7.0, 'V2': 12.4, 'V3': 15.6, 'V4': 25.2, 'V5': 37.6, 'V6': 47.0, 'V7': 50.8, 'V8': 58.6}
TOMA = {'en': {'V1': 'b', 'V2': 'b', 'V3': 'b', 'V4': 'b', 'V5': 'a', 'V6': 'a', 'V7': 'a', 'V8': 'b'},
        'es': {'V1': 'b', 'V2': 'a', 'V3': 'b', 'V4': 'b', 'V5': 'b', 'V6': 'a', 'V7': 'b', 'V8': 'b'}}
PAL = {'en': json.load(open('v6/palabras.json')), 'es': {k.replace('.mp3', ''): v for k, v in json.load(open('v7es/palabras.json')).items()}}
def w(lang, v, palabra, n=1):
    lista = PAL[lang][f"{v}_{TOMA[lang][v]}"]; k = 0
    for p, a, b in lista:
        if p.lower().strip('.,¡!¿?') == palabra.lower():
            k += 1
            if k == n: return round(V[v] + a, 2)
    raise SystemExit(f'{lang} {v} sin «{palabra}»')
CLAVES = {  # (voz, palabra, n-ésima) por idioma
 'en': dict(claudio=('V3', 'Claudio'), antonio=('V3', 'Antonio'), cuida=('V3', 'and'), f_mem=('V4', 'I', 2), f_correo=('V4', 'I', 3),
            f_post=('V4', 'I', 4), f_compu=('V4', 'and'), firma=('V5', 'you'), visa=('V5', 'And'), e1=('V7', 'Your'), e2=('V7', 'your', 2),
            e3=('V7', 'your', 3), e4=('V7', 'your', 4), unlugar=('V7', 'all')),
 'es': dict(claudio=('V3', 'Claudio'), antonio=('V3', 'Antonio'), cuida=('V3', 'Y'), f_mem=('V4', 'recuerdo'), f_correo=('V4', 'ordeno'),
            f_post=('V4', 'escribo'), f_compu=('V4', 'y'), firma=('V5', 'tú'), visa=('V5', 'Y'), e1=('V7', 'tu'), e2=('V7', 'tu', 2),
            e3=('V7', 'tus'), e4=('V7', 'tu', 3), unlugar=('V7', 'todo')),
}
orden = ['reloj', 'cafe', 'calendario', 'sobre', 'pastel', 'regalo', 'libreta', 'avion', 'telefono', 'laptop', 'tarjeta', 'bolsa',
         'cartera', 'llave', 'boleto', 'audifonos', 'chat', 'nota', 'foco', 'planta']
for lang in ('en', 'es'):
    s = dict(punto=.6, a0=2.0, grid=6.0, dia=7.0, caida=10.2, hola=12.4, equipo=15.4, montaje=25.0, oro0=35.4,
             escritorio=46.4, notch=48.4, eco=50.6)
    for k, c in CLAVES[lang].items(): s[k] = w(lang, *c)
    s['formula'] = V['V5'] + .3; s['recibo'] = s['firma'] + .8; s['congela'] = s['visa'] + 1.8
    s['aF'] = max(58.3, s['unlugar'] + 2.4); s['firmaF'] = s['aF'] + .7
    clips = [dict(k='C3', a=s['equipo'], b=s['claudio'], off=.3, fo=.01),
             dict(k='C1', a=s['claudio'], b=s['antonio'], off=3.4, fi=.01, fo=.01),
             dict(k='C2', a=s['antonio'], b=s['cuida'], off=1.2, fi=.01),
             dict(k='C4', a=s['montaje'], b=s['f_mem'], off=1.5),
             dict(k='C5', a=s['f_correo'], b=s['f_post'], off=1.8, fo=.01),
             dict(k='C6', a=s['f_post'], b=s['f_compu'], off=1.0, fi=.01),
             dict(k='C7', a=s['formula'] + .45, b=s['firma'] - .05, off=.5, zoom=.06),
             dict(k='C8', a=s['escritorio'], b=s['notch'], off=1.6),
             dict(k='C9', a=s['unlugar'] + .6, b=s['aF'], off=.3)]
    for c in clips: c['n'] = 155
    voces = {k: V[k] for k in V}; voces['V8'] = s['aF'] + .3
    json.dump({'s': s, 'total': round(s['aF'] + 4.7, 2), 'lang': lang, 'voces': voces, 'toma': TOMA[lang], 'clips': clips,
               'objetos': [f'assets/obj/{n}.png' for n in orden]}, open(f'codigo/tiempos_{lang}.json', 'w'), indent=1)
    print(lang, {k: s[k] for k in ('claudio', 'antonio', 'cuida', 'f_mem', 'f_correo', 'f_post', 'f_compu', 'firma', 'visa', 'unlugar', 'aF')})
