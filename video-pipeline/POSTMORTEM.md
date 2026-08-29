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
