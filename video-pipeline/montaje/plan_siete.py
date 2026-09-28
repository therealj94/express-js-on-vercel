#!/usr/bin/env python3
"""Plan de «Siete» (película 4): la línea de tiempo sale de la voz medida.

Siete personas de siete países se presentan a cámara, y en un mismo día
ORIGEN pasa de mano en mano por los siete: Guatemala → Belice → Honduras →
El Salvador → Nicaragua → Costa Rica → Panamá → y vuelve a Guatemala. Cada
quien habla con una voz de su país. Lucía narra y cierra.

    python3 montaje/plan_siete.py --voz DIR     # DIR con lineas.json y los .wav (montaje/guion_siete.py)

Escribe prompts/pelicula4_siete.json y las tablas de PELICULA4.md.
"""
import argparse, json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

GENTE = {
    "AURELIO": ("Guatemala", "Huehuetenango", "a 58 year old Guatemalan coffee farmer from Huehuetenango, weathered brown face, short grey hair and grey stubble, a worn straw hat, a faded denim work shirt with rolled sleeves"),
    "MARCUS": ("Belice", "Dangriga", "a 45 year old Garifuna fisherman from Dangriga, Belize, dark skin, short black hair greying at the temples, strong build, a faded sleeveless blue shirt, a thin silver chain"),
    "LUCÍA": ("El Salvador", "San Salvador", "a 42 year old Salvadoran upholsterer with warm light-brown skin, faint freckles, dark wavy hair in a low loose bun, small silver hoop earrings, a rust-orange linen shirt with rolled sleeves over a white t-shirt, dark jeans"),
    "CHEPE": ("Honduras", "San Pedro Sula", "a 56 year old Honduran fabric merchant with a weathered brown face, a short salt-and-pepper mustache, a faded plain navy baseball cap, a short-sleeved checked work shirt with a pen in the pocket"),
    "MERCEDES": ("Nicaragua", "Somoto", "a 27 year old Nicaraguan baker from Somoto, light-brown skin, long black hair in a ponytail with a red scrunchie, a round cheerful face, flour on her forearms, a white apron over a yellow t-shirt"),
    "ANDRÉS": ("Costa Rica", "Liberia", "a 38 year old Costa Rican truck driver from Liberia, Guanacaste, tanned skin, short curly dark hair, a trimmed beard, a navy polo shirt with sunglasses hooked on the collar"),
    "ROSA": ("Panamá", "Ciudad de Panamá", "a 40 year old Afro-Panamanian workshop owner from Calidonia, short natural hair with a colourful headband, gold hoop earrings, a measuring tape around her neck, a coral blouse"),
}
LUGAR = {
    "AURELIO": "at the wooden gate of his coffee cooperative in the green mountains of Huehuetenango, sacks of coffee behind him, cool morning mist",
    "MARCUS": "on the wooden dock of Dangriga beside his own blue-and-white fishing boat, turquoise Caribbean water, palm trees",
    "LUCÍA": "in the doorway of her small upholstery workshop in San Salvador, rolls of fabric and an old armchair behind her",
    "CHEPE": "at the loading door of his fabric and tarp warehouse in San Pedro Sula, rolls wrapped in plastic behind him",
    "MERCEDES": "in her family bakery in Somoto next to a clay wood-fired oven, trays of golden rosquillas on the table",
    "ANDRÉS": "beside the open cab of his cargo truck in a yard in Liberia, dry golden hills of Guanacaste behind",
    "ROSA": "in her busy uniform workshop in Calidonia, Panama City, rows of sewing machines and hanging shirts behind her",
}
LOOK = ("Live-action, cinematic documentary realism, natural practical light, true skin texture with visible pores, "
        "real 35mm film grain, warm true colour, vertical 9:16 composition. ")
