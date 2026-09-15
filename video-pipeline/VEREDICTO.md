# Veredicto final — máximo realismo para tráilers, alquilando

Investigación actualizada a **29-ago-2026**. Este documento manda sobre los anteriores
donde haya contradicción.

---

## 1. Lo que cambió respecto a lo que te dije antes

Dos hallazgos que reescriben el plan:

**a) MiniMax H3 abierto no es "casi frontera", es frontera.** En el Video Arena de
Artificial Analysis (votos ciegos, no marketing), image-to-video sin audio:

| # | Modelo | Elo |
|---|---|---|
| 1 | Gemini Omni Flash | 1365 |
| **2** | **MiniMax H3** | **1347** |
| 3 | Dreamina Seedance 2.0 720p | 1337 |
| 4 | grok-imagine-video-1.5 | 1329 |

Con audio, el líder es **H3 Max post-entrenado por fal (1200)**, por encima de Seedance
2.0 (1189) y del H3 base (1185). El modelo que puedes descargar y correr tú está
empatado con lo mejor del mercado en I2V. La brecha con Seedance **no está en el modelo**.

**b) La brecha cerrada.** Dije que `Context-IR` (reescritura de prompt) no era público y
que el realismo dependía del modelo base. Ambas cosas ya no son ciertas:

- **`Realism People` LoRA (fal)** — 125 MB, pesos abiertos, sirve para t2v/i2v/ref2v.
  Piel con textura, ojos coherentes, microexpresiones, luz de cine, cámara en mano sutil.
  Escala 1.0 es la fuerza prevista; 0.6–0.8 para un toque ligero.
- **`prompt-rewriter` LoRA** — sustituto abierto del Context-IR cerrado.

Son la mejora de realismo más barata que existe: 125 MB contra semanas de prompt
engineering. Ya están en `02_install_cloud.sh`.

---

## 2. El veredicto

**Alquila en Vast.ai una RTX PRO 6000 WS de 96 GB a ~$0.67/h. Destruye siempre.**

Por qué esa y no otra:

| Opción | $/h | Veredicto |
|---|---|---|
| **Vast RTX PRO 6000 WS 96 GB** | **$0.67** | **Esta.** BF16 sin cuantizar para H3 *y* FLUX.2 FP8 en la misma sesión |
| RunPod RTX PRO 6000 | $1.99 | 3× el precio. Su volumen de red ($0.07/GB/mes) no compensa |
| Vast RTX 5090 32 GB | $0.35 | H3 en INT8. Se nota en piel y pelo. Solo para barridos de semillas |
| Comprar cualquier cosa | — | No, hasta Q4-2026 mínimo (crisis GDDR7) |

Sobre el arranque en frío: mantener 350 GB de disco entre sesiones cuesta $35–52/mes en
Vast, más que todo tu compute. Volver a bajar los pesos son ~$1.20 por sesión. Si te
molesta la espera, un bucket Backblaze B2 (~$1.20/mes por 200 GB, egreso gratis hasta 3×)
te los sirve más rápido que Hugging Face. Nunca un volumen persistente.

---

## 3. El stack completo, en orden

```
STILL       FLUX.2 [dev] FP8 (~32 GB)      líder en fotorrealismo abierto
             ↓                              composición, luz, encuadre fijados por ti
MOVIMIENTO  H3 BF16 + Realism People LoRA  I2V/Ref2VA: 9 img + 3 vídeo + 3 audio ref
             + prompt-rewriter LoRA         (sustituye al Context-IR cerrado)
             ↓
SELECCIÓN   8 semillas a 832×480 / 5 s     ~$0.03 por intento, eliges UNA
             ↓
CONSISTENCIA Wan 2.2 + LoRA de personaje   solo si el tráiler repite protagonista
             ↓
UPSCALE     SeedVR2 → 2K/4K                sustituye al Regenerate-2K cerrado
             ↓
FLUIDEZ     RIFE → 48/60 fps               solo si el movimiento lo pide
             ↓
ACABADO     DaVinci Resolve                grade, grano, mezcla. Gratis
```

Para **imágenes de tráiler** (posters, key art, frames promocionales) la cadena se corta
en el paso 1: FLUX.2 para fotorrealismo, Qwen-Image cuando necesites **texto legible**
dentro de la imagen (títulos, logos, carteles), Seedream si buscas look de producto 4K.

---

## 4. Costo de arrancar

| | |
|---|---|
| Sesión de trabajo (4 h + arranque + tráfico) | **~$4** |
| **Primer mes** (6–8 sesiones, curva de aprendizaje) | **$25–30** |
| Meses siguientes (3–4 sesiones) | **$12–16** |
| Un tráiler de 60 s (10–12 planos, ~8 intentos cada uno) | **~$15–20** |
| El mismo tráiler solo por API de Seedance 2.5 | ~$110–140 |
| DaVinci Resolve, ComfyUI, todos los pesos | $0 |

Capex: cero. Riesgo: cero. Si en dos meses no te convence, dejaste de gastar y no tienes
una GPU de $6,000 en el escritorio.

---

## 5. Cómo armarlo — primeras tres sesiones

**Sesión 1 — infraestructura (~2 h, ~$2).** No generes nada bueno todavía.

```bash
pip install --upgrade vastai && vastai set api-key TU_KEY
cd video-pipeline && cp .env.example .env    # GPU_NAME=RTX_PRO_6000_WS ya viene puesto
./01_vast_create_pod.sh
ssh -p PUERTO root@HOST 'bash /workspace/02_install_cloud.sh'
ssh -p PUERTO -L 8188:127.0.0.1:8188 root@HOST     # túnel: ComfyUI en tu navegador
```
Exporta los workflows en formato API (ver `prompts/workflows/README.md`) y **guárdalos en
este repo**. Es lo único que no se puede automatizar y lo que hace reproducible todo lo
demás. Luego `./04_collect_and_shutdown.sh`.

**Sesión 2 — calibrar una sola toma (~4 h, ~$4).** Un plano, el que abra el tráiler.
FLUX.2 hasta tener un still que te guste de verdad; después I2V con 8 semillas; elige
una; SeedVR2. Anota qué prompt y qué escala de LoRA funcionaron. Sales con **una toma
terminada** y con tu receta.

**Sesión 3 en adelante — producción.** Ya con receta, la cola (`seeds: [...]`) genera
candidatos mientras tú revisas los anteriores. Aquí es donde el pipeline se paga solo.

---

## 6. Las tres cosas que más van a limitar tu calidad

No son la GPU ni el modelo:

1. **El still de partida.** Un I2V desde un still excelente supera siempre a un T2V. Si
   la toma sale mal, casi siempre el problema estaba en el frame 1, no en el muestreador.
2. **La duración del plano.** H3 llega a 15 s; Seedance a 30+. En un tráiler eso da igual:
   los planos de tráiler duran 2–4 s. **Tu formato es justo donde la brecha desaparece.**
3. **El grade.** Un clip sin corrección de color se ve "de IA" aunque el modelo sea
   perfecto. Aporta más que subir de 30 a 50 pasos de sampler, y es gratis.

## 7. Lo que sigue siendo cierto

- Licencia de H3: el despliegue local con pesos está excluido en US/EU/UK/KR, y
  organizaciones con ingresos ≥ US$20M requieren autorización previa. Verifica bajo qué
  jurisdicción opera Orden Global antes de uso comercial.
- Wan 2.2 sigue siendo la última Wan con pesos (Apache 2.0). 2.5 en adelante son API.
- Guarda la API de Seedance para la toma héroe que no logres clavar. $1.15 en el plano
  que abre la pieza está bien gastado; $110 en el tráiler entero, no.
