#!/usr/bin/env python3
"""Música de la película del ecosistema. Percusiva, no emocional.

La cama de musica_cine.py es para respirar; esta es para avanzar. Pero lo que
de verdad importa aquí no es el timbre: es el tempo.

Los bloques de la película cambian cada 2,7 s. A 88,9 pulsos por minuto un
compás de cuatro dura exactamente 2,7 s, así que cada cambio de función cae en
el tiempo fuerte. Un montaje rápido que no cae con la música se siente
nervioso; el mismo montaje cayendo en el pulso se siente inevitable. Es la
diferencia entre el anuncio de Apple y una sucesión de cortes.

    python3 montaje/musica_lanzamiento.py salida.wav 38.0
"""
import sys

import numpy as np
import soundfile as sf

SR = 48000
BPM = 60 * 4 / 2.7          # 88,9: un compás por bloque
PULSO = 60 / BPM


def golpe_grave(n):
    t = np.arange(n) / SR
    f = 105 * np.exp(-t * 26) + 46          # el barrido de altura es el "cuerpo"
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def golpe_agudo(n, semilla):
    rng = np.random.default_rng(semilla)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    x = x - np.convolve(x, np.ones(9) / 9, mode="same")   # pasa-altos barato
    return x * np.exp(-t * 55) * 0.5


def pieza(dur: float) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    x = np.zeros(n)

    # ARCO. La primera versión era un bucle: "empieza igual que termina, no
    # acompaña la narrativa, rellena el silencio". Ahora la pieza crece desde el
    # oro hasta el comprobante —que es el clímax— y resuelve en el logo.
    #
    # La curva: entra contenida, sube sin parar hasta el 78% de la pieza, y ahí
    # abre. Sin esto, un montaje de 46 s se siente plano por bien que corte.
    clima = 0.78
    arco = np.where(t < dur * clima,
                    0.42 + 0.58 * (t / (dur * clima)) ** 1.35,
                    1.0 - 0.30 * ((t - dur * clima) / (dur * (1 - clima))) ** 2)

    # Bajo sostenido en la, sin tercera: deja sitio a que la imagen decida el
    # ánimo, igual que en la otra película.
    for f, a in ((55.0, 0.30), (110.0, 0.16), (164.81, 0.07)):
        x += a * (np.sin(2*np.pi*f*t) + np.sin(2*np.pi*(f+0.06)*t)) / 2

    # La tercera MAYOR entra solo en el clímax: es el "algo se resolvió" que la
    # versión en bucle no tenía. Es el mismo recurso que en musica_erosion.py,
    # donde el motivo volvía entero tras el giro.
    ent = np.clip((t - dur * clima) / 2.0, 0, 1)
    x += (np.sin(2*np.pi*138.59*t) * 0.13 +
          np.sin(2*np.pi*207.65*t) * 0.07) * ent

    # Pulso. El tiempo fuerte de cada compás pega más: es el que marca el corte.
    k = 0
    while k * PULSO < dur:
        i = int(k * PULSO * SR)
        largo = min(int(0.42 * SR), n - i)
        if largo > 0:
            fuerte = (k % 4 == 0)
            # El pulso también crece: es lo que hace que la subida se sienta.
            g = arco[min(i, n - 1)]
            x[i:i+largo] += golpe_grave(largo) * (0.62 if fuerte else 0.26) * g
        # Contratiempo, media unidad después: es lo que le da el trote.
        j = int((k + 0.5) * PULSO * SR)
        largo = min(int(0.10 * SR), n - j)
        if largo > 0 and j < n:
            x[j:j+largo] += golpe_agudo(largo, 100 + k) * 0.30
        k += 1

    # Brillo lejano, para que el negro no suene a vacío.
    rng = np.random.default_rng(5)
    b = rng.standard_normal(n)
    for _ in range(2):
        b = b - np.convolve(b, np.ones(70)/70, mode="same")
    x += b * 0.012 * (0.5 + 0.5*np.sin(2*np.pi*0.05*t)**2)

    # Entra rápido y sale largo: el cierre necesita cola, la apertura no.
    x *= arco
    x *= np.clip(t / 0.8, 0, 1) * np.clip((dur - t) / 3.0, 0, 1)
    x /= np.max(np.abs(x)) + 1e-9
    return x * 0.78


if __name__ == "__main__":
    sal = sys.argv[1] if len(sys.argv) > 1 else "cama_lanzamiento.wav"
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 38.0
    y = pieza(dur)
    sf.write(sal, np.column_stack([y, y]), SR)
    print(f"{sal} · {dur}s · {BPM:.1f} bpm · un compás cada "
          f"{PULSO*4:.2f}s, que es justo lo que dura cada bloque")