IDIOMA = {"MARCUS": "English"}
ORDEN = ["AURELIO", "MARCUS", "LUCÍA", "CHEPE", "MERCEDES", "ANDRÉS", "ROSA"]
PAGOS = [  # hora, paga, cobra, qué, línea del que paga, línea del que cobra
    ("08:10", "AURELIO", "MARCUS", "el flete en lancha de las muestras de café", "T1a", "T1b"),
    ("09:30", "MARCUS", "CHEPE", "redes nuevas para la lancha", "T2a", "T2b"),
    ("10:45", "CHEPE", "LUCÍA", "tapizar los sillones de su oficina", "T3a", "T3b"),
    ("12:20", "LUCÍA", "MERCEDES", "dos cajas de rosquillas para el taller", "T4a", "T4b"),
    ("14:05", "MERCEDES", "ANDRÉS", "el viaje de sus cajas a Costa Rica", "T5a", "T5b"),
    ("16:30", "ANDRÉS", "ROSA", "doce camisas de uniforme para sus choferes", "T6a", "T6b"),
    ("18:10", "ROSA", "AURELIO", "el café del taller", "T7a", "T7b"),
]
HABLA_EN = {  # qué hace mientras habla en cada pago
    "T1a": "looks up from his phone with a satisfied nod and says it toward the phone as a voice message",
    "T1b": "holds his phone, reads it, grins and lifts a sack of coffee samples onto his boat",
    "T2a": "sends a voice message on his phone while coiling a rope on the dock",
    "T2b": "reads his phone, laughs, and points to a truck being loaded with folded fishing nets",
    "T3a": "sends a voice message on his phone, standing next to two old office armchairs",
    "T3b": "checks her phone, smiles, and taps the arm of an old armchair waiting to be reupholstered",
    "T4a": "records a voice message on her phone at her work table",
    "T4b": "reads her phone and claps flour from her hands, delighted",
    "T5a": "records a voice message while closing a box of rosquillas",
    "T5b": "reads his phone beside his truck, nods, and taps the side of the truck",
    "T6a": "records a voice message in the cab of his truck",
    "T6b": "reads her phone, raises her hand in celebration to her seamstresses",
    "T7a": "records a voice message holding a coffee cup in her workshop",
    "T7b": "reads his phone at the cooperative, smiles and closes a sack of coffee",
}


