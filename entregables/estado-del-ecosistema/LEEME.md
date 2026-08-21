# Dónde estamos · el documento para nuestra gente

Diez páginas, A4, para las personas que ya llevan tiempo con nosotros.

## La regla que lo ordena todo

**Ninguna cifra sale de la cabeza de nadie.** `datos.json` se genera midiendo
—contra el RPC de la red y contra `/healthz` de Genesis ID— y el HTML no lleva
un solo número escrito a mano: si la medición no corrió, las páginas muestran
una raya en vez de un dato bonito e inventado. La última página del documento
lista cada dato con la llamada exacta que lo produjo, para que cualquiera lo
repita desde su teléfono.

## Cómo se rehace

```sh
cd entregables/estado-del-ecosistema
python3 medir.py                       # vuelve a medir contra la red
python3 -m http.server 8795 &          # el render necesita servidor, no file://
node render.mjs                        # imprime el PDF
```

`render.mjs` no es solo un impresor: **comprueba** que no quede ningún dato sin
medir y que ninguna hoja se desborde. Lo segundo hace falta porque la hoja
lleva `overflow:hidden`, así que un exceso no se ve como un error — se ve como
un párrafo cortado a media frase. Pasó de verdad en la página de PULSE2CHAT y
la comprobación es lo que lo encontró.

## Las dos capturas son de la aplicación de verdad

`img/tarjeta.png` y `img/pago-en-chat.png` **no son maquetas**: salen de abrir
la aplicación en un navegador y fotografiar la pantalla. Es lo que hace que la
página del pago pruebe algo — un dibujo hecho para el folleto es justo lo que
la gente huele.

Se sacan con `fotos.mjs`, que levanta la app contra un relevo simulado (nombres
y montos de ejemplo, nada real de nadie) y recorta **midiendo dónde termina la
última burbuja**, no por un porcentaje fijo: la primera versión se cortaba a
media burbuja y parecía un error.

```sh
python3 -m http.server 8791 --directory ../..   # la app, desde la raíz del repo
node fotos.mjs
```

## La voz

Sin raya larga (`—`) en ninguna parte, sin la construcción «no es X, es Y», y
con los dos puntos dramáticos reducidos a la mitad. Son las marcas que hacen
que un texto suene escrito por una máquina, y José las detectó de una lectura.
Frases cortas. El PDF terminado tiene **cero rayas largas**, y eso se comprueba
sobre el PDF y no sobre el HTML (donde las rayas son marcadores de dato sin
llenar).

## Lo que este documento NO dice, a propósito

- **Nada en futuro.** Ni metas, ni fechas, ni hoja de ruta. Solo lo que existe.
- **ORIGEN y AUKA «siguen el precio»**, jamás «están respaldados». La única vez
  que aparece la frase «cada unidad es una onza guardada» es para negarla.
- **AU-RA se presenta como modelo 1 en beta**, y se dice que se equivoca.
- **Los archivos del chat todavía no van cifrados de punta a punta**, y está
  escrito en la misma página que presume del cifrado.
- **AuCorp no se llama «banco»** en ninguna frase afirmativa. Es una empresa
  constituida, con dos sedes y plataformas construidas, con las licencias en
  trámite. La página lo dice con esas palabras y cierra con un aviso propio:
  «no presta servicios bancarios todavía y no los va a prestar hasta tener la
  licencia que corresponde». En esto la precisión no es un detalle legal.
- **ONDK lleva su precio con el acta que lo firma**, y dice dos veces que un
  precio declarado no es una cotización de mercado. La página cierra avisando
  que al abrir el mercado el precio puede quedar por debajo del declarado.

## Lo que sí se verificó contra la red

El motor de la cadena no se escribió de memoria. `web3_clientVersion` contesta
`besu/v26.7.1`, `qbft_getValidatorsByBlockNumber` devuelve los siete
validadores del conjunto, y la cabecera del bloque trae `withdrawalsRoot` sin
`blobGasUsed`, que es exactamente la firma de **Shanghai** y no de Cancun. El
precio de ONDK y su serie de cinco actas salen de la API de Ordenex.

## Lo único que no pude verificar

La fecha del **24 de agosto de 2026** para Android y el **«en revisión» de
iOS** salen de lo que dijo José: no hay forma de medirlos desde acá. Si la
fecha se mueve, este PDF queda equivocado en manos de la gente — y es
precisamente el tipo de detalle que cuesta la confianza que el resto del
documento se gana. Antes de repartirlo conviene confirmarlo.

## Lo que hay que volver a medir si pasa tiempo

El documento lleva la fecha de medición impresa. Los bloques y la bitácora
crecen solos; si el PDF se va a repartir semanas después, se vuelve a correr
`medir.py` y `render.mjs` y listo.
