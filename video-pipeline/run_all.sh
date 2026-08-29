#!/usr/bin/env bash
# Extremo a extremo: crear pod -> instalar -> generar cola -> descargar -> destruir.
# Con watchdog de gasto en paralelo.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

./01_vast_create_pod.sh
. ./.pod

./watchdog_spend.sh & WATCHDOG=$!
trap 'kill "$WATCHDOG" 2>/dev/null || true' EXIT

SSH="ssh -p ${SSH_PORT} -o StrictHostKeyChecking=accept-new root@${SSH_HOST}"

echo "==> Instalando (20-40 min)"
$SSH "bash /workspace/02_install_cloud.sh" 2>&1 | tee logs_install.txt

echo "==> Generando cola"
$SSH ". /workspace/venv/bin/activate && \
      python3 /workspace/03_run_queue.py \
        --queue /workspace/${QUEUE_FILE:-prompts/queue.json} \
        --out ${REMOTE_OUT:-/workspace/outputs}" 2>&1 | tee logs_queue.txt

kill "$WATCHDOG" 2>/dev/null || true
./04_collect_and_shutdown.sh
