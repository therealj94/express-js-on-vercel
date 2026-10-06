"""Mezcla Orden Global v2 (cine)."""
import json, subprocess
T = json.load(open('codigo/tiempos2.json')); S = T['s']; V = T['voces']; total = T['total']
PK = {'boom': 1.27, 'riser': 3.94, 'cristal': 1.46}
sx = lambda n, t, v: (n, t - PK.get(n, 0), v)
WH = [S['trabaja'] - .1, S['oro'] - .1, S['litio'] - .1, S['cafe'] - .1, S['seguimos'] - .1, S['firma'] - .35, S['mexico'] - .1, S['patagonia'] - .1, S['agua'] - .1, S['manana'], S['electrum']]
SX = [sx('tictac', 0, .6), sx('boom', S['dinero'], .35)] + [sx('whoosh', t - .2, .45) for t in WH] + [
      sx('boom', V['B04'] - .1, .6), sx('boom', S['aura'] + .1, .7), sx('campana', S['origen'] + .3, .45), sx('riser', S['recursos'] - .1, .55),
      sx('boom', S['recursos'] - .1, .7), sx('campana', S['vara'], .55), sx('braam', S['logo'], .8), sx('tictac', total - 1.0, .5)]
ent, fil, vz, sf = [], [], [], []
for i, k in enumerate(V):
    ent += ['-i', f'v/q_{k}.wav']; d = int(V[k] * 1000)
    fil.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5,adelay={d}|{d}[v{i}]'); vz.append(f'[v{i}]')
n = len(V)
for j, (f, t0, vol) in enumerate(SX):
    ent += ['-i', f'sfx/{f}.mp3']; d = max(0, int(t0 * 1000))
    fil.append(f'[{n+j}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
m = n + len(SX); ent += ['-i', 'musica.mp3'] * 3
fil.append(f"[{m}:a]atrim=1.2:40,asetpts=PTS-STARTPTS[m1];[{m+1}:a]atrim=17:41,asetpts=PTS-STARTPTS[m2];[{m+2}:a]atrim=40:64,asetpts=PTS-STARTPTS[m3];"
           f"[m1][m2]acrossfade=d=1[m12];[m12][m3]acrossfade=d=1,aresample=48000,aformat=channel_layouts=stereo,"
           f"volume='if(between(t,{S['hasta']-.2},{S['aura']+.1}),0.12,1)':eval=frame,volume=0.62,afade=t=out:st={total-1.8}:d=1.7[mus]")
fil.append(f"{''.join(vz)}amix=inputs={len(vz)}:normalize=0[voz]")
fil.append("[voz]asplit=2[voz1][vsc]")
fil.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[musd]")
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
fil.append(f"[voz1][musd][sfx]amix=inputs=3:normalize=0,apad=whole_dur={total+1},atrim=0:{total},loudnorm=I=-13:TP=-1.2:LRA=11,alimiter=limit=0.92[o]")
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(fil), '-map', '[o]', '-ar', '48000', '-c:a', 'pcm_s16le', 'mezcla2.wav'], capture_output=True, text=True)
print(r.returncode, r.stderr[:1500])
