#!/usr/bin/env python3
"""Plan de «Abrir» (película 4): tomas, voz, textos, sonido y prompts.

El plan se escribe una vez, aquí, y de aquí salen el JSON de producción y las
tablas del documento. Los tiempos no se estiman: cada frase de la locución se
generó con la voz de Lucía y se midió (carpeta --voz). Si una frase no cabe en
su tramo o pisa a la siguiente, el script lo dice y no escribe nada.

    python3 montaje/plan_abrir.py --voz DIR [--json prompts/pelicula4_abrir.json] [--md PELICULA4.md]

En el .md reemplaza lo que haya entre <!-- TABLAS --> y <!-- /TABLAS -->.
"""
from __future__ import annotations

import argparse, json, re, sys
from pathlib import Path

import soundfile as sf

RAIZ = Path(__file__).resolve().parent.parent

# --- Biblia de personajes (continuidad: mismo texto en cada prompt) ---------
LUCIA = ("a 42 year old Central American woman with warm light-brown skin, faint freckles across the cheekbones, "
         "fine lines at the corners of her eyes, dark brown wavy hair pulled back in a low loose bun with loose strands "
         "at the temples, thick dark eyebrows, small silver hoop earrings, no makeup, wearing a rust-orange linen shirt "
         "with sleeves rolled to the elbow over a plain white t-shirt, dark blue jeans, a thin black hair tie on her left wrist")
KEVIN = ("a 22 year old Salvadoran young man, slim build, warm brown skin, short black hair neatly cut, clean-shaven, "
         "earnest dark eyes, wearing a plain charcoal t-shirt and jeans, no tattoos, no cap, no jewellery")
CARMEN = ("his mother, a 50 year old Salvadoran woman with a kind tired face, greying hair in a bun, a floral house apron")
KEYLA = ("his 10 year old sister in a Salvadoran public school uniform, white blouse and navy skirt, hair in two braids")
INGRID = ("a 34 year old Central American geologist with light-brown skin, dark hair in a single practical braid, "
          "safety glasses pushed up on her head, a hand lens on a cord around her neck, a sun-faded khaki field shirt")
MARIELA = ("a 38 year old Afro-Panamanian civil engineer, short natural hair, small gold stud earrings, "
           "a light blue work shirt under a high-visibility vest, a white hard hat held in one hand")
CHEPE = ("a 56 year old Central American man with a weathered brown face, a short salt-and-pepper mustache, deep sun "
         "lines, a faded plain navy baseball cap, a short-sleeved checked work shirt with a pen in the pocket")

LOOK = ("Live-action, cinematic documentary realism, natural practical light, true skin texture with visible pores, "
        "real 35mm film grain, warm true colour with a restrained gold accent in the light, vertical 9:16 composition. ")
NEG = ("cartoon, illustration, 3d render, cgi, plastic skin, waxy skin, airbrushed, beauty filter, smooth poreless face, "
       "dead eyes, mannequin, uncanny, oversaturated, gold bars, coins, piles of money, luxury, stock photo smile, posed, "
       "looking at camera, deformed hands, extra fingers, floating objects, objects appearing from nowhere, morphing, "
       "watermark, text overlay, readable text, logo, brand names, flags, subtitles, ui elements, phone screen content, "
       "holograms, crypto imagery, charts, police, weapons, crime, blurry, horizontal composition, black bars, music")

REFS = {"LUCIA": "lucia.png", "CHEPE": "proveedor.png", "KEVIN": "kevin.png", "INGRID": "ingrid.png", "MARIELA": "mariela.png"}


def P(accion: str, sonido: str, sujeto: str | None = None, ref: str | None = None) -> dict:
    """Prompt estructurado de MiniMax H3. Con ref, el personaje sale de su foto de casting (ref2va)."""
    subj = f"<Subject 1> is the {'woman' if ref in ('LUCIA', 'INGRID', 'MARIELA') else 'man'} in <Picture 1>.\n" if ref else ""
    return {"prompt": (f"subject_definitions:\n{subj}\ndetailed_description:\n[Shot 1] {LOOK}{accion}\n\n"
                       f"overall_soundscape: {sonido}\n\nnon_diegetic_music: none."),
            "ref": REFS.get(ref) if ref else None}


