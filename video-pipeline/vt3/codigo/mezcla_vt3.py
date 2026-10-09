"""Mezcla «Vení tranquilo» v2: voces (guara, tres hondureños, Romeo), efectos y partitura en cues."""
import json, subprocess
J = json.load(open('codigo/tiempos.json')); S = J['s']; V = J['voces']; total = J['total']
VS = '../vt/sfx'
voz = [(v['f'], v['t'], '') for v in V.values()] + [(f, t, 'volume=1.9,' if 'N1a' in f else 'volume=1.35,') for f, t in J['romeo']]
# efectos: (archivo, t, volumen, filtro extra)
SX = [('sfx/murmullo_c.mp3', 0, .9, 'afade=t=out:st=0.4:d=1.0,'),
      ('sfx/mic_tap_a.mp3', S['taps'] - .33, 5.0, 'highpass=f=60,'),
      ('sfx/mic_ring_a.mp3', S['ring'] - .25, .22, 'atrim=0:1.05,lowpass=f=3200,afade=t=out:st=0.8:d=0.25,aecho=0.8:0.5:90:0.3,'),
      ('sfx/latido_c.mp3', S['g01'] - .1, .5, 'lowpass=f=180,afade=t=out:st=8.5:d=1.5,'),
      (f'{VS}/bombo.mp3', S['sesenta'] - .04, .8, ''),
      ('sfx/swoosh_mapa_c.mp3', S['salvador'] - .45, .6, ''),
      ('sfx/sub_golpe_a.mp3', S['cita'] - .02, .38, 'lowpass=f=900,'),
      ('sfx/swoosh_mapa_c.mp3', S['g03'] - .4, .4, ''),
      (f'{VS}/bombo.mp3', S['todos'] - .1, .55, ''),
      (f'{VS}/bombo.mp3', S['h1'] - .05, .45, ''), (f'{VS}/bombo.mp3', S['h2'] - .05, .45, ''), (f'{VS}/bombo.mp3', S['h3'] - .05, .45, ''),
      ('sfx/ondas_b.mp3', S['decide'] - .3, .8, 'lowpass=f=7000,'),
      ('sfx/swoosh_mapa_a.mp3', S['cae'] - .2, .5, ''),
      ('sfx/mic_cae_b.mp3', S['golpe'] - .02, 1.6, ''),
      ('sfx/sub_golpe_b.mp3', S['golpe'] - .02, .7, ''),
      (f'{VS}/luz_off.mp3', S['luz'], .9, ''),
      (f'{VS}/teatro.mp3', S['romeo'] - .3, .3, ''),
      (f'{VS}/bombo.mp3', S['dia'] - .03, .7, ''),
      (f'{VS}/riser_titulo.mp3', S['titulo'] - 2.5, .6, ''),
      (f'{VS}/golpe_titulo.mp3', S['titulo'] - .02, .9, '')]
SC = json.load(open('score/elegidos.json'))
def cue(n): return f'score/{n}_{SC[n]}.mp3'
# (cue, t inicio en el video, t fin, desde dónde arranca el cue, fade in, fade out)
CU = [('K01_tension', S['g01'] - .2, S['cita'], 0, .8, .15), ('K02_hermanos', S['g03'] - .1, S['g04'] + .3, 0, .6, .6),
      ('K03_pregunta', S['g04'] - .2, S['g05'], 0, .2, .4), ('K04_orgullo', S['g05'] - .2, S['g07'], 0, .2, .6),
      ('K05_miedo', S['miedo'] - 6.0, S['g08'], 0, .5, .3), ('K06_todos', S['g08'] - .1, S['g09'] + .8, 0, .3, .8),
      ('K07_llamado', S['cambio'] - 16.0, S['h1'] - .1, 0, 1.0, .3), ('K08_pueblo', S['h1'] - .15, S['g13'], 0, .05, .7),
      ('K09_compartir', S['g13'] - .1, S['g15'] - .1, 0, .5, .25), ('K10_romeo', S['titulo'] - 7.2, S['titulo'], 0, 1.0, .03),
      ('K11_final', S['titulo'], total, .45, .01, 1.8)]
ent, fil, vz, sf, mu = [], [], [], [], []
for i, (f, t0, x) in enumerate(voz):
    ent += ['-i', f]; d = int(t0 * 1000); ln = x if x else 'loudnorm=I=-16:TP=-1.5,'
    fil.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,{ln}adelay={d}|{d}[v{i}]'); vz.append(f'[v{i}]')
n = len(voz)
for j, (f, t0, vol, x) in enumerate(SX):
    ent += ['-i', f]; d = max(0, int(t0 * 1000))
    fil.append(f'[{n+j}:a]aresample=48000,aformat=channel_layouts=stereo,{x}volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
m = n + len(SX)
for q, (c, t0, t1, a, fi, fo) in enumerate(CU):
    ent += ['-i', cue(c)]; d = int(t0 * 1000); L = t1 - t0
    fil.append(f'[{m+q}:a]atrim={a}:{a + L},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={L},afade=t=in:d={fi},afade=t=out:st={max(0, L - fo)}:d={fo},adelay={d}|{d}[m{q}]'); mu.append(f'[m{q}]')
fil.append(f"{''.join(mu)}amix=inputs={len(mu)}:normalize=0,volume=0.62[mus]")
fil.append(f"{''.join(vz)}amix=inputs={len(vz)}:normalize=0,apad=whole_dur={total}[voz]")
fil.append("[voz]asplit=2[voz1][vsc]")
fil.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=400[musd]")
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
fil.append("[voz1][musd][sfx]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=12,alimiter=limit=0.92,apad[o]")
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(fil), '-map', '[o]', '-t', str(total), '-ar', '48000', '-c:a', 'pcm_s16le', 'mezcla.wav'], capture_output=True, text=True)
print(r.returncode, r.stderr[:1500])
