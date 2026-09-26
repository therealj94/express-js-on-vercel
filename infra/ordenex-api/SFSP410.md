# SFSP-410 en Ordenex · entrega de ORIGEN bajo demanda

Política: `sfsp/spec/SFSP-410-SUPPLY-POLICY.md` («el circulante es lo que tienen
los usuarios», §3.1 y §4). Estado: **código listo, interruptor APAGADO**. Nada de
esto se enciende sin las decisiones D23–D27 y sin el cupo aprobado en cadena.

## Qué cambia

Con el interruptor **apagado** (`SFSP410_EMISION` sin poner o distinto de `1`)
Ordenex hace exactamente lo de antes: la compra mira el inventario de la
billetera caliente y la entrega es un envío desde ella. Mismo camino, mismo
código.

Con el interruptor **encendido** (`SFSP410_EMISION=1`):

| Paso | Antes (caliente) | Con SFSP-410 |
|---|---|---|
| Abrir una orden (`lib/compra.js · abrir`) | mira el saldo de la caliente menos lo comprometido | mira el **cupo** de la bóveda (`budgetRemaining`, `vaultBalance`, máximo por operación) menos lo comprometido. La caliente **no se lee**. |
| Entregar (`lib/compra.js · entregar`) | `enviarDesdeCaliente` | `SFSPNativeVault.releaseOnDemand(destino, monto, paymentRef, evidenceRoot)` firmado por el EMISOR (`lib/sfsp410.js · entregarOrigen`). La caliente **no firma** ni se mira su inventario. |
| Cuenta por pagar a Orden Global | se anota | se anota igual (con el hash de la liberación). Ver «Pendiente». |

La guarda atómica `esperando → entregando` no cambia: una orden se procesa una
vez.

### La referencia del pago (`paymentRef`)

```
canónica   = "SFSP410/v1|ordenex|compra-usdt|<_id de la OrdenCompra>"
paymentRef = keccak256(utf8(canónica))
```

Una por orden, determinista y nunca reusada (el `_id` de Mongo no se recicla).
La cadena la gasta: un segundo intento con la misma orden revierte con
`OperationReplay`, y el adaptador lo trata como **ya entregado**: lee el evento
`NativeReleased` de la primera entrega y anota su hash. Por eso reintentar una
orden (incluso una `en-duda`) es seguro.

`evidenceRoot` = keccak256 del JSON canónico `{cantidadUsdt, destino, orden,
origenWei, precioWei, red, sistema, txDeposito}`.

### Qué pasa cuando la cadena dice que no

| Error del contrato | Orden queda | Motivo empieza por | Se reintenta sola |
|---|---|---|---|
| `OperationReplay` | `entregada` | `SFSP410 · ya estaba entregada…` | — |
| `BudgetPeriodExceeded`, `BudgetOperationTooLarge`, `BudgetNotSet`, `BudgetExpired` | `en-revision` | `SFSP410 · cola de gobierno · <CÓDIGO>` | **No** (sería un bucle contra un cupo vacío) |
| `Paused` | `en-revision` | `SFSP410 · PAUSADO` | No |
| `ReleaseRejected` (destino no elegible), `InsufficientVaultBalance`, `Unauthorized` (emisor sin rol), configuración, red caída antes de firmar | `en-revision` | `SFSP410 · …` | No |
| `ReleaseToInternalAccount` | `fallida` | `SFSP410 · DESTINO_INTERNO` | No |
| firmada sin respuesta | `en-duda` | `SFSP410 · EN_DUDA` | No (pero reintentarla es seguro) |

Una orden parada por SFSP-410 vuelve a la fila con
`POST /admin/sfsp410/reintentar/:id` (cuando gobierno amplió el cupo, empezó el
periodo siguiente o se levantó la pausa). Sólo acepta órdenes cuyo motivo
empieza por `SFSP410`.

`GET /admin/sfsp410` (con `X-Admin-Key`) enseña: interruptor, direcciones
configuradas, si la llave del emisor está puesta (**nunca** su valor), cupo
restante y las órdenes paradas.

## Variables de entorno (sólo nombres)

