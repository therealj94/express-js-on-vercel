# ORIGEN · Prompts para crear las referencias

Estas imágenes fijas sirven de referencia para que todos los planos del tráiler se vean como la misma película. Úsalas como:
- **primer cuadro** en image-to-video: Kling, Runway, Veo o Luma;
- **referencia de estilo:** `--sref` en Midjourney, o la imagen de referencia en Imagen, Flux o Firefly.

En `referencias/` ya vienen cuadros sacados del tráiler terminado. Puedes usarlos directamente o generar versiones fotorrealistas con estos prompts.

---

## 1. Biblia de estilo (lo que comparten todas)

| Elemento | Regla |
|----------|-------|
| Composición | Vertical 9:16. **Arco dorado fijo**: la parte alta del arco está al 60 % de la altura y cruza todo el ancho, con curva suave. Arriba hay cielo y aire para texto; abajo, la superficie. |
| Luz | Amanecer detrás del horizonte, rasante, cálida. Neblina volumétrica en la línea de horizonte. Borde del arco brillante, casi blanco dorado. |
| Lente | Macro anamórfico, poca profundidad de campo, el primer plano ligeramente desenfocado. |
| Paleta | Negro `#05060C`, azul noche `#0B0E1A`, ámbar `#E0A43A`, oro claro `#FFE3A3`, oro viejo `#9A6414`, crema `#F4EBDD` |
| Textura | Grano de película de 35 mm, fino. Viñeta suave. |
| Prohibido | Monedas, lingotes, bóvedas, signos de dólar, gráficas, banderas, fronteras, personas, texto escrito por la IA. |

**Sufijo común.** Pégalo al final de cada prompt:

```
vertical 9:16 composition, a thin glowing gold horizon arc fixed at 60% frame height
curving across the full width like the rim of a small planet, dawn amber haze behind
the arc, deep night-blue sky with sparse faint stars above, anamorphic macro lens,
shallow depth of field, grazing golden light, volumetric haze, fine 35mm film grain,
soft vignette, deep blacks, premium cinematic, ultra detailed, 8k
```

**Negativo común**, para Flux, SD, Firefly o `--no` en Midjourney:

```
text, letters, watermark, logo, coins, gold bars, vault, dollar sign, chart, flag,
map borders, people, hands, cartoon, illustration, oversaturated, neon, lens flare
streaks, blurry horizon, tilted horizon, double horizon
```

**Parámetros Midjourney v7:** `--ar 9:16 --style raw --stylize 250 --chaos 5`
Genera primero la referencia **R00**. Luego usa esa imagen como `--sref` en todas las demás, con `--sw 300`, para mantener la consistencia.

---

## 2. Referencias por plano

### R00 · Imagen maestra, el borde de un gramo
```
A planet made of molten gold seen from low orbit at dawn, only the top curve of the
planet visible in the lower third, liquid gold surface with slow heavy ripples and
bright specular highlights, the rim glowing white-gold, [sufijo común]
```

### R01 · Sal, Salar de Uyuni
```
Surface of a small planet made of the Salar de Uyuni salt flat, white hexagonal salt
crust ridges receding to the horizon, faint lavender reflections, [sufijo común]
```

### R02 · Mar Caribe
```
Surface of a small planet made of Caribbean shallow turquoise water, bright dancing
caustic light nets over white sand, seen from very low altitude, [sufijo común]
```

### R03 · Estratos, Vinicunca
```
Surface of a small planet made of the Vinicunca rainbow mountain mineral strata, bands
of rust red, ochre, cream, teal and mauve, fine mineral texture, [sufijo común]
```

### R04 · Hoja, Amazonía
```
Extreme macro of an Amazon rainforest leaf as the surface of a small planet, backlit
glowing yellow-green veins, fine cellular texture, dew, [sufijo común]
```

### R05 · Aguayo, Andes
```
Andean aguayo handwoven textile as the surface of a small planet, stripes of magenta,
orange, yellow, green, deep blue and red with small diamond motifs, visible wool
weave, [sufijo común]
```

