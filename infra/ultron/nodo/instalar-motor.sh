#!/usr/bin/env bash
# Instala o actualiza el motor de ULTRON en el nodo de AU-RA. Idempotente:
# correrlo dos veces deja lo mismo. Lo corre desplegar-motor.py por SSM; a
# mano también sirve.
#
#   sudo bash instalar-motor.sh <ip-publica> [modelo] [ctx]
#
# Lo que hace, en orden:
#   1. copia ultron-motor.py a /opt/ultron y la unidad a systemd
#   2. si no hay certificado, genera uno propio con la IP pública como SAN
#      (ULTRON lo verifica por el PEM entero, así que no hace falta CA ni dominio)
#   3. si no hay secreto, genera uno de 48 hex y lo escribe en /etc/ultron-motor.env
#      con permisos 600 — ANTES de escribir, no después (chmod tarde deja la
#      ventana abierta)
#   4. enable + restart, y espera a que conteste /salud
#
# Imprime al final el PEM del certificado y NUNCA el secreto: el secreto se
# lee desde el archivo por quien lo necesite, con la llave del nodo.
set -euo pipefail

IP="${1:?falta la IP pública}"
MODELO="${2:-qwen2.5:14b}"
CTX="${3:-12288}"
AQUI="$(cd "$(dirname "$0")" && pwd)"

install -d -m 755 /opt/ultron /etc/ultron-motor
install -m 644 "$AQUI/ultron-motor.py" /opt/ultron/ultron-motor.py
install -m 644 "$AQUI/ultron-motor.service" /etc/systemd/system/ultron-motor.service
python3 -m py_compile /opt/ultron/ultron-motor.py

if [ ! -s /etc/ultron-motor/cert.pem ]; then
  # Un certificado propio, para esta IP, 10 años. ULTRON lo verifica por el
  # PEM que se le da, no por una autoridad: si cambia, ULTRON deja de confiar,
  # que es lo que se quiere.
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout /etc/ultron-motor/llave.pem -out /etc/ultron-motor/cert.pem \
    -subj "/CN=ultron-motor" -addext "subjectAltName=IP:${IP}" >/dev/null 2>&1
  chmod 600 /etc/ultron-motor/llave.pem
  chmod 644 /etc/ultron-motor/cert.pem
  echo "certificado nuevo para IP:${IP}"
fi

if [ ! -s /etc/ultron-motor.env ] || ! grep -q '^ULTRON_MOTOR_SECRETO=' /etc/ultron-motor.env; then
  SEC="$(openssl rand -hex 24)"
  install -m 600 /dev/null /etc/ultron-motor.env
  printf 'ULTRON_MOTOR_SECRETO=%s\nULTRON_MOTOR_PUERTO=8443\n' "$SEC" > /etc/ultron-motor.env
  echo "secreto nuevo en /etc/ultron-motor.env (600)"
fi
# El modelo y el contexto SIEMPRE se reescriben: son los de AU-RA y si AU-RA
# cambia, esto cambia con ella o el motor desaloja su modelo a cada pedido.
sed -i '/^ULTRON_MOTOR_MODELO=/d;/^ULTRON_MOTOR_CTX=/d' /etc/ultron-motor.env
printf 'ULTRON_MOTOR_MODELO=%s\nULTRON_MOTOR_CTX=%s\n' "$MODELO" "$CTX" >> /etc/ultron-motor.env

systemctl daemon-reload
systemctl enable ultron-motor >/dev/null 2>&1
systemctl restart ultron-motor
for i in $(seq 1 15); do
  sleep 1
  if systemctl is-active --quiet ultron-motor; then break; fi
done
systemctl is-active ultron-motor
journalctl -u ultron-motor -n 3 --no-pager | tail -3

echo "── CERTIFICADO (pegar tal cual en ULTRON_NODO_CERT) ──"
cat /etc/ultron-motor/cert.pem
