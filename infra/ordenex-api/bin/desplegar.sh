#!/usr/bin/env bash
#
# Despliega Ordenex a Heroku, con las comprobaciones puestas.
#
#   HEROKU_API_KEY=… infra/ordenex-api/bin/desplegar.sh
#
# ═══════════════════════════════════════════════════════════════════════════
# POR QUÉ ESTE GUION Y NO TRES COMANDOS SUELTOS
#
# Este repositorio es un monorepo y Heroku espera un proyecto en la raíz, así
# que el despliegue va por `git subtree` — que es fácil de escribir mal y
# silencioso cuando sale mal: se empuja un prefijo equivocado y el dyno se cae
# con «no Procfile», o se empuja una rama vieja y nadie lo nota.
#
# Y hay dos cosas que HAY que mirar antes y después, y que a mano se saltan:
#
#   ANTES   que las pruebas estén en verde. Este servicio se niega a arrancar
#           si los decimales no cuadran, así que un despliegue malo no es «una
#           función rota»: es el API entero caído.
#   DESPUÉS que /salud conteste y que las rutas nuevas EXISTAN. Un despliegue
#           que dice «hecho» y deja el dyno en bucle de reinicio se ve igual
#           que uno bueno desde la terminal.
#
# ═══════════════════════════════════════════════════════════════════════════
# LO QUE ESTE GUION NO HACE, A PROPÓSITO
#
# NO enciende el barrido ni la entrega. `BARRIDO=1` y `COMPRAS=1` se ponen a
# mano, en otro momento y sabiendo lo que se hace: el vigía solo mira, pero
# esos dos FIRMAN con llaves y gastan gas. Ver la página 15 del PDF del
# depósito provisional para el orden de encendido.
#
# NO toca ninguna otra variable. Si falta alguna, el panel lo dice.

set -euo pipefail

APP="${HEROKU_APP:-ordenex-api}"
PREFIJO="infra/ordenex-api"
RAMA="$(git rev-parse --abbrev-ref HEAD)"
API="${ORDENEX_API_URL:-https://ordenex-api-ba4b27b8b51a.herokuapp.com}"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
paso()  { printf '\n\033[1m── %s\033[0m\n' "$*"; }

cd "$(git rev-parse --show-toplevel)"

# ── 1. la llave ─────────────────────────────────────────────────────────────
paso "La llave de Heroku"
if [ -z "${HEROKU_API_KEY:-}" ]; then
  rojo "Falta HEROKU_API_KEY."
  echo "   Se pone en el entorno, no en un archivo y no en el chat:"
  echo "   export HEROKU_API_KEY=\$(heroku auth:token)"
  exit 1
fi
codigo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
  https://api.heroku.com/account \
  -H 'Accept: application/vnd.heroku+json; version=3' \
  -H "Authorization: Bearer $HEROKU_API_KEY")
if [ "$codigo" != "200" ]; then
  rojo "La llave no vale (Heroku contestó $codigo)."
  echo "   Si la rotaste hace poco, esta es la vieja. Sacá una nueva y volvé."
  exit 1
fi
verde "✓ la llave vale"

# ── 2. las pruebas ──────────────────────────────────────────────────────────
paso "Las pruebas, antes de tocar nada"
if [ "${SALTAR_PRUEBAS:-}" = "1" ]; then
  rojo "⚠ saltadas por SALTAR_PRUEBAS=1 — que quede dicho"
else
  ( cd "$PREFIJO" && npm run probar ) >/tmp/ordenex-probar.log 2>&1 || {
    rojo "Las pruebas fallaron. NO se despliega."
    tail -30 /tmp/ordenex-probar.log
    exit 1
  }
  verde "✓ $(grep -c '^Todo en verde' /tmp/ordenex-probar.log) suites en verde"
fi

# ── 3. el subtree ───────────────────────────────────────────────────────────
paso "Armando el subtree de $PREFIJO ($RAMA)"
COMMIT=$(git subtree split --prefix "$PREFIJO" HEAD 2>/dev/null | tail -1)
[ -n "$COMMIT" ] || { rojo "el subtree no salió"; exit 1; }
# Que lo que se va a empujar tenga lo que Heroku necesita EN LA RAÍZ. Un
# prefijo equivocado produce un commit perfectamente válido y un dyno muerto.
for f in Procfile package.json app.js; do
  git cat-file -e "$COMMIT:$f" 2>/dev/null || { rojo "al subtree le falta $f"; exit 1; }
done
verde "✓ $COMMIT  ·  con Procfile, package.json y app.js en la raíz"

# ── 4. empujar ──────────────────────────────────────────────────────────────
paso "Empujando a $APP"
git push --force "https://heroku:$HEROKU_API_KEY@git.heroku.com/$APP.git" \
  "$COMMIT:refs/heads/main"
verde "✓ empujado"

# ── 5. mirar que quedó vivo ─────────────────────────────────────────────────
#
# El arranque verifica los decimales contra las tres cadenas y mide los
# tiempos de bloque, así que tarda unos segundos. Se espera y se comprueba;
# un despliegue que no se mira no está terminado.
paso "Esperando a que arranque"
for i in $(seq 1 20); do
  sleep 6
  salud=$(curl -s --max-time 20 "$API/salud" || true)
  if echo "$salud" | grep -q '"ok":true'; then
    verde "✓ /salud contesta: $salud"
    break
  fi
  printf '.'
  [ "$i" = "20" ] && { rojo "no levantó en dos minutos. Mirá: heroku logs -a $APP"; exit 1; }
done

paso "¿Están las rutas nuevas?"
# 401 es la respuesta BUENA: la ruta existe y pide sesión. 404 significa que
# se desplegó una versión vieja, que es justo el fallo que este guion existe
# para no dejar pasar en silencio.
fallo=0
for ruta in /compras /portafolio; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$API$ruta")
  if [ "$c" = "404" ]; then rojo "✗ $ruta da 404: se desplegó una versión vieja"; fallo=1
  else verde "✓ $ruta responde $c (existe)"; fi
done
[ "$fallo" = "0" ] || exit 1

paso "Listo"
echo "El vigía ya está mirando. El barrido y la entrega siguen APAGADOS:"
echo "  heroku config:set BARRIDO=1 -a $APP    # cuando hayas visto una semana"
echo "  heroku config:set COMPRAS=1 -a $APP    # después de probar el barrido"
