# Conectar Veta Wallet (APK) a tu blockchain real (Orden Global)

Tu billetera web ya habla con tu backend en **Heroku + AWS**. La app Veta Wallet
se conecta al **mismo backend/API** — no directamente al nodo de la blockchain.
Así las llaves privadas se quedan en tu servidor y nunca en el teléfono.

```
   APK Veta Wallet ──HTTPS──▶  Tu API (Heroku + AWS)  ──▶  Nodo Orden Global
   (esta app)                  (el mismo de la web)         (blockchain)
```

## 1. Qué ya quedó listo en la app

- **`veta-wallet-app/src/api.js`** — capa de conexión con tu backend.
  - Lee la URL de `EXPO_PUBLIC_WALLET_API_URL`.
  - Guarda el token de sesión (JWT) en el teléfono con AsyncStorage.
  - Trae funciones: `login`, `register`, `me`, `balances`, `address`, `send`,
    `transactions`, `prices`.
  - Incluye **normalizadores** que aceptan varias formas de respuesta comunes,
    para no depender de un contrato exacto.
- **Login real** (`src/screens/Auth.js`): si `EXPO_PUBLIC_WALLET_API_URL` está
  definida, el botón *Ingresar* autentica contra tu API, guarda el token y entra
  con la cuenta real. Si NO está definida, sigue con las cuentas demo.
- **Saldos reales** (`src/screens/Home.js`): la cuenta real muestra los balances
  que devuelve tu blockchain (no los de demostración).
- **Enviar real** (`src/screens/Trade.js`): el botón *Revisar y enviar* ejecuta
  la transacción vía `POST /wallet/send` de tu API cuando está conectada.

> Sin `EXPO_PUBLIC_WALLET_API_URL`, todo sigue funcionando en modo DEMO como hasta
> ahora. Nada se rompe. La conexión real se **activa** al poner la URL.

## 2. Activar la conexión (2 pasos)

### a) Apunta la app a tu API
Crea `veta-wallet-app/.env` (o edítalo) con la URL de tu backend:

```
EXPO_PUBLIC_WALLET_API_URL=https://tu-backend.herokuapp.com
```

Si tus rutas son distintas a las estándar, sobre-escríbelas SIN tocar código:

```
EXPO_PUBLIC_WALLET_PATH_LOGIN=/api/auth/login
EXPO_PUBLIC_WALLET_PATH_BALANCES=/api/wallet/balances
EXPO_PUBLIC_WALLET_PATH_SEND=/api/wallet/send
EXPO_PUBLIC_WALLET_PATH_TXNS=/api/wallet/transactions
EXPO_PUBLIC_WALLET_PATH_ME=/api/me
EXPO_PUBLIC_WALLET_PATH_PRICES=/api/prices
```

Reinicia con caché limpia para que tome el `.env`:

```bash
cd veta-wallet-app
npx expo start -c
```

### b) Para el APK
En `veta-wallet-app/eas.json` ya hay un espacio para la URL (perfil `preview` y
`production`). Rellénalo con tu API y compila:

```json
"env": {
  "EXPO_PUBLIC_GENESIS_URL": "https://genesis-id.onrender.com",
  "EXPO_PUBLIC_WALLET_API_URL": "https://tu-backend.herokuapp.com"
}
```

```bash
eas build -p android --profile preview
```

## 3. Contrato esperado por la app

La app es flexible, pero espera algo parecido a esto. Ajusta tu backend o dime
las formas reales y adapto los normalizadores.

**POST `/auth/login`** — body `{ email, password }`
```json
{ "token": "JWT...", "user": { "email": "...", "name": "...", "address": "0x..." } }
```
El token también se acepta como `accessToken` / `jwt`. El usuario también como
`data.user`. La dirección como `address` / `wallet` / `publicKey`.

**GET `/wallet/balances`** (con `Authorization: Bearer <token>`)
```json
{ "tokens": [ { "symbol": "ORIGEN", "qty": 21.28, "priceUsd": 2.35 },
              { "symbol": "BTC", "qty": 0.01 } ] }
```
También se acepta `balances`/`assets`, o un objeto `{ "ORIGEN": 21.28, "BTC": 0.01 }`.

**POST `/wallet/send`** — body `{ to, symbol, amount, note }`
```json
{ "txId": "0xabc...", "status": "pending" }
```

**GET `/wallet/transactions`**, **GET `/prices`**, **GET `/me`** — opcionales.

## 4. Lo que necesito de ti para dejarlo 100% funcional

Para terminar de calzar el contrato exacto, dime:

1. **URL base** de tu API (la misma que usa la billetera web).
2. **Autenticación**: ¿JWT con email/contraseña? ¿API key? ¿frase semilla?
3. **Rutas reales** y **forma de la respuesta** de: login, balances y send
   (pega un ejemplo real de cada una — puedes ocultar valores sensibles).

Con eso ajusto `src/api.js` a tu contrato y la app queda conectada de punta a
punta con tu blockchain.

## 5. Seguridad (importante)

- La app **no** guarda llaves privadas ni firma transacciones en el teléfono:
  manda la orden a tu backend y **tu servidor** firma contra el nodo. Mantén ese
  diseño.
- Usa siempre **HTTPS**. El token se guarda en AsyncStorage; para máxima
  seguridad puedes migrarlo luego a `expo-secure-store`.
- No subas tu `.env` al repo (ya está en `.gitignore`).
