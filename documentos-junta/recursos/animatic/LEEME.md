# Animatic · «Pésalo»

`Pesalo-animatic-v1.mp4`: 2:00 exactos, 1920×1080, 24 fps, estéreo. Es la **previsualización** del tráiler del
Documento 9, no la pieza final. Tiene los tiempos exactos de los dieciséis bloques: el contador de 4 a 0, la
ventana que se cierra hasta ser una línea, los dos segundos y medio de CERO, los golpes de pico, el cuadro que se
abre en doce fotogramas, el relevo de oficios, la salida, el fiel que vuelve al centro en 1:52 y las cartelas.

Qué es provisional:

- **Las imágenes** son las referencias generadas del storyboard, no rodaje. Algunas caras no coinciden con el
  oficio que dice su línea.
- **Las voces no están**: las treinta y tres líneas van como subtítulo. En la pieza real son sonido directo.
- **La música y los efectos** están sintetizados aquí mismo (`audio.py`), siguiendo la sección 8.5: primera mitad
  sin instrumentos, silencio, pico en la roca, percusión de seis golpes y corte un fotograma antes del impacto.
- **La sala de máquinas y el puesto de cumplimiento** son dibujos, no fotografía.
- **El texto legal** lleva «[dirección web pendiente]», porque ese dato todavía no se entregó.

Máster base (México y Centroamérica). Para regenerarlo: `python3 audio.py && python3 video.py` (necesita numpy,
scipy, Pillow e imageio-ffmpeg). Tipografía: Barlow Condensed, licencia OFL.
