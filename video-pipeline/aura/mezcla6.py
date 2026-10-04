import subprocess, json
T=json.load(open('codigo/tiempos.json')); V=T['voces']; total=T['total']
toma={'V1':'b','V2':'b','V3':'b','V4':'b','V5':'a','V6':'a','V7':'a','V8':'b'}
SFX=[('cristal',2.0,.6),('particulas',11.0,.5),('chasquido',6.1,.5),('telefono',25.4,.45),('correos',28.9,.5),('boton',30.9,.5),
     ('boton',34.4,.5),('oro_vuela',38.3,.6),('huella_oro',40.9,.6),('hielo',44.8,.5),('encoge',46.5,.5),('boton',48.2,.45),('final',56.0,.8)]
ent=[];fil=[];vz=[];sf=[]
for i,(k,t0) in enumerate(V.items()):
    ent+=['-i',f'v6/{k}_{toma[k]}.mp3']; d=int(t0*1000)
    fil.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-15:TP=-1.5,adelay={d}|{d}[v{i}]'); vz.append(f'[v{i}]')
n=len(V)
for j,(f,t0,vol) in enumerate(SFX):
    ent+=['-i',f'audio/sfx_{f}.mp3']; d=int(t0*1000)
    fil.append(f'[{n+j}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={d}|{d}[s{j}]'); sf.append(f'[s{j}]')
m=n+len(SFX); ent+=['-i','v6/musica_b.mp3']
fil.append(f"[{m}:a]aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=1.5,adelay=2000|2000,volume='0.5*(1-0.75*clip((t-56.2)/2.2,0,1))':eval=frame,afade=t=out:st={total-3}:d=3[mus]")
fil.append(f"{''.join(vz)}amix=inputs={len(vz)}:normalize=0[voz]")
fil.append("[voz]asplit=2[voz1][vsc]")
fil.append("[mus][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[musd]")
fil.append(f"{''.join(sf)}amix=inputs={len(sf)}:normalize=0[sfx]")
fil.append(f"[voz1][musd][sfx]amix=inputs=3:normalize=0,apad=whole_dur={total},asetpts=N/SR/TB,atrim=0:{total},alimiter=limit=0.9[o]")
r=subprocess.run(['ffmpeg','-y','-v','error',*ent,'-filter_complex',';'.join(fil),'-map','[o]','-c:a','pcm_s16le','v6/mezcla6.wav'],capture_output=True,text=True)
print(r.returncode, r.stderr[:800])
