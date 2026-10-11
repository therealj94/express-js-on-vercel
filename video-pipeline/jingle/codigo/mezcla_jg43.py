"""Mezcla «Un día más» 43 s: jingle extendido + punta programada (perc43.wav) + tambores en vivo + caracol + efectos de transición."""
import json, subprocess
J = json.load(open('codigo/tiempos.json')); C = J['C']; S = J['s']; total = J['total']
BEAT = 0.5357; B0 = -0.012
def b(n): return B0 + n * BEAT
SX = [('zip', .02, .7)]
for c in C[1:]:
    if c[7] in ('whip', 'whipv'): SX.append(('whoosh_rapido', c[1] - .22, .55))
    elif c[7] == 'zoom': SX.append(('whoosh_grave', c[1] - .35, .5))
    elif c[7] == 'giro': SX.append(('swish_aire', c[1] - .3, .5))
SX += [('bajo_agua', b(12) + .05, .45), ('olas', b(24), .35), ('olas', b(27), .3), ('fogata', b(34.5), .5), ('risa', b(33) + .25, .35),
       ('toque_tel', b(36.4) + .9, .8), ('avion', b(38), .45), ('impacto_final', S['fin'] + .05, .6)]
X2 = [  # (archivo en sfx2/perc, inicio, volumen, fundido de salida desde)
    ('sfx2/caracol_solo_c', b(14.5) + .1, .8, 2.9), ('sfx2/drop_bajo_b', b(17) - .02, .16, None), ('perc/multitud_a', b(17) + .3, .3, None),
    ('sfx2/fiesta_noche_c', b(41) - .2, .55, 7.0), ('sfx2/orbe_luz_b', b(46.5) + .3, .9, None), ('sfx2/fuego_encendido_c', b(50) + .08, .7, None),
    ('sfx2/fuego_poi_a', b(52.5), .55, 2.8), ('sfx2/riser_a', b(56.5) - 3.0, .5, None), ('sfx2/drop_bajo_b', b(57) - .02, .2, None),
    ('perc/multitud_b', b(57) + .3, .25, None), ('sfx2/fuego_poi_b', b(68) - .1, .35, None)]
# la música cede en la caída del caracol y los tambores; el puente ya viene filtrado desde extender_jg.py
MG = "volume='1-0.38*min(1,max(0,(t-7.6)/0.6))*min(1,max(0,(13.0-t)/0.8))':eval=frame"
# tambores garífunas en vivo (toma B, primer golpe en 5,496 s): caída en b(17), puente abierto en b(49), coro en b(57)
VIVO = [(b(17) - 5.496, 4.9, 13.5, 0.85, .4, 1.2), (b(49) - 5.496, 5.3, 5.496 + 8 * BEAT, 0.8, .3, .25), (b(57) - 5.496, 5.0, 14.9, 0.7, .5, 1.0)]
ent = ['-i', 'musica/v2_C_ext.wav', '-i', 'perc43.wav']; fil = [
    f"[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total},afade=t=out:st={total - .8}:d=0.8,{MG}[mus]",
    f"[1:a]aresample=48000,highpass=f=55,equalizer=f=3000:t=q:w=1.2:g=-3,acompressor=threshold=-18dB:ratio=3:attack=3:release=60[per]"]
sf = []
for j, (n, t0, vol) in enumerate(SX):
    ent += ['-i', f'sfx/{n}_a.mp3']; d = max(0, int(t0 * 1000))
    fil.append(f'[{j + 2}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
for q, (f, t0, vol, fo) in enumerate(X2):
    ent += ['-i', f'{f}.mp3']; k = len(ent) // 2 - 1; d = max(0, int(t0 * 1000)); sal = f',afade=t=out:st={fo}:d=0.8' if fo else ''
    fil.append(f'[{k}:a]aresample=48000,aformat=channel_layouts=stereo{sal},volume={vol},adelay={d}|{d}[x{q}]'); sf.append(f'[x{q}]')
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
vv = []
for q, (d0, a, z, g, fi, fo) in enumerate(VIVO):
    ent += ['-i', 'perc/punta_vivo_B.mp3']; k = len(ent) // 2 - 1; d = int((d0 + a) * 1000)
    fil.append(f'[{k}:a]atrim={a}:{z},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d={fi},afade=t=out:st={z - a - fo}:d={fo},highpass=f=40,acompressor=threshold=-26dB:ratio=3:attack=8:release=150:makeup=4,volume={g},adelay={d}|{d}[vv{q}]'); vv.append(f'[vv{q}]')
fil.append(f"{''.join(vv)}amix=inputs={len(vv)}:normalize=0[vivo]")
fil.append("[mus][per][sfx][vivo]amix=inputs=4:normalize=0:weights='0.78 1 0.8 1',loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.82:level=false,apad[o]")
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(fil), '-map', '[o]', '-t', str(total), '-ar', '48000', '-c:a', 'pcm_s16le', 'mezcla43.wav'], capture_output=True, text=True)
print(r.returncode, r.stderr[:800], len(SX), 'efectos')