def gen(quien, accion, sonido, linea=None, lineas=None):
    """Prompt MiniMax H3. Con línea: ref2va con foto de casting y voz de referencia, labios sincronizados."""
    d = GENTE[quien][2]
    if linea:
        txt = lineas[linea]["dicho"]
        idioma = IDIOMA.get(quien, "Spanish")
        cuerpo = (f"{LUGAR[quien]}. <Subject 1>, {d}, {accion}. <Subject 1> (S1) says, <d>[{idioma}] {txt}</d> "
                  "Medium close-up, 50mm, handheld, mouth clearly visible, not looking into the lens.")
        subj = "<Subject 1> is the person in <Picture 1>.\n<Audio 1> is the voice timbre reference for <Subject 1>."
    else:
        cuerpo = f"{LUGAR[quien]}. <Subject 1>, {d}, {accion}."
        subj = "<Subject 1> is the person in <Picture 1>."
    return (f"subject_definitions:\n{subj}\n\ndetailed_description:\n[Shot 1] {LOOK}{cuerpo}\n\n"
            f"overall_soundscape: {sonido}\n\nnon_diegetic_music: none.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voz", required=True)
    a = ap.parse_args()
    lineas = {x["id"]: x for x in json.loads((Path(a.voz) / "lineas.json").read_text())}
    tomas, voz = [], []
    t = 0.0

    def toma(id_, sec, dur, fuente, imagen, texto="—", sonido="—", quien=None, linea=None, prompt=None, tomas_gen=0):
        nonlocal t
        tomas.append({"id": id_, "secuencia": sec, "t": round(t, 2), "dur": round(dur, 2), "fuente": fuente, "imagen": imagen,
                      "texto": texto, "sonido": sonido, "quien": quien, "linea": linea, "prompt": prompt,
                      "ref": f"{quien.lower()}.png" if (prompt and quien) else None,
                      "voz_ref": f"voz_{quien.lower()}.wav" if (prompt and linea) else None, "tomas_a_generar": tomas_gen})
        t += dur

    def habla(lid, dentro=0.25):
        L = lineas[lid]
        voz.append({"id": lid, "quien": L["quien"], "t": round(t + dentro, 2), "dur": L["dur"], "escrito": L["escrito"],
                    "a_camara": L["a_camara"]})
        return L["dur"]

    # 1 · El llamado: la cita completa de Bukele, sin la canción del repost, con un fondo dramático
    voz.append({"id": "B00", "quien": "BUKELE", "t": 0.30, "dur": 11.35, "a_camara": True,
                "escrito": "Ya llegó el momento de que unamos Centroamérica. Tal vez no logremos el proyecto completo, pero logremos al menos una integración aduanera o alguna especie parecida de comunidad de naciones, así como la Unión Europea."})
    toma("b01", 1, 3.2, "ARCHIVO", "Bukele en el atril del Foro Regional Esquipulas (2018): «Ya llegó el momento de que unamos Centroamérica». Voz aislada, sin la canción del repost.",
         "Rótulo: «ARCHIVO · NAYIB BUKELE · FORO REGIONAL ESQUIPULAS · 2018»", "Su voz limpia. Debajo, un pulso grave muy bajo, como un corazón, y un zumbido de cuerdas.")
    toma("b02", 1, 7.2, "COMPOSICIÓN", "Mientras él sigue hablando, negro: aparece la retícula de los siete países aún a oscuras, siluetas antes del amanecer. Sus palabras clave se escriben en mono: INTEGRACIÓN ADUANERA… COMUNIDAD DE NACIONES.",
         "«integración aduanera» · «comunidad de naciones»", "El pulso sube; una cuerda sostenida crece.")
    toma("b03", 1, 2.6, "ARCHIVO", "Vuelve a su rostro para «…así como la Unión Europea».", "Rótulo de archivo", "Al terminar su frase: golpe grave y silencio.")
    # 2 · Siete mañanas: cada uno se presenta a cámara, con su voz
    toma("g00", 2, 0.7, "GRÁFICO", "Negro. Un reloj: 05:59.", "05:59", "Silencio, un tic.")
    for i, q in enumerate(ORDEN, 1):
        d = habla(f"P{i}", 0.2)
        pais, ciudad, _ = GENTE[q]
        toma(f"g0{i}", 2, d + 0.3, "GENERADA", f"{pais.upper()}: {q.title()} se presenta a cámara en su lugar de trabajo, con la primera luz. Al terminar, su imagen se encoge a su celda de la retícula.",
             f"«{pais.upper()} · {ciudad.upper()}»", "Ambiente de su lugar al amanecer; una nota de marimba por país.", q, f"P{i}",
             gen(q, "stands at the start of the workday and introduces himself or herself warmly, with a proud small smile", "early morning ambience of the place", f"P{i}", lineas), 3)
    toma("g08", 2, 2.4, "COMPOSICIÓN", "06:00 (07:00 en Panamá): en la retícula de siete, las siete puertas se abren en el mismo fotograma: portón, lancha, cortina, bodega, horno, camión, taller.",
         "06:00 · PANAMÁ 07:00", "Siete aperturas a la vez y arranca la música.")
    # 3 · ORIGEN y Genesis ID
    d = habla("N1", 0.3)
    toma("o01", 3, d + 0.6, "COMPOSICIÓN", "La retícula viva: los siete trabajando. Un hilo dorado cose solo las fronteras reales, sin borrarlas. En «ORIGEN» la palabra aparece sobre la retícula.", "ORIGEN", "Una nota por puntada.")
    d = habla("N2", 0.2)
    toma("o02", 3, d + 0.6, "GENERADA", "Lucía abre su taller al sol; la luz dorada sube y baja en su cara («sigue el precio del oro»). Abajo: «1 ORIGEN = el precio de 1/55 de gramo de oro».",
         "1 ORIGEN = precio de 1/55 g de oro · fórmula pública", "Piano que sube y baja.", "LUCÍA", None,
         gen("LUCÍA", "rolls up the metal shutter of her workshop and steps into the morning sun, the golden light slowly brightening and dimming on her face", "street waking up, metal shutter"), 2)
    d = habla("N3", 0.2)
    toma("o03", 3, d + 0.6, "GENERADA", "Mercedes se verifica con la cámara frontal (prueba de vida) en la panadería; flota una tarjeta de Veta Wallet: «Genesis ID · verificada».",
         "Tarjeta: Genesis ID · una sola verificación · parte del ecosistema", "Campana suave de la app.", "MERCEDES", None,
         gen("MERCEDES", "holds her phone at arm's length and slowly turns her head for a face verification selfie, then smiles at the phone; the screen faces away from the camera", "bakery ambience, soft chime"), 2)
    d = habla("N3b", 0.2)
    toma("o04", 3, d + 0.6, "COMPOSICIÓN", "Los siete teléfonos, uno en cada celda de la retícula; al centro flota la app real, Veta Wallet (captura con datos ficticios): pagar, cobrar, guardar y el comprobante, todo en la misma app.",
         "Pagar · cobrar · guardar · comprobar — una sola app", "Un toque de la app por palabra.")
    # 4 · Siete pagos en un mismo día
    for n, (hora, paga, cobra, que, la, lb) in enumerate(PAGOS, 1):
        d = habla(la, 0.2)
        toma(f"p{n}a", 4, d + 0.45, "GENERADA", f"{hora} · {GENTE[paga][0].upper()}: {paga.title()} le paga a {cobra.title()} ({GENTE[cobra][0]}): {que}. Lo dice a cámara, con su voz.",
             f"{hora} · {GENTE[paga][0].upper()} → {GENTE[cobra][0].upper()}", "Ambiente de su lugar.", paga, la,
             gen(paga, HABLA_EN[la], "ambience of the place", la, lineas), 3)
        d = habla(lb, 0.2)
        toma(f"p{n}b", 4, d + 0.5, "GENERADA", f"{cobra.title()} recibe en {GENTE[cobra][1]} y responde a cámara, con su voz. Al entrar la toma, una chispa marfil cruza la frontera {GENTE[paga][0]}–{GENTE[cobra][0]} (costura dorada, arriba) y flota la tarjeta de Veta: «Recibido · comisión US$ 0,01 · en segundos».",
             f"{GENTE[cobra][0].upper()} · Recibido · US$ 0,01", "La campana de pago de Orden Global al entrar; luego su ambiente.", cobra, lb,
             gen(cobra, HABLA_EN[lb], "ambience of the place", lb, lineas), 3)
        if n == 1:
            d = habla("N4", 0.2)
            toma("p1n", 4, d + 0.5, "GENERADA", "Marcus sube el saco de muestras a su lancha y zarpa; la cámara lo sigue sobre el agua turquesa.",
                 "Comisión: US$ 0,01 · llegó en segundos", "Motor de lancha, gaviotas.", "MARCUS", None,
                 gen("MARCUS", "loads a sack of coffee samples onto his boat, starts the outboard motor and heads out over the turquoise water", "outboard motor, seagulls, waves"), 2)
    # 5 · La vuelta
    d = habla("N5", 0.4)
    toma("r01", 5, d + 0.8, "GRÁFICO", "Mapa marfil del istmo con fronteras: una línea dorada recorre el día, Guatemala → Belice → Honduras → El Salvador → Nicaragua → Costa Rica → Panamá → Guatemala, con las siete horas.",
         "08:10 · 09:30 · 10:45 · 12:20 · 14:05 · 16:30 · 18:10", "Siete notas, una por pago.")
    d = habla("N6", 0.3)
    toma("r02", 5, d + 1.2, "GRÁFICO", "Negro. La pregunta en tipografía grande; debajo, un contador de días que no para (sin cifras inventadas).",
         "¿Cuánto tardaría en moverse tu dinero?", "Tic de reloj; 1 s de silencio.")
    # 6 · Sin dejar de ser siete
    d = habla("N7", 0.3)
    toma("m01", 6, 2.8, "ARCHIVO", "Óleo de Francisco Morazán (dominio público, con ficha).", "Francisco Morazán (1792–1842)", "Chelo solo.")
    toma("m02", 6, d + 0.9 - 2.8, "COMPOSICIÓN", "Los siete rostros, uno por golpe, a pantalla completa (de sus propios clips).", "—", "Una nota por rostro.")
    # 7 · Tokenizar
    d = habla("N8", 0.3)
    toma("k01", 7, d + 0.5, "GENERADA", "El taller de Rosa a mediodía: pedidos hasta el techo y un rincón marcado con cinta, un puesto que espera una máquina.",
         "—", "Máquinas de coser.", "ROSA", None,
         gen("ROSA", "walks through her busy workshop full of orders and stops to look at an empty corner marked with blue tape on the floor, imagining a new machine there", "sewing machines, busy workshop"), 2)
    d = habla("N9", 0.2)
    toma("k02", 7, d + 0.5, "COMPOSICIÓN", "Sobre el rincón, la tarjeta del PASAPORTE DEL ACTIVO (ejemplo ilustrativo): emisor con Genesis ID · qué hay detrás · riesgo · quién puede tenerla según su país. Líneas marfil del mundo llegan y pasan por el portón de Panamá.",
         "Pasaporte del activo · ejemplo ilustrativo", "Sello; madera.")
    d = habla("N10", 0.3)
    toma("k03", 7, d + 0.9, "COMPOSICIÓN", "La retícula con un portón en cada país: entra el capital y pasa solo el que cumple las reglas de cada uno.",
         "El capital, del mundo. El trabajo, aquí. Las reglas, de casa.", "Pico de la música.")
    # 8 · Por vos
    toma("f00", 8, 2.2, "COMPOSICIÓN", "Anochecer: la retícula se rearma con las mismas manos en las mismas puertas, ahora cerrándose.", "—", "Las siete notas bajan; grillos.")
    d = habla("F1", 0.3)
    toma("f01", 8, d + 0.9, "GENERADA", "Lucía, al bajar la cortina de su taller al anochecer, mira a cámara y lo dice ella misma.",
         "—", "Calle en calma.", "LUCÍA", "F1",
         gen("LUCÍA", "has just pulled down the metal shutter of her workshop at dusk, turns and says it warmly, looking gently toward the camera", "calm evening street", "F1", lineas), 3)
    d = habla("F2", 0.5)
    toma("f02", 8, d + 1.6, "GRÁFICO", "El mapa se abre del istmo a toda Latinoamérica.", "¿Y mañana… Latinoamérica?", "Silencio antes de «Latinoamérica»; resuelve la música.")
    toma("f03", 8, 3.5, "GRÁFICO", "Logo quieto. ordenglobal.org · letra chica.", "ORDEN GLOBAL · ordenglobal.org · Material informativo; no constituye oferta de valores ni de inversión. Imágenes ilustrativas generadas con IA.",
         "Las dos campanas de Orden Global.")

    # control: ninguna voz pisa a otra
    vs = sorted(voz, key=lambda x: x["t"])
    choques = [f"{x['id']}→{y['id']}" for x, y in zip(vs, vs[1:]) if x["t"] + x["dur"] + 0.1 > y["t"]]
    total = round(t, 2)
    plan = {"titulo": "Siete", "dur_s": total, "tomas": tomas, "voz": vs, "pagos": PAGOS,
            "personajes": {k: {"pais": v[0], "ciudad": v[1], "descripcion": v[2]} for k, v in GENTE.items()}}
    (RAIZ / "prompts/pelicula4_siete.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    gen_n = sum(1 for x in tomas if x["fuente"] == "GENERADA")
    clips = sum(x["tomas_a_generar"] for x in tomas)
    print(f"{len(tomas)} tomas · {total} s · {gen_n} generadas → {clips} clips · choques: {choques or 'ninguno'}")


if __name__ == "__main__":
    main()
