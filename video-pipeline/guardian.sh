#!/usr/bin/env bash
# Vigilante de instancias. Destruye cuando ocurre lo primero de:
#   - el pod escribe "TRABAJO COMPLETO" en su log (modo desatendido)
#   - el saldo baja del piso
#   - se cumple el plazo
#
#   VAST_API_KEY=...  HORAS=8  PISO=15  ID=49120082  ./guardian.sh
#
# Se arranca ANTES de crear la instancia y se comprueba que el proceso vive:
# una red de seguridad que no llegó a arrancar ya dejó un pod encendido toda
# una noche sin que nadie lo vigilara.
export VAST_API_KEY="${VAST_API_KEY:?exporta VAST_API_KEY antes de usar el guardián}"
cd "$(dirname "$0")" || exit 1
HORAS=${HORAS:-6}
PISO=${PISO:-15}
ID=${ID:-}
LIMITE=$(( SECONDS + HORAS * 3600 ))

matar_todo() {
  for I in $(python3 tools/vast_api.py status 2>/dev/null | awk '{print $1}'); do
    python3 tools/vast_api.py destroy "$I"
  done
}

echo "guardian: plazo ${HORAS} h, piso \$${PISO}${ID:+, vigilando trabajo en $ID}"
while [ "$SECONDS" -lt "$LIMITE" ]; do
  SALDO=$(python3 tools/vast_api.py whoami 2>/dev/null \
          | grep -o 'saldo \$[0-9.]*' | tr -dc 0-9.)
  if [ -n "$SALDO" ] && python3 -c "import sys; sys.exit(0 if $SALDO < $PISO else 1)"; then
    echo "guardian: saldo \$${SALDO} bajo el piso -> destruyo todo"
    matar_todo; exit 2
  fi

  # Modo desatendido: en cuanto la cola termina, no hay razón para seguir pagando.
  if [ -n "$ID" ]; then
    if timeout 180 python3 tools/vast_api.py logs "$ID" 2>/dev/null \
       | grep -q "TRABAJO COMPLETO"; then
      echo "guardian: el trabajo terminó -> destruyo $ID"
      python3 tools/vast_api.py destroy "$ID"; exit 0
    fi
  fi

  sleep 180
done
echo "guardian: plazo cumplido -> destruyo lo que quede"
matar_todo
