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
stage() {  # repo, "patrones separados por espacio", destino
  # Con reintentos: una descarga de 110 GB cortada a la mitad deja el pod
  # inservible y ya ha pasado.
  # OJO: --include acepta UN patrón. Si se pasan varios seguidos, el CLI los
  # toma como nombres de fichero e IGNORA el filtro entero: se descarga el
  # repositorio completo (100+ GB) y el disco revienta. Un flag por patrón.
  local repo="$1" dst="$3" args=() pat
  for pat in $2; do args+=(--include "$pat"); done
  local intento
  for intento in 1 2 3; do
    hf download "$repo" "${args[@]}" --local-dir "$dst" && return 0
    echo "!! descarga de $repo falló (intento ${intento}/3), reintentando..."
    sleep 15
  done
  echo "!! FALLO DEFINITIVO descargando $repo"
  return 1
}
# MODELS decide qué se baja: cada bloque que quitas son minutos y GB menos.
#   h3   ~35 GB  vídeo (imprescindible)      flux ~35 GB  stills de alta calidad
#   wan  ~10 GB  control fino y LoRAs        lora  125 MB realismo (siempre)
MODELS="${MODELS:-h3,flux,wan}"
tiene() { case ",$MODELS," in *",$1,"*) return 0;; *) return 1;; esac; }

# Ficheros EXACTOS, no patrones: el repo pesa 471 GB y "*bf16*" casa con 270,
# incluyendo duplicados que no se usan. El juego mínimo son 42 GB.
case "$PREC" in
  bf16|fp8) DIF=minimax_h3_fl2va_pruned_fp8_scaled.safetensors
            TXT=qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors ;;
  *)        DIF=minimax_h3_fl2va_pruned_int8_convrot.safetensors
            TXT=qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors ;;
esac
tiene h3 && stage Comfy-Org/MiniMax-H3 \
  "diffusion_models/${DIF} text_encoders/${TXT} vae/minimax_h3_video_vae_fp16.safetensors vae/minimax_h3_audio_vae_fp32.safetensors" \
  "$M/_h3"
tiene wan && stage Comfy-Org/Wan_2.2_ComfyUI_Repackaged \
  "split_files/diffusion_models/wan2.2_ti2v_5B*" "$M/_wan"
tiene flux && stage Comfy-Org/FLUX.2-dev_ComfyUI \
  "split_files/diffusion_models/*fp8* split_files/text_encoders/* split_files/vae/*" "$M/_img"
hf download fal/MiniMax-H3-Realism-People-LoRA --local-dir "$M/loras/h3-realism" || true
# Los turbo de H3 se cargan COMO LoRA. Fuera de models/loras ComfyUI los da
# por faltantes, y su botón de descarga los baja al dispositivo del usuario.
if tiene h3; then
  stage Comfy-Org/MiniMax-H3 "*turbo*step*" "$M/_turbo"
  find "$M/_turbo" -name '*.safetensors' -exec mv -n {} "$M/loras/" \; 2>/dev/null
  rm -rf "$M/_turbo"
fi

# colocar todo en el árbol de ComfyUI
# Clasificar por RUTA de origen y por nombre. Los turbo de H3 se distribuyen
# como LoRA (~1.8 GB) y ComfyUI solo los ve en models/loras: si caen en
# diffusion_models, el workflow los da por "faltantes" aunque estén descargados.
find "$M/_h3" -name '*.safetensors' 2>/dev/null | while read -r f; do
  case "$f" in
    */loras/*|*lora*|*turbo*)          d=loras ;;
    *text_encoder*|*umt5*|*t5*|*qwen*) d=text_encoders ;;
    *vae*)                             d=vae ;;
    *)                                 d=diffusion_models ;;
  esac
  mkdir -p "$M/$d"; mv -n "$f" "$M/$d/"
done
for s in diffusion_models text_encoders vae; do
  for stg in _wan _img; do
    [ -d "$M/$stg/split_files/$s" ] && rsync -a "$M/$stg/split_files/$s/" "$M/$s/"
  done
done
rm -rf "$M"/_h3 "$M"/_wan "$M"/_img
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
    COMFY_URL=http://127.0.0.1:9000 "$WORK/venv/bin/python" "$WORK/03_run_queue.py" \
        --queue "$WORK/prompts/cola.json" --out "$WORK/outputs" 2>&1 | tail -60
    # Dar tiempo a que rclone suba lo último antes de que nadie destruya nada.
    sleep 90
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
