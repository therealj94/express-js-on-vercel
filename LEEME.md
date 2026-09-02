# LÉEME — cuál Genesis ID es el real

Hay varias carpetas y archivos con «genesis» en el nombre. **Solo una corre en
producción**, y conviene saberlo antes de tocar nada:

| Carpeta / archivo | Qué es | Estado |
| --- | --- | --- |
| **`genesis-id/`** | **El motor de identidad que corre en Render** (`genesis-id.onrender.com`). Lo dice `render.yaml` (`rootDir: genesis-id`). KYC, KYB, sanciones, AML, bitácora firmada, panel `/admin`. | **PRODUCCIÓN — la única fuente de verdad** |
| `infra/genesis-proxy/` | El puente que monta el backend de Veta Wallet (Heroku) para hablar con Genesis sin que la clave de API salga del servidor. Se copia al backend; su prueba es `pruebas/puente.test.mjs`. | Producción (copia en Heroku) |
| `genesis-id-app/` | App Android del **panel de cumplimiento** (para operadores, no para usuarios). | Producción, otra cosa |
| `veta-wallet-app/src/genesis.js` y `screens/Onboard.js` | El cliente del usuario final en el teléfono: registro cámara-primero. | Producción |
| `apps-web/veta-wallet/app.js` | El cliente web: registro cámara-primero y la página pública `/gid/<GID>`. | Producción (Amplify) |
| `ogscan-backend/src/lib/genesis.js` | Consulta de GID y sanciones desde el explorador. | Producción |
| `genesis-admin.html` (raíz) | Panel de la versión ANTERIOR del motor; llama a rutas `/api/admin/*` que hoy no existen. | **Viejo, no usar** |
| `GENESIS_ID_INTEGRACION.md` (raíz) | Puente con el portal `genesisid.online`, retirado. | **Obsoleto** |

La crítica completa, con riesgos y plan de consolidación, está en
`documentos/genesis-id-critica.md`.

Pruebas:

```sh
cd genesis-id && npm install && npm run prueba && npm run typecheck   # 181 pruebas
cd veta-wallet-app && node pruebas/mrz-ocr.test.mjs
# el puente, contra un Genesis local (ver infra/genesis-proxy/README.md)
```
