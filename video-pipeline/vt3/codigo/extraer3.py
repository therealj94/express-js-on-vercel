"""Cuadros de los clips de vt3 (c/*.mp4, lip/L*.mp4) y enlaces a clips reutilizados del v1."""
import os, glob, json, subprocess
B = os.path.dirname(os.path.abspath(__file__)); CL = f'{B}/codigo/clips'; os.makedirs(CL, exist_ok=True)
nf = json.load(open(f'{B}/codigo/nf.json')) if os.path.exists(f'{B}/codigo/nf.json') else {}
V1 = json.load(open(f'{B}/../vt/codigo/nf.json'))
for k in ['B01', 'B04', 'B05', 'B06', 'B10', 'B11', 'B12', 'B14', 'R01', 'CP01', 'D2', 'D3', 'ROM1', 'ROM3']:
    d = f'{CL}/{k}'
    if not os.path.exists(d): os.symlink(f'{B}/../vt/codigo/clips/{k}', d)
    nf[k] = V1[k]
fuentes = {os.path.basename(f)[:-4].split('_')[0]: f for f in glob.glob(f'{B}/c/*.mp4') if '_v1' not in f}
fuentes.update({os.path.basename(f)[:-4]: f for f in glob.glob(f'{B}/lip/L*.mp4')})
for k, f in sorted(fuentes.items()):
    d = f'{CL}/{k}'
    if k in nf and os.path.isdir(d) and os.path.getmtime(d) > os.path.getmtime(f): continue
    os.makedirs(d, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-vf', 'fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,unsharp=5:5:0.5', '-q:v', '3', f'{d}/%05d.jpg'])
    nf[k] = len(os.listdir(d)); print(k, nf[k])
json.dump(nf, open(f'{B}/codigo/nf.json', 'w'))
