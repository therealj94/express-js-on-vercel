#!/bin/bash
# Instala el motor y el asistente en la maquina de AU-RA. Corre EN EL NODO,
# mandado por SSM. Idempotente: correrlo dos veces no rompe nada.
#
# Espera en el entorno: U_ASISTENTE U_CANDADO U_OIDO U_WHATSAPP U_GUARDIA U_REGISTRO U_GUION U_PREMIO U_VISTAZO U_PARTE U_PAGADOR U_ESPEJO U_PARTE_SERVICE U_PARTE_TIMER U_PAGOS_SERVICE U_PAGOS_TIMER U_PROMPT
# U_SABER U_PROBADORES — las URL firmadas para bajar cada archivo (el nodo no
# tiene permisos de S3 y no los necesita: la firma viaja en la URL y muere en
# dos horas).
#
# LOS MODULOS DE AL LADO NO SON OPCIONALES. `asistente.py` los importa arriba
# del todo —candado, oido, whatsapp—, asi que si falta uno el servicio no
# arranca: revienta con ImportError antes de la primera linea util. Estuvieron
# fuera de esta lista un tiempo porque se desplegaron a mano por otra via, y
# una reinstalacion limpia habria dejado a AU-RA sin arrancar sin que nada
# explicara por que.
set -e

echo "== quien soy =="
grep PRETTY /etc/os-release; free -h | head -2; df -h / | tail -1

echo "== ollama =="
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
# ── UN MODELO CARGADO A LA VEZ ────────────────────────────────────────────
# La maquina tiene 8 GB. La rapida (3B) ocupa 2,5 y la pensadora (8B) ocupa
# 5,2: juntas no entran, y el 27-ago el nucleo mato al motor por eso mismo
# («Out of memory: Killed process llama-server, anon-rss 5255380kB»). AU-RA
# quedo contestando «mi motor esta apagado» a todo el mundo.
# Con esto Ollama descarga un modelo ANTES de cargar el otro: cambiar de modo
# cuesta un minuto de carga, pero no se lleva puesto el servicio.
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/memoria.conf <<'OLL'
[Service]
Environment=OLLAMA_MAX_LOADED_MODELS=1
OLL
systemctl daemon-reload
systemctl enable ollama
systemctl restart ollama
sleep 3
# Solo en el anillo local. El puerto de Ollama no tiene contrasena: abierto a
# internet seria una maquina gratis para el primero que la encuentre.
ss -ltn | grep 11434 || (echo "ollama no escucha" && exit 1)

echo "== el modelo =="
ollama pull llama3.2

echo "== la casa del asistente =="
mkdir -p /srv/aura
curl -sS --fail -o /srv/aura/asistente.py    "$U_ASISTENTE"
curl -sS --fail -o /srv/aura/candado.py      "$U_CANDADO"
curl -sS --fail -o /srv/aura/oido.py         "$U_OIDO"
curl -sS --fail -o /srv/aura/whatsapp.py     "$U_WHATSAPP"
curl -sS --fail -o /srv/aura/guardia.py      "$U_GUARDIA"
curl -sS --fail -o /srv/aura/registro.py     "$U_REGISTRO"
curl -sS --fail -o /srv/aura/guion.py        "$U_GUION"
curl -sS --fail -o /srv/aura/premio.py       "$U_PREMIO"
curl -sS --fail -o /srv/aura/vistazo.py      "$U_VISTAZO"
curl -sS --fail -o /srv/aura/parte-diario.py "$U_PARTE"
curl -sS --fail -o /srv/aura/pagador.py      "$U_PAGADOR"
curl -sS --fail -o /srv/aura/espejo.py       "$U_ESPEJO"
curl -sS --fail -o /srv/aura/PROMPT-AURA.md  "$U_PROMPT"
curl -sS --fail -o /srv/aura/saber.json      "$U_SABER"
# la lista de probadores no se pisa si ya existe: puede tener gente agregada a
# mano despues del despliegue, y un redespliegue no puede echarlos
[ -f /srv/aura/probadores.txt ] || curl -sS --fail -o /srv/aura/probadores.txt "$U_PROBADORES"
chmod 700 /srv/aura

