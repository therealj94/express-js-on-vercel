#!/usr/bin/env bash
# ONSTART de Vast: el pod se instala solo, sin SSH. Variables: HF_TOKEN,
# UI_USER, UI_PASS, MODELS (h3,flux,wan), VOZ. Progreso en el log de Vast.
set -uo pipefail
exec > >(tee -a /workspace/onstart.log) 2>&1
echo "===== onstart $(date -u) ====="

WORK=/workspace
# El puerto que publica la instancia y el que escucha nginx tienen que ser el
# MISMO. Estaban fijados por separado —aqui 8188, y en la creacion con --port—
# y bastaba pasar otro numero para publicar un puerto que nadie atiende:
# ComfyUI solo escucha en 127.0.0.1:9000, asi que desde fuera no contesta nada
# y el pod parece muerto estando perfecto. Ahora viaja desde la creacion.
PORT=${UI_PORT:-8188}
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

# Los 42 GB de pesos y la instalación de ComfyUI no compiten por el mismo
# recurso: una satura la red, la otra el disco y la CPU. En serie se sumaban;
# en paralelo el reloj lo marca solo la más lenta de las dos.
descargar_pesos() {
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
  # aria2c con 16 conexiones: el cliente de HF usa una sola y HF la limita a
  # ~15-20 Mbps. Tres hosts dieron lo mismo, así que el cuello es HF.
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

  # Un modelo para todo: H3 hace imagen fija además de vídeo. Ahorra los 35 GB
  # de FLUX y hace que still y clip compartan estética.
  case "$PREC" in
    bf16|fp8) DIF=minimax_h3_fl2va_pruned_fp8_scaled.safetensors ;;
    *)        DIF=minimax_h3_fl2va_pruned_int8_convrot.safetensors ;;
  esac
  R=Comfy-Org/MiniMax-H3
  baja "$R" "diffusion_models/${DIF}"                              "$M/diffusion_models"
  baja "$R" "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors" "$M/text_encoders"
  baja "$R" "vae/minimax_h3_video_vae_fp16.safetensors"            "$M/vae"
  baja "$R" "vae/minimax_h3_audio_vae_fp32.safetensors"            "$M/vae"
  # Los turbo solo hacen falta para el modo rápido de 4/8 pasos. Una tanda de
  # calidad no los toca: son ~3,6 GB y un minuto de descarga tirados. TURBO=0
  # los salta.
  if [ "${TURBO:-1}" != "0" ]; then
    baja "$R" "loras/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors" "$M/loras"
    baja "$R" "loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors"      "$M/loras"
  fi
  baja fal/MiniMax-H3-Realism-People-LoRA \
       "h3-realism-people-t2v-i2v-r2v.safetensors" "$M/loras" || true

  rm -rf "$M"/_h3 "$M"/_wan "$M"/_img "$M"/_turbo
  du -sh "$M"/* 2>/dev/null
  LIBRE=$(df -BG --output=avail "$WORK" | tail -1 | tr -dc 0-9)
  echo "==> disco libre: ${LIBRE} GB"
  [ "${LIBRE:-99}" -lt 15 ] && echo "!! Queda poco disco: la generación puede fallar al guardar."
  # Sin este return la función acaba con el código del test de arriba: si hay
  # disco de sobra el test es falso, devuelve 1, y el wait de abajo anuncia un
  # error que no existe. Una alarma falsa cuesta lo mismo que un fallo real.
  return 0
}
# --- ComfyUI + nodos ---
# El clon va ANTES de lanzar la descarga: git clone exige que el destino esté
# vacío, y descargar_pesos crea ComfyUI/models. Al revés, el clon falla.
[ -d "$WORK/ComfyUI" ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI "$WORK/ComfyUI"

descargar_pesos > "$WORK/pesos.log" 2>&1 &
DESCARGA=$!
echo "==> pesos descargando en segundo plano (pid $DESCARGA)"

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


# --- Voz y labial (VOZ=1) ---------------------------------------------------
# La voz aparte: el labial en español de H3 es una lotería.
if [ "${VOZ:-0}" = "1" ]; then
  pip install -q chatterbox-tts || echo "!! chatterbox no instalado"
  d="$WORK/LatentSync"
  [ -d "$d" ] || git clone --depth 1 https://github.com/bytedance/LatentSync "$d"
  pip install -q -r "$d/requirements.txt" 2>/dev/null || \
    echo "!! requisitos de LatentSync incompletos: el labial se hará en post"
  echo "==> voz y labial preparados"
fi

# Sin esta espera ComfyUI arrancaría con los modelos a medio bajar y los daría
# por ausentes: el fallo silencioso que más caro sale en este proyecto.
echo "==> esperando a que terminen los pesos..."
wait "$DESCARGA" || echo "!! la descarga de pesos terminó con error"
tail -30 "$WORK/pesos.log"

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
    location /estudio/ {
        auth_basic           "video-pipeline";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass         http://127.0.0.1:9100/;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
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
  echo "${ESTUDIO_B64:-}" | base64 -d | gunzip > "$WORK/estudio.py" 2>/dev/null
  echo "${JOB_WORKFLOWS_B64:-}" | base64 -d > "$WORK/workflows.tar" 2>/dev/null && \
    tar xzf "$WORK/workflows.tar" -C "$WORK" 2>/dev/null

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
    # El runner ya sube cada clip según sale. Esto es la red de seguridad:
    # barre la carpeta entera por si algo se generó fuera de la cola (el
    # estudio, un reintento) o una subida falló en su momento.
    #
    # Se subía a catbox y 0x0.st: los DOS rechazan subidas de centro de datos,
    # así que nueve clips salieron con enlaces que no servían. Hugging Face es
    # el único destino con la ida y la vuelta verificadas byte a byte.
    if [ -n "${HF_REPO:-}" ] && [ -n "${HF_TOKEN:-}" ]; then
      echo "==> ENTREGA FINAL a ${HF_REPO}"
      HF_HUB_DISABLE_XET=1 "$WORK/venv/bin/python" - <<PY 2>&1 | tail -30
import os, pathlib
from huggingface_hub import HfApi
api = HfApi(token=os.environ["HF_TOKEN"])
for f in sorted(pathlib.Path("$WORK/outputs").glob("*")):
    if f.suffix.lower() not in (".mp4", ".png", ".jpg", ".json"):
        continue
    try:
        api.upload_file(path_or_fileobj=str(f), path_in_repo=f.name,
                        repo_id=os.environ["HF_REPO"], repo_type="dataset")
        print(f"    ok {f.name} ({f.stat().st_size/1e6:.1f} MB)")
    except Exception as e:
        print(f"    FALLO {f.name}: {str(e)[:160]}")
PY
    else
      echo "!! SIN ENTREGA: falta HF_REPO o HF_TOKEN. Los clips se quedan"
      echo "   dentro del pod y MUEREN al destruirlo."
    fi
    # --- Turno de espera: el pod pide más trabajo en vez de morirse ---------
    # Una instalación son 40 minutos y $1.30. Apagar al acabar una cola y
    # encender otra para la siguiente tira eso cada vez, y es lo que veníamos
    # haciendo. El pod NO se puede alcanzar desde fuera —el contenedor que lo
    # dirige solo tiene salida por 80 y 443, y el puerto publicado no es
    # ninguno—, pero el pod SÍ alcanza Hugging Face, que es de donde baja los
    # pesos. Así que la cola siguiente viaja por ahí.
    #
    # Se deja colas/siguiente.json en el repo y el pod la recoge; se deja
    # colas/FIN y termina. Sin nada, se rinde pasado el plazo para no quedarse
    # facturando en silencio.
    export ESPERA="${ESPERA_MIN:-45}"
    if [ -n "${HF_REPO:-}" ] && [ -n "${HF_TOKEN:-}" ]; then
      echo "==> COLA VACIA. Esperando trabajo nuevo en ${HF_REPO}/colas/"
      "$WORK/venv/bin/python" - <<'ESPERAPY' 2>&1
import os, subprocess, time, pathlib
from huggingface_hub import HfApi, hf_hub_download
api = HfApi(token=os.environ["HF_TOKEN"])
repo = os.environ["HF_REPO"]
work = os.environ.get("WORK", "/workspace")
espera = float(os.environ.get("ESPERA", "45")) * 60
limite = time.time() + espera
tanda = 1
while time.time() < limite:
    try:
        ficheros = set(api.list_repo_files(repo, repo_type="dataset"))
    except Exception as e:
        print("    (no se pudo mirar el repo: %s)" % str(e)[:80], flush=True)
        time.sleep(30)
        continue
    if "colas/FIN" in ficheros:
        print("==> FIN pedido desde el repo", flush=True)
        break
    if "colas/siguiente.json" not in ficheros:
        time.sleep(45)
        continue
    tanda += 1
    print("==> TANDA %d: cola nueva encontrada" % tanda, flush=True)
    ruta = hf_hub_download(repo, "colas/siguiente.json", repo_type="dataset",
                           local_dir=work + "/prompts",
                           token=os.environ["HF_TOKEN"])
    # hf_hub_download conserva la ruta del repo: queda en prompts/colas/, y el
    # runner busca los workflows junto a la cola. Se sube un nivel.
    destino = "%s/prompts/tanda_%d.json" % (work, tanda)
    os.replace(ruta, destino); ruta = destino
    # Se borra ANTES de ejecutarla: si no, al terminar se vuelve a encontrar
    # la misma y la tanda entra en bucle.
    try:
        api.delete_file("colas/siguiente.json", repo_id=repo, repo_type="dataset")
    except Exception as e:
        print("    !! no se pudo borrar la cola: %s" % str(e)[:80], flush=True)
        break
    subprocess.run([work + "/venv/bin/python", "-u", work + "/03_run_queue.py",
                    "--queue", ruta, "--out", work + "/outputs"],
                   env=dict(os.environ, COMFY_URL="http://127.0.0.1:9000"))
    for f in sorted(pathlib.Path(work + "/outputs").glob("*")):
        if f.suffix.lower() not in (".mp4", ".png", ".jpg", ".json"):
            continue
        try:
            api.upload_file(path_or_fileobj=str(f), path_in_repo=f.name,
                            repo_id=repo, repo_type="dataset")
        except Exception:
            pass
    print("==> TANDA %d ENTREGADA" % tanda, flush=True)
    limite = time.time() + espera
else:
    print("==> nadie mando trabajo en el plazo; me rindo", flush=True)
ESPERAPY
    fi

    echo "==> TRABAJO COMPLETO"   # el guardián ve esto y destruye la instancia

    # Sin autodestrucción: la clave de instancia llega DESPUÉS de crear, y
    # poner la de la cuenta daría control total a una máquina ajena.
  fi
fi

# El estudio: la página simple que sí se puede usar desde un móvil. ComfyUI
# sigue disponible en la raíz para quien quiera el editor de nodos.
if [ -s "$WORK/estudio.py" ]; then
  # setsid: sin él el proceso muere con el grupo del onstart al terminar éste,
  # y la página responde 502 sin dejar rastro en ningún log visible.
  setsid nohup "$WORK/venv/bin/python" -u "$WORK/estudio.py" \
    >> "$WORK/estudio.log" 2>&1 < /dev/null &
  # Verificar el EFECTO, no la llamada: que el puerto conteste de verdad.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -sf -m 3 -o /dev/null http://127.0.0.1:9100/ && break; sleep 2
  done
  if curl -sf -m 5 -o /dev/null http://127.0.0.1:9100/; then
    echo "==> estudio VIVO en /estudio/"
  else
    echo "==> estudio NO ARRANCÓ. Motivo:"; tail -20 "$WORK/estudio.log"
  fi
  # Vigilante: si el estudio se cae, vuelve a levantarlo. Nadie puede entrar
  # por SSH a reiniciarlo a mano.
  setsid nohup bash -c 'while true; do sleep 20;
    curl -sf -m 5 -o /dev/null http://127.0.0.1:9100/ ||
      '"$WORK"'/venv/bin/python -u '"$WORK"'/estudio.py >> '"$WORK"'/estudio.log 2>&1;
  done' > /dev/null 2>&1 < /dev/null &
fi

cat <<EOF

=========================================================
  LISTO.  autenticación: ${AUTH_OK:-0}  (1 = puerto ${PORT} protegido)
  Usuario: ${UI_USER}
  Clave  : ${UI_PASS}
  Guarda esta clave: no vuelve a mostrarse.
=========================================================
EOF
