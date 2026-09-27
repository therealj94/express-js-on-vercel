"""Sesión F de «Un martes»: Honduras, el incrédulo, Lucía habla, el taller abre."""
import json
exec(open('p3.py').read().split('\nAMIGAS')[0])
Q='/home/user/express-js-on-vercel/video-pipeline/prompts/q_p3_sync_E1.json'
NEG=json.load(open(Q))['jobs'][0]['negative']
LOOK=("Live-action, cinematic, natural practical light, true skin texture with visible pores, real 35mm film grain, "
      "muted true colour, vertical 9:16 composition. ")
def job(id,seed,prompt,wf,dur=5,image=None,audio=None):
    j={"id":id,"seed":seed,"negative":NEG,"width":768,"height":1344,"duration_s":dur,"fps":24,"steps":20,"cfg":1.0,
       "retries":1,"workflow":f"workflows/{wf}","prompt":prompt}
    if image: j["image"]=f"/workspace/refs/{image}"
    if audio: j["audio"]=f"/workspace/refs/{audio}"
    return j
def P(subj,desc,sound):
    return f"subject_definitions:\n{subj}\n\ndetailed_description:\n[Shot 1] {LOOK}{desc}\n\noverall_soundscape: {sound}\n\nnon_diegetic_music: none."
SL="<Subject 1> is the woman in <Picture 1>."
SV="\n<Audio 1> is the voice timbre reference for <Subject 1>."
A=[];B=[]
# 1. Honduras: el proveedor llama y pide el pago (habla a cámara lateral, teléfono al oído)
for t,s in ((1,9101),(2,9102),(3,9103)):
    A.append(job(f"16_honduras_llama_f{t}",s,P("<Subject 1> is the man in <Picture 1>."+SV,
      f"Inside the small glass office of a textile warehouse in San Pedro Sula, Honduras, hot afternoon, stacked rolls of fabric wrapped in plastic and a parked delivery truck visible through the window behind him. <Subject 1>, {PROV}stands holding his phone to his right ear, making a call, looking out toward the truck. <Subject 1> (S1) says, friendly but in a hurry, <d>[Spanish] Doña Lucía, el camión sale a las cuatro. Si me entra el pago hoy, la tela le llega el jueves.</d> Exactly as his voice stops he nods, waiting for the answer. Medium close-up, three-quarter profile, handheld.",
      "warehouse ambience, a fan humming, distant forklift, muffled traffic."),"h3_ref2va_voz_api.json",dur=7,image="proveedor.png",audio="voz_proveedor.wav"))
# 2. Lucía contesta desde su taller en San Salvador
for t,s in ((1,9111),(2,9112)):
    B.append(job(f"15_lucia_responde_f{t}",s,P(SL+SV,
      f"In her small upholstery workshop in San Salvador, rolls of fabric and a half-finished armchair behind her, warm afternoon light through a dusty window. <Subject 1>, {LUCIA}holds her phone to her ear, listening, then answers warmly with a small confident smile, <d>[Spanish] Ya se lo mando, don Chepe.</d> Exactly as her voice stops she lowers the phone from her ear and looks down at its screen. Medium close-up, handheld, facing the camera at three-quarter angle, her mouth clearly visible.",
      "quiet workshop, a sewing machine stopping, street noise far away."),"h3_ref2va_voz_api.json",image="lucia.png",audio="voz_lucia.wav"))
# 3. El incrédulo, de verdad incrédulo
for t,s in ((1,9121),(2,9122),(3,9123)):
    (A if t<3 else B).append(job(f"12b_incredulo_f{t}",s,P("<Subject 1> is the man in <Picture 1>."+SV,
      "At a lunch table in a busy local restaurant, plates of food on the table. <Subject 1>, a tall thin man around 40 with a shaved head and a trimmed grey beard, wearing a light blue guayabera, sits back with his arms crossed over his chest and his phone face down on the table, not touching it. He looks at the woman across the table with narrowed eyes, one eyebrow raised, and slowly shakes his head, clearly unconvinced. <Subject 1> (S1) asks with playful doubt, <d>[Spanish] ¿Y cómo sé que le llegó?</d> Exactly as his voice stops he tilts his head, waiting for proof, lips pressed together. Medium close-up, handheld.",
      "restaurant murmur, soft cutlery."),"h3_ref2va_voz_api.json",image="esceptico.png",audio="voz_esceptico.wav"))
# 4. El taller abre: para «tengo un taller de tapicería»
for t,s in ((1,9131),(2,9132)):
    B.append(job(f"00_taller_abre_f{t}",s,P(SL,
      f"Early morning on a quiet residential street in San Salvador, soft golden sunrise light. <Subject 1>, {LUCIA}pulls up the corrugated metal roll-up shutter of her small upholstery workshop with both hands; as it rises it reveals rolls of colourful fabric and an old armchair waiting to be reupholstered. She pauses in the doorway and looks inside with quiet pride. Wide medium shot from the sidewalk, slow push-in, handheld.",
      "metal shutter rattling up, birds, a distant bus, a rooster far away."),"h3_ref2va_api.json",image="lucia.png"))
# 5. Cocina: el teléfono en la mano de principio a fin
for t,s in ((1,9141),(2,9142)):
    A.append(job(f"03_cocina_envia_f{t}",s,P(SL,
      f"In her small kitchen at dawn, a cup of steaming coffee and a piece of sweet bread on the wooden table. <Subject 1>, {LUCIA}sits at the table holding her phone in both hands the whole time, types with her thumb, then presses the screen once firmly and lets out a small relieved breath, a soft smile, still holding the phone. Medium close-up, the phone always in her hands, handheld.",
      "kitchen morning quiet, coffee maker gurgling, birds outside."),"h3_ref2va_api.json",image="lucia.png"))
# 6. El brindis con sonido limpio
for t,s in ((1,9151),(2,9152)):
    B.append(job(f"12_amiga_limpia_f{t}",s,P(SL+SV,
      "At a lunch table in a busy local restaurant, a heavyset woman around 40 with short curly black hair and big laugh lines in a mustard blouse raises her glass of iced tea toward the friends around her, holding her phone in the other hand, laughing. <Subject 1> (S1) exclaims, delighted, <d>[Spanish] ¡Ya no hay «te lo paso luego»!</d> Exactly as her voice stops she laughs and takes a sip. Medium close-up, handheld.",
      "soft restaurant murmur, one gentle clink of glasses."),"h3_ref2va_voz_api.json",image="amiga.png",audio="voz_amiga.wav"))
for n,js in (("F1",A),("F2",B)):
    json.dump({"version":1,"defaults":{},"_nota":f"Un martes, sesion {n}: Honduras, incredulo, Lucia habla.","jobs":js},
      open(f'/home/user/express-js-on-vercel/video-pipeline/prompts/q_p3_{n}.json','w'),ensure_ascii=False,indent=1)
    print(n,len(js),[j['id'] for j in js])
