#!/usr/bin/env bash
# PC local con NVIDIA >= 12 GB (Linux o WSL2). Instala Wan2GP + ComfyUI + pesos
# cuantizados según la VRAM detectada.
set -euo pipefail
ROOT="${VIDEO_ROOT:-$HOME/video-ai}"
mkdir -p "$ROOT"; cd "$ROOT"

command -v nvidia-smi >/dev/null || { echo "!! Sin driver NVIDIA. Instala el driver 570+ primero." >&2; exit 1; }
VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
echo "==> GPU: $(nvidia-smi --query-gpu=name --format=csv,noheader | head -1) — ${VRAM_MB} MB"
[ "$VRAM_MB" -ge 11000 ] || echo "!! < 12 GB: funcionará pero degradado (10-15 min/clip)."

# Precisión según VRAM. En local casi siempre INT8 o GGUF Q6/Q8.
if   [ "$VRAM_MB" -ge 40000 ]; then PREC=fp8
elif [ "$VRAM_MB" -ge 20000 ]; then PREC=int8
else PREC=gguf; fi
echo "==> Precisión objetivo: ${PREC}"

# --- Python 3.11 aislado (no toca el Python del sistema) ---
if ! command -v python3.11 >/dev/null; then
  echo "Instala python3.11 (Ubuntu: sudo add-apt-repository ppa:deadsnakes/ppa && sudo apt install python3.11-venv)" >&2
  exit 1
fi
python3.11 -m venv "$ROOT/venv"; . "$ROOT/venv/bin/activate"
pip install -q --upgrade pip wheel
pip install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -q "huggingface_hub[cli,hf_transfer]" websocket-client requests
export HF_HUB_ENABLE_HF_TRANSFER=1

# --- Wan2GP: motor principal en local (offload agresivo, mmgp) ---
[ -d Wan2GP ] || git clone --depth 1 https://github.com/deepbeepmeep/Wan2GP
pip install -q -r Wan2GP/requirements.txt

# --- ComfyUI: para la cola desatendida con el mismo 03_run_queue.py ---
[ -d ComfyUI ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI
pip install -q -r ComfyUI/requirements.txt
for repo in \
  https://github.com/Comfy-Org/ComfyUI-Manager \
  https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite \
  https://github.com/city96/ComfyUI-GGUF ; do
  d="ComfyUI/custom_nodes/$(basename "$repo")"
  [ -d "$d" ] || git clone --depth 1 "$repo" "$d"
  [ -f "$d/requirements.txt" ] && pip install -q -r "$d/requirements.txt" || true
done

# --- Pesos ---
M=ComfyUI/models; mkdir -p "$M"/{diffusion_models,text_encoders,vae,loras}

# MiniMax H3 cuantizado — build de Wan2GP (el más ligero) o el de Comfy-Org
hf download DeepBeepMeep/MiniMax-H3 --local-dir "$ROOT/Wan2GP/ckpts/MiniMax-H3" || \
hf download Comfy-Org/MiniMax-H3 --include "*${PREC}*" --local-dir "$M/diffusion_models"

# Wan 2.2 5B (TI2V) — el que de verdad cabe en 12 GB para iterar rápido
hf download Comfy-Org/Wan_2.2_ComfyUI_Repackaged \
  --include "split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" \
            "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" \
            "split_files/vae/wan2.2_vae.safetensors" \
  --local-dir "$M/_wan"
for s in diffusion_models text_encoders vae; do
  [ -d "$M/_wan/split_files/$s" ] && cp -n "$M/_wan/split_files/$s/"* "$M/$s/" || true
done
rm -rf "$M/_wan"

cat <<EOF

Instalado en ${ROOT}

  # UI interactiva de bajo VRAM (recomendada para probar prompts):
  . ${ROOT}/venv/bin/activate && cd ${ROOT}/Wan2GP && python wgp.py --profile 4

  # ComfyUI para la cola desatendida:
  . ${ROOT}/venv/bin/activate && cd ${ROOT}/ComfyUI && \\
    python main.py --lowvram --output-directory ${ROOT}/outputs
  python3 ../03_run_queue.py --queue ../prompts/queue.json --out ${ROOT}/outputs

Ajustes útiles con poca VRAM:
  --lowvram / --novram        offload de ComfyUI
  --use-sage-attention        atención más rápida y ligera (si compila)
  832x480 y 5 s primero; sube resolución solo en la toma elegida
EOF
