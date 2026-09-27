# Empezar — sesión 1, paso a paso

Objetivo de esta sesión: **dejar la infraestructura funcionando y los workflows
guardados en el repo.** No intentes sacar una toma buena hoy. Coste: ~$2–4.

---

## Antes de gastar un dólar (en tu máquina, gratis)

Necesitas tres cosas, en este orden:

1. **Cuenta en Vast.ai** con **$10 de saldo** mínimo → `vast.ai` → Account → API key.
2. **Token de Hugging Face** tipo *read* → `huggingface.co/settings/tokens`.
   Entra a `MiniMaxAI/MiniMax-H3` y **acepta la licencia** desde la web, o la
   descarga fallará con 403.
3. **Clave SSH** subida a Vast → Account → SSH Keys:
   ```bash
   ssh-keygen -t ed25519 -C "video-pipeline"   # si no tienes
   cat ~/.ssh/id_ed25519.pub                   # pégala en Vast
   ```

Después:

```bash
git clone <este-repo> && cd video-pipeline
pip install --upgrade vastai
cp .env.example .env && $EDITOR .env      # VAST_API_KEY y HF_TOKEN
cp prompts/queue.example.json prompts/queue.json
./00_preflight.sh                          # no alquiles hasta que dé 0 pendientes
```

`00_preflight.sh` verifica claves, saldo, CLI, SSH y que **existan ofertas reales**
de RTX PRO 6000 bajo tu presupuesto. Cuesta cero y evita el error clásico: pagar
la GPU mientras depuras una variable mal escrita.

---

## Sesión 1 — infraestructura (~2 h)

```bash
./01_vast_create_pod.sh                    # imprime SSH_HOST y SSH_PORT
. ./.pod
ssh -p $SSH_PORT root@$SSH_HOST 'bash /workspace/02_install_cloud.sh'
```

La instalación tarda 30–45 min (los pesos son ~70 GB). Mientras corre, abre el túnel
en otra terminal — es lo que te da ComfyUI en tu navegador como si fuera local:

```bash
ssh -p $SSH_PORT -L 8188:127.0.0.1:8188 root@$SSH_HOST
# navegador -> http://127.0.0.1:8188
```

### Convertir los workflows (el paso que antes era manual)

Ya no hace falta exportar nada desde el navegador. En el pod:

```bash
ssh -p $SSH_PORT root@$SSH_HOST
. /workspace/venv/bin/activate && cd /workspace

python3 tools/ui2api.py --list-templates          # ver qué plantillas hay
python3 tools/ui2api.py --template "MiniMax H3"  -o prompts/workflows/h3_fl2va_api.json
python3 tools/ui2api.py --template "Wan 2.2 I2V" -o prompts/workflows/wan22_i2v_api.json
```

`ui2api.py` lee `/object_info` del ComfyUI que está corriendo, así que resuelve los
nombres reales de los nodos instalados y no adivina nada. Imprime qué nodo quedó
como `PROMPT`, `NEGATIVE`, `SEED`, `LATENT`, `SAVE`. `steps`, `cfg`, `width` y
`height` no necesitan etiqueta: el runner los localiza por nombre de input.

Si algún rol sale sin asignar, renómbralo en ComfyUI (clic derecho → Title) y repite.

### Probar la cadena con un clip

```bash
python3 03_run_queue.py --queue prompts/queue.json --dry-run   # revisa parámetros
python3 03_run_queue.py --queue prompts/queue.json --out /workspace/outputs
```

### Cerrar y guardar lo importante

```bash
exit
scp -P $SSH_PORT -r root@$SSH_HOST:/workspace/prompts/workflows ./prompts/
./04_collect_and_shutdown.sh
git add prompts/workflows && git commit -m "workflows API de la sesión 1" && git push
```

**Los workflows convertidos son el activo de esta sesión.** Con ellos en el repo, la
sesión 2 arranca en 45 min sin volver a tocar nada.

---

## Sesión 2 — calibrar una toma (~4 h, ~$4)

Un solo plano: el que abra el tráiler.

1. **FLUX.2** hasta tener un still que te guste **de verdad**. Aquí es donde se gana la
   toma; no pases al vídeo con un frame mediocre.
2. **I2V con H3** desde ese still, `Realism People` LoRA a escala 0.8, **8 semillas**
   a 832×480 / 5 s (`seeds: [1,2,3,4,5,6,7,8]` en el job).
3. Eliges **una**. `SeedVR2` a 2K solo sobre esa.
4. **Anota el prompt y la escala de LoRA que funcionaron.** Esa es tu receta.

Sales con una toma terminada y con la receta. Desde la sesión 3 ya es producción.

---

## Errores que van a pasar (y qué hacer)

| Síntoma | Causa | Solución |
|---|---|---|
| `403` al descargar H3 | licencia sin aceptar en HF | acéptala en la web del repo |
| `ui2api` dice "nodos que el servidor no conoce" | custom node sin instalar | ComfyUI Manager → Install Missing Nodes |
| Vídeo recortado o VAE que falla | longitud no alineada | ya resuelto: el runner redondea a 4n+1 |
| OOM en 96 GB | FLUX.2 y H3 cargados a la vez | genera stills y vídeo en pasadas separadas |
| Todo lento y raro | ofertas de A100 | Ampere emula FP8/FP4; usa `GPU_NAME=RTX_PRO_6000_WS` |
| Factura sorpresa | pod olvidado | `AUTO_DESTROY=1` y `MAX_SPEND_USD` siempre puestos |

Regla que ahorra más dinero que cualquier otra: **destruye el pod al terminar, siempre.**
El disco se cobra aunque la instancia esté detenida.