# --- Las tomas ---------------------------------------------------------------
# id, secuencia, duración, fuente, imagen/acción, cámara (encuadre · lente · movimiento · luz),
# texto en pantalla, sonido, transición de salida, generación (o None)
# fuente: ARCHIVO · CAPTURA (app real) · GRÁFICO (hecho en código) · GENERADA (H3)
T = [
 ("s01", 1, 3.0, "ARCHIVO", "Nayib Bukele en el atril del VIII Foro Regional Esquipulas (2018): «Ya llegó el momento de que unamos Centroamérica.»",
  "Plano medio del archivo, recorte 9:16 centrado en el rostro. Sin efectos: el archivo se respeta.",
  "Subtítulo de la frase · rótulo mono «ARCHIVO · NAYIB BUKELE · FORO REGIONAL ESQUIPULAS · 2018»",
  "Solo su audio original. Corte en seco 0,25 s después de «Centroamérica».", "Corte seco a casi negro", None),
 ("s02", 2, 1.8, "GENERADA", "Casi a oscuras, una mano de mujer agarra el tirador de una cortina metálica y tira hacia arriba; la primera franja de luz le cruza los nudillos.",
  "Detalle extremo · 85 mm · fijo, la luz entra desde abajo · azul de madrugada que se vuelve cálido",
  "—", "0,35 s de silencio de cuarto; luego el traqueteo metálico de la cortina, fuerte y cercano (el gancho sonoro)", "Corte en el movimiento",
  P(f"Before dawn inside a small upholstery workshop in San Salvador. Extreme close-up of the hand of <Subject 1>, {LUCIA}, gripping the handle of a corrugated metal roll-up shutter in near darkness. She pulls it upward in one strong motion and the first stripe of warm morning light slides across her knuckles and wrist. 85mm lens, locked camera, shallow depth of field.",
    "loud rattle of a metal roll-up shutter rising, quiet room tone before it", "LUCIA", "LUCIA")),
 ("s03", 2, 4.0, "GENERADA", "Desde dentro del taller: la cortina sube y descubre la calle despertando (un bus, una vendedora, niños con uniforme). La silueta de Lucía a contraluz.",
  "Plano general desde el interior · 24 mm · leve empuje hacia la calle · contraluz dorado de amanecer",
  "—", "Calle que despierta: bus, pájaros, un gallo lejano, un vendedor", "Encadenado corto",
  P(f"From inside a small upholstery workshop in San Salvador at sunrise, looking out: a corrugated metal shutter rolls up and reveals a working-class street waking up, a colourful bus passing, a street vendor pushing a cart, two children in school uniforms walking. <Subject 1>, {LUCIA}, stands in silhouette against the golden light, rolls of fabric and an old armchair around her. 24mm lens, slow push-in toward the street, backlit.",
    "street waking up, a bus passing, birds, a distant rooster, a vendor calling", "LUCIA", "LUCIA")),
 ("s04", 2, 3.6, "GENERADA", "Lucía de perfil a tres cuartos, respira el aire de la mañana y mira su calle. No sonríe a cámara: mira lo que tiene delante.",
  "Primer plano · 50 mm · cámara en mano muy quieta · luz dorada rasante en la cara",
  "«Una sola economía.» / «Países soberanos.» (tipografía editorial, dos líneas)", "Calle, respiración, el primer pulso grave de la música", "Corte a textura de óleo",
  P(f"Close-up of <Subject 1>, {LUCIA}, standing in the open doorway of her upholstery workshop at sunrise, three-quarter profile, breathing in the morning air and looking at her street with calm determination. Low golden sunlight on her face. 50mm lens, handheld but very still. She does not look at the camera.",
    "quiet street at dawn, distant traffic, birds", "LUCIA", "LUCIA")),
 ("s05", 3, 3.4, "ARCHIVO", "Retrato de Francisco Morazán (óleo, dominio público). Textura de la pintura; una luz cálida lo recorre.",
  "Detalle del óleo · empuje lento 8 % · barrido de luz en posproducción",
  "Rótulo: «Francisco Morazán (1792–1842)»", "Un acorde de cuerdas muy bajo; el crujido de un lienzo", "Disolvencia al papel del mapa", None),
 ("s06", 3, 2.6, "GRÁFICO", "Mapa de Centroamérica en papel marfil (estética de la presentación). Una línea dorada se dibuja de Guatemala a Panamá. Las fronteras siguen visibles.",
  "Cenital del mapa · la línea avanza · leve paralaje del papel",
  "Nombres de los 7 países en mono dorado", "Trazo de lápiz sobre papel", "La línea se funde con una carretera real",
  None),
 ("s07", 3, 2.4, "GENERADA", "La línea del mapa se vuelve la Carretera Panamericana real: vista aérea al amanecer entre colinas volcánicas.",
  "Aéreo alto que desciende · 24 mm equivalente · niebla baja, sol rasante",
  "—", "Viento alto, un camión lejano", "Corte al primer país",
  P("Aerial drone shot at sunrise over a two-lane highway winding through green volcanic hills and small towns in Central America, low mist in the valleys, a single truck driving along the road. The camera slowly descends and follows the road. Golden low sun.",
    "high wind, a distant truck engine")),
 ("s08", 3, 1.15, "GENERADA", "GUATEMALA · Antigua: una mujer abre su puesto de textiles al amanecer, el Volcán de Agua al fondo.",
  "Plano medio · 35 mm · en mano", "«GUATEMALA» (mono)", "Mercado despertando", "Corte a ritmo",
  P("At sunrise in Antigua Guatemala, a woman opens the wooden shutters of her small textile stall on a cobblestone street, colourful woven fabrics inside, Volcán de Agua in the misty background. Medium shot, handheld.", "market waking up, footsteps on cobblestones")),
 ("s09", 3, 1.15, "GENERADA", "HONDURAS · Tegucigalpa: un panadero saca una bandeja de pan del horno de leña.",
  "Plano medio · 35 mm", "«HONDURAS»", "Horno, bandeja metálica", "Corte a ritmo",
  P("Early morning in a small bakery in Tegucigalpa, Honduras: a baker in a white apron pulls a tray of fresh golden bread out of a wood-fired oven, steam rising, warm light. Medium shot, handheld.", "crackling oven, metal tray")),
 ("s10", 3, 1.15, "GENERADA", "NICARAGUA · Lago Cocibolca: un pescador empuja su lancha al agua; Ometepe al fondo.",
  "General · 35 mm", "«NICARAGUA»", "Agua, madera", "Corte a ritmo",
  P("At sunrise on the shore of Lake Nicaragua, a fisherman pushes his wooden boat into the calm water, the twin volcanoes of Ometepe island on the horizon. Wide shot.", "lapping water, wooden hull on sand")),
 ("s11", 3, 1.15, "GENERADA", "COSTA RICA: una caficultora abre el portón de madera del cafetal en la neblina.",
  "Plano medio · 35 mm", "«COSTA RICA»", "Portón, pájaros", "Corte a ritmo",
  P("In the morning mist of a Costa Rican coffee farm, a woman coffee farmer opens a weathered wooden gate into rows of green coffee plants, a basket on her hip. Medium shot, handheld.", "creaking wooden gate, birds")),
 ("s12", 3, 1.15, "GENERADA", "PANAMÁ: un trabajador portuario abre las puertas de un contenedor; grúas del puerto al fondo.",
  "Plano medio · 35 mm", "«PANAMÁ»", "Cerrojo metálico, puerto", "Corte a ritmo",
  P("At dawn in a container port in Panama, a port worker in a hard hat swings open the heavy doors of a shipping container, tall gantry cranes in the background. Medium shot.", "metal latch, port ambience, distant ship horn")),
 ("s13", 3, 1.15, "GENERADA", "BELICE · Belize City: una tendera abre las contraventanas azules de su tienda de madera.",
  "Plano medio · 35 mm", "«BELICE»", "Madera, calle caribeña", "Corte por acción: manos que abren → manos que abren una caja",
  P("Morning in Belize City: a Belizean Creole shopkeeper opens the blue wooden shutters of her small corner shop in a colourful wooden house, the street waking up. Medium shot, handheld.", "wooden shutters, Caribbean street morning")),
 ("s14", 4, 3.6, "GENERADA", "Taller de Lucía: sus manos abren una caja de muestras de tela; fotografía un rollo con el teléfono para mandarlo.",
  "Detalle de manos · 50 mm · cenital a 45°", "—", "Cartón, tela, obturador del teléfono", "Corte a Honduras",
  P(f"In her upholstery workshop in San Salvador, the hands of <Subject 1>, {LUCIA}, open a cardboard box of fabric samples, pull out a roll of deep green upholstery fabric and photograph it with her phone held in her other hand the whole time. Detail shot of hands, 50mm, 45 degree top angle.",
    "cardboard, fabric rustle, soft phone shutter click", "LUCIA", "LUCIA")),
 ("s15", 4, 2.8, "GENERADA", "Don Chepe (el proveedor de «Un martes») en su bodega de San Pedro Sula mira la foto en su teléfono y asiente.",
  "Plano medio · 35 mm · en mano · luz de bodega", "«SAN PEDRO SULA, HONDURAS»", "Bodega, montacargas lejano", "Corte a la pantalla",
  P(f"Inside a textile warehouse in San Pedro Sula, Honduras, <Subject 1>, {CHEPE}, looks down at his phone, studies it and nods slowly with approval, rolls of fabric wrapped in plastic behind him. Medium shot, handheld, warm warehouse light.",
    "warehouse ambience, distant forklift", "CHEPE", "CHEPE")),
 ("s16", 4, 3.0, "CAPTURA", "La app real (Veta Wallet) flotando sobre las manos de Lucía: pago en ORIGEN a Textiles del Valle, con su identidad Genesis ID verificada. Confirmación.",
  "Tarjeta flotante sobre plano de manos (s14 extendido) · la app nunca a pantalla completa",
  "Captura real · «Pagado a Honduras»", "El sonido de pago de Orden Global (dos campanas: sol–si, el mismo de «Un martes»)", "Corte de sonido: la campana llama al camión", None),
 ("s17", 4, 3.0, "GENERADA", "Don Chepe recibe la confirmación, hace una seña a sus trabajadores y suben el rollo al camión.",
  "Plano general · 28 mm · en mano", "Tipografía: «quetzal · dólar beliceño · lempira · dólar · córdoba · colón · balboa» y, debajo, «ORIGEN»",
  "Motor del camión, voces de trabajo", "Corte al camión en ruta",
  P(f"At the loading dock of a textile warehouse in Honduras, <Subject 1>, {CHEPE}, glances at his phone, smiles and waves his arm to two workers, who lift a large roll of green fabric onto a small truck. Wide shot, handheld, afternoon light.",
    "truck engine idling, workers' voices, forklift", "CHEPE", "CHEPE")),
 ("s18", 4, 3.0, "GENERADA", "El camión cruza un puesto fronterizo entre Honduras y El Salvador; banderas lejanas, fila de camiones.",
  "Plano general · 50 mm comprimido", "—", "Camiones, sellos, viento", "Corte a la puerta del taller",
  P("A small truck loaded with fabric rolls drives through a busy land border crossing between Honduras and El Salvador, a line of cargo trucks, customs booths, dust and golden afternoon light. Long lens, compressed perspective.",
    "trucks, air brakes, wind, distant voices")),
 ("s19", 4, 5.0, "GENERADA", "El rollo llega al taller de Lucía; ella lo recibe y pasa la mano por la tela.",
  "Plano medio · 35 mm · en mano", "—", "Puerta, tela, calle", "Corte a la noche",
  P(f"A delivery man carries a large roll of green upholstery fabric through the open shutter of the workshop and hands it to <Subject 1>, {LUCIA}, who receives it and runs her palm over the fabric with satisfaction. Medium shot, handheld, late afternoon light.",
    "street, fabric, soft thud of the roll", "LUCIA", "LUCIA")),
 ("s20", 5, 3.6, "GENERADA", "De noche en el taller: Lucía revisa su plan de ampliación en un cuaderno, una cotización y el teléfono; bocetos de una máquina industrial.",
  "Plano medio · 50 mm · lámpara de trabajo, penumbra cálida", "«DBNX» / «Un mercado para nuestras empresas.»",
  "Lámpara, lápiz, un perro lejano", "Corte a la reunión",
  P(f"Night in the upholstery workshop: <Subject 1>, {LUCIA}, sits at her work table under a single warm work lamp, reviewing an expansion plan in a notebook with sketches of an industrial sewing machine, a printed quotation beside it, a pencil in her hand. Medium shot, 50mm, warm low light.",
    "quiet night, pencil on paper, a distant dog", "LUCIA", "LUCIA")),
 ("s21", 5, 3.8, "GENERADA", "Lucía presenta su proyecto a dos evaluadores en una oficina sencilla: documentos, preguntas, una mujer que asiente y cierra la carpeta.",
  "Plano medio · 35 mm · en mano · luz de ventana", "—", "Oficina, papeles", "Corte a la máquina",
  P(f"In a simple bright office, <Subject 1>, {LUCIA}, presents a folder with her workshop expansion plan to two evaluators across a table: a woman in her forties with reading glasses who reads carefully and asks a question, and a young analyst with a laptop. The woman nods and closes the folder. Medium shot, handheld, window light.",
    "office room tone, pages turning", "LUCIA", "LUCIA")),
 ("s22", 5, 3.0, "GENERADA", "Dos hombres entran por la cortina abierta cargando una máquina de coser industrial nueva; Lucía les indica dónde.",
  "Plano general del taller · 28 mm", "—", "Esfuerzo, ruedas, calle", "Corte a la aguja",
  P(f"Two men carry a new industrial sewing machine through the open shutter into the upholstery workshop while <Subject 1>, {LUCIA}, points to where it goes. Wide shot, 28mm, morning light.",
    "effort, wheels on concrete, street", "LUCIA", "LUCIA")),
 ("s23", 5, 1.8, "GENERADA", "Macro: la aguja de la máquina nueva arranca sobre la tela verde.",
  "Macro · 100 mm", "—", "El motor de la máquina arranca: golpe rítmico que entra en la música", "Corte al primer día de Kevin",
  P("Macro shot: the needle of a new industrial sewing machine starts stitching through deep green upholstery fabric, thread pulling tight. 100mm macro lens.",
    "industrial sewing machine motor starting")),
 ("s24", 5, 4.0, "GENERADA", "Primer día de Kevin: Lucía le entrega un delantal y unas tijeras. Se miran un segundo: confianza. Sin palabras.",
  "Plano/contraplano en un solo encuadre · 50 mm · luz de mañana lateral", "—", "Taller, la música sube apenas", "Corte a las manos",
  P(f"Inside the upholstery workshop, <Subject 1>, {LUCIA}, hands a canvas work apron and a pair of fabric scissors to a young man, {KEVIN}, on his first day. They hold each other's gaze for a moment: quiet trust, a small nod. Medium two-shot, 50mm, soft side morning light. Nobody looks at the camera.",
    "workshop room tone, a sewing machine in the background", "LUCIA", "LUCIA")),
 ("s25", 5, 2.6, "GENERADA", "Lucía guía las manos de Kevin sobre la tela en la estación nueva.",
  "Detalle de manos · 85 mm", "—", "Tela, tijeras", "Corte al galpón de núcleos",
  P(f"Close-up of hands at a new workstation: the hands of <Subject 1>, {LUCIA}, guide the hands of a young man as he cuts deep green upholstery fabric along a chalk line with large scissors. 85mm, shallow depth of field.",
    "scissors cutting fabric", "LUCIA", "LUCIA")),
 ("s26", 6, 3.2, "GENERADA", "Ingrid, geóloga, en un galpón de núcleos de perforación: levanta un testigo de roca y lo examina con la lupa.",
  "Plano medio · 50 mm · luz de galpón que entra por el techo", "—", "Cajas de madera, roca", "Corte al macro",
  P(f"In a core shed with long rows of wooden core boxes full of drill core samples, <Subject 1>, {INGRID}, lifts a cylinder of rock core and examines it closely with her hand lens. Medium shot, 50mm, shafts of light from the roof.",
    "wooden boxes, rock on wood, fan", "INGRID", "INGRID")),
 ("s27", 6, 2.4, "GENERADA", "Macro: una veta de cuarzo con motas de oro en el testigo; bolsas de muestra etiquetadas.",
  "Macro · 100 mm · luz rasante", "«Conocer → Evaluar → Estructurar → Buscar capital» (aparece palabra por palabra)", "Tacto de roca, lupa", "Corte al informe",
  P("Macro shot of a drill core sample with a white quartz vein and tiny specks of gold, a gloved finger pointing at it, labelled sample bags beside it on a lab bench. 100mm macro lens, raking light.",
    "gloved finger on rock")),
 ("s28", 6, 3.0, "GENERADA", "Ingrid escribe su informe junto a los resultados de laboratorio; mapas geológicos en la pared.",
  "Plano medio · 35 mm", "—", "Teclado, papeles", "Corte al mapa",
  P(f"In a small field office, <Subject 1>, {INGRID}, writes a technical report on a laptop next to printed laboratory assay sheets and a geological map pinned on the wall. Medium shot, 35mm, window light.",
    "keyboard, papers, air conditioner", "INGRID", "INGRID")),
 ("s29", 6, 2.2, "GENERADA", "Ingrid despliega un mapa geológico grande sobre la mesa (el gesto que se empalma con el plano ferroviario).",
  "Cenital · 35 mm · el papel se abre de izquierda a derecha", "—", "Papel que se despliega", "EMPALME POR MOVIMIENTO: su mapa → el plano de Mariela",
  P(f"Top-down shot: <Subject 1>, {INGRID}, unrolls a large geological map across a wooden table from left to right with both hands. 35mm, overhead.",
    "large paper unrolling", "INGRID", "INGRID")),
 ("s30", 7, 2.4, "GENERADA", "Mariela, ingeniera, despliega un plano ferroviario en la oficina de obra, mismo movimiento.",
  "Cenital · 35 mm", "—", "Papel", "La cámara sigue una línea del plano",
  P(f"Top-down shot: <Subject 1>, {MARIELA}, unrolls a large railway engineering blueprint across a site office table from left to right with both hands. 35mm, overhead.",
    "large paper unrolling", "MARIELA", "MARIELA")),
 ("s31", 7, 1.8, "GRÁFICO", "La cámara corre sobre una línea del plano y el dibujo técnico se vuelve una vía real (paso a s32).",
  "Empuje rápido sobre el papel · transición", "—", "Un zumbido que se vuelve riel", "Se vuelve vía", None),
 ("s32", 7, 3.0, "GENERADA", "Un tren de carga cruza un valle verde con un volcán al fondo, hora dorada.",
  "Aéreo lateral · 24 mm", "—", "Riel, bocina lejana", "Corte al puerto",
  P("Aerial shot of a long freight train crossing a green valley in Central America at golden hour, a volcano in the background, small fields and villages. Lateral tracking aerial.",
    "rail rhythm, distant train horn")),
 ("s33", 7, 2.0, "GENERADA", "Puerto al atardecer: grúas, contenedores, trabajadores caminando.",
  "General · 50 mm", "—", "Puerto, grúas", "Corte al mapa",
  P("Container port at dusk with gantry cranes loading a ship, workers in hard hats walking along the quay, lights coming on. Wide shot, 50mm.",
    "port machinery, distant voices")),
 ("s34", 7, 2.4, "GRÁFICO", "Mapa (negro y oro, como la presentación): las fronteras siguen visibles y aparecen conexiones entre ciudades, de océano a océano.",
  "Cenital · las líneas se encienden", "«PACÍFICO» · «ATLÁNTICO» en mono", "Pico de la música", "Corte a planta", None),
 ("s35", 7, 2.0, "GENERADA", "Cambio de turno en una planta: gente que sale caminando, con dignidad y cansancio bueno.",
  "General · 35 mm · contraluz", "—", "La música corta en seco al final", "Corte a silencio",
  P("Shift change at a factory in Central America at sunset: men and women in work clothes walk out through the gate together, tired and satisfied, backlit by the low sun. Wide shot, 35mm.",
    "factory gate, footsteps, voices")),
 ("s36", 8, 2.8, "GENERADA", "Kevin se lava las manos en el lavadero del taller al terminar la jornada; se quita el delantal.",
  "Detalle de manos → plano medio · 50 mm · luz de atardecer", "—", "Agua, silencio: la música se va", "Corte a la calle",
  P(f"At the end of the workday in the upholstery workshop, {KEVIN} washes his hands at a small concrete sink, then takes off his canvas apron and hangs it on a hook. Detail of hands then medium shot, 50mm, warm dusk light.",
    "running water, quiet workshop")),
 ("s37", 8, 3.0, "GENERADA", "Kevin camina a casa por su colonia al anochecer y compra pupusas en la esquina.",
  "Plano general · 28 mm · en mano", "—", "Comal, colonia al anochecer", "Corte a la mesa",
  P(f"Dusk in a working-class neighbourhood of San Salvador: {KEVIN} walks home and buys pupusas at a small corner pupuseria, a woman handing him a paper bag over the hot griddle, warm light. Wide shot, handheld.",
    "sizzling griddle, neighbourhood at dusk")),
 ("s38", 8, 5.0, "GENERADA", "En casa: su mamá sirve la comida (EMPALME: manos que reciben herramientas → manos que sirven); su hermana hace la tarea en la mesa.",
  "Plano medio · 35 mm · luz de foco cálido", "—", "Platos, risa suave, una radio muy baja", "Corte al cuaderno",
  P(f"Inside a small, clean, modest home in San Salvador at night: {CARMEN} serves pupusas and beans on plates on a plastic-covered table while {KEYLA} does homework at the table and {KEVIN} sits down beside her. Medium shot, 35mm, warm single bulb light.",
    "plates, cutlery, soft laughter, a radio very low")),
 ("s39", 8, 5.0, "GENERADA", "Su hermana le enseña el cuaderno; Kevin lo mira con atención; la mamá se ríe. Nadie mira a cámara.",
  "Primer plano de los tres · 50 mm", "«Una oportunidad para una empresa / puede convertirse en una oportunidad / para toda una familia.»",
  "Voces de familia, cubiertos", "Corte a la calle",
  P(f"At the family table at night, {KEYLA} proudly shows her school notebook to {KEVIN}, who reads it with attention and smiles, while {CARMEN} laughs softly. Close three-shot, 50mm, warm light. Nobody looks at the camera.",
    "family voices, cutlery")),
 ("s40", 8, 3.4, "GENERADA", "Afuera, la calle de noche tranquila: vecinos conversando en las aceras, niños jugando, la luz de la pupusería.",
  "General · 28 mm · fijo", "—", "Calle en calma, grillos, risas", "Corte a los niños",
  P("A calm working-class street in San Salvador at night: neighbours chatting on the sidewalk in plastic chairs, children playing, the warm light of a corner pupuseria, a peaceful atmosphere. Wide locked shot, 28mm.",
    "calm street, crickets, laughter")),
 ("s40b", 8, 3.4, "GENERADA", "Niños jugando fútbol con una pelota gastada bajo un farol; una vecina los mira desde su puerta.",
  "General · 35 mm · en mano", "—", "Pelota, risas, grillos", "Corte a la pantalla real",
  P("At night on a quiet residential street in San Salvador, children play football with a worn ball under a streetlight while a neighbour watches calmly from her doorway. Wide shot, 35mm, handheld, warm streetlight.",
    "ball bouncing, children laughing, crickets")),
 ("s41", 9, 2.8, "CAPTURA", "OrdenScan en vivo: los bloques de la cadena 5550 entrando uno tras otro; la app Veta Wallet.",
  "Tarjeta flotante sobre negro · captura real", "«Cadena 5550 · siete validadores · un bloque cada diez segundos» · «ordenscan.com»",
  "Un tic suave por bloque", "Corte a Lucía", None),
 ("s42", 9, 3.0, "GENERADA", "Anochece: Lucía baja la cortina de su taller y se queda mirando su calle (bookend del principio).",
  "Plano medio · 35 mm · luz azul de anochecer + farol", "—", "Cortina que baja, calle", "Corte a los rostros",
  P(f"At dusk, <Subject 1>, {LUCIA}, pulls down the metal shutter of her upholstery workshop, then stays a moment looking at her street as the streetlights come on. Medium shot, 35mm, blue hour.",
    "metal shutter coming down, evening street", "LUCIA", "LUCIA")),
 ("s43", 9, 1.2, "GENERADA", "Ingrid en una loma a la hora dorada, mira el valle.",
  "Primer plano · 85 mm", "—", "Viento", "Corte",
  P(f"Golden hour on a ridge above a green valley: close-up of <Subject 1>, {INGRID}, looking out over the landscape, wind in her hair. 85mm.",
    "wind", "INGRID", "INGRID")),
 ("s44", 9, 1.2, "GENERADA", "Kevin abraza a su hermana en la puerta de la casa.",
  "Plano medio · 50 mm", "—", "Colonia de noche", "Corte",
  P(f"At the door of their small home at night, {KEVIN} hugs his little sister, {KEYLA}, warm light from inside. Medium shot, 50mm.",
    "night street")),
 ("s45", 9, 1.3, "GENERADA", "Mariela en el puerto, casco en la mano, mientras pasa un tren iluminado.",
  "General · 35 mm · hora azul", "—", "Tren, puerto", "Corte al mapa",
  P(f"Blue hour at a port rail yard: <Subject 1>, {MARIELA}, stands holding her hard hat as an illuminated freight train passes behind her. Wide shot, 35mm.",
    "passing train", "MARIELA", "MARIELA")),
 ("s46", 9, 5.4, "GRÁFICO", "Mapa: Centroamérica en oro sobre negro; la cámara se abre y aparece Latinoamérica entera.",
  "Cenital · zoom out lento", "«¿Por qué no toda Latinoamérica?»", "Acorde sostenido; 1 s de silencio antes de la pregunta", "Corte a negro", None),
 ("s47", 9, 3.5, "GRÁFICO", "Cierre en negro: ORDEN GLOBAL · Sistema Financiero Social · ordenglobal.org",
  "Fijo", "ORDEN GLOBAL / Sistema Financiero Social / ordenglobal.org · letra chica: «Material informativo; no constituye oferta de valores ni de inversión. Imágenes ilustrativas generadas con IA.»",
  "El motivo de marimba resuelve; las dos campanas de Orden Global", "Fin", None),
]

