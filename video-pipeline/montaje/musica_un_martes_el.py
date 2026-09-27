import json,os,urllib.request,sys
S=lambda n,pos,neg,ms:{"section_name":n,"positive_local_styles":pos,"negative_local_styles":neg,"duration_ms":ms,"lines":[]}
plan={"positive_global_styles":["cinematic Latin American acoustic score","warm nylon-string guitar","soft felt piano","intimate, human, hopeful","84 bpm","D major","instrumental","film score for a heartfelt commercial","leaves space for a spoken voice"],
"negative_global_styles":["vocals","singing","choir","EDM","trap","heavy drums","electric guitar distortion","reggaeton","corporate ukulele"],
"sections":[
 S("Amanecer",["solo nylon guitar arpeggios","sparse","morning light","very soft piano notes","quiet"],["percussion","bass"],23600),
 S("El barrio",["gentle walking rhythm","soft shaker and brushed cajon","guitar and piano dialogue","light and warm","slightly playful"],["loud drums"],30400),
 S("Almuerzo",["festive but soft","light hand percussion","plucked guitar","warm"],["loud"],14200),
 S("Honduras, el camion",["subtle tension","low piano ostinato pulse","soft ticking percussion","anticipation","minor color"],["loud","aggressive"],18400),
 S("Ya me cayo",["tension releases into bright major chord","relief","guitar strum","warm lift"],["aggressive"],7200),
 S("Noche",["intimate solo piano","very soft","tender","night"],["percussion","drums"],13600),
 S("Aeropuerto",["emotional swell","strings join guitar and piano","full and warm","tears of joy"],["drums","vocals"],8000),
 S("Cierre",["resolve on final D major chord","piano and guitar","ringing out","calm"],["percussion"],6000)]}
body=json.dumps({"composition_plan":plan,"model_id":"music_v1"}).encode()
r=urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192",body,{"xi-api-key":os.environ["EL_KEY"],"Content-Type":"application/json"})
open(sys.argv[1],"wb").write(urllib.request.urlopen(r,timeout=600).read())
json.dump(plan,open(sys.argv[1]+".plan.json","w"),ensure_ascii=False,indent=1)
