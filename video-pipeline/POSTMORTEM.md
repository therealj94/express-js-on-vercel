# Post-mortem de la primera sesión real (29-ago-2026)

Resultado honesto: **la instalación quedó probada, la generación no.** Se gastaron
$8.24 de los $25 y no salió ni un clip. Todo lo que falló está aquí, con su causa
y su corrección, porque el valor de la sesión son estos ocho fallos, no el vídeo
que no se hizo.

## Coste

| | |
|---|---|
| Saldo inicial | $25.00 |
| Saldo final | $17.09 |
| **Gastado** | **$7.91** |
| Repartido en | 6 instancias, 3 hosts rotos, 5 fallos de código |

## Los ocho fallos

### 1. Instancia creada detenida
Sin `"target_state": "running"` la API reserva la máquina, cobra disco y **nunca
ejecuta el onstart**. No da error. 25 minutos perdidos.
→ Corregido en `tools/vast_api.py`, más subcomandos `start`/`stop`.

### 2. Puerto nunca mapeado
`{"-p": "8188:8188"}` se acepta y no mapea nada. La forma correcta es
`{"-p 8188:8188": "1"}` — la cadena entera como clave. Una hora con un pod
inalcanzable.
→ Corregido, verificado contra `parse_env` del CLI oficial.

### 3. Filtro de descarga ignorado
`hf download --include` acepta **un** patrón; varios seguidos se leen como
nombres de fichero y el filtro se descarta entero. Se bajaron 108 GB de pesos
BF16 en una tarjeta de 31 GB que no podía usarlos.
→ Un flag por patrón.

### 4. ComfyUI expuesto sin contraseña
La URL de Caddy no existía (los assets de GitHub llevan la versión en el nombre),
daba 404, y **el camino de respaldo abría ComfyUI en 0.0.0.0 sin autenticación**.
Fallaba abierto.
→ nginx + `openssl passwd -apr1` desde los repos de la distro, y la lógica
invertida: si la autenticación no se puede montar, el servicio se queda en
localhost. Inaccesible es aceptable; expuesto no.

### 5. Logs ilegibles
La URL firmada de los logs devuelve `AccessDenied` **en el cuerpo**, con código
200, hasta que el objeto existe. Un solo intento dejaba al vigilante ciego.
→ Reintentos hasta que el cuerpo sea real.

### 6. LoRA en la carpeta equivocada
Los turbo de H3 se distribuyen como LoRA de ~1.8 GB. El clasificador mandaba a
`diffusion_models` todo lo que no fuera texto o VAE, así que ComfyUI los daba por
faltantes **estando descargados**. Y el botón "Descargar" que ofrece la interfaz
baja el fichero **al dispositivo del usuario**, no al pod: desde un iPad no hay
forma de arreglarlo.
→ Clasificación por ruta de origen además del nombre, y descarga explícita del
turbo a `models/loras`.

### 7. Autoprueba con la plantilla equivocada
El test eligió la plantilla de *first-last-frame*, que necesita dos imágenes que
no existen en un pod recién creado. Reportó `FALLO` cuando la instalación estaba
perfecta.
→ Ahora prefiere plantillas sin `LoadImage`, y vuelca al log el inventario de
plantillas y el esquema de los nodos de H3.

### 8. Disco insuficiente
300 GB con BF16 + FLUX.2 dejaron **12 GB libres**. Suficiente para arrancar, no
para trabajar.
→ Aviso antes de descargar y recomendación de `--disk 400` para BF16.

## Los hosts

Tres máquinas fallaron antes de dar con una buena, todas con `reliability`
publicada entre 0.992 y 0.997:

- una con el log congelado 20 min y `Timeout, server ssh no responde`
- otra atascada en `loading` casi 3 h sin crear el contenedor
- una tercera lenta hasta lo inservible

