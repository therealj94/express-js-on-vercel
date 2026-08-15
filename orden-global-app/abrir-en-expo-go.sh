#!/usr/bin/env bash
# Publica la VISTA PREVIA: la app tal cual, abriéndose dentro de Expo Go, sin
# que nadie instale un APK. Se manda un QR o un enlace y ya está.
#
#   ./abrir-en-expo-go.sh "lo que se enseña"
#
# ── EL PELIGRO QUE ESTE GUION EXISTE PARA EVITAR ────────────────────────────
#
# Los APK que ya están en los teléfonos de la gente reciben las mejoras por
# aire (actualizar-por-aire.sh) desde el canal 'preview', y se reconocen entre
# sí por el runtime de POLÍTICA 'fingerprint': una huella de lo nativo que se
# calcula sola.
#
# Expo Go no entiende esa huella. Para que Expo Go acepte un update, el
# runtime tiene que llamarse EXACTAMENTE "exposdk:54.0.0" — el SDK que ese
# binario trae dentro.
#
# O sea que hay que cambiar app.json para publicar aquí. Y si ese cambio se
# queda puesto, la próxima publicación por aire sale con el runtime de Expo Go
# y los APK de la gente DEJAN DE RECIBIR NADA. Nadie se entera: no rompe, no
# avisa, simplemente los teléfonos se quedan quietos para siempre.
#
# Por eso todo lo que sigue: copia de app.json → variante → publicación en un
# canal APARTE ('expogo', que no toca 'preview') → y la restauración pasa
# SIEMPRE, salga bien, salga mal o corte el usuario con Ctrl-C (trap EXIT),
# con git de testigo al final. Si app.json no volvió a su sitio, esto grita.
#
# ── DOS COSAS QUE HAY QUE SABER ────────────────────────────────────────────
#
#   · El token NO vive aquí. Se pasa por fuera:  EXPO_TOKEN=... ./abrir-en-expo-go.sh
#     Nunca se escribe su valor en ningún fichero de este proyecto.
#   · app.config.js está al lado de app.json, pero con EXPO_PUBLIC_ENSAYO sin
#     poner devuelve la configuración TAL CUAL. Por eso tocar app.json basta
#     y no hay que tocar el .js. (Ver la cabecera de app.config.js.)
set -e
# Sin pipefail, un `npx ... | tee` da por bueno un fallo de npx porque el
# último de la tubería es tee. Aquí eso significaría cantar victoria sin haber
# publicado nada.
set -o pipefail
cd "$(dirname "$0")"

MENSAJE="${1:-vista previa}"
SDK_ESPERADO="54"
RUNTIME_GO="exposdk:${SDK_ESPERADO}.0.0"
CANAL="expogo"
PROYECTO="3017e984-a8ac-479c-8b75-33f8b8e69b25"
RESPALDO=".app.json.antes-de-expo-go"
RESTAURADO=0
LIMPIO_AL_EMPEZAR=0

[ -z "$EXPO_TOKEN" ] && { echo "falta EXPO_TOKEN (se pasa por fuera, no se guarda en el guion)"; exit 1; }

# La vista previa enseña la app DE VERDAD, no el build de ensayo (otro
# paquete, otro backend, tráfico sin cifrar). Si alguien trae la variable
# puesta de otra tarea, se la quitamos a este proceso y se avisa.
if [ "$EXPO_PUBLIC_ENSAYO" = "1" ]; then
  echo "── aviso: EXPO_PUBLIC_ENSAYO estaba en 1; la vista previa va sin él"
  unset EXPO_PUBLIC_ENSAYO
fi

