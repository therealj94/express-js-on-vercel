"""Mezcla «Un día más»: jingle v2C + base de punta programada (perc.wav) + efectos de las transiciones."""
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
# ganancia de la percusión por sección: gancho suave, caída y coro a pleno
PG = "volume='0.7+0.15*min(1,max(0,(t-12.4)/0.8))-0.35*min(1,max(0,(t-21.6)/0.6))*lt(t,32.4)-0.5*min(1,max(0,(t-7.6)/0.6))*min(1,max(0,(13.0-t)/0.8))':eval=frame"
# la música del jingle cede en la caída instrumental: ahí mandan los tambores en vivo y el caracol
# transición suave: la música baja en 0,6 s hasta 0,62 y vuelve en 0,8 s al verso
MG = "volume='1-0.38*min(1,max(0,(t-7.5)/0.6))*min(1,max(0,(13.0-t)/0.8))':eval=frame"
# tambores garífunas en vivo (toma B): su primer golpe (5,496 s) cae en el pulso 15 (caída) y otra vez en el pulso 41 (coro)
VIVO = [(b(15) - 5.496, 4.70, 15.0, 0.85, .7, 1.2), (b(41) - 5.496, 5.0, 14.9, 0.7, .5, 1.0)]   # (desfase, desde, hasta, ganancia, fade in, fade out)
ent = ['-i', 'musica/v2_C.mp3', '-i', 'perc.wav']; fil = [
    f"[0:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{total},afade=t=out:st={total - .8}:d=0.8,{MG}[mus]",
    f"[1:a]aresample=48000,highpass=f=55,equalizer=f=3000:t=q:w=1.2:g=-3,acompressor=threshold=-18dB:ratio=3:attack=3:release=60,{PG}[per]"]
sf = []
SX += [('../perc/caracol_a', 7.3, .45), ('../perc/multitud_a', b(15) + .3, .3), ('../perc/multitud_b', b(41) + .3, .25)]
for j, (n, t0, vol) in enumerate(SX):
    ent += ['-i', f'sfx/{n}_a.mp3' if not n.startswith('..') else f'sfx/{n}.mp3']; d = max(0, int(t0 * 1000))
    fil.append(f'[{j + 2}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
vv = []
for q, (d0, a, z, g, fi, fo) in enumerate(VIVO):
    ent += ['-i', 'perc/punta_vivo_B.mp3']; k = len(ent) // 2 - 1; d = int((d0 + a) * 1000)
    fil.append(f'[{k}:a]atrim={a}:{z},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d={fi},afade=t=out:st={z - a - fo}:d={fo},highpass=f=40,acompressor=threshold=-26dB:ratio=3:attack=8:release=150:makeup=4,volume={g},adelay={d}|{d}[vv{q}]'); vv.append(f'[vv{q}]')
fil.append(f"{''.join(vv)}amix=inputs={len(vv)}:normalize=0[vivo]")
fil.append("[mus][per][sfx][vivo]amix=inputs=4:normalize=0:weights='0.78 1 0.8 1',loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.82:level=false,apad[o]")
r = subprocess.run(['ffmpeg', '-y', '-v', 'error', *ent, '-filter_complex', ';'.join(fil), '-map', '[o]', '-t', str(total), '-ar', '48000', '-c:a', 'pcm_s16le', 'mezcla.wav'], capture_output=True, text=True)
print(r.returncode, r.stderr[:800], len(SX), 'efectos')
