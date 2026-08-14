#!/usr/bin/env python3
"""Graba con Piper todas las frases fijas del cerebro.

Por que grabar de antemano en vez de sintetizar en vivo:

  · La presentacion es un GUION. No cambia entre una reunion y la siguiente,
    asi que sintetizarla cada vez es pagar el mismo trabajo mil veces.
  · Grabada suena mejor: se puede usar el modelo lento y bueno sin que a
    nadie le importe que tarde diez segundos por frase.
  · Y en la reunion no hay latencia ni dependencia de red: es un fichero.

La respiracion --las pausas de `trozos()`-- se hornea DENTRO del fichero:
cada trozo se sintetiza aparte y se pegan con su silencio en medio. Asi el
audio suena igual que la voz del navegador con RESPIRA puesta, y el cerebro
solo tiene que reproducir un fichero por frase.

  python3 rendir.py frases.json salida/          # todo
  python3 rendir.py frases.json salida/ --solo recorrido,acto2

La clave de cada fichero es un FNV-1a de 32 bits del texto ya limpio. La
misma funcion esta escrita en el cerebro; si el texto cambia una coma, la
clave cambia y el cerebro deja de encontrar el audio y vuelve solo a la voz
del navegador. Eso es a proposito: mejor la voz de siempre que un audio que
dice otra cosa que el subtitulo.
"""
import json, os, sys, wave, io
import numpy as np

# Voz por idioma. Se eligen medium y no high a proposito: la diferencia se
# oye poco y la alta tarda cinco veces mas, lo que importa cuando son
# cuatrocientas frases. La de Mexico es la que hay para espanol latino.
VOCES = {
    'es': 'es_MX-claude-high',
    'en': 'en_GB-alan-medium',
}
MODELOS = os.environ.get('PIPER_VOCES', os.path.dirname(os.path.abspath(__file__)) + '/modelos')

# Como lee. Elegido de oido por Jose el 14-ago entre cinco variantes: esta es
# la que sonaba mas humana sin sonar lenta.
#   length_scale  1.12 -> un poco mas despacio; en narracion se lee humano
#   noise_scale   0.75 -> algo mas de color en la voz
#   noise_w_scale 1.00 -> cada fonema no dura siempre exactamente lo mismo,
#                         que es la diferencia entre una persona y un reloj
COMO_LEE = dict(length_scale=1.12, noise_scale=0.75, noise_w_scale=1.0)


def clave(texto, voz):
    """FNV-1a de 32 bits. Tiene gemelo en index.html; si cambia uno, cambia
    el otro o el cerebro deja de encontrar los ficheros."""
    h = 0x811c9dc5
    for b in (voz + '|' + texto).encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xffffffff
    return format(h, '08x')


def silencio(seg, hz):
    return np.zeros(int(seg * hz), dtype=np.float32)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    frases = json.load(open(sys.argv[1], encoding='utf-8'))
    destino = sys.argv[2].rstrip('/')
    solo = None
    if '--solo' in sys.argv:
        solo = set(sys.argv[sys.argv.index('--solo') + 1].split(','))
    os.makedirs(destino, exist_ok=True)

    from piper import PiperVoice, SynthesisConfig
    import soundfile as sf
    ajuste = SynthesisConfig(**COMO_LEE)

    cargadas = {}
    def voz_de(idi):
        nombre = VOCES[idi]
        if nombre not in cargadas:
            ruta = MODELOS + '/' + nombre + '.onnx'
            if not os.path.exists(ruta):
                raise SystemExit('falta el modelo %s\n'
                                 'descargalo con descargar-modelos.sh' % ruta)
            cargadas[nombre] = PiperVoice.load(ruta)
        return nombre, cargadas[nombre]

    manifiesto = {}
    hechas = saltadas = 0
    for f in frases:
        if solo and f['origen'].split(':')[0] not in solo:
            continue
        nombre, voz = voz_de(f['idioma'])
        k = clave(f['texto'], nombre)
        fichero = k + '.mp3'
        manifiesto[k] = {'f': fichero, 'i': f['idioma'], 'o': f['origen']}
        ruta = destino + '/' + fichero
        if os.path.exists(ruta) and os.path.getsize(ruta) > 400:
            saltadas += 1
            continue

        # cada trozo aparte, y su silencio detras: eso es la respiracion
        trozos = f.get('trozos') or [[f['texto'], 300]]
        piezas, hz = [], 22050
        for i, (txt, espera) in enumerate(trozos):
            buf = io.BytesIO()
            with wave.open(buf, 'wb') as w:
                voz.synthesize_wav(txt, w, syn_config=ajuste)
            buf.seek(0)
            with wave.open(buf) as w:
                hz = w.getframerate()
                cru = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
            piezas.append(cru.astype(np.float32) / 32768.0)
            if i < len(trozos) - 1:
                piezas.append(silencio(espera / 1000.0, hz))
        audio = np.concatenate(piezas) if piezas else silencio(0.2, hz)
        # mp3 por tamano: en wav la presentacion entera pasa de treinta megas
        sf.write(ruta, audio, hz, format='MP3')
        hechas += 1
        print('%-9s %s  %5.1fs  %s' % (f['idioma'], k, len(audio) / hz,
                                       f['texto'][:52]), flush=True)

    json.dump(manifiesto, open(destino + '/manifiesto.json', 'w'),
              ensure_ascii=False, separators=(',', ':'))
    total = sum(os.path.getsize(destino + '/' + v['f'])
                for v in manifiesto.values()
                if os.path.exists(destino + '/' + v['f']))
    print('\ngrabadas %d, ya estaban %d, %d en el manifiesto, %.1f MB'
          % (hechas, saltadas, len(manifiesto), total / 1e6))
    return 0


if __name__ == '__main__':
    sys.exit(main())
