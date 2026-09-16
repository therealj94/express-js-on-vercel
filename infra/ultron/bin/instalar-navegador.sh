#!/bin/sh
# Baja Chromium para el arnés. En Render: build command
#   npm install && npm run instalar-navegador
# o ULTRON_PLAYWRIGHT=1 npm install
set -e
cd "$(dirname "$0")/.."
npm install playwright --no-save --no-package-lock || npm install playwright
npx playwright install chromium
echo "navegador listo"
