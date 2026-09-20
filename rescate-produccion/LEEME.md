# El código que está corriendo en app.vetawallet.com

Fecha del rescate: 2026-09-20. Obtenido **del propio dominio**, no de una máquina
ni de una rama: cada archivo se descargó de `https://app.vetawallet.com/` y su
SHA-256 está en `app.vetawallet.com/MANIFIESTO.json`.

## Por qué existe esta carpeta

El sitio vivo se desplegó el **10-sep-2026** con el sello `6439c6538a`. Ese commit
no está en este repositorio, ni en `veta-wallet-backend-`, ni en ninguna rama:
se compiló y se subió a mano desde una máquina, y esa copia era la única que
existía. Mientras eso siguiera así, cualquier despliegue hecho desde el
repositorio **borraba de producción** lo que solo vivía ahí — que es exactamente
el accidente del 12-ago que ya costó funciones en producción una vez.

La wallet sirve JavaScript sin minificar, así que lo publicado ES el código
fuente. Por eso se pudo rescatar entero sin esperar a nadie.

## Qué hay, y en qué se diferencia del repositorio

Comparado con `origin/claude/veta-wallet-phantom-design-7syah8`, que es la rama
que sirve este mismo sitio: **36 archivos idénticos y 6 distintos.**

| Archivo | Solo en producción | Solo en el repositorio |
| --- | --- | --- |
| `app.js` | 444 líneas | 37 líneas |
| `llamada.js` | 103 | 7 |
| `index.html` | 72 | 23 |
| `i18n.js` | 56 | 4 |
| `llamadaGrupo.js` | 36 | 2 |
| `chat.js` | 4 | 3 |

Lo que solo está en producción es, sobre todo, la tarjeta: movimientos paginados
(`/cards/transactions`), el detalle de un movimiento, el estado de emisión, el
giro de la tarjeta para ver el secreto, y sus textos en `i18n.js`. Más lo de
llamadas.

Y al revés: hay 76 líneas **commiteadas y nunca desplegadas**. Las dos
direcciones importan, y por eso esto se junta antes de tocar el dominio, no
después.

También se rescató el motor de galaxia que está sirviendo hoy
(`augalaxy/assets/`, 5 archivos, 1,4 MB). Sus texturas no se bajaron: son las
mismas que ya están versionadas en `backup/legacy-webos-2026-09-20`.

## Cómo se despliega este sitio

AWS Amplify, con `apps-web/subir.py <carpeta> <appId> [rama]`. **Amplify
reemplaza el manifiesto entero en cada subida: lo que no va en la subida
desaparece del sitio.** No existe el despliegue parcial. Por eso la carpeta que
se suba tiene que ser el sitio completo y correcto, no un recorte.

## Qué falta para poner la galaxia nueva en el dominio

1. Que quien conserve la copia del 10-sep confirme que esto es lo mismo que
   tiene — el manifiesto con los SHA-256 lo resuelve en un minuto.
2. Juntar las dos direcciones del diff de arriba en un solo árbol, con los
   dueños de la tarjeta y de las llamadas mirando sus propios cambios.
3. Recién ahí: `apps-web/augalaxy/publicar.py` deja el motor nuevo en
   `veta-wallet/augalaxy/assets/` y le sella la versión en `app.js`, y `subir.py`
   sube el árbol completo.

Nada de esto se ha hecho todavía: el dominio sigue sirviendo lo del 10-sep,
intacto.
