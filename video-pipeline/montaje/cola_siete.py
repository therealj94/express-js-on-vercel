#!/usr/bin/env python3
"""Colas de GPU de «Siete» a partir de prompts/pelicula4_siete.json.

Máquina B (arranca ya): todo lo de Lucía y don Chepe, que ya tienen foto, y los
planos de apertura y cierre sin personas (texto a vídeo).
Máquina A: primero el casting (q_p4_casting.json) y, con las caras elegidas,
las tomas de Aurelio, Marcus, Mercedes, Andrés y Rosa. La cara elegida no viaja
como adjunto: es el .mp4 del casting que ya está en la salida de esa misma
máquina, y 03_run_queue.py saca su primer fotograma.

    python3 montaje/cola_siete.py B
    python3 montaje/cola_siete.py A --casting aurelio=02 marcus=01 mercedes=03 andres=04 rosa=02
"""
import argparse
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
P = json.loads((RAIZ / "prompts/pelicula4_siete.json").read_text())
T = {t["id"]: t for t in P["tomas"]}
GENTE = P["personajes"]
ASCII = {"AURELIO": "aurelio", "MARCUS": "marcus", "LUCÍA": "lucia", "CHEPE": "chepe",
         "MERCEDES": "mercedes", "ANDRÉS": "andres", "ROSA": "rosa"}
YA_TIENEN_FOTO = {"LUCÍA", "CHEPE"}

NEG = ("cartoon, illustration, 3d render, cgi, plastic skin, waxy skin, airbrushed, beauty filter, "
       "smooth poreless face, dead eyes, mannequin, uncanny, oversaturated, gold tint, gold bars, coins, "
       "stock photo smile, posed, model looks, deformed teeth, extra fingers, missing fingers, fused fingers, "
       "mutated hands, deformed hands, floating hands, extra arms, extra limbs, three hands, third arm, "
       "duplicate person, twin, merged bodies, disfigured, bad anatomy, cross-eyed, warped face, "
       "studio backdrop, watermark, text overlay, readable text, logo, brand names, subtitles, ui elements, "
       "phone screen content, glowing screen graphics, holograms, crypto imagery, charts, "
       "motion blur smear, morphing, flicker, blurry, low detail, horizontal composition, black bars, "
       "music, background music")
ANATOMIA = (" Natural human anatomy: one person with two arms and two hands, five fingers on each hand, "
            "hands relaxed and fully formed.")
LOOK = ("Live-action, cinematic, shot on 35mm anamorphic film, natural practical light, true skin texture "
        "with visible pores, real film grain, rich but true colour, vertical 9:16 composition. ")


def job(id_, seed, prompt, wf, dur, image=None, audio=None, steps=20, cfg=1.0):
    j = {"id": id_, "seed": seed, "negative": NEG, "width": 768, "height": 1344,
         "duration_s": round(dur, 1), "fps": 24, "steps": steps, "cfg": cfg, "retries": 1,
         "workflow": f"workflows/{wf}", "prompt": prompt}
    if image:
        j["image"] = image
    if audio:
        j["audio"] = audio
    return j


def con_anatomia(prompt):
    # La frase de anatomía va al final de la descripción, antes del sonido.
    return prompt.replace("\n\noverall_soundscape:", ANATOMIA + "\n\noverall_soundscape:", 1)


def cara(quien, casting):
    if quien in YA_TIENEN_FOTO:
        return f"/workspace/refs/{ASCII[quien]}.png"
    n = ASCII[quien]
    return f"casting_{n}_{casting[n]}_00001_.mp4"


def tomas_de(quienes, casting, semilla):
    out = []
    for t in P["tomas"]:
        if t["fuente"] != "GENERADA" or t["quien"] not in quienes:
            continue
        habla = bool(t["voz_ref"])
        dur = max(5.2, t["dur"] + (2.0 if habla else 1.0))
        dur = min(dur, 8.0)
        for k in range(1, t["tomas_a_generar"] + 1):
            semilla += 1
            out.append(job(f"s7_{t['id']}_t{k}", semilla, con_anatomia(t["prompt"]),
                           "h3_ref2va_voz_api.json" if habla else "h3_ref2va_api.json", dur,
                           image=cara(t["quien"], casting),
                           audio=f"/workspace/refs/voz_{ASCII[t['quien']]}.wav" if habla else None))
    return out, semilla


