# LÉEME — cuál Genesis ID es el real, y cuál app

Hay varias carpetas y archivos con «genesis» o «wallet» en el nombre. Conviene
saber cuál corre antes de tocar nada:

| Carpeta / archivo | Qué es | Estado |
| --- | --- | --- |
| **`genesis-id/`** | **El motor de identidad que corre en Render** (`genesis-id.onrender.com`). Lo dice `render.yaml` (`rootDir: genesis-id`). KYC, KYB, sanciones, AML, bitácora firmada y anclada en la cadena, credenciales firmadas, panel `/admin`. | **PRODUCCIÓN — la única fuente de verdad** |
| **`infra/veta-wallet-backend/`** | El backend de Veta Wallet que corre en **Heroku**. Su puente con Genesis es **`lib/genesisPuente.js`**: la clave de API vive ahí y nunca en el teléfono. | Producción |
| `infra/genesis-proxy/` | **Retirado** (SFSP v0.3, tarea 0.6). `genesis.router.js` solo reexporta `infra/veta-wallet-backend/lib/genesisPuente.js`, que es el puente canónico; `infra/mytokenpay-api/src/lib/genesisPuente.js` es su copia byte a byte, y `infra/veta-wallet-backend/pruebas/probar-puente-genesis.mjs` falla si divergen. | Retirado |
| **`orden-global-app/`** | **La app que se distribuye** (paquete `com.ordenglobal.app`, 1.33.x). El registro con Genesis vive en `src/screens/Onboard.js` y `src/genesis.js`; el pasaporte en `src/screens/More.js`; la tarjeta con QR en `src/TarjetaGid.js`. | **Producción** |
| `veta-wallet-app/` | La app **vieja** (`com.ordenglobal.vetawallet`, 1.33.0). No se toca. | Vieja |
| `apps-web/veta-wallet/` | El cliente web (Amplify): registro con fotos, tarjeta de identidad con QR y la página pública `/gid/<GID>`. | Producción |
| `genesis-id-app/` | App Android del **panel de cumplimiento** (para operadores, no para usuarios). | Producción, otra cosa |
| `ogscan-backend/src/lib/genesis.js` | Consulta de GID y sanciones desde el explorador. | Producción |
| `genesis-admin.html` (raíz) | Panel de la versión ANTERIOR del motor; llama a rutas `/api/admin/*` que hoy no existen. | **Viejo, no usar** |
| `GENESIS_ID_INTEGRACION.md` (raíz) | Puente con el portal `genesisid.online`, retirado. | **Obsoleto** |

La crítica completa, con riesgos y plan de consolidación, está en
`documentos/genesis-id-critica.md`.

Pruebas:

```sh
cd genesis-id && npm install && npm run prueba && npm run typecheck
cd infra/veta-wallet-backend && node pruebas/probar-puente-genesis.mjs   # el puente único, sin red
cd infra/genesis-proxy/pruebas && GENESIS_URL=… GENESIS_API_KEY=… node puente.test.mjs   # contra un Genesis local
cd orden-global-app && node pruebas/probar-codigos.cjs
cd apps-web/veta-wallet && node --check app.js
```
