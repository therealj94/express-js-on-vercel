# Honduras Secreta — «Déjame demostrarte» (60–65 s, 9:16)

Cliente: Honduras Secreta (turismo). Lema oficial del logo: **«¡más de lo que imaginas!»**.
Referencias de ritmo: videos de Don Joaco (Granada / Chontales, Nicaragua) — hook en pregunta,
cortes de 1–2 s sobre la palabra, dato de orgullo, gente, comida, frase final.
Estilo: tipo Sam Kolder — una sola toma continua aparente, match cuts, whip pans, speed ramps,
cámara lenta en momentos fuertes, un solo grade cálido + turquesa, grano.

Flow ElevenLabs: `JObA0kDrqhYxEJWvsvbP` (https://elevenlabs.io/app/flows/JObA0kDrqhYxEJWvsvbP)

## Voz (José clonado «Jose latam», eleven_v4, neutral sin voseo)
Nodo TTS `u44I7oTuGQF2HTP9lrFn` — 3 tomas (~47–49 s).

> Mientras en otros países te quieren convencer de que lo suyo es más bonito... déjame demostrarte lo que es bonito.
> Aquí el mar es parte del segundo arrecife más grande del mundo... y los tiburones son de verdad.
> Salimos del agua... y el río te sacude el alma. Cascadas de cuarenta y tres metros.
> En Copán, las guaras vuelan sobre la escritura maya más larga que existe.
> En Tela, el tambor garífuna te mueve los pies. En La Campa, manos lencas hacen arte sin torno.
> Pescado frito en el Lago de Yojoa... una baleada recién hecha... y el café de Marcala, la primera denominación de origen de Centroamérica.
> En La Mosquitia, uno de los últimos bosques lluviosos de Centroamérica.
> Y esto... es solo lo que te puedo enseñar en un minuto. Honduras... es más de lo que imaginas.

## Datos verificados
| Dato | Fuente |
|---|---|
| Cara a Cara (Roatán): 10–20 tiburones de arrecife del Caribe a ~21 m | travel.padi.com, roatan.online |
| Utila: tiburón ballena todo el año, picos mar–abr y ago–oct | blog.padi.com |
| Sistema Arrecifal Mesoamericano = 2.º del mundo (compartido MX/BZ/GT/HN) | es.wikipedia.org |
| Río Cangrejal: clase III–IV, junto a Pico Bonito | xplorhonduras.com |
| Pulhapanzak: ~43 m, a 18 km del Lago de Yojoa | es.wikipedia.org |
| Copán: UNESCO 1980; Escalinata Jeroglífica >2.000 glifos (texto maya más largo), bajo lona protectora | ihah.hn |
| Punta garífuna: Bahía de Tela (Triunfo de la Cruz, Tornabé, Miami) | xplorhonduras.com |
| Cerámica lenca: La Campa, Lempira; mujeres «loceras», a mano sin torno | ceramica.fandom, revistahibueras.hn |
| Río Plátano: Patrimonio Natural UNESCO 1982 (en peligro desde 2011) | worldheritageoutlook.iucn.org |
| Café Marcala: 1.ª denominación de origen de Centroamérica (2005) | docafemarcala.org |

## Imágenes de referencia (gpt-image-2, 9:16 2K high) → inicio de clips MiniMax H3
| Id | Plano | Nodo |
|---|---|---|
| H01 | Móvil con anuncio genérico (hook) | 8y2zbntRGYNjlEeqkhZO |
| R01 | West Bay Roatán, dron cenital | ZOWCuILyi5obYYRmeary |
| R02 | Medio arriba / medio abajo del agua | 85Z0SJB3YBXEwUmGnYHv |
| R03 | Tiburones de arrecife + buzo | R4snajSUDvErl285RF6V |
| U01 | Tiburón ballena Utila | KOYFKM9EnLTXOVYrzUQf |
| C01 | Rafting Río Cangrejal | Q3a5wGA6hzoWcndz8eT6 |
| P01 | Pulhapanzak | hUPQsz8pTPIbwnQHTjxe |
| CP01 | Copán Gran Plaza + guaras | oz5OI7iNeeY0NqtGCdLv |
| CP02 | Escalinata Jeroglífica (con lona) | AAoR1gfQuRxA56qFjAvE |
| G01 | Tambores garífunas + punta, Triunfo de la Cruz | QNuvxTeaevAD0yOTtKeD |
| L01 | Manos locera lenca, La Campa | kOBCopxmMJMatXr7iPNh |
| Y01 | Pescado frito Lago de Yojoa | de4lgqXdwDl1pnebhPHa |
| B01 | Baleada en comal | I3Bhd66qgxy0ZVHaQ8pF |
| M01 | Café Marcala | U2xaNHpkyd8qjWwanbm6 |
| MQ01 | Río Plátano aéreo | s61ViXmuRZb6mHk7aQzT |
| F01 | Viajera al atardecer (Yojoa) | ChXhMgDzjWS90S99f1HV |

Pendiente: planos de la guara mascota (hook y cierre) — requieren subir las fotos 4/5/6 del
personaje al flow como referencia. Logo y textos se ponen en edición, nunca por IA.

## Reglas anti-IA
Cortes de 1,5–2 s de clips de 6 s; sin primeros planos de dedos/caras con gestos; gente de
espaldas, perfil o lejos; revisión cuadro a cuadro; descartar cualquier toma con extremidades extra.

## Estado (v1 con clips MiniMax H3)
- Voz elegida: toma 3 (`t3.mp3`). Música: opción B, arranca en 9,58 s para que el golpe caiga en «Aquí el mar» (7,5 s del vídeo).
- Guara: GU1 (hook, ala levantada) y GU2 (cierre, saludo con el sombrero), generadas con gpt-image-2 a partir de la descripción del personaje.
- 18 clips MiniMax H3 768p de 6 s ($6.48). Montaje: `montaje/honduras_animatic.py --clips CLIPS` (sin `--clips` sale el animatic con fotos).
- Duración final: 53,4 s. Coste total aproximado: imágenes $3.6 + clips $6.5.

## v2
- Retomas MiniMax: Escalinata (grúa ascendente entre glifos) y guara del hook (despega hacia cámara; se usa hasta 5,05 s porque después pierde el sombrero).
- Rampas de velocidad en cada corte (`tiempo_rampa`, integral con erf): el clip acelera al llegar al corte y el siguiente entra rápido y frena.
- Diseño sonoro por escena (`diseno_sonoro`): ambientes en bucle (playa, bajo el agua, rápidos, cascada, selva, aplausos, barro, fritura, café, viento) con ducking bajo la voz, y golpes sincronizados (despegue de la guara, picada, salida del agua, whoosh con su pico en el corte, golpe del logo). Mezcla −14,8 LUFS.
- Coste extra v2: 2 clips $0.72 + efectos.

## v3 — rediseño tras la revisión de José
Crítica: transiciones pobres (hechas en edición sobre clips casi quietos), garífunas con movimiento feo,
inicio plano, escena del celular débil, la guara no narra ni interactúa, escenas repetidas.

Cambios de fondo:
1. **Transiciones dentro de la toma**: cada paso entre lugares es un clip MiniMax con `start_frame` = escena A y
   `end_frame` = escena B y un movimiento de cámara real (picada, vuelo, atravesar niebla, seguir a la guara).
   La edición solo empalma clips cuyo último cuadro es el primero del siguiente → una sola toma continua.
2. **La guara narra**: abre hablando a cámara con lipsync (OmniHuman 1.5, voz de José),
   reaparece en Copán y cierra hablando. Se elimina la escena del celular.
3. **Garífunas en detalle y cámara lenta**: manos en el tambor y pies de punta en la arena (menos cuerpo = menos errores).
4. **Ninguna escena se repite**: un plano = un clip, sin punch-ins del mismo material.

Recorrido (todo encadenado):
guara habla (Roatán) → despega → seguimos su vuelo sobre West Bay → picada al mar → arrecife → tiburones →
tiburón ballena → sube a la superficie → rápidos del Cangrejal → río arriba a Pulhapanzak → niebla → Copán (guara
en la estela habla) → escalinata → atardecer en Tela (manos tambor, pies punta) → La Campa → pescado frito →
baleada → café de Marcala → amanecer en La Mosquitia → viajera al atardecer → guara cierra hablando → logo.
