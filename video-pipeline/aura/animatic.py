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
    ("K01", 0.0, 4.2, "in"), ("K02", 4.2, 9.0, "in"), ("K03", 9.0, 13.2, "in"),
    ("K04", 13.2, 17.4, "in"), ("K05", 17.4, 21.2, "out"), ("K06", 21.2, 28.2, "in"),
    ("K07", 28.2, 34.2, "in"), ("K08", 34.2, 40.2, "sube"), ("K09", 40.2, 43.6, "in"),
    ("K10", 43.6, 46.6, "in"), ("K11", 46.6, 53.4, "in"), ("K12", 53.4, 57.4, "in"),
    ("K13", 57.4, 61.4, "out"), ("K14", 61.4, 68.4, "sube"), ("K15", 68.4, 72.6, "in"),
    ("K16", 72.6, 79.6, "in"), ("K17", 79.6, 86.0, "quieto"),
]
TRANS = 0.45  # fundido corto entre escenas (en el video final serán transiciones por objeto)

# (archivo, segundo, volumen)
VOCES = [
    ("J1", 1.0, 1.0), ("A1", 10.0, 1.0), ("N1", 11.4, 1.0), ("N2", 14.4, 1.0), ("A2", 17.8, 1.0),
    ("J2", 21.5, 1.0), ("C1", 23.8, 1.0), ("J3", 26.2, 1.0), ("N3", 26.9, 1.0),
    ("J4", 28.5, 1.0), ("T1", 30.0, 1.0), ("N4", 32.5, 1.0),
    ("J5", 34.5, 1.0), ("T2", 37.0, 1.0), ("N5", 40.6, 1.0), ("T3", 44.2, 1.0),
    ("N6", 47.5, 1.0), ("C2", 53.7, 1.0), ("J6", 57.8, 1.0), ("N7", 59.4, 1.0),
    ("J7", 61.7, 1.0), ("N8", 65.2, 1.0), ("A3", 68.8, 1.0), ("J8", 70.3, 1.0), ("A4", 71.4, 1.0),
    ("N9", 73.0, 1.0), ("N10", 81.0, 1.0),
]
SFX = [
    ("cristal", 2.7, .8), ("impacto", 7.4, .9), ("particulas", 9.1, .7), ("telefono", 13.3, .7),
    ("chasquido", 23.0, .8), ("boton", 26.5, .7), ("correos", 29.2, .7), ("huella_oro", 38.8, .8),
    ("oro_vuela", 40.3, .8), ("hielo", 50.0, .7), ("encoge", 55.4, .8), ("boton", 66.6, .6),
    ("final", 74.6, .9),
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
    fil.append(f"[{m}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.55,afade=t=in:d=1.5,"
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
