#!/usr/bin/env python3
"""Fabrica por adelantado la voz de TODO el guion, para que nadie espere.

    /srv/voz/entorno/bin/python templar-voz.py            # todo
    /srv/voz/entorno/bin/python templar-voz.py --ver      # solo dice que falta

── POR QUE ─────────────────────────────────────────────────────────────────

Con la memoria puesta (`vozmemoria.py`), la SEGUNDA persona que oye una frase
la recibe al instante. Medido en el nodo:

    frase típica  →  8,42 s la primera  ·  0,00 s la siguiente
    frase larga   → 20,59 s la primera  ·  0,00 s la siguiente

Queda la primera. Y la primera es siempre alguien de verdad esperando veinte
segundos por algo que vamos a decir mil veces igual.

El guion es TEXTO FIJO: treinta nodos escritos, los mismos para todo el mundo.
No hay ninguna razon para descubrirlos en vivo uno por uno. Se fabrican aca, de
una sentada, cuando no hay nadie del otro lado.

── LO QUE NO SE PUEDE ADELANTAR ────────────────────────────────────────────

Lo que lleva el nombre de la persona. «Dale, {nombre}» es un texto distinto por
cada quien y no se puede tener hecho — eso lo fabrica la voz en vivo, como
hasta ahora.

Se adelanta la version SIN nombre, que es exactamente la que recibe alguien que
todavia no nos dijo como se llama: la puerta de entrada, que es donde mas gente
pasa y donde peor sienta esperar.

Es la misma regla que usa `voz-grabada/sacar-frases.mjs` para las frases de la
app: lo que lleva hueco no se graba.
"""

import json
import pathlib
import sys
import time
import urllib.request

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import guion   # noqa: E402

VOZ = 'http://127.0.0.1:8123/decir'
ESPERA = 300


def _pedir(texto, idioma, solo_mirar=False):
    """Devuelve los segundos que tardo, o `None` si ya estaba."""
    cuerpo = json.dumps({'texto': texto, 'idioma': idioma}).encode()
    r = urllib.request.Request(VOZ, data=cuerpo,
                               headers={'Content-Type': 'application/json'})
    a = time.time()
    with urllib.request.urlopen(r, timeout=ESPERA) as resp:
        resp.read()
    return time.time() - a


def frases():
    """Cada texto fijo del guion, en los dos idiomas. Sin repetir.

    Se pide con `quien=''` a proposito: asi `guion.nodo` quita el hueco del
    nombre y cierra la frase sola, que es lo que oye quien todavia no nos dijo
    como se llama.
    """
    vistas = set()
    for nombre in guion.NODOS:
        for idi in guion.IDIOMAS:
            n = guion.nodo(nombre, idi)
            if not n:
                continue
            t = (n.get('texto') or '').strip()
            # Lo que queda vacio —los nodos que son solo un hueco, como el del
            # precio— no se adelanta: su texto llega de fuera y cambia.
            if not t or '{' in t or (t, idi) in vistas:
                continue
            vistas.add((t, idi))
            yield nombre, idi, t


def main():
    solo_mirar = '--ver' in sys.argv
    todo = list(frases())
    print(f'{len(todo)} frases fijas en el guion\n')
    if solo_mirar:
        for nombre, idi, t in todo:
            print(f'  {nombre:16} {idi}  {len(t):4} letras  {t[:52]}…')
        return 0

    hechas = ya = 0
    empezo = time.time()
    for nombre, idi, t in todo:
        try:
            dt = _pedir(t, idi)
        except Exception as e:
            print(f'  ✗ {nombre:16} {idi}  {type(e).__name__} {str(e)[:60]}')
            continue
        # Menos de dos decimas es que ya estaba en la memoria: no se fabrico.
        if dt < 0.2:
            ya += 1
        else:
            hechas += 1
            print(f'  ✓ {nombre:16} {idi}  {dt:5.1f}s  ({len(t)} letras)')
    print(f'\n{hechas} fabricadas · {ya} ya estaban · '
          f'{time.time() - empezo:.0f}s en total')
    print('Desde ahora, todo el guión suena al instante.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
