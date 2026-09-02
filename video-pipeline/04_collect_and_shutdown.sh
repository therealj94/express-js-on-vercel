#!/usr/bin/env bash
# Descarga los clips del pod y lo destruye. Ejecutar desde tu máquina.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
[ -f .pod ] || { echo "!! Falta .pod (¿corriste 01_vast_create_pod.sh?)" >&2; exit 1; }
. ./.pod

REMOTE_OUT="${REMOTE_OUT:-/workspace/outputs}"
LOCAL_OUT="${LOCAL_OUT:-./outputs}"
AUTO_DESTROY="${AUTO_DESTROY:-1}"
mkdir -p "$LOCAL_OUT"

echo "==> Descargando ${REMOTE_OUT} -> ${LOCAL_OUT}"
rsync -avzP --partial --append-verify \
  -e "ssh -p ${SSH_PORT} -o StrictHostKeyChecking=accept-new" \
  "root@${SSH_HOST}:${REMOTE_OUT}/" "${LOCAL_OUT}/"

# Verificación: todo job 'ok' del manifiesto debe existir en local
if [ -f "${LOCAL_OUT}/manifest.json" ]; then
  python3 - "$LOCAL_OUT" <<'PY'
import json, sys, pathlib
out = pathlib.Path(sys.argv[1])
m = json.loads((out / "manifest.json").read_text())
missing = [f for v in m.values() if v.get("status") == "ok"
           for f in v.get("files", []) if not (out / f).exists()]
ok = sum(1 for v in m.values() if v.get("status") == "ok")
print(f"   {ok} clips ok, {len(missing)} ficheros ausentes")
if missing:
    print("   faltan:", *missing[:10], sep="\n     ")
    sys.exit(2)
PY
else
  echo "   (sin manifest.json; verificación omitida)"
fi

# Copia opcional a nube antes de destruir
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null; then
  echo "==> Subiendo a ${RCLONE_REMOTE}"
  rclone copy "$LOCAL_OUT" "$RCLONE_REMOTE" --progress
fi

if [ "$AUTO_DESTROY" = "1" ]; then
  echo "==> Destruyendo instancia ${INSTANCE_ID}"
  vastai destroy instance "$INSTANCE_ID"
  rm -f .pod .instance_id .last_create.json
  echo "Instancia destruida. Ya no se factura."
else
  echo "AUTO_DESTROY=0 -> instancia ${INSTANCE_ID} sigue viva y facturando."
fi
