# Cómo generar el APK (Veta Wallet, MyTokenPay y Roatán Yacht)

Las dos apps **ya vienen enlazadas** al Genesis ID en la nube
(`https://genesis-id.onrender.com`) por defecto — no necesitas configurar nada.
El APK se compila con **EAS Build** (la nube de Expo) y te da un enlace de
descarga del `.apk`. Se corre desde tu PC con tu cuenta de Expo (gratis).

> No se puede generar el `.apk` sin tu cuenta de Expo: el build ocurre en los
> servidores de Expo. Estos comandos lo dejan hecho en ~10-15 min por app.

## Requisitos
- Node.js 18+
- Una cuenta gratis en **https://expo.dev** (para el build en la nube)

## Instalar EAS (una sola vez)
```bash
npm install -g eas-cli
eas login          # con tu cuenta de expo.dev
```

## Compilar Veta Wallet
```bash
cd veta-wallet-app
npm install
eas init           # crea el proyecto en tu cuenta (acepta con Enter)
eas build -p android --profile preview
```
Al terminar, EAS te da una **URL de descarga del .apk**. Ábrela en el teléfono
y descarga/instala (activa "instalar apps de origen desconocido" si lo pide).

## Compilar Roatán Yacht Getaways

Esta app **también se puede compilar sin cuenta de Expo**, con el SDK de
Android en tu máquina — el script hace todo:

```bash
cd roatan-yacht-app
./scripts/build-apk.sh
# → android/app/build/outputs/apk/release/app-release.apk
```

Necesita el SDK de Android (platform 36, build-tools 36) y JDK 17+. Para
apuntar a un servidor tuyo en vez del sitio desplegado:

```bash
API_URL=http://192.168.1.20:3000 ./scripts/build-apk.sh
```

Y si preferís la nube de Expo, igual que las otras:

```bash
cd roatan-yacht-app
npm install
eas init
eas build -p android --profile preview
```

## Actualizaciones por aire (EAS Update)

Desde la versión 1.15.0 el APK **sí recibe actualizaciones sin recompilar**.
Antes no: `app.json` declaraba la URL de updates pero la librería
`expo-updates` no estaba instalada, así que el pipeline publicaba y ningún
teléfono con el APK lo recibía. Solo llegaban a Expo Go.

**El APK que ya tiene la gente instalado no puede arreglarse por aire** — le
falta justamente el componente que descarga los updates. Hay que compilar uno
nuevo y repartirlo una última vez. De ese en adelante, cada push a la rama de
trabajo les llega solo.

Cómo funciona:

- El perfil `preview` de `eas.json` está atado al canal `preview`, y el
  workflow de GitHub publica con `eas update --branch preview`. Canal y rama
  tienen que coincidir o el update no llega.
- La app pregunta si hay algo nuevo al abrirse y al volver del segundo plano
  (como mucho una vez cada 10 min). Si lo hay, lo descarga y ofrece reiniciar.
  Nunca se reinicia sola.

### Cuándo hay que compilar un APK nuevo igual

`runtimeVersion` usa la política `fingerprint`: la huella cambia cuando cambia
algo **nativo**. Los cambios de JavaScript viajan por aire; agregar o quitar
una librería con parte nativa, no. Si instalás una dependencia nueva de ese
tipo, los updates dejan de alcanzar a los APK viejos hasta que compiles y
repartas uno nuevo. Es a propósito: mandarles JavaScript que llama a un
módulo que su binario no tiene reventaría la app.

## Compilar MyTokenPay
```bash
cd mytokenpay-app/mobile
npm install
eas init
eas build -p android --profile preview
```

## ¿Funciona el APK solo (sin PC, sin Expo Go)?
**Sí.** El APK trae la URL del Genesis incrustada (perfil `preview` de
`eas.json`), así que al abrirlo se conecta al motor real en la nube. Solo necesita
**internet** en el teléfono. El registro/verificación viaja al servidor y se ve
en el admin `https://genesis-id.onrender.com/admin` y en la otra app.

## Alternativa sin compilar: Expo Go (ahora mismo)
Si solo quieres probar ya, sin generar APK:
```bash
cd veta-wallet-app && npm install && npx expo start
# y en otra terminal:
cd mytokenpay-app/mobile && npm install && npx expo start
```
Escanea el QR con **Expo Go**. Igual quedan conectadas al Genesis en la nube.

## Nota del plan Free de Render
El backend Genesis se duerme tras ~15 min sin uso; la primera petición luego
tarda ~30-50 s en despertar. Abre el `/admin` en el navegador antes de demostrar
para "despertarlo".
