#!/bin/bash
# Mezcla la narración y el click sobre el montaje. VOZ=claude|ald
set -e
V=${VOZ:-claude}
DUR=$(python3 -c "
import subprocess,re
s=subprocess.run(['ffmpeg','-i','borrador.mp4'],capture_output=True,text=True).stderr
h,m,x=re.search(r'Duration: (\d+):(\d+):([\d.]+)',s).groups()
print(f'{int(h)*3600+int(m)*60+float(x):.2f}')")
G=$(python3 -c "
import json; print(' '.join(str(int(t*1000)) for t,_ in json.load(open('guion_voz.json'))))")

ENT=""; FIL=""; i=0
for ms in $G; do
  i=$((i+1)); ENT="$ENT -i v_${V}_${i}.wav"
  FIL="${FIL}[$i:a]adelay=${ms}|${ms}[l$i];"
done
# El click cae a los 26,3 s: el instante en que se suelta el pétalo.
ENT="$ENT -i click.wav"; k=$((i+1))
FIL="${FIL}[$k:a]adelay=26300|26300[ck];"
MIX=""; for n in $(seq 1 $i); do MIX="${MIX}[l$n]"; done; MIX="${MIX}[ck]"

# apad + -t: sin esto el mapa de audio acaba en la ultima frase y el video se
# corta ahi. La primera version perdio 3,7 s de cierre por ese motivo.
ffmpeg -v error -y -i borrador.mp4 $ENT -filter_complex \
  "${FIL}${MIX}amix=inputs=$((i+1)):normalize=0,aresample=48000,alimiter=limit=0.95,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "anuncio_${V}.mp4"
echo "listo: anuncio_${V}.mp4 (objetivo ${DUR}s)"
