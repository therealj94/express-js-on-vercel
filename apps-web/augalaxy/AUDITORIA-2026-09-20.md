# Auditoría externa del Web OS — 20-sep-2026

Mirado por alguien que llega sin saber nada, medido en el dominio real. Lo que
sigue es lo que se encontró y lo que se hizo. Los números son de Chromium contra
`app.vetawallet.com`, teléfono de 390×844.

## Lo que se encontró

| # | Hallazgo | Evidencia |
| --- | --- | --- |
| 1 | Cada textura se bajaba **dos veces** | `whirlpool.jpg` 4,06 MB ×2, `starmap.jpg` 2,35 MB ×2, y así las nueve |
| 2 | El espacio profundo se bajaba para enseñar un login | 6,4 MB de M51 y mapa estelar, visibles solo si alguien entra a «Galaxias» |
| 3 | Mapas de 2048 px para planetas de 80 px en pantalla | 11,2 MB de JPEG |
| 4 | Ninguna pista de qué hacer dentro de la wallet | se perdió al dejar de dibujar la cáscara duplicada, el mismo día |
| 5 | Los nombres no dicen qué es cada mundo | «MINAS · Resources», «DBNX · Infrastructure» |
| 6 | MediaPipe duplicado en el mismo dominio | `/vendor/vision/` 30 MB y `/augalaxy/vision/` 43 MB, **bytes idénticos** |
| 7 | La casa pedía tipografías a Google en cada visita | `fonts.googleapis.com`, `fonts.gstatic.com` |
| 8 | El lienzo de la galaxia sin nombre para un lector de pantalla | `<canvas>` sin etiqueta |

Un noveno punto se retiró al comprobarlo: `i18n.js` ya ajusta `documentElement.lang`.
Lo que se midió como `lang="en"` era el idioma elegido por el navegador de prueba,
no un defecto.

## Causa de lo primero, que no era el tamaño

three.js trae su caché **apagada de fábrica** y cada componente construía su
propio `TextureLoader`. Cuatro mundos comparten el mapa de la luna; el sol lo
piden el núcleo y su planeta; M51 la piden el fondo y el retrato. Cada uno se
bajaba sus megas por su cuenta.

Y había una segunda fuente, más escondida: el `fallback` del lienzo. React Three
Fiber lo monta mientras el lienzo arranca, y ese instante le alcanzaba al motor
de respaldo para pedir las nueve texturas otra vez con `Image`, fuera de la
caché de three. Quedarse sin WebGL ya estaba cubierto dos veces sin ese
`fallback` —`supportsWebGL()` antes de dibujar y `RenderGuard` si el lienzo
falla—, así que se quitó.

## Lo que se hizo

1. Caché encendida y un solo cargador compartido (`src/experience/mapas.ts`).
2. M51 solo al entrar a «Galaxias»; el mapa estelar cuando el navegador está
   desocupado, que es un fondo al 13% de opacidad y no merece el camino crítico.
3. Los originales con licencia pasan a `assets-fuente/` y **no se publican**; de
   ellos salen WebP a 1K con `scripts/derivar-texturas.py`. 11,2 MB → 0,9 MB.
4. Vuelve una pista, una sola vez y sólo dentro de la wallet: «Toca un mundo
   para entrar». Se apaga al primer toque y no vuelve en ese dispositivo.
5. La frase de cada mundo —ya estaba escrita en el catálogo, en los dos
   idiomas— aparece al señalar o al tabular, y está siempre para un lector de
   pantalla.
6. El motor usa el MediaPipe que la casa ya sirve (`window.__AE_VISION`). El
   sitio pasa de 94 MB a 42 MB, y cada despliegue sube eso de menos.
7. Archivo y JetBrains Mono viajan con el sitio (OFL 1.1) y la política de
   seguridad deja de permitir dominios de Google que ya no se usan.
8. El lienzo se anuncia como lo que es, en el idioma de la persona.

## Medido, antes y después

| | Antes | Después |
| --- | --- | --- |
| Primera carga, antes de entrar | **21,6 MB** | **4,1 MB** |
| Texturas en esa carga | 21,4 MB en 16 pedidos | 0,63 MB en 7 |
| Descargas repetidas | 9 | 0 |
| Dominios de terceros | 2 (Google Fonts) | 0 |
| Tamaño del sitio publicado | 94 MB | 42 MB |

## Lo que sigue sin poder medirse aquí

El rendimiento con GPU real: este entorno dibuja por software y da 2-6 cuadros
por segundo, que **no es** lo que ve nadie. Hace falta un teléfono de gama baja
de verdad. Tampoco se auditó el recorrido con sesión iniciada, ni el visor.

## Lo que queda como propuesta, no como tarea

La galaxia sigue sin saber nada de quien la mira: los planetas son los mismos
sepas o no que tenés tres mensajes sin leer. Que el tamaño, el brillo o un punto
digan lo que hay dentro convierte la decoración en un panel de control — pero
eso exige decidir qué datos expone la casa, y es una decisión de producto.
