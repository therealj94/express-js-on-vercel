# La vista previa: Orden Global sin instalar nada

Un miembro escanea un QR (o toca un enlace) y la app se abre entera en su
teléfono, dentro de **Expo Go** — la aplicación gratuita de Expo que sirve de
envase. No hay APK, no hay "instalar de orígenes desconocidos", no hay
esperar una build de 20 minutos.

No es una maqueta ni un vídeo: es la app de verdad, contra el backend de
verdad. Faltan exactamente dos piezas, y la propia app lo dice en pantalla
(el sello dorado **VISTA PREVIA** en el Núcleo, arriba a la izquierda; se
toca y explica qué falta).

---

## El enlace

```
exp://u.expo.dev/3017e984-a8ac-479c-8b75-33f8b8e69b25?channel-name=expogo&runtime-version=exposdk:54.0.0&platform=android
```

El QR con el sello de la casa, para mandar por WhatsApp:

```bash
python3 hacer-qr-vista-previa.py        # deja qr-vista-previa.png
```

El QR lleva ese mismo enlace. Se escanea **desde Expo Go** (o con la cámara
del teléfono, que ofrece abrirlo con Expo Go).

---

## Qué tiene que hacer el miembro

### Android — funciona siempre

1. Instalar Expo Go **del SDK 54**, no el de la tienda a ciegas:
   <https://expo.dev/go?sdkVersion=54&platform=android&device=true>
   (ese enlace da el APK de Expo Go de esa versión exacta).
2. Abrir Expo Go → *Scan QR code* → escanear el QR, o pegar el enlace.
3. La primera vez tarda unos segundos en bajarse el paquete. Después abre al
   instante.

No hace falta cuenta de Expo ni iniciar sesión.

### iPhone — puede que no se pueda, y hay que decirlo

En la App Store **solo existe la última versión de Expo Go**, y esa última
versión trae **un solo SDK**: el más nuevo. Apple no deja instalar versiones
anteriores. O sea:

- si el Expo Go de la App Store va hoy por el **SDK 54**, el enlace abre igual
  que en Android (cambiando `platform=android` por `platform=ios`);
- si va por un SDK **más nuevo**, en iPhone **no hay vista previa posible**.
  Ese teléfono necesita la app compilada: TestFlight o la build de iOS. No hay
  atajo, y prometerlo solo hace perder una tarde.

Cómo saber cuál reparte hoy (mismo comando que en `EXPO-GO.md`):

```bash
curl -s https://exp.host/--/api/v2/versions/latest | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('Expo Go iOS (tienda):', d.get('iosClientVersion'))
print('SDK más nuevo:', d.get('sdkVersion'))
"
```

---

## Qué funciona y qué no

Expo Go es un binario que publica Expo, no nosotros: trae los módulos nativos
del SDK oficial y **ninguno de terceros**, porque esos hay que compilarlos
dentro de la app. De todo lo que usa Orden Global, eso deja fuera dos cosas
(y arrastra tres consecuencias).

| | Vista previa (Expo Go) | APK instalado |
|---|---|---|
| **Micrófono de NEXUS** (hablarle) | **No.** El botón no promete: se le escribe y obedece igual | Sí |
| **Lectura del documento** en Genesis ID (OCR del pasaporte) | **No.** El nombre y las líneas se escriben a mano; la verificación sigue adelante | Sí |
| **Avisos del teléfono** (dinero entrante, mensajes) | **No llega ninguno**, ni siquiera los locales | Sí |
| **Enlaces `og://` y `vetawallet://`** abiertos desde fuera (WhatsApp, correo) | **No abren.** En Expo Go el esquema del teléfono es `exp://` | Sí |
| Escáner de QR **dentro** de la app (cobros, invitaciones a grupos) | Sí — es la cámara leyendo texto, no el sistema abriendo un enlace | Sí |
| Acceso con Google / Apple | Botón oculto a propósito (el redirect de Expo Go no está registrado y Google contestaría un error 400 ilegible). **Se entra por correo** | Sí |
| Cámara, QR, chat, billetera, cobros, gráficos, sonidos, voz de NEXUS *hablando*, biometría, idioma, guardado, red | Sí | Sí |

Tres apuntes para no malinterpretar la tabla:

