#!/bin/sh
# Rehace la copia de trabajo completa del sitio en $1 (por defecto /tmp/ogsite):
# el código sale de este directorio y los medios se bajan de producción.
# Después: python3 desplegar.py /tmp/ogsite
set -e
AQUI=$(cd "$(dirname "$0")" && pwd)
RAIZ=${1:-/tmp/ogsite}
B=https://www.ordenglobal.org
mkdir -p "$RAIZ/assets/fuentes" "$RAIZ/assets/medios" "$RAIZ/audio" "$RAIZ/en" "$RAIZ/historia"
cd "$RAIZ"

# El código, del repositorio.
cp "$AQUI/index.html" "$AQUI/404.html" "$AQUI/robots.txt" "$AQUI/sitemap.xml" .
cp "$AQUI/en/index.html" en/
cp "$AQUI/historia/index.html" historia/
cp "$AQUI/assets/"*.css "$AQUI/assets/"*.js "$AQUI/assets/"*.svg assets/
# Los dos videos de la campaña y sus pósteres viven en el repositorio: la
# portada nueva los estrena y producción todavía no los tiene.
cp "$AQUI/assets/medios/"* assets/medios/
cp "$AQUI/assets/fuentes/"*.woff2 assets/fuentes/

# Los medios, de producción.
bajar() { curl -sSf -o "$1" "$B/$1" || { echo "no se pudo bajar $1"; exit 1; }; }
bajar favicon.ico
for a in og.png favicon-og.png apple-touch-icon.png social.png social-en.png veta-icon.png genesis-mark.png \
         origen.jpg auka.jpg agka.jpg ondk.jpg; do bajar assets/$a; done
for s in hero gold blockchain origen; do
  mkdir -p seq/$s
  i=0; while [ $i -le 53 ]; do bajar seq/$s/$(printf %02d $i).webp; i=$((i+1)); done
done
bajar audio/ambiente.mp3
for c in fondo pulso alma senal cumbre; do bajar audio/capa-$c.mp3; done
for f in pala desmorona moneda particula rayo tic boveda cadena puente fin chispa motor hidraulico; do bajar audio/fx-$f.mp3; done

echo "$(find . -type f | wc -l) archivos en $RAIZ ($(du -sh . | cut -f1))"
