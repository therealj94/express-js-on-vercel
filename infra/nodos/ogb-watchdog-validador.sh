#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Watchdog para el VALIDADOR (node1). Variante deliberadamente conservadora.
#
# La diferencia con el watchdog de los nodos que solo sincronizan: aquel puede
# reiniciar sin costo, porque esos nodos no producen bloques. Este NO. node1 es
# hoy el unico validador de la cadena: mientras esta reiniciando, la cadena
# entera deja de producir bloques. Un reinicio innecesario aqui es una caida
# real del servicio, asi que este watchdog esta pensado para equivocarse hacia
# el lado de NO actuar.
#
# Tres frenos frente a la version de los otros nodos:
#
#   1. Exige DOS chequeos seguidos sin avance (~6 min) antes de tocar nada. El
#      validador produce un bloque cada 15 s, asi que 6 minutos sin un bloque
#      nuevo no es lentitud: es que algo se rompio de verdad.
#   2. Limite de 2 reinicios por hora. Si reiniciar no resuelve, seguir
#      reiniciando cada 3 minutos solo impide que el nodo termine cualquier
#      recuperacion que necesite tiempo. Pasado el limite deja de intentar y
#      registra una alerta para que lo mire una persona.
#   3. No agrega peers. En los otros nodos reconectar al validador es parte del
#      remedio; aqui no aplica — el validador es el origen, no el destino.
#
# El jsonrpc de node1 escucha en el puerto 80, no en 10002 como los demas.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GRPC="localhost:10000"
EDGE="/usr/local/bin/polygon-edge"
DIR="/var/lib/ogb-watchdog"
ESTADO="$DIR/ultimo_bloque"
FALLAS="$DIR/chequeos_sin_avance"
REINICIOS="$DIR/reinicios"        # una marca de tiempo por linea

UMBRAL_CHEQUEOS=2                 # ~6 min sin un bloque nuevo
MAX_REINICIOS_HORA=2

mkdir -p "$DIR"
registrar() { logger -t ogb-watchdog "$*"; echo "$(date -Is) $*"; }

altura() {
  "$EDGE" status --grpc-address "$GRPC" 2>/dev/null \
    | grep 'Current Block Number' | grep -oE '[0-9]+$'
}

actual="$(altura)"
if [[ -z "$actual" ]]; then
  registrar "ALERTA: el validador no responde al grpc — no se toca nada automaticamente, revisar a mano"
  exit 0
fi

anterior=""; [[ -f "$ESTADO" ]] && anterior="$(cat "$ESTADO")"
echo "$actual" > "$ESTADO"

if [[ -z "$anterior" ]]; then
  registrar "primera corrida, altura=$actual"
  echo 0 > "$FALLAS"
  exit 0
fi

if [[ "$actual" -gt "$anterior" ]]; then
  echo 0 > "$FALLAS"
  registrar "validador produciendo ok: $anterior -> $actual (+$((actual - anterior)))"
  exit 0
fi

# Sin avance: se acumula, no se actua todavia.
fallas=0; [[ -f "$FALLAS" ]] && fallas="$(cat "$FALLAS")"
fallas=$((fallas + 1))
echo "$fallas" > "$FALLAS"

if [[ "$fallas" -lt "$UMBRAL_CHEQUEOS" ]]; then
  registrar "sin avance en $actual (chequeo $fallas/$UMBRAL_CHEQUEOS) — esperando a confirmar antes de actuar"
  exit 0
fi

# Confirmado. Se revisa el limite de reinicios de la ultima hora.
ahora="$(date +%s)"
hace_una_hora=$((ahora - 3600))
recientes=0
if [[ -f "$REINICIOS" ]]; then
  awk -v t="$hace_una_hora" '$1 > t' "$REINICIOS" > "$REINICIOS.tmp" 2>/dev/null || true
  mv "$REINICIOS.tmp" "$REINICIOS" 2>/dev/null || true
  recientes="$(wc -l < "$REINICIOS" 2>/dev/null || echo 0)"
fi

if [[ "$recientes" -ge "$MAX_REINICIOS_HORA" ]]; then
  registrar "ALERTA: LA CADENA ESTA DETENIDA en $actual y ya se reinicio $recientes veces en la ultima hora sin exito. NO se reinicia mas — hace falta revision manual urgente."
  exit 0
fi

registrar "CADENA DETENIDA: sin bloques nuevos en $((UMBRAL_CHEQUEOS * 3)) min (altura $actual). Reiniciando el validador (reinicio $((recientes + 1))/$MAX_REINICIOS_HORA de esta hora)."
echo "$ahora" >> "$REINICIOS"
systemctl restart polygon-edge
sleep 20
nuevo="$(altura)"
if [[ -n "$nuevo" && "$nuevo" -gt "$actual" ]]; then
  registrar "recuperado: $actual -> $nuevo, la cadena volvio a producir"
  echo 0 > "$FALLAS"
else
  registrar "ALERTA: tras reiniciar sigue en ${nuevo:-desconocido} — no se recupero"
fi
echo "${nuevo:-$actual}" > "$ESTADO"
