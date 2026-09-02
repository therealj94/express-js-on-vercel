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

---

## Cómo se cablea un imagen-a-vídeo (patrón verificado)

El patrón sale de `wan22-i2v-4step.json` de OpenMontage, que es un i2v en
formato API que ya funciona. Es siempre el mismo y sirve para cualquier modelo:

1. Un nodo **`LoadImage`**, titulado `IMAGE` para que `03_run_queue.py` le
   inyecte la ruta (busca ese título y escribe en `inputs.image`).
2. Su salida 0 entra por **`start_image`** del nodo de imagen-a-vídeo.
3. Ese nodo devuelve el **latente** en una de sus salidas, y ese latente es el
   que come el muestreador — no un `EmptyLatentImage`.

En `WanImageToVideo` queda así:

```json
"98": {"class_type": "WanImageToVideo",
       "inputs": {"start_image": ["97", 0], "vae": ["90", 0],
                  "positive": ["93", 0], "negative": ["89", 0],
                  "width": 640, "height": 640, "length": 81}}
```

`MiniMaxH3ImageToVideo` tiene la misma forma —devuelve el latente en su salida
1— y los pesos `fl2va` son de primer y último fotograma, así que acepta imagen.
**Pero el nombre exacto de la entrada hay que confirmarlo**, y solo lo da un
ComfyUI vivo:

```bash
curl -u USUARIO:CLAVE http://<host>:8188/object_info/MiniMaxH3ImageToVideo
```

Si `start_image` no está entre sus entradas, se renombra. Si no acepta imagen en
absoluto, el respaldo es Wan 2.2 14B fp8 i2v, que cabe de sobra en 49 GB.

**Por qué esto no se descubre generando:** el nodo se llama *ImageToVideo* y
funciona igual de bien sin imagen, en modo texto-a-vídeo. No da ningún error;
simplemente ignora la composición del still y el resultado depende otra vez del
muestreador, que es justo lo que la fase de stills existe para evitar.
