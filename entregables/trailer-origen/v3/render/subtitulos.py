"""Subtítulos por frase (y por palabra, para el resaltado) a partir de palabras.json y tiempos.json."""
import json, re, unicodedata
T = json.load(open('tiempos.json')); W = json.load(open('palabras.json'))
CH = [[("Somos más de", 3), ("600 millones de personas.", 4)],
      [("20 países…", 2), ("y el dinero,", 3), ("partido por fronteras.", 3)],
      [("Mandar dinero de un país a otro", 7), ("puede tardar días.", 3), ("Y en cada frontera…", 4), ("algo se queda en el camino.", 6)],
      [("¿Y si todos midiéramos", 4), ("con la misma regla?", 4)],
      [("Una que el mundo entiende", 5), ("desde hace miles de años…", 5), ("el oro.", 2)],
      [("Toma un gramo de oro.", 5), ("Divídelo en 55 partes.", 4)],
      [("Cada parte es un gramín.", 5), ("Y un gramín… es un ORIGEN.", 6)],
      [("Si el oro sube, ORIGEN sube.", 6), ("Si baja, baja.", 3), ("Siempre el precio real del oro…", 6), ("a la vista, en tu pantalla.", 6)],
      [("Un comerciante en Guadalajara", 4), ("le paga a su proveedor en Lima…", 7), ("en segundos.", 2), ("De celular a celular.", 4)],
      [("Y si dejamos de ser fragmentos…", 6), ("si hablamos el mismo idioma", 5), ("con el dinero…", 3)],
      [("¿Nos convertimos en", 3), ("una potencia mundial?", 3)],
      [("ORIGEN.", 1), ("De Latinoamérica,", 2), ("para Latinoamérica.", 2), ("Y para el mundo.", 4)],
      [("Conócelo en ordenglobal.org", 4)]]
fr = T['frases']; subs = []; i = 0
for k, chs in enumerate(CH):
    n = sum(c for _, c in chs); seg = W[i:i + n]; off = fr[k]['ini'] - seg[0][1]; j = 0
    for txt, c in chs:
        ws = seg[j:j + c]; pal = txt.split()
        # tiempo por palabra mostrada: exacto si coincide el conteo, si no, repartido
        if len(pal) == c: tw = [round(w[1] + off, 3) for w in ws]
        else:
            a, b = ws[0][1] + off, ws[-1][2] + off
            tw = [round(a + (b - a) * q / len(pal), 3) for q in range(len(pal))]
        subs.append({'t0': round(ws[0][1] + off, 3), 't1': round(ws[-1][2] + off, 3), 'txt': txt, 'pal': tw, 'f': k + 1}); j += c
    i += n
assert i == len(W), (i, len(W))
for a, b in zip(subs, subs[1:]): a['t1'] = round(min(a['t1'] + .35, b['t0'] - .02), 3)
subs[-1]['t1'] += .6
def ts(x): return f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round((x-int(x))*1000))%1000:03d}"
open('../ORIGEN-v3-subtitulos.srt', 'w').write('\n'.join(f"{n+1}\n{ts(s['t0'])} --> {ts(s['t1'])}\n{s['txt']}\n" for n, s in enumerate(subs)))
open('datos.js', 'w').write('window.TIEMPOS=' + json.dumps(T, ensure_ascii=False) + ';\nwindow.SUBS=' + json.dumps(subs, ensure_ascii=False) + ';\n')
print(len(subs), 'subtítulos; duración', T['duracion'])
