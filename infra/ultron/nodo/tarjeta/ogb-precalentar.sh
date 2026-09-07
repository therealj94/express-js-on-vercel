#!/bin/bash
# Deja los dos modelos CLAVADOS en la tarjeta al arrancar.
# La maquina tiene 15 GB de RAM y el modelo pesa 16: nunca queda en
# cache, asi que cada carga son dos minutos de disco. Que los pague el
# arranque y no la junta esperando una respuesta.
for i in $(seq 1 60); do curl -sf -m 5 http://127.0.0.1:11434/api/tags >/dev/null && break; sleep 5; done
# El modelo y la ventana se leen de UN solo sitio. Si este archivo no esta
# —maquina nueva, o alguien lo borro— se sigue con los valores de abajo, que
# es preferible a que el pulso no corra.
[ -r /etc/ogb-tarjeta.env ] && . /etc/ogb-tarjeta.env
MODELO="${OGB_MODELO:-qwen3.8:27b}"
CTX="${OGB_CTX:-24576}"
VECTOR="${OGB_MODELO_VECTOR:-embeddinggemma:300m}"
# OJO: este archivo llevaba num_ctx 32768 escrito a mano cuando los otros
# cuatro ya iban en 24576, y por eso el arranque cargaba el modelo con OTRA
# ventana y el primer pedido de verdad lo recargaba entero. Ahora lo lee.
curl -s -m 900 -o /dev/null http://127.0.0.1:11434/api/chat -d "{\"model\":\"$MODELO\",\"stream\":false,\"think\":false,\"keep_alive\":-1,\"options\":{\"num_ctx\":$CTX,\"num_predict\":4},\"messages\":[{\"role\":\"user\",\"content\":\"listo\"}]}"
curl -s -m 300 -o /dev/null http://127.0.0.1:11434/api/embed -d "{\"model\":\"$VECTOR\",\"input\":\"listo\",\"keep_alive\":-1}"
logger -t ogb-precalentar "modelos clavados: $(HOME=/root /usr/local/bin/ollama ps | tail -n +2 | wc -l)"
