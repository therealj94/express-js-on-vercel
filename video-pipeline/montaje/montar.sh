#!/bin/bash
set -e
C=clips; M=mont; rm -rf $M; mkdir -p $M

# Cada plano lleva su capa fija encima.
pon() { ffmpeg -v error -y -i "$1" -i "$2" \
    -filter_complex "[0:v][1:v]overlay=0:0[v]" -map "[v]" -an \
    -c:v libx264 -pix_fmt yuv420p -crf 20 "$M/$3"; }

pon "$C/01_el_envio_00001_.mp4"             cap_p1.png p1.mp4
pon "$C/02_las_manos_que_envian_00001_.mp4" cap_p2.png p2.mp4
pon "$C/04_el_petalo_00001_.mp4"            cap_p4.png p4.mp4
pon "$C/05_ella_00001_.mp4"                 cap_p5.png p5.mp4

# El 3 es el del pétalo que cae: el "−0.1" sube y se desvanece a los 6 s,
# que es cuando el contador pasa a 23.9. Es el único movimiento del HUD.
ffmpeg -v error -y -i "$C/03_las_manos_que_reciben_00001_.mp4" \
  -i cap_p3.png -i cap_menos.png -filter_complex "
   [0:v][1:v]overlay=0:0[a];
   [2:v]format=rgba,fade=t=in:st=6:d=0.3:alpha=1,fade=t=out:st=7.6:d=1.2:alpha=1[m];
   [a][m]overlay=0:'if(lt(t,6),60,60-26*min(1,(t-6)/1.5))'[v]" \
  -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 20 $M/p3.mp4

# Cierre de 6 s con fundido de entrada.
ffmpeg -v error -y -loop 1 -t 6 -i cap_cierre.png \
  -vf "format=yuv420p,fade=t=in:st=0:d=0.7" -r 24 \
  -c:v libx264 -crf 20 $M/p6.mp4

for f in p1 p2 p3 p4 p5 p6; do echo "file '$PWD/$M/$f.mp4'"; done > $M/lista.txt
ffmpeg -v error -y -f concat -safe 0 -i $M/lista.txt -c copy borrador.mp4
ffmpeg -hide_banner -i borrador.mp4 2>&1 | grep -E "Duration|Stream #0:0"
