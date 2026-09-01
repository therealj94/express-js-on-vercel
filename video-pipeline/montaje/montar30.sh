#!/bin/bash
# Corte de 30 s para movil: el gancho delante y el contador explicado en 6 s.
set -e
C=clips; M=m30; rm -rf $M; mkdir -p $M

# 0-7s  La floreria. El contador se desploma 24->14 (resumen de la parte 1)
# y vuelve a 24. Todo el problema contado en siete segundos.
ffmpeg -v error -y -ss 1.5 -t 8.4 -i "$C/01_el_envio_00001_.mp4" \
  -i h_a24.png -i h_a21.png -i h_a19.png -i h_a16.png -i h_a14.png -i h_b24.png \
  -filter_complex "
   [0:v][1:v]overlay=0:0:enable='lt(t,6.2)'[a];
   [a][2:v]overlay=0:0:enable='between(t,6.2,6.7)'[b];
   [b][3:v]overlay=0:0:enable='between(t,6.7,7.2)'[c];
   [c][4:v]overlay=0:0:enable='between(t,7.2,7.7)'[d];
   [d][5:v]overlay=0:0:enable='between(t,7.7,8.4)'[e];
   [e][6:v]overlay=0:0:enable='gte(t,8.4)'[v]" \
  -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 20 $M/a.mp4

# 7-11s  Las manos que envian
ffmpeg -v error -y -ss 5 -t 4 -i "$C/02_las_manos_que_envian_00001_.mp4" -i h_b24.png \
  -filter_complex "[0:v][1:v]overlay=0:0[v]" -map "[v]" -an \
  -c:v libx264 -pix_fmt yuv420p -crf 20 $M/b.mp4

# 11-19s  El corte: mismo gesto, otra casa. Cae el petalo a los 6 s del plano.
ffmpeg -v error -y -ss 1 -t 8 -i "$C/03_las_manos_que_reciben_00001_.mp4" \
  -i h_b24.png -i h_b239.png -i h_menos.png -filter_complex "
   [0:v][1:v]overlay=0:0:enable='lt(t,5)'[a];
   [a][2:v]overlay=0:0:enable='gte(t,5)'[b];
   [3:v]format=rgba,fade=t=in:st=5:d=0.25:alpha=1,fade=t=out:st=6.4:d=1.1:alpha=1[m];
   [b][m]overlay=0:'if(lt(t,5),60,60-26*min(1,(t-5)/1.4))'[v]" \
  -map "[v]" -an -c:v libx264 -pix_fmt yuv420p -crf 20 $M/c.mp4

# 19-25s  El petalo. Cortado antes del dedo raro que encontro el revisor.
ffmpeg -v error -y -ss 1.5 -t 5 -i "$C/04_el_petalo_00001_.mp4" -i h_b239.png \
  -filter_complex "[0:v][1:v]overlay=0:0[v]" -map "[v]" -an \
  -c:v libx264 -pix_fmt yuv420p -crf 20 $M/d.mp4

# 25-30s  Cierre
ffmpeg -v error -y -loop 1 -t 5 -i h_cierre.png \
  -vf "format=yuv420p,fade=t=in:st=0:d=0.5" -r 24 -c:v libx264 -crf 20 $M/e.mp4

for f in a b c d e; do echo "file '$PWD/$M/$f.mp4'"; done > $M/lista.txt
ffmpeg -v error -y -f concat -safe 0 -i $M/lista.txt -c copy corto.mp4
ffmpeg -hide_banner -i corto.mp4 2>&1 | grep Duration
