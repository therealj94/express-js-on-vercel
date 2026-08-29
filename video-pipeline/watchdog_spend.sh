#!/usr/bin/env bash
# Destruye la instancia si el gasto acumulado supera MAX_SPEND_USD.
# Red de seguridad contra colas colgadas: la GPU factura aunque nada se genere.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
. ./.pod

MAX_SPEND_USD="${MAX_SPEND_USD:-25}"
INTERVAL="${WATCHDOG_INTERVAL:-300}"
START=$(date +%s)

DPH=$(vastai show instance "$INSTANCE_ID" --raw \
  | python3 -c 'import json,sys;print(json.load(sys.stdin).get("dph_total",0))')
echo "watchdog: \$${DPH}/h, límite \$${MAX_SPEND_USD}"

while true; do
  sleep "$INTERVAL"
  vastai show instance "$INSTANCE_ID" --raw >/dev/null 2>&1 || {
    echo "watchdog: instancia ya no existe, saliendo"; exit 0; }
  HOURS=$(python3 -c "print(($(date +%s) - $START)/3600)")
  SPENT=$(python3 -c "print(round($DPH * $HOURS, 2))")
  echo "watchdog: ${SPENT} USD gastados"
  if python3 -c "import sys;sys.exit(0 if $SPENT >= $MAX_SPEND_USD else 1)"; then
    echo "watchdog: LÍMITE ALCANZADO. Rescatando salidas y destruyendo."
    rsync -az -e "ssh -p ${SSH_PORT} -o StrictHostKeyChecking=accept-new" \
      "root@${SSH_HOST}:${REMOTE_OUT:-/workspace/outputs}/" "${LOCAL_OUT:-./outputs}/" || true
    vastai destroy instance "$INSTANCE_ID"
    exit 2
  fi
done
