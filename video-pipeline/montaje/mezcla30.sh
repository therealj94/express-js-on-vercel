#!/bin/bash
set -e
G=$(python3 -c "import json;print(' '.join(str(int(t*1000)) for t,_ in json.load(open('guion30.json'))))")
ENT=""; FIL=""; MIX=""; i=0
for ms in $G; do
  i=$((i+1)); ENT="$ENT -i c30_${i}.wav"
  FIL="${FIL}[$i:a]adelay=${ms}|${ms},volume=1.15[l$i];"; MIX="${MIX}[l$i]"
done
# Los cuatro dings del desplome, sincronizados con cada bajada del contador.
k=$i
for d in 1:6200 2:6700 3:7200 4:7700; do
  n=${d%%:*}; ms=${d##*:}; k=$((k+1)); ENT="$ENT -i ding${n}.wav"
  FIL="${FIL}[$k:a]adelay=${ms}|${ms}[d$n];"; MIX="${MIX}[d$n]"
done
# Y el unico click suave, cuando cae el petalo.
k=$((k+1)); ENT="$ENT -i click.wav"
FIL="${FIL}[$k:a]adelay=18400|18400[ck];"; MIX="${MIX}[ck]"
k=$((k+1)); ENT="$ENT -i amb30.wav"
FIL="${FIL}[$k:a]volume=0.30[amb];"; MIX="${MIX}[amb]"
N=$((i+6))
ffmpeg -v error -y -i corto.mp4 $ENT -filter_complex \
  "${FIL}${MIX}amix=inputs=${N}:normalize=0,aresample=48000,\
   acompressor=threshold=0.25:ratio=2:attack=15:release=300,\
   alimiter=limit=0.94,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t 30.50 corto_final.mp4
echo "listo: corto_final.mp4"