# ── RESTAURAR: la parte que no se puede saltar ──────────────────────────────
# Idempotente a propósito. Se llama a mano cuando todo va bien (para que el
# enlace se imprima con app.json ya en su sitio) y la llama otra vez el trap
# al salir; la segunda vez no hace nada.
restaurar() {
  [ "$RESTAURADO" = "1" ] && return 0
  RESTAURADO=1
  local fallo=0

  if [ -f "$RESPALDO" ]; then
    cp -f "$RESPALDO" app.json || fallo=1
    if cmp -s "$RESPALDO" app.json; then
      rm -f "$RESPALDO"
      echo "── app.json restaurado: el runtime vuelve a ser la huella (canal preview intacto)"
    else
      fallo=1
      echo
      echo "!! ¡ALTO! No se pudo devolver app.json a su sitio."
      echo "!! La copia buena está en:  $PWD/$RESPALDO"
      echo "!! Cópiala encima de app.json A MANO antes de volver a publicar por aire,"
      echo "!! o los APK que ya tiene la gente dejarán de recibir actualizaciones."
    fi
  fi

  # El cinturón, además de los tirantes: que git diga que app.json quedó
  # idéntico. Solo vale como prueba si estaba limpio al empezar; si ya venía
  # tocado de antes, git no puede distinguir aquel cambio del nuestro y lo
  # honesto es decirlo en vez de dar un visto bueno falso.
  if [ "$LIMPIO_AL_EMPEZAR" = "1" ]; then
    if git diff --quiet HEAD -- app.json 2>/dev/null; then
      echo "── git confirma: app.json está exactamente como estaba"
    else
      fallo=1
      echo
      echo "!! ¡ALTO! git dice que app.json NO quedó como estaba. Esto es lo que sobra:"
      git --no-pager diff -- app.json 2>/dev/null | head -40 || true
      echo "!! Arréglalo (git checkout -- app.json) ANTES de tocar el canal preview."
    fi
  else
    echo "── app.json ya tenía cambios sin guardar antes de empezar: git no puede"
    echo "   certificar nada. Compruébalo tú:  git diff -- app.json"
  fi

  return $fallo
}

# $? tiene que leerse en la PRIMERA línea o cualquier cosa lo pisa.
salida() {
  CODIGO=$?
  restaurar || CODIGO=1
  exit $CODIGO
}
trap salida EXIT
trap 'echo; echo "── cortado a mano; devolviendo app.json a su sitio"; exit 130' INT TERM

# ── 1. ¿El SDK del proyecto sigue siendo el 54? ─────────────────────────────
# Si alguien sube la app al SDK siguiente y este guion sigue diciendo
# exposdk:54.0.0, la publicación sale y NO la abre nadie: Expo Go pedirá un
# runtime que ya no existe en el bundle. Mejor parar aquí.
SDK_PROYECTO="$(node -p "String(require('./package.json').dependencies.expo).replace(/[^0-9.]/g,'').split('.')[0]" 2>/dev/null || echo "")"
if [ -n "$SDK_PROYECTO" ] && [ "$SDK_PROYECTO" != "$SDK_ESPERADO" ]; then
  echo "!! El proyecto va por el SDK $SDK_PROYECTO y este guion publica para el $SDK_ESPERADO."
  echo "!! Cambia SDK_ESPERADO aquí arriba (y el enlace del final, y VISTA-PREVIA.md)"
  echo "!! o los miembros verán un error nada más escanear."
  exit 1
fi

# ── 2. Copia de seguridad ANTES de tocar nada ───────────────────────────────
git diff --quiet HEAD -- app.json 2>/dev/null && LIMPIO_AL_EMPEZAR=1
cp app.json "$RESPALDO"
echo "── copia de app.json guardada en $RESPALDO"

# ── 3. La variante para Expo Go ─────────────────────────────────────────────
# Con python3 (o node de reserva) y no con sed: app.json tiene el runtime
# escrito como un objeto de dos líneas ({"policy":"fingerprint"}) y hay que
# sustituirlo por un texto suelto. Un sed que acierte con eso hoy falla el día
# que alguien reordene el fichero, y ese fallo es justo el que rompe el canal
# de los APK. Un lector de JSON de verdad no se equivoca de llave.
echo "── escribiendo la variante con runtimeVersion $RUNTIME_GO"
if command -v python3 >/dev/null 2>&1; then
  python3 - "$RUNTIME_GO" <<'PY'
