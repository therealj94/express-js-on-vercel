# Salida a vivo · 27-sep-2026

Orden de José: «Levantar ya en vivo». Todo sube **apagado** y nada del protocolo
toca dinero ni la 5550. Cada paso que tocó producción lo aprobó José, uno por
uno, en modo «preguntar».

## Antes de subir

- Revisión por equipo (218 agentes):
  - 84 hallazgos, de los que 82 se confirmaron;
  - 69 corregidos en código y 13 pasados a decisión.
- Verificación completa de SFSP (`VERIFICACION_COMPLETA`):
  - contratos 511, SDK 186, indexador 67, dbnx-api 86 y adversarias 14;
  - tipos correctos.
- Servicios:

  | Servicio | Resultado |
  |---|---|
  | genesis-id | 540 pruebas en verde |
  | Ordenex | «Todo en orden» |
  | Veta | 89/90 (`probar-carta` ya fallaba antes) |
  | MyTokenPay | 55/55 |

- Precio de ORIGEN = gramo de oro / 55, tomado del **precio de Londres**:
  - spot XAU/XAG;
  - guarda del fijo LBMA: se descarta si se aparta más del 5 %;
  - sin conexión, no hay precio.

  Rige en los backends y en las apps (decisión de José del 27-sep).

## Medición en producción (N1/A2), solo cuentas

Se hizo con un job puntual en Render (`job-das6t5p7lnhs73fs3430`). Solo proyectó
el id y los vínculos, sin datos personales.

| | |
|---|---|
| Identidades | 158 |
| Vínculos | 38 (31 de Veta Wallet) |
| Direcciones en varias identidades | **0** |
| Vínculos de Veta sin dirección | **1** |

Conclusiones:
- La regla «una dirección, una identidad» no afecta a nadie, así que no se abre la válvula.
- La persona sin dirección recibe 403 en Ordenex hasta que abra Veta Wallet, que la revincula con su dirección.

## Lo que salió a vivo

La rama de producción `claude/veta-wallet-phantom-design-7syah8` avanzó de
`add26a34` a `a313895c` (fast-forward, 164 commits).

| Destino | Estado | Cómo revertir |
|---|---|---|
| genesis-id (Render) | **live** `dep-das6tj3l550s7391hif0`, `/healthz` «ok» en a313895c | rollback a `dep-daefaajbc2fs73caq6rg` (ff1af52) en srv-d9h9ejvaqgkc739rk54g |
| Ultron-fp (Render) | **live** `dep-das6tj3l550s7391hhlg` | rollback a `dep-dam35sqjnfac73d4sulg` (add26a34) en srv-dah56p15efls7382pot0 |
| App Veta, actualización por aire (EAS `preview`) | éxito | `eas update:republish` del grupo anterior |
| App Orden Global, actualización por aire (EAS `preview`) | éxito | ídem |

En genesis-id no se tocó ninguna variable. `GENESIS_VENCER_AUTO` sigue ausente.

## Heroku (segunda sesión, 27-sep)

Con la llave de Heroku en el entorno. José aprobó cada app, una por una. Las
tres subieron del mismo commit, `01f159f` de `claude/sfsp410-ondk-saldos-ox2fba`.

### Antes de subir

- Pruebas locales, con los contratos compilados antes:
  - Ordenex: «Todo en orden».
  - Veta: 92/93. Solo falla `probar-carta`, que ya fallaba antes.
  - MyTokenPay: 55/55.
- MyTokenPay, la comprobación de `PROCEDENCIA.md` (se bajó el slug vivo, v28, y
  se compararon las rutas). Las 50 rutas del slug están en el repositorio. Las
  9 de `/genesis/*` pasaron al módulo compartido `src/lib/genesisPuente.js`.
  El despliegue no quita ninguna ruta.

### Lo que salió a vivo

| App | Antes → ahora | Comprobación | Cómo revertir |
|---|---|---|---|
| `ordenex-api` | v44 → **v45** | `/salud`: ok, cadena, mongo, entrega y venta, igual que antes. SSO con un token falso: 401 `SSO_INVALIDO`, así que Genesis contesta. `/compras` y `/portafolio` existen | Roll back a **v44** |
| `vetawallet` | v121 → **v122** | `/salud`: ok, mongo y cadena. Precio en un dyno puntual con el código desplegado: ORIGEN = **2,5055 USD** (gramo 137,80 USD / 55), fuente `oro`, es decir, Londres | Roll back a **v121** |
| `mytokenpay-api` | v28 → **v29** | `/healthz` ok (mongo). `web.1` corre v29. `/genesis/*`, `/api/companies` y `/api/admin` responden 401 sin sesión | Roll back a **v28** |

