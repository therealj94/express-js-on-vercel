#!/bin/bash
# Mezcla de Cincuenta: ambiente real + música + las líneas de voz del guion.
#
# La música ya no espera al segundo 15. La cama se sintetizaba con osciladores
# y por eso había que esconderla; ahora está compuesta (tools/musica_el.py) y
# empieza casi en silencio ella sola, así que entra desde el primer fotograma
# con un fundido de seis segundos y hace el trabajo que hacía el hueco.
#
# El ducking baja de ratio 8 a ratio 4: a ratio 8 la música no se apartaba, se
# borraba cada vez que alguien hablaba. Los tiempos de la voz salen del propio
# guion de montaje para que no puedan divergir de la imagen.
#
# El limitador lleva level=false a propósito: por defecto ffmpeg RE-NORMALIZA
# la salida a 0 dBFS después de limitar, así que el techo no servía de nada y
# la mezcla salía aplastada contra el tope.
#
#   bash montaje/mezcla_cincuenta.sh muda.mp4 prompts/pelicula1_montaje.json salida.mp4 42.4
set -e
MUDA=$1; ESPEC=$2; SALIDA=$3; DUR=${4:-42.4}
T_MUSICA=${T_MUSICA:-0.0}

# El apad de la voz NO es decorativo: sidechaincompress deja de producir
# salida en cuanto se acaba su entrada de control. La voz termina antes que
# la pieza, y con ella se cortaban el ambiente y la música: el último
# segundo de Cincuenta salía en silencio DIGITAL, -240 dBFS medidos.
ENT=""; FIL=""; MIX=""; n=0
while read -r i seg; do
  # 150 ms de aire delante: la voz sintetizada empieza en el fotograma 0 y el
  # compresor se comía la primera sílaba —"Orden" se transcribía como "Den"—.
  n=$((n+1)); ms=$(python3 -c "print(max(0,int($seg*1000)-150))")
  ENT="$ENT -i p1_v${i}.wav"
  FIL="${FIL}[$n:a]adelay=150|150[p$n];"
  FIL="${FIL}[p$n]adelay=${ms}|${ms}[l$n];"; MIX="${MIX}[l$n]"
done < <(python3 -c "import json;[print(i,t) for i,t in json.load(open('$ESPEC'))['voz']['orden']]")

# La voz baja 3 dB respecto de la primera mezcla: entraba como un martillazo
# después de tanto ambiente.
FIL="${FIL}${MIX}amix=inputs=$n:normalize=0,acompressor=threshold=0.12:ratio=3:attack=8:release=180,volume=3.0,aecho=0.9:0.85:14:0.12,apad[voz];"
FIL="${FIL}[voz]asplit=3[voz1][disp][disp2];"
FIL="${FIL}[$((n+1)):a]volume=2.2[amb0];"
FIL="${FIL}[amb0][disp2]sidechaincompress=threshold=0.06:ratio=4:attack=8:release=420:makeup=1[amb];"
FIL="${FIL}[$((n+2)):a]volume='min(1,max(0,(t-${T_MUSICA})/6))*0.78':eval=frame[cama0];"
FIL="${FIL}[cama0][disp]sidechaincompress=threshold=0.06:ratio=4:attack=12:release=420:makeup=1[cama];"
FIL="${FIL}[voz1][amb][cama]amix=inputs=3:normalize=0,aresample=48000,alimiter=limit=0.70:attack=3:release=60:level=false,apad[a]"

ffmpeg -v error -y -i "$MUDA" $ENT -i son_cincuenta.wav -i cama_cincuenta.wav \
  -filter_complex "$FIL" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$DUR" "$SALIDA"
echo "mezclada: $SALIDA ($n líneas de voz)"
