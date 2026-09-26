# MyTokenPay · trailer

Dos cortes del mismo trailer, generados desde el código de esta carpeta:

| archivo | formato | duración | para |
|---|---|---|---|
| `salida/mytokenpay-trailer-16x9.mp4` | 1920×1080 | 47 s | web, YouTube, presentaciones |
| `salida/mytokenpay-trailer-9x16.mp4` | 1080×1920 | 38,8 s | Reels, TikTok, estados de WhatsApp |

El vertical es el mismo guion sin la escena de Genesis ID y el ecosistema.

## La idea

**El rótulo encendido.** De noche, el negocio de barrio se reconoce por su
letrero. Es la firma de diseño que la web de MyTokenPay ya tenía (cada comercio
es un rótulo de neón), así que el trailer la convierte en la historia: una calle,
un rótulo que se enciende, y ese rótulo resulta ser el comercio que ahora cobra
en ORIGEN.

Una sola promesa, contada desde los dos lados del mostrador:

1. **Gancho** — la calle de noche, el rótulo parpadea. *En cada barrio hay un lugar que ya te conoce.*
2. **Qué cambia** — *ORIGEN, la moneda que sigue el precio del oro.*
3. **Marca** — *Todo empieza en MyTokenPay.*
4. **Quien paga** — buscar el comercio, marcar el monto, escanear, listo.
5. **Quien cobra** — cobrar con un QR y sin terminal, dividir la cuenta de la mesa, retirar en lempiras.
6. **Ecosistema** — una sola verificación con Genesis ID para MyTokenPay, Veta Wallet y Orden Global.
7. **Cierre** — *MyTokenPay. Donde ya te conocen.*

Lo que lo separa de un anuncio de billetera cualquiera está dicho en pantalla y
es verificable en la app: el teléfono del comercio es la terminal, la cuenta se
divide con un QR por persona y el retiro llega en la moneda del país.

## Qué es real y qué no

- **Todas las pantallas son la aplicación de verdad** (`mytokenpay-app/mobile`
  compilada para web), con las cuentas demo del README de la app. El recorrido
  del café es continuo: el cliente paga 5,57 ORIGEN en Café Veta Roasters y el
  comercio cobra esa misma cuenta, la divide entre tres y retira.
- Se ocultaron al capturar los botones **«Simular pago»**, que son andamiaje del
  modo demo. En la copia usada para capturar, el escaneo simulado apunta al café
  en vez de a un comercio al azar, y las fotos de relleno (picsum) del café y de
  Café Colonial Granada se sustituyeron por cuadros de los planos de ambiente.
  Nada de eso toca la app del repo: son cambios en una copia temporal, descritos
  en `capturar/`.
- **La calle y el café son planos generados con IA** (Kling 3 Pro, vía
  ElevenLabs), sin texto legible ni caras. No son un lugar real; no se nombra
  ninguna ubicación.
- **Voz**: «AD-berto», español latino neutro (ElevenLabs, multilingual v2).
  «Genesis ID» se escribió «Génesis Ai-Di» en el guion porque la primera toma lo
  leía como «Genesis primero D»; la toma final se verificó con transcripción.
- **Música y efectos**: generados con ElevenLabs (music v2 y sound effects),
  instrumental sin voces (verificado con transcripción).

## Reglas de texto que respeta

Las mismas de `entregables/estado-del-ecosistema`: ORIGEN **sigue el precio del
oro**, nunca «respaldado»; nada prometido a futuro; ninguna cifra del
directorio (son datos de muestra). No hay dominio ni enlace de descarga en el
cierre porque la web de MyTokenPay todavía no está publicada; cuando exista, va
en `#firma` de `escenas.html`.

## Cómo se rehace

```sh
cd entregables/trailer-mytokenpay
npm i -g playwright   # o PLAYWRIGHT_MODULE=/ruta/a/playwright/index.mjs
node render.mjs 16x9
node render.mjs 9x16
node render.mjs 16x9 --fotos 3,14.8,24.5   # solo fotos sueltas para revisar
```

Necesita `ffmpeg` en el PATH. `render.mjs` extrae los cuadros de los planos de
ambiente a `.cuadros/`, abre `escenas.html` en Chromium, pide cada cuadro con
`window.cuadro(t)` (todo en `linea.js` depende solo de `t`, así que el render es
idéntico cada vez), manda las capturas a ffmpeg por una tubería y mezcla el
audio: la música baja sola bajo la voz (sidechain) y el total sale a −14 LUFS.

Los tiempos del guion están en `linea.js` (`PANTALLAS`, `PALABRAS`, `FOCOS`,
`CAMARA`, `SUBTITULOS`) y los del audio al final de `render.mjs`; están
alineados con las pausas de `media/audio/voz.mp3`, que entra en el segundo 1.

### Rehacer las capturas de la app

`capturar/` tiene los scripts tal como se usaron. Resumen:

1. Copiar `mytokenpay-app/mobile` a una carpeta temporal, `npm install` y
   `npx expo install react-native-web react-dom @expo/metro-runtime`.
2. Poner ahí `metro.config.js`, `maps-stub.js` y `securestore-stub.js`: en web
   no existen `react-native-maps` ni el almacenamiento seguro nativo.
3. En `app/(tabs)/pagar.tsx`, el escaneo simulado elige
   `companies.find((c) => c.id === 'mtp-demo-cafe')`.
4. `npx expo export --platform web --output-dir dist-web`, servirlo con
   `node servir.mjs dist-web 8790` y correr `capturas.mjs`,
   `capturas-cliente.mjs` y `buscar.mjs`.
