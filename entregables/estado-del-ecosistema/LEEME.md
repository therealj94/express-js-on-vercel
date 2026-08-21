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

## Lo que este documento NO dice, a propósito

- **Nada en futuro.** Ni metas, ni fechas, ni hoja de ruta. Solo lo que existe.
- **ORIGEN y AUKA «siguen el precio»**, jamás «están respaldados». La única vez
  que aparece la frase «cada unidad es una onza guardada» es para negarla.
- **AU-RA se presenta como modelo 1 en beta**, y se dice que se equivoca.
- **Los archivos del chat todavía no van cifrados de punta a punta**, y está
  escrito en la misma página que presume del cifrado.

## Lo que hay que volver a medir si pasa tiempo

El documento lleva la fecha de medición impresa. Los bloques y la bitácora
crecen solos; si el PDF se va a repartir semanas después, se vuelve a correr
`medir.py` y `render.mjs` y listo.
