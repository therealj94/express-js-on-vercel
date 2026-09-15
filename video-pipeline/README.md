# Pipeline de video generativo — MiniMax H3 + Wan 2.2 (nube y local)

Objetivo: generar clips tipo Seedance 2.5, en Vast.ai y en PC local.

> **Empieza por [`TU_PARTE.md`](./TU_PARTE.md)** — lo único que tienes que hacer tú.
> Sin terminal (iPad/navegador): [`SIN_TERMINAL.md`](./SIN_TERMINAL.md).
> [`EMPEZAR.md`](./EMPEZAR.md) es la sesión 1 con todo el detalle.
> [`VEREDICTO.md`](./VEREDICTO.md) tiene la recomendación final y manda sobre este
> documento donde haya contradicción. [`CALIDAD.md`](./CALIDAD.md) para tráilers,
> [`COSTOS_REALES.md`](./COSTOS_REALES.md) para el presupuesto (`tools/costo.py` lo recalcula).

---

## 0. Realidad del terreno (agosto 2026) — leer antes de gastar dinero

| Modelo | Pesos abiertos | Notas |
|---|---|---|
| **MiniMax H3 (Hailuo 3.0)** | ✅ 3-ago-2026, `MiniMaxAI/MiniMax-H3` y `Comfy-Org/MiniMax-H3` | 33B denso, omni-modal, audio nativo sincronizado, 4–15 s, 768p nativo. **#2 en el Video Arena de image-to-video**, por encima de Seedance 2.0. Licencia comunitaria **excluye despliegue local en US / EU / UK / KR**. Los módulos `Context-IR` y `Regenerate-2K` no son públicos, pero hay sustitutos abiertos: LoRA `prompt-rewriter` y SeedVR2. |
| **Wan 2.2** | ✅ Apache 2.0 (`Wan-AI/Wan2.2-*`) | Última Wan con pesos. 2.5/2.6/2.7/3.0 son **API-only**. Es la mejor base para LoRAs y control fino. |
| **Seedance 2.5** | ❌ cerrado | ~60B, 4K, hasta 30 s, 50 referencias. No se replica localmente. Es el techo, no el objetivo. |

**Lo más cercano a Seedance 2.5 en local hoy** = H3 (FL2VA/Ref2VA) para la toma base con audio → Wan 2.2 para variantes controladas y LoRA de personaje/estilo → upscale y estabilización propios (SeedVR2 / Topaz) → ensamble. Esa cadena es la que implementa este repo.

### Corrección al plan original: la A100 80 GB no es la mejor compra

La A100 es Ampere: **no tiene FP8 ni FP4 nativos**. Los checkpoints de H3 se distribuyen en INT8 / FP8 / NVFP4, y en A100 se emulan → pagas 80 GB que no necesitas y pierdes velocidad.

Orden de preferencia real en Vast.ai para este pipeline:

1. **RTX PRO 6000 WS 96 GB (~$0.67/h)** — el default. BF16 sin cuantizar para H3, y FLUX.2 FP8 en la misma sesión. Es la opción de calidad.
2. **RTX 5090 32 GB (~$0.35/h)** — mejor $/clip para barridos de semillas y volumen. H3 en INT8/FP8: se nota en piel y pelo.
3. **H100 80 GB** — rápida y con FP8, pero cara por hora.
4. **A100 80 GB** — solo si el precio/hora es < 60 % de la H100. Los scripts la soportan igual (`GPU_NAME` es configurable).

---

## 1. Crear el pod en Vast.ai filtrando hosts confiables

```bash
pip install --upgrade vastai
vastai set api-key TU_API_KEY

cd video-pipeline
cp .env.example .env   # edita GPU_NAME, MAX_DPH, HF_TOKEN...
./01_vast_create_pod.sh
```

Filtros de confiabilidad que aplica el script (lo importante):

- `reliability > 0.99` — histórico de uptime del host.
- `verified=true` — datacenter auditado por Vast, no máquina doméstica.
- `inet_down > 500` y `inet_up > 200` — bajar 60 GB de pesos y subir clips.
- `disk_space > 300` — H3 BF16 + Wan 2.2 + salidas llenan rápido.
- `cuda_vers >= 12.8` — requisito de Blackwell.
- `duration > 3` — el host se compromete a ≥ 3 días.
- Orden por `dph_total` ascendente, y se descarta cualquier oferta interrumpible salvo que fijes `INTERRUPTIBLE=1`.