### R06 · Basalto y fuego
```
Black volcanic basalt as the surface of a small planet, hexagonal cooling cracks
glowing with orange lava light, ember sparks, [sufijo común]
```

### R07 · Piedra, grecas de Mitla
```
Carved stepped-fret (greca) stone relief from Mitla, Oaxaca, as the surface of a small
planet, warm limestone, deep carved shadows, hard grazing light, [sufijo común]
```

### R08 · Cacao
```
Glossy melted dark cacao as the surface of a small planet, slow viscous swirls,
reddish brown, rich specular highlights, [sufijo común]
```

### R09 · Las 55 marcas sobre el horizonte
```
The gold planet rim at dawn with 55 small evenly spaced glowing gold tick marks
standing on the horizon line like a counter, every fifth tick longer, [sufijo común]
```

### R10 · El anillo del gramín
```
A perfect thin glowing gold ring floating in black space, 55 evenly spaced tick
marks on its inner edge, every fifth tick longer, the tick at 12 o'clock flaring
brighter than the rest, faint stars, jewelry-grade gold, watch-dial precision,
vertical 9:16, centered in the upper half, empty space below, premium cinematic,
fine film grain, deep blacks
```

### R11 · Constelación de Latinoamérica
```
Top-down view of black space with faint gold dust, about forty glowing gold points
arranged in the geographic positions of Latin American cities from Tijuana to
Ushuaia, joined by thin glowing gold lines forming a constellation shaped like
Latin America, no map, no borders, no land fill, vertical 9:16, premium, film grain
```

### R12 · Tarjeta de ecuación (fondo)
```
The gold planet rim very low in frame at dawn, molten gold below, large calm empty
dark space above for centered typography, [sufijo común]
```

### R13 · Cierre y logo (fondo)
```
Calm dawn horizon extremely low in frame, thin white-gold rim, warm amber glow
fading upward into night blue, vast empty space for a logo, still, final,
vertical 9:16, fine film grain
```

---

## 3. Placas de textura (para compositing)

Sirven como texturas en After Effects, Blender o DaVinci. Van en cuadrado 1:1, vistas desde arriba y con luz plana:

```
seamless tileable top-down texture of [molten gold | Uyuni salt crust hexagons |
Caribbean water caustics | Vinicunca mineral strata | backlit leaf veins | aguayo
woven textile | basalt with lava cracks | Mitla stepped-fret stone | melted cacao],
flat even lighting, 4k, physically based, no shadows, no text   --ar 1:1 --tile
```

---

## 4. Tarjeta tipográfica y marca

- **Titulares:** Fraunces, o si no Canela o GT Sectra, en peso 400. Las palabras clave van en *cursiva* con un degradado de `#FFE3A3` a `#E0A43A` y a `#9A6414`, de arriba hacia abajo.
- **Rótulos:** Inter 500 en versalitas, con tracking de 0,32 a 0,42 em, en crema al 80 %.
- **Wordmark:** «ORIGEN» en Fraunces 600, tracking de 0,2 em y el mismo degradado dorado.
- **Marca gráfica:** un anillo fino con **55 marcas**, más largas cada 5, y la marca de las 12 encendida. Representa 1 g ÷ 55.

Fraunces e Inter tienen licencia OFL, así que son libres para uso comercial. Están en `render/`.

---

## 5. Reglas de consistencia

1. El arco va **siempre en el mismo sitio**. Si una generación lo mueve o lo inclina, se descarta.
2. Un solo horizonte: nunca dos arcos ni reflejos del arco.
3. El oro es el único color saturado, salvo dentro de los paisajes.
4. Nada de texto generado por la IA. Todo el texto se pone en el montaje.
5. Mismo grano y misma viñeta en todos los planos. Aplícalos en el montaje, no en la generación.
6. Las reglas legales del `PROMPT-MAESTRO.md` (sección 5) valen también para las imágenes: sin lingotes, bóvedas, gráficas ni dinero.
