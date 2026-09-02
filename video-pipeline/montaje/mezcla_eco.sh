#!/bin/bash
# Mezcla de la película del ecosistema: narración + efectos + banda sonora.
#
# José: "el sonido de fondo no es de un trailer y no se escucha". Eran dos
# problemas distintos y cada uno tiene su arreglo:
#
#   NO ES DE UN TRAILER  ->  la música se sintetizaba con osciladores. Ahora se
#     compone (tools/musica_el.py) y tiene arco de verdad: sube 6 dB de la
#     primera parte al clímax.
#   NO SE ESCUCHA        ->  el ducking iba a ratio 10 con umbral 0.03, que no
#     aparta la música: la borra cada vez que alguien habla. Baja a ratio 4 con
#     umbral 0.06, que la mete unos decibelios por debajo de la voz y la deja
#     oírse. Y entra desde el primer fotograma, como en cualquier trailer.
#
# El limitador lleva level=false: por defecto ffmpeg RE-NORMALIZA la salida a
# 0 dBFS después de limitar y el techo no sirve de nada.
#
#   bash montaje/mezcla_eco.sh muda.mp4 prompts/pelicula2_montaje.json salida.mp4 61.8
set -e
MUDA=$1; ESPEC=$2; SALIDA=$3; DUR=${4:-61.8}

ENT=""; FIL=""; MIX=""; n=0
while read -r i seg; do
  # 150 ms de aire delante: la voz empieza en el fotograma 0 y el compresor se
  # comía la primera sílaba.
  n=$((n+1)); ms=$(python3 -c "print(max(0,int($seg*1000)-150))")
  ENT="$ENT -i tv_${i}.wav"
  FIL="${FIL}[$n:a]adelay=150|150[p$n];"
  FIL="${FIL}[p$n]adelay=${ms}|${ms}[l$n];"; MIX="${MIX}[l$n]"
done < <(python3 -c "import json;[print(i,t) for i,t in json.load(open('$ESPEC'))['voz']['orden']]")

FIL="${FIL}${MIX}amix=inputs=$n:normalize=0,acompressor=threshold=0.12:ratio=3:attack=8:release=180,volume=2.9,aecho=0.9:0.85:14:0.10[voz];"
FIL="${FIL}[voz]asplit=3[voz1][disp][disp2];"
# Los efectos bajan: antes cargaban el peso que ahora lleva la música.
FIL="${FIL}[$((n+1)):a]volume=0.46[sfx0];"
FIL="${FIL}[sfx0][disp2]sidechaincompress=threshold=0.06:ratio=3:attack=8:release=400:makeup=1[sfx];"
FIL="${FIL}[$((n+2)):a]volume=0.90[cama0];"
# La sala entra por su propia pista y NO se aparta bajo la voz: es el suelo de
# la pieza, y si se aparta vuelve el vacío.
FIL="${FIL}[$((n+3)):a]volume=1.0[sala];"
FIL="${FIL}[cama0][disp]sidechaincompress=threshold=0.06:ratio=4:attack=12:release=420:makeup=1[cama];"
FIL="${FIL}[voz1][sfx][cama][sala]amix=inputs=4:normalize=0,aresample=48000,alimiter=limit=0.74:attack=3:release=60:level=false,apad[a]"

ffmpeg -v error -y -i "$MUDA" $ENT -i sfx_eco.wav -i cama_ecosistema.wav -i sala_eco.wav \
  -filter_complex "$FIL" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "$SALIDA"
echo "mezclada: $SALIDA ($n líneas de voz)"
