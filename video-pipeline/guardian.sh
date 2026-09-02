#!/usr/bin/env bash
# Vigilante de instancias. Destruye cuando ocurre lo primero de:
#   - el pod escribe "TRABAJO COMPLETO" en su log (modo desatendido)
#   - el saldo baja del piso
#   - se cumple el plazo
#   - el puerto publicado no abre en PLAZO_PUERTO minutos (host roto)
#
#   VAST_API_KEY=... HORAS=8 PISO=15 ID=49120082 HOST=1.2.3.4 ./guardian.sh
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
HOST=${HOST:-}
PUERTO=${PUERTO:-8188}
# nginx levanta a los pocos minutos del arranque, mucho antes de que terminen
# de bajar los 75 GB de pesos. Así que si el puerto no abre en un cuarto de
# hora, el host no lo va a exponer nunca y no tiene sentido pagar la instalación
# entera para descubrirlo. El 1-sep un host con el reenvío de puertos roto se
# comió 80 minutos y $1.40 antes de que nos diéramos cuenta; con esto habría
# costado $0.30.
PLAZO_PUERTO=${PLAZO_PUERTO:-15}
PUERTO_ABIERTO=0

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

  # ¿Llegó a abrir el puerto? Se comprueba solo hasta que abra una vez.
  if [ -n "$HOST" ] && [ "$PUERTO_ABIERTO" -eq 0 ]; then
    if timeout 30 bash -c "</dev/tcp/${HOST}/${PUERTO}" 2>/dev/null; then
      PUERTO_ABIERTO=1
      echo "guardian: el puerto ${PUERTO} abrió a los $(( SECONDS / 60 )) min"
    elif [ "$SECONDS" -gt $(( PLAZO_PUERTO * 60 )) ]; then
      echo "guardian: el puerto ${PUERTO} no abrió en ${PLAZO_PUERTO} min."
      echo "guardian: host roto, no lo va a exponer -> destruyo ${ID:-todo}"
      if [ -n "$ID" ]; then python3 tools/vast_api.py destroy "$ID"; else matar_todo; fi
      exit 3
    fi
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
