---
name: video-trailer
description: Pipeline completo para generar vídeo e imágenes de calidad de tráiler con modelos de pesos abiertos (MiniMax H3, Wan 2.2, FLUX.2) alquilando GPU en Vast.ai. Úsalo SIEMPRE que José hable de generar vídeo o imágenes con IA, tráilers, clips, planos, storyboards, ComfyUI, alquilar GPU, Vast.ai, RunPod, MiniMax, Hailuo, Wan, FLUX, Seedance, LoRA de vídeo, o cuando pida "montar un pod", "encender la máquina", "hacer un vídeo", "sacar unas imágenes", o pregunte por costes de generar vídeo — aunque no nombre ninguna herramienta. Cubre la planificación previa (que es gratis y no requiere GPU), el arranque y destrucción del pod, y el acabado.
---

# Tráilers con modelos abiertos

Herramientas en `video-pipeline/` del repo `express-js-on-vercel`, rama
`claude/minimax-wan-video-pipeline-vkugaz`. Documentación larga en
`video-pipeline/VEREDICTO.md`, `CALIDAD.md`, `COSTOS_REALES.md`.

## La regla que ordena todo el trabajo

**Planificar es gratis; generar cuesta por hora.** Todo lo que pueda decidirse con
la GPU apagada se decide antes: guion, planos, prompts, look, duraciones. La GPU
se enciende cuando ya no queda nada que pensar, y se destruye en cuanto se
descargan los resultados.

Iterar prompts sobre una GPU encendida es la forma más cara de trabajar, porque
se paga por hora mientras se piensa.

## Fase 1 — Antes de encender nada (gratis)

Esto es donde se gana o se pierde la calidad. José describe los planos en
lenguaje normal; el trabajo aquí es convertirlos en un `shotlist.json` y
enseñárselo para que corrija.

Cada plano necesita dos descripciones **separadas**, y esa separación importa:

- `still`  — **qué se ve**: sujeto, encuadre, entorno. Se usa para generar la imagen.
- `motion` — **qué se mueve**: la acción, no la composición. Se usa para animarla.
- `move`   — **un solo** movimiento de cámara del vocabulario de `tools/look.py`.

Repetir la composición en el prompt de movimiento, o pedir dos movimientos a la
vez, produce morphing y deriva. El modelo de vídeo no necesita que le repitan lo
que ya está resuelto en la imagen.

```bash
python3 tools/look.py list                      # looks y movimientos disponibles
python3 tools/look.py preview -s shotlist.json -l apple_human
python3 tools/look.py apply   -s shotlist.json -l apple_human -o shotlist_look.json
```

`look.py` aplica la **biblia de estilo**: óptica, luz, paleta, textura y curva
idénticas en todos los planos. Es lo que hace que doce tomas parezcan rodadas el
mismo día — y es la diferencia real entre un montón de clips y un tráiler.

Antes de encender, enseñar a José los prompts compuestos. Corregirlos aquí
cuesta cero.

## Fase 2 — Encender

```bash
cd video-pipeline
export VAST_API_KEY=...            # nunca commitear
python3 tools/vast_api.py search --gpu "RTX PRO 6000 WS" --min-ram 90 --max-dph 1.30
python3 tools/vast_api.py create --offer <id> --disk 300 \
  --onstart cloud/onstart.sh --selftest cloud/selftest.py \
  --env HF_TOKEN=... --env UI_USER=jose --env UI_PASS=<clave> --env MODELS=h3,flux
```

**Antes de nada más, arrancar el guardián** — un pod olvidado factura solo:

```bash
HORAS=8 PISO=15 nohup setsid ./guardian.sh > guardian.log 2>&1 < /dev/null &
```

El pod se instala y se prueba solo. El veredicto (`AUTOPRUEBA: OK` / `FALLO`)
sale en el log:

```bash
python3 tools/vast_api.py logs <id>
```

Detalles de hosts, precios y los fallos silenciosos de la API en
[`references/vast.md`](references/vast.md). **Leerlo antes de crear una
instancia**: cuatro de sus seis apartados documentan errores que la API acepta
sin quejarse y que cuestan una hora cada uno.

## Fase 3 — Stills primero, movimiento después

Un I2V que parte de un still bueno gana **siempre** a un texto-a-vídeo, porque la
composición y la luz dejan de depender del muestreador. Además cada intento de
imagen cuesta ~5 veces menos que uno de vídeo, así que explorar en imágenes es
lo que hace viable equivocarse muchas veces.

```bash
python3 tools/shotlist.py stills -s shotlist_look.json -o prompts/q_stills.json
python3 03_run_queue.py --queue prompts/q_stills.json --out /workspace/outputs
python3 tools/shotlist.py sheet  -s shotlist_look.json --out /workspace/outputs
```

La hoja de contactos es un JPG por plano con las opciones numeradas. José
contesta *"plano 1 la 3, plano 2 la 5"* desde el móvil; eso va al campo `pick`.

```bash
python3 tools/shotlist.py video -s shotlist_look.json -o prompts/q_video.json
python3 03_run_queue.py --queue prompts/q_video.json --out /workspace/outputs
```

