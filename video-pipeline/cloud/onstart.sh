#!/usr/bin/env bash
# ONSTART de Vast: el pod se instala solo, sin SSH. Variables: HF_TOKEN,
# UI_USER, UI_PASS, MODELS (h3,flux,wan), VOZ. Progreso en el log de Vast.
set -uo pipefail
exec > >(tee -a /workspace/onstart.log) 2>&1
echo "===== onstart $(date -u) ====="

WORK=/workspace
PORT=8188
UI_USER="${UI_USER:-jose}"
UI_PASS="${UI_PASS:-$(head -c 9 /dev/urandom | base64 | tr -d '/+=')}"

nvidia-smi || { echo "!! Sin GPU. Destruye esta instancia."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git git-lfs ffmpeg aria2 rsync jq curl debian-keyring \
  debian-archive-keyring apt-transport-https python3.11 python3.11-venv python3.11-dev
git lfs install

python3.11 -m venv "$WORK/venv"; . "$WORK/venv/bin/activate"
pip install -q --upgrade pip wheel
pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -q "huggingface_hub[cli,hf_transfer]" websocket-client requests
# Xet revienta con los ficheros grandes de H3 ("Internal Writer Error") y
# hf_transfer está deprecado: descarga HTTP normal.
export HF_HUB_DISABLE_XET=1 HF_HOME="$WORK/hf"
[ -n "${HF_TOKEN:-}" ] && hf auth login --token "$HF_TOKEN" --add-to-git-credential

# --- ComfyUI + nodos ---
[ -d "$WORK/ComfyUI" ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI "$WORK/ComfyUI"
pip install -q -r "$WORK/ComfyUI/requirements.txt"
CN="$WORK/ComfyUI/custom_nodes"; mkdir -p "$CN"
for repo in \
  https://github.com/Comfy-Org/ComfyUI-Manager \
  https://github.com/kijai/ComfyUI-KJNodes \
  https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite \
  https://github.com/city96/ComfyUI-GGUF \
  https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler \
  https://github.com/Fannovel16/ComfyUI-Frame-Interpolation ; do
  d="$CN/$(basename "$repo")"; [ -d "$d" ] || git clone --depth 1 "$repo" "$d"
  [ -f "$d/requirements.txt" ] && pip install -q -r "$d/requirements.txt"
done

# --- Pesos, según la VRAM real de la tarjeta ---
VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
if   [ "$VRAM" -ge 80000 ]; then PREC=bf16
elif [ "$VRAM" -ge 40000 ]; then PREC=fp8
else PREC=int8; fi
echo "==> VRAM ${VRAM} MB -> ${PREC}"
# BF16 de H3 pesa ~110 GB; con FLUX.2 encima no caben en 300 GB.
LIBRE0=$(df -BG --output=avail "$WORK" | tail -1 | tr -dc 0-9)
echo "==> disco disponible al empezar: ${LIBRE0} GB"
if [ "$PREC" = "bf16" ] && [ "${LIBRE0:-999}" -lt 380 ]; then
  echo "!! Con BF16 y ${LIBRE0} GB el disco quedará al límite. Usa --disk 400."
fi

M="$WORK/ComfyUI/models"; mkdir -p "$M"/{diffusion_models,text_encoders,vae,loras}
# Descarga con aria2c y 16 conexiones por fichero. El cliente de Hugging Face
# usa UNA conexión y HF la limita a ~15-20 Mbps: tres hosts en tres países
# dieron lo mismo, así que el cuello es HF, no la red del pod. Con 16 hilos
# sube a cientos de Mbps.
baja() {  # repo, ruta_dentro_del_repo, destino
  local url="https://huggingface.co/$1/resolve/main/$2"
  local dst="$3" nom="${2##*/}"
  local intento
  for intento in 1 2 3; do
    aria2c -x16 -s16 -k10M --file-allocation=none --console-log-level=warn \
      --header="Authorization: Bearer ${HF_TOKEN}" \
      -d "$dst" -o "$nom" "$url" && return 0
    echo "!! $nom falló (intento ${intento}/3)"; sleep 10
  done
  echo "!! FALLO DEFINITIVO: $nom"; return 1
}

# Un modelo para todo: H3 genera imagen fija además de vídeo, así que los
# stills de casting salen del mismo modelo que los clips. Eso ahorra los 35 GB
# de FLUX y, más importante, hace que la imagen de partida y el vídeo compartan
# estética — que es justo lo que pide un look unificado.
case "$PREC" in
  bf16|fp8) DIF=minimax_h3_fl2va_pruned_fp8_scaled.safetensors ;;
  *)        DIF=minimax_h3_fl2va_pruned_int8_convrot.safetensors ;;
