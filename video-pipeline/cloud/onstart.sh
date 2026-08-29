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

M="$WORK/ComfyUI/models"; mkdir -p "$M"/{diffusion_models,text_encoders,vae,loras}
stage() {  # repo, patrón, destino temporal
  hf download "$1" --include $2 --local-dir "$3" || echo "!! fallo descargando $1"
}
stage Comfy-Org/MiniMax-H3 "*${PREC}* *fl2va* *ref2va* *vae* *text_encoder*" "$M/_h3"
stage Comfy-Org/Wan_2.2_ComfyUI_Repackaged \
  "split_files/diffusion_models/wan2.2_ti2v_5B* split_files/text_encoders/* split_files/vae/*" "$M/_wan"
stage Comfy-Org/FLUX.2-dev_ComfyUI \
  "split_files/diffusion_models/*fp8* split_files/text_encoders/* split_files/vae/*" "$M/_img"
hf download fal/MiniMax-H3-Realism-People-LoRA --local-dir "$M/loras/h3-realism" || true

# colocar todo en el árbol de ComfyUI
find "$M/_h3" -name '*.safetensors' 2>/dev/null | while read -r f; do
  case "$f" in *text_encoder*|*umt5*|*t5*) d=text_encoders;; *vae*) d=vae;; *) d=diffusion_models;; esac
  mv -n "$f" "$M/$d/"
done
for s in diffusion_models text_encoders vae; do
  for stg in _wan _img; do
    [ -d "$M/$stg/split_files/$s" ] && rsync -a "$M/$stg/split_files/$s/" "$M/$s/"
  done
done
rm -rf "$M"/_h3 "$M"/_wan "$M"/_img
du -sh "$M"/* 2>/dev/null

# --- Caddy delante de ComfyUI: sin esto el puerto queda abierto a internet ---
curl -fsSL "https://github.com/caddyserver/caddy/releases/latest/download/caddy_linux_amd64.tar.gz" \
  -o /tmp/caddy.tgz && tar -xzf /tmp/caddy.tgz -C /usr/local/bin caddy && chmod +x /usr/local/bin/caddy \
  && CADDY_OK=1 || CADDY_OK=0

mkdir -p "$WORK/outputs"
nohup env COMFY_PORT=$PORT "$WORK/venv/bin/python" "$WORK/ComfyUI/main.py" \
  --listen 127.0.0.1 --port 9000 --output-directory "$WORK/outputs" \
  >> "$WORK/comfy.log" 2>&1 &

if [ "$CADDY_OK" = "1" ]; then
  HASH=$(caddy hash-password --plaintext "$UI_PASS")
  cat > /etc/caddy.json <<EOF
{"apps":{"http":{"servers":{"s":{"listen":[":${PORT}"],"routes":[{"handle":[
 {"handler":"authentication","providers":{"http_basic":{"accounts":[
   {"username":"${UI_USER}","password":"${HASH}"}]}}},
 {"handler":"reverse_proxy","upstreams":[{"dial":"127.0.0.1:9000"}]}]}]}}}}}
EOF
  nohup caddy run --config /etc/caddy.json >> "$WORK/caddy.log" 2>&1 &
  echo "==> ComfyUI protegido con usuario/clave en el puerto ${PORT}"
else
  echo "!! Caddy no se instaló. Abriendo ComfyUI SIN clave — destruye la instancia al terminar."
  pkill -f "ComfyUI/main.py"
  nohup "$WORK/venv/bin/python" "$WORK/ComfyUI/main.py" --listen 0.0.0.0 --port $PORT \
    --output-directory "$WORK/outputs" >> "$WORK/comfy.log" 2>&1 &
fi

cat <<EOF

=========================================================
  LISTO. Abre el puerto ${PORT} desde el panel de Vast.
  Usuario: ${UI_USER}
  Clave  : ${UI_PASS}
  Guarda esta clave: no vuelve a mostrarse.
=========================================================
EOF
