#!/bin/bash
# La copia de lo que no se puede reconstruir. Corre en el nodo, una vez al dia.
#
# ── QUE SE COPIA, Y POR QUE ESO Y NO TODO ───────────────────────────────────
#
# El codigo esta en git y las fichas tambien: perder /srv/aura entero no pierde
# ni una linea de eso. Lo que NO existe en ningun otro lado es:
#
#   perfiles.json    la memoria de cada charla, y el reloj de los 30 dias
#   premios.json     QUIEN YA GANO. Sin esto el tope de 200 deja de valer y la
#                    misma persona puede cobrar dos veces — es el archivo caro.
#   registro.jsonl   el registro de operacion: cortes del guardia, tiempos
#   candado.json     que no arranquen dos AU-RA a la vez
#   probadores.txt   se edita a mano en el nodo, no viene del repositorio
#
# ── LO QUE SE DEJA FUERA A PROPOSITO ────────────────────────────────────────
#
# `llave.txt` NO se copia. Es la llave del relevo, y una copia de un secreto es
# un sitio mas donde se puede filtrar. Si se pierde, AU-RA publica una llave de
# aparato nueva al arrancar —lo hace sola— y eso es mas barato que tenerla
# guardada en dos lados. Un secreto que no hace falta guardar, no se guarda.
#
# ── LOS 30 DIAS NO SON DECORACION ───────────────────────────────────────────
#
# A la gente se le prometio que al mes sin escribir se borra todo lo suyo, y
# `olvido` lo cumple en el nodo. Una copia que durara mas que eso romperia la
# promesa por la puerta de atras: el dato estaria borrado del servidor y vivo
# en S3. Por eso el prefijo `copias/aura/` vence a los 30 dias, puestos en el
# ciclo de vida del cubo — el mismo numero que AURA_PLAZO_DIAS.

set -euo pipefail

DATOS=${AURA_DATOS:-/srv/aura}
CUBO=${AURA_CUBO_COPIAS:-og-5550-arranque-548380372606}
HOY=$(date -u +%Y-%m-%d)

# El nodo escribe con el rol de la instancia, y ese rol SOLO puede poner
# objetos bajo `copias/aura/`. Ni leer, ni borrar, ni listar: si alguien entra
# a esta maquina, con esa llave no puede sacar las copias, solo agregar una.
# `saber.json` es TODO lo que AU-RA aprendio —las fichas del ecosistema, 51 KB
# el 2-sep— y no estaba en esta lista: la copia diaria pesaba 4 KB y nadie
# lo miro. Perder perfiles.json es perder treinta dias de charlas; perder
# saber.json es perder a AU-RA. `encargos.json` son ordenes firmadas por dos
# admins a medio ejecutar: sin ellas, una orden firmada se pierde en silencio.
ARCHIVOS=(perfiles.json premios.json registro.jsonl candado.json probadores.txt saber.json encargos.json)

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

hay=0
for f in "${ARCHIVOS[@]}"; do
  if [ -f "$DATOS/$f" ]; then
    cp -p "$DATOS/$f" "$TMP/$f"
    hay=1
  fi
done

# Que no haya NINGUNO no es normal: es una carpeta vacia o un montaje que no
# subio. Se sale con error para que el temporizador lo marque como fallo, en
# vez de subir un paquete vacio que despues parece una copia buena.
if [ "$hay" = 0 ]; then
  echo "no hay ni un archivo que copiar en $DATOS — no subo nada" >&2
  exit 1
fi

PAQUETE="$TMP/aura-$HOY.tar.gz"
tar -czf "$PAQUETE" -C "$TMP" $(cd "$TMP" && ls *.json *.jsonl *.txt 2>/dev/null)

# Se comprueba que el paquete se pueda ABRIR antes de subirlo. Un tar cortado
# sube igual de bien que uno entero y solo se descubre el dia que hace falta,
# que es el peor dia para descubrirlo.
tar -tzf "$PAQUETE" >/dev/null

aws s3 cp "$PAQUETE" "s3://$CUBO/copias/aura/aura-$HOY.tar.gz" \
  --only-show-errors --sse AES256

echo "copia subida: aura-$HOY.tar.gz ($(du -h "$PAQUETE" | cut -f1)), $(tar -tzf "$PAQUETE" | wc -l) archivos"
