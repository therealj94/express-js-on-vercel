# De los .wav que dejan componer.py y efectos.py a los MP3 que sirve el sitio.
#
#   python3 mp3.py [carpeta-con-capas-y-efectos] [carpeta-audio-del-sitio]
#
# Capas a 72 kbps, efectos a 64 y la mezcla plana (ambiente.mp3) a 96: ver
# "La musica" en RECONSTRUIR.md para el porqué de cada número. Usa lameenc
# (pip install lameenc): no hace falta ffmpeg.
import lameenc, wave, os, sys, glob

ORIGEN = sys.argv[1] if len(sys.argv) > 1 else "/tmp/musica"
DESTINO = sys.argv[2] if len(sys.argv) > 2 else "/tmp/ogsite/audio"
os.makedirs(DESTINO, exist_ok=True)

def codificar(src, dst, kbps):
    with wave.open(src, "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        pcm = w.readframes(n)
    assert sw == 2, f"{src}: se esperaba PCM de 16 bits"
    e = lameenc.Encoder()
    e.set_bit_rate(kbps); e.set_in_sample_rate(sr); e.set_channels(ch); e.set_quality(2)
    datos = e.encode(pcm) + e.flush()
    with open(dst, "wb") as f:
        f.write(datos)
    print(f"{os.path.basename(dst):22s} {n/sr:6.2f}s  {kbps}k  {len(datos)/1e3:7.1f} kB")

for f in sorted(glob.glob(f"{ORIGEN}/capas/*.wav")):
    codificar(f, f"{DESTINO}/capa-{os.path.basename(f)[:-4]}.mp3", 72)
for f in sorted(glob.glob(f"{ORIGEN}/efectos/*.wav")):
    codificar(f, f"{DESTINO}/fx-{os.path.basename(f)[:-4]}.mp3", 64)
if os.path.exists(f"{ORIGEN}/mezcla.wav"):
    codificar(f"{ORIGEN}/mezcla.wav", f"{DESTINO}/ambiente.mp3", 96)
