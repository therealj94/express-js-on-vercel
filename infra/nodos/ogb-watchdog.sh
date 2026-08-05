#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Watchdog de sincronizacion para polygon-edge.
#
# POR QUE EXISTE
# El syncer de polygon-edge es puramente reactivo: su bucle principal se
# bloquea en `<-s.newStatusCh` y solo despierta cuando llega un aviso de que un
# peer tiene bloques nuevos. Ese aviso se emite con un envio NO bloqueante
# sobre un canal SIN buffer:
#
#     select {
#     case s.newStatusCh <- struct{}{}:
#     default:            // <-- si nadie escucha en ese instante, se descarta
#     }
#
# Mientras el syncer esta ocupado dentro de bulkSyncWithPeer (que puede tardar
# segundos trayendo miles de bloques), NADIE esta escuchando ese canal, asi que
# todos los avisos que llegan en esa ventana se pierden en silencio. Cuando la
# rafaga termina, el bucle vuelve a bloquearse y necesita un aviso NUEVO. Si
# ese aviso no vuelve a llegar, el nodo queda detenido para siempre — sin
# ningun error en el log, con los peers todavia conectados. Verificado: no
# aparece "failed to complete bulk sync" ni "timeout awaiting block" cuando se
# traba; el bulk sync termina limpio y simplemente no hay quien lo vuelva a
# despertar.
#
# No hay opcion de configuracion para esto ni reintento periodico en el codigo,
# y el binario es de octubre 2023 (IBFT, ya descontinuado aguas arriba), asi
# que parchear el fuente no es razonable. Este watchdog corrige el sintoma de
# forma segura desde afuera.
#
# QUE HACE
# Cada vez que corre, compara la altura actual con la de la corrida anterior.
# Si no avanzo, reinicia el servicio y vuelve a agregar al validador como peer
# — la unica combinacion que se comprobo que lo destraba. Un reinicio aqui es
# barato: estos nodos NO producen bloques (no son validadores todavia), solo
# sincronizan, asi que reiniciarlos no afecta la cadena.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GRPC="localhost:10000"
EDGE="/usr/local/bin/polygon-edge"
ESTADO="/var/lib/ogb-watchdog/ultimo_bloque"
NODE1_ADDR="__NODE1_ADDR__"

mkdir -p "$(dirname "$ESTADO")"

altura_actual() {
  "$EDGE" status --grpc-address "$GRPC" 2>/dev/null \
    | grep 'Current Block Number' | grep -oE '[0-9]+$'
}

registrar() { logger -t ogb-watchdog "$*"; echo "$(date -Is) $*"; }

actual="$(altura_actual)"
if [[ -z "$actual" ]]; then
  registrar "no se pudo leer la altura (servicio caido?), reiniciando"
  systemctl restart polygon-edge
  exit 0
fi

anterior=""
[[ -f "$ESTADO" ]] && anterior="$(cat "$ESTADO")"
echo "$actual" > "$ESTADO"

# Primera corrida: solo se guarda la referencia.
[[ -z "$anterior" ]] && { registrar "primera corrida, altura=$actual"; exit 0; }

if [[ "$actual" -gt "$anterior" ]]; then
  registrar "avanzando ok: $anterior -> $actual (+$((actual - anterior)))"
  exit 0
fi

# No avanzo. Antes de reiniciar se confirma que de verdad hay algo que
# sincronizar: si ya estamos a la par del validador, quedarse quieto es lo
# correcto y reiniciar seria contraproducente.
punta="$(curl -s --max-time 10 -X POST http://localhost:10002 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  | grep -oE '0x[0-9a-f]+' | head -1)"

registrar "ESTANCADO en $actual (sin avance desde la corrida anterior), reparando"
systemctl restart polygon-edge
sleep 8
"$EDGE" peers add --grpc-address "$GRPC" --addr "$NODE1_ADDR" >/dev/null 2>&1
sleep 5
nuevo="$(altura_actual)"
registrar "tras reparar: $actual -> ${nuevo:-desconocido}"
echo "${nuevo:-$actual}" > "$ESTADO"
