# El código de app.vetawallet.com, rescatado y ya junto

Fecha: 2026-09-20.

## Qué pasaba

El sitio vivo se desplegó el **10-sep-2026** con el sello `6439c6538a`. Ese commit
no existía en ningún repositorio: se compiló y se subió a mano desde una máquina,
y esa copia era la única. Mientras siguiera así, cualquier despliegue hecho desde
el repositorio **borraba de producción** lo que solo vivía ahí — el accidente del
12-ago, otra vez.

Se buscó en los cuatro repositorios donde podía estar —`express-js-on-vercel`,
`veta-wallet-backend-` (es la API, no la web), `ordenglobalfinale` y
`ULTRON-APP`— y no estaba en ninguno.

La wallet sirve JavaScript sin minificar, así que lo publicado ES el fuente. Se
descargó entero del propio dominio, con su SHA-256 en `MANIFIESTO.json`.

## Qué se juntó

Seis archivos diferían entre el repositorio y producción: `app.js`, `chat.js`,
`i18n.js`, `index.html`, `llamada.js` y `llamadaGrupo.js`. Los otros 36 ya eran
idénticos.

**Producción resultó ser más nueva en los seis**, y por dos vías que coinciden:

1. El último cambio del repositorio a cada uno de esos archivos es del **8-sep o
   anterior**; el despliegue es del **10-sep**. Lo que producción tiene de más es
   el trabajo de esos dos días —la tarjeta, sobre todo: movimientos paginados,
   detalle de un movimiento, estado de emisión, el giro para ver el secreto, sus
   textos— más lo de llamadas.
2. Las 78 líneas que solo estaban en el repositorio no eran trabajo sin
   desplegar, sino la **versión anterior** de líneas que producción reescribió.
   Se comprobó una por una: cada identificador, ruta de API, clave de traducción
   e id de HTML que aparecía solo en el lado del repositorio existe también en
   producción. Nada quedaba fuera.

Así que junta = producción manda en esos seis, y así está ahora en
`apps-web/veta-wallet/`. `comparar-publicado.py` lo confirma: **42 iguales, 0
distintos**. Los cinco JavaScript pasan `node --check`.

El motor de galaxia que sirve hoy (`augalaxy/assets/`) ya estaba en el
repositorio byte por byte; no hubo nada que juntar ahí.

## Cómo comprobarlo

    sha256sum apps-web/veta-wallet/app.js     # contra MANIFIESTO.json
    python3 apps-web/comparar-publicado.py apps-web/veta-wallet https://app.vetawallet.com

`MANIFIESTO.json` guarda la huella de los 36 archivos tal como los servía el
dominio el 20-sep, más los 5 del motor. Los archivos en sí no se dejan
duplicados aquí: su contenido es exactamente el de `apps-web/veta-wallet/`.

## Lo que sigue

Ahora que el repositorio y el dominio dicen lo mismo, poner la galaxia nueva es
el camino normal y sin sorpresas:

1. `python3 apps-web/augalaxy/publicar.py` — compila el motor nuevo, lo deja en
   `veta-wallet/augalaxy/assets/` y le sella la versión en `app.js`.
2. `python3 apps-web/subir.py apps-web/veta-wallet <appId>` — sube el árbol
   completo a Amplify. **Amplify reemplaza el manifiesto entero: lo que no va en
   la subida desaparece del sitio**, y por eso importaba tanto que el árbol
   estuviera completo antes de tocarlo.
3. Volver a correr `comparar-publicado.py` después de subir.

Y antes del paso 2, lo que sigue sin comprobar de la galaxia nueva: un visor de
verdad, un teléfono de verdad y el login de producción.

No se ha tocado el dominio. Sigue sirviendo lo del 10-sep.
