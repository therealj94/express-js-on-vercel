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

### v3 entregada (92 s)
- 17 clips de transición MiniMax con imagen de inicio y de fin + 3 escenas de la guara hablando (OmniHuman 1.5 con la voz de José).
- Montaje `montaje/honduras_v3.py`: empalme de tomas continuas con rampa lento→rápido→lento; tramos con voz a tiempo real.
- Motion graphics `montaje/honduras_mg.py`: títulos en Monoton (estilo del logo) con el degradado arcoíris, mapa de Honduras
  con la ruta (contorno Natural Earth), cifras (2.º arrecife, 43 m, +2.000 glifos, 1.ª D.O.), subtítulos con palabra activa,
  logo animado (HONDURAS se dibuja, la guara entra volando, «Secreta» al final).
- Música: musica_v3b desde 7 s (golpe en el despegue) + salida suave de musica_b en fundido cruzado. −15 LUFS.
- Coste v3 ≈ $10 (transiciones $5.0, lipsync $3.6, imágenes $0.8, música $0.4, prueba $0.4).

## v4 — correcciones de José sobre la v3
Crítica: congelados (0:13, 0:17, 0:28 y otros), el tiburón ballena sale sin que nadie lo nombre, los tiburones
parecen IA, falta La Ceiba (cuna de la baleada), Marcala pasa demasiado rápido a La Mosquitia, faltan efectos
inmersivos (entrar al agua, burbujas, cascada, café, canto garífuna) y la música debe ser emotiva tipo Odesza.

Causa de los congelados: MiniMax sostiene casi quietas la imagen de inicio y de fin (0,3–1,2 s) y la rampa
lento→rápido→lento de la v3 frenaba justo ahí. Medido con `honduras_v4.py --revisa HS_v3.mp4`:
13,4 s · 16,2 s · 20,6 s · 29,3 s · 37,1 s · 41,1 s · 46,8 s · 50,3 s · 79,9 s.

Arreglo (`montaje/honduras_v4.py`):
- Recorte automático del tramo quieto de cada clip (diferencia media entre cuadros < 8 % de la mediana).
- Rampa inversa: rápida en las uniones, cámara lenta en el centro, g(u) = u + 0,38·sin(2πu)/(2π);
  interpolación entre cuadros y desenfoque de movimiento en lo rápido.
- Tramos con voz a tiempo real: nunca se sostiene el último cuadro (se ralentiza) y llevan un empuje lento.
- `--revisa` comprueba el render final y lista cualquier tramo quieto ≥ 0,3 s.

Nuevo material:
| Id | Qué | Nodo |
|---|---|---|
| R04 | Tiburones de arrecife estilo documental GoPro, a distancia | gpt-image-2 IIUsbo3Uekenl7cw2Gnz → ref gQ50JxhNFasuGyaPjSjZ |
| LC01 | La Ceiba aérea: muelle + Pico Bonito | FwwAGkjhmvxBlAwjMymP → ref 4jiWaQ2T36RjmXlFyZOh |
| B02 | Puesto de baleadas en La Ceiba | lL0nb7R5MSXdS7jkDcZd → ref yCBfpSJb71ougPC6QbD8 |
| M02 | Café vertiéndose en la taza de barro, Marcala | cBP5onnvjhEvb8d771vo → ref aincZzJX29pjMDgK8KWU |
| T05 | R02 → R04 (H3 Max) | WQbcfSVaahkCKMFKO8X7 |
| T06 | R04 → U01 tiburón ballena (H3 Max) | fJE2C2n9UZHVti7aVRzG |
| TYC | Pescado frito Yojoa → La Ceiba | tQDCAWZRcyFidv28Vpdm |
| TCB | La Ceiba → baleada | kLnrUyP51sYEutn15Nml |
| TBM | Vapor de la baleada → café vertiéndose | FMlExmeUDuUQnQfYtIIr |
| TMM | Café → paisaje de Marcala (M01) | E3mfeiwgxsBWI1c5gpg6 |

