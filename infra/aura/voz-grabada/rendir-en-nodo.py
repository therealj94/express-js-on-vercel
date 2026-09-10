#!/usr/bin/env python3
"""Graba las frases fijas de AU-RA con SU voz — la del motor del nodo.

Corre EN el nodo con GPU, contra el servicio de voz ya levantado:

    python3 rendir-en-nodo.py /tmp/frases.json /tmp/voz-aura/

── POR QUÉ CONTRA EL SERVICIO Y NO CARGANDO EL MODELO ────────────────────────

El modelo ya está en la memoria de video del servicio (aura-voz). Cargarlo
otra vez aquí pediría otros 3,2 GB que la T4 no tiene sueltos, y encima
grabaría con OTRA instancia — cualquier diferencia de versión o de semilla y
las frases fijas sonarían distinto de la voz en vivo, que es exactamente el
«voces cruzadas» que esto viene a enterrar.

Así que cada frase es un POST a /decir en localhost, con su idioma. El
servicio atiende de a un trozo por el candado de la GPU, y las charlas en
vivo se INTERCALAN entre frase y frase: grabar no deja muda a AU-RA.

── REANUDABLE A PROPÓSITO ────────────────────────────────────────────────────

Si un fichero ya existe y no está vacío, se salta. Doscientas frases son
veinte minutos de motor, y un corte a los quince no puede costar volver a
empezar: se relanza y sigue donde iba.
"""

import json
import pathlib
import sys
import time
import urllib.request

VOZ = 'calida'          # el registro de siempre; los otros dos son para montos
MOTOR = 'http://127.0.0.1:8123/decir'


def rendir(frase, destino):
    cuerpo = json.dumps({'texto': frase['texto'], 'voz': VOZ,
                         'idioma': frase['idioma']}).encode()
    peticion = urllib.request.Request(
        MOTOR, data=cuerpo, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(peticion, timeout=300) as r:
        mp3 = r.read()
        segundos = float(r.headers.get('X-Duracion') or 0)
    if len(mp3) < 400:
        raise RuntimeError(f'mp3 sospechosamente chico: {len(mp3)} bytes')
    destino.write_bytes(mp3)
    return segundos


def main():
    frases = json.loads(pathlib.Path(sys.argv[1]).read_text())
    carpeta = pathlib.Path(sys.argv[2])
    carpeta.mkdir(parents=True, exist_ok=True)
    hechas = fallos = 0
    t0 = time.time()
    for i, f in enumerate(frases):
        destino = carpeta / f"{f['k']}.mp3"
        if destino.exists() and destino.stat().st_size > 400:
            continue
        try:
            seg = rendir(f, destino)
            hechas += 1
            print(f"{i + 1}/{len(frases)} {f['k']} ({f['idioma']}) "
                  f"{seg:.1f}s · {f['texto'][:50]!r}", flush=True)
        except Exception as e:
            # una frase caída no tumba la grabación: se apunta y se sigue,
            # y esa frase queda cayendo a la voz del navegador hasta el
            # próximo intento — que por ser reanudable cuesta solo relanzar
            fallos += 1
            print(f"FALLO {f['k']}: {type(e).__name__} {str(e)[:120]}", flush=True)
    print(f"LISTO: {hechas} grabadas, {fallos} fallos, "
          f"{time.time() - t0:.0f}s", flush=True)


if __name__ == '__main__':
    main()
