# Cómo volver a generar la v2

Necesitas Python 3 con `playwright`, `numpy`, `scipy` y `faster-whisper`, Chromium y ffmpeg.

```bash
cd entregables/trailer-origen/v2/render
python3 construir_voz.py                 # corta la toma en 13 frases → voz.wav + tiempos.json
python3 mezcla.py /tmp/mezcla.wav        # música + efectos + voz
python3 capturar.py video /tmp/v.mp4     # todos los cuadros (~35 min en CPU)
ffmpeg -i /tmp/v.mp4 -i /tmp/mezcla.wav -c:v copy -c:a aac -b:a 192k -shortest ../ORIGEN-v2-la-misma-regla.mp4
```

| Archivo | Qué hace |
|---------|----------|
| `voz-damian-tomaA.mp3` | La toma original de ElevenLabs. |
| `palabras.json` | Marcas de tiempo por palabra, sacadas con Whisper `small`. |
| `construir_voz.py` | Corta la toma por frases y la vuelve a espaciar. Genera `voz.wav` y `tiempos.json`. |
| `datos.js` | Los tiempos y subtítulos que lee la página. Si cambian las pausas, hay que regenerarlo. |
| `trailer2.html` | Toda la imagen: mapa real (Natural Earth vía world-atlas), disco de oro, gráfica, celular, red y logo. |
| `shader.js` | El shader de oro y paisajes (del tráiler v1), más el modo «disco». |
| `mezcla.py` | Música, efectos palabra por palabra, compresión de la voz y ducking (la música baja cuando habla la voz). |
| `capturar.py` | Saca los cuadros con Chromium sin ventana y los codifica a H.264. |

Licencias: los datos del mapa son de Natural Earth (dominio público), a través de world-atlas (ISC). topojson-client tiene licencia ISC. Fraunces e Inter tienen licencia OFL.
