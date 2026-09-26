#!/usr/bin/env python3
"""Voces del animatic con Gemini TTS (capa gratuita de Google AI Studio). Cada personaje con su voz, su acento
y su dirección de actuación entre corchetes; el modelo no lee los corchetes."""
import json, base64, urllib.request, urllib.error, pathlib, time, io, wave, sys
import numpy as np
from scipy import signal
AQUI = pathlib.Path(__file__).parent; OUT = AQUI / 'voz'; OUT.mkdir(exist_ok=True)
KEY = (AQUI.parent / '.gk').read_text().strip()
MODELO = 'gemini-3.8-flash-tts'; SR = 48000

def tts(texto, voz):
    cuerpo = {"contents": [{"parts": [{"text": texto}]}],
              "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}}}}}
    for intento in range(8):
        req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{MODELO}:generateContent',
                                     data=json.dumps(cuerpo).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
        try:
            with urllib.request.urlopen(req, timeout=180) as r: d = json.load(r)
            raw = base64.b64decode(d['candidates'][0]['content']['parts'][0]['inlineData']['data'])
            if raw[:4] == b'RIFF':
                with wave.open(io.BytesIO(raw)) as w: sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2') / 32768
            else: sr = 24000; x = np.frombuffer(raw, '<i2') / 32768
            return x.astype(np.float64), sr
        except urllib.error.HTTPError as e:
            cuerpo_err = e.read().decode()[:300]
            if e.code in (429, 500, 503):
                espera = 20 * (intento + 1); print(f'   {e.code}, espero {espera} s', flush=True); time.sleep(espera); continue
            raise RuntimeError(f'{e.code} {cuerpo_err}')
    raise RuntimeError('sin cuota tras reintentos')

def a48(x, sr):
    from math import gcd
    g = gcd(SR, sr); return signal.resample_poly(x, SR // g, sr // g)
def limpiar(x):
    x = x - np.mean(x); umbral = 0.03 * np.abs(x).max(); idx = np.where(np.abs(x) > umbral)[0]
    if len(idx): x = x[max(0, idx[0] - int(0.02*SR)): idx[-1] + int(0.10*SR)]
    n = int(0.01*SR); x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n)
    return x / (np.sqrt(np.mean(x**2)) + 1e-9) * 0.1

# reparto: voz de Gemini + dirección (acento y tono). Ninguna voz se repite entre personajes.
REPARTO = {
 'repartidor':   ('Zubenelgenubi', 'hombre joven del Caribe, acento caribeño, seco, cerca del micrófono, sin actuar'),
 'enfermera':    ('Kore',          'mujer de 38 años, acento andino, cansada, seca, sin actuar'),
 'estudiante':   ('Leda',          'muchacha de 19 años, acento mexicano, voz baja, seca, sin actuar'),
 'costurera':    ('Sulafat',       'mulher brasileira de 35 anos, sotaque paulista, cansada, seca'),
 'vendedora':    ('Gacrux',        'mujer mayor de 62 años, vendedora de mercado, acento andino, firme y cálida, sin prisa'),
 'barbero':      ('Algieba',       'hombre de 41 años, acento rioplatense, seco, directo'),
 'minero':       ('Algenib',       'minero de 41 años, voz grave y áspera, cansado, lento, acento centroamericano'),
 'operadora':    ('Erinome',       'mujer caribeña de 38 años, clara, tranquila, segura'),
 'ingeniera':    ('Autonoe',       'engenheira brasileira de 29 anos, segura, técnica, calma'),
 'cumplimiento': ('Alnilam',       'hombre de 34 años, firme, neutro, bajo'),
}
LINEAS = [
 (1, 'repartidor', 'Metí la plata del alquiler.'), (2, 'enfermera', 'Metí el aguinaldo.'), (3, 'estudiante', 'Metí la quincena.'),
 (4, 'costurera', 'Botei o salário. Ninguém me avisou.'), (5, 'vendedora', 'Un gramo pesa igual en todas partes.'),
 (6, 'vendedora', 'Pésalo.'), (7, 'barbero', 'Al principio no pedían nada.'), (8, 'estudiante', 'Después pidieron mi cara.'),
 (9, 'estudiante', 'Nadie me explicó nada.'), (10, 'costurera', 'Disseram que dobrava.'), (11, 'enfermera', 'La siguiente ni llegó.'),
 (111, 'vendedora', 'La siguiente ni llegó.'), (12, 'minero', 'No nos faltó coraje. Nos faltó peso.'), (13, 'minero', 'Esto sale de acá.'),
 (14, 'operadora', 'Un gramo, partido en cincuenta y cinco.'), (15, 'operadora', 'Eso es un Origen.'),
 (16, 'ingeniera', 'São sete máquinas nossas.'), (17, 'ingeniera', 'Origen se move sem taxa de rede.'),
 (18, 'estudiante', 'No la doy en cada aplicación.'), (19, 'estudiante', 'Me revisó una persona.'), (20, 'cumplimiento', 'Nadie se aprueba solo.'),
 (21, 'repartidor', 'Reparto.'), (22, 'vendedora', 'Vendo verdura.'), (23, 'costurera', 'Eu costuro.'), (24, 'barbero', 'Corto pelo.'),
 (25, 'operadora', 'Peso oro.'), (26, 'minero', 'Saco piedra.'), (31, 'repartidor', 'Esta vez lo pesé.'),
 (32, 'vendedora', 'No te pedimos que creas.'), (33, 'vendedora', 'Pésalo.'),
]
EXTRA = {6: 'casi para sí, en voz baja', 12: 'muy despacio, en la oscuridad, cada frase pesa', 31: 'tranquilo, casi sonriendo, en voz baja',
         32: 'mirando el plato, sin prisa', 33: 'a la cámara, firme, una sola palabra que cierra todo'}
def voz_de(n, quien, texto):
    voz, dirigir = REPARTO[quien]
    if n in EXTRA: dirigir += ', ' + EXTRA[n]
    x, sr = tts(f'[{dirigir}] {texto}', voz)
    return limpiar(a48(x, sr))

if __name__ == '__main__':
    solo = {int(a) for a in sys.argv[1:]} if len(sys.argv) > 1 else None
    dur = json.load(open(OUT / 'duraciones.json')) if (OUT / 'duraciones.json').exists() else {}
    for n, quien, texto in LINEAS:
        if solo and n not in solo: continue
        x = voz_de(n, quien, texto); np.save(OUT / f'{n:03d}.npy', x); dur[str(n)] = round(len(x) / SR, 2)
        print(f'{n:3d} {quien:12} {dur[str(n)]:5.2f} s  {texto}', flush=True)
        json.dump(dur, open(OUT / 'duraciones.json', 'w'), indent=1)
    if not solo or 30 in solo:
        partes = [voz_de(0, q, 'Un gramo pesa igual en todas partes.') for q in ('vendedora', 'repartidor', 'estudiante', 'enfermera', 'barbero', 'minero')]
        partes.append(limpiar(a48(*tts('[mulher brasileira, junto com outras vozes] Um grama pesa igual em todo lugar.', 'Sulafat'))))
        largo = len(partes[0]); coro = np.zeros(largo)
        for i, p in enumerate(partes):
            p = signal.resample(p, largo) if abs(len(p) - largo) < 0.3*largo else np.pad(p, (0, max(0, largo - len(p))))[:largo]
            coro += p * (1.0 if i == 0 else 0.5)
        coro = limpiar(coro); np.save(OUT / '030.npy', coro); dur['30'] = round(len(coro) / SR, 2)
        print(' 30 coro         ', dur['30'], 's'); json.dump(dur, open(OUT / 'duraciones.json', 'w'), indent=1)
