# MiniMax H3 en Vast.ai — lo que funciona

**Escrito el 27-sep-2026, después de 18 instancias alquiladas, ~$49 gastados y
149 clips generados.** No es un plan: es el registro de lo que se probó, lo que
falló y la configuración exacta con la que salieron las dos películas.

Si abres una conversación nueva, este documento y `CLAUDE.md` son lo único que
hace falta leer antes de encender nada.

---

## 0. Resumen de una página

| | |
|---|---|
| **Máquina que funciona** | RTX PRO 6000 WS, **96 GB** de VRAM, 1 GPU |
| **Precio real pagado** | **$0.98 – $1.53/h** (total, disco incluido) |
| **Imagen Docker** | `pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel` |
| **Disco** | **400 GB** (con 350 se pasa apuros; con 300 no cabe) |
| **Puerto a publicar** | **8188** (nginx). ComfyUI va en 9000 y **solo** en localhost |
| **Modelo** | `Comfy-Org/MiniMax-H3`, fichero `..._pruned_fp8_scaled.safetensors` |
| **LoRA** | `fal/MiniMax-H3-Realism-People-LoRA` a **0.8** |
| **Resolución** | **720 × 1280** vertical (fijada en la cola, no en el workflow) |
| **Duración por clip** | 4 s a 24 fps → **97 fotogramas** (regla 4n+1) |
| **Pasos / cfg** | **20** pasos para vídeo, **28** para stills · cfg 5.0 / 3.5 |
| **Tiempo por clip de calidad** | **8–11 min** en la PRO 6000 |
| **Tiempo por clip turbo (4 pasos)** | **93–142 s** |
| **Instalación en frío** | **25–55 min**, ~42 GB de pesos |
| **Entrega** | Hugging Face, repo privado tipo *dataset*. **No hay otra que funcione** |

**Estado hoy:** saldo en Vast **$3.21**, ninguna instancia encendida. Para otra
tanda hay que recargar: con $15 se hace una sesión larga cómoda.

---

## 1. Qué se produjo de verdad

Cinco piezas terminadas más dos películas, todas entregadas y respaldadas en
Hugging Face (`Therealjose54/orden-global-videos`, carpeta `terminadas/`):

| Pieza | Duración |
|---|---|
| `anuncio_1_lallave.mp4` | 74 s |
| `anuncio_2_lamesa.mp4` | 59 s |
| `anuncio_3_undia.mp4` | 66 s |
| `pelicula1_cincuenta_FINAL.mp4` | 50,2 s |
| `pelicula2_ecosistema_FINAL.mp4` | 62,6 s |

Material bruto: **71 clips** para la película 1 y **78** para la 2. De ahí salen
las tomas; se generan varias semillas por plano y se elige.

---

## 2. La máquina

### La que funciona

**RTX PRO 6000 WS, 96 GB.** Es la que generó las dos películas. Las 96 GB
disparan la rama **bf16** del instalador, que es la buena.

```bash
python3 tools/vast_api.py search --gpu RTX_PRO_6000_WS --max-dph 1.30 --min-ram 90
```

Los filtros ya van dentro de `search()` y son los que importan:
`verified=true`, `rentable`, `reliability2 > 0.99`, `inet_down > 500 Mbps`,
`inet_up > 200`, `cuda_max_good >= 12.8`, `duration > 3 días`, `num_gpus = 1`,
ordenado por precio.

### Lo que se pagó, por tarjeta

Precios **observados en el mercado** durante el proyecto (base, sin disco):

| Tarjeta | VRAM | Precio base | Veredicto |
|---|---|---|---|
| **RTX PRO 6000 WS** | 95–97 GB | $0.87 – $1.79/h | **la que usamos.** bf16, sin sustos |
| RTX PRO 6000 Max-Q | 95–97 GB | $0.91 – $1.34/h | equivalente, algo más lenta |
| RTX 6000 Ada | 49 GB | $0.54 – $0.67/h | funciona en fp8. Dos sesiones, sin problemas |
| RTX 5090 | 31 GB | $0.35 – $0.42/h | funciona en **int8**. Barata pero cae en calidad |
| RTX 4090 / A6000 / PRO 5000 | 46–49 GB | $0.38 – $0.73/h | no probadas a fondo |