esac
R=Comfy-Org/MiniMax-H3
baja "$R" "diffusion_models/${DIF}"                              "$M/diffusion_models"
baja "$R" "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors" "$M/text_encoders"
baja "$R" "vae/minimax_h3_video_vae_fp16.safetensors"            "$M/vae"
baja "$R" "vae/minimax_h3_audio_vae_fp32.safetensors"            "$M/vae"
baja "$R" "loras/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors" "$M/loras"
baja "$R" "loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors"      "$M/loras"
baja fal/MiniMax-H3-Realism-People-LoRA \
     "h3-realism-people-t2v-i2v-r2v.safetensors" "$M/loras" || true

rm -rf "$M"/_h3 "$M"/_wan "$M"/_img "$M"/_turbo
du -sh "$M"/* 2>/dev/null
LIBRE=$(df -BG --output=avail "$WORK" | tail -1 | tr -dc 0-9)
echo "==> disco libre: ${LIBRE} GB"
[ "${LIBRE:-99}" -lt 15 ] && echo "!! Queda poco disco: la generación puede fallar al guardar."

# --- Voz y labial (VOZ=1) ---------------------------------------------------
# La voz no se le pide al modelo de vídeo: su labial en español es una lotería
# y esta pieza tiene una sola línea hablada. Se genera aparte y se sincroniza
# encima. Chatterbox es abierto y en pruebas ciegas ganó a los de pago.
if [ "${VOZ:-0}" = "1" ]; then
  pip install -q chatterbox-tts || echo "!! chatterbox no instalado"
  d="$WORK/LatentSync"
  [ -d "$d" ] || git clone --depth 1 https://github.com/bytedance/LatentSync "$d"
  pip install -q -r "$d/requirements.txt" 2>/dev/null || \
    echo "!! requisitos de LatentSync incompletos: el labial se hará en post"
  echo "==> voz y labial preparados"
fi

# --- Autenticación delante de ComfyUI -------------------------------------
# ComfyUI no tiene login. En una IP pública sin proxy, cualquiera que escanee
# el puerto tiene tu GPU. Regla: si la autenticación no se puede montar, el
# servicio NO se expone (falla cerrado, nunca abierto).
mkdir -p "$WORK/outputs"
apt-get install -y -qq nginx openssl || true

if command -v nginx >/dev/null && command -v openssl >/dev/null; then
  HASH=$(openssl passwd -apr1 "$UI_PASS")            # formato htpasswd
  printf '%s:%s\n' "$UI_USER" "$HASH" > /etc/nginx/.htpasswd
  cat > /etc/nginx/sites-available/comfy <<NGINX
server {
    listen ${PORT} default_server;
    client_max_body_size 512M;
    location / {
        auth_basic           "video-pipeline";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass         http://127.0.0.1:9000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;      # ComfyUI usa WebSocket
        proxy_set_header   Connection "upgrade";        # para el progreso
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering    off;
    }
}
NGINX
  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/comfy /etc/nginx/sites-enabled/comfy
  if nginx -t 2>&1; then
    nohup "$WORK/venv/bin/python" "$WORK/ComfyUI/main.py" \
      --listen 127.0.0.1 --port 9000 --output-directory "$WORK/outputs" \
      >> "$WORK/comfy.log" 2>&1 &
    nginx || service nginx start || true
    AUTH_OK=1
  fi
fi

if [ "${AUTH_OK:-0}" != "1" ]; then
  echo "!! No se pudo montar la autenticación. ComfyUI queda SOLO en localhost."
  echo "!! Accede por túnel:  ssh -p <puerto> -L 8188:127.0.0.1:9000 root@<host>"
  nohup "$WORK/venv/bin/python" "$WORK/ComfyUI/main.py" \
    --listen 127.0.0.1 --port 9000 --output-directory "$WORK/outputs" \
    >> "$WORK/comfy.log" 2>&1 &
fi

# --- Subida automática de resultados (opcional) ----------------------------
# Si hay bucket configurado, el pod sube lo que genere cada minuto. Así los
# clips salen del pod sin depender de SSH ni de que nadie esté mirando, y
# sobreviven aunque la instancia muera de golpe.
if [ -n "${RCLONE_CONF_B64:-}" ] && [ -n "${RCLONE_REMOTE:-}" ]; then
  curl -fsSL https://rclone.org/install.sh | bash >/dev/null 2>&1 || \
    apt-get install -y -qq rclone || true
  if command -v rclone >/dev/null; then
    mkdir -p /root/.config/rclone
    echo "$RCLONE_CONF_B64" | base64 -d > /root/.config/rclone/rclone.conf
    nohup bash -c 'while true; do
        rclone copy /workspace/outputs "'"$RCLONE_REMOTE"'" \
          --transfers 4 --checkers 8 --min-age 20s >> /workspace/rclone.log 2>&1
        sleep 60
      done' >/dev/null 2>&1 &
    echo "==> subida automática activa -> ${RCLONE_REMOTE}"
  else
    echo "!! rclone no se instaló; los resultados solo saldrán por el navegador"
  fi
fi

# --- Modo desatendido -------------------------------------------------------
# Con una cola, el pod genera todo solo y lo avisa por el log.
if [ -n "${JOB_QUEUE_B64:-}" ]; then
  # La cola va JUNTO a los workflows: el runner resuelve job["workflow"] como
  # ruta relativa a la propia cola, así que dejarla en /workspace la haría
  # buscar en /workspace/workflows y no encontrar nada — la tanda entera se
  # perdería después de haber pagado la instalación.
  mkdir -p "$WORK/prompts"
  echo "$JOB_QUEUE_B64" | base64 -d | gunzip > "$WORK/prompts/cola.json"
  echo "${JOB_RUNNER_B64:-}" | base64 -d | gunzip > "$WORK/03_run_queue.py" 2>/dev/null
  echo "${JOB_WORKFLOWS_B64:-}" | base64 -d > "$WORK/workflows.tar" 2>/dev/null && \
    tar xf "$WORK/workflows.tar" -C "$WORK" 2>/dev/null

  # Sin runner o sin workflows no hay tanda: abortar antes de gastar.
  N_WF=$(ls "$WORK/prompts/workflows/"*.json 2>/dev/null | wc -l)
  if [ ! -s "$WORK/03_run_queue.py" ] || [ "$N_WF" -eq 0 ]; then
    echo "!! TRABAJO ABORTADO: runner=$( [ -s "$WORK/03_run_queue.py" ] && echo ok || echo FALTA )," \
         "workflows=${N_WF}. No se genera nada."
    echo "==> TRABAJO COMPLETO"
  else
    echo "==> TRABAJO: ${N_WF} workflows, arrancando cola desatendida"
    # 8188 es nginx y pide contraseña; ComfyUI escucha en 9000.
    COMFY_URL=http://127.0.0.1:9000 stdbuf -oL -eL "$WORK/venv/bin/python" -u "$WORK/03_run_queue.py" \
        --queue "$WORK/prompts/cola.json" --out "$WORK/outputs" 2>&1
    # Dar tiempo a que rclone suba lo último antes de que nadie destruya nada.
    sleep 20
    # Sacar los resultados del pod sin depender de que nadie entre a
    # descargarlos: un enlace público por clip, impreso en el log. Sin cuentas
    # ni credenciales. Los enlaces caducan solos a los pocos días.
    echo "==> ENLACES DE DESCARGA"
    for f in "$WORK"/outputs/*.mp4 "$WORK"/outputs/*.png; do
      [ -f "$f" ] || continue
      U=$(curl -s --max-time 300 -F "file=@${f}" https://0x0.st 2>/dev/null | tr -d '\r\n')
      case "$U" in http*) echo "    $(basename "$f") -> $U" ;;
                   *)     echo "    $(basename "$f") -> no se pudo subir" ;; esac
    done
    echo "==> TRABAJO COMPLETO"   # el guardián ve esto y destruye la instancia

    # Sin autodestrucción: la clave de instancia llega DESPUÉS de crear, y
    # poner la de la cuenta daría control total a una máquina ajena.
  fi
fi

cat <<EOF

=========================================================
  LISTO.  autenticación: ${AUTH_OK:-0}  (1 = puerto ${PORT} protegido)
  Usuario: ${UI_USER}
  Clave  : ${UI_PASS}
  Guarda esta clave: no vuelve a mostrarse.
=========================================================
EOF
