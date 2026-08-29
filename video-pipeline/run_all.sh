#!/usr/bin/env bash
# Sesión completa de punta a punta, un solo comando:
#   preflight -> crear pod -> instalar -> convertir workflows -> generar cola
#   -> traer resultados y workflows -> destruir la instancia
#
#   ./run_all.sh              sesión completa
#   ./run_all.sh --setup      solo montar y dejar el pod vivo para trabajar a mano
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

SOLO_SETUP=0
[ "${1:-}" = "--setup" ] && SOLO_SETUP=1

echo "==> [1/6] Preflight"
./00_preflight.sh || { echo "Preflight en rojo. No se alquila nada."; exit 1; }

echo "==> [2/6] Creando pod"
./01_vast_create_pod.sh
. ./.pod
SSH="ssh -p ${SSH_PORT} -o StrictHostKeyChecking=accept-new root@${SSH_HOST}"

./watchdog_spend.sh & WATCHDOG=$!
trap 'kill "$WATCHDOG" 2>/dev/null || true' EXIT

echo "==> [3/6] Instalando (30-45 min)"
$SSH "bash /workspace/02_install_cloud.sh" 2>&1 | tee logs_install.txt

echo "==> [4/6] Convirtiendo workflows a formato API"
# Si ya hay workflows en el repo, se respetan; si no, se generan del ComfyUI vivo.
if ls prompts/workflows/*_api.json >/dev/null 2>&1; then
  echo "    ya existen en el repo, se suben tal cual"
  scp -P "$SSH_PORT" prompts/workflows/*_api.json "root@${SSH_HOST}:/workspace/prompts/workflows/"
else
  $SSH ". /workspace/venv/bin/activate && cd /workspace && \
        python3 tools/ui2api.py --list-templates && \
        for t in 'MiniMax H3' 'Wan 2.2'; do \
          python3 tools/ui2api.py --template \"\$t\" \
            -o \"prompts/workflows/\$(echo \$t | tr ' A-Z' '_a-z')_api.json\" || true; \
        done" 2>&1 | tee logs_workflows.txt
  mkdir -p prompts/workflows
  scp -P "$SSH_PORT" "root@${SSH_HOST}:/workspace/prompts/workflows/*_api.json" \
    prompts/workflows/ 2>/dev/null || echo "!! No se generó ningún workflow: revisa logs_workflows.txt"
fi

if [ "$SOLO_SETUP" = "1" ]; then
  kill "$WATCHDOG" 2>/dev/null || true
  cat <<EOF

Pod listo y EN MARCHA (sigue facturando).

  Túnel para trabajar en ComfyUI:
    ssh -p ${SSH_PORT} -L ${COMFY_PORT:-8188}:127.0.0.1:${COMFY_PORT:-8188} root@${SSH_HOST}
    navegador -> http://127.0.0.1:${COMFY_PORT:-8188}

  Al terminar, SIEMPRE:
    ./04_collect_and_shutdown.sh
EOF
  exit 0
fi

echo "==> [5/6] Generando la cola"
$SSH ". /workspace/venv/bin/activate && \
      python3 /workspace/03_run_queue.py \
        --queue /workspace/${QUEUE_FILE:-prompts/queue.json} \
        --out ${REMOTE_OUT:-/workspace/outputs}" 2>&1 | tee logs_queue.txt

kill "$WATCHDOG" 2>/dev/null || true
echo "==> [6/6] Recogiendo y destruyendo"
./04_collect_and_shutdown.sh

echo
echo "Hecho. Clips en ${LOCAL_OUT:-./outputs}, workflows en prompts/workflows/."
echo "Guárdalos: git add prompts/workflows && git commit -m 'workflows' && git push"
