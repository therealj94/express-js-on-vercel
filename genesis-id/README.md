# Genesis ID — Motor de identidad (Orden Global)

Backend real y ejecutable de **Genesis ID**: la identidad digital única del
ecosistema (Veta Wallet · MyTokenPay). Verifica personas (KYC) y negocios (KYB),
emite un **UID Genesis** y persiste todo en disco. Ambas apps le envían el
registro cuando está configurada su URL; si no hay servidor, usan el mismo motor
como respaldo en el dispositivo (para demos en Expo Go sin montar nada).

## Correr
```bash
cd genesis-id
npm install
npm run dev        # http://localhost:4000
```
La data se siembra sola la primera vez (4 negocios demo + sus dueños + un cliente,
todos verificados, con los mismos UID que las apps) en `data/genesis.json`.

## Conectar las apps al motor real
En cada app móvil define la URL antes de iniciar Expo:
```bash
# MyTokenPay y Veta Wallet
EXPO_PUBLIC_GENESIS_URL=http://TU_IP_LOCAL:4000npx expo start
```
Sin esa variable, las apps usan el motor Genesis en el dispositivo (registros
reales persistidos con AsyncStorage) — ideal para demostrar en el teléfono.

## API
### Identidades personales (KYC)
- `POST /api/identities` `{ email, fullName? }` → crea o **reanuda** la identidad
- `GET  /api/identities/:id`
- `GET  /api/identities/by-email/:email`
- `POST /api/identities/:id/capture` → avanza (doc-front → doc-back → face → processing)
- `POST /api/identities/:id/process` → **verifica y emite UID** (GEN-XXXX-XXXX)
- `POST /api/identities/:id/review` → a revisión manual (hasta 24 h)
- `POST /api/identities/:id/retry`  → reintenta el escaneo

### Negocios (KYB)
- `POST /api/business` `{ ownerEmail, legalName, tradeName, taxId, category, country, city, address }`
- `GET  /api/business/:id` · `GET /api/business/by-owner/:email`
- `POST /api/business/:id/review` `{ status: "verified"|"rejected", note? }` → emite UID (GNB-XXXX-XXXX)

### Admin
- `GET  /api/admin/stats` · `GET /api/admin/identities` · `GET /api/admin/business`
- `POST /api/admin/reset` (demo: re-siembra)

## Modelo
`Identity` (personal) y `BusinessIdentity` (KYB) — ver `src/types.ts`. Es el mismo
modelo que reflejan las apps, así el backend y el respaldo local hablan igual.