Explorar siempre a 832×480 y 5 s. Solo la toma ganadora sube de resolución.

## Fase 4 — Elegir sin mirarlo todo

El cuello de botella real no es la GPU, son las horas de revisar candidatos.

```bash
python3 tools/post.py qc /workspace/outputs --prefix 01_apertura
python3 tools/post.py contact /workspace/outputs --prefix 01_apertura
```

`qc` ordena los clips por estabilidad temporal y marca los que superan 0.9 de
parpadeo, que suele significar morphing. `contact` monta un mosaico en vídeo de
las semillas de un plano para verlas a la vez.

## Fase 5 — Planos largos

Encadenar el último fotograma de un segmento al siguiente funciona hasta el
tercero; a partir de ahí el color se lava y las caras se ablandan. Para tomas de
15-30 s se generan los fotogramas clave **antes** y cada segmento va de un clave
al siguiente con FL2VA, con los dos extremos fijos: así el error no se acumula.

```bash
python3 tools/extend.py chain  -s shotlist.json --shot 01 --segment 2
python3 tools/extend.py stitch -s shotlist.json --shot 01 --crossfade 0.25
```

## Fase 6 — Acabado

Un clip recién salido del modelo no parece cine aunque la generación sea
perfecta: le falta encuadre, curva de color, grano y fluidez de obturador.

```bash
python3 tools/post.py finish clip.mp4 -o final/01.mp4 --look apple_human
```

Recorte 2.39:1 (que además esconde los bordes, donde el modelo falla más), curva
por look, grano fino y 24→48 fps. **Saltarse el grade es el error más caro**: sin
corrección de color un clip se ve "de IA" aunque el modelo sea impecable, y
aporta más que subir de 30 a 50 pasos de muestreo.

## Fase 7 — Destruir

```bash
./04_collect_and_shutdown.sh          # descarga, verifica el manifiesto, destruye
python3 tools/vast_api.py destroy <id>
python3 tools/vast_api.py status      # confirmar que no queda nada
```

**Detener no para el cobro del disco; solo destruir lo hace.** Mantener 300 GB
entre sesiones cuesta ~$36/mes contra ~$1 de volver a descargar. La regla es
destruir siempre, y por eso el instalador es idempotente.

Confirmar la destrucción con `status`, nunca de memoria.

## Costes de referencia (agosto 2026)

| | |
|---|---|
| RTX PRO 6000 WS/Max-Q 96 GB | ~$1.10-1.20/h — la opción de calidad, BF16 sin cuantizar |
| RTX 5090 32 GB | ~$0.40/h — INT8; se nota en piel y pelo |
| Clip de 5 s | ~$0.04 · imagen ~$0.01 · upscale ~$0.04 |
| Tráiler de 12 planos | ~$9 base, ~$25 el primero |

`python3 tools/costo.py` recalcula todo con los tiempos medidos. Los tiempos por
defecto son estimaciones hasta que se midan en una sesión real.

## Qué decide José y qué no

Decide él: qué planos, qué still de cada plano, qué toma de cada tanda, y cuándo
gastar en un LoRA propio. Todo lo demás — elegir host, arrancar, convertir
workflows, colas, QC, acabado, destruir — se hace sin molestarle.

Cuando algo falle, decirlo con el dato concreto (qué línea del log, qué coste) en
vez de suavizarlo. Ha pagado hosts rotos y agradece el diagnóstico directo.

## Antes de encender: dos cosas que faltaron la primera vez

1. **Los workflows deben estar ya en `prompts/workflows/` en formato API.** Sin
   eso José acaba montando nodos a mano en un iPad, que es exactamente lo que
   este pipeline existe para evitar. Si no están, construirlos con el esquema de
   nodos que la autoprueba vuelca al log, y no encender hasta tenerlos.
2. **Disco: 400 GB si la GPU tiene 96 GB** (BF16 pesa ~110 GB y con FLUX.2 no
   cabe en 300).

El registro completo de lo que falló y por qué está en
`video-pipeline/POSTMORTEM.md`. Su conclusión gobierna cómo trabajar aquí:
**verificar el efecto, no la llamada** — cinco de los ocho fallos fueron entradas
mal formadas que la API aceptó sin quejarse.

## Referencias

- [`references/vast.md`](references/vast.md) — API de Vast, selección de host y los
  fallos silenciosos. Leer antes de crear instancias.
- [`references/calidad.md`](references/calidad.md) — artesanía de prompts, LoRAs,
  referencias propias, y dónde Seedance sigue ganando. Leer al planificar planos.

## Sacar los resultados del pod

Por defecto se descargan desde ComfyUI en el navegador. Si hay bucket
configurado (`RCLONE_CONF_B64` + `RCLONE_REMOTE`), el pod sube
`/workspace/outputs` cada minuto y los clips pasan a ser alcanzables por nombre
de dominio — lo que permite correr el QC y el acabado sobre ellos sin que José
mueva un dedo, y los salva si la instancia muere de golpe.

Guía de alta en `video-pipeline/ALMACENAMIENTO.md`. Proponerla solo con la GPU
apagada y después de una sesión que ya haya funcionado.
