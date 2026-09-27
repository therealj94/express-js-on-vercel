#!/usr/bin/env python3
"""La música también pierde valor.

La cama sostenida de musica_cine.py sigue debajo; lo nuevo va encima y es
una idea, no un adorno.

Un motivo de cinco notas se repite durante todo el anuncio. En la primera
época suenan las cinco. En la segunda desaparece una: donde estaba queda un
silencio del mismo tamaño, así que el motivo no se acorta, se agujerea. En
la tercera faltan dos y las que quedan suenan doce centésimas por debajo de
su afinación, apenas lo justo para que algo incomode sin saber qué. Al final,
cuando aparece Orden Global, el motivo vuelve entero y afinado, y por primera
vez con la tercera mayor.

Es exactamente lo que cuenta la imagen: la mesa que se vacía, la llave que
ya no está, las rosas a las que se les suelta un pedazo en cada paso. El
público no lo analiza; lo siente y no sabe por qué. Que es justo lo que pidió
el anuncio desde el principio —la víctima nunca ve el robo, solo el público.

    python3 musica_erosion.py cama_llave.wav 74.1 18.4 41.4 61.5
                              salida         dur  ep2  ep3  giro
"""
import sys

import numpy as np
import soundfile as sf

from musica_cine import SR, cama

# La menor, sin tercera. Cinco notas que no forman melodía cantable: si se
# pudiera tararear competiría con la voz y delataría la pieza.
MOTIVO = [220.00, 329.63, 246.94, 440.00, 164.81]

PASO = 2.6          # segundos entre nota y nota
DECAIMIENTO = 2.2   # cola de cada nota, en segundos

# Qué notas del motivo se caen en cada época. La primera no pierde nada.
CAIDAS = {1: (), 2: (2,), 3: (1, 3)}


def campana(t_rel, freq, amp):
    """Una nota con cola, no un pitido sostenido.

    Los armónicos impares muy bajos son lo que separa una campana de un seno
    pelado; sin ellos suena a prueba de laboratorio."""
    env = np.exp(-t_rel / (DECAIMIENTO / 3.0)) * (t_rel >= 0)
    # Ataque de 8 ms: sin él, cada nota empieza con un chasquido.
    env = env * np.clip(t_rel / 0.008, 0, 1)
    onda = (np.sin(2*np.pi*freq*t_rel)
            + 0.30*np.sin(2*np.pi*freq*2*t_rel)
            + 0.12*np.sin(2*np.pi*freq*3.01*t_rel))
    return amp * env * onda


def epoca_en(t, ep2, ep3, giro):
    if t >= giro:
        return 4
    if t >= ep3:
        return 3
    if t >= ep2:
        return 2
    return 1


def motivo(dur, ep2, ep3, giro):
    N = int(SR * dur)
    t = np.arange(N) / SR
    x = np.zeros(N)

    n = 0
    inicio = 1.5  # el motivo entra después que la cama, no a la vez
    while inicio + n * PASO < dur:
        golpe = inicio + n * PASO
        idx = n % len(MOTIVO)
        ep = epoca_en(golpe, ep2, ep3, giro)

        # El hueco es el mensaje: la nota no se sustituye por otra, se calla
        # y su sitio queda vacío.
        if idx in CAIDAS.get(ep, ()):
            n += 1
            continue

        freq = MOTIVO[idx]
        # La tercera época va calando: doce centésimas de tono por debajo.
        if ep == 3:
            freq *= 0.9931
        # Y se apaga: cada época suena más lejos que la anterior.
        amp = {1: 0.16, 2: 0.13, 3: 0.10, 4: 0.19}[ep]

        ini = int(golpe * SR)
        fin = min(N, ini + int(DECAIMIENTO * SR))
        if fin > ini:
            x[ini:fin] += campana(t[:fin-ini], freq, amp)
        n += 1

    # Después del giro, la tercera mayor sobre cada nota: el motivo no solo
    # vuelve entero, vuelve resuelto.
    n = 0
    while inicio + n * PASO < dur:
        golpe = inicio + n * PASO
        if golpe >= giro:
            freq = MOTIVO[n % len(MOTIVO)] * 1.2599  # tercera mayor
            ini = int(golpe * SR)
            fin = min(N, ini + int(DECAIMIENTO * SR))
            if fin > ini:
                x[ini:fin] += campana(t[:fin-ini], freq, 0.075)
        n += 1

    return x


def main():
    sal = sys.argv[1]
    dur, ep2, ep3, giro = (float(v) for v in sys.argv[2:6])
    base = cama(dur, giro)
    mot = motivo(dur, ep2, ep3, giro)

    # La entrada y la salida del motivo siguen a las de la cama.
    t = np.arange(len(mot)) / SR
    mot *= np.clip(t / 3.0, 0, 1) * np.clip((dur - t) / 3.5, 0, 1)

    x = base + mot
    x /= np.max(np.abs(x)) + 1e-9
    x *= 0.55
    sf.write(sal, np.column_stack([x, x]), SR)

    cuenta = {e: 5 - len(CAIDAS.get(e, ())) for e in (1, 2, 3)}
    print(f"{sal} · {dur}s · notas por epoca "
          f"{cuenta[1]}/{cuenta[2]}/{cuenta[3]} y 5 tras el giro en {giro}s · "
          f"pico {20*np.log10(np.max(np.abs(x))):.1f} dBFS")


if __name__ == "__main__":
    main()
