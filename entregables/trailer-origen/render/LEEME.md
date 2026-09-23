# Cómo volver a generar el tráiler

Necesitas Python 3 con `playwright`, `numpy`, `scipy` y `Pillow`, Chromium y ffmpeg.

```bash
cd entregables/trailer-origen/render
python3 capturar.py video /tmp/origen-video.mp4       # 900 cuadros (~15 min en CPU)
python3 audio.py /tmp/origen-audio.wav                # banda sonora sintetizada
ffmpeg -i /tmp/origen-video.mp4 -i /tmp/origen-audio.wav \
  -c:v copy -c:a aac -b:a 256k -shortest ../ORIGEN-trailer-9x16.mp4
python3 capturar.py muestras 3.0 8.5 13.9             # cuadros sueltos para revisar
```

Si Chromium o ffmpeg están en otra ruta, pásala con las variables `CHROME` y `FFMPEG`.

| Archivo | Qué hace |
|---------|----------|
| `trailer.html` | Todo el tráiler: un shader WebGL2 con los 9 materiales bajo el arco, más el texto, el anillo de 55 marcas, el mapa y el grano. La función `renderFrame(t)` dibuja el segundo `t` siempre igual. |
| `audio.py` | El sonido, con los mismos tiempos que el HTML. Tiene un drone en 55 Hz, golpes en cada corte, 55 clics que aceleran, campanas, un pad Am–F–C–G y reverberación. |
| `capturar.py` | Abre el HTML en Chromium sin ventana, saca los cuadros y los codifica a H.264. |

Para cambiar textos o tiempos, edita `renderFrame` en `trailer.html` y las constantes al inicio de `audio.py`. Los tiempos compartidos son `T_CORTES`, `PASO`, las marcas y las ciudades.

Tipografías: Fraunces e Inter, con licencia SIL OFL 1.1.
