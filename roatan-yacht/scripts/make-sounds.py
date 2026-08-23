#!/usr/bin/env python3
"""Synthesise the app's sound set. No stock library, no licence to worry about.

Every sound is built from sine partials with an exponential decay, which is
what a struck bar or a bell actually is. Keeping them synthetic means they are
tiny, consistent in loudness, and tuned to each other — all five sit in the
same key (A major-ish), so the app never sounds like a pile of stock effects.

    python3 scripts/make-sounds.py       → roatan-yacht-app/assets/sound/*.m4a

Needs ffmpeg for the AAC encode; the raw WAVs are written to a temp dir.
"""
import math
import os
import struct
import subprocess
import sys
import tempfile
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'roatan-yacht-app', 'assets', 'sound')

RATE = 44100

# A pentatonic set. Anything picked from here sounds intentional together.
A4, CS5, E5, A5, CS6, E6, B5, FS5 = 440.0, 554.37, 659.25, 880.0, 1108.7, 1318.5, 987.77, 739.99


def tone(freq, dur, amp=0.5, decay=14.0, partials=(1.0, 2.0, 3.0), weights=(1.0, 0.35, 0.12), start=0.0):
    """One struck note: partials over an exponential decay, softly attacked."""
    n = int(dur * RATE)
    out = [0.0] * n
    for i in range(n):
        t = i / RATE
        env = math.exp(-decay * t)
        # A 4 ms attack ramp — without it every note starts on a click.
        env *= min(1.0, t / 0.004)
        s = 0.0
        for p, w in zip(partials, weights):
            s += w * math.sin(2 * math.pi * freq * p * t)
        out[i] = amp * env * s / sum(weights)
    return out, int(start * RATE)


def mix(layers, dur):
    buf = [0.0] * int(dur * RATE)
    for samples, offset in layers:
        for i, v in enumerate(samples):
            j = i + offset
            if 0 <= j < len(buf):
                buf[j] += v
    peak = max((abs(v) for v in buf), default=1.0) or 1.0
    return [v / peak * 0.86 for v in buf]


def write_wav(path, buf):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1.0, min(1.0, v)) * 32767)) for v in buf))


SOUNDS = {
    # Payment approved. A rising major arpeggio that lands on the octave — the
    # universal "that worked" shape, warm rather than beepy.
    'success': (1.5, [
        tone(A4, 1.2, 0.55, 6.0, start=0.00),
        tone(CS5, 1.2, 0.55, 6.0, start=0.09),
        tone(E5, 1.2, 0.55, 6.0, start=0.18),
        tone(A5, 1.3, 0.70, 4.2, start=0.27),
        tone(CS6, 1.1, 0.32, 5.0, start=0.34),
        tone(E6, 1.0, 0.22, 5.5, start=0.40),
    ]),
    # Confirmed and aboard: two notes, softer, used when the trip screen opens.
    'aboard': (1.2, [
        tone(E5, 0.9, 0.55, 7.0, start=0.00),
        tone(A5, 1.1, 0.60, 5.0, start=0.12),
        tone(CS6, 0.9, 0.25, 6.0, start=0.18),
    ]),
    # Something dropped into the tray. Short, bright, up a step — "added".
    'pop': (0.34, [
        tone(FS5, 0.16, 0.5, 40.0, partials=(1.0, 2.0), weights=(1.0, 0.3), start=0.0),
        tone(B5, 0.26, 0.55, 26.0, partials=(1.0, 2.0), weights=(1.0, 0.25), start=0.05),
    ]),
    # Taken back off. The same two notes, downward.
    'off': (0.3, [
        tone(B5, 0.14, 0.4, 42.0, partials=(1.0,), weights=(1.0,), start=0.0),
        tone(FS5, 0.22, 0.42, 30.0, partials=(1.0,), weights=(1.0,), start=0.05),
    ]),
    # A button. Barely a sound — a wooden tick, felt more than heard.
    'tap': (0.09, [
        tone(A5, 0.07, 0.30, 90.0, partials=(1.0, 3.0), weights=(1.0, 0.5), start=0.0),
    ]),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp()
    for name, (dur, layers) in SOUNDS.items():
        wav = os.path.join(tmp, name + '.wav')
        write_wav(wav, mix(layers, dur))
        m4a = os.path.join(OUT, name + '.m4a')
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', m4a, '-y'],
            check=True,
        )
        print('%-9s %5.2fs  %5d bytes' % (name, dur, os.path.getsize(m4a)))


if __name__ == '__main__':
    if not subprocess.run(['which', 'ffmpeg'], capture_output=True).returncode == 0:
        sys.exit('ffmpeg is needed to encode the sounds')
    main()
