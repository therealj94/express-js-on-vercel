#!/bin/sh
# Empaqueta la escena 3D de ORIGEN (escena3d/escena.js) con las partes de
# Three.js que usa, minificada, en assets/origen3d-escena.js. Se corre cuando
# cambia la escena o el símbolo; el resultado se versiona con el resto del
# sitio y reconstruir.sh lo copia como cualquier otro .js de assets.
#
#   sh construir-3d.sh
#
# Las versiones van fijas: un Three.js nuevo puede cambiar cómo se ve el oro.
set -e
AQUI=$(cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d)
mkdir -p "$TMP/escena3d"
cp "$AQUI/escena3d/"*.js "$TMP/escena3d/"
cd "$TMP"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund three@0.170.0 esbuild@0.24.0
./node_modules/.bin/esbuild escena3d/escena.js --bundle --minify --format=esm \
  --target=es2020 --legal-comments=eof --outfile="$AQUI/assets/origen3d-escena.js"
cd "$AQUI"
rm -rf "$TMP"
ls -l assets/origen3d-escena.js
