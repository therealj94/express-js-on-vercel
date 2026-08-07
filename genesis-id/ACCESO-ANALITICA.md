# Analítica del ecosistema — cómo entrar y cómo encenderla

Todo el código está escrito, probado y subido. Lo que falta es **desplegarlo**,
y eso necesita dos credenciales que no están en este entorno. Este documento
dice exactamente qué hacer, en orden, y cuánto tarda cada paso.

---

## 1. Cómo entrar, una vez desplegado

| | |
| --- | --- |
| **Dirección** | `https://genesis-id.onrender.com/analitica` |
| **Correo** | `admin@ordenglobal.link` |
| **Contraseña** | la misma del panel de cumplimiento |

Es la misma cuenta de operador que ya usás. No hay usuario nuevo ni contraseña
nueva que recordar.

**Quién puede ver qué:**

| Rol | Ve la analítica | Puede cerrar errores |
| --- | --- | --- |
| `admin` | sí | sí |
| `cumplimiento` | sí | sí |
| `revisor` | sí | no |
| `auditor` | sí | no |

El auditor entra a propósito: es justo el rol que necesita mirar cifras sin
poder marcar un fallo como resuelto.

---

## 2. Lo que falta para encenderla (dos pasos)

### Paso 1 — Desplegar Genesis ID en Render · ~5 minutos

El código ya está en la rama `claude/veta-wallet-phantom-design-7syah8`.
`render.yaml` tiene `autoDeploy: true`, así que hay dos caminos:

- **Si Render está conectado a esa rama:** entrá al panel de Render, servicio
  `genesis-id`, y tocá **Manual Deploy → Deploy latest commit**. Con eso basta.
- **Si está conectado a otra rama:** en Settings → Build & Deploy, cambiá la
  rama a `claude/veta-wallet-phantom-design-7syah8`, o fusioná esa rama a la
  que Render esté siguiendo.

**Comprobación de que quedó:**

```bash
curl -s https://genesis-id.onrender.com/api | grep analitica
```

Si aparece `analitica` en la lista de rutas, está arriba. También podés mirar
`/healthz`: tiene que decir `"telemetriaPersistente": true`.

> No hace falta ninguna variable de entorno nueva. La telemetría usa la misma
> conexión a MongoDB que ya está configurada, en colecciones aparte.

### Paso 2 — Sacar las claves públicas y ponerlas en cada app · ~10 minutos

Entrá a `/analitica` → pestaña **Seguridad**. Ahí, en la tabla de claves de
API, cada app muestra su **clave pública de ingesta** (`gidp_…`), entera.

Esa clave **sí puede ir dentro del APK**. Solo abre la ruta de telemetría:
escribe métricas y no lee absolutamente nada. Es el mismo trato que hacen
Sentry con su DSN o PostHog con su clave de proyecto. Si algún día alguien la
saca de un APK y empieza a mandar basura, se rota desde el panel y la app vieja
deja de reportar en el acto.

**En Veta Wallet** — ya está todo el código puesto; solo falta la clave. En
`app.json`, dentro de `expo.extra`:

```json
{ "expo": { "extra": {
    "genesisUrl": "https://genesis-id.onrender.com",
    "telemetriaClave": "gidp_veta-wallet_……"
} } }
```

Y sale por aire con `eas update` — no hace falta APK nuevo.

**En MyTokenPay** — el backend **ya está desplegado con la telemetría dentro**
(release 18). Mide cada petición y reporta cada 5xx y cada excepción. Está
dormido a propósito: sin clave no manda nada, ni una petición. Para encenderlo,
una sola variable en Heroku y ni siquiera hace falta volver a desplegar:

```bash
heroku config:set GENESIS_TELEMETRIA_KEY=gid_live_… --app mytokenpay-api
```

Para la app móvil de MyTokenPay, copiar `genesis-id/clientes/telemetria.js` y
llamar `iniciar()` con la clave **pública**, igual que en Veta Wallet.

**En ordenscan** — lo mismo, con su propia clave pública.

---

## 3. Qué vas a ver cuando entre el primer evento

