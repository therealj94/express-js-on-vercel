"""AU-RA FP · animatic del tráiler: los 17 cuadros clave con movimiento y el audio completo.

    python3 animatic.py --dir AURA --sal animatic.mp4

AURA/cuadros/K01..K17.png (1080×1920) y AURA/audio/*.mp3. El reparto de tiempos sale de ESCENAS y VOCES:
cada voz entra en su segundo, la música va debajo y se agacha sola cuando alguien habla.
"""
import argparse, subprocess
from pathlib import Path

import cv2
import numpy as np

W, H, FPS = 1080, 1920, 30

# (cuadro, inicio, fin, movimiento): «in» empuje lento, «out» se abre, «sube» paneo vertical, «quieto»
ESCENAS = [
    ("K01", 0.0, 4.2, "in"), ("K02", 4.2, 8.8, "in"), ("K03", 8.8, 13.4, "in"),
    ("K04", 13.4, 18.0, "in"), ("K05", 18.0, 22.0, "out"), ("K06", 22.0, 31.6, "in"),
    ("K07", 31.6, 38.6, "in"), ("K08", 38.6, 45.0, "sube"), ("K09", 45.0, 49.0, "in"),
    ("K10", 49.0, 52.6, "in"), ("K11", 52.6, 59.6, "in"), ("K12", 59.6, 64.0, "in"),
    ("K13", 64.0, 68.8, "out"), ("K14", 68.8, 76.6, "sube"), ("K15", 76.6, 82.6, "in"),
    ("K16", 82.6, 92.5, "in"), ("K17", 92.5, 99.5, "quieto"),
]
TRANS = 0.45  # fundido corto entre escenas (en el video final serán transiciones por objeto)

# (archivo, segundo, volumen)
VOCES = [
    ("J1", 1.0, 1.0), ("A1", 9.6, 1.0), ("N1", 11.1, 1.0), ("N2", 14.2, 1.0), ("A2", 18.4, 1.0),
    ("J2", 22.2, 1.0), ("C1", 25.0, 1.0), ("J3", 27.5, 1.0), ("N3", 28.7, 1.0),
    ("J4", 31.8, 1.0), ("T1", 33.9, 1.0), ("N4", 36.8, 1.0),
    ("J5", 38.8, 1.0), ("T2", 41.8, 1.0), ("N5", 45.4, 1.0), ("T3", 50.2, 1.0),
    ("N6", 53.4, 1.0), ("C2", 59.8, 1.0), ("J6", 64.2, 1.0), ("N7", 66.5, 1.0),
    ("J7", 69.9, 1.0), ("N8", 72.6, 1.0), ("A3", 77.0, 1.0), ("J8", 78.8, 1.0), ("A4", 81.0, 1.0),
    ("N9", 83.0, 1.0), ("N10", 94.0, 1.0),
]
SFX = [
    ("cristal", 2.7, .8), ("impacto", 7.0, .9), ("particulas", 8.8, .7), ("telefono", 13.5, .7),
    ("chasquido", 24.6, .8), ("boton", 27.7, .7), ("correos", 32.4, .7), ("huella_oro", 43.6, .8),
    ("oro_vuela", 45.0, .8), ("hielo", 55.0, .7), ("encoge", 61.6, .8), ("boton", 74.0, .6),
    ("final", 88.0, .9),
]


def suave(x): x = min(1, max(0, x)); return x * x * (3 - 2 * x)


