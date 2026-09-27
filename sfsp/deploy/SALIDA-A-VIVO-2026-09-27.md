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

## Lo que falta (sesión nueva, con la llave de Heroku)

El entorno carga las credenciales nuevas solo al abrir otra sesión. En esta,
Heroku respondió 401. Orden de los pasos:

1. **Leer** releases y banderas de `ordenex-api`, `vetawallet` y `mytokenpay-api`,
   sin imprimir secretos, y anotar el release al que se vuelve.
2. **Ordenex:** `node infra/ordenex-api/bin/desplegar.mjs`.
   - Deben quedar como están `SFSP410_EMISION` (ausente), `COMPRAS`, `VENTAS` y `BARRIDO`.
   - Comprobar `/salud` y un SSO.
3. **Veta:** `node infra/veta-wallet-backend/bin/desplegar.mjs`.
   - Precio de Londres (sin `OG_PRECIO_MODO=fijo`).
   - `SFSP410_EMISION` ausente.
   - Comprobar `/salud` y una cotización de depósito.
4. **MyTokenPay:** build desde `git archive` (no tiene guion propio).
   - **Inmediatamente después**, José cambia `ADMIN_PASSWORD`.
   - Decidir `MTP_OCULTAR_TOKEN_RESETEO`.
5. Sigue abierto en producción, desde antes de este trabajo, el puente de Veta sin
   exigir el correo confirmado (`GENESIS_PUENTE_EXIGE_CORREO_CONFIRMADO`). Se
   recomienda activarlo tras medir cuántos usuarios no lo tienen confirmado.

Contratos SFSP en la 5550: nada que desplegar. Siguen en `BLOCKED_DECISION`
hasta D07 (firmantes), D24–D27 y las llaves en KMS.