| Variable | Obligatoria con el interruptor encendido | Qué es |
|---|---|---|
| `SFSP410_EMISION` | — | `1` enciende. Cualquier otra cosa, apagado. Se lee en cada operación. |
| `SFSP410_VAULT_ADDRESS` | sí | Dirección de `SFSPNativeVault` en la 5550. |
| `SFSP410_ISSUER_KEY` | sí | Llave de servicio con rol `ISSUER` en la bóveda (y en el emisor de tokens). Se lee al firmar, nunca se escribe en logs. Destino final: KMS/multifirma (D27). |
| `SFSP410_ISSUER_ADDRESS` | recomendada | Dirección esperada de esa llave: si no coincide, no se firma. |
| `SFSP410_CHAIN_ID` | no (5550) | Si la RPC no es esta cadena, no se firma nada. |
| `SFSP410_RPC` | no | RPC; por omisión `OG_CHAIN_PROVIDER`. |
| `SFSP410_ISSUANCE_ADDRESS` | sólo para tokens | `SFSPIssuanceController` (`emitirToken`). |
| `SFSP410_ASSET_IDS` | sólo para tokens | JSON `{"AUKA":"0x…32 bytes", …}`. |
| `SFSP410_DESDE_BLOQUE` | no (0) | Bloque desde el que se buscan eventos al resolver un «ya entregado». |

`ORDENEX_HOT_KEY` sigue haciendo falta para todo lo demás (retiros de USDT,
barrido); con el interruptor encendido simplemente deja de entregar ORIGEN.

## Antes de encender (en cadena, fuera de este repo)

1. Bóveda desplegada y con el ORIGEN interno consolidado (SFSP-410 §7 paso 4, D23/D25).
2. Cupo de liberación aprobado (`SET_RELEASE_BUDGET`, quórum + timelock, D24).
3. Rol `ISSUER` de la bóveda a la dirección de `SFSP410_ISSUER_KEY`.
4. Cuentas internas declaradas en la bóveda, incluida la billetera de entregas
   `0xDE23eb4E6318E6C0660D3EEB616538926a8Dd4A2` (`lib/billeteras.js · ORIGEN`)
   mientras le quede saldo.
5. **Los destinos tienen que ser elegibles** en el motor de elegibilidad
   (`ReleaseRejected` si no). Cada dirección de Veta Wallet que compre tiene que
   estar dada de alta en `SFSPIdentityAdapter`. Sin esto, todas las entregas
   quedan en revisión.
6. `GET /admin/sfsp410` con todo en verde y cupo > 0.

## Encender / apagar

- Encender: `heroku config:set SFSP410_EMISION=1` (con las variables de arriba ya puestas).
- Apagar: `heroku config:unset SFSP410_EMISION`. Surte efecto en la siguiente
  operación, sin reiniciar.

## Rollback

Apagar el interruptor devuelve **al instante** al camino de la caliente para las
órdenes nuevas y las que estén en `esperando`. Cuidado con las paradas por
SFSP-410 (`en-revision`/`en-duda` con motivo `SFSP410`):

- **No** las pases a `esperando` con el interruptor apagado sin mirar antes la
  cadena: si la liberación ya salió, la caliente entregaría otra vez.
  Comprobación: `SFSPNativeVault.isOperationUsed(keccak256("SFSP410/v1|ordenex|compra-usdt|<id>"))`.
  Si es `true`, márcala `entregada` a mano con el hash del evento `NativeReleased`.
- Si es `false`, no salió nada y la puede entregar la caliente.

El código no tiene migraciones: apagar no deja datos a medio convertir.

## Pruebas

`node pruebas/probar-sfsp410.mjs` (incluida en `npm run probar`). Levanta una
cadena local (Hardhat en proceso, chainId 31337, 127.0.0.1), despliega
`SFSPNativeVault` y `SFSPIssuanceController` desde los artefactos compilados de
`sfsp/contracts` con un cupo de prueba, y comprueba: apagado = camino viejo;
encendido = `releaseOnDemand` con la `paymentRef` correcta; repetición = ya
entregado; cupo agotado = cola de gobierno sin bucle; pausa; destino interno
rechazado; `emitirToken`; la llave nunca en un error; no firma en otra cadena.
Necesita `sfsp/contracts/node_modules` (si falta, la prueba lo dice y sale sin probar).

## Pendiente (no está en este cambio)

- `lib/venta.js` (venta de ORIGEN por USDT): el ORIGEN que la persona vende
  sigue quedando en la casa. Con SFSP-410 debería reabsorberse
  (`sfsp410.devolverOrigen`); requiere decidir qué dirección firma el `absorb`.
- La cuenta por pagar a Orden Global se sigue anotando: con la bóveda, decidir
  si Ordenex le sigue «comprando» el ORIGEN a Orden Global (D23).
- La emisión de tokens SFSP (`emitirToken`) está lista en el adaptador pero
  ningún flujo de Ordenex la usa todavía.