Voz nueva (José, eleven_v4): «Y en Utila… nada el pez más grande del mundo.» (EoHFQCwLTw2Q8APFkZCe) y
«Y en La Ceiba, donde dicen que nació… la baleada.» (6tNQhIS3ds9ENQuUYIgU). Se quita «una baleada recién hecha»
de la toma 3. Sonido: chapuzón LGRkOQ5HdomOIM9n2cVS, burbujas 0waFP9hpYVZSw0trJHFJ, cascada BABRtxBQkAYIm6sut2X8,
café 3V7MEXv6GilIEVo7Xr9C, tambores + canto garífuna 25EbuhhpGMlOJRRDQkhY, música Odesza keAujy7DYL8xfP1IWabi
(golpe a los 8 s, puente 46–64 s, segundo golpe a los 64 s).

| Dato nuevo | Fuente |
|---|---|
| La baleada: la versión más contada la sitúa en La Ceiba (doña Teresa, años 60); otra versión dice La Lima → «dicen que nació» | elheraldo.hn, latribuna.hn |
| La Ceiba, «Capital del Ecoturismo» de Honduras; Pico Bonito junto a la ciudad | visitatlantida.com, exploracentroamerica.com |
| Tiburón ballena en Utila (pez más grande del mundo) | blog.padi.com |

## v5 — la versión de dos minutos (2:17 con logo)
Pedido de José: hasta 2 min sin perder calidad, más lugares (Amapala, Valle de Ángeles, Intibucá/La Esperanza),
algo de noche, cierre motivacional que se recuerde. «En un minuto» → «en dos minutos».

Estructura (un día entero, del mar a la noche):
destellos (1,7 s, riser + golpe) → guara en Roatán → West Bay → al agua → tiburones → tiburón ballena → Cangrejal →
Pulhapanzak → Copán (guara) → Tela garífuna → La Campa → **La Esperanza** (pañuelos lencas en la neblina) →
**Laguna de Chiligatoro** → Yojoa → La Ceiba → baleada → café Marcala → **Valle de Ángeles** (calle colonial →
baúl tallado) → tallado que se vuelve selva → La Mosquitia → río hasta el mar → **Amapala** atardecer en Playa Negra
con el Cosigüina → se hace de noche en una toma → la guara cierra bajo las estrellas → «YA NO ES UN SECRETO» → logo.

Cierre de la guara: «Y esto… es solo lo que te puedo enseñar en dos minutos. Imagínate todo lo que falta.
Honduras no se cuenta… se vive. Honduras… es más de lo que imaginas.»

| Dato nuevo | Fuente |
|---|---|
| Amapala: Isla del Tigre, Golfo de Fonseca; Playa Negra frente al volcán Cosigüina; atardeceres, lanchas que regresan al caer el sol | laprensa.hn, hondurastips.hn, elheraldo.hn |
| Valle de Ángeles: 22 km de Tegucigalpa, calles empedradas, «cuna de los artesanos»; baúles tallados en madera como icono | elheraldo.hn, xplorhonduras.com |
| La Esperanza / Intibucá: ciudades gemelas, la ciudad más alta (>1.700 m) y más fría de Honduras, corazón de la Ruta Lenca; pañuelos lencas | en.wikipedia.org, visitcentroamerica.com |
| Laguna de Chiligatoro: a 30 min de La Esperanza, rodeada de pinos | espaciohonduras.net, wikivoyage |

Nodos nuevos: imágenes LE01 plwj5mqF2xlQm2s64lz9, LE02 fwDlfgIDit5xvVJi5ylq, VA01 7x2gzdRqwVGweFPxf6Sm,
VA02 vs0ZdOyo6W8FjDp8ZJsX, AM01 0irrtVUh2OQtdCKVR5OP, AM02 LNWUlJ90uj2nUvekP8PZ, GU3 xfa7sTKbmQFAxINDGsiZ;
transiciones TLE bh6YYQJUBHO1kCX3DeZI, TLL ksxnaPSDfSofBma2yiUQ, TLY LSOUPVzFIQfwV1VamiV1, TMV tEVE2Tzb22xWUxtz1bEd,
TVV bzPWCNqgTV25KEqSZPV8, TVM VBFkLDg2HuzsXs47V5Gu, TMA ZWYfpdPEWWi0Ra3Wg3KW, TAN (H3 Max) ocSrECm0PZ2CITiUYLZG,
TNG FnQt8UNcfeYDzQHMiuHF; lipsync GU3 PHpUpGc5qnGN8ZYKaXOr; música 4TSYdJPFGQICsEo5TYIq (toma a: golpe 11 s,
puente 58–74 s, clímax 102 s, salida 121,5 s).
