"""Cuadros 1080x1920 a 30 fps solo del tramo que usa cada toma del montaje (ahorra disco)."""
import os, json, subprocess, shutil
B = os.path.dirname(os.path.abspath(__file__)); CL = f'{B}/codigo/clips'; os.makedirs(CL, exist_ok=True)
C = json.load(open(f'{B}/codigo/tiempos.json'))['C']
rng = {}
for c in C:
    v = max(c[4]) if isinstance(c[4], list) else c[4]
    a, b = c[3], c[3] + (c[2] - c[1]) * v + .4
    r = rng.get(c[0], [a, b]); rng[c[0]] = [min(r[0], a), max(r[1], b)]
nf = {}
for k, (a, b) in sorted(rng.items()):
    d = f'{CL}/{k}'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    s0 = max(0, int((a - .5) * 30))   # margen: en un latigazo la toma entrante se pide antes de su inicio
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(s0 / 30), '-i', f'{B}/c/{k}.mp4', '-t', str(b - s0 / 30 + .2), '-vf', 'fps=30,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,unsharp=5:5:0.6',
                    '-q:v', '3', '-start_number', str(s0 + 1), f'{d}/%05d.jpg'])
    fs = sorted(os.listdir(d)); nf[k] = int(fs[-1][:5]); print(k, s0 + 1, nf[k])
json.dump(nf, open(f'{B}/codigo/nf.json', 'w'))