- **Los avisos.** Orden Global no tiene servidor de push: los avisos del dinero
  y del chat son **locales**, los arma el propio teléfono. En Expo Go quedan
  apagados igualmente, porque `expo-notifications` **lanza al importarse** en
  Expo Go de Android desde el SDK 53 y cerraba la app al arrancar; el arreglo
  fue no cargar la librería ahí, y eso apaga los avisos enteros, no solo el
  push remoto (ver la cabecera de `src/notify.js`). Con la app abierta se ve
  todo dentro de la app. En el APK los avisos llegan.
- **Los enlaces.** Un `og://` mandado por WhatsApp desde la vista previa no le
  abre nada a quien lo recibe, y el que lo manda se queda creyendo que invitó
  a alguien. Por eso, en la vista previa, la app avisa y empuja al **QR**:
  ese sí entra.
- **Nada de esto revienta.** La regla del proyecto es que la app no puede
  romperse al abrirse en Expo Go ni mentir sobre lo que ahí no hay. Cada hueco
  de la tabla tiene su aviso en pantalla, en español y en inglés.

---

## Cómo se publica

```bash
EXPO_TOKEN=xxxxxxxx ./abrir-en-expo-go.sh "lo que se enseña"
```

El token **no está en ningún fichero** y no debe escribirse en ninguno: se pasa
por delante del comando (o desde el gestor de secretos de quien publique).

Lo que hace el guion, en orden:

1. Comprueba que el proyecto sigue en el SDK 54 (si alguien lo sube, para).
2. Copia `app.json` a `.app.json.antes-de-expo-go`.
3. Escribe la variante con `"runtimeVersion": "exposdk:54.0.0"` — con un lector
   de JSON de verdad, no con `sed`.
4. Corre `npx expo export --platform android` como **puerta**: si el paquete
   no se arma, no se publica nada.
5. Se asegura del canal `expogo` y publica ahí (`eas update`).
6. **Restaura `app.json` siempre** —salga bien, falle o corte alguien con
   Ctrl-C— y hace que **git** lo certifique. Si no quedó idéntico, grita y
   sale con error.
7. Imprime el enlace de arriba.

### Por qué tanto cuidado con `app.json`

Los APK que ya están en los teléfonos reciben las mejoras por aire
(`actualizar-por-aire.sh`) desde el canal **`preview`**, y se reconocen por el
runtime de política **`fingerprint`**. Expo Go no entiende esa huella: exige
`exposdk:54.0.0`.

Si esa variante se queda puesta en `app.json`, la siguiente publicación por
aire sale con el runtime de Expo Go y **los teléfonos de la gente dejan de
recibir actualizaciones para siempre**. No da error, no avisa: se quedan
quietos. De ahí la copia, el `trap`, y el testigo de git.

Por lo mismo, la vista previa vive en un canal **aparte** (`expogo`): lo que se
publique ahí no toca `preview`, `production`, `development` ni `ensayo`.

| Canal | A quién llega |
|---|---|
| `expogo` | **la vista previa, dentro de Expo Go** |
| `preview` | los teléfonos con el APK de prueba |
| `production` | los que la instalaron desde Google Play |
| `development` | la app de desarrollo |
| `ensayo` | el build de ensayo (otro paquete, otro backend) |

La vista previa **no** se actualiza sola cuando se manda algo por aire al canal
`preview`: para renovarla hay que volver a correr `./abrir-en-expo-go.sh`.

---

## Si el enlace no abre

Pasó antes y conviene tenerlo escrito: Expo endureció cómo Expo Go valida los
updates publicados, y el camino `exp://u.expo.dev/...` puede fallar con
*"Failed to download remote update"* aunque esté todo bien del lado del
servidor (ver `EXPO-GO.md`). Antes de volverse loco:

1. Comprobar que el miembro tiene Expo Go **del SDK 54**, no otro.
2. Comprobar que la publicación llegó: `npx eas-cli channel:view expogo`.
3. Plan B que no depende de nada de esto: `npx expo start` desde el
   computador y que escaneen ese QR (sirve el paquete en vivo, sin pasar por
   `u.expo.dev`). Los dos teléfonos tienen que estar en la misma red — o usar
   `npx expo start --tunnel`.

---

## Cuándo la vista previa no alcanza

Hay que mandar el APK, no el enlace, si la persona tiene que:

- hablarle a NEXUS con la voz,
- verificar su Genesis ID leyendo el documento con la cámara,
- recibir avisos con la app cerrada,
- entrar a un grupo o cobrar por un enlace recibido por WhatsApp.

Para todo lo demás —ver la app, moverse por el Núcleo, chatear, mirar la
billetera, cobrar por QR, probar los idiomas— la vista previa enseña la app
entera y se abre en un minuto.