echo "== el servicio =="
cat > /etc/systemd/system/aura.service <<'UNIT'
[Unit]
Description=AU-RA, el asistente de Orden Global en PULSE2CHAT
After=network-online.target ollama.service
Wants=ollama.service

[Service]
ExecStart=/usr/bin/python3 /srv/aura/asistente.py
WorkingDirectory=/srv/aura
Environment=AURA_DATOS=/srv/aura
Environment=AURA_MODELO=llama3.2
# 300 y no 90: el motor en CPU tarda hasta 90s por respuesta, y una pregunta
# que llega DETRAS de otra espera su turno en la cola de Ollama. Con 90 el
# turno en cola se comia el tiempo y la respuesta moria en «motor apagado» —
# paso en la prueba real del 27-ago.
Environment=AURA_TIMEOUT=300
Environment=AURA_PASO=1.2
# A quien le llega el aviso cuando el guardia corta algo. Sin esto no
# avisa a nadie, y eso es media herramienta: el corte se anota igual,
# pero hay que ir a mirarlo.
Environment=AURA_AVISAR_A=jose@ordenglobal.org
# Un mes sin escribir y se borra todo lo de esa persona.
Environment=AURA_PLAZO_DIAS=30
# Quien puede pedir el parte escribiendo «actualizar». Vacio = nadie, que
# es lo correcto: el parte lleva identidades en cola, premios por pagar y
# el estado de la cuenta de Meta.
Environment=AURA_PARTE_PARA=50432136457
# El buzon de COPIAS. Nunca las credenciales del buzon real de nadie: asi
# el bot no puede escribir en nombre de Jose ni borrarle nada.
EnvironmentFile=-/etc/aura-correo.env
# WhatsApp. La clave NO se escribe aqui: va en /etc/aura-whatsapp.env, con
# permisos 600, porque este archivo lo lee cualquiera que entre a la maquina y
# `systemctl cat aura` lo imprime entero. El servicio arranca igual si el
# archivo no existe (`-`), y entonces WhatsApp queda apagado y lo dice en el
# registro — que es lo correcto: es una boca sin poner, no una averia.
EnvironmentFile=-/etc/aura-whatsapp.env
Restart=always
RestartSec=8

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now aura
sleep 4
systemctl is-active aura
journalctl -u aura -n 5 --no-pager

echo "== el parte, 7:30 y 19:30 =="
# Las unidades son ARCHIVOS DEL REPOSITORIO, no un heredoc aqui. Estaban
# escritas en dos sitios —este y el desplegador— y dos sitios que mandan sobre
# la misma unidad es como una de las dos se queda vieja sin que nadie lo note.
curl -sS --fail -o /etc/systemd/system/aura-parte.service "$U_PARTE_SERVICE"
curl -sS --fail -o /etc/systemd/system/aura-parte.timer   "$U_PARTE_TIMER"
curl -sS --fail -o /etc/systemd/system/aura-pagos.service "$U_PAGOS_SERVICE"
curl -sS --fail -o /etc/systemd/system/aura-pagos.timer   "$U_PAGOS_TIMER"
# El venv del pagador: eth-account no entra al python del sistema (PEP 668) y
# tampoco hace falta que entre — solo firma un proceso, y ese trae el suyo.
[ -x /srv/aura/venv-pagos/bin/python3 ] || python3 -m venv /srv/aura/venv-pagos
/srv/aura/venv-pagos/bin/pip install -q eth-account
systemctl daemon-reload
systemctl enable --now aura-parte.timer aura-pagos.timer
systemctl list-timers aura-parte.timer --no-pager
