#!/usr/bin/env bash
# Se ejecuta DENTRO del pod de Vast.ai. Idempotente: se puede relanzar.
set -euo pipefail
WORK=/workspace
cd "$WORK"

# ---------------------------------------------------------------------------
# 1. Drivers y CUDA — NO se instalan: la imagen de Vast ya los trae.
#    Instalar drivers dentro del contenedor rompe el pod. Solo validamos.
# ---------------------------------------------------------------------------
echo "==> Verificando GPU"
nvidia-smi || { echo "!! Sin GPU visible. Pod inservible, destrúyelo." >&2; exit 1; }
nvcc --version 2>/dev/null | tail -1 || echo "(nvcc ausente: normal en imágenes runtime)"
CUDA_MAJOR=$(nvidia-smi | grep -oP 'CUDA Version: \K[0-9]+' | head -1)
[ "${CUDA_MAJOR:-0}" -ge 12 ] || { echo "!! Se requiere CUDA >= 12.8" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 2. Sistema + Python 3.11
# ---------------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git git-lfs ffmpeg aria2 tmux rsync jq build-essential \
  software-properties-common curl ca-certificates
add-apt-repository -y ppa:deadsnakes/ppa >/dev/null 2>&1 || true
apt-get update -qq
apt-get install -y -qq python3.11 python3.11-venv python3.11-dev
git lfs install

python3.11 -m venv "$WORK/venv"
. "$WORK/venv/bin/activate"
pip install -q --upgrade pip wheel setuptools

# PyTorch cu128 (Blackwell + Hopper + Ampere)
pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
python -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available(),torch.cuda.get_device_name(0))"

pip install -q "huggingface_hub[cli,hf_transfer]" hf_transfer websocket-client requests tqdm
export HF_HUB_ENABLE_HF_TRANSFER=1
export HF_HOME=${HF_HOME:-$WORK/hf}
[ -n "${HF_TOKEN:-}" ] && hf auth login --token "$HF_TOKEN" --add-to-git-credential || true

# ---------------------------------------------------------------------------
# 3. ComfyUI + Manager + nodos de vídeo
# ---------------------------------------------------------------------------
if [ ! -d "$WORK/ComfyUI" ]; then
  git clone --depth 1 https://github.com/comfyanonymous/ComfyUI "$WORK/ComfyUI"
fi
pip install -q -r "$WORK/ComfyUI/requirements.txt"
pip install -q sageattention || echo "(sageattention opcional omitido)"

CN="$WORK/ComfyUI/custom_nodes"
mkdir -p "$CN"
for repo in \
  https://github.com/Comfy-Org/ComfyUI-Manager \
  https://github.com/kijai/ComfyUI-KJNodes \
  https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite \
  https://github.com/city96/ComfyUI-GGUF \
  https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler \
  https://github.com/Fannovel16/ComfyUI-Frame-Interpolation ; do
  d="$CN/$(basename "$repo")"
  [ -d "$d" ] || git clone --depth 1 "$repo" "$d"
  [ -f "$d/requirements.txt" ] && pip install -q -r "$d/requirements.txt" || true
done

# ---------------------------------------------------------------------------
# 4. Wan2GP (motor de bajo VRAM; también útil en A100 para colas largas)
# ---------------------------------------------------------------------------
if [ ! -d "$WORK/Wan2GP" ]; then
  git clone --depth 1 https://github.com/deepbeepmeep/Wan2GP "$WORK/Wan2GP"
fi
pip install -q -r "$WORK/Wan2GP/requirements.txt" || echo "(revisar requirements de Wan2GP)"

# ---------------------------------------------------------------------------
# 5. Pesos
#    VRAM >= 80 GB -> BF16.  32-48 GB -> FP8.  < 32 GB -> INT8/GGUF.
# ---------------------------------------------------------------------------
VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
if   [ "$VRAM_MB" -ge 80000 ]; then PREC=bf16
elif [ "$VRAM_MB" -ge 40000 ]; then PREC=fp8
else PREC=int8; fi
echo "==> VRAM ${VRAM_MB} MB -> precisión ${PREC}"

MODELS="$WORK/ComfyUI/models"
mkdir -p "$MODELS"/{diffusion_models,text_encoders,vae,clip_vision,loras}

