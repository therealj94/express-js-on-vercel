 > **OBSOLETO (2026-09).** Este documento describe un puente con el portal
> `genesisid.online` (`/api/portal/*`) que se retiró: ese portal nunca llegó a
> funcionar y el endpoint que recibía el «pasaporte» dejaba inyectar uno a
> cualquier correo. Hoy Genesis ID es el motor de `genesis-id/` y las apps
> hablan con él por `infra/genesis-proxy/`. Ver `LEEME.md` y
> `documentos/genesis-id-critica.md`. Se conserva solo como historia.

# Integración con el portal Genesis ID (genesisid.online)

## Arquitectura (importante para la seguridad)

```
   Veta Wallet (APK)  ──▶  Motor Genesis (Render)  ──X-API-Key──▶  genesisid.online
        sin clave              GENESIS_API_KEY                       portal oficial
```

La API key `gid_live_…` **nunca va dentro de la app**. Un `.apk` se descomprime
con un zip y cualquiera extraería la clave, pudiendo consultar el estado de tus
usuarios. Por eso la clave vive solo en el servidor y la app llama a
`/api/portal/*` del motor Genesis.

## 1. Configurar la clave en Render (una sola vez)

1. Entra a **https://dashboard.render.com** → servicio **genesis-id**.
2. Pestaña **Environment** → **Add Environment Variable**:

   | Key | Value |
   |---|---|
   | `GENESIS_API_KEY` | `gid_live_…` (tu clave real) |
   | `GENESIS_PORTAL_API` | `https://www.genesisid.online` |

3. **Save Changes** → Render redespliega solo.
4. Verifica: abre `https://genesis-id.onrender.com/api/portal/status`
   → debe decir `{"configured": true, ...}`.

## 2. Rutas del puente (ya implementadas)

| Ruta del motor | Llama al portal | Para qué |
|---|---|---|
| `POST /api/portal/register` | `/api/apps/register-app` | Vincula al usuario con la app antes de verificar |
| `POST /api/portal/user-status` | `/api/apps/user-status` | Estado de verificación + pasaporte |
| `POST /api/portal/token-validate` | `/api/apps/token-validate` | Valida el token que devuelve el portal al terminar |
| `GET /api/portal/status` | — | Comprueba si la clave está configurada |

Todas envían `X-API-Key` desde el servidor y normalizan la respuesta a un
pasaporte del ecosistema:

```json
{ "passport": {
    "genesisUid": "GEN-1234-5678",
    "fullName": "…", "email": "…", "documentId": "…",
    "nationality": "…", "birthDate": "…", "photoUrl": "…",
    "walletAddress": "0x…", "status": "verified"
} }
```

**Respaldo:** si el portal no responde, el motor entrega el pasaporte que ya
tenga guardado, para que la app no se quede sin datos.

## 3. Flujo en la app

1. Ajustes → **Vincular con Genesis ID** (o al crear la cuenta).
2. La app llama a `/api/portal/register` y abre el portal con
   `?email=…&name=…&wallet=0x…&return_url=vetawallet://genesis`.
3. El usuario completa la verificación en el portal.
4. Al volver:
   - Si el portal redirige con `?token=…` → la app lo manda a
     `/api/portal/token-validate` (el servidor lo valida con la clave).
   - Si redirige con los datos (`?uid=…&name=…`) → los toma directo.
   - Si no redirige → botón **"Ya me verifiqué"** consulta `/api/portal/user-status`.
5. El pasaporte queda en la cuenta y se muestra completo.

## 4. Lo que falta confirmar del portal

Para dejarlo exacto necesito el contrato real de los 3 endpoints:

**a)** ¿Qué recibe y devuelve cada uno? Un ejemplo real de request/response de:
   - `POST /api/apps/register-app`
   - `POST /api/apps/user-status`
   - `POST /api/apps/token-validate`

**b)** Al terminar la verificación, ¿el portal redirige a la URL que le pasamos
   en `return_url`? ¿Con qué parámetro devuelve el token (`token`, `code`…)?

**c)** ¿El portal necesita un identificador de app (`app_id`, `client_id`)
   además de la API key? Si sí, dime cuál para incluirlo.

Con eso ajusto los nombres de campos y queda cerrado de punta a punta. Mientras
tanto, el puente ya acepta las variantes más comunes (`uid`/`genesisUid`/`gid`,
`name`/`fullName`, `status`/`state`, etc.).

## 5. Probar sin la app

```bash
curl -X POST https://genesis-id.onrender.com/api/portal/user-status \
  -H 'Content-Type: application/json' \
  -d '{"email":"tu@correo.com"}'
```