Roll back: en el dashboard de la app, *Activity → Roll back*, o por la API con
`POST /apps/<app>/releases {"release": "<id de la versión>"}`.

### Banderas (ninguna se tocó)

| App | Bandera | Valor |
|---|---|---|
| ordenex-api | `SFSP410_EMISION` | ausente |
| ordenex-api | `COMPRAS`, `VENTAS`, `BARRIDO` | `1`, como estaban antes |
| vetawallet | `SFSP410_EMISION` | ausente |
| vetawallet | `OG_PRECIO_MODO` | `oro`, el modo por omisión (Londres). No había `fijo` que quitar |
| vetawallet | `GENESIS_PUENTE_EXIGE_CORREO_CONFIRMADO` | ausente |
| mytokenpay-api | `MTP_VINCULO_GENESIS`, `MTP_OCULTAR_TOKEN_RESETEO` | ausentes |

Ojo: al terminar, `ordenex-api/bin/desplegar.mjs` imprime «El barrido y la
entrega siguen APAGADOS». En producción, `BARRIDO=1` y `COMPRAS=1` ya estaban
puestas desde antes. Ese mensaje no mira las variables.

### Medición: correo confirmado en Veta (solo cuentas)

Se hizo con un dyno puntual en `vetawallet`. Solo se contaron documentos, sin
datos personales.

| | |
|---|---|
| Usuarios | 481 |
| Con `isVerified = true` | **4** |
| Sin confirmar | **477** (99 %) |
| Sin confirmar, con la carta de Genesis enviada | 418 |
| Sin confirmar, activos en los últimos 30 días | 92 |
| Sin confirmar, creados en los últimos 30 días | 23 |

**Recomendación: no activar `GENESIS_PUENTE_EXIGE_CORREO_CONFIRMADO` todavía.**
Activarla deja sin puente ni SSO de Ordenex a casi todos. Con 4 confirmados de
481, lo más probable es que el flujo de confirmación no esté marcando
`isVerified`, más que la gente no confirme. Primero hay que revisar ese flujo,
después pedir la confirmación desde la app, y activar la bandera cuando la
mayoría de los activos la tenga.

### Por qué solo hay 4 confirmados

Revisado el mismo día. Solo se contaron cuentas, sin leer correos.

1. **Hasta agosto de 2026 nadie podía confirmar.** El enlace apuntaba a
   `api.vetawallet.com`, que no existe en DNS, y además nunca se metía en el
   correo. Se corrigió en `f28096d` (15-ago). Por mes de alta: de 2023-06 a
   2026-07, **0 confirmados de 398**; 2026-08, 2 de 56; 2026-09, 2 de 23.
2. **La llave de SES de `vetawallet` ya no vale.** `GET /v2/email/account`,
   firmado con `SES_LLAVE`/`SES_SECRETO`, responde 403 «The security token
   included in the request is invalid». Es el error de una llave que ya no
   existe en IAM; una firma mal hecha daría otro error, y un permiso que falta
   también. Si es así, hoy no sale ningún correo de Veta: ni la confirmación, ni
   la recuperación de contraseña, ni la bienvenida. `enviarCorreo` no lanza y
   el alta sigue, así que el fallo es silencioso. No se pudo confirmar con un
   envío real: la prueba contra el simulador de SES quedó bloqueada por los
   permisos de la sesión.
3. **No hay forma de volver a pedir el correo.** El código dice que se puede
   («lo puede volver a pedir»), pero no existe ninguna ruta de reenvío.
4. Los 477 sin confirmar conservan su `verificationToken`. En cuanto el correo
   funcione, se les puede mandar el enlace otra vez sin tocar la base.

Qué hacer, en orden:

1. **José:** crear una llave IAM nueva con permiso `ses:SendEmail` y ponerla en
   `SES_LLAVE`/`SES_SECRETO` de `vetawallet`. Mirar en CloudTrail quién borró
   o desactivó la anterior, y cuándo.