Con el disco el total sube ~$0.06/h. Las instancias reales costaron entre
**$0.44/h** (5090) y **$1.53/h** (PRO 6000 en hora punta).

### Cómo elige precisión el instalador

`cloud/onstart.sh` mira la VRAM real con `nvidia-smi` y decide solo:

| VRAM medida | Rama | Fichero de pesos |
|---|---|---|
| ≥ 80.000 MB | `bf16` | `minimax_h3_fl2va_pruned_fp8_scaled.safetensors` |
| ≥ 40.000 MB | `fp8` | el mismo |
| menos | `int8` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` |

Comprobado en log: `VRAM 97887 MB -> bf16` y `VRAM 32607 MB -> int8`.

### Los hosts malos

**La fiabilidad publicada no dice nada del estado actual.** Tres máquinas con
`reliability` entre 0.992 y 0.997 fallaron: una con el log congelado 20 min, otra
atascada en `loading` casi 3 h, otra lenta hasta lo inservible.

> **La señal útil: si el log no avanza en 10–12 minutos, cambia de host.**

El guardián ya lo automatiza: si el puerto no abre en 15 min, destruye
(`PLAZO_PUERTO`). Un host con el reenvío roto se comió 80 min y $1.40 antes de
que existiera esa comprobación.

---

## 3. El encendido, paso a paso

### 3.1 Preflight — obligatorio, sin excepción

```bash
export VAST_API_KEY=... HF_TOKEN=... EL_KEY=... 
python3 tools/preflight.py \
    --guion prompts/pelicula1_cincuenta.json \
    --cola  prompts/q_p1_video.json \
    --puerto 8188 --disco 400 --saldo-minimo 10
```

Devuelve **código 1** si hay un solo `PARA` y entonces **no se enciende**. Existe
porque una lista de errores no evita el siguiente: la sesión del 1-sep se perdió
publicando el puerto 9000 cuando nginx escucha en el 8188. Dos números que tenían
que coincidir y que nadie comparaba. $2.25 y una instalación entera.

Lo que comprueba: claves vivas, saldo, **que no haya ya una instancia encendida**,
que el puerto publicado no sea el interno, tamaño del onstart comprimido, que el
guardián exista y sea ejecutable, lint del guion, orientación de la cola,
**longitud ≥ 5 fotogramas**, y disco.

### 3.2 El guardián — ANTES de crear, nunca después

```bash
VAST_API_KEY=$VAST_API_KEY HORAS=8 PISO=12 ./guardian.sh &
sleep 2 && jobs        # verifica que el proceso VIVE
```

Destruye cuando ocurre lo primero de: el pod escribe `TRABAJO COMPLETO`, el saldo
baja del piso, se cumple el plazo, o el puerto no abre en 15 min.

Esto existe porque una vez prometí vigilar un pod, la red de seguridad quedó a
medias por una interrupción y la instancia pasó la noche encendida sin nadie
mirándola. Se salvó de casualidad: el host se atascó y cobró $0.01.

### 3.3 Crear la instancia

```bash
python3 tools/vast_api.py create \
    --offer <ID_DE_LA_OFERTA> \
    --onstart cloud/onstart.sh \
    --selftest cloud/selftest.py \
    --image pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel \
    --disk 400 --port 8188 \
    --job prompts/q_p1_video.json \
    --workflows prompts/workflows \
    --env HF_TOKEN=$HF_TOKEN \
    --env HF_REPO=Therealjose54/orden-global-videos \
    --env UI_PASS=<una_clave> \
    --env ESPERA_MIN=45
