# MyTokenPay — App móvil (Expo SDK 51)

App nativa (React Native + Expo Router) para MyTokenPay: directorio de comercios afiliados,
registro de empresa con verificación KYC/KYB y ubicación en mapa, todo consumiendo la API en
`../src`.

## Requisitos

- Node.js 18+
- La app **Expo Go** instalada en tu teléfono Android (Play Store), o un emulador de Android
  Studio con Google Play Services
- Tu celular y tu computadora conectados a la **misma red Wi-Fi**

## 1. Levantar la API

Desde la raíz del repo (no desde `mobile/`):

```bash
npm install
cp .env.example .env    # define JWT_SECRET
npm run dev              # http://localhost:3001
```

Déjala corriendo en una terminal aparte.

## 2. Abrir la app en VS Code

```bash
cd mobile
npm install
npx expo start
```

Esto abre el Metro Bundler y muestra un código QR en la terminal (o en la pestaña que abre en el
navegador). En VS Code puedes correr `npx expo start` desde la terminal integrada.

## 3. Probar en Android con Expo Go

1. Abre **Expo Go** en tu teléfono.
2. Escanea el código QR que muestra `npx expo start` (en Android, Expo Go tiene su propio lector
   de QR).
3. La app se compila en el celular y abre con el splash animado de MyTokenPay.

Por defecto, la app detecta automáticamente la IP de tu computadora (la misma que usa Metro) y le
suma el puerto `3001` para hablarle a la API — normalmente **no necesitas configurar nada**. Si tu
API corre en otra máquina, en otro puerto, o quieres apuntar a un backend desplegado, crea un
archivo `mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://TU_IP_O_DOMINIO:3001
```

(y vuelve a correr `npx expo start -c` para limpiar la caché).

### Si usas un emulador de Android Studio en la misma máquina

El emulador no comparte "localhost" con tu computadora. Usa `10.0.2.2` en vez de tu IP local:

```
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001
```

## Estructura

```
app/                      Rutas (Expo Router, basado en archivos)
  _layout.tsx               Carga de fuentes, splash animado, stack raíz
  (tabs)/                    Inicio, Explorar, Mi panel (tab bar)
  negocio/[id].tsx           Ficha pública de un comercio
  login.tsx, registro.tsx    Modales de autenticación
  registrar-empresa.tsx      Asistente de registro (6 pasos + KYC)
  mi-empresa.tsx             Edición del perfil de empresa
src/
  components/                UI compartida (mapa, tarjetas, formularios)
  store/                     Estado global (auth, catálogo) con Zustand
  lib/                       Cliente HTTP, tema, tipos, utilidades de archivos
```

## Notas

- El mapa usa `react-native-maps` con el proveedor de Google — funciona sin API key dentro de
  Expo Go gracias a la key de desarrollo que trae Expo. Para una build de producción (APK/AAB)
  necesitarás tu propia API key de Google Maps en `app.json`.
- Los documentos KYC y las fotos se envían como `data:` URLs en el JSON a la API (sin subida a un
  bucket externo) — coherente con el backend de demo, que guarda todo en memoria.
- El ícono/splash de la app son un placeholder de marca generado para este proyecto; reemplázalos
  en `assets/` cuando tengas artes finales antes de publicar una build real.
