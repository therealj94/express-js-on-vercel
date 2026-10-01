# Película 5 — «El cuaderno» (historia de Orden Global)

Vertical 9:16 · ~2:15 · narración con la voz clonada del fundador · ElevenLabs Flows
(imágenes: GPT Image 2 · vídeo: Seedance 2.5) · flujo «El cuaderno · Orden Global».

## La técnica (cómo se ve «dibujado a mano» sin que lo note la IA)

Cada página se resuelve con tres imágenes y tres planos:

| Paso | Imagen / plano | Cómo |
|---|---|---|
| A | **Página dibujada** (imagen final) | GPT Image 2, con la imagen maestra como referencia de mesa, luz y papel |
| B | **Página en blanco** (misma toma) | GPT Image 2 editando A: «misma foto, la página vacía» |
| 1 | **Time-lapse dibujando** | Seedance 2.5, `start_frame = B`, `end_frame = A`: «la mano dibuja rápido…» |
| 2 | **El dibujo cobra vida** | Seedance 2.5, `start_frame = A`: solo se mueve lo dibujado, la mano quieta |
| 3 | **Giro de página** | Seedance 2.5, `start_frame = A`, `end_frame = B` de la página siguiente |

Así el plano 1 termina exactamente donde empieza el 2, y el 3 entrega al 1 de la página
siguiente: la película es un solo plano continuo de mesa, sin saltos.

## Reglas fijas (van en todas las instrucciones)

- Mesa de madera vieja, de noche, una lámpara cálida desde arriba a la izquierda, sombras azules.
- Cuaderno de papel crema grueso, cinta marcapáginas roja oscura.
- Grafito y carboncillo en blanco y negro; **único color: acuarela dorada** (oro, luces, ORIGEN).
- Mano de hombre, manga azul oscuro arremangada, cinco dedos, nunca se ve la cara.
- Sin texto, letras ni logos dentro de las imágenes: todo rótulo va en montaje.
- Personas dibujadas: siluetas sin rasgos faciales; el número exacto en cada página.
- Un solo movimiento por plano; cámara fija o empuje lento.

## Páginas

| # | Tiempo | Página dibujada (A) | Vida (plano 2) | Voz |
|---|---|---|---|---|
| 0 | 0:00–0:08 | Llamita dorada en el centro de la página | La llamita tiembla, casi se apaga; la mano la cubre | «Esta no es la típica historia de éxito…» |
| 1 | 0:08–0:18 | Figura sola caminando por una carretera de noche | La figura camina; el camino se dibuja delante | «Vos y yo sabemos lo difícil…» |
| 2 | 0:18–0:30 | Montañas, río, manos con batea y un punto de oro; abajo, casas humildes | El agua corre, el oro destella | «Todo empezó hace cuatro años…» |
| 3 | 0:30–0:42 | Maquinaria detenida bajo la lluvia; pila de papeles con sellos | Cae la lluvia en trazos; los papeles se apilan | «Pero esos proyectos nunca…» |
| 4 | 0:42–0:54 | Mesa de cocina con 4 siluetas (padre, madre, hijo, hija), libros, laptop; 4 luces doradas | Las 4 luces se encienden una a una | «Entonces decidimos estudiar el dinero…» |
| 5 | 0:54–1:10 | Llega la 2.ª familia (padre, madre, 3 hijos): 5 luces más; viñetas de finanzas y del programador; muchas figuritas con su luz en los bordes | Las figuritas entran por los bordes con sus luces | «Primero fuimos una familia…» |
| 6 | 1:10–1:30 | La misma mesa, cansancio: tazas, calendarios; quienes apoyaron, cabizbajos, sosteniendo su luz | Páginas que pasan solas; **la mano arranca y arruga una página**; **una lágrima cae** y corre el grafito | «Fueron cuatro años… Pero seguimos.» |
| 7 | 1:30–1:44 | Todas las luces fluyen hacia una moneda dorada (ORIGEN); mercado: una mano paga, otra recibe | La acuarela dorada se derrama y forma la moneda | «Hoy existe ORIGEN…» |
| 8 | 1:44–1:54 | Mapa de Centroamérica: líneas doradas chocan con un muro gris | **La punta del lápiz se quiebra** | «Pero el sistema está hecho…» |
| 9 | 1:54–2:08 | Mesa con una silla vacía y una luz sin color | La mano deja el lápiz y **lo desliza hacia la cámara** | «Por eso hoy te cuento…» |
| 10 | 2:08–2:18 | La luz de la silla se enciende; la red dorada cruza el muro y une los países | El cuaderno se cierra; en la tapa, OG en relieve dorado (logo en montaje) | «Si querés ser parte, hablemos…» |

## Voz

La graba José con su voz clonada (Professional Voice Clone). Guion en `montaje/guion_cuaderno.py`
cuando esté la voz; se mide frase por frase y la película se corta a la voz, como «Siete».

## Costos medidos (estimación de ElevenLabs, 1-oct-2026)

- Imagen GPT Image 2, 2K alta: ~$0,17 cada una → ~33 imágenes ≈ $6.
- Seedance 2.5, 5 s: $2,31 a 720p · $5,17 a 1080p.
- ~30 planos de ~5 s a 720p ≈ $70, más ~30 % de retomas ≈ $90; a 1080p ≈ $200.
- Recomendado: generar a 720p y subir a 1080p solo los planos elegidos (Topaz en el mismo flujo).
