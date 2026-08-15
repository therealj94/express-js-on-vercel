#!/usr/bin/env bash
# Manda por aire los cambios de JavaScript a los teléfonos que ya tienen el
# APK instalado. No sirve para cambios NATIVOS (una librería nueva con parte
# nativa): esos piden APK. Como el runtime va por huella, si lo nativo cambió
# los teléfonos viejos no reciben nada en vez de romperse.
#
#   ./actualizar-por-aire.sh "lo que cambió"
set -e
cd "$(dirname "$0")"
MENSAJE="${1:-mejoras}"
[ -z "$EXPO_TOKEN" ] && { echo "falta EXPO_TOKEN"; exit 1; }

echo "── comprobando que el paquete compila antes de mandar nada"
npx expo export --platform android --clear >/dev/null
rm -rf dist

echo "── publicando en el canal preview"
npx eas update --branch preview --message "$MENSAJE" --non-interactive

echo
echo "Listo. Los teléfonos lo reciben al abrir la app (o al volver del"
echo "segundo plano, como mucho una vez cada 10 minutos). No se reinician"
echo "solos: la app ofrece reiniciar."
