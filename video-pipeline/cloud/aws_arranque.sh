#!/bin/bash
# ARRANQUE en EC2 (user-data). Corre en el ANFITRIÓN, como root, una sola vez.
# tools/aws_api.py rellena los __MARCADORES__ antes de crear la instancia.
#
# Lo que hace, en orden:
#   1. Tope duro: la máquina se apaga (= se destruye) a las HORAS pase lo que
#      pase. No depende de que nadie la vigile desde fuera.
#   2. Sube el log a S3 cada minuto: es la única ventana, no hay puerto abierto.
#   3. Restaura la caché de S3 (pesos + entorno) si existe.
#   4. Corre el MISMO cloud/onstart.sh que en Vast, dentro de la MISMA imagen.
#   5. Si no había caché y la instalación terminó bien, la siembra en S3.
#   6. Al ver "TRABAJO COMPLETO", o si el contenedor muere, se apaga.
set -uo pipefail
BUCKET="__BUCKET__"
TRABAJO="__TRABAJO__"
HORAS="__HORAS__"
IMAGEN="__IMAGEN__"

# 1 --------------------------------------------------------------------------
# Lo primero de todo. InstanceInitiatedShutdownBehavior=terminate convierte
# este apagado en destrucción: no queda disco cobrando.
shutdown -h "+$((HORAS * 60))" "video-pipeline: tope de ${HORAS} h"

