#!/bin/bash
# Mezcla con ducking real: la musica suena de verdad y se aparta sola cuando
# entra la voz. Antes iba a 0.17 y quedaba en -33 dBFS, inaudible en un movil.
set -e
PFX=$1; DUR=$2; SALIDA=$3
# Si voces_el.py tuvo que adelantar alguna línea para que cupiera, sus tiempos
# mandan sobre los del guion. Sin esto la frase se colocaría donde ya no cabe.
G=$(python3 -c "
import json, os
p = 'tiempos_${PFX}.json'
t = json.load(open(p)) if os.path.exists(p) else [x for x, _ in json.load(open('guion_${PFX}.json'))]
print(' '.join(str(int(v*1000)) for v in t))")
ENT=""; FIL=""; MIX=""; i=0
for ms in $G; do i=$((i+1)); ENT="$ENT -i v${PFX:0:1}_${i}.wav"
  FIL="${FIL}[$i:a]adelay=${ms}|${ms}[l$i];"; MIX="${MIX}[l$i]"; done
# Toda la voz junta, para usarla como disparador del ducking.
FIL="${FIL}${MIX}amix=inputs=${i}:normalize=0,volume=1.9[voz];"
FIL="${FIL}[voz]asplit=2[voz1][disp];"
k=$((i+1)); ENT="$ENT -i son_${PFX}.wav"; FIL="${FIL}[$k:a]volume=0.30[amb];"
k=$((k+1)); ENT="$ENT -i cama_${PFX}.wav"; FIL="${FIL}[$k:a]volume=0.85[cama0];"
# El disparador aparta la cama 12 dB en cuanto hay voz, y la deja volver despacio.
FIL="${FIL}[cama0][disp]sidechaincompress=threshold=0.03:ratio=9:attack=25:release=700:makeup=1[cama];"
FIL="${FIL}[voz1][amb][cama]amix=inputs=3:normalize=0,"
FIL="${FIL}aresample=48000,alimiter=limit=0.82,apad[a]"
ffmpeg -v error -y -i corte_${PFX}.mp4 $ENT -filter_complex "$FIL" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "$SALIDA"
echo "listo: $SALIDA"