# Las puertas del día: al amanecer se abren (retícula g08) y al anochecer se
# cierran (f00). Acciones simples de manos, para que no se deformen.
PUERTAS = {
    "AURELIO": ("at the wooden gate of his coffee cooperative high in the green mountains of Huehuetenango, "
                "sacks of coffee stacked behind the gate",
                "pushes the wooden gate open with both hands and steps through", "closes the wooden gate with both hands and latches it"),
    "MARCUS": ("on the wooden dock of Dangriga beside his blue-and-white fishing boat, turquoise Caribbean water, palm trees",
               "unties the rope of his boat from the dock post and coils it in his hands",
               "ties the rope of his boat to the dock post and pats the bow"),
    "LUCÍA": ("in front of her small upholstery workshop on a quiet street in San Salvador, rolls of fabric inside",
              "pulls the metal roll-up shutter up with both hands, revealing the workshop",
              "pulls the metal roll-up shutter down with both hands and locks it"),
    "CHEPE": ("at the big sliding metal door of his fabric warehouse in San Pedro Sula, rolls of fabric wrapped in plastic inside",
              "slides the big metal door open with both hands", "slides the big metal door closed with both hands"),
    "MERCEDES": ("at the blue wooden front door of her small bakery in Somoto, Nicaragua, trays of rosquillas inside",
                 "opens the two wooden door panels of the bakery with both hands and smiles at the street",
                 "closes the two wooden door panels of the bakery with both hands"),
    "ANDRÉS": ("beside the cab of his cargo truck parked at a roadside in Liberia, Guanacaste, dry golden fields behind",
               "opens the driver door of the truck and climbs up into the cab",
               "climbs down from the cab and closes the driver door of the truck"),
    "ROSA": ("at the glass door of her uniform sewing workshop in Calidonia, Panama City, sewing machines inside",
             "unlocks the glass door, pushes it open and switches on the lights inside",
             "switches off the lights and pulls the glass door closed"),
}


def puertas(quienes, casting, semilla):
    out = []
    for q in quienes:
        lugar, abre, cierra = PUERTAS[q]
        for momento, accion, luz, son in (
                ("amanecer", abre, "first light of dawn, soft blue turning golden, a little mist",
                 "early morning birds, a distant rooster, the sound of the door"),
                ("anochecer", cierra, "golden hour turning to dusk, long warm shadows, the first street lights",
                 "evening insects, distant traffic, the sound of the door")):
            for k in (1, 2):
                semilla += 1
                pr = ("subject_definitions:\n<Subject 1> is the person in <Picture 1>.\n\ndetailed_description:\n"
                      f"[Shot 1] {LOOK}{lugar}, {luz}. <Subject 1>, {GENTE[q]['descripcion']}, {accion}. "
                      "Unhurried, calm, a quiet sense of pride. Medium wide shot, slow push-in, 40mm, eye level."
                      f"{ANATOMIA}\n\noverall_soundscape: {son}.\n\nnon_diegetic_music: none.")
                out.append(job(f"s7_{'abre' if momento == 'amanecer' else 'cierra'}_{ASCII[q]}_t{k}",
                               semilla, pr, "h3_ref2va_api.json", 5.2, image=cara(q, casting)))
    return out, semilla


