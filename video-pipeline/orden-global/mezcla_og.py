"""Mezcla del tráiler Orden Global: voz AURA + música (tres tramos) + efectos, con la música agachada bajo la voz."""
import json, subprocess
T = json.load(open('codigo/tiempos.json')); S = T['s']; V = T['voces']; total = T['total']
PK = {'boom': 1.27, 'caida': 2.18, 'riser': 3.94, 'cristal': 1.46}
def sfx(n, t, v): return (n, t - PK.get(n, 0), v)
SX = [sfx('tictac', 0, .9), sfx('cristal', S['fin_hook'] + .05, .8)]
for t in [S['cafe'], S['minerales'], S['salen'], S['salen'] + 1.25, S['region'] - .1, S['taller'] - .1, S['yo'] - .2, S['recursos'] - .15, S['empresas'] - .1, S['dinero'] - .1]:
    SX.append(sfx('whoosh', t - .15, .5))
SX += [sfx('boom', S['aura'], .8), sfx('taiko', S['tres'], .65), sfx('taiko', S['tres'] + .38, .55), sfx('taiko', S['tres'] + .76, .6),
       sfx('campana', S['origen'], .45), sfx('ui', S['origen'] + .4, .3), sfx('ui', S['cel'] + .2, .3), sfx('ding', S['huella'] + .6, .35), sfx('ding', S['recibo'], .6),
       sfx('ui', S['recuerdo'], .3), sfx('caida', S['electrum'] + .9, .55), sfx('riser', S['clima'], .5), sfx('boom', S['clima'], .75),
       sfx('campana', S['vara'], .6), sfx('braam', S['logo'], .8), sfx('tictac', total - .9, .6)]
ent, fil, vz, sf = [], [], [], []
for i, k in enumerate(V):
    ent += ['-i', f'v/r_{k}.wav']; d = int(V[k] * 1000)
    fil.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5,adelay={d}|{d}[v{i}]'); vz.append(f'[v{i}]')
n = len(V)
for j, (f, t0, vol) in enumerate(SX):
    ent += ['-i', f'sfx/{f}.mp3']; d = max(0, int(t0 * 1000))
    fil.append(f'[{n+j}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
m = n + len(SX); ent += ['-i', 'musica.mp3', '-i', 'musica.mp3', '-i', 'musica.mp3']
DM = 3.55
fil.append(f"[{m}:a]atrim=0:42,asetpts=PTS-STARTPTS[m1];[{m+1}:a]atrim=29:43,asetpts=PTS-STARTPTS[m2];[{m+2}:a]atrim=42:64,asetpts=PTS-STARTPTS[m3];"
           f"[m1][m2]acrossfade=d=1[m12];[m12][m3]acrossfade=d=1,aresample=48000,aformat=channel_layouts=stereo,adelay={int(DM*1000)}|{int(DM*1000)},"
           f"volume='if(between(t,{S['negro']-.05},{S['aura']-.05}),0.04,1)':eval=frame,volume=0.6,afade=t=out:st={total-1.6}:d=1.5[mus]")
fil.append(f"{''.join(vz)}amix=inputs={len(vz)}:normalize=0[voz]")
fil.append("[voz]asplit=2[voz1][vsc]")
fil.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[musd]")
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
fil.append(f"[voz1][musd][sfx]amix=inputs=3:normalize=0,apad=whole_dur={total},atrim=0:{total},loudnorm=I=-13:TP=-1.2:LRA=11,alimiter=limit=0.92[o]")
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(fil), '-map', '[o]', '-ar', '48000', '-c:a', 'pcm_s16le', 'mezcla.wav'], capture_output=True, text=True)
print(r.returncode, r.stderr[:1500])