```

Con `--job` el pod trabaja **desatendido**: nadie abre ComfyUI. La cola, el
runner (`03_run_queue.py`), `cloud/estudio.py` y los workflows viajan
**comprimidos en variables de entorno**, porque sin SSH no hay forma de copiarlos
después.

### 3.4 Vigilar

```bash
python3 tools/vast_api.py status          # v1 por dentro. NUNCA fiarse del v0
python3 tools/vast_api.py logs <id>
```

Hitos que hay que ver en el log, en este orden:

```
==> VRAM 97887 MB -> bf16
==> pesos descargando en segundo plano
==> disco libre: NN GB
==> TRABAJO: 5 workflows, arrancando cola desatendida
[1/56] 01_pulperia_t1 (intento 1)
    ok en 534s -> ['01_pulperia_t1_00001_.mp4']
    entregado: Therealjose54/orden-global-videos/01_pulperia_t1_00001_.mp4
==> ENTREGA FINAL
==> COLA VACIA. Esperando trabajo nuevo
==> TRABAJO COMPLETO
```

### 3.5 Destruir

```bash
python3 tools/vast_api.py destroy <id>
python3 tools/vast_api.py status          # confirmar, nunca de memoria
```

> **Destruir, no detener.** Detener sigue cobrando el disco: 400 GB a $0.12/GB/mes
> son ~$48/mes corriendo aunque la máquina esté apagada.

---

## 4. Los parámetros que funcionan

### 4.1 El workflow

`prompts/workflows/h3_calidad_api.json` — 15 nodos, formato API. Cadena real:

```
UNETLoader (fp8_scaled)
  └─ LORA_REALISMO  LoraLoaderModelOnly  h3-realism-people, strength 0.8
CLIPLoader   qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors   type: minimax
VAE_VIDEO    minimax_h3_video_vae_fp16.safetensors
VAE_AUDIO    minimax_h3_audio_vae_fp32.safetensors
PROMPT       MiniMaxH3ImageToVideo   ← aquí viven prompt, width, height, length
SEED         RandomNoise
STEPS        BasicScheduler          scheduler: simple, denoise 1.0
             KSamplerSelect          sampler_name: res_multistep
             SamplerCustomAdvanced → VAEDecode + VAEDecodeAudio