**La fiabilidad publicada es histórica y no dice nada del estado actual.** La
señal útil es: si el log no avanza en 10-12 minutos, cambiar de host. Las
tarjetas de 96 GB (datacenter) se comportaron mucho mejor que las 5090
(máquinas domésticas).

## El fallo que no fue de código

Prometí vigilar el pod mientras José dormía y la red de seguridad que debía
destruirlo sola **nunca llegó a arrancar**: una interrupción la dejó a medias. La
instancia quedó encendida sin nadie mirándola. Se salvó por casualidad — el host
se atascó y solo cobró $0.01.

→ `guardian.sh` está ahora en el repo, se arranca **antes** de crear la
instancia, y se verifica que el proceso vive antes de dar nada por seguro.

## Lo que quedó demostrado

- El pod se instala solo, sin SSH, y se prueba a sí mismo
- Detección automática de VRAM: 32 GB → INT8, 97 GB → BF16
- 18 pesos de H3 descargados y visibles para ComfyUI
- Nodos cargados: `MiniMaxH3ImageToVideo`, `EmptyMiniMaxH3LatentAV`,
  `MiniMaxH3AddGuide`, `MiniMaxChunkFeedForward`
- nginx con autenticación delante, verificado en el log
- Existen variantes **turbo de 4 y 8 pasos**, que si sirven reducen el coste por
  clip entre 4 y 7 veces frente a los 30 pasos presupuestados

## Lo que falta para la próxima

1. **Workflows ya montados en el repo.** Es la pieza que faltó y la que dejó a
   José peleando con nodos en un iPad. La autoprueba ya vuelca el esquema de los
   nodos al log: con eso se construyen sin tener el pod encendido.
2. **Bucket de resultados** (`ALMACENAMIENTO.md`) para que los clips salgan solos
   y se puedan guardar sin depender del navegador.
3. **Medir un clip de verdad.** Sigue sin haber un solo tiempo real medido; todo
   el modelo de costes es estimación hasta entonces.

## La regla que resume la sesión

Cinco de los ocho fallos tienen la misma forma: **la API o la herramienta acepta
una entrada mal formada y sigue sin quejarse.** No hay excepción, no hay código de
error, solo un comportamiento silenciosamente distinto del esperado.

Contra eso solo funciona una cosa: **verificar el efecto, no la llamada.** ¿Se
mapeó el puerto? ¿Cuántos ficheros bajó? ¿Está la autenticación activa? Cada
"sí" debe leerse de un estado observable, nunca asumirse porque la llamada no dio
error.

---

# Retrospectiva: qué haría distinto para que fuera de primera

Los ocho fallos de arriba son de ejecución. Estos son de criterio, y pesan más.

## 1. Empezamos por el final

Se construyó la infraestructura antes de comprobar que el modelo produce algo que
a José le guste. Lo correcto era gastar los primeros $8 en **veinte clips por
API** y responder "¿esto se parece a lo que quiero?". Solo entonces automatizar.

Se gastaron en fontanería y quedaron cero clips. El orden correcto es:
**resultado → repetibilidad → coste**. Se hizo al revés.

## 2. Se optimizó la métrica equivocada

Todo el diseño persigue el coste por clip: $0.04 contra $0.40 de la API. A su
volumen real —un tráiler de vez en cuando— eso son decenas de dólares al año.
El cuello de botella real es su tiempo y su criterio, y la complejidad que se
añadió para ahorrar esos dólares le costó una mañana entera.

**Optimizar el coste marginal solo tiene sentido cuando el volumen es alto y el
sistema ya funciona.** Aquí no se cumplía ninguna de las dos.

## 3. Se construyó demasiado antes de la primera prueba real

`look.py`, `post.py`, `extend.py`, `shotlist.py` se escribieron sin haber visto
un solo fotograma generado. Están probados contra mocks y ffmpeg, pero **ninguno
se ha validado contra salida real del modelo**. Puede que la biblia de estilo
mejore las tomas o puede que no: no hay evidencia.

