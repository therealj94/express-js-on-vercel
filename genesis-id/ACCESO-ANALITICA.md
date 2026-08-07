# Analítica del ecosistema — cómo entrar y cómo encenderla

**Está desplegado y funcionando.** Genesis ID corre la analítica en producción,
MyTokenPay ya reporta solo, y las claves de las apps están abajo.

---

## 1. Cómo entrar

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

## 2. Las claves de ingesta de cada app

Ya emitidas. También salen del panel, pestaña **Seguridad**:

| App | Clave pública |
| --- | --- |
| Veta Wallet | `gidp_veta-wallet_98cwxS8AnbUIRAEr` |
| MyTokenPay | `gidp_mytokenpay__riQsWLOw5v2XQ_R` |
| ordenscan | `gidp_ordenscan_RIo4I1gyxv6gewfq` |

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

## 6. Estado

**En producción y comprobado contra el servidor real:**

- `/analitica` responde 200 · `/healthz` dice `telemetriaPersistente: true`
- Las nueve rutas del panel responden 200
- Ingesta con clave pública: aceptada · con clave falsa: 401
- **MyTokenPay reporta solo** desde su backend, sin haber tocado ninguna
  variable: la clave que ya tenía recibió el alcance nuevo al arrancar
- La pestaña Salud mide los cinco servicios del ecosistema: los cinco arriba
- 129/129 pruebas en verde, cero errores de tipos

**Falta, y son minutos:**

- Poner la clave pública en `app.json` de Veta Wallet y sacarlo por aire
- Copiar el cliente a la app móvil de MyTokenPay y a ordenscan
