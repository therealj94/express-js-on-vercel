# Calidad: artesanía de prompts, LoRAs y límites reales

## El orden de importancia

Lo que más mueve la aguja, de mayor a menor:

1. **El still de partida.** Cuando una toma sale mal, casi siempre el problema
   estaba en el fotograma 1, no en el muestreador.
2. **La corrección de color.** Sin grade, un clip se ve "de IA" aunque el modelo
   sea perfecto. Aporta más que subir de 30 a 50 pasos.
3. **La consistencia entre planos.** Doce tomas con el mismo look leen como una
   pieza; doce tomas excelentes con looks distintos no.
4. **Los LoRAs de realismo.** 125 MB que valen más que semanas de prompts.
5. El modelo. En último lugar, y con diferencia.

## Anatomía de un prompt que funciona

Los modelos pesan más el principio, así que el sujeto va primero y la
información técnica después:

```
[sujeto y acción] , [encuadre] , [óptica] , [luz] , [paleta] , [textura] , [curva]
```

`tools/look.py` compone esto automáticamente. Lo que hay que cuidar al escribir
la parte del plano:

- **Un solo movimiento de cámara.** Dos instrucciones simultáneas producen
  morphing. Por eso `look.py` separa la óptica (que no lleva movimiento) del
  vocabulario `MOVES`.
- **El prompt de vídeo no repite la composición.** Ya está resuelta en la imagen.
  Describe únicamente qué se mueve y a qué velocidad.
- **Describir el movimiento a su velocidad natural.** "Slow", "steady",
  "constant speed" funcionan; adjetivos dramáticos producen saltos.
- **La textura de piel es el delator número uno.** El negativo base incluye
  `plastic skin, waxy face, smoothed pores` precisamente por eso.

## LoRAs

**`Realism People` (fal, abierto, 125 MB)** — ya se instala con el pod. Empuja a
H3 hacia piel con poros, ojos coherentes, microexpresiones y luz de cine.
Escala 1.0 es la fuerza prevista; 0.6-0.8 para un toque ligero. No requiere
entrenamiento.

**`prompt-rewriter` (fal)** — sustituto abierto del módulo `Context-IR` de
MiniMax, que no es público.

**LoRA propio de personaje** — para que el protagonista sea el mismo en todos los
planos. Se entrena en fal, facturado por paso con suelo de 100 pasos:

| Entrenador | Precio | 1.000 pasos |
|---|---|---|
| t2v | $0.005/paso | $5 |
| i2v / first-last | $0.01/paso | $10 |
| ref2va | $0.015/paso | $15 |

Consejos de fal que importan: revisar cada clip a mano antes de entrenar (en su
ejemplo descartaron 77 de 253); limitar cuántos clips aporta una misma sesión,
porque si no el modelo aprende *esa sesión* en vez del estilo; y hacer una tirada
barata de 1.000 pasos antes de barrer configuraciones.

**No recomendar un LoRA propio hasta que la cadena base dé tomas que gusten.**
Antes de eso se paga por enseñarle algo que aún no está decidido.

## Material propio

H3 acepta como referencia hasta **9 imágenes, 3 vídeos y 3 audios** (Ref2VA). Se
suben arrastrándolos al nodo `LoadImage` desde el navegador.

Es el salto más grande entre "vídeo genérico de IA" y "vídeo de lo suyo": el
producto real, el logo real, la persona real como fotograma de partida.

## Planos largos sin deriva

Encadenar el último fotograma al siguiente segmento acumula error: al cuarto
segmento el color se ha lavado y las caras se han ablandado. Anclar los dos
extremos con FL2VA no puede derivar, porque el destino ya está fijado. Cuatro
fotogramas clave dan tres segmentos ≈ 15 s continuos.

Aun así, para tráiler conviene **cortar más**: los planos de tráiler duran 2-4
segundos, y doce planos cortos leen mejor que cuatro largos mediocres.

## Dónde Seedance 2.5 sigue ganando

| Ventaja | Qué hacer |
|---|---|
| Tomas de 30 s y hasta ~3 min | Cortar más; H3 llega a 15 s |
| 4K nativo | 768p + SeedVR2 a 2K/4K |
| Coherencia en tomas largas | Claves anclados + LoRA de personaje |
| Edición interactiva | Montaje en DaVinci |

En un plano de 3 segundos, tras upscale y grade, la diferencia es marginal. Y
guardar la API de Seedance para la toma héroe que no salga en local es asignar
bien el presupuesto, no rendirse.

## Estado de los modelos (agosto 2026)

- **MiniMax H3**: pesos abiertos desde el 3-ago-2026. #2 en el Video Arena de
  image-to-video, por encima de Seedance 2.0. La licencia comunitaria **excluye
  el despliegue local con pesos en US/EU/UK/KR**, y organizaciones con ingresos
  ≥ US$20M necesitan autorización previa — verificar la jurisdicción de Orden
  Global antes de uso comercial. Los repos de HF **no** están gated.
- **Wan 2.2**: última Wan con pesos (Apache 2.0). De 2.5 en adelante son API.
- **FLUX.2 [dev]**: líder en fotorrealismo abierto; ~32 GB en FP8.
- **Qwen-Image**: mejor cuando hace falta **texto legible** dentro de la imagen.
- **Seedance 2.5**: cerrado, ~$0.23/s.

Estos datos caducan rápido. Verificarlos antes de recomendar un cambio de modelo.
