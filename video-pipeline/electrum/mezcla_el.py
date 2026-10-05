"""Mezcla del tráiler de Dr Electrum: voces + música (dos pasadas) + efectos, con la música agachada bajo la voz."""
import json, subprocess
T = json.load(open('codigo/tiempos.json')); S = T['s']; V = T['voces']; total = T['total']; rec = T['recorte']
SFX = [('sfx_martillo', S['martillo'], .9), ('sfx_papeles', S['papeles'] + .2, .45), ('sfx_holo', S['mapa'] + .2, .5),
       ('sfx_holo', S['mapa_cod'] + .4, .35), ('sfx_alerta', S['rojo'] - .05, .55), ('sfx_holo', S['geo'] + .2, .3),
       ('sfx_papeles', S['docs'], .3), ('sfx_alerta', S['bruto'] + .15, .35), ('sfx_holo', S['tablero'], .3), ('sfx_holo', S['planta'] + .3, .4), ('sfx_holo', S['p_armo'], .3), ('sfx_holo', S['p_com'], .25),
       ('sfx_impresora', S['entreg'] + 4.7, .5), ('sfx_holo', S['aprende'] + .3, .3), ('sfx_martillo', S['logo'] + .05, .8),
       ('../aura/audio/sfx_final', S['logo'] - .1, .55)]
ent, fil, vz, sf = [], [], [], []
for i, (k, t0) in enumerate(V.items()):
    ent += ['-i', T['archivos'][k]]; d = int(t0 * 1000); r = rec.get(k, 0)
    fil.append(f'[{i}:a]atrim=start={r},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-1.5,adelay={d}|{d}[v{i}]'); vz.append(f'[v{i}]')
n = len(V)
for j, (f, t0, vol) in enumerate(SFX):
    ent += ['-i', f + '.mp3']; d = int(t0 * 1000)
    fil.append(f'[{n+j}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
m = n + len(SFX); ent += ['-i', 'musica_a.mp3', '-ss', '58', '-i', 'musica_a.mp3', '-ss', '58', '-i', 'musica_a.mp3']
fil.append(f"[{m}:a]atrim=0:101[m1];[{m+1}:a]atrim=0:38,asetpts=PTS-STARTPTS[m2];[{m+2}:a]asetpts=PTS-STARTPTS[m3];[m1][m2]acrossfade=d=3[m12];[m12][m3]acrossfade=d=3,aresample=48000,aformat=channel_layouts=stereo,"
           f"volume=0.55,afade=t=out:st={total-2.5}:d=2.5[mus]")
fil.append(f"{''.join(vz)}amix=inputs={len(vz)}:normalize=0[voz]")
fil.append("[voz]asplit=2[voz1][vsc]")
fil.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=7:attack=20:release=400[musd]")
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
fil.append(f"[voz1][musd][sfx]amix=inputs=3:normalize=0,apad=whole_dur={total},asetpts=N/SR/TB,atrim=0:{total},loudnorm=I=-14:TP=-1.2:LRA=10,alimiter=limit=0.9[o]")
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(fil), '-map', '[o]', '-ar', '48000', '-c:a', 'pcm_s16le', 'mezcla.wav'], capture_output=True, text=True)
print(r.returncode, r.stderr[:800])
