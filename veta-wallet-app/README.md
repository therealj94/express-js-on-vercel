# Veta Wallet — App móvil (Expo SDK 51)

Billetera cripto de **Orden Global** en React Native + Expo. Versión **simulada** (sin backend): datos, precios y transacciones son de demostración.

## 📱 Compatibilidad Android
`minSdkVersion 23` → **Android 6.0+** (cubre >99% de dispositivos Android activos hoy).
React Native 0.74 (usado por Expo SDK 51) ya no soporta Android 5.0 (API 21) internamente — bajar de API 23
requeriría una versión de Expo/React Native de 2022-2023 sin soporte activo, con más riesgo de bugs y
sin varias librerías modernas. El mínimo queda fijado explícitamente vía `expo-build-properties` en `app.json`,
así que no depende del valor por defecto de ninguna herramienta.

## ✨ Incluye
- Animación de arranque con el logo cargando la billetera (varios segundos).
- Login / registro sobre foto de fondo con tarjeta *glass*.
- KYC simulado (3 pasos) y **frase de recuperación** de 12 palabras (crear + **verla desde el menú → Ajustes → Seguridad → Frase de recuperación**).
- Dashboard con balance, **botones 3D**, y lista de activos.
- **Velas japonesas (candlestick)** por moneda: toca cualquier activo para abrir su gráfico e info.
- Info de cada moneda: **ORIGEN** (cripto nativa / pagos, 1 gramín = 1/55 g oro), **ONDK** (representación de Orden Global en token), **AUKA** (reserva de oro 1:1) y **AGKA** (reserva de plata 1:1).
- Enviar, Recibir (QR), Comprar/Vender, **Swap**, Tarjeta débito con **flip 3D**, Remesas, Actividad, Notificaciones, Crecer (staking) y Ajustes.
- Gestos: **desliza a los lados** para cambiar de pestaña y **desliza hacia abajo** para refrescar (en Inicio).
- Íconos vectoriales (sin emojis), transiciones y feedback háptico.

## 💰 Precios (simulados, jul 2026)
`ORIGEN = oro/55 = $2.35` · `ONDK = $2.10` · `AUKA = oro $129.26/g` · `AGKA = plata $1.92/g` · `BTC $64,378` · `ETH $1,904` · `USDT/USDC $1`

## ▶️ Correr en VS Code
```bash
cd veta-wallet-app
npm install
npx expo start
```
- Escanea el QR con la app **Expo Go** (Android/iOS), o pulsa `a` para abrir en un emulador Android / `i` para iOS.

> Requiere Node 18+. La primera vez, `npm install` descarga las dependencias de Expo SDK 51.

## 📦 Generar APK (Android)
Con **EAS Build** (recomendado, en la nube):
```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```
El perfil `preview` (en `eas.json`) genera un **.apk** instalable. Al terminar, EAS te da un enlace de descarga.

Compilación local (requiere Android SDK + Java):
```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# APK en android/app/build/outputs/apk/release/
```

## 🗂 Estructura
```
App.js                 Navegación, transiciones, swipe, tabbar, toast
src/theme.js           Colores y gradientes (teal + oro)
src/data.js            Tokens, precios, velas, textos de cada moneda, semilla
src/ui.js              Componentes: Logo, Botón3D, Velas, listas, etc.
src/screens/           Splash, Auth, Onboard (KYC + Semilla), Home,
                       TokenDetail, Trade (Send/Receive/Buy/Swap),
                       Card, More (Remesas/Actividad/Notif/Earn/Ajustes)
assets/                logo, ícono, splash, fondo de login
```

## 🔌 Conectar backend real (después)
Reemplaza los datos de `src/data.js` por llamadas a tu API / RPC de Orden Global:
precios en vivo, balances, envío/firma de transacciones y KYC real.

---
Diseño por **Monark Brand Labs** · Orden Global · roa.corphn@gmail.com
