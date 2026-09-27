# Borradores (no se publican)

`reconstruir.sh` no copia esta carpeta: nada de aquí llega a ordenglobal.org.

## ordenex-spot-en.mp4 — el spot de Ordenex en inglés (borrador, 27-09-2026)

- Locución: Kokoro `am_michael` (119 Hz, como los 120 Hz del original), frase por frase en los
  tiempos de la versión española (0,0 · 7,7 · 12,0 · 19,0 · 24,1 · 28,5 s), −6,7 dB para igualar.
  ElevenLabs no tenía créditos; con créditos se puede regenerar con una voz premium.
- Textos en pantalla: parche difuminado con borde suave sobre cada texto español y el inglés encima
  con Manrope 300 (FIVE MARKETS · A REAL ORDER BOOK · ONLY REAL TRADES · YOUR VETA WALLET ACCOUNT);
  en el cierre, fondo #050505 y las tres líneas nuevas. El filtro de ffmpeg está en
  `ordenex-spot-en.filtro.txt` (espera `manrope-300.ttf`/`manrope-400.ttf` y la voz alineada).
- Verificado: ningún cuadro conserva texto en español (OCR a 4 cuadros/s) y la voz se entiende.

Para publicarlo: moverlo a `assets/medios/`, hacer el póster, apuntar el video inglés en
`construir-portada.py` y quitar «in Spanish», reconstruir y desplegar.
