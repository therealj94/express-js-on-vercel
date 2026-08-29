#!/usr/bin/env bash
# Garantía dura: nada queda encendido si se cruza el plazo o el piso de saldo.
#   HORAS=6  PISO=19.5  ./guardian.sh
export VAST_API_KEY="${VAST_API_KEY:?exporta VAST_API_KEY antes de usar el guardián}"
cd "$(dirname "$0")" || exit 1
HORAS=${HORAS:-6}
PISO=${PISO:-19.5}
LIMITE=$(( SECONDS + HORAS * 3600 ))

matar_todo() {
  for I in $(python3 tools/vast_api.py status 2>/dev/null | awk '{print $1}'); do
    python3 tools/vast_api.py destroy "$I"
  done
}

echo "guardian: plazo ${HORAS} h, piso \$${PISO}"
while [ "$SECONDS" -lt "$LIMITE" ]; do
  SALDO=$(python3 tools/vast_api.py whoami 2>/dev/null \
          | grep -o 'saldo \$[0-9.]*' | tr -dc 0-9.)
  if [ -n "$SALDO" ] && python3 -c "import sys; sys.exit(0 if $SALDO < $PISO else 1)"; then
    echo "guardian: saldo \$${SALDO} bajo el piso -> destruyo todo"
    matar_todo
    exit 2
  fi
  sleep 300
done
echo "guardian: plazo cumplido -> destruyo lo que quede"
matar_todo