CreateVideo  fps 24
SAVE         SaveVideo
```

Para imagen-a-vídeo, `h3_i2v_api.json` añade un `LoadImage` titulado `IMAGE`.

**Cómo inyecta los valores el runner** (`03_run_queue.py`): busca nodos por su
**título en mayúsculas** (`PROMPT`, `NEGATIVE`, `SEED`, `STEPS`, `CFG`, `LATENT`,
`IMAGE`, `SAVE`). Si un título no existe, cae a buscar **el único nodo que declare
ese campo**. Por eso funciona aunque estos workflows no tengan nodo `LATENT`:
`width`, `height` y `length` solo existen en `MiniMaxH3ImageToVideo`.

> **Trampa:** el negativo solo se escribe si hay un nodo titulado `NEGATIVE`. Sin
> esa condición la búsqueda por campo caía en el nodo del prompt y **lo dejaba
> vacío**. El workflow se ejecutaba y generaba ruido, sin decir por qué.

### 4.2 Los números de la cola

De las colas reales que produjeron las películas:

| | Vídeo peli 1 | Vídeo peli 2 | Stills |
|---|---|---|---|
| `width` × `height` | 720 × 1280 | 720 × 1280 | 720 × 1280 |
| `fps` | 24 | 24 | **1** |
| `duration_s` | 4 | 4 | **5** |
| fotogramas resultantes | **97** | 97 | **5** |
| `steps` | **20** | **30** | 28 |
| `cfg` | 5.0 | 5.0 | **3.5** |
| trabajos | 56 | 60 | 101 |

**La regla 4n+1.** H3 trabaja con longitudes 4n+1. El runner las ajusta solo:

```python
raw    = max(1, int(round(job["duration_s"] * job["fps"])))
frames = round(raw / 4) * 4 + 1
```

**Y el mínimo es 5.** H3 **no sabe generar un solo fotograma**: rechaza con
`Value 1 smaller than min of 5`. Un still no es `length=1`; es
`duration_s=5, fps=1` → 5 fotogramas, y se usa el primero. El 1-sep los 101
stills salieron con `length=1` y fallaron uno por uno **después** de pagar la
instalación entera. Hoy el preflight lo para antes de encender.

**Los stills heredan 1280×720 si no se fija nada.** Las piezas son verticales:
hay que poner 720×1280 explícito o se exploran 100 composiciones inservibles.

### 4.3 El prompt

- **Nunca se recorta.** Una tanda salió vacía porque un script cortaba la
  descripción en la primera coma: 45 caracteres de 1.100.
- **Por debajo de 250 caracteres, desconfía.** Descripciones cortas dan
  escenarios vacíos.
- Los prompts que funcionaron describen a la persona por rasgos físicos
  concretos (edad, textura de piel, poros, canas, ropa con desgaste) y cierran
  con la óptica: *"shot on ARRI Alexa 35, Panavision Primo 85mm, T2.0"*.
- Negativo estándar: `plastic skin, waxy face, smoothed pores, extra fingers,
  deformed hands, ...`
- **Pedir la piel por su nombre** —poros, textura seca, crestas de la huella—
  y prohibir la de muñeco fue lo que quitó el rosa de plastilina en el plano
  del dedo.
- **Pedir el encuadre explícito** resuelve ambigüedades: "plano CENITAL" arregló
  un plano de dos teléfonos que de frente devolvía lingotes y discos.

### 4.4 Cuánto tarda de verdad

148 clips con tiempo medido por el runner:

| | |
|---|---|
| Mediana | **284 s** |
| Media | 338 s |
| Turbo 4 pasos, 720×1280 | **93 – 142 s** |
| Calidad 20–30 pasos, PRO 6000 | **510 – 690 s** (8,5 – 11,5 min) |

A $1.20/h, un clip de calidad cuesta **~$0.20**; a $1.53/h, **~$0.28**. Nueve
planos en turbo fueron **14–21 min y ~$0.25** en total.

---

## 5. La entrega — el problema que costó más

Los clips se generan **dentro del pod**. Sacarlos fue lo último en resolverse.

**Lo que NO funciona:**

| Vía | Qué pasa |
|---|---|
| El puerto publicado | Estos hosts mapean en Docker pero **no abren al exterior**. `ERR_CONNECTION_TIMED_OUT` desde móvil e iPad |
| `execute` de Vast | Solo admite `ls`, `du`, `cat`, y solo con la instancia **detenida** |
| El canal del log | Transporta texto, no binarios. `cat` de un mp4 no devuelve el fichero |
| 0x0.st, transfer.sh, file.io, catbox | **Todos rechazan subidas de centro de datos.** Nueve clips salieron con enlaces que parecían válidos y no servían |

**Lo que SÍ funciona: Hugging Face con token de escritura.** Es el mismo canal por
el que bajan los 42 GB de pesos, así que la ida y la vuelta están probadas byte a
byte. Repo **privado**, tipo *dataset*.

Dos capas:
1. **El runner sube cada clip al salir** (`entregar()`). Si la tanda muere en el
   plano 7, los seis anteriores ya están fuera.
2. **Barrido final** al acabar la cola, por si algo se generó fuera de ella.

Y al recuperar, **siempre verificación MD5 de ida y vuelta**. Si no está en HF
verificado, no existe.

---

## 6. Varias tandas con un solo encendido

Una instalación son **40 minutos y ~$1.30**. Apagar al acabar una cola y encender
otra tira eso cada vez.

El pod **no se puede alcanzar desde fuera** (este contenedor solo tiene salida por
80 y 443), pero el pod **sí alcanza Hugging Face**. Así que el trabajo viaja por
ahí:

```bash
python3 tools/encolar.py prompts/q_p2_video.json   # manda la siguiente tanda
python3 tools/encolar.py --estado                  # ¿hay cola pendiente?
python3 tools/encolar.py --fin                     # que termine y se destruya
```

El pod, al vaciar su cola, entra en un bucle que mira
`colas/siguiente.json` cada 45 s durante `ESPERA_MIN` (45 por defecto). La
recoge, **la borra antes de ejecutarla** (si no, la vuelve a encontrar al
terminar y entra en bucle), genera, sube y vuelve a esperar.

**Así se encadenaron 4 tandas con un solo arranque** para las dos películas.

> **Trampa que costó una tanda:** `hf_hub_download` **conserva la ruta del repo**,
> así que la cola caía en `prompts/colas/` y el runner busca los workflows *junto
> a la cola* — en `prompts/colas/workflows/`, que no existe. Se arregla con un
> `os.replace` que la sube un nivel. Ya está corregido.

> **Trampa 2:** el manifiesto del runner **sobrevive entre tandas**. Un trabajo
> con un `id` ya generado se salta en silencio (`ya generado, se omite` — pasó 45
> veces). Si mandas retomas, **renómbralas** (`_t5`, `_t6`…). `encolar.py` ahora
> se niega a mandar una cola con ids ya entregados.

---

## 7. Todo lo que falló, con su causa

### Fallos de la API de Vast

| # | Qué pasó | Causa | Corrección |
|---|---|---|---|
| 1 | La instancia se creó **detenida**: cobra disco y el onstart nunca corre | Falta `"target_state": "running"`. **No da error** | Va siempre en el payload |
| 2 | Puerto nunca mapeado, pod inalcanzable 1 h | `{"-p": "8188:8188"}` se acepta y no mapea nada | **La cadena entera como clave**: `{"-p 8188:8188": "1"}` |
| 3 | Di por muerta una máquina **que seguía facturando** a $0.904/h | `/api/v0/instances/` contesta **200 con lista vacía** en vez de fallar. Vast lo movió a v1 | Siempre **v1** para instancias; bundles y asks siguen en v0 |
| 4 | `invalid_args` sin decir cuál | El onstart pasa de **16.384 caracteres** | Arranque autoextraíble: gzip + base64, se descomprime solo |
| 5 | Logs ilegibles, vigilante ciego | La URL firmada devuelve `AccessDenied` **en el cuerpo con código 200** hasta que el objeto existe | Reintentos hasta que el cuerpo sea real |

### Fallos de instalación

| # | Qué pasó | Causa | Corrección |
|---|---|---|---|
| 6 | Se bajaron **108 GB** de pesos BF16 en una tarjeta de 31 GB | `hf download --include` acepta **un** patrón; varios se leen como nombres de fichero y el filtro se descarta entero | Un flag por patrón. Hoy se usa `aria2c` directo |
| 7 | **ComfyUI expuesto sin contraseña** | La URL de Caddy daba 404 y el camino de respaldo abría en `0.0.0.0` sin auth: **fallaba abierto** | nginx + `openssl passwd -apr1`. Lógica invertida: si la auth no se puede montar, se queda en localhost |
| 8 | LoRA dados por faltantes **estando descargados** | El clasificador mandaba a `diffusion_models` todo lo que no fuera texto o VAE | Clasificar por ruta de origen. Y el botón "Descargar" de ComfyUI baja **al dispositivo del usuario**, no al pod: desde un iPad no hay arreglo |
| 9 | La autoprueba reportó `FALLO` con la instalación perfecta | Eligió la plantilla *first-last-frame*, que pide dos imágenes que no existen en un pod nuevo | Prefiere plantillas sin `LoadImage` |
| 10 | 300 GB con BF16 + FLUX dejaron **12 GB libres** | Insuficiente para trabajar | **400 GB**, y no se baja FLUX: H3 hace imagen fija con `length=5` |
| 11 | Descarga a 15–20 Mbps | El cliente de HF usa **una sola conexión** | `aria2c -x16 -s16`. Y `HF_HUB_DISABLE_XET=1`: Xet revienta con los ficheros grandes de H3 |
| 12 | El clon de ComfyUI fallaba | `descargar_pesos` crea `ComfyUI/models` y `git clone` exige destino vacío | Clonar **antes** de lanzar la descarga |
| 13 | Alarma de error falsa al final de la descarga | La función acababa con el código del test de disco: con disco de sobra devuelve 1 | `return 0` explícito |

### Fallos de generación

| # | Qué pasó | Causa | Corrección |
|---|---|---|---|
| 14 | **101 stills fallaron uno por uno** tras pagar la instalación | `length=1`. H3 exige **mínimo 5** | `duration_s=5, fps=1`. El preflight lo para antes de encender |
| 15 | Clips generando ruido sin explicación | El negativo caía en el nodo del prompt y lo vaciaba | El negativo solo se escribe si hay nodo `NEGATIVE` |
| 16 | Una tanda salió vacía | Un script cortaba el prompt en la primera coma: 45 de 1.100 caracteres | **Los prompts nunca se recortan** |
| 17 | 100 composiciones apaisadas inservibles | Los stills heredan 1280×720 | Fijar 720×1280 en la cola. El preflight comprueba orientación |
| 18 | 45 retomas **ignoradas en silencio** | El manifiesto sobrevive entre tandas | Renombrar las retomas + guardia en `encolar.py` |
| 19 | El pod no encontraba los workflows de la tanda 2 | `hf_hub_download` conserva la ruta `colas/` | `os.replace` para subirla un nivel |

### Fallos de criterio (los que más pesaron)

- **Empezamos por el final.** Se construyó la infraestructura antes de comprobar
  que el modelo produce algo que guste. Lo correcto: primeros $8 en veinte clips,
  responder *"¿esto se parece a lo que quiero?"*, y **solo entonces** automatizar.
  El orden es **resultado → repetibilidad → coste**.
- **Se optimizó la métrica equivocada.** Todo el diseño perseguía $0.04 por clip
  frente a $0.40 de la API. A volumen real eso son decenas de dólares al año. El
  cuello de botella es el tiempo y el criterio de José, no el coste marginal.
- **No automatices lo que todavía no has hecho funcionar a mano.**

---

## 8. Las reglas duras

1. **`preflight.py` antes de cada encendido.** Un solo `PARA` y no se enciende.
2. **El guardián se arranca ANTES de crear la instancia**, y se verifica que el
   proceso vive.
3. **Destruir, no detener.** Y confirmar con `status`, nunca de memoria.
4. **Planificar es gratis; generar cuesta por hora.** Todo lo decidible con la
   GPU apagada se decide antes.
5. **Verificar el efecto, no la llamada.** Cinco de los primeros ocho fallos
   fueron entradas mal formadas que la API aceptó sin quejarse. ¿Se mapeó el
   puerto? ¿Cuántos ficheros bajó? ¿Está la auth activa? Cada "sí" se lee de un
   estado observable.
6. **Si el log no avanza en 10–12 min, cambia de host.**
7. **Lo primero que se hace con una pieza terminada es subirla a Hugging Face.**
   El scratchpad de la sesión es temporal y se ha perdido varias veces. Si no
   está en HF con MD5 verificado, no existe.
8. **Las claves nunca se commitean.** José las pega en el chat; se usan desde
   variables de entorno. Si se pierden al reiniciar la sesión, **están en el
   transcripto**: `grep` antes de pedírselas otra vez.

---

## 9. Detalles del entorno que muerden

- **`ffprobe` no está** en este contenedor, aunque `ffmpeg` sí. Las duraciones se
  miden con `soundfile`, o contando fotogramas con `ffmpeg -f rawvideo`.
- **`drawtext` no está** (ffmpeg sin freetype). Todos los rótulos se dibujan como
  PNG con Pillow.
- **El contenedor se reinicia cada pocos minutos** y mata las tareas en segundo
  plano. Un montaje de 50 s tarda 13,5 min y se perdió dos veces entero. Por eso
  `montaje/ecosistema_material.py` acepta un **tramo** (`desde_s hasta_s`) y se
  rehace solo lo que cambió.
- **Salida solo por 80 y 443.** Nada de SSH, nada de puertos raros.
- **El scratchpad sobrevive a algunos reinicios, pero no cuentes con ello.**

---

## 10. Checklist para la próxima sesión

```
[ ] Recargar Vast (hay $3.21; con $15 se hace una sesión larga)
[ ] export VAST_API_KEY / HF_TOKEN / EL_KEY
[ ] Escribir la cola: 720x1280, fps 24, duration_s 4, steps 20, cfg 5.0
[ ] Ids nuevos y únicos (el manifiesto del pod recuerda los viejos)
[ ] python3 tools/lint.py -g <guion>
[ ] python3 tools/preflight.py --guion ... --cola ... --puerto 8188 --disco 400
[ ] 0 PARA
[ ] HORAS=8 PISO=12 ./guardian.sh &   y comprobar que vive
[ ] search --gpu RTX_PRO_6000_WS --max-dph 1.30
[ ] create --disk 400 --port 8188 --job ... --workflows prompts/workflows
      --env HF_TOKEN --env HF_REPO --env ESPERA_MIN=45
