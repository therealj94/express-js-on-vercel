#!/bin/bash
set -e
G=$(python3 -c "import json;print(' '.join(str(int(t*1000)) for t,_ in json.load(open('guion_bc.json'))))")
ENT=""; FIL=""; MIX=""; i=0
for ms in $G; do
  i=$((i+1)); ENT="$ENT -i c_${i}.wav"
  FIL="${FIL}[$i:a]adelay=${ms}|${ms},volume=1.2[l$i];"; MIX="${MIX}[l$i]"
done
# El click del pulgar, a los 42,5 s. Unico sonido de interfaz de la pieza.
k=$((i+1)); ENT="$ENT -i click.wav"
FIL="${FIL}[$k:a]adelay=25900|25900[ck];"; MIX="${MIX}[ck]"
k=$((k+1)); ENT="$ENT -i amb_bc.wav"
FIL="${FIL}[$k:a]volume=0.32[amb];"; MIX="${MIX}[amb]"
ffmpeg -v error -y -i corte_Bc.mp4 $ENT -filter_complex \
  "${FIL}${MIX}amix=inputs=$((i+2)):normalize=0,aresample=48000,\
   acompressor=threshold=0.25:ratio=2:attack=15:release=300,\
   alimiter=limit=0.94,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t 41.08 anuncio_B_corto.mp4
echo "listo: anuncio_B_corto.mp4"
