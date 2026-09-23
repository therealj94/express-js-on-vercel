# ORIGEN · Tráiler v3 «La misma regla»

Guion de la v2 (ver `../v2/GUION-Y-CRITICA.md`), con estos cambios:

| Qué | v2 | v3 |
|-----|----|----|
| Voz | Damián, `eleven_multilingual_v2`; sonaba plana | **Zabra**, «Serious and Deep Narrative», latino con acento mexicano neutro (`G6LT3kjUUW86fQaWfBaj`), en **`eleven_v3`** con indicaciones de tono por frase (serio, asombro, cálido, poderoso) |
| Logo ORIGEN | Anillo genérico | **Tu símbolo, hecho del mismo oro líquido del video.** En «un gramín es un Origen», el disco partido en 55 se transforma en el símbolo. En el cierre, el símbolo se dibuja solo dentro del anillo de 55 marcas. |
| Logo Orden Global | No estaba | Firma final «Una iniciativa de». Las líneas del OG se trazan de izquierda a derecha y los 93 puntos se encienden como las ciudades del mapa. |
| Audio | Música con presencia | La voz manda: queda unos 12 dB por encima de la música y los efectos mientras habla. La música es un colchón suave que baja sola bajo la voz. |
| Subtítulos | Por frase | Por frase, con la **palabra que se está diciendo en dorado** |
| Legibilidad | — | Texto legal, gráfica y celular con letra más grande |

Duración: 88,5 s. Formato: 9:16, 1080×1920, 30 fps.

## Casting de voces (`voces/`)
- M1 Lizy, M2 Elena, M3 Cynthia Patricia.
- H1 Gabo, **H2 Zabra (elegida)**, H3 Brian.
- Las 6 dicen la misma frase, en `eleven_v3`.

## Tomas
Se generaron 2 tomas de Zabra y se usó la **A**. En la B la voz dice «viviéramos» en lugar de «midiéramos»; lo confirmé con Whisper `medium`.

## Logos
- Las máscaras se sacaron de tus archivos originales (`mascara-*.png`): oro sobre negro convertido a transparencia.
- Los puntos del OG se separaron de las líneas para poder animarlos uno por uno (`og-puntos.js`).
- El color se adaptó al oro cálido del video, como pediste, para que todo se vea como una sola pieza.

## Volver a generarlo
```bash
cd v3/render
python3 construir_voz.py && python3 subtitulos.py
python3 mezcla.py /tmp/mezcla.wav
python3 capturar.py video /tmp/v.mp4
ffmpeg -i /tmp/v.mp4 -i /tmp/mezcla.wav -c:v copy -c:a aac -b:a 192k -shortest ../ORIGEN-v3.mp4
```

## Antes de publicar (sigue igual)
1. **Precio en Veta Wallet.** La billetera tiene que mostrar el precio del gramín; hoy muestra 0,01 USD fijo.
2. **Cifras del celular.** Son de ejemplo y van marcadas «ejemplo ilustrativo».
3. **Licencia de la voz.** El uso comercial de la voz Zabra depende del plan de tu cuenta de ElevenLabs.
