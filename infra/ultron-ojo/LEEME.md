# ultron-ojo — el navegador de ULTRON, en su propia casa

`leer_pagina` de ULTRON es un `fetch`: trae el HTML que manda el servidor y
nada más. Todas las casas de Orden Global se dibujan enteras con JavaScript,
así que por ahí ULTRON no ve nada. Medido el 7-sep: `ordenexchange.link`
devuelve **78 caracteres** de texto. Este servicio es el navegador de verdad.

## Por qué aparte

El dyno de ULTRON es Basic: **512 MB**. Chromium necesita 200–400 MB por
pestaña. Dentro de ULTRON, la primera página que se abriera pasaría el límite,
Heroku mataría el dyno y **ULTRON se caería**. Aquí, si se cae el ojo, ULTRON
dice «ahora no puedo mirar» y sigue trabajando.

## Lo que hace

| ruta | qué |
|---|---|
| `POST /mirar` | la página YA DIBUJADA: texto, título, titulares, qué se puede tocar (con selector), errores de consola y peticiones que fallaron |
| `POST /foto` | un PNG de cómo se ve, en base64 |
| `POST /guion` | ENTRAR: `ir`, `escribir`, `tocar`, `esperar`, `leer`, `foto` |
| `GET /salud` | sin clave — es lo que mira el vigía |

## Las tres que no se negocian

1. **Una página a la vez.** En 512 MB dos pestañas es una caída, no una
   lentitud. Todo entra por una cola de una sola fila.
2. **Ni una dirección de adentro.** Un navegador dentro de un servidor puede
   pedir lo que solo el servidor alcanza — `169.254.169.254` es donde la nube
   guarda las credenciales de la máquina. Se cierra **dos veces**: la dirección
   que entra por el API, y otra vez dentro del navegador, que es la que atrapa
   una redirección o una petición que hace la propia página.
3. **Los secretos no se escriben nunca.** Un guion puede llevar una clave para
   iniciar sesión. Se usa y se olvida: en el diario del paso dice
   «(un secreto)», y no vuelve en la respuesta.

## El idioma del guion, y lo que NO está

```
{ tipo:'ir',       url,      esperar? }
{ tipo:'escribir', selector, texto | secreto }
{ tipo:'tocar',    selector | texto }
{ tipo:'esperar',  selector | ms }
{ tipo:'leer' }
{ tipo:'foto',     completa? }
```

No hay `evaluar`. Se pensó y se descartó: correr JavaScript suelto convierte al
ojo en una consola remota con clave, y el día que la clave se filtre, quien la
tenga corre lo que quiera dentro de nuestra red. Con seis verbos se hace todo
lo que hace falta.

Un paso que falla **corta el guion**. Seguir sería tocar a ciegas dentro de la
casa de alguien.

## Variables

```
OJO_CLAVE                 obligatoria — sin ella el ojo contesta 503 a todo
OJO_PLAZO_MS              30000
OJO_TOPE_TEXTO            24000
OJO_PAGINAS_POR_NAVEGADOR 40   · cada tantas se releva el navegador, que si no
                                 se va comiendo la memoria hasta la caída
PLAYWRIGHT_BUILDPACK_BROWSERS  chromium
```

## Desplegar

```
node infra/ultron-ojo/bin/desplegar.mjs [--crear]
node pruebas/probar-ojo.mjs
```

Las pruebas levantan una casa de mentira que se dibuja con JavaScript — si
usaran HTML plano pasarían en verde con el ojo apagado — y comprueban las dos
cerraduras con una página que redirige a la nube y otra que la pide por dentro.

## Dos cosas de Heroku que costaron una construcción cada una

**El stack.** El buildpack de Playwright todavía no soporta `heroku-24`: corta
con «STACK must be heroku-18, heroku-20 or heroku-22». La app va en
**heroku-22** a propósito. Cuando el buildpack admita 24, se sube.

**Dónde queda el navegador.** El buildpack instala las dependencias del
SISTEMA, no el Chromium. Y de la máquina de construcción a la que corre solo
viaja `/app`, así que un navegador bajado a `~/.cache` de la construcción no
existe después. Por eso `PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright` y
un `heroku-postbuild` que lo baja ahí.
