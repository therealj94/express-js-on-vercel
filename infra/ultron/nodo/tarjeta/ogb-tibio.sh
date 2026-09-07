#!/bin/bash
# MANTENER TIBIO EL MODELO. Medido el 5-sep en esta misma maquina:
#
#   primera pregunta tras un rato quieto ...  20 fichas en 6,98 s =  2,9 f/s
#   la siguiente, con todo caliente .......... 20 fichas en 0,35 s = 57,9 f/s
#
# Veinte veces. No es la tarjeta —persistencia puesta, P0, 1710 MHz, 38 f/s
# sostenidos con 300 fichas— ni es cargar el modelo, que ya esta clavado en
# VRAM: es el arranque en frio de los nucleos de CUDA, que se paga una vez y
# se pierde al rato de no usarlos.
#
# Ese costo lo pagaba SIEMPRE la primera pregunta de la junta, que es
# justamente la que forma la opinion de si esto anda o no anda. Ahora lo paga
# un pulso de cuatro fichas cada tres minutos. Cuesta un segundo de tarjeta en
# una maquina que ya esta encendida las veinticuatro horas.
#
# El pulso ademas refresca keep_alive: -1, o sea que hace el trabajo del
# precalentador de arranque sin volver a leer 16 GB de disco.
T0=$(date +%s%3N)
R=$(curl -s -m 120 http://127.0.0.1:11434/api/chat -d '{"model":"qwen3.8:27b","stream":false,"think":false,"keep_alive":-1,"options":{"num_ctx":24576,"num_predict":4},"messages":[{"role":"user","content":"listo"}]}')
MS=$(( $(date +%s%3N) - T0 ))
curl -s -m 60 -o /dev/null http://127.0.0.1:11434/api/embed -d '{"model":"embeddinggemma:300m","input":"listo","keep_alive":-1}' || true
if [ -z "$R" ]; then
  logger -t ogb-tibio "SIN RESPUESTA en ${MS} ms: el modelo no contesto al pulso"
elif [ "$MS" -gt 8000 ]; then
  # Que quede escrito: si el pulso mismo tarda, algo se enfrio de verdad.
  logger -t ogb-tibio "LENTO: el pulso tardo ${MS} ms (esperado menos de 1000)"
else
  logger -t ogb-tibio "tibio: ${MS} ms"
fi