import json, sys
runtime = sys.argv[1]
with open('app.json', encoding='utf-8') as f:
    d = json.load(f)
d['expo']['runtimeVersion'] = runtime
with open('app.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write('\n')
PY
else
  node -e '
    const fs = require("fs");
    const d = JSON.parse(fs.readFileSync("app.json", "utf8"));
    d.expo.runtimeVersion = process.argv[1];
    fs.writeFileSync("app.json", JSON.stringify(d, null, 2) + "\n");
  ' "$RUNTIME_GO"
fi

# Releer y comprobar: si la escritura no dejó lo que creemos, se para aquí
# (el trap devuelve app.json) en vez de publicar algo que nadie podrá abrir.
PUESTO="$(node -p "String(require('./app.json').expo.runtimeVersion)")"
[ "$PUESTO" = "$RUNTIME_GO" ] || { echo "!! la variante quedó con runtimeVersion '$PUESTO'; se esperaba '$RUNTIME_GO'"; exit 1; }

# ── 4. La puerta: si el paquete no se arma, no se publica ───────────────────
# Va DESPUÉS de escribir la variante a propósito: así lo que se prueba es
# exactamente la configuración que se va a publicar, no otra. El trap ya está
# armado, así que un fallo aquí también devuelve app.json.
echo "── comprobando que el paquete se arma (esto tarda un rato)"
npx expo export --platform android --clear >/dev/null
rm -rf dist

# ── 5. El canal aparte ──────────────────────────────────────────────────────
# 'expogo' no es 'preview'. Los APK de la gente escuchan 'preview'; lo que se
# publique aquí no les llega ni les estorba.
echo "── asegurando el canal $CANAL"
npx eas-cli channel:create "$CANAL" --non-interactive >/dev/null 2>&1 || true
if ! npx eas-cli channel:view "$CANAL" --non-interactive >/dev/null 2>&1; then
  echo "!! el canal $CANAL no existe y no se pudo crear. Sin canal, el enlace de"
  echo "!! los miembros apunta al vacío y la app no abre. Revisa la cuenta/token."
  exit 1
fi

# ── 6. Publicar ─────────────────────────────────────────────────────────────
echo "── publicando en la rama y el canal $CANAL"
REGISTRO="$(mktemp)"
if ! npx eas-cli update --branch "$CANAL" --channel "$CANAL" --message "$MENSAJE" --non-interactive 2>&1 | tee "$REGISTRO"; then
  # Hay versiones de eas-cli que no admiten --branch y --channel a la vez.
  # Ese caso concreto se reintenta solo con --branch (el canal ya existe y
  # apunta a la rama del mismo nombre, así que el resultado es el mismo).
  # Cualquier OTRO fallo se respeta: no se reintenta a ciegas.
  if grep -qiE 'mutually exclusive|both .*--channel|--channel.*--branch|--branch.*--channel' "$REGISTRO"; then
    echo "── esta versión de eas-cli no acepta las dos banderas; se repite solo con --branch"
    npx eas-cli update --branch "$CANAL" --message "$MENSAJE" --non-interactive
  else
    rm -f "$REGISTRO"
    exit 1
  fi
fi
rm -f "$REGISTRO"

# ── 7. app.json a su sitio ANTES de cantar victoria ─────────────────────────
restaurar || exit 1

ENLACE="exp://u.expo.dev/${PROYECTO}?channel-name=${CANAL}&runtime-version=${RUNTIME_GO}&platform=android"

echo
echo "Publicado. Esto es lo que se le manda a un miembro:"
echo
echo "  $ENLACE"
echo
echo "Hace falta Expo Go del SDK $SDK_ESPERADO: sin él el enlace no abre nada."
echo "Android: https://expo.dev/go?sdkVersion=${SDK_ESPERADO}&platform=android&device=true"
echo
echo "El QR con el sello de la casa se fabrica con:  python3 hacer-qr-vista-previa.py"
echo "Lo que ahí funciona y lo que no está escrito en VISTA-PREVIA.md."
