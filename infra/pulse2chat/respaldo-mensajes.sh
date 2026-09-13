#!/bin/bash
# Respaldo diario del chat, fuera de la maquina que lo sostiene.
#
# ══ POR QUE EXISTE ═══════════════════════════════════════════════════════════
#
# Todo PULSE2CHAT vive en un archivo: /srv/mensajes/datos.json. Fichas,
# mensajes, grupos, el circulo de contactos y los bloqueos. Los adjuntos viven
# al lado, en archivos/.
#
# El 26 de agosto habia 36 cuentas, 77 mensajes y 12 adjuntos ahi dentro, en
# UNA sola maquina (ogb-testnet-2), sin ninguna copia automatica. Los unicos
# respaldos eran restos manuales del 15 y el 21 de agosto: si esa maquina se
# perdia, se perdia el chat entero y con el las conversaciones de la gente.
#
# ══ COMO ═════════════════════════════════════════════════════════════════════
#
# Se sube a S3 con el rol de la maquina, que tiene un permiso hecho a medida:
# SOLO PutObject y SOLO bajo respaldo-mensajes/. No puede leer, ni listar, ni
# borrar, ni tocar otro prefijo. Un nodo comprometido no consigue con esto mas
# que ensuciar su propia carpeta de respaldos.
#
# La copia se hace del JSON QUIETO. El relevo reescribe el archivo entero al
# guardar, asi que copiarlo mientras escribe puede dar medio archivo. Se copia
# primero a un temporal y se comprueba que el JSON parsea ANTES de subirlo: un
# respaldo roto que se cree bueno es peor que no tener respaldo.
#
# Los adjuntos van en un tar aparte y solo si cambiaron: son el grueso del
# tamaño y no cambian todos los dias.
set -u

CUBO=og-5550-arranque-548380372606
PREFIJO=respaldo-mensajes
DATOS=/srv/mensajes/datos.json
ADJUNTOS=/srv/mensajes/archivos
DIA=$(date -u +%Y-%m-%d)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ── el JSON ───────────────────────────────────────────────────────────────────
cp "$DATOS" "$TMP/datos.json" 2>/dev/null || { logger -t respaldo-mensajes "no se pudo leer $DATOS"; exit 1; }

if ! python3 -c "import json,sys; json.load(open('$TMP/datos.json'))" 2>/dev/null; then
  # Medio archivo. No se sube: pisaria el respaldo bueno de ayer con basura.
  logger -t respaldo-mensajes "el JSON no parsea (copia a medias) — no se sube"
  exit 1
fi

CUENTAS=$(python3 -c "import json;d=json.load(open('$TMP/datos.json'));print(len(d.get('fichas',{})))")
MENSAJES=$(python3 -c "import json;d=json.load(open('$TMP/datos.json'));print(len(d.get('mensajes',[])))")

gzip -9 -c "$TMP/datos.json" > "$TMP/datos.json.gz"
if aws s3 cp "$TMP/datos.json.gz" "s3://$CUBO/$PREFIJO/$DIA/datos.json.gz" --only-show-errors; then
  logger -t respaldo-mensajes "subido $DIA · $CUENTAS cuentas · $MENSAJES mensajes"
else
  logger -t respaldo-mensajes "FALLO al subir el JSON"
  exit 1
fi

# ── los adjuntos, solo si cambiaron ──────────────────────────────────────────
if [ -d "$ADJUNTOS" ]; then
  HUELLA=$(find "$ADJUNTOS" -type f -printf '%p %s %T@\n' 2>/dev/null | sort | md5sum | cut -d' ' -f1)
  ANTES=$(cat /var/lib/respaldo-mensajes.huella 2>/dev/null || echo '')
  if [ "$HUELLA" != "$ANTES" ]; then
    tar -czf "$TMP/archivos.tgz" -C /srv/mensajes archivos 2>/dev/null
    if aws s3 cp "$TMP/archivos.tgz" "s3://$CUBO/$PREFIJO/$DIA/archivos.tgz" --only-show-errors; then
      echo "$HUELLA" > /var/lib/respaldo-mensajes.huella
      logger -t respaldo-mensajes "adjuntos subidos ($(du -sh "$TMP/archivos.tgz" | cut -f1))"
    else
      logger -t respaldo-mensajes "FALLO al subir los adjuntos"
    fi
  else
    logger -t respaldo-mensajes "los adjuntos no cambiaron — no se resuben"
  fi
fi
