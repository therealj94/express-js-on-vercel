# Publicar sin abrir tu computadora

Cada vez que el asistente empuja un cambio, GitHub Actions publica un
**EAS Update** al channel `preview`. Tu Expo Go recibe el cambio en cuanto
reabres la app — tú no tocas nada.

## Preparación (una vez, ~2 minutos)

### 1. Crear el token de Expo

1. Abre https://expo.dev/settings/access-tokens
2. **Create token**.
3. Nombre: `github-actions`. Copia el valor que aparece — solo se ve una vez.

### 2. Guardarlo en GitHub

1. Abre el repo en GitHub → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**.
2. Nombre: `EXPO_TOKEN` (exacto, en mayúsculas).
3. Value: pega el token del paso 1.
4. **Add secret**.

Listo. A partir de aquí, cada push del asistente publica solo.

## Cómo verificarlo

Cuando el asistente diga que ha empujado, entra al repo → pestaña **Actions**.
Verás un job "Veta Wallet — publicar preview" corriendo. Al terminar:

- Éxito ✓ → reabres Veta Wallet en Expo Go y el cambio está.
- Fallo ✗ → toca el job, mira los logs. Los errores más típicos:
  - **"Falta el secreto EXPO_TOKEN"** → volver al paso 2.
  - **Verificar falló** → el asistente lo revisa y arregla.

## Lanzarlo a mano

Además del push automático, puedes forzarlo:

Repo → **Actions** → **Veta Wallet — publicar preview** →
**Run workflow** → elige rama → **Run**.

## Qué queda fuera de esto

- **APK de Android** (`eas build`) — gasta minutos de EAS y no se relanza en
  cada commit; se corre a mano cuando toca sacar release.
- **Build de iOS** — necesita cuenta Apple Developer ($99/año) y
  configuración de credenciales. Fuera de este flujo.
- **Cambios en `app.json` que tocan plugins nativos** (permisos, iconos,
  splash) — necesitan un build nuevo del APK. El update solo lleva JS.

## Cuando el channel `preview` no basta

Si el asistente publica al channel de una rama distinta a `preview`
(por ejemplo `staging`), habrá que ampliar el workflow o crear otro
similar. Hoy solo trabaja `preview`.