[ ] Ver en el log: VRAM -> bf16, pesos, "TRABAJO: N workflows"
[ ] Si a los 12 min el log no avanza -> destruir y cambiar de host
[ ] Tandas siguientes con tools/encolar.py, sin apagar
[ ] tools/encolar.py --fin
[ ] destroy + status para confirmar
[ ] Bajar de HF y verificar MD5
```

---

## 11. Lo que sigue sin resolverse

- **El público deduce respaldo en oro sin que nadie lo diga.** Cuatro pruebas a
  ciegas independientes construyeron *"supuestamente respaldada en oro de verdad"*
  con la película del ecosistema. No basta con no decir la palabra: hay que no
  construirla. José conoce el riesgo y lo ha aceptado.
- **La confianza con el dinero es social y física, no tecnológica.** Lo que
  decide es *"pregunto en el grupo si alguien ya la usó; yo no voy a ser el primer
  tonto"*. Eso se arregla en el producto, no en el montaje.
- **El sistema depende de que haya alguien operándolo.** Hoy no corre solo ni lo
  puede operar José sin ayuda.

---

## Ficheros clave

| | |
|---|---|
| `tools/preflight.py` | La puerta. Devuelve 1 y no se enciende |
| `tools/vast_api.py` | search / create / status / logs / destroy |
| `guardian.sh` | Red de seguridad. **Antes** de crear |
| `cloud/onstart.sh` | El pod se instala solo. Comprimido, autoextraíble |
| `cloud/selftest.py` | Se prueba a sí mismo y vuelca el esquema de los nodos |
| `03_run_queue.py` | Ejecuta la cola contra ComfyUI y entrega cada clip |
| `tools/encolar.py` | Manda tandas nuevas a un pod encendido, por HF |
| `prompts/workflows/h3_calidad_api.json` | El workflow que funciona |
| `tools/lint.py` · `auditar.py` · `costo.py` | Antes de gastar |
| `POSTMORTEM.md` | Los fallos originales con todo el detalle |
| `COSTOS_REALES.md` | Modelo de costes calibrado |
| `CLAUDE.md` (raíz) | Cómo trabaja José y qué no se puede decir en un vídeo |