def mueve(img, u, modo):
    if modo == "quieto": z, dy = 1.0 + .015 * u, 0
    elif modo == "out": z, dy = 1.08 - .07 * u, 0
    elif modo == "sube": z, dy = 1.06, (0.5 - u) * 70
    else: z, dy = 1.0 + .07 * u, 0
    M = np.float32([[z, 0, W / 2 * (1 - z)], [0, z, H / 2 * (1 - z) + dy]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def video(base, sal):
    imgs = {k: cv2.imread(str(base / "cuadros" / f"{k}.png")) for k, *_ in ESCENAS}
    total = ESCENAS[-1][2]
    p = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                          "-pix_fmt", "yuv420p", str(sal)], stdin=subprocess.PIPE)
    for n in range(int(total * FPS)):
        t = n / FPS
        i = max(j for j, e in enumerate(ESCENAS) if e[1] <= t + 1e-9)
        k, a, b, modo = ESCENAS[i]
        fr = mueve(imgs[k], (t - a) / (b - a), modo)
        if i + 1 < len(ESCENAS) and b - t < TRANS:
            k2, a2, b2, m2 = ESCENAS[i + 1]
            q = suave(1 - (b - t) / TRANS)
            fr = cv2.addWeighted(fr, 1 - q, mueve(imgs[k2], 0, m2), q, 0)
        if t < 2.6: fr = (fr * 0 if t < 2.4 else fr * suave((t - 2.4) / .2)).astype(np.uint8)  # el punto se enciende
        if t > total - .6: fr = (fr * (1 - suave((t - total + .6) / .6))).astype(np.uint8)
        p.stdin.write(fr.tobytes())
    p.stdin.close(); p.wait()
    return total


def audio(base, total, toma, sal_wav):
    a = base / "audio"
    ent, fil, vz, sf = [], [], [], []
    for i, (n, t0, vol) in enumerate(VOCES):
        ent += ["-i", str(a / f"{n}_{toma.get(n, 'a')}.mp3")]
        fil.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-14:TP=-1.5,volume={vol},"
                   f"adelay={int(t0*1000)}|{int(t0*1000)}[v{i}]"); vz.append(f"[v{i}]")
    k = len(VOCES)
    for j, (n, t0, vol) in enumerate(SFX):
        ent += ["-i", str(a / f"sfx_{n}.mp3")]
        fil.append(f"[{k+j}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},"
                   f"adelay={int(t0*1000)}|{int(t0*1000)}[s{j}]"); sf.append(f"[s{j}]")
    m = k + len(SFX)
    ent += ["-i", str(a / f"musica_{toma.get('musica', 'a')}.mp3")]
    # automatización: arranque íntimo (bajo hasta el 9), caída de noche (76,6–82,6) y el golpe del 92 a tope
    vol = ("volume='0.55*(0.35+0.65*clip((t-8)/3,0,1))*(1-0.6*clip((t-76.3)/0.6,0,1)*clip((83.2-t)/0.8,0,1))'"
           ":eval=frame")
    fil.append(f"[{m}:a]aresample=48000,aformat=channel_layouts=stereo,{vol},afade=t=in:d=2.5,"
               f"afade=t=out:st={total-2.5}:d=2.5[mus]")
    fil.append(f"{''.join(vz)}amix=inputs={len(vz)}:normalize=0[voz]")
    fil.append("[voz]asplit=2[voz1][vsc]")
    fil.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[musd]")
    fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
    fil.append(f"[voz1][musd][sfx]amix=inputs=3:normalize=0,apad=whole_dur={total},asetpts=N/SR/TB,"
               f"atrim=0:{total},alimiter=limit=0.9[o]")
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", *ent, "-filter_complex", ";".join(fil), "-map", "[o]",
                        "-c:a", "pcm_s16le", str(sal_wav)], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[:1500])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dir"); ap.add_argument("--sal"); ap.add_argument("--tomas", default="")
    a = ap.parse_args(); base = Path(a.dir); sal = Path(a.sal)
    toma = dict(x.split("=") for x in a.tomas.split(",") if x)
    mudo = sal.with_suffix(".mudo.mp4"); wav = sal.with_suffix(".wav")
    total = video(base, mudo); audio(base, total, toma, wav)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mudo), "-i", str(wav), "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(sal)], check=True)


if __name__ == "__main__":
    main()