Ver [`01_vast_create_pod.sh`](./01_vast_create_pod.sh). Antes, `./00_preflight.sh` verifica claves, saldo y ofertas disponibles sin gastar nada.


## 2. Instalación en el pod

`02_install_cloud.sh` se ejecuta dentro del pod (el script de creación lo sube por SSH):
drivers/CUDA verificados, Python 3.11, PyTorch cu128, ComfyUI + Manager, Wan2GP, y descarga de pesos de H3 y Wan 2.2 con `hf` (huggingface_hub) en paralelo.

> En imagen de Vast los drivers NVIDIA y el toolkit CUDA **ya vienen instalados**. Instalar drivers dentro del contenedor rompe el pod. El script solo valida `nvidia-smi` y la versión de CUDA.

## 3. Cola de prompts en JSON

[`prompts/queue.example.json`](./prompts/queue.example.json) define N clips. `03_run_queue.py` los envía uno a uno a la API de ComfyUI (`POST /prompt`, WebSocket para progreso), reintenta los fallidos, y escribe `outputs/manifest.json` con estado y rutas.

```bash
python3 03_run_queue.py --queue prompts/queue.json --out /workspace/outputs
```

## 4. Descargar y apagar solo

```bash
./04_collect_and_shutdown.sh          # rclone/scp + vastai destroy instance
```
Se puede encadenar: `python3 03_run_queue.py ... && ./04_collect_and_shutdown.sh`.
Incluye watchdog de gasto: si supera `MAX_SPEND_USD`, destruye la instancia aunque la cola no haya terminado.

## 5. Versión local (NVIDIA ≥ 12 GB)

[`local/install_local.sh`](./local/install_local.sh) — Wan2GP como motor principal (mejor gestión de VRAM que ComfyUI puro: H3 en ~5–6 GB para 5 s y ~8–9 GB para 15 s a 832×480 con offload) más ComfyUI para los workflows de cola.

Referencia práctica de VRAM para H3:

| VRAM | Resultado |
|---|---|
| 6 GB | funciona degradado, 10–15 min/clip |
| 12–16 GB | limpio, 15 s a 832×480, INT8/GGUF |
| 24 GB | 768p cómodo + entrenamiento de LoRA |
| 32 GB+ | 15 s a resolución alta, objetivo real del modelo |

La misma cola JSON y el mismo `03_run_queue.py` funcionan en local apuntando a `http://127.0.0.1:8188`.

---

## Recomendación de flujo (lo que yo haría)

1. **Prototipa en API** (H3 ~US$0.08/s, Seedance 2.5 ~US$0.23/s) hasta cerrar guion y prompts. Iterar en GPU rentada mientras aún no sabes qué quieres es la forma más cara de trabajar.
2. **Producción en local/Vast** con H3 pesos abiertos una vez la cola está definida.
3. **LoRAs de H3**: `Realism People` (125 MB, piel y microexpresiones) y `prompt-rewriter`. Wan 2.2 + LoRA propio para consistencia de personaje entre tomas.
4. **Upscale y audio** fuera del modelo: SeedVR2 para 2K, y mezcla en DaVinci. El `Regenerate-2K` de MiniMax no es público.
5. **Revisa la licencia de H3 según tu jurisdicción** antes de uso comercial: el despliegue local con pesos está excluido en US/EU/UK/KR, y organizaciones con ingresos ≥ US$20M requieren autorización previa.

## Fuentes

- [MiniMax H3 open weights en ComfyUI (comfyui-wiki)](https://comfyui-wiki.com/en/news/2026-08-03-minimax-h3-open-weights-comfyui)
- [Restricciones de licencia de H3](https://explainx.ai/blog/minimax-h3-open-video-model-hailuo-july-2026)
- [Wan2GP — deepbeepmeep](https://github.com/deepbeepmeep/Wan2GP)
- [Estado de pesos de Wan 2.5+](https://www.atlascloud.ai/blog/tips/is-wan-3.0-open-source)
- [Comparativa Seedance 2.5 vs H3 vs Wan](https://www.mindstudio.ai/blog/seedance-2-5-vs-wan-3-flux-3-miniax-h3)
