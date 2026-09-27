#!/usr/bin/env bash
# Un comando por sesión de «Un martes» en AWS Mumbai.
#
#   HF_TOKEN=hf_... ./lanzar.sh 1          # casting + stills + prueba de método
#   HF_TOKEN=hf_... ./lanzar.sh 2          # la película (antes: tools/sesion2.py)
#   HF_TOKEN=hf_... ./lanzar.sh 3 cola.json  # retomas
#
# Spot si el cupo ya llegó; si no, pregunta antes de ir a On-Demand (2,7× más
# caro). No enciende nada si el preflight da un solo PARA.
set -euo pipefail
cd "$(dirname "$0")"
S="${1:?di la sesión: 1, 2 o 3}"
: "${HF_TOKEN:?exporta HF_TOKEN (el de escritura)}"
export HF_REPO="${HF_REPO:-Therealjose54/orden-global-videos}"

case "$S" in
  1) COLA=prompts/q_p3_sesion1.json; HORAS=4 ;;
  2) COLA=prompts/q_p3_sesion2.json; HORAS=11 ;;
  3) COLA="${2:?la cola de retomas}"; HORAS=3 ;;
  *) echo "sesión 1, 2 o 3"; exit 1 ;;
esac
[ -f "$COLA" ] || { echo "!! No existe $COLA"; exit 1; }

SPOT=$(python3 - <<'PY'
import boto3
v = boto3.client("service-quotas", region_name="ap-south-1").get_service_quota(
    ServiceCode="ec2", QuotaCode="L-3819A6DF")["Quota"]["Value"]
print("1" if v >= 8 else "0")
PY
)
if [ "$SPOT" = "1" ]; then
  MODO=--spot; echo "==> cupo Spot disponible: se usa Spot"
else
  echo "!! El cupo Spot todavía no está. On-Demand cuesta ~2,7 veces más."
  read -r -p "   ¿Encender On-Demand de todas formas? (escribe si) " R
  [ "$R" = "si" ] || { echo "No se enciende nada."; exit 0; }
  MODO=""
fi

python3 tools/preflight.py --nube aws ${MODO:+--spot} \
    --guion prompts/pelicula3_un_martes.json --cola "$COLA" || {
  echo "!! El preflight dio PARA. No se enciende."; exit 1; }

python3 tools/aws_api.py create $MODO --horas "$HORAS" --job "$COLA" \
    --env HF_TOKEN="$HF_TOKEN" --env HF_REPO="$HF_REPO" --env ESPERA_MIN=20

cat <<TXT

==> Encendida. Se apaga sola al acabar la cola (+20 min de espera) o a las ${HORAS} h.
    Vigilar:   python3 tools/aws_api.py status   /   logs <i-...>
    Al final:  python3 tools/recoger.py --sesion ${S/3/2} --cola $COLA --dest <carpeta>
TXT
