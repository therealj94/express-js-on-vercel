# Workflows en formato API

Estos JSON **no se versionan aquí** porque dependen de los nombres exactos de los
ficheros de pesos que descargaste. Se generan una vez, dentro del pod o en local:

1. ComfyUI → menú **Workflow → Browse Templates** → plantillas oficiales:
   - `MiniMax H3 FL2VA` (texto + primer/último frame, audio nativo)
   - `MiniMax H3 Ref2VA` (referencias de imagen / vídeo / audio)
   - `Wan 2.2 14B I2V` y `Wan 2.2 5B TI2V`
2. Genera **un** clip a mano y ajusta calidad (steps, cfg, shift, resolución).
3. Renombra los nodos clave (clic derecho → *Title*) exactamente así:
   `PROMPT`, `NEGATIVE`, `SEED`, `STEPS`, `CFG`, `LATENT`, `IMAGE`, `SAVE`.
   `03_run_queue.py` inyecta los valores de la cola buscando esos títulos.
4. Settings → activa **Enable dev mode options** → **Export (API Format)**.
5. Guarda como `prompts/workflows/h3_fl2va_api.json`, `wan22_i2v_api.json`, etc.

Comprobación rápida antes de lanzar la cola completa:

```bash
python3 03_run_queue.py --queue prompts/queue.json --dry-run   # revisa parámetros
```