| Pestaña | Qué responde |
| --- | --- |
| **Resumen** | Registrados, activos hoy / 7 d / 30 d, altas, eventos, errores y tasa por mil |
| **Apps** | Lo mismo comparado entre todas las apps, con su tendencia |
| **Usuarios** | Altas por día, retención por cohorte semanal, y qué versión tiene la gente instalada |
| **Países** | Dónde está la base, por usuarios y por uso |
| **Verificación** | El embudo del KYC: en qué paso exacto se cae la gente |
| **Errores** | Fallos agrupados, con pila, muestras, versiones afectadas y resolución |
| **Seguridad** | Movimientos sensibles de la bitácora, claves de API y operadores |
| **Salud** | Estado en vivo de los cinco servicios del ecosistema |

Las apps nuevas **no hay que darlas de alta**: aparecen solas en el selector en
cuanto mandan su primer evento.

Mientras no llegue nada, el panel lo dice con todas las letras en vez de
enseñar ceros — un cero y un «no hay datos» se ven igual en una gráfica y no
significan lo mismo.

---

## 4. Lo que este panel protege, y lo que no

**No se guarda la dirección IP.** Se lee el país de la cabecera del proxy y se
descarta la IP en el acto. No queda en ningún registro.

**No se guarda el identificador del usuario.** Queda una huella HMAC con una
sal del servidor **y la clave de la app**. Eso significa que la misma persona
no da la misma huella en Veta Wallet y en MyTokenPay: no se pueden cruzar los
dos paneles para reconstruir quién es quién. Genesis ID guarda documentos de
identidad; mezclar eso con un panel de métricas sería regalar un objetivo.

**Los campos que huelen a secreto se descartan al entrar.** Si una app manda
por descuido `contrasena`, `apiKey`, `semilla` o similar dentro de `meta`, el
servidor lo tira antes de guardar nada.

**Lo que sí conviene saber:** cualquiera con la clave pública puede mandar
métricas falsas. No puede leer nada ni tocar identidades, pero puede ensuciar
las cifras. Si pasa, se rota la clave desde el panel.

---

## 5. Ajustes, si algún día hacen falta

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `GENESIS_TELEMETRIA_DIAS` | `90` | Días que se guardan los eventos crudos |
| `GENESIS_TELEMETRIA_ATRASO_H` | `72` | Cuánto atraso se le acepta a un evento. Subir solo para importar historial, y volver a bajar |
| `GENESIS_TELEMETRIA_SAL` | el secreto de SSO | Sal de las huellas de usuario. **Cambiarla rompe la continuidad de las cuentas de usuarios únicos** |
| `GENESIS_SERVICIOS` | los cinco del ecosistema | Qué vigila la pestaña Salud: `clave\|nombre\|url,…` |

Los resúmenes diarios **no caducan nunca**: aunque los eventos crudos se borren
a los 90 días, la historia de cuánta gente hubo cada día se conserva entera.

---

## 6. Estado, sin adornos

**Hecho y comprobado:**

- Motor de telemetría con colecciones propias, caducidad y resúmenes al vuelo
- Ingesta con clave secreta o pública, límite de peticiones y validación
- Ocho pestañas del panel, revisadas en un navegador real
- Agrupación de errores por patrón, con reapertura automática por versión
- Cliente listo para pegar, y Veta Wallet ya conectada
- 129/129 pruebas en verde, cero errores de tipos
- Probado con 34.000 eventos de tres apps a lo largo de 30 días

**Falta, y necesita credenciales que no tengo:**

- **Desplegar Genesis ID en Render.** Es lo único que falta de verdad, y no hay
  credenciales de Render en este entorno. Hasta que eso pase, no hay dónde
  reportar: el panel existe en el código pero `/analitica` responde 404 en vivo.
- Conectar la app móvil de MyTokenPay y ordenscan (minutos, una vez haya claves)

**Ya desplegado con Heroku:** el backend de MyTokenPay (release 18) lleva la
telemetría dentro y dormida. Se comprobó después de desplegar que `/healthz`
responde, el panel de administración carga y el login del comercio funciona:
nada se rompió.
