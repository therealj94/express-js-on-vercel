#!/bin/bash
# Mezcla voz + click + colchón sobre el montaje.  VOZ=em_alex  CAMA=1|0
set -e
V=${VOZ:-em_alex}; CAMA=${CAMA:-1}
DUR=$(python3 -c "
import subprocess,re
s=subprocess.run(['ffmpeg','-i','borrador.mp4'],capture_output=True,text=True).stderr
h,m,x=re.search(r'Duration: (\d+):(\d+):([\d.]+)',s).groups()
print(f'{int(h)*3600+int(m)*60+float(x):.2f}')")
G=$(python3 -c "
import json; print(' '.join(str(int(t*1000)) for t,_ in json.load(open('guion_voz.json'))))")

ENT=""; FIL=""; MIX=""; i=0
for ms in $G; do
  i=$((i+1)); ENT="$ENT -i k_${V}_${i}.wav"
  FIL="${FIL}[$i:a]adelay=${ms}|${ms},volume=1.0[l$i];"; MIX="${MIX}[l$i]"
done
ENT="$ENT -i click.wav"; k=$((i+1))
FIL="${FIL}[$k:a]adelay=26300|26300[ck];"; MIX="${MIX}[ck]"; N=$((i+1))

# El ambiente va SIEMPRE: es lo que hace que los planos suenen a sitios.
ENT="$ENT -i ambiente.wav"; amb=$((k+1))
FIL="${FIL}[$amb:a]volume=0.62[amb];"; MIX="${MIX}[amb]"; N=$((N+1))

if [ "$CAMA" = "1" ]; then
  ENT="$ENT -i cama.wav"; c=$((amb+1))
  # sidechain: el colchón se aparta solo cuando entra la voz y vuelve al callar.
  FIL="${FIL}[$c:a]volume=0.85[cama];"
  MIX="${MIX}[cama]"; N=$((N+1))
fi

ffmpeg -v error -y -i borrador.mp4 $ENT -filter_complex \
  "${FIL}${MIX}amix=inputs=${N}:normalize=0,aresample=48000,\
   acompressor=threshold=0.12:ratio=3:attack=8:release=260,\
   alimiter=limit=0.94,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "final_${V}$([ "$CAMA" = 0 ] && echo _sin_musica).mp4"
echo "listo: final_${V}$([ "$CAMA" = 0 ] && echo _sin_musica).mp4"
