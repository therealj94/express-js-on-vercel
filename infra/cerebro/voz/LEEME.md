# La voz grabada

La presentación es un **guion**: no cambia entre una reunión y la siguiente.
Así que sus frases se graban de antemano con [Piper](https://github.com/rhasspy/piper),
que corre en nuestras propias máquinas —no se envía nada a nadie—, y el
cerebro solo reproduce el fichero.

Sale mejor por tres razones:

- se puede usar el modelo lento y bueno, porque tarda **una vez**;
- en la reunión no hay latencia ni dependencia de la red;
- y **suena igual en todos los teléfonos**, que es lo que nunca consiguió la
  voz del navegador: cada aparato traía la suya y algunas eran el
  sintetizador viejo.

## Cómo se hace

```
node infra/cerebro/voz/sacar-frases.cjs > frases.json
python3 infra/cerebro/voz/rendir.py frases.json salida/
python3 infra/cerebro/voz/desplegar-voz.py salida/
```

`sacar-frases.cjs` carga el cerebro **en un navegador de verdad** y le
pregunta a él por su guion. No copia el texto a mano a propósito: las frases
se construyen —el guion mete el bloque del día, `limpiar()` cambia «gwei» por
«gigawei»— y una copia a mano se desincronizaría el día que alguien tocara
una línea, sin que nadie se enterara hasta oírlo delante de un inversionista.

## Las voces

| idioma | modelo | por qué |
|---|---|---|
| español | `es_MX-claude-high` | es la de México, que es el latino que hay |
| inglés | `en_US-ryan-high` | `alan` sonaba muerta; ésta es la más natural que hay |

Los modelos **no van en el repositorio** (61 MB cada uno). Se bajan de
`huggingface.co/rhasspy/piper-voices` a `voz/modelos/`.

## De dónde salen las frases

Tres fuentes, y la tercera existe por un fallo que costó dos entregas:

1. **Los guiones** —el recorrido, el segundo acto, el banco del inversionista,
   el saber, las preguntas—, preguntándoselos al propio cerebro.
2. **`FRASES_FIJAS()`**, dentro de `index.html`: todo lo fijo que FLUX dice
   fuera de un guion —la transacción, el viaje del dólar, abrir los sitios,
   las respuestas cortas—. Cuando esto no existía, la voz **se callaba en
   mitad de la transacción** y los subtítulos seguían solos.
3. **Un barrido del propio fichero**: `literalesDelFichero()` saca toda cadena
   que parezca una frase entera —empieza como frase y acaba en punto— y la
   manda a grabar en el idioma que le toca. Un recuento contra el manifiesto
   encontró **ciento una frases** más que nadie grababa —«En pausa. Di
   continúa.», «Lanzando los bots de prueba.», la ayuda, los avisos— y que por
   tanto salían con la voz del navegador. Ése es el corte que se oye y que se
   describió como «se vuelve robótico».

   La tercera fuente se mantiene sola: una frase nueva que alguien escriba
   mañana entra sin tocar nada. Si alguna nunca llega a decirse, lo único que
   cuesta es un mp3 de más.

## La respiración va dentro del fichero

Cada frase se parte por sus juntas —coma, punto y coma, dos puntos, punto—,
cada trozo se sintetiza aparte y se pegan con un silencio del tamaño de su
signo. Así el audio suena igual que la voz del navegador con `RESPIRA`
puesta, y el cerebro solo tiene que reproducir un fichero por frase.

## La clave, y por qué es una comprobación

El nombre del fichero es un **FNV-1a de 32 bits** del texto ya limpio, con la
misma función escrita en `rendir.py` y en `index.html` —comprobado que
coinciden, acentos incluidos—.

Si alguien cambia una frase y no vuelve a grabar, **la clave cambia, el audio
no aparece y habla el navegador**. Eso es a propósito: mejor la voz de
siempre que un audio diciendo algo distinto de lo que pone el subtítulo.

## La red

Si el fichero no está, no carga, o tarda más de dos segundos, habla el
navegador y no se nota. Un audio que falla en silencio delante de un
inversionista es peor que una voz mediocre, y ese error ya nos costó un día
entero. Lo cubre `pruebas/probar-voz-grabada.cjs`, con cinco escenarios.

## El despliegue toca el Caddyfile

`desplegar-voz.py` abre `/voz/*` en el `Caddyfile`. Sin eso, un invitado en
`/demo` pide el audio, recibe un 401 con `WWW-Authenticate` y **el navegador
le saca su ventana de contraseña encima de la presentación**. Ese fallo exacto
ya pasó dos veces —primero con los temporizadores, después con `/img/*`—.

Y no lo toca a ciegas: guarda copia, edita, valida con `caddy validate` y solo
entonces recarga; si la validación falla, restaura la copia. En ese archivo
viven los hash de las contraseñas de la Junta.

Al terminar comprueba las dos cosas de verdad, con `curl`: que
`/voz/manifiesto.json` responde **200 sin clave** y que `/partes.json` sigue
respondiendo **401**.

## Alternativas que miré

- **Kokoro-82M** (Apache-2.0): suena mejor que Piper en inglés, pero en esta
  máquina el factor de tiempo real fue ~20 —cuatro minutos para una frase de
  catorce segundos—. Para grabar de antemano sería viable con GPU; para
  contestar en vivo, no. Su español además es limitado.
- **XTTS-v2**: calidad alta y clonación de voz, pero su licencia es de uso no
  comercial. Descartada por eso, no por técnica.
- **Amazon Polly**: sería el salto de calidad más barato de conseguir —ya
  estamos en AWS y no hace falta ni GPU ni infraestructura—, pero no es
  auto-alojada, que es lo que se pidió. Queda anotada como opción.
