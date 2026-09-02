#!/usr/bin/env bash
# Comprueba que todo está listo ANTES de alquilar. Cuesta 0 y evita pagar
# una GPU mientras depuras una clave mal puesta.
set -uo pipefail
cd "$(dirname "$0")"
OK=0; FAIL=0
ok()   { echo "  [ok]   $1"; OK=$((OK+1)); }
bad()  { echo "  [FALTA] $1"; FAIL=$((FAIL+1)); }

echo "== Preflight =="

[ -f .env ] && ok ".env presente" || bad ".env — copia .env.example y edítalo"
[ -f .env ] && set -a && . ./.env && set +a

[ -n "${VAST_API_KEY:-}" ] && ok "VAST_API_KEY" || bad "VAST_API_KEY vacío (vast.ai -> Account -> API key)"
[ -n "${HF_TOKEN:-}" ] && ok "HF_TOKEN" || bad "HF_TOKEN vacío (huggingface.co/settings/tokens, tipo read)"

for c in python3 ssh scp rsync; do
  command -v "$c" >/dev/null && ok "$c" || bad "$c no instalado"
done
command -v vastai >/dev/null && ok "vastai CLI" || bad "vastai CLI — pip install --upgrade vastai"

ls ~/.ssh/id_*.pub >/dev/null 2>&1 && ok "clave SSH pública" \
  || bad "sin clave SSH — ssh-keygen -t ed25519, y súbela en vast.ai -> Account -> SSH Keys"

if command -v vastai >/dev/null && [ -n "${VAST_API_KEY:-}" ]; then
  vastai set api-key "$VAST_API_KEY" >/dev/null 2>&1
  BAL=$(vastai show user --raw 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin).get("credit","?"))' 2>/dev/null)
  case "$BAL" in
    ""|"?") bad "no pude leer el saldo — ¿API key válida?" ;;
    *) awk -v b="$BAL" 'BEGIN{exit !(b+0 >= 10)}' \
         && ok "saldo \$${BAL}" \
         || bad "saldo \$${BAL} — recarga al menos \$10 para arrancar" ;;
  esac
fi

# ¿Hay oferta que cumpla los filtros con el presupuesto actual?
if command -v vastai >/dev/null; then
  N=$(vastai search offers "reliability > 0.99 verified=true rentable=true \
      gpu_name=${GPU_NAME:-RTX_PRO_6000_WS} gpu_ram >= ${MIN_GPU_RAM:-90} \
      dph_total < ${MAX_DPH:-1.00}" --raw 2>/dev/null \
      | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)
  [ "${N:-0}" -gt 0 ] && ok "${N} ofertas de ${GPU_NAME:-RTX_PRO_6000_WS} bajo \$${MAX_DPH:-1.00}/h" \
    || bad "0 ofertas: sube MAX_DPH o cambia GPU_NAME en .env"
fi

python3 -c "import json;json.load(open('${QUEUE_FILE:-prompts/queue.json}'))" 2>/dev/null \
  && ok "cola JSON válida (${QUEUE_FILE:-prompts/queue.json})" \
  || bad "falta o es inválida ${QUEUE_FILE:-prompts/queue.json} — cp prompts/queue.example.json prompts/queue.json"

echo
echo "== ${OK} ok, ${FAIL} pendientes =="
[ "$FAIL" -eq 0 ] && echo "Listo para ./01_vast_create_pod.sh" || echo "Resuelve lo anterior antes de alquilar."
exit $((FAIL > 0))