# Voz: (línea, toma ancla, desfase dentro de la toma). Todo lo demás lo mide el script.
VOZ = [
    ("L01a", "s03", 0.10), ("L01b", "s04", 0.20),
    ("L02", "s05", 0.40), ("L03", "s06", 0.30), ("L03b", "s08", 0.10),
    ("L04", "s14", 0.30), ("L04b", "s15", 0.40), ("L05", "s17", 0.40), ("L06", "s19", 0.40),
    ("L07", "s20", 0.60), ("L07b", "s21", 2.00), ("L08", "s22", 0.50),
    ("L09", "s26", 0.30), ("L09b", "s28", 0.10), ("L10", "s30", 0.20), ("L11", "s34", 0.10),
    ("L12", "s38", 0.40), ("L13", "s39", 0.90), ("L14", "s40", 2.80),
    ("L15", "s41", 0.35), ("L16", "s42", 0.60), ("L17", "s43", 0.20),
    ("L18", "s46", 0.40), ("L19", "s46", 3.40),
]
ESCRITO = {"Morasán": "Morazán", "de, be, ene, equis,": "DBNX", "[softly] ": "", "[warmly] ": ""}
CLAVE = {"s03", "s04", "s24", "s38", "s39", "s42"}   # tomas que sostienen la película: 3 tomas


