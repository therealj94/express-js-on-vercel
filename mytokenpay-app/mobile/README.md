# MyTokenPay — App móvil (Expo SDK 51)

App nativa (React Native + Expo Router) para MyTokenPay: directorio de comercios afiliados,
registro de empresa con verificación KYC/KYB y ubicación en mapa, todo consumiendo la API en
`../src`.

## Modo simulado (sin backend)

Por defecto, la app corre en **modo simulado**: no necesita el servidor corriendo ni que el
celular esté en la misma Wi-Fi. Los datos (categorías, países, ~30 negocios de muestra en
Centroamérica, login/registro) viven en memoria dentro de la propia app, en
`src/lib/mockData.ts` y `src/lib/mockApi.ts`. Puedes crear una cuenta, iniciar sesión, registrar
un negocio y navegar el directorio completo sin backend real — los datos se reinician cada vez
que recargas la app (no hay persistencia entre sesiones).

Cuando tengas el backend real corriendo (ver abajo) y quieras que la app le hable a ese servidor:
abre `mobile/src/lib/api.ts` y cambia
```ts
export const USE_MOCK_API = true
```
a `false`, guarda, y reinicia con `npx expo start -c`. El resto de la app no cambia — `mockApi.ts`
y el backend real exponen exactamente la misma interfaz.

## Requisitos (solo si vas a usar el backend real)

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
  lib/                       Cliente HTTP (api.ts), modo simulado (mockApi.ts, mockData.ts),
                              tema, tipos, utilidades de archivos
```

## Notas

- El mapa usa `react-native-maps` con el proveedor de Google — funciona sin API key dentro de
  Expo Go gracias a la key de desarrollo que trae Expo. Para una build de producción (APK/AAB)
  necesitarás tu propia API key de Google Maps en `app.json`.
- Los documentos KYC y las fotos se envían como `data:` URLs en el JSON a la API (sin subida a un
  bucket externo) — coherente con el backend de demo, que guarda todo en memoria.
- El ícono/splash de la app son un placeholder de marca generado para este proyecto; reemplázalos
  en `assets/` cuando tengas artes finales antes de publicar una build real.

## 🆕 Ecosistema Orden Global (esta versión)

- **Genesis ID integrado** (`app/verificar-identidad.tsx` + `src/store/genesis.ts`):
  correo → documento frente/reverso → rostro → verificado. Timer de **30 s por escaneo**
  con contador visible; si expira, el caso pasa a **revisión manual (hasta 24 h)** con aviso.
  El progreso se **persiste**: si dejas tu correo y sales, al volver continúas donde quedaste.
  Al terminar hay botón **«Volver a la app»** y redirección automática (6 s). Marco facial grande.
- **Saldo Veta Wallet reflejado** (`src/store/wallet.ts`): saldo ORIGEN compartido simulado
  (250 ORIGEN · 1 ORIGEN = $2.35). Visible en «Mi cuenta», «Conectar wallet» y «Pagar».
- **Pestaña Pagar** (`app/(tabs)/pagar.tsx`): escanear **QR** (simulado) o **transferir** a un
  comercio del directorio; el pago **se descuenta del saldo de Veta Wallet** y genera recibo
  con referencia + notificación. Historial de pagos recientes.

Todo sigue en modo simulado (sin backend); cuando el backend real exista, estos stores se
conectan a la API de Orden Global sin cambiar las pantallas.

## 🛍️ Comercio completo (esta versión)

- **Catálogo por comercio**: cada negocio ofrece productos/servicios con precio en ORIGEN
  (las 4 empresas demo tienen catálogo curado; el resto se genera del directorio).
- **Factura**: selecciona ítems con el carrito → factura con cantidades, propina (0/5/10/15%),
  total en ORIGEN + USD. Paga directo con la **Veta Wallet** conectada (descuenta saldo).
- **QR de cobro**: genera un QR con el monto exacto para escanear con MyTokenPay o Veta Wallet.
- **Dividir cuenta**: entre 2 y 4 personas, en partes iguales o montos manuales (validados);
  se genera **un QR por persona** y el cobro se acredita cuando todos pagan.
- **Panel del negocio** (`/negocio-panel`): saldo ORIGEN del comercio (siempre igual al de su
  Veta Wallet), cobros recibidos en vivo, estadísticas y **cash out**: banco + cuenta + monto
  → retira a la moneda del país (HNL, GTQ, USD, NIO, CRC, MXN…) con tasa visible e historial.

## 🔑 Cuentas demo (usuario y contraseña)

| Rol | Empresa | Correo | Contraseña | Genesis ID |
|---|---|---|---|---|
| Cliente | — | `cliente@mytokenpay.demo` | `Origen2026!` | GEN-1100-2200 |
| Dueño | Café Veta Roasters (HN) | `cafe.veta@mytokenpay.demo` | `Cafe2026!` | GEN-1101-2201 |
| Dueño | Bahía Esmeralda Hotel (HN) | `bahia.hotel@mytokenpay.demo` | `Hotel2026!` | GEN-1102-2202 |
| Dueño | Ironhouse Gym (GT) | `ironhouse.gym@mytokenpay.demo` | `Gym2026!` | GEN-1103-2203 |
| Dueño | Nova Tech Center (SV) | `nova.tech@mytokenpay.demo` | `Tech2026!` | GEN-1104-2204 |

En la pantalla de bienvenida hay chips de **"Cuentas demo"** para entrar con un toque.
Todos ya tienen Genesis ID verificado; los dueños tienen su negocio inscrito, verificado,
con catálogo, cobros históricos y retiros habilitados.

> Nota demo: al correr en modo simulado los usuarios viven en memoria (se re-crean al
> recargar), y los cobros/retiros persisten en el dispositivo con AsyncStorage.
