#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Vigilante del validador de la cadena 5550 (Besu / QBFT).
#
# POR QUE EXISTE
# Los siete validadores no tenian NADA que los mirara. Con siete se aguantan
# dos caidas — pero solo si alguien se entera de la primera antes de que llegue
# la tercera. Si un validador muere de madrugada, sin esto se entera quien pase
# por ahi de casualidad.
#
# QUE HACE, POR ORDEN
#   1. Si el servicio esta caido, lo levanta.
#   2. Si la altura no se movio y el nodo se quedo SIN PARES, esta aislado:
#      reiniciar suele devolverlo a la malla.
#   3. Si la altura no se movio pero SI tiene pares, el problema puede no ser
#      de este nodo sino de la cadena. Se le da una oportunidad de reinicio y,
#      si sigue igual, se avisa en vez de seguir reiniciando en bucle: un
#      validador reiniciandose cada tres minutos estorba mas de lo que ayuda.
#
# LO QUE NO HACE
# No toca la llave, no borra datos y no vota nada. Solo arranca y reinicia un
# servicio. Cualquier cosa que implique cambiar el conjunto de validadores es
# una decision de personas.
#
# EL AVISO
# Va al tema SNS `og5550-avisos`, que reparte por correo. Esta limitado a uno
# por hora: si algo va mal de verdad, un correo basta para ir a mirar; sesenta
# correos solo consiguen que se ignoren.
#
# Se instala con ogb-vigia.timer, cada 3 minutos. La altura sube cada 10 s, asi
# que en tres minutos deberia haber avanzado ~18 bloques: si no se movio ni uno,
# esta parado de verdad y no es un retraso de red.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

RPC="http://127.0.0.1:8545"
SERVICIO="besu5550"
ESTADO="/var/lib/ogb-vigia"
TEMA="arn:aws:sns:us-east-1:548380372606:og5550-avisos"
REGION="us-east-1"
NOMBRE="$(hostname)"
LIMITE_AVISO=3600   # segundos entre avisos

mkdir -p "$ESTADO"
registrar() { logger -t ogb-vigia "$*"; }

# Devuelve el valor de un `result` hexadecimal, o vacio si el RPC no contesta.
consultar() {
  curl -s -m 8 -X POST -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$1\",\"params\":[],\"id\":1}" "$RPC" 2>/dev/null \
    | grep -oE '"result":"0x[0-9a-f]+"' | grep -oE '0x[0-9a-f]+' | head -1
}

avisar() {
  local ahora ultimo
  ahora=$(date +%s)
  ultimo=$(cat "$ESTADO/ultimo-aviso" 2>/dev/null || echo 0)
  if [ $((ahora - ultimo)) -lt $LIMITE_AVISO ]; then
    registrar "aviso omitido (ya se mando uno hace menos de una hora)"
    return
  fi
  echo "$ahora" > "$ESTADO/ultimo-aviso"
  aws sns publish --region "$REGION" --topic-arn "$TEMA" \
    --subject "Orden Global 5550 · $NOMBRE necesita una mirada" \
    --message "$1" >/dev/null 2>&1 \
    && registrar "AVISO ENVIADO" \
    || registrar "no se pudo enviar el aviso (revisar permiso sns:Publish)"
}

reiniciar() {
  registrar "REPARANDO: $1"
  systemctl restart "$SERVICIO"
}

# ── 1 · el servicio ─────────────────────────────────────────────────────────
if ! systemctl is-active --quiet "$SERVICIO"; then
  reiniciar "el servicio estaba caido"
  exit 0
fi

# ── 2 · la altura y los pares ───────────────────────────────────────────────
bloque_hex=$(consultar eth_blockNumber)
pares_hex=$(consultar net_peerCount)

if [ -z "$bloque_hex" ]; then
  # El servicio corre pero el RPC no contesta: arrancando, o atascado.
  fallos=$(( $(cat "$ESTADO/rpc-mudo" 2>/dev/null || echo 0) + 1 ))
  echo "$fallos" > "$ESTADO/rpc-mudo"
  registrar "el RPC no contesta (van $fallos)"
  [ "$fallos" -ge 2 ] && reiniciar "el RPC lleva dos vueltas sin contestar"
  exit 0
fi
echo 0 > "$ESTADO/rpc-mudo"

bloque=$((bloque_hex))
pares=$(( ${pares_hex:-0x0} ))
anterior=$(cat "$ESTADO/ultimo-bloque" 2>/dev/null || echo 0)
antes=$(cat "$ESTADO/ultima-medida" 2>/dev/null || echo 0)
ahora=$(date +%s)

# Que no se haya movido solo significa algo si paso tiempo suficiente. Sin esta
# guardia, dos ejecuciones seguidas —el temporizador y una a mano, o un
# reintento— verian el mismo bloque y lo cantarian como atasco. Los bloques
# salen cada 10 s: por debajo de 60 s no hay nada que concluir.
if [ $((ahora - antes)) -lt 60 ]; then
  exit 0
fi
echo "$bloque" > "$ESTADO/ultimo-bloque"
echo "$ahora"  > "$ESTADO/ultima-medida"

# ── 3 · avanza: todo en orden ───────────────────────────────────────────────
if [ "$bloque" -gt "$anterior" ]; then
  echo 0 > "$ESTADO/atascos"
  vuelta=$(( $(cat "$ESTADO/vueltas" 2>/dev/null || echo 0) + 1 ))
  echo "$vuelta" > "$ESTADO/vueltas"
  # Se anota una de cada veinte (una hora) para no llenar el diario.
  [ $((vuelta % 20)) -eq 0 ] && registrar "avanzando ok · bloque $bloque · pares $pares"
  exit 0
fi

# ── 4 · no avanza ───────────────────────────────────────────────────────────
atascos=$(( $(cat "$ESTADO/atascos" 2>/dev/null || echo 0) + 1 ))
echo "$atascos" > "$ESTADO/atascos"
registrar "ESTANCADO en el bloque $bloque · pares $pares · vuelta $atascos"

if [ "$pares" -eq 0 ]; then
  reiniciar "sin pares: el nodo quedo aislado de la malla"
  exit 0
fi

# Con pares y sin avanzar, el problema puede ser de la cadena entera. Se
# reinicia UNA vez; si a la cuarta vuelta sigue igual, se avisa y se deja de
# reiniciar, porque insistir no arregla un problema de consenso.
if [ "$atascos" -eq 2 ]; then
  reiniciar "dos vueltas sin avanzar teniendo $pares pares"
elif [ "$atascos" -ge 4 ]; then
  avisar "El validador $NOMBRE lleva $((atascos * 3)) minutos sin avanzar.

Bloque: $bloque
Pares: $pares
Servicio: $(systemctl is-active $SERVICIO)

El vigilante ya reinicio Besu y no se recupero. Con pares conectados y sin
avanzar, lo mas probable es que el problema no sea de esta maquina sino de la
cadena: comprobar cuantos validadores estan vivos.

En QBFT con siete validadores hacen falta CINCO para que la cadena avance.

  qbft_getValidatorsByBlockNumber contra https://rpc.ordenglobal-rpc.com
  journalctl -t ogb-vigia -n 50   en cada nodo"
fi
