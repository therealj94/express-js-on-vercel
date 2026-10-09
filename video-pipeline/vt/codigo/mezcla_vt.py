"""Mezcla «Vení tranquilo»: voz de la guara (tomas T1–T9 + V03), música en tramos, efectos y ambientes."""
import json, subprocess, os
J = json.load(open('codigo/tiempos.json')); S = J['s']; T = J['t']; V = J['voces']; total = J['total']
voz = [(f'/home/user/express-js-on-vercel/video-pipeline/vt/lip/{k}.mp3', T[k]) for k in T] + [('v/V03_a.mp3', V['V03'])] + [tuple(x) for x in J['romeo']]
SX = [('pings', .0, .9), ('teatro', 1.4, .5), ('acople', 4.45, .9), ('tap', 6.3, .6), ('bombo', 6.85, .9), ('bombo', S['sesenta'] - .05, .6),
      ('sello', S['cita'], .7), ('aleteo', S['mira'] - .1, .7), ('atril', S['aman'] - .05, .9), ('bombo', S['escuchen'] - .05, .7),
      ('pings_buenos', S['buenos'], .7), ('olas', S['buenos'] + .3, .55), ('teatro', S['pregunta'], .5),
      ('aleteo', S['drop'] + .3, .8), ('mic_drop', S['golpe'] - 1.7, 1.8), ('impacto', S['golpe'] - .02, .55), ('acople', S['golpe'] + .2, .55),
      ('luz_off', S['luz'], 1.2), ('teatro', S['romeo'] - .3, .35), ('bombo', S['dia'] - .03, .8), ('bombo', S['seguras'] - .03, .5),
      ('riser_titulo', S['titulo'] - 2.5, .7), ('golpe_titulo', S['titulo'] - .02, 1.0)]
# música: partitura original en cues (ElevenLabs Music), cada uno cortado a su tramo exacto
# (archivo, t inicio en el video, t fin, desde dónde arranca el cue, fade in, fade out)
SC = json.load(open('score/elegidos.json')) if os.path.exists('score/elegidos.json') else {}
def cue(n): return f"score/{n}_{SC.get(n, 'a')}.mp3"
CU = [(cue('C1_tension'), 0.0, 6.85, 0.0, 1.5, .25), (cue('C2_discurso'), 6.85, T['T3'], 0.0, .05, .4),
      (cue('C3_maravilla'), S['mira'], T['T4'], 0.0, .05, .5), (cue('C4_realidad'), T['T4'], T['T5'], 0.0, .3, .5),
      (cue('C5_llamado'), T['T5'], S['aman'], 26 - (S['aman'] - T['T5']), .4, .08), (cue('C6_climax'), S['aman'], S['golpe'], 0.0, .02, .06),
      (cue('C7_romeo'), S['titulo'] - 18.0, S['titulo'], 0.0, .6, .04), (cue('C8_titulo'), S['titulo'], total, 1.45, .01, 1.5)]  # C7: su pico (18 s) cae justo en el título; C8: su golpe está en 1,45 s
ent, fil, vz, sf, mu = [], [], [], [], []
for i, (f, t0) in enumerate(voz):
    ent += ['-i', f]; d = int(t0 * 1000)
    ln = ('volume=1.9,' if 'N1a' in f else 'volume=1.35,') if f.startswith('nando/') else 'loudnorm=I=-16:TP=-1.5,'  # Romeo ya viene limpio y normalizado
    fil.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,{ln}adelay={d}|{d}[v{i}]'); vz.append(f'[v{i}]')
n = len(voz)
for j, (f, t0, vol) in enumerate(SX):
    ent += ['-i', f'sfx/{f}.mp3']; d = max(0, int(t0 * 1000))
    fil.append(f'[{n+j}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
m = n + len(SX)
for q, (f, t0, t1, a, fi, fo) in enumerate(CU):
    ent += ['-i', f]; d = int(t0 * 1000); L = t1 - t0
    fil.append(f'[{m+q}:a]atrim={a}:{a + L},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={L},afade=t=in:d={fi},afade=t=out:st={max(0, L - fo)}:d={fo},adelay={d}|{d}[m{q}]'); mu.append(f'[m{q}]')
fil.append(f"{''.join(mu)}amix=inputs={len(mu)}:normalize=0,volume=0.6[mus]")
fil.append(f"{''.join(vz)}amix=inputs={len(vz)}:normalize=0[voz]")
fil.append(f"[voz]apad=whole_dur={total},asplit=2[voz1][vsc]")
fil.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=400[musd]")
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
fil.append(f"[voz1][musd][sfx]amix=inputs=3:normalize=0,loudnorm=I=-13:TP=-1.2:LRA=11,alimiter=limit=0.92,apad[o]")
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(fil), '-map', '[o]', '-t', str(total), '-ar', '48000', '-c:a', 'pcm_s16le', 'mezcla.wav'], capture_output=True, text=True)
print(r.returncode, r.stderr[:1500])
