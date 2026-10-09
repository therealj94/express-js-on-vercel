import os, glob, json, subprocess
B = os.path.dirname(os.path.abspath(__file__))
fuentes = {os.path.basename(f)[:-4].split('_')[0]: f for f in glob.glob(f'{B}/c/*.mp4') + glob.glob(f'{B}/lip/*.mp4')}
for k in ['R01', 'CP01', 'CP02', 'U01', 'P01', 'L01', 'MQ01', 'M01']: fuentes[k] = f'{B}/../clips/{k}.mp4'
nf = json.load(open(f'{B}/codigo/nf.json')) if os.path.exists(f'{B}/codigo/nf.json') else {}
for k, f in sorted(fuentes.items()):
    d = f'{B}/codigo/clips/{k}'
    if k in nf and os.path.isdir(d): continue
    os.makedirs(d, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-vf', 'fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,unsharp=5:5:0.5', '-q:v', '3', f'{d}/%05d.jpg'])
    nf[k] = len(os.listdir(d)); print(k, nf[k])
json.dump(nf, open(f'{B}/codigo/nf.json', 'w'))
