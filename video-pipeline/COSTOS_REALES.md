# Costos reales — desglose de abajo hacia arriba

Reemplaza las cifras sueltas de `COSTOS.md` y `CALIDAD.md`. Todo sale de
`tools/costo.py`, así que puedes recalcularlo con tus propios números.

**Aviso de honestidad:** los precios están verificados (29-ago-2026). **Los tiempos de
generación son estimados** — no he medido H3 en una RTX PRO 6000 real. Por eso incluyo
un caso base y un caso malo, y por eso lo primero que debes anotar en la sesión 1 es
cuánto tarda de verdad un clip. Con ese dato, `costo.py` deja de ser una estimación.

---

## 1. Precios unitarios (verificados)

| Concepto | Precio | Fuente |
|---|---|---|
| RTX PRO 6000 WS 96 GB en Vast | $0.67/h (uso $0.70 al planificar) | Vast |
| RTX PRO 6000 Server | $0.97/h | Vast |
| RTX 5090 32 GB | $0.31–0.45/h | Vast |
| Disco | $0.10–0.15/GB/mes (uso $0.12) | Vast, definido por host |
| Tráfico | $0–0.02/GB (uso $0.01) | Vast, definido por host |
| API MiniMax H3 | ~$0.08/s | — |
| API Seedance 2.5 | ~$0.23/s | — |
| LoRA propio en fal, t2v | $0.005 × pasos → **$5** por 1.000 pasos | fal |
| LoRA propio en fal, i2v / first-last | $0.01 × pasos → **$10** | fal |
| LoRA propio en fal, ref2va | $0.015 × pasos → **$15** | fal |
| ComfyUI, Wan2GP, SeedVR2, pesos H3/Wan/FLUX.2, LoRA Realism People, DaVinci Resolve | **$0** | — |

**El disco no es gratis mientras el pod existe.** 350 GB a $0.12/GB/mes son $42/mes, o
**$0.058 por hora encendido** — un 8 % sobre el precio de la GPU. Y sigue corriendo con
la instancia detenida: solo destruirla lo para.

---

## 2. Costo por unidad de trabajo

Con GPU a $0.70/h + disco: **$0.758 por hora encendido**.

| | Base | Caso malo |
|---|---|---|
| Arranque en frío (45 min + 75 GB de pesos) | **$1.32** | $1.52 |
| Clip de 5 s @ 832×480, 30 pasos | **$0.044** | $0.103 |
| Imagen (still FLUX.2) | **$0.008** | $0.010 |
| Upscale a 2K (SeedVR2) | **$0.038** | $0.051 |
| Sesión de 4 h (margen ~56 clips) | **$4.35** | $5.63 |

El caso malo asume GPU a $0.97/h y clips de 6 min en vez de 3,5.

Lo que esto significa en la práctica: **un intento fallido te cuesta 4 centavos.** Ese es
el número que hace viable tu forma de trabajar.

---

## 3. Un tráiler completo, de punta a punta

12 planos, 6 stills por plano hasta dar con el frame bueno, 8 semillas de vídeo por
plano, upscale solo del ganador:

| | Base | Caso malo |
|---|---|---|
| 72 stills + 96 clips + 12 upscales | | |
| Horas de GPU | 6.9 h | 16.2 h |
| Sesiones necesarias | 3 | 5 |
| **TOTAL** | **$9.20** | **$24.25** |
| Por plano final | $0.77 | $2.02 |
| Los mismos intentos por API de H3 | $38 | $58 |
| Los mismos intentos por Seedance 2.5 | $110 | $166 |

**Presupuesta $25 para tu primer tráiler y $10–12 para los siguientes.** El primero cae
en el caso malo por la curva de aprendizaje, no por los precios.

---

## 4. Presupuesto mensual

| Escenario | Costo/mes |
|---|---|
| **Mes 1** — aprender, 6 sesiones, 1 tráiler | **$25–30** |
| **Ritmo normal** — 3 sesiones/mes | **$13** |
| **Producción** — 1 tráiler/mes + material suelto | **$20–25** |
| Un LoRA de personaje propio (fal, i2v, 1.000 pasos) | +$10, una vez |
| Toma héroe por API de Seedance (4 s) | +$0.92 cada una |

Compara: un mes de tu operación completa cuesta menos que **una sola** toma de 5 s
generada 12 veces en Seedance.

---

## 5. Costos que no son dinero

Los que de verdad duelen y no aparecen en la factura:

| | |
|---|---|
| Arranque en frío | 45 min por sesión en que no produces nada. Se amortiza haciendo sesiones largas, no muchas cortas |
| Tu tiempo de revisión | 96 clips son ~2 h solo de mirarlos. Es el cuello de botella real, no la GPU |
| Curva de aprendizaje | Las primeras 2–3 sesiones producen poco. Presupuéstalas como formación |
| Montaje y grade | 2–4 h por tráiler en DaVinci. Gratis en dinero, no en horas |

---

## 6. Riesgos de sobrecosto y su tope

| Riesgo | Costo si pasa | Mitigación (ya implementada) |
|---|---|---|
| Pod olvidado un fin de semana | ~$35 | `AUTO_DESTROY=1` + `watchdog_spend.sh` |
| Pod olvidado un mes (solo disco) | ~$42 | destruir, nunca detener |
| Instalación fallida y repetida | $1.32 cada intento | `02_install_cloud.sh` es idempotente |
| Elegir A100 por parecer barata | 2–3× más lenta por clip | `GPU_NAME=RTX_PRO_6000_WS` por defecto |
| Host malo que se cae a media cola | pierdes la sesión | filtros `reliability>0.99` + `verified=true` |
| Descubrir a los 30 min que falta el token | $0.40 y 30 min | `00_preflight.sh` |

Tope duro: `MAX_SPEND_USD` en `.env`. El watchdog rescata las salidas y destruye la
instancia al superarlo. Ponlo en **$15** para tus primeras sesiones.

---

## 7. Recalcula con tus datos

```bash
python3 tools/costo.py                                  # base
python3 tools/costo.py --dph 0.95 --min-clip 6          # caso malo
python3 tools/costo.py --trailer 15 --intentos 10       # tu tráiler real
```

Después de la sesión 1, sustituye `--min-clip` por el tiempo medido y tendrás el
presupuesto verdadero de tu operación.

## Fuentes

- [RTX PRO 6000 WS en Vast](https://vast.ai/pricing/gpu/RTX-PRO-6000-WS) ·
  [RTX 5090](https://vast.ai/pricing/gpu/RTX-5090) ·
  [estructura de cobro de Vast](https://docs.vast.ai/documentation/instances/pricing)
- [Entrenadores LoRA de H3 en fal](https://fal.ai/models/minimax/h3/i2v/trainer)
