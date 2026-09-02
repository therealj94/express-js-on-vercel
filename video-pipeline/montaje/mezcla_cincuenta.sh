#!/bin/bash
# Mezcla de Cincuenta: ambiente + música + una sola línea de voz al final.
# La música NO entra hasta que el teléfono suena en la pulpería (17 s): antes
# la película es documental y solo se oye el sitio. Desde ahí sube despacio.
#   bash montaje/mezcla_cincuenta.sh muda.mp4 prompts/pelicula1_montaje.json salida.mp4 44.0
set -e
MUDA=$1; ESPEC=$2; SALIDA=$3; DUR=${4:-44.0}
T_VOZ=$(python3 -c "import json;print(int(json.load(open('$ESPEC'))['voz']['orden'][0][1]*1000))")
ffmpeg -v error -y -i "$MUDA" -i p1_cierre.wav -i son_cincuenta.wav -i cama_cincuenta.wav \
  -filter_complex "
    [1:a]adelay=${T_VOZ}|${T_VOZ},acompressor=threshold=0.12:ratio=3:attack=8:release=180,volume=1.7[voz];
    [2:a]volume=0.9[amb];
    [3:a]volume=0.0:enable='lt(t,16.8)',volume='min(1,(t-16.8)/6)*0.62':eval=frame[cama0];
    [voz]asplit=2[voz1][disp];
    [cama0][disp]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=600:makeup=1[cama];
    [voz1][amb][cama]amix=inputs=3:normalize=0,aresample=48000,alimiter=limit=0.62,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "$SALIDA"
echo "mezclada: $SALIDA"
