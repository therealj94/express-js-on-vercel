# MiniMax H3 en AWS — el plan

**Escrito el 27-sep-2026.** Complementa a `MINIMAX_H3.md` (lo que ya funciona en
Vast). Aquí: si se puede levantar lo mismo en AWS, cuánto cuesta, y cómo dejar
de pagar 25–55 minutos de instalación en cada encendido.

Nada de esto se ha ejecutado todavía. Lo que está marcado **[medido]** se leyó
hoy de la cuenta; lo marcado **[estimado]** hay que medirlo en la primera sesión.

> ## ⚠️ Corrección del 27-sep (misma tarde): la licencia cambia la región
>
> La licencia de MiniMax H3 (§ Definiciones 3 y 5, § IV.4) **excluye Estados
> Unidos, la Unión Europea, Reino Unido y Corea del Sur**: no autoriza a usar,
> reproducir ni *mostrar* el modelo **ni sus resultados** en esos territorios.
>
> - **`us-east-1` queda descartada**: correr los pesos en un servidor de EE. UU.
>   es usarlos en territorio excluido. Todo lo de abajo con precios de
>   `us-east-1` vale como referencia técnica, no como plan.
> - Regiones de AWS con `g7e.2xlarge` **fuera** de territorio excluido: Tokio
>   (`ap-northeast-1`, cupo On-Demand G = **0**) y Mumbai (`ap-south-1`, cupo
>   On-Demand G = 384). Mumbai: **$5.49/h** On-Demand, ~$2.04/h Spot (cupo Spot
>   = 0). São Paulo solo tiene H100 a $11.56/h.
> - A $5.49/h, AWS cuesta **~4–5× Vast**. Con esto la recomendación pasa a ser
>   **Vast filtrando hosts por país** (`vast_api.py search` muestra la
>   `geolocation` pero hoy no filtra por ella) y AWS Mumbai solo como respaldo.
> - Los anuncios generados **no se pueden mostrar** en EE. UU./UE/RU/Corea sin
>   una autorización aparte de MiniMax (`api@minimax.io`). Para público en
>   Honduras y Latinoamérica no aplica esta exclusión. Confirmar con un abogado
>   antes de pautar.
> - Se revisó Hugging Face a esta fecha: **H3 sigue siendo el último modelo de
>   vídeo de MiniMax** (27-jul-2026). Lo nuevo aprovechable está en
>   `Comfy-Org/MiniMax-H3`: modo **ref2va** (hasta 9 imágenes de referencia:
>   logo, producto, misma persona en todos los planos), LoRA turbo de 8 pasos y
>   ControlNet Union 2.0 (24-sep). La resolución nativa es **768 px** de lado
>   corto; hoy se genera a 720.
> - H100 (`p5`) no ejecuta nvfp4 de forma nativa, y el codificador de texto que
>   usa el pipeline es `nvfp4_awq`: si se usa AWS, la tarjeta es `g7e`
>   (Blackwell), no `p5`.

---

## 0. Respuesta corta

**Sí se puede, y la cuenta ya está lista** [medido]:

| | |
|---|---|
| Credenciales | funcionan (`user/jose`, `us-east-1`) |
| Cupo On-Demand G/VT | **384 vCPU** — alcanza de sobra |
| Cupo Spot G/VT | **0** — hay que pedirlo (gratis, suele tardar horas) |
| Cupo Spot P | 384 vCPU |
| La misma tarjeta que en Vast | **`g7e.2xlarge`**: RTX PRO 6000 Blackwell, **96 GB**, 8 vCPU, 64 GB RAM, 50 Gbps |
| AMI | *Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04)*, 25-sep-2026, soporta G7e. Trae drivers + Docker con GPU |
| Prueba en seco | `run_instances(DryRun=True)` para `g7e.2xlarge` → *would have succeeded* |

**Lo que cambia de verdad no es la máquina, es que los 42 GB de pesos se bajan
una vez de Hugging Face y después viven en S3, en la misma región.** Cada
encendido siguiente los copia a la velocidad de la red interna de AWS en vez de
a la de un host de Vast.

**Mi recomendación:** AWS para las sesiones de trabajo, Vast como respaldo
barato. Primero una sola sesión de prueba (~$4) que siembra la caché y compara
calidad y tiempo contra Vast. Solo si sale bien se automatiza el resto (regla del
propio runbook: resultado → repetibilidad → coste).

---

## 1. Precios (us-east-1, hoy)

| Instancia | GPU | VRAM | On-Demand | Spot (hoy) | Rama del instalador |
|---|---|---|---|---|---|
| **`g7e.2xlarge`** | RTX PRO 6000 Blackwell | 96 GB | **$3.36/h** | **~$1.79/h** | bf16 |
| `g7e.4xlarge` | igual, más CPU/RAM | 96 GB | $4.00/h | ~$2.19/h | bf16 |
| `p5.4xlarge` | H100 | 80 GB | $6.88/h | ~$2.60/h | bf16 (81 559 MiB ≥ 80 000) |
| `g6e.xlarge` | L40S | 48 GB | $1.86/h | ~$1.83/h | fp8 |

