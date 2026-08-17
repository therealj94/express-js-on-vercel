# AuCorp · el sitio

Sustituye al WordPress de `www.aucorp.io` (tema comprado `cyberbank`). El
WordPress **no se toca**: esto se despliega aparte y el dominio se apunta
cuando la Junta lo decida.

## Por qué no se parece a las otras casas

Veta Wallet, Ordenex y ordenglobal.org comparten paleta —el pozo verde
`#021B1C` con oro— porque son la misma casa hablando. AuCorp **no es** esa
casa: es una institución financiera aliada, y vestirla igual la haría parecer
una sección más del ecosistema en vez de una contraparte.

Así que aquí se invierte todo lo que se puede invertir sin perder el aire de
familia:

| | ecosistema Orden Global | AuCorp |
| --- | --- | --- |
| fondo | oscuro siempre | **claro**, hueso cálido |
| serif | Cinzel (capitales romanas) | **Fraunces** (old-style, con carácter) |
| palo seco | Archivo | **IBM Plex Sans** (institucional) |
| metales | oro sobre verde | **oro y acero** |

## Los dos metales, que no son decoración

- **Oro** (`--oro`) para lo que tiene respaldo real: activos, custodia, el
  vínculo con Orden Global.
- **Acero** (`--acero`) para lo que viene de la banca tradicional: regulación,
  cumplimiento, infraestructura.

Un elemento lleva oro cuando habla de valor respaldado y acero cuando habla de
institución. Si algún día los colores se usan al revés, el sistema deja de
significar y pasa a ser adorno.

## El trazo

El logo de AuCorp es un circuito que crece hacia arriba dentro de un galón.
Esa idea es la estructura de la página, no un dibujo colgado en el fondo: una
línea de oro de un píxel baja por el costado y se ramifica hacia cada sección,
con un nodo en cada bifurcación. En el héroe el mismo trazo se dibuja en
`<canvas>`, una sola vez y con `prefers-reduced-motion` respetado.

## Lo que la página deja claro, porque hacía falta

El sitio anterior no decía en ninguna parte la relación con el ecosistema. La
sección **El ecosistema** lo dice con un diagrama y con todas las letras:

- AuCorp es **aliada** de Orden Global — dos casas, un sistema.
- AuCorp es **dueña** de Ordenex.

## Los logos

`assets/aucorp.png` y `assets/ordenex.png` **faltan**. Mientras no estén, el
héroe usa el trazo del circuito y la marca compuesta en tipografía, que es
digno y no finge. Al dejar los archivos ahí, se enseñan solos: la plantilla ya
los busca y no rompe si no están.

## Probar y desplegar

```
node ../probar-aucorp.mjs
python3 ../subir.py aucorp <appId>
```
