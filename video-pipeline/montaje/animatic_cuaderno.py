import json, subprocess, numpy as np
from PIL import Image
stt=json.load(open("voz/stt.json"))
elec_img={0:"cenital/m1.png",1:"cenital/p01_1.png",2:"cenital/p02_1.png",3:"cenital/p03_1.png",4:"cenital/p04_1.png",5:"cenital/p05_2.png",
          6:"cenital/p06_2.png",7:"cenital/p07_1.png",8:"cenital/p08_1.png",9:"cenital/p09_1.png",10:"cenital/p10_2.png"}
elec_voz={p:1 for p in range(11)}; elec_voz[2]=2
W,H,FPS,PRE,POST,FADE=1080,1920,24,0.5,1.3,0.5
pags=[]; t=0
for p in range(11):
    x=next(s for s in stt if s["pag"]==p and s["v"]==elec_voz[p])
    d=PRE+x["fin"]+POST+(1.0 if p==6 else 0)
    pags.append({"p":p,"t":t,"d":d,"mp3":f"voz/{x['s']}.mp3"}); t+=d-FADE
total=t+FADE
json.dump(pags,open("animatic/tiempos.json","w"),indent=1)
src={p:Image.open(f).convert("RGB") for p,f in elec_img.items()}
def cuadro(p,u):
    im=src[p]; w,h=im.size
    z=1.0+0.10*u            # empuje lento: el cuaderno ya llena el cuadro
    cw,ch=w/z,h/z; cx,cy=w*0.5,h*0.5
    box=(cx-cw/2,max(0,min(h-ch,cy-ch/2)));box=(box[0],box[1],box[0]+cw,box[1]+ch)
    return np.asarray(im.resize((W,H),Image.BICUBIC,box=box),dtype=np.float32)
ff=subprocess.Popen(["ffmpeg","-y","-loglevel","error","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-",
    "-c:v","libx264","-crf","20","-pix_fmt","yuv420p","animatic/v.mp4"],stdin=subprocess.PIPE)
for k in range(int(total*FPS)):
    s=k/FPS; acc=None
    for g in pags:
        if g["t"]<=s<g["t"]+g["d"]:
            f=cuadro(g["p"],(s-g["t"])/g["d"])
            a=min(1,(s-g["t"])/FADE) if g["p"]>0 else min(1,s/1.0)
            if g["p"]==10: a*=min(1,(g["t"]+g["d"]-s)/1.0)
            acc=f*a if acc is None else acc*(1-a)+f*a
    ff.stdin.write((acc if acc is not None else np.zeros((H,W,3))).clip(0,255).astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
ins=[];fl=[]
for i,g in enumerate(pags):
    ins+=["-i",g["mp3"]]; ms=int((g["t"]+PRE)*1000); fl.append(f"[{i}]adelay={ms}|{ms},aformat=channel_layouts=stereo[a{i}]")
fl.append("".join(f"[a{i}]" for i in range(len(pags)))+f"amix=inputs={len(pags)}:normalize=0,apad,atrim=0:{total:.2f},loudnorm=I=-16:TP=-1.5[a]")
subprocess.run(["ffmpeg","-y","-loglevel","error",*ins,"-i","animatic/v.mp4","-filter_complex",";".join(fl),"-map",f"{len(pags)}:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k","animatic/el_cuaderno_animatic.mp4"],check=True)
print("total",round(total,1))
