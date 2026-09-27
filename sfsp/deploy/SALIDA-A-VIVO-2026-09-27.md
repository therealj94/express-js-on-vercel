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

## Pendiente

1. **José:** cambiar `ADMIN_PASSWORD` en `mytokenpay-api` y comprobar que la
   vieja ya no entra. Se avisó justo al terminar la v29.
2. **José:** decidir `MTP_OCULTAR_TOKEN_RESETEO=si`. Cierra la toma de cuentas
   por «olvidé mi contraseña», pero rompe el reseteo desde la app.
3. Revisar por qué solo 4 cuentas de Veta tienen el correo confirmado (ver arriba).

Contratos SFSP en la 5550: nada que desplegar. Siguen en `BLOCKED_DECISION`
hasta D07 (firmantes), D24–D27 y las llaves en KMS.
