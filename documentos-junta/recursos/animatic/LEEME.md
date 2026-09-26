# Animatic · «Pésalo»

`Pesalo-animatic-v2.mp4`: 2:00 exactos, 1920×1080, 24 fps, estéreo. Es la **previsualización** del tráiler del
Documento 9, no la pieza final. Tiene los tiempos de los dieciséis bloques: el contador de 4 a 0, la ventana que
se cierra hasta ser una línea, el CERO, los golpes de pico, la tesis del minero en negro, el cuadro que se abre
en doce fotogramas, el relevo de oficios, el coro, la salida, el plato que cae en 1:52 y las cartelas.

## Versión 2: con voces

Las treinta líneas habladas tienen voz, diez personajes con diez voces distintas, en español latinoamericano
(con seseo, no la pronunciación de España) y en portugués de Brasil. Son **voces sintéticas provisionales** para
entender el montaje; en la pieza real son sonido directo de gente real.

- Motores: Kokoro (licencia Apache 2.0) y Piper, los dos corren en local, sin cuenta ni costo.
- ElevenLabs no se usó: la cuenta conectada tiene 7 créditos y la clave recibida no tiene permiso de voz.
- **Cómo se eligió cada voz** (`casting.py`): cada personaje se probó con varias voces y quedó la que un
  reconocedor de voz (Whisper) entendía mejor. **Cómo se comprobó** (`verificar_mezcla.py`): el mismo reconocedor
  escucha la mezcla final, línea por línea. Todas se entienden; los desaciertos que marca son de escritura del
  reconocedor («Pesa lo» por «Pésalo», «Metila» por «Metí la»), y en el mercado a veces oye «pensé» por «pesé».
- La música tiene más cuerpo que en la versión 1: dron grave en la primera mitad, dos chelos, ostinato, coro y
  tambores con sub; baja unos 7 dB cada vez que alguien habla.

## Qué sigue siendo provisional

- **Las imágenes** son las referencias del storyboard, no rodaje. Algunas caras no coinciden con el oficio.
- **La sala de máquinas y el puesto de cumplimiento** son dibujos.
- **El texto legal** lleva «[dirección web pendiente]».

Máster base (México y Centroamérica). Para regenerarlo: `python3 voces.py && python3 audio.py && python3 video.py`
(numpy, scipy, Pillow, imageio-ffmpeg, kokoro-onnx, piper-tts; los modelos de voz se bajan de Hugging Face).
Tipografía: Barlow Condensed, licencia OFL.
