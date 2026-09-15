#!/usr/bin/env python3
"""Colchón sonoro del anuncio: se siente, no se escucha.

No es música con melodía — eso competiría con la voz y delataría la pieza.
Es un acorde grave sostenido que crece muy despacio, se abre cuando cae el
pétalo y se resuelve en el cierre. A -32 dBFS: por debajo del umbral de
atención consciente, justo donde el espectador nota que "hay algo".
"""
import numpy as np, soundfile as sf

SR, DUR = 48000, 56.71
t = np.linspace(0, DUR, int(SR * DUR), endpoint=False)


def voz_grave(f, amp, detune=0.0):
    """Una nota con dos osciladores ligeramente desafinados: el batido lento
    entre ambos es lo que hace que suene vivo y no a sintetizador barato."""
    return amp * (np.sin(2*np.pi*f*t) + np.sin(2*np.pi*(f+detune)*t)) / 2


# La menor abierta: fundamental, quinta y octava. Sin tercera, que es la que
# decide si algo suena alegre o triste — aquí no queremos que decida nada.
pad = (voz_grave(55.0, 0.55, 0.08) + voz_grave(82.41, 0.34, 0.06)
       + voz_grave(110.0, 0.20, 0.05) + voz_grave(164.81, 0.08, 0.04))

# Un armónico suave arriba, apenas audible, para que no sea solo barro grave.
pad += 0.035 * np.sin(2*np.pi*440.0*t) * (0.5 + 0.5*np.sin(2*np.pi*0.07*t))

def rampa(x0, x1, a, b):
    """Transición suave (coseno) entre dos niveles."""
    y = np.interp(t, [x0, x1], [a, b])
    m = (t > x0) & (t < x1)
    p = (t[m] - x0) / (x1 - x0)
    y[m] = a + (b - a) * (1 - np.cos(np.pi * p)) / 2
    return y

# El recorrido dramático: entra, se retira bajo la voz, se abre en el pétalo,
# y sostiene el cierre.
env = rampa(0, 4, 0.0, 0.55)
env = np.minimum(env, rampa(4, 10, 0.55, 0.40))
env *= rampa(24, 30, 1.0, 1.0)
env = np.where(t > 30, np.interp(t, [30, 34, 40, 50.6, 53, 56.71],
                                 [0.40, 0.72, 0.55, 0.62, 0.55, 0.0]), env)
env *= rampa(0, 1.2, 0.0, 1.0)

audio = pad * env
audio /= np.max(np.abs(audio)) + 1e-9
audio *= 10 ** (-32 / 20) * 8          # objetivo ~-14 dBFS de pico del colchón
sf.write("cama.wav", np.column_stack([audio, audio]), SR)
print(f"cama.wav  {DUR:.2f}s  pico {20*np.log10(np.max(np.abs(audio))):.1f} dBFS")
