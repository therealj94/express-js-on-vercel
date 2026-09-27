"""Locución de «Abrir» (película 4): la voz de Lucía, medida de verdad."""
import json,os,subprocess,urllib.request,sys
V="rnktyBnYiJ9gGJSNsJZn"  # Rocío = Lucía (la misma voz de «Un martes»)
L={
"L01a":"¿Y si pudiéramos crear una sola economía...",
"L01b":"sin que ningún país pierda su soberanía?",
"L02":"Morasán soñó con una Centroamérica unida.",
"L03":"Hoy podemos empezar por conectar nuestras oportunidades.",
"L03b":"Siete países. Más de cincuenta millones de personas... abriendo su día.",
"L04":"Imaginá pagar y recibir con una misma moneda digital:",
"L04b":"ORIGEN, referenciada al oro.",
"L05":"Cada país conserva su moneda. Y entre nosotros, un mismo idioma para comerciar.",
"L06":"Personas y empresas, conectadas en el Sistema Financiero Social de Orden Global.",
"L07":"Crear con de, be, ene, equis, un mercado para nuestras empresas.",
"L07b":"Acercar los proyectos al capital.",
"L08":"Abrir caminos para que un taller como el mío pueda crecer... y contratar.",
"L09":"Conocer nuestra riqueza en oro y plata. Evaluarla con rigor.",
"L09b":"Y estructurar proyectos que busquen financiación antes de iniciar la extracción.",
"L10":"Y pensar en grande: industria, comercio... un tren que una dos océanos.",
"L11":"Más acceso al capital. Más empleo.",
"L12":"[softly] Más familias con ingresos para comer, estudiar... y salir adelante.",
"L13":"[warmly] Porque una oportunidad para una empresa puede convertirse en una oportunidad para toda una familia.",
"L14":"Y más oportunidades también ayudan a construir comunidades más seguras.",
"L15":"El primer paso ya existe: Orden Global.",
"L16":"El futuro lo construimos juntos.",
"L17":"Para vos. Para tu familia. Para todos.",
"L18":"Y si empezamos por Centroamérica...",
"L19":"¿por qué no toda Latinoamérica?",
}
K=os.environ["EL_KEY"]
for k,t in L.items():
    o=f"voz_abrir/{k}.mp3"
    if not os.path.exists(o):
        body=json.dumps({"text":t,"model_id":"eleven_v3","language_code":"es","voice_settings":{"stability":0.5,"similarity_boost":0.8}}).encode()
        r=urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{V}?output_format=mp3_44100_128",body,{"xi-api-key":K,"Content-Type":"application/json"})
        open(o,"wb").write(urllib.request.urlopen(r).read())
        subprocess.run(["ffmpeg","-y","-loglevel","error","-i",o,"-af","silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse","-ar","48000",o[:-4]+".wav"])
json.dump(L,open("voz_abrir/lineas.json","w"),ensure_ascii=False,indent=1)
import soundfile as sf
tot=0
for k in L:
    d=sf.info(f"voz_abrir/{k}.wav").duration; tot+=d
    print(f"{k:5} {d:5.2f}s  {len(L[k].split()):3d} palabras")
print(f"total voz {tot:.1f}s, {sum(len(t.split()) for t in L.values())} palabras")
