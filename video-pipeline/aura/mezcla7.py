"""Mezcla del tráiler v7: python3 mezcla7.py en|es → v7/mezcla_{lang}.wav (voz única de AURA + música + efectos)."""
import subprocess, json, sys
lang = sys.argv[1]
T = json.load(open(f'codigo/tiempos_{lang}.json')); S = T['s']; V = T['voces']; total = T['total']; toma = T['toma']
carpeta = 'v6' if lang == 'en' else 'v7es'
SFX = [('cristal', S['a0'], .6), ('chasquido', S['grid'] + .1, .5), ('particulas', S['caida'] + .8, .5),
       ('impacto', S['equipo'], .45), ('telefono', S['montaje'] + .4, .45), ('correos', S['f_correo'] + .2, .5),
       ('chasquido', S['f_post'] + .1, .45), ('boton', S['f_compu'] + 2.3, .5), ('oro_vuela', S['formula'] + .4, .6),
       ('huella_oro', S['firma'], .6), ('hielo', S['congela'], .5), ('encoge', S['escritorio'], .5),
       ('boton', S['notch'], .45), ('final', S['aF'] - .2, .8)]
ent, fil, vz, sf = [], [], [], []
for i, (k, t0) in enumerate(V.items()):
    ent += ['-i', f'{carpeta}/{k}_{toma[k]}.mp3']; d = int(t0 * 1000)
    fil.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-15:TP=-1.5,adelay={d}|{d}[v{i}]'); vz.append(f'[v{i}]')
n = len(V)
for j, (f, t0, vol) in enumerate(SFX):
    ent += ['-i', f'audio/sfx_{f}.mp3']; d = int(t0 * 1000)
    fil.append(f'[{n+j}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
m = n + len(SFX); ent += ['-i', 'v6/musica_b.mp3']; caida = S['aF'] - 2.1
fil.append(f"[{m}:a]aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=1.5,adelay=2000|2000,"
           f"volume='0.5*(1-0.75*clip((t-{caida})/2.2,0,1))':eval=frame,afade=t=out:st={total-3}:d=3[mus]")
fil.append(f"{''.join(vz)}amix=inputs={len(vz)}:normalize=0[voz]")
fil.append("[voz]asplit=2[voz1][vsc]")
fil.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[musd]")
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
fil.append(f"[voz1][musd][sfx]amix=inputs=3:normalize=0,apad=whole_dur={total},asetpts=N/SR/TB,atrim=0:{total},"
           f"loudnorm=I=-14:TP=-1.2:LRA=9,alimiter=limit=0.9[o]")
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(fil), '-map', '[o]', '-ar', '48000',
                    '-c:a', 'pcm_s16le', f'v7/mezcla_{lang}.wav'], capture_output=True, text=True)
print(lang, r.returncode, r.stderr[:600])