Referencia Vast: PRO 6000 a **$0.98–1.53/h**.

**AWS por hora es más caro**: On-Demand ~2,5× Vast, Spot ~1,4×. Lo que se gana:

- **Arranque**: de 25–55 min a ~10 min [estimado] (ver §3).
- **Sin hosts malos**: en Vast se perdieron 3 máquinas "fiables" y un reenvío
  roto de 80 min. En AWS la máquina que pides es la que llega.
- **Sin recargar saldo**: se factura a la cuenta de AWS.
- **Apagado que vive dentro de la máquina** (§4), no en este contenedor que se
  reinicia cada pocos minutos.

### Cuánto cuesta una tanda de 60 clips de calidad (~9,5 min cada uno)

| | Arranque | Generación (9,5 h) | Total |
|---|---|---|---|
| Vast PRO 6000 a $1.20 | ~$1.30 | ~$11.40 | **~$13** |
| AWS `g7e.2xlarge` Spot | ~$0.30 | ~$17.00 | **~$17** |
| AWS `g7e.2xlarge` On-Demand | ~$0.56 | ~$32.00 | **~$33** |

Más la caché en S3: ~52 GB × $0.023 = **~$1.20/mes**.

> Spot puede ser interrumpido con 2 min de aviso. No es grave aquí: el runner
> ya entrega cada clip a Hugging Face al salir, así que lo generado no se pierde;
> se relanza y el manifiesto salta lo hecho.

---

## 2. Antes de nada: hay dos GPU encendidas ahora mismo

[medido] En la cuenta hay dos instancias GPU en estado **running**:

| Instancia | Nombre | Precio | Al mes |
|---|---|---|---|
| `i-02653feadc919d3a4` `g4dn.xlarge` (T4) | `aura-gpu-T4-APAGADA (voz movida a ElevenLabs 5-sep)` | ~$0.53/h | **~$380** |
| `i-06530893af0dd0638` `g5.xlarge` (A10G) | `aura-gpu-a10g` | ~$1.01/h | **~$730** |

La T4 se llama "APAGADA" pero está encendida. Tuvo un pico de CPU el 26-sep, así
que algo la usa. **No las toqué.** Si ya no hacen falta, eso son ~$1.100/mes:
más que todas las tandas de vídeo juntas. José decide.

---

## 3. No volver a subir todo: la caché en S3

### El problema

Cada encendido en Vast baja ~42 GB de Hugging Face y reinstala torch, ComfyUI y
los nodos. Son 25–55 min pagados antes del primer clip, y depende del ancho de
banda de cada host.

### La solución

Un bucket privado, **`og-video-cache-548380372606`** en `us-east-1`:

```
s3://og-video-cache-548380372606/
  pesos/          los ficheros tal cual los deja onstart.sh en ComfyUI/models
  entorno.tar.zst /workspace/venv + /workspace/ComfyUI (código y custom_nodes, sin models)
  logs/<id>.log   el onstart.log de cada instancia, sincronizado cada 60 s
```

- **Primera sesión (siembra):** instala como siempre desde HF. Al terminar la
  instalación, sube pesos y entorno a S3. Subir de EC2 a S3 en la misma región
  **no cobra transferencia**.
- **Sesiones siguientes:** si la caché existe, `s5cmd` la copia en paralelo y
  se salta la descarga de HF y los `pip install`. A 50 Gbps de red, 52 GB son
  1–3 min [estimado]; el resto es arrancar Docker y ComfyUI.
- **Verificación:** un `manifest.json` con tamaño y MD5 de cada fichero. Si un
  fichero no cuadra, se baja ese solo de HF. Misma regla que la entrega: si no
  está verificado, no existe.

### Por qué S3 y no una AMI o un snapshot

Un volumen creado desde snapshot se carga **perezosamente** desde S3 bloque a
bloque: la primera lectura de los 42 GB, justo cuando ComfyUI carga el modelo,
sería lenta. Evitarlo (*Fast Snapshot Restore*) cuesta $0.75/h por zona, todo el
tiempo. Copiar de S3 al disco es igual de rápido y no cobra en reposo.

### ¿Y la caché para Vast?

No con S3: sacar datos de AWS a internet cuesta ~$0.09/GB → **~$4.70 por
encendido**, más que la instalación entera. Para Vast lo que sí ahorra tiempo es
una **imagen Docker propia** con torch, ComfyUI y los nodos ya dentro (los pesos
siguen bajando de HF, que es gratis). Eso quita los `pip install`, no la
descarga. Queda como fase 4, solo si Vast se sigue usando.

---

## 4. Seguridad de gasto: el guardián dentro de la máquina

`guardian.sh` corre en este contenedor, que se reinicia cada pocos minutos. En
AWS la red de seguridad va en la propia instancia:

1. **`InstanceInitiatedShutdownBehavior=terminate`**: apagar = destruir. No hay
   "detenida cobrando disco".
2. **`shutdown -h +480`** en el primer segundo del arranque: tope duro de 8 h
   pase lo que pase. Es el `HORAS=8` del guardián, pero no depende de nadie.
