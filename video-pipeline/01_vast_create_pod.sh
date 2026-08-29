#!/usr/bin/env bash
# Busca ofertas fiables en Vast.ai, crea la instancia y deja el pod listo para instalar.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

: "${VAST_API_KEY:?falta VAST_API_KEY en .env}"
GPU_NAME="${GPU_NAME:-RTX_5090}"
MIN_GPU_RAM="${MIN_GPU_RAM:-32}"
NUM_GPUS="${NUM_GPUS:-1}"
MAX_DPH="${MAX_DPH:-1.20}"
MIN_DISK="${MIN_DISK:-300}"
DISK_GB="${DISK_GB:-350}"
INTERRUPTIBLE="${INTERRUPTIBLE:-0}"
VAST_IMAGE="${VAST_IMAGE:-pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel}"

command -v vastai >/dev/null || pip install --quiet --upgrade vastai
vastai set api-key "$VAST_API_KEY" >/dev/null

# --- Filtros de confiabilidad ---
#  reliability > 0.99  : uptime histórico del host
#  verified            : datacenter auditado por Vast (no PC doméstico)
#  inet_down/up        : ~60 GB de pesos a bajar, clips a subir
#  duration            : el host se compromete a >= 3 días
#  cuda_vers           : 12.8 para Blackwell / checkpoints FP8-FP4
QUERY="reliability > 0.99 \
 verified=true \
 rentable=true \
 num_gpus=${NUM_GPUS} \
 gpu_name=${GPU_NAME} \
 gpu_ram >= ${MIN_GPU_RAM} \
 disk_space > ${MIN_DISK} \
 inet_down > 500 \
 inet_up > 200 \
 inet_down_cost < ${MAX_INET_COST:-0.02} \
 inet_up_cost < ${MAX_INET_COST:-0.02} \
 storage_cost < ${MAX_STORAGE_COST:-0.15} \
 cuda_vers >= 12.8 \
 duration > 3 \
 dph_total < ${MAX_DPH}"
[ "$INTERRUPTIBLE" = "1" ] || QUERY="${QUERY} rented=false"

echo "==> Buscando ofertas: ${GPU_NAME} <= \$${MAX_DPH}/h"
vastai search offers "$QUERY" -o 'dph_total' | head -n 15

OFFER_ID="${OFFER_ID:-$(vastai search offers "$QUERY" -o 'dph_total' --raw \
  | python3 -c 'import json,sys; o=json.load(sys.stdin); print(o[0]["id"] if o else "")')}"

if [ -z "$OFFER_ID" ]; then
  echo "!! Sin ofertas. Sube MAX_DPH, baja MIN_GPU_RAM o prueba otra GPU_NAME." >&2
  exit 1
fi

echo "==> Creando instancia sobre la oferta ${OFFER_ID}"
vastai create instance "$OFFER_ID" \
  --image "$VAST_IMAGE" \
  --disk "$DISK_GB" \
  --ssh --direct \
  --env "-e HF_TOKEN=${HF_TOKEN:-} -e HF_HUB_ENABLE_HF_TRANSFER=1 -p ${COMFY_PORT:-8188}:${COMFY_PORT:-8188}" \
  --onstart-cmd "touch /workspace/.pod_ready" \
  --raw | tee .last_create.json

INSTANCE_ID="$(python3 -c 'import json;print(json.load(open(".last_create.json"))["new_contract"])')"
echo "$INSTANCE_ID" > .instance_id
echo "==> Instancia ${INSTANCE_ID} creada. Esperando SSH..."

for i in $(seq 1 60); do
  SSH_URL="$(vastai ssh-url "$INSTANCE_ID" 2>/dev/null || true)"
  [ -n "$SSH_URL" ] && break
  sleep 10
done
[ -n "${SSH_URL:-}" ] || { echo "!! La instancia no expuso SSH a tiempo" >&2; exit 1; }

# ssh://root@host:port  ->  -p port root@host
SSH_HOST="$(echo "$SSH_URL" | sed -E 's#ssh://[^@]+@([^:]+):.*#\1#')"
SSH_PORT="$(echo "$SSH_URL" | sed -E 's#.*:([0-9]+)$#\1#')"
printf 'SSH_HOST=%s\nSSH_PORT=%s\nINSTANCE_ID=%s\n' "$SSH_HOST" "$SSH_PORT" "$INSTANCE_ID" > .pod

echo "==> Subiendo instalador y cola"
scp -P "$SSH_PORT" -o StrictHostKeyChecking=accept-new \
  02_install_cloud.sh 03_run_queue.py "root@${SSH_HOST}:/workspace/"
scp -P "$SSH_PORT" -r prompts "root@${SSH_HOST}:/workspace/" 2>/dev/null || true

cat <<EOF

Pod listo.
  ssh -p ${SSH_PORT} root@${SSH_HOST}
  bash /workspace/02_install_cloud.sh          # instalación (~20-40 min)
  python3 /workspace/03_run_queue.py --queue /workspace/prompts/queue.json

Túnel para la UI de ComfyUI:
  ssh -p ${SSH_PORT} -L ${COMFY_PORT:-8188}:127.0.0.1:${COMFY_PORT:-8188} root@${SSH_HOST}
EOF
