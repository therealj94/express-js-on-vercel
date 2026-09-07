#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# EL VIGILANTE DE OLLAMA.
#
# POR QUE EXISTE
# El 5-sep, con tres ranuras compartiendo un modelo, una conexion cortada a
# media generacion dejo a ollama sin contestar: 300 segundos de espera en una
# peticion trivial, con ULTRON y AU-RA caidos detras. Con ranuras compartidas,
# el estado que deja un cliente que se va a medias lo hereda el siguiente, y no
# hay API para devolver una ranura a su sitio: el unico arreglo es reiniciar.
#
# Y ULTRON corta conexiones A PROPOSITO, dos veces:
#   · la guarda del bucle, cuando ve al modelo repitiendose;
#   · desde el 6-sep, cuando alguien lo interrumpe — antes solo se callaba la
#     bocina y el motor seguia escribiendo; ahora se corta de verdad.
# O sea que el gatillo de aquel incidente pasa hoy muchas mas veces que antes.
#
# QUE HACE
# Cada minuto le pide /api/tags, que es la ruta mas barata que tiene ollama y
# contesta INCLUSO mientras genera. Si esa ruta no contesta, no es que este
# ocupado: es que el planificador se colgo.
#
# TRES LECTURAS MALAS SEGUIDAS antes de tocar nada, y no es timidez: reiniciar
# cuesta releer 16 GB de disco —la maquina tiene 15 GB de RAM, asi que no hay
# cache que valga— y eso son unos dos minutos sin ULTRON y sin AU-RA. Una
# lectura mala puede ser un pico; tres seguidas, no. Con el reloj cada minuto,
# eso acota el cuelgue a ~3 minutos en vez de los 300 segundos de aquel dia,
# y —lo que mas importa— lo vuelve un tiempo CONOCIDO en vez de una espera sin
# fondo.
#
# Y con un descanso de diez minutos entre reinicios: un bucle de reinicios es
# peor que el cuelgue que arregla, porque cada vuelta son otros 16 GB de disco.
#
# Despues de reiniciar deja los dos modelos clavados otra vez (keep_alive: -1).
# Sin esto, el primero que pregunte paga la carga entera.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# La direccion y la carpeta de estado se pueden cambiar por entorno, y no es
# adorno: es lo que permite PROBAR el vigilante contra un puerto muerto y una
# carpeta de mentira, y ver que cuenta las lecturas malas, sin arriesgar un
# reinicio de la tarjeta de produccion.
OLLAMA="${OGB_OLLAMA:-http://127.0.0.1:11434}"
MODELO="${OGB_MODELO:-qwen3.8:27b}"
VECTOR="${OGB_MODELO_VECTOR:-embeddinggemma:300m}"
ESTADO="${OGB_ESTADO:-/var/lib/ollama-vigia}"
FALLOS="$ESTADO/fallos"
ULTIMO="$ESTADO/ultimo_reinicio"
PLAZO=8            # segundos que se le dan a /api/tags: contesta en milisegundos
TOPE=3             # lecturas malas seguidas antes de reiniciar
DESCANSO=600       # segundos minimos entre dos reinicios

mkdir -p "$ESTADO"
registrar() { logger -t ollama-vigia "$*"; }

# El servicio caido no necesita tres lecturas: se levanta y ya.
if ! systemctl is-active --quiet ollama; then
  registrar "ollama NO esta activo: se levanta"
  systemctl start ollama
  echo 0 > "$FALLOS"
  exit 0
fi

if curl -s -o /dev/null -m "$PLAZO" "$OLLAMA/api/tags"; then
  anteriores=$(cat "$FALLOS" 2>/dev/null || echo 0)
  [ "$anteriores" -gt 0 ] && registrar "vuelve a contestar tras $anteriores lectura(s) mala(s)"
  echo 0 > "$FALLOS"
  date +%s > "$ESTADO/ultimo_ok"
  # UN LATIDO CADA HORA, y solo uno. Un vigilante que no escribe nunca es
  # indistinguible de un vigilante apagado, y el dia que haga falta saber si
  # estaba puesto no habra donde mirarlo. Pero escribir cada minuto son mil
  # cuatrocientas lineas al dia que tapan las que importan.
  vueltas=$(( $(cat "$ESTADO/vueltas" 2>/dev/null || echo 0) + 1 ))
  if [ "$vueltas" -ge 60 ]; then
    registrar "todo en orden: ollama contesta (${vueltas} vueltas sin novedad)"
    vueltas=0
  fi
  echo "$vueltas" > "$ESTADO/vueltas"
  exit 0
fi

fallos=$(( $(cat "$FALLOS" 2>/dev/null || echo 0) + 1 ))
echo "$fallos" > "$FALLOS"

if [ "$fallos" -lt "$TOPE" ]; then
  registrar "no contesto en ${PLAZO}s ($fallos de $TOPE): todavia no se toca"
  exit 0
fi

ahora=$(date +%s)
desde=$(cat "$ULTIMO" 2>/dev/null || echo 0)
if [ $(( ahora - desde )) -lt "$DESCANSO" ]; then
  registrar "COLGADO ($fallos seguidas) pero se reinicio hace $(( ahora - desde ))s: se espera, un bucle de reinicios es peor"
  exit 0
fi

registrar "COLGADO: $fallos lecturas seguidas sin respuesta en ${PLAZO}s. Reiniciando ollama"
echo "$ahora" > "$ULTIMO"
systemctl restart ollama
echo 0 > "$FALLOS"

# Que levante antes de pedirle nada.
for _ in $(seq 1 30); do
  curl -s -o /dev/null -m 5 "$OLLAMA/api/tags" && break
  sleep 2
done

# Y los dos modelos clavados otra vez, o el primero que pregunte paga la carga.
curl -s -o /dev/null -m 300 "$OLLAMA/api/chat" \
  -d "{\"model\":\"$MODELO\",\"stream\":false,\"think\":false,\"keep_alive\":-1,\"options\":{\"num_ctx\":24576,\"num_predict\":4},\"messages\":[{\"role\":\"user\",\"content\":\"listo\"}]}" || true
curl -s -o /dev/null -m 120 "$OLLAMA/api/embed" \
  -d "{\"model\":\"$VECTOR\",\"input\":\"listo\",\"keep_alive\":-1}" || true

registrar "reiniciado y los dos modelos otra vez clavados en la tarjeta"
