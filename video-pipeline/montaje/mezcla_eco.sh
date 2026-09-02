#!/bin/bash
# Mezcla final de la película del ecosistema: voz + efectos + música con ducking.
# Los tiempos de la voz salen del propio guion de montaje, para que no puedan
# divergir de la imagen.
#   bash montaje/mezcla_eco.sh muda.mp4 tiempos_desde_json salida.mp4
set -e
MUDA=$1; ESPEC=$2; SALIDA=$3; DUR=${4:-46.5}
ENT=""; FIL=""; MIX=""; n=0
while read -r i seg; do n=$((n+1)); ms=$(python3 -c "print(int($seg*1000))")
  ENT="$ENT -i tv_${i}.wav"; FIL="${FIL}[$n:a]adelay=${ms}|${ms}[l$n];"; MIX="${MIX}[l$n]"
done < <(python3 -c "import json;[print(i,t) for i,t in json.load(open('$ESPEC'))['voz']['orden']]")
FIL="${FIL}${MIX}amix=inputs=$n:normalize=0,acompressor=threshold=0.12:ratio=3:attack=8:release=180,volume=1.9[voz];"
FIL="${FIL}[voz]asplit=2[voz1][disp];[$((n+1)):a]volume=0.46[sfx];[$((n+2)):a]volume=0.52[cama0];"
FIL="${FIL}[cama0][disp]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=550:makeup=1[cama];"
FIL="${FIL}[voz1][sfx][cama]amix=inputs=3:normalize=0,aresample=48000,alimiter=limit=0.60,apad[a]"
ffmpeg -v error -y -i "$MUDA" $ENT -i sfx_eco.wav -i cama_lanzamiento.wav \
  -filter_complex "$FIL" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "$SALIDA"
echo "mezclada: $SALIDA"
