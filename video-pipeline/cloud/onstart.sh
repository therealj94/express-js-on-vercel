#!/usr/bin/env bash
# ONSTART para Vast.ai — se pega en "On-start Script" al crear la instancia.
# El pod se instala solo al arrancar: no hace falta SSH ni terminal.
# Al terminar, ComfyUI queda accesible desde el navegador con usuario y clave.
#
# Variables que debes poner en la plantilla de Vast (sección Environment):
#   HF_TOKEN   = tu token de Hugging Face (read)
#   UI_PASS    = la clave con la que entrarás a ComfyUI  (opcional; si no,
#                se genera una y aparece en el log)
#
# Progreso:  /workspace/onstart.log   (visible desde el botón Logs de Vast)
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
export HF_HUB_ENABLE_HF_TRANSFER=1 HF_HOME="$WORK/hf"
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
  # OJO: --include acepta UN patrón. Si se pasan varios seguidos, el CLI los
  # toma como nombres de fichero e IGNORA el filtro entero: se descarga el
  # repositorio completo (100+ GB) y el disco revienta. Un flag por patrón.
  local repo="$1" dst="$3" args=() pat
  for pat in $2; do args+=(--include "$pat"); done
  hf download "$repo" "${args[@]}" --local-dir "$dst" \
    || echo "!! fallo descargando $repo"
}
# MODELS decide qué se baja: cada bloque que quitas son minutos y GB menos.
#   h3   ~35 GB  vídeo (imprescindible)      flux ~35 GB  stills de alta calidad
#   wan  ~10 GB  control fino y LoRAs        lora  125 MB realismo (siempre)
MODELS="${MODELS:-h3,flux,wan}"
tiene() { case ",$MODELS," in *",$1,"*) return 0;; *) return 1;; esac; }

tiene h3 && stage Comfy-Org/MiniMax-H3 "*${PREC}* *fl2va* *ref2va* *vae* *text_encoder*" "$M/_h3"
tiene wan && stage Comfy-Org/Wan_2.2_ComfyUI_Repackaged \
  "split_files/diffusion_models/wan2.2_ti2v_5B* split_files/text_encoders/* split_files/vae/*" "$M/_wan"
tiene flux && stage Comfy-Org/FLUX.2-dev_ComfyUI \
  "split_files/diffusion_models/*fp8* split_files/text_encoders/* split_files/vae/*" "$M/_img"
hf download fal/MiniMax-H3-Realism-People-LoRA --local-dir "$M/loras/h3-realism" || true
# Las plantillas oficiales de H3 cargan los modelos turbo COMO LoRA. Sin este
# fichero en models/loras, ComfyUI marca el workflow como "modelo faltante", y
# el botón de descarga que ofrece baja el fichero AL DISPOSITIVO del usuario,
# no al pod: desde un iPad no hay forma de arreglarlo. Se baja aquí.
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
# Si viene una cola, el pod genera todo solo y avisa por el log cuando termina.
# José no abre nada: los clips salen por el bucket y la instancia se destruye.
if [ -n "${JOB_QUEUE_B64:-}" ]; then
  # La cola va JUNTO a los workflows: el runner resuelve job["workflow"] como
  # ruta relativa a la propia cola, así que dejarla en /workspace la haría
  # buscar en /workspace/workflows y no encontrar nada — la tanda entera se
  # perdería después de haber pagado la instalación.
  mkdir -p "$WORK/prompts"
  echo "$JOB_QUEUE_B64" | base64 -d > "$WORK/prompts/cola.json"
  echo "${JOB_RUNNER_B64:-}" | base64 -d > "$WORK/03_run_queue.py" 2>/dev/null
  echo "${JOB_WORKFLOWS_B64:-}" | base64 -d > "$WORK/workflows.tar" 2>/dev/null && \
    tar xf "$WORK/workflows.tar" -C "$WORK" 2>/dev/null

  # Comprobaciones antes de gastar: sin runner o sin workflows no hay tanda.
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

    # NO hay autodestrucción: Vast solo entrega la clave de instancia DESPUÉS
    # de crearla, cuando el entorno del pod ya está fijado, y meter aquí la
    # clave de la cuenta daría control total sobre ella a la máquina de un
    # tercero. El apagado depende del guardián y, en último término, del botón
    # Destroy y del piso de saldo.
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