# Apertura sobre la voz de Bukele y cierre: el istmo, sin personas.
PAISAJES = [
    ("ap_guatemala", "A slow cinematic aerial drift at dawn over Lake Atitlán in Guatemala, three volcanoes rising out of a sea of low clouds, first sunlight touching the peaks, mist on the still water.", "wind, a deep low drone"),
    ("ap_belice", "A slow aerial glide at sunrise over the Belize Barrier Reef, turquoise and deep blue water, a small wooden fishing boat leaving a white wake, palm-lined coast in the distance.", "wind over the sea, gentle waves"),
    ("ap_elsalvador", "Dawn on the Salvadoran Pacific coast, dark volcanic rock and long lines of waves rolling in, golden mist, the silhouette of the San Vicente volcano far behind. Slow push-in from low over the sand.", "waves, wind"),
    ("ap_honduras", "Early morning mist in the Maya ruins of Copán, Honduras, ancient carved stone stelae among giant ceiba trees, shafts of sunlight breaking through the fog, scarlet macaws flying across. Slow dolly forward.", "macaw calls, soft wind, birds"),
    ("ap_nicaragua", "Sunrise over the colonial rooftops of Granada, Nicaragua, the yellow cathedral dome catching the first light, the Mombacho volcano and Lake Nicaragua behind, gentle haze. Slow aerial pull back.", "distant church bell, birds, city waking"),
    ("ap_costarica", "A slow aerial over the cloud forest of Costa Rica at dawn, the Arenal volcano cone above the clouds, deep green canopy, a river shining through the valley.", "forest birds, howler monkeys far away, wind"),
    ("ap_panama", "Sunrise at the Panama Canal locks, a huge cargo ship moving slowly through the lock chamber, the lock gates opening, tropical hills and the city skyline far behind in golden haze. Slow aerial push.", "deep ship horn, water rushing, wind"),
    ("ap_istmo", "A breathtaking high aerial at golden sunrise along the narrow Central American isthmus, the Caribbean Sea on one side and the Pacific Ocean on the other, a spine of volcanoes between them, clouds below. Slow majestic forward flight.", "wind at altitude, a deep swelling drone"),
    ("ci_pacifico", "Sunset over the Pacific in Central America, silhouettes of small fishing boats returning to the beach, the sky burning orange and violet, gentle waves. Slow push-in, low over the water.", "waves, distant voices, evening wind"),
    ("ci_luces", "Blue hour aerial over a Central American city and its volcano, the city lights switching on street by street, the last orange light on the horizon. Slow majestic aerial drift.", "distant city hum, evening wind"),
]


def paisajes(semilla):
    out = []
    for id_, desc, son in PAISAJES:
        for k in (1, 2):
            semilla += 1
            pr = (f"[Shot 1] {LOOK}{desc} No people in close view, no text, no signs, no flags."
                  f"\n\noverall_soundscape: {son}.\n\nnon_diegetic_music: none.")
            out.append(job(f"s7_{id_}_t{k}", semilla, pr, "h3_calidad_api.json", 6.0, steps=20, cfg=3.5))
    return out, semilla


def guardar(nombre, jobs, nota):
    ruta = RAIZ / f"prompts/q_p4_{nombre}.json"
    ruta.write_text(json.dumps({"version": 1, "defaults": {}, "_nota": nota, "jobs": jobs},
                               ensure_ascii=False, indent=1))
    print(f"{ruta.relative_to(RAIZ)}: {len(jobs)} clips")


def main():
    a = argparse.ArgumentParser()
    a.add_argument("maquina", choices=["A", "B"])
    a.add_argument("--casting", nargs="*", default=[], help="nombre=NN de la cara elegida")
    a = a.parse_args()
    if a.maquina == "B":
        q = ["LUCÍA", "CHEPE"]
        j1, s = tomas_de(q, {}, 17000)
        j2, s = puertas(q, {}, s)
        j3, s = paisajes(s)
        guardar("B", j1 + j2 + j3, "Siete, maquina B: Lucia y don Chepe, puertas, apertura y cierre.")
    else:
        casting = dict(x.split("=") for x in a.casting)
        q = ["AURELIO", "MARCUS", "MERCEDES", "ANDRÉS", "ROSA"]
        faltan = [ASCII[x] for x in q if ASCII[x] not in casting]
        if faltan:
            raise SystemExit(f"falta elegir cara de: {', '.join(faltan)}")
        j1, s = tomas_de(q, casting, 27000)
        j2, s = puertas(q, casting, s)
        guardar("A", j1 + j2, "Siete, maquina A: Aurelio, Marcus, Mercedes, Andres y Rosa con la cara elegida.")


if __name__ == "__main__":
    main()
