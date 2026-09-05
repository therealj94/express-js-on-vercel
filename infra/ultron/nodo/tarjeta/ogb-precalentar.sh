#!/bin/bash
# Deja los dos modelos CLAVADOS en la tarjeta al arrancar.
# La maquina tiene 15 GB de RAM y el modelo pesa 16: nunca queda en
# cache, asi que cada carga son dos minutos de disco. Que los pague el
# arranque y no la junta esperando una respuesta.
for i in $(seq 1 60); do curl -sf -m 5 http://127.0.0.1:11434/api/tags >/dev/null && break; sleep 5; done
curl -s -m 900 -o /dev/null http://127.0.0.1:11434/api/chat -d '{"model":"qwen3.8:27b","stream":false,"think":false,"keep_alive":-1,"options":{"num_ctx":32768,"num_predict":4},"messages":[{"role":"user","content":"listo"}]}'
curl -s -m 300 -o /dev/null http://127.0.0.1:11434/api/embed -d '{"model":"embeddinggemma:300m","input":"listo","keep_alive":-1}'
logger -t ogb-precalentar "modelos clavados: $(HOME=/root /usr/local/bin/ollama ps | tail -n +2 | wc -l)"
