#!/bin/bash
# Instala el motor y el asistente en la maquina de AU-RA. Corre EN EL NODO,
# mandado por SSM. Idempotente: correrlo dos veces no rompe nada.
#
# Espera en el entorno: U_ASISTENTE U_PROMPT U_SABER U_PROBADORES — las URL
# firmadas para bajar cada archivo (el nodo no tiene permisos de S3 y no los
# necesita: la firma viaja en la URL y muere en dos horas).
set -e

echo "== quien soy =="
grep PRETTY /etc/os-release; free -h | head -2; df -h / | tail -1

echo "== ollama =="
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
systemctl enable --now ollama
sleep 3
# Solo en el anillo local. El puerto de Ollama no tiene contrasena: abierto a
# internet seria una maquina gratis para el primero que la encuentre.
ss -ltn | grep 11434 || (echo "ollama no escucha" && exit 1)

echo "== el modelo =="
ollama pull llama3.2

echo "== la casa del asistente =="
mkdir -p /srv/aura
curl -sS --fail -o /srv/aura/asistente.py    "$U_ASISTENTE"
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
