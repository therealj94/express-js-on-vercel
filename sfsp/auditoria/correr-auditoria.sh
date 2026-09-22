#!/usr/bin/env bash
# Corre la auditoria independiente con Codex sobre el arbol sfsp/.
#
# No recibe ninguna credencial por argumento ni la imprime. Codex toma la suya
# de OPENAI_API_KEY del entorno, o de una sesion de `codex login` ya hecha.
#
#   ./correr-auditoria.sh                 auditoria completa
#   ./correr-auditoria.sh --revision      revision de codigo de Codex sobre el diff
#
# El informe queda en informes/ con la fecha y el commit, para poder comparar
# una auditoria con la siguiente.
set -euo pipefail

aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
raiz="$(cd "$aqui/../.." && pwd)"
cd "$raiz"

if ! command -v codex >/dev/null 2>&1; then
  echo "No esta instalado el CLI de Codex. Instalalo con: npm i -g @openai/codex" >&2
  exit 1
fi

if [ -z "${OPENAI_API_KEY:-}" ] && ! codex login status >/dev/null 2>&1; then
  cat >&2 <<'AYUDA'
Codex no tiene credencial.

Dos formas, y ninguna pasa por el chat:
  1. Definir OPENAI_API_KEY en las variables de entorno del entorno de trabajo.
  2. Correr `codex login` en una terminal con navegador.

La clave no se escribe en este repositorio ni en ningun archivo de aqui.
AYUDA
  exit 2
fi

sha="$(git rev-parse --short HEAD)"
fecha="$(date -u +%Y%m%d-%H%M)"
mkdir -p "$aqui/informes"
salida="$aqui/informes/auditoria-${fecha}-${sha}.md"

if [ "${1:-}" = "--revision" ]; then
  echo "Revision de codigo de Codex sobre el diff, commit $sha"
  codex review 2>&1 | tee "$salida"
else
  echo "Auditoria completa del arbol sfsp/, commit $sha"
  echo "Esto tarda: el auditor lee el arbol entero y corre las pruebas."
  # --cd fija la raiz del repo para que pueda leer sfsp/ y correr las suites.
  # Solo lectura: el prompt le prohibe modificar archivos.
  codex exec --cd "$raiz" --skip-git-repo-check "$(cat "$aqui/PROMPT-AUDITORIA.md")" 2>&1 | tee "$salida"
fi

echo
echo "Informe: $salida"
echo "Anotalo en sfsp/evidence/registro.md con su estado de evidencia."
