#!/bin/bash
set -e
G=$(python3 -c "import json;print(' '.join(str(int(t*1000)) for t,_ in json.load(open('guion_llave.json'))))")
ENT=""; FIL=""; MIX=""; i=0
for ms in $G; do i=$((i+1)); ENT="$ENT -i vk_${i}.wav"
  FIL="${FIL}[$i:a]adelay=${ms}|${ms},volume=1.2[l$i];"; MIX="${MIX}[l$i]"; done
k=$((i+1)); ENT="$ENT -i son_llave.wav"
FIL="${FIL}[$k:a]volume=0.32[amb];"; MIX="${MIX}[amb]"
ffmpeg -v error -y -i corte_llave.mp4 $ENT -filter_complex \
  "${FIL}${MIX}amix=inputs=$((i+1)):normalize=0,aresample=48000,\
   acompressor=threshold=0.25:ratio=2:attack=15:release=300,alimiter=limit=0.94,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t 74.1 anuncio_1_lallave.mp4
echo "listo: anuncio_1_lallave.mp4"
