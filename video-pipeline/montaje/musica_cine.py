#!/usr/bin/env python3
"""Cama musical cinematográfica, compuesta aquí. Sin licencias de nadie.

No es una canción: es lo que usan de verdad los anuncios de esta clase —un
acorde grave sostenido que respira, un pulso lento debajo y un brillo agudo
muy lejano. Una melodía competiría con la voz y delataría la pieza.

    python3 musica_cine.py salida.wav 66.0 47.6
                                       dur   momento del giro
"""
import sys
import numpy as np, soundfile as sf

SR = 48000


def cama(dur: float, giro: float) -> np.ndarray:
    N = int(SR * dur); t = np.arange(N) / SR
    rng = np.random.default_rng(77)

    def voz(f, amp, detune=0.0, fase=0.0):
        """Dos osciladores por nota, ligeramente desafinados: el batido lento
        entre ambos es lo que separa una cama viva de un sintetizador muerto."""
        return amp * (np.sin(2*np.pi*f*t + fase)
                      + np.sin(2*np.pi*(f + detune)*t + fase*1.3)) / 2

    # La menor sin tercera. La tercera es la nota que decide si algo suena
    # alegre o triste, y aquí no queremos que decida nada todavía.
    grave = (voz(55.0, 0.60, 0.07) + voz(82.41, 0.34, 0.05)
             + voz(110.0, 0.22, 0.04) + voz(164.81, 0.10, 0.03))

    # Después del giro entra la tercera mayor: el acorde se abre sin que nadie
    # lo note, y eso es todo el "algo cambió" que necesita la pieza.
    abre = voz(138.59, 0.16, 0.03) + voz(207.65, 0.09, 0.02)
    rampa = np.clip((t - giro) / 2.5, 0, 1)
    grave = grave + abre * rampa

    # Respiración: la cama sube y baja muy despacio, como alguien durmiendo.
    resp = 0.78 + 0.22 * np.sin(2*np.pi*0.055*t - np.pi/2)

    # Un pulso muy por debajo, a 50 por minuto. No se oye; se siente.
    pulso = np.exp(-((t % 1.2) ** 2) / 0.010) * 0.30 + 0.85

    # Brillo lejano: ruido filtrado alto, apenas presente, para que no sea barro.
    b = rng.standard_normal(N)
    for _ in range(2):
        b = b - np.convolve(b, np.ones(60)/60, mode="same")
    brillo = b * 0.014 * (0.4 + 0.6*np.sin(2*np.pi*0.031*t)**2)

    x = grave * resp * pulso + brillo

    # Entrada y salida largas. Una cama que entra de golpe se nota.
    ent = np.clip(t / 3.0, 0, 1)
    sal = np.clip((dur - t) / 3.5, 0, 1)
    x *= ent * sal
    x /= np.max(np.abs(x)) + 1e-9
    return x * 0.55


if __name__ == "__main__":
    sal = sys.argv[1] if len(sys.argv) > 1 else "cama_cine.wav"
    dur = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
    giro = float(sys.argv[3]) if len(sys.argv) > 3 else dur * 0.7
    x = cama(dur, giro)
    sf.write(sal, np.column_stack([x, x]), SR)
    print(f"{sal} · {dur}s · el acorde se abre en {giro}s · "
          f"pico {20*np.log10(np.max(np.abs(x))):.1f} dBFS")
