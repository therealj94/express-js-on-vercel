# Vast.ai: selección de host y fallos silenciosos

Todo lo de aquí está verificado contra la API real y contra el código del CLI
oficial, no deducido. Los cuatro primeros apartados son errores que la API
**acepta sin quejarse** y que cuestan una hora de depuración cada uno.

## 1. Una instancia se crea DETENIDA si no se pide lo contrario

Sin `"target_state": "running"` en el cuerpo del `PUT /api/v0/asks/{id}/`, la
máquina se reserva, el disco empieza a facturar y el `onstart` nunca se ejecuta.
No hay error: la instancia aparece con `intended_status: stopped`.

`tools/vast_api.py` ya lo incluye. Si alguna vez se ve una instancia parada al
poco de crearla: `python3 tools/vast_api.py start <id>`.

## 2. Los puertos se declaran con la cadena entera como clave

```json
"env": {"-p 8188:8188": "1", "HF_TOKEN": "hf_...", "UI_PASS": "..."}
```

`{"-p": "8188:8188"}` se acepta y **no mapea nada**: el pod queda inalcanzable
con `ports: null`. Así lo codifica `parse_env` del CLI oficial
(`vastai/utils.py`): la clave es `-p 8188:8188` y el valor `"1"`. Las variables
de entorno normales sí van como clave/valor.

El puerto externo que Vast asigna **no** es 8188: se lee de
`ports["8188/tcp"][0]["HostPort"]` y cambia en cada instancia.

## 3. `hf download --include` acepta UN patrón

Varios patrones seguidos se interpretan como nombres de fichero y el filtro se
descarta entero — se descarga el repositorio completo. Con MiniMax H3 eso son
~110 GB en vez de ~35 GB, y llena el disco a media instalación. El aviso en el
log es `Ignoring --include since filenames have been explicitly set`.

Un flag por patrón:
```bash
hf download REPO --include "*int8*" --include "*fl2va*" --local-dir DST
```

## 4. Los logs devuelven AccessDenied en el CUERPO

`PUT /api/v0/instances/request_logs/{id}/` devuelve una URL firmada que tarda
segundos en existir. Hasta entonces responde **200 con un XML de AccessDenied**,
no un error HTTP. Un solo intento deja al vigilante ciego; hay que reintentar
hasta que el cuerpo sea real. `tools/vast_api.py logs` ya lo hace.

## 5. Elegir host

Filtros que aplica `tools/vast_api.py search`: `verified`, `reliability2 > 0.99`,
ancho de banda, disco, `cuda_max_good >= 12.8`, duración comprometida, y coste de
tráfico y almacenamiento.

**Pero la fiabilidad publicada es histórica y no dice nada del estado actual.**
En una sesión real fallaron tres hosts seguidos de RTX 5090 con `reliability`
entre 0.992 y 0.997: uno con el log congelado y `Timeout, server ssh no
responde`, otro atascado en `loading` casi tres horas sin crear el contenedor.

Señal práctica: **si el log no avanza en 10-12 minutos, cambiar de host.** Cuesta
~$0.20 y ahorra una hora. Anotar el `machine_id` descartado para no repetirlo.

Los hosts de las tarjetas de 96 GB (RTX PRO 6000 WS y Max-Q) son de datacenter y
se han comportado mucho mejor que los de 5090, que suelen ser máquinas
domésticas. Cuando la sesión importa, la diferencia de precio se paga sola.

Comparar siempre WS contra Max-Q antes de elegir: la WS es la tarjeta a plena
potencia (600 W frente a ~300 W) y a veces está **más barata** que la Max-Q.

## 6. Precio real contra precio publicado

Las páginas de marketing de Vast citan mínimos que rara vez existen en el
mercado. Consultar siempre la API antes de presupuestar. El `dph_total` de una
instancia creada **incluye el disco**, así que sale más alto que el de la oferta.

## 7. Autenticación: fallar cerrado

ComfyUI no tiene login. Expuesto en una IP pública, cualquiera que escanee el
puerto tiene la GPU. `cloud/onstart.sh` monta nginx con `auth_basic` y hash
`openssl passwd -apr1`, todo desde los repos de la distribución para que no
dependa de descargas externas que puedan cambiar de nombre.

Si la autenticación no se puede montar, ComfyUI se queda en `127.0.0.1` y el log
lo dice. Inaccesible es aceptable; expuesto no. Cualquier cambio en ese bloque
debe mantener esa dirección del fallo.

## 8. Alcance desde entornos con proxy

En un contenedor con proxy saliente, el HTTP por nombre de dominio funciona pero
una **IP cruda en puerto alto no**. Es decir: no se puede comprobar el ComfyUI de
un pod desde fuera. Por eso `cloud/selftest.py` corre **dentro** del pod y el
veredicto viaja por el log, que sí es accesible. Nunca dar por caído un pod
porque el puerto no responda desde aquí.
