import json,os,subprocess,urllib.request
V="rnktyBnYiJ9gGJSNsJZn"  # Rocío: cálida, clara, latinoamericana neutra
L={
"n01":"[warmly] Me llamo Lucía.",
"n02":"Tengo un taller de tapicería, en San Salvador.",
"n03":"Mi hija, Sofía, estudia en Madrid.",
"n04":"Antes era una fila y días de espera. Ahora, desde la cocina.",
"n05":"[softly] Y ya le compré el boleto. En diciembre viene a casa.",
"n06":"En el barrio ya se paga así.",
"n07":"Y esto es mío. Se llama ONDK: una parte de Orden Global, la empresa detrás de todo esto.",
"n07b":"Tiene su acta, y la puedo abrir cuando quiera.",
"n08":"[cheerfully] Martes de cumpleaños.",
"n09":"Y la cuenta... que siempre era un lío.",
"n10":"Ahora, cada quien paga lo suyo.",
"n11":"[amused] Siempre hay uno que no se lo cree.",
"n12":"Pregúntale al dueño.",
"n13":"Mi proveedor de telas está en Honduras.",
"n14":"Otro país. Y el camión no espera.",
"n15":"[softly] Un martes cualquiera.",
"n16":"Orden Global. Un sistema financiero que se puede comprobar.",
}
for k,t in L.items():
    o=f"voces/narracion/{k}.mp3"
    if os.path.exists(o): continue
    body=json.dumps({"text":t,"model_id":"eleven_v3","language_code":"es","voice_settings":{"stability":0.5,"similarity_boost":0.8}}).encode()
    r=urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{V}?output_format=mp3_44100_128",body,
        {"xi-api-key":os.environ["EL_KEY"],"Content-Type":"application/json"})
    open(o,"wb").write(urllib.request.urlopen(r).read())
    subprocess.run(["ffmpeg","-y","-loglevel","error","-i",o,"-af","silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse","-ar","48000",o[:-4]+".wav"])
json.dump(L,open("voces/narracion/lineas.json","w"),ensure_ascii=False,indent=1)