Lo correcto: un camino mínimo de punta a punta que funcione, y crecer desde ahí
con cada pieza justificada por algo observado.

## 4. La interfaz fue una idea tardía

Poner a alguien delante de un editor de nodos en un iPad debería haberse
descartado en el primer minuto, no después de una mañana. La pregunta "¿cómo lo
va a usar?" se hizo demasiado tarde, y la respuesta cambió el diseño entero.

## 5. No se modeló el coste de operar, solo el de computar

El presupuesto contaba GPU y disco. No contaba hosts rotos, reinicios,
depuración ni el tiempo del usuario. El coste real de la primera sesión fue
**~30 veces** el del compute que produjo.

## 6. El sistema depende de una persona

Todo esto necesita a Claude en la conversación para funcionar. Un diseño de
primera no depende de que el operador esté disponible: o corre solo, o el
usuario puede operarlo sin ayuda. Hoy no cumple ninguna de las dos.

## Lo que construiría en su lugar

1. **Semana 1, sin infraestructura.** API de H3, veinte clips, cerrar el look y
   el guion. Coste ~$8, resultado: material real y criterio formado.
2. **Semana 2, solo si el volumen lo pide.** Autohospedar *una* tanda con el
   camino mínimo, midiendo tiempos reales.
3. **Semana 3, automatizar lo que se repitió.** Nada antes de haberlo hecho a
   mano dos veces.

La regla que resume la retrospectiva: **no automatices lo que todavía no has
hecho funcionar a mano.**

---

# Cierre del 30-ago-2026: qué quedó funcionando

## Lo que se demostró

**El pipeline genera.** Nueve planos, cero errores, dos veces seguidas. El pod se
instala solo, recibe el trabajo dentro, genera la cola y avisa — sin que nadie
abra ComfyUI.

Tiempos **medidos**, ya no estimados:

| | |
|---|---|
| Instalación (46 GB con aria2c) | 25-55 min según la red del host |
| Clip de 5-8 s a 720×1280, turbo 4 pasos | **93-142 s** |
| Nueve planos completos | **14-21 min** |
| Coste de generar los nueve | **~$0.25** |
| Con instalación incluida | **~$1.60-2.50** |

`tools/costo.py` está calibrado con estas cifras.

## El único problema sin resolver: la entrega

Los clips se generan y se quedan **dentro del pod**. Todo lo demás funciona.

- El puerto mapeado **no es alcanzable** en estos hosts: mapean en Docker pero
  no abren al exterior. `ERR_CONNECTION_TIMED_OUT` desde móvil y desde iPad.
- El `execute` de Vast solo admite `ls`, `du` y `cat`, y solo con la instancia
  detenida.
- El canal del log transporta texto, no binarios: `cat` de un mp4 no devuelve
  el fichero.
- Los tres servicios de subida gratuitos que probé (0x0.st, transfer.sh,
  file.io) **no funcionaron**, y el error fue mío por partida doble: escribí el
  uploader sin poder probarlo desde este entorno, y el parseo de la respuesta de
  file.io producía enlaces falsos que parecían válidos en el log.

**La lección es la misma de todo el proyecto: no dar por bueno lo que no se ha
verificado.** La entrega se escribió a ciegas y por eso falló, igual que los
doce fallos anteriores.

## La vía que sí puede verificarse

Hugging Face con **token de escritura**. Es el único destino de subida que este
entorno alcanza — de ahí se bajaron 46 GB hoy mismo, así que la ida y la vuelta
están probadas. El pod sube a un repo privado y los ficheros se recuperan desde
aquí.

Requiere un token tipo *Write* (el actual es de solo lectura). Es el único
bloqueo pendiente.

## Coste total del proyecto

$52.03 iniciales → **$41.41**. Gastados **$10.62** en dos días, dieciséis fallos
corregidos y un pipeline que genera pero todavía no entrega.
