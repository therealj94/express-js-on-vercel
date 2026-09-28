"""Banda original de «Siete» con la API de música de ElevenLabs.

Empieza en el 05:59 (la apertura de Bukele lleva solo su voz y el pulso
dramático). Las secciones siguen los bloques del montaje; el tiempo exacto lo
da montaje/siete.py --solo-tiempos y se pasa como JSON: {"bloque": segundos}.

    EL_KEY=... python3 montaje/musica_siete.py tiempos_bloques.json salida.mp3
"""
import json, os, sys, urllib.request

S = lambda n, pos, neg, s: {"section_name": n, "positive_local_styles": pos,
                            "negative_local_styles": neg, "duration_ms": int(s * 1000), "lines": []}
B = json.load(open(sys.argv[1]))
# La API pide secciones de 3 s como mínimo: lo que le falte a las puertas sale de ORIGEN.
if B["puertas"] < 3:
    B["origen"] -= 3 - B["puertas"]; B["puertas"] = 3
plan = {
    "positive_global_styles": ["cinematic Central American film score", "wooden marimba", "warm strings",
                               "soft felt piano", "nylon-string guitar", "hand percussion", "hopeful, human, proud",
                               "92 bpm", "D major", "instrumental", "leaves space for spoken voice"],
    "negative_global_styles": ["vocals", "singing", "choir", "EDM", "trap", "reggaeton", "electric guitar",
                               "corporate ukulele", "heavy drums"],
    "sections": ([S("Titulo y amanecer", ["one deep cinematic low boom", "a long held low string note", "near silence",
                                         "a soft marimba motif slowly emerging at dawn"], ["drums", "percussion loop"], B["titulo"])]
                 if "titulo" in B else []) + [
        S("Amanecer, siete presentaciones", ["solo marimba, soft and sparse", "gentle morning", "light shaker",
                                             "one warm note per introduction"], ["drums", "loud"], B["presentaciones"]),
        S("Se abren las puertas", ["bright lift", "strings swell", "cymbal swell into downbeat"], ["aggressive"], B["puertas"]),
        S("ORIGEN", ["wonder", "marimba ostinato", "warm strings pad rising", "piano motif", "building slowly"], ["drums"], B["origen"]),
        S("Un dia de pagos", ["steady joyful momentum", "marimba and nylon guitar groove", "soft Garifuna hand drums",
                              "light and warm", "bright"], ["loud drums", "aggressive"], B["pagos"]),
        S("La inversion", ["emotional lift", "strings join", "hopeful", "fuller"], ["drums"], B["inversion"]),
        S("La pregunta", ["everything thins out", "suspended single piano notes", "quiet tension", "almost silence"],
          ["percussion", "drums", "loud"], B["pregunta"]),
        S("Morazan", ["solemn", "low strings", "noble", "slow swell"], ["drums"], B["morazan"]),
        S("Crecen los paises", ["anthemic build", "full strings, marimba and piano", "proud", "timpani swell",
                                "uplifting"], ["vocals"], B["crecen"]),
        S("Cierre", ["tender", "solo piano and guitar", "warm resolve on final D major chord", "ringing out"],
          ["percussion", "drums"], B["cierre"]),
    ]}
body = json.dumps({"composition_plan": plan, "model_id": "music_v1"}).encode()
r = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", body,
                           {"xi-api-key": os.environ["EL_KEY"], "Content-Type": "application/json"})
open(sys.argv[2], "wb").write(urllib.request.urlopen(r, timeout=600).read())
json.dump(plan, open(sys.argv[2] + ".plan.json", "w"), ensure_ascii=False, indent=1)
print("ok", sum(s["duration_ms"] for s in plan["sections"]) / 1000, "s")