3. Al escribir `TRABAJO COMPLETO`, el propio onstart hace `shutdown -h now`.
4. **Disco `DeleteOnTermination=true`**: no quedan volúmenes huérfanos.
5. **Etiqueta `Proyecto=video`** en todo: `status` solo lista esas y nunca
   toca las instancias de Aura, OGB ni Ordenex.
6. Si el log en S3 no avanza en 12 min → `destroy` (misma regla que en Vast;
   en AWS debería pasar mucho menos).

Opcional: un presupuesto de AWS Budgets de, p. ej., $60/mes con aviso a correo.

---

## 5. Cómo corre: el mismo onstart.sh

La AMI trae Docker con acceso a GPU. El `user-data` de la instancia hace solo:

```bash
shutdown -h +480                                  # tope duro
docker run --gpus all --network host \
  -v /workspace:/workspace \
  -e HF_TOKEN -e HF_REPO -e ESPERA_MIN -e CACHE_S3 ... \
  pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel \
  bash /workspace/onstart.sh
shutdown -h now                                   # acabó el trabajo
```

Es **la misma imagen y el mismo `onstart.sh`** que produjeron las películas. El
runner, la cola desatendida, la entrega a Hugging Face y `encolar.py` para
encadenar tandas no cambian. Así lo probado sigue probado.

Diferencias con Vast que hay que cuidar:

- **Sin límite de 16 384 caracteres**: el `user-data` admite 16 KB también, pero
  la cola y los workflows pueden ir en S3 en vez de en variables de entorno.
- **Sin puerto público**: no se abre nada. El pod trabaja desatendido y entrega
  a HF; el log sale por S3. El grupo de seguridad no tiene reglas de entrada.
- **Credenciales del pod**: un rol IAM `og-video-pod` que solo puede leer y
  escribir en el bucket de la caché. Ninguna clave de AWS viaja en el user-data.
- **Disco**: gp3 de 400 GB con 1 000 MB/s de rendimiento (para que escribir la
  caché no sea el cuello de botella). Se paga solo mientras vive la instancia.

---

## 6. Los cambios en el código

| Fichero | Cambio |
|---|---|
| `tools/aws_api.py` **nuevo** | `precios`, `cupo`, `create`, `status`, `logs`, `destroy`. Mismo estilo que `vast_api.py`; solo toca instancias con `Proyecto=video` |
| `cloud/onstart.sh` | `restaurar_cache` antes de `descargar_pesos` y `sembrar_cache` al terminar la instalación. Si `CACHE_S3` no está definido, **hace exactamente lo de hoy** — Vast no cambia |
| `cloud/onstart.sh` | sincronizar `onstart.log` a S3 cada 60 s cuando hay `CACHE_S3` |
| `tools/preflight.py` | `--nube aws`: cupo, bucket, rol, AMI y que no haya otra instancia `Proyecto=video` encendida |
| infraestructura, una vez | bucket, rol IAM + perfil de instancia, grupo de seguridad sin entradas |

---

## 7. El orden

**Fase 0 — hoy, $0**
- [ ] José decide si recarga Vast como respaldo (hay $3.21).
- [ ] Pedir cupo **Spot G/VT = 16 vCPU** (dos `g7e.2xlarge`). Gratis.
- [ ] José revisa las dos GPU de Aura encendidas (§2).

**Fase 1 — preparar, $0**
- [ ] Bucket, rol IAM, grupo de seguridad.
- [ ] `aws_api.py` + cambios en `onstart.sh` + `preflight.py --nube aws`.
- [ ] Todo lo verificable sin encender: `DryRun`, lint, preflight en verde.

**Fase 2 — sesión de siembra, ~$4, On-Demand**
- [ ] `g7e.2xlarge`, instalación normal desde HF, se sube la caché a S3.
- [ ] 5 clips de calidad de una cola ya conocida (ids nuevos, `_aws1`…).
- [ ] Medir: tiempo de instalación, s/clip, y comparar calidad con los de Vast.
- [ ] Si se parecen → seguir. Si no → quedarse en Vast y borrar el bucket.

**Fase 3 — sesión con caché**
- [ ] Encender otra vez y medir el arranque desde S3. Objetivo: < 12 min al
      primer clip.
- [ ] Si el cupo Spot ya llegó, usar Spot.
- [ ] A partir de aquí, cada tanda: preflight → create → encolar → se apaga sola.

**Fase 4 — opcional**
- [ ] Imagen Docker propia para Vast (sin `pip install` en cada encendido).

---

## 8. Reglas que no cambian

Todas las de `MINIMAX_H3.md` §8 siguen valiendo. Las que cambian de forma:

- "El guardián antes de crear" → en AWS el tope va **dentro** de la instancia
  (§4), y además se verifica con `status` que la etiqueta y el apagado están.
- "Destruir, no detener" → en AWS es `terminate`, y por diseño apagar ya
  destruye.
- "Verificar el efecto, no la llamada" → después de `create`, leer de
  `describe_instances` que `InstanceInitiatedShutdownBehavior` es `terminate` y
  que el disco tiene `DeleteOnTermination`. No fiarse del payload.