W=/workspace
mkdir -p "$W"
LOG="$W/onstart.log"
exec >> "$W/anfitrion.log" 2>&1
di() { echo "[anfitrion $(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

T=$(curl -s -X PUT http://169.254.169.254/latest/api/token \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 600")
IID=$(curl -s -H "X-aws-ec2-metadata-token: $T" \
      http://169.254.169.254/latest/meta-data/instance-id)
di "===== arranque EC2 ${IID} $(date -u) — tope ${HORAS} h ====="

apagar() {
  di "==> APAGADO: $1"
  aws s3 cp "$LOG" "s3://$BUCKET/logs/$IID.log" --quiet || true
  aws s3 cp "$W/anfitrion.log" "s3://$BUCKET/logs/$IID.anfitrion.log" --quiet || true
  shutdown -h now
  exit 0
}

# 2 --------------------------------------------------------------------------
command -v aws >/dev/null || { apt-get update -qq; apt-get install -y -qq awscli; }
command -v zstd >/dev/null || apt-get install -y -qq zstd
(
  while true; do
    aws s3 cp "$LOG" "s3://$BUCKET/logs/$IID.log" --quiet 2>/dev/null
    sleep 60
  done
) &

# s5cmd: decenas de conexiones en paralelo contra S3. `aws s3 cp` se queda en
# unos cientos de MB/s; esto llega al límite de la red de la máquina.
S5=/usr/local/bin/s5cmd
if [ ! -x "$S5" ]; then
  curl -fsSL https://github.com/peak/s5cmd/releases/download/v2.3.0/s5cmd_2.3.0_Linux-64bit.tar.gz \
    | tar xz -C /usr/local/bin s5cmd || S5=""
fi
copiar() {  # origen destino — con s5cmd si está, si no con la CLI de AWS
  if [ -n "$S5" ]; then "$S5" --numworkers 64 cp "$1" "$2"
  else aws s3 cp --recursive "${1%\*}" "$2" --only-show-errors; fi
}

# 3 --------------------------------------------------------------------------
# El manifiesto es lo último que se sube al sembrar: si existe, la caché está
# entera. Cada línea es "tamaño ruta"; un fichero que no cuadre se borra y el
# onstart lo vuelve a bajar de Hugging Face. Si no está verificado, no existe.
CACHE=0
if aws s3 cp "s3://$BUCKET/cache/manifest.txt" "$W/manifest.txt" --quiet 2>/dev/null; then
  t0=$SECONDS
  di "==> caché encontrada en S3, restaurando"
  aws s3 cp "s3://$BUCKET/cache/entorno.tar.zst" - | tar -I zstd -xf - -C "$W" \
    || di "!! el entorno no se restauró: se instala desde cero"
  mkdir -p "$W/ComfyUI/models"
  copiar "s3://$BUCKET/cache/models/*" "$W/ComfyUI/models/" > "$W/cache.log" 2>&1 \
    || di "!! la copia de pesos terminó con error (se completa desde HF)"
  MAL=0
  while read -r tam ruta; do
    f="$W/ComfyUI/models/$ruta"
    if [ "$(stat -c %s "$f" 2>/dev/null)" != "$tam" ]; then
      di "!! no cuadra: $ruta"; rm -f "$f"; MAL=$((MAL + 1))
    fi
  done < "$W/manifest.txt"
  di "==> caché restaurada en $((SECONDS - t0)) s ($(du -sh "$W/ComfyUI/models" | cut -f1), ${MAL} ficheros malos)"
  [ "$MAL" -eq 0 ] && CACHE=1
else
  di "==> sin caché en S3: instalación completa desde Hugging Face"
fi

# 4 --------------------------------------------------------------------------
# El paquete del trabajo (onstart, runner, cola, workflows) y los secretos
# viajan por S3, no por el user-data: el user-data lo puede leer cualquiera con
# acceso de lectura a EC2 en la cuenta. Los secretos se borran al leerlos.
aws s3 cp "s3://$BUCKET/trabajos/$TRABAJO/paquete.tar.gz" - | tar xz -C "$W" \
  || apagar "no se pudo leer el paquete del trabajo"
aws s3 cp "s3://$BUCKET/trabajos/$TRABAJO/secretos.env" "$W/.secretos.env" --quiet \
  || apagar "no se pudieron leer los secretos"
aws s3 rm "s3://$BUCKET/trabajos/$TRABAJO/secretos.env" --quiet || true
chmod 600 "$W/.secretos.env"

command -v docker >/dev/null || apagar "la AMI no trae Docker"
di "==> bajando la imagen ${IMAGEN}"
docker pull -q "$IMAGEN" || apagar "no se pudo bajar la imagen"

# --network host: el contenedor ve el servicio de metadatos y ComfyUI queda en
# el 127.0.0.1 del anfitrión. No hay reglas de entrada: nada es alcanzable.
docker run -d --name pod --gpus all --network host --shm-size 16g \
  -v "$W:/workspace" --env-file "$W/.secretos.env" -e WORK=/workspace \
  "$IMAGEN" bash /workspace/onstart.sh > /dev/null \
  || apagar "docker run falló (¿GPU visible?)"
sleep 20; rm -f "$W/.secretos.env"

# 5 y 6 ----------------------------------------------------------------------
SEMBRANDO=""
while true; do
  if [ "$CACHE" = "0" ] && [ -z "$SEMBRANDO" ] && [ -f "$W/.instalado" ]; then
    di "==> instalación correcta: sembrando la caché en S3 (en segundo plano)"
    (
      set -e
      cd "$W/ComfyUI/models"
      find . -type f ! -name '*.aria2' -printf '%s %P\n' | sort -k2 > "$W/manifest.nuevo"
      copiar "$W/ComfyUI/models/*" "s3://$BUCKET/cache/models/" > "$W/siembra.log" 2>&1
      tar -I 'zstd -T0 -3' -cf - -C "$W" --exclude=ComfyUI/models venv ComfyUI \
        | aws s3 cp - "s3://$BUCKET/cache/entorno.tar.zst" --expected-size 30000000000
      # El manifiesto al final: es la firma de que todo lo anterior subió.
      aws s3 cp "$W/manifest.nuevo" "s3://$BUCKET/cache/manifest.txt" --quiet
      echo "[anfitrion $(date -u +%H:%M:%S)] ==> CACHÉ SEMBRADA" >> "$LOG"
    ) || di "!! la siembra falló; la próxima sesión instalará desde HF" &
    SEMBRANDO=$!
  fi
  if grep -q "TRABAJO COMPLETO" "$LOG" 2>/dev/null; then
    # La siembra puede ir por detrás de la generación. Se espera, con tope.
    if [ -n "$SEMBRANDO" ] && kill -0 "$SEMBRANDO" 2>/dev/null; then
      di "==> trabajo completo; esperando a que acabe la siembra (máx. 30 min)"
      for _ in $(seq 180); do kill -0 "$SEMBRANDO" 2>/dev/null || break; sleep 10; done
    fi
    apagar "TRABAJO COMPLETO"
  fi
  [ "$(docker inspect -f '{{.State.Running}}' pod 2>/dev/null)" = "true" ] \
    || { docker logs --tail 40 pod >> "$LOG" 2>&1; apagar "el contenedor terminó"; }
  sleep 30
done
