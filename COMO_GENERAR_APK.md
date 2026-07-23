# Cómo generar el APK (Veta Wallet y MyTokenPay)

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
