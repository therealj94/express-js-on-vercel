# Desplegar el motor Genesis ID en un host público (Render)

Genesis ID **ya es un backend** (Express). Aquí lo publicamos gratis en **Render**
(un proceso Node siempre activo, ideal para un estado compartido — a diferencia
de Vercel, que es serverless y no conserva bien el estado en memoria/archivo).

Resultado: una URL pública tipo `https://genesis-id-xxxx.onrender.com`, con el
**admin en vivo** en `/admin`, a la que **ambas apps** le pegan desde cualquier red.

---

## Paso a paso (Render)

### 1. Sube el código a GitHub
Ya está en tu repo `therealj94/express-js-on-vercel`, rama
`claude/veta-wallet-phantom-design-x37uqw`. (Si vas a producción, luego lo pasas a `main`.)

### 2. Crea la cuenta y el servicio
1. Entra a **https://render.com** → **Sign up** (puedes usar tu GitHub).
2. Botón **New +** → **Blueprint**.
3. **Connect** tu repositorio `express-js-on-vercel` y elige la **rama**.
4. Render detecta el archivo **`render.yaml`** (en la raíz) y propone el servicio
   **`genesis-id`**. Pulsa **Apply**.
   - *Si prefieres sin blueprint:* **New + → Web Service**, elige el repo, y pon:
     - **Root Directory:** `genesis-id`
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Health Check Path:** `/healthz`
     - **Instance Type:** Free

### 3. Espera el deploy (~2-3 min)
Cuando termine, Render te da la URL pública, por ejemplo:
```
https://genesis-id-xxxx.onrender.com
```

### 4. Comprueba que vive
- Abre en el navegador: **`https://genesis-id-xxxx.onrender.com/admin`** → verás el
  panel en vivo con las 5 identidades y 4 negocios sembrados.
- `…/healthz` responde `{ "status": "ok" }`.

> ⚠️ En el plan Free el servicio **se duerme tras ~15 min sin uso**; la primera
> petición luego tarda ~30-50 s en despertar. Normal para demo.

### 5. Apunta las apps a esa URL
En tu compu, dentro de `genesis-id`:
```bash
npm run connect -- https://genesis-id-xxxx.onrender.com
```
Eso escribe el `.env` de **Veta Wallet** y **MyTokenPay** con
`EXPO_PUBLIC_GENESIS_URL=https://genesis-id-xxxx.onrender.com`.

Luego arranca cada app tomando la nueva config:
```bash
# veta-wallet-app
npx expo start -c
# mytokenpay-app/mobile
npx expo start -c
```
Ahora **cualquier teléfono, en cualquier red**, registra/verifica contra el mismo
Genesis central: el UID lo emite el backend y se ve igual en la otra app y en `/admin`.

### 6. (Opcional) APK con la URL incrustada
Para un APK que ya traiga la URL, define la variable en el build de EAS. En
`eas.json`, dentro del perfil `preview` de cada app:
```json
"preview": {
  "android": { "buildType": "apk" },
  "env": { "EXPO_PUBLIC_GENESIS_URL": "https://genesis-id-xxxx.onrender.com" }
}
```
y luego `eas build -p android --profile preview`.

### 7. (Opcional) Persistencia entre reinicios
El plan Free reinicia con disco efímero (los datos se re-siembran). Para conservar
identidades entre reinicios: en Render añade un **Disk** montado en `/var/data`, y en
`render.yaml` descomenta:
```yaml
- key: GENESIS_DATA_FILE
  value: /var/data/genesis.json
```

---

## Alternativas equivalentes
- **Railway** (railway.app): New Project → Deploy from repo → Root `genesis-id`,
  Start `npm start`. Te da una URL pública igual.
- **Fly.io / VPS**: cualquier host que corra Node ≥18 y exponga el `PORT`.

## Verificación rápida (curl contra tu URL)
```bash
URL=https://genesis-id-xxxx.onrender.com
curl -s $URL/api/admin/stats
curl -s -X POST $URL/api/identities -H 'Content-Type: application/json' \
  -d '{"email":"prueba@correo.com","fullName":"Prueba"}'
```