def c1(x: float) -> str:
    """Decimal con coma, como se escribe en español."""
    return f"{x:.1f}".replace(".", ",")


def tc(t: float) -> str:
    return f"{int(t // 60)}:{t % 60:04.1f}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voz", required=True, help="carpeta con L01a.wav… y lineas.json")
    ap.add_argument("--json", default=str(RAIZ / "prompts/pelicula4_abrir.json"))
    ap.add_argument("--md", default=str(RAIZ / "PELICULA4.md"))
    a = ap.parse_args()
    lineas = json.loads((Path(a.voz) / "lineas.json").read_text())

    t0, t = {}, 0.0
    for s in T:
        t0[s[0]] = t; t += s[2]
    total = t
    voz, err = [], []
    for k, toma, off in VOZ:
        ini = t0[toma] + off
        d = sf.info(str(Path(a.voz) / f"{k}.wav")).duration
        texto = lineas[k]
        for x, y in ESCRITO.items():
            texto = texto.replace(x, y)
        voz.append({"linea": k, "toma": toma, "t": round(ini, 2), "dur": round(d, 2), "fin": round(ini + d, 2), "texto": texto})
    for x, y in zip(voz, voz[1:]):
        if x["fin"] + 0.15 > y["t"]:
            err.append(f"{x['linea']} termina en {x['fin']:.2f} y {y['linea']} empieza en {y['t']:.2f}")
    if voz[-1]["fin"] > t0["s47"]:
        err.append("la última frase pisa el cierre")
    if err:
        print("NO CABE:\n  " + "\n  ".join(err)); return 1

    tomas = []
    for (i, sec, dur, fuente, accion, camara, texto, sonido, trans, gen) in T:
        v = [x for x in voz if t0[i] <= x["t"] < t0[i] + dur]
        tomas.append({"id": i, "secuencia": sec, "t": round(t0[i], 2), "dur": dur, "fuente": fuente, "accion": accion,
                      "camara": camara, "texto": texto, "sonido": sonido, "transicion": trans,
                      "voz": [x["linea"] for x in v],
                      "tomas_a_generar": (3 if i in CLAVE else 2) if gen else 0,
                      **({"prompt": gen["prompt"], "negative": NEG, "ref": gen["ref"]} if gen else {})})
    Path(a.json).write_text(json.dumps({"titulo": "Abrir", "dur_s": round(total, 2), "voz": voz, "tomas": tomas},
                                       ensure_ascii=False, indent=1))

    # --- tablas para el documento ---
    SEC = {1: "El llamado", 2: "La pregunta", 3: "El sueño y el presente", 4: "La economía se vuelve cotidiana",
           5: "Del capital al empleo", 6: "Nuestra riqueza, evaluada", 7: "Pensar a escala regional",
           8: "Lo que significa llegar a casa", 9: "De nuestra gente a Latinoamérica"}
    g = ["| TC | Voz | Texto | Dura |", "|---|---|---|---|",
         "| 0:00.0 | **BUKELE (archivo, 2018)** | «Ya llegó el momento de que unamos Centroamérica.» | 2,3 s |"]
    for x in voz:
        g.append(f"| {tc(x['t'])} | Lucía | {x['texto']} | {c1(x['dur'])} s |")
    p, sec = [], 0
    for s in tomas:
        if s["secuencia"] != sec:
            sec = s["secuencia"]
            ini = s["t"]; fin = sum(x["dur"] for x in tomas if x["secuencia"] == sec) + ini
            p.append(f"\n**Secuencia {sec} — {SEC[sec]}** ({tc(ini)}–{tc(fin)})\n")
            p.append("| TC | Toma | Fuente | Imagen y acción | Cámara | Voz | Texto | Sonido | Transición |")
            p.append("|---|---|---|---|---|---|---|---|---|")
        vz = " ".join(f"«{x['texto']}»" for x in voz if x["toma"] == s["id"]) or "—"
        p.append(f"| {tc(s['t'])} | {s['id']} · {c1(s['dur'])} s | {s['fuente']} | {s['accion']} | {s['camara']} | {vz} | "
                 f"{s['texto']} | {s['sonido']} | {s['transicion']} |")
    n_gen = sum(1 for s in tomas if s["fuente"] == "GENERADA")
    n_clips = sum(s["tomas_a_generar"] for s in tomas)
    bloque = ("<!-- TABLAS -->\n### Guion con tiempos medidos\n\n"
              f"Duración total: **{c1(total)} s** ({tc(total)}). Voz de Lucía: {c1(sum(x['dur'] for x in voz))} s en {len(voz)} frases; "
              "el resto es respiración, sonido y música. Cada duración sale del audio generado, no de una estimación.\n\n"
              + "\n".join(g) + "\n\n### Tabla de producción por tiempo\n" + "\n".join(p) +
              f"\n\n{n_gen} tomas generadas → {n_clips} clips (3 tomas en las que sostienen la película, 2 en el resto).\n"
              "<!-- /TABLAS -->")
    md = Path(a.md)
    if md.exists():
        s = md.read_text()
        s = re.sub(r"<!-- TABLAS -->.*?<!-- /TABLAS -->", lambda m: bloque, s, flags=re.S)
        md.write_text(s)
    print(f"{a.json}: {len(tomas)} tomas, {total:.1f} s, {n_gen} generadas → {n_clips} clips")
    return 0


if __name__ == "__main__":
    sys.exit(main())
