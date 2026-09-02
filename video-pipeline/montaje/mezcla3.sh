#!/bin/bash
# Mezcla con cuatro capas: voz, ambiente, cama musical y el silencio del giro.
set -e
PFX=$1; CORTE=$2; DUR=$3; SALIDA=$4
G=$(python3 -c "import json;print(' '.join(str(int(t*1000)) for t,_ in json.load(open('guion_${PFX}.json'))))")
ENT=""; FIL=""; MIX=""; i=0
for ms in $G; do i=$((i+1)); ENT="$ENT -i v${PFX:0:1}_${i}.wav"
  FIL="${FIL}[$i:a]adelay=${ms}|${ms},volume=1.25[l$i];"; MIX="${MIX}[l$i]"; done
k=$((i+1)); ENT="$ENT -i son_${PFX}.wav"
FIL="${FIL}[$k:a]volume=0.26[amb];"; MIX="${MIX}[amb]"
# La cama musical baja mucho bajo la voz y sube en los huecos.
k=$((k+1)); ENT="$ENT -i cama_${PFX}.wav"
FIL="${FIL}[$k:a]volume=0.17[cama];"; MIX="${MIX}[cama]"
ffmpeg -v error -y -i corte_${PFX}.mp4 $ENT -filter_complex \
  "${FIL}${MIX}amix=inputs=$((i+2)):normalize=0,aresample=48000,\
   acompressor=threshold=0.22:ratio=2.5:attack=12:release=280,\
   alimiter=limit=0.94,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "$SALIDA"
echo "listo: $SALIDA"