# 5a. MiniMax H3 — empaquetado para ComfyUI (Comfy-Org) filtrando por precisión.
#     FL2VA = texto + primer/último frame.  Ref2VA = referencias img/vídeo/audio.
hf download Comfy-Org/MiniMax-H3 \
  --include "*${PREC}*" "*fl2va*" "*ref2va*" "*vae*" "*text_encoder*" \
  --local-dir "$MODELS/_h3_stage" || {
    echo "!! Fallo la descarga de H3. Verifica HF_TOKEN y aceptación de licencia."; }

# Reubicar en el árbol de ComfyUI
find "$MODELS/_h3_stage" -name '*.safetensors' | while read -r f; do
  case "$f" in
    *text_encoder*|*umt5*|*t5*) dst="$MODELS/text_encoders" ;;
    *vae*)                      dst="$MODELS/vae" ;;
    *)                          dst="$MODELS/diffusion_models" ;;
  esac
  mkdir -p "$dst"; mv -n "$f" "$dst/"
done

# 5b. Wan 2.2 — Apache 2.0, para LoRA y control fino
hf download Comfy-Org/Wan_2.2_ComfyUI_Repackaged \
  --include "split_files/diffusion_models/wan2.2_t2v_high_noise_14B_${PREC}*.safetensors" \
            "split_files/diffusion_models/wan2.2_t2v_low_noise_14B_${PREC}*.safetensors" \
            "split_files/diffusion_models/wan2.2_i2v_high_noise_14B_${PREC}*.safetensors" \
            "split_files/diffusion_models/wan2.2_i2v_low_noise_14B_${PREC}*.safetensors" \
            "split_files/text_encoders/*" "split_files/vae/*" \
  --local-dir "$MODELS/_wan_stage" || true

for sub in diffusion_models text_encoders vae; do
  [ -d "$MODELS/_wan_stage/split_files/$sub" ] && \
    rsync -a "$MODELS/_wan_stage/split_files/$sub/" "$MODELS/$sub/"
done
# 5c. Cadena de calidad: still de referencia (imagen) + upscale + interpolación.
#     Sustituye al H3-Regenerate-2K de MiniMax, que no es público.
if [ "${QUALITY_CHAIN:-1}" = "1" ]; then
  # SeedVR2 — upscale por difusión con consistencia temporal (768p -> 2K/4K)
  mkdir -p "$MODELS/SEEDVR2"
  hf download numz/SeedVR2_comfyUI --local-dir "$MODELS/SEEDVR2" || \
    echo "(SeedVR2 no descargado; revisa el nombre del repo en HF)"

  # Modelo de imagen para generar el primer frame a alta resolución.
  # Controlar composición y luz en un still cuesta segundos, no minutos.
  hf download Comfy-Org/Qwen-Image_ComfyUI \
    --include "split_files/diffusion_models/*fp8*" "split_files/text_encoders/*" "split_files/vae/*" \
    --local-dir "$MODELS/_img_stage" || true
  for sub in diffusion_models text_encoders vae; do
    [ -d "$MODELS/_img_stage/split_files/$sub" ] && \
      rsync -a "$MODELS/_img_stage/split_files/$sub/" "$MODELS/$sub/"
  done
  rm -rf "$MODELS/_img_stage"
fi

rm -rf "$MODELS/_h3_stage" "$MODELS/_wan_stage"

du -sh "$MODELS"/* 2>/dev/null || true

# ---------------------------------------------------------------------------
# 6. Arrancar ComfyUI en background
# ---------------------------------------------------------------------------
PORT="${COMFY_PORT:-8188}"
mkdir -p "$WORK/outputs" "$WORK/logs"
tmux kill-session -t comfy 2>/dev/null || true
tmux new-session -d -s comfy \
  ". $WORK/venv/bin/activate && cd $WORK/ComfyUI && \
   python main.py --listen 0.0.0.0 --port $PORT --output-directory $WORK/outputs \
   2>&1 | tee $WORK/logs/comfy.log"

for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:${PORT}/system_stats" >/dev/null && break
  sleep 5
done
curl -sf "http://127.0.0.1:${PORT}/system_stats" >/dev/null \
  && echo "==> ComfyUI arriba en :${PORT}" \
  || { echo "!! ComfyUI no arrancó — revisa $WORK/logs/comfy.log" >&2; exit 1; }

echo "Listo. Siguiente: python3 $WORK/03_run_queue.py --queue $WORK/prompts/queue.json"