2. **Código:** añadir `POST /auth/reenviarConfirmacion`, con límite de envíos,
   y su botón en la app.
3. Reenviar la confirmación a los 92 activos de los últimos 30 días.
4. Activar `GENESIS_PUENTE_EXIGE_CORREO_CONFIRMADO` solo cuando la mayoría de
   los activos esté confirmada.

### Reenvío de la confirmación (27-sep, más tarde)

- `vetawallet` **v123** (`44b55f1`): `POST /auth/reenviarConfirmacion`, con
  sesión. El correo va solo a la dirección de la cuenta. Freno: uno cada 2
  minutos y 5 por día, guardado en la cuenta, más el limitador por IP.
  `/salud` ok; la ruta responde 401 sin sesión. **Cómo revertir:** roll back
  a **v122**.
- App Veta: botón «Reenviar correo de confirmación» en Ajustes, visible solo
  si la cuenta no está confirmada. **Publicado** por aire en el canal `preview`
  con GitHub Actions (`veta-preview.yml`, ejecución #100, desde `ceb41d5`, en
  verde). Solo añade el botón. **Cómo revertir:** `eas update:republish` del
  grupo anterior, o volver a lanzar el workflow desde `a313895`.
- `scripts/reenviar-confirmacion.js`: la tanda para los activos sin
  confirmar. Por omisión es un ensayo y no manda nada; `--a=` manda uno solo;
  `--de-verdad --tope=30` manda una tanda. Salta los dominios de la casa, a
  quien pidió no recibir avisos y a quien ya recibió una confirmación en los
  últimos 7 días, y se para si SES rechaza los tres primeros. Se corre en un
  dyno puntual de `vetawallet` una vez desplegado:
  `npx babel-node scripts/reenviar-confirmacion.js`.
- Mientras SES rechace la llave, el botón y el guion responden «no salió».

### Mejoras en código, sin desplegar todavía (`7ca4a62` y siguiente)

- Veta: `/salud` muestra `correo.estado` y pasa a «fallando» tras 3 fallos
  seguidos. El enlace de confirmación vence a los 7 días, con una página en
  español. `GET /auth/estadoCorreo`, que la app consulta al abrir Ajustes.
  Entrar con llave usa la misma vara que el puente.
- Veta: el guion de despliegue corre las pruebas y no despliega si una falla.
  `probar-carta` ya no depende del reloj. Suite: **117/117**.
- MyTokenPay: Node 20 → 22 (Node 20 dejó de tener soporte en abril de 2026).
  Pasa typecheck y 55/55 con Node 22. Es el paso previo a mover la app de
  Heroku-24 a Heroku-26.

**Desplegado** con aprobación de José (27-sep):

| Destino | Antes → ahora | Comprobación | Cómo revertir |
|---|---|---|---|
| `vetawallet` | v123 → **v124** (`eedfe4d`) | El guion corrió las 117 pruebas. `/salud` ok con `correo.estado: sin_envios`. `/auth/estadoCorreo` responde 401 sin sesión. Un enlace falso muestra la página «Enlace no válido» (400) | Roll back a **v123** |
| App Veta (EAS `preview`) | Actions #100 → **#101** (`eedfe4d`) | En verde | Volver a lanzar `veta-preview.yml` desde `ceb41d5` |
| `mytokenpay-api` | v29 (Heroku-24, Node 20) → **v30** (Heroku-26, Node 22) | `/healthz` ok (mongo). `web.1` corre v30. `/genesis/*`, `/api/companies` y `/api/admin` responden 401 sin sesión | Roll back a **v29**; si el stack no vuelve, `PATCH build_stack heroku-24` |

## Pendiente

1. ~~Cambiar `ADMIN_PASSWORD` en `mytokenpay-api`~~: hecho por José el 27-sep.
2. **José:** decidir `MTP_OCULTAR_TOKEN_RESETEO=si`. Cierra la toma de cuentas
   por «olvidé mi contraseña», pero rompe el reseteo desde la app.
3. **José:** poner la llave nueva de SES en `vetawallet` (`SES_LLAVE`/`SES_SECRETO`).
   Después: comprobarla, probar con una cuenta propia y mandar la tanda en
   partes cortas.

Contratos SFSP en la 5550: nada que desplegar. Siguen en `BLOCKED_DECISION`
hasta D07 (firmantes), D24–D27 y las llaves en KMS.
