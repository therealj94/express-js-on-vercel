# SFSP-410 en Veta Wallet · el ORIGEN en cadena, no en la base

Política: `sfsp/spec/SFSP-410-SUPPLY-POLICY.md` («el circulante es lo que tienen
los usuarios», §4 y §7 paso 2). Estado: **código listo, interruptor APAGADO**.

## Qué cambia

Con el interruptor **apagado** (`SFSP410_EMISION` sin poner o distinto de `1`)
todo sigue igual: el depósito de USDT sube el saldo interno
(`OrigenBalance.origen`, sólo en Mongo) y la recarga de la tarjeta manda el
ORIGEN a `TREASURY_OG_ADDRESS`.

Con el interruptor **encendido** (`SFSP410_EMISION=1`):

| Flujo | Antes | Con SFSP-410 |
|---|---|---|
| Depósito USDT confirmado (`controller/depositController.js`) | `$inc` de `OrigenBalance.origen` | La marca de agua avanza igual, **sin** tocar el saldo interno; se escribe una `EntregaOrigen` y se llama a `SFSPNativeVault.releaseOnDemand` a **`user.address`** (la dirección propia del usuario en la 5550). La respuesta de `/wallet/deposit-info` y `/wallet/deposit/check` añade `entrega: {estado, origenWei, hash, mensaje}` (sólo encendido). |
| Recarga de tarjeta, camino en cadena (`controller/swapController.js`) | envío nativo del usuario a `TREASURY_OG_ADDRESS` | `absorb(RECARGA_TARJETA)` en la bóveda, firmado por el usuario (`lib/sfsp410.js · devolverOrigen`). El resto (confirmar, liberar USDT) no cambia. |
| Recarga de tarjeta con saldo interno | debita `OrigenBalance` | **igual** (es saldo heredado: debería estar liquidado antes de encender, ver Conciliación). |

### La entrega (`models/EntregaOrigen.js`, colección `sfsp410Entregas`)

Una por depósito, escrita **antes** de firmar. Orden: candado de la marca de
agua → `EntregaOrigen` (`pendiente`) → `Deposit` → intento. Si la entrega no se
puede anotar, se deshace el candado.

```
canónica   = "SFSP410/v1|veta|deposito-usdt|<_id del Deposit>"
paymentRef = keccak256(utf8(canónica))
```

El `_id` del `Deposit` nace en ese momento y no se repite. **No** se usa el rango
de la marca de agua: puede repetirse si el USDT sale y vuelve a entrar.
`OperationReplay` = ya entregado (se lee el evento y se anota el hash), así que
reintentar es seguro.

Cantidad: `origenWei = usdtWei·10¹² ·10¹⁸ / precioWei`, con `precioWei` =
precio de `lib/origenPrice.js` en nanodólares ·10⁹. Trunca: nunca de más.

| Estado | Qué significa | Reintento automático |
|---|---|---|
| `entregada` | salió (o ya había salido: `codigo = YA_ENTREGADO`) | — |
| `pendiente` | no se llegó a firmar (red, configuración) | sí, en la siguiente revisión del usuario, espaciado (`SFSP410_REINTENTO_MS`, 60 s) |
| `en-duda` | firmada sin respuesta | sí (seguro por la referencia) |
| `esperar` | gobierno en pausa | sí, espaciado |
| `cola-gobierno` | cupo agotado / vencido / sin fijar / sobre el máximo por operación | **no**: vuelve a la fila con `reencolar(id)` (`lib/entregaOrigen.js`) cuando gobierno lo resuelva |
| `rechazada` | destino es cuenta interna (`ReleaseToInternalAccount`) | no |
| `revisar` | destino no elegible, bóveda sin saldo, emisor sin rol… | no |

## Variables de entorno (sólo nombres)

| Variable | Obligatoria encendido | Qué es |
|---|---|---|
| `SFSP410_EMISION` | — | `1` enciende; cualquier otra cosa, apagado. Se lee en cada operación. |
| `SFSP410_VAULT_ADDRESS` | sí | `SFSPNativeVault` en la 5550. Sustituye a `TREASURY_OG_ADDRESS` en la recarga. |
| `SFSP410_ISSUER_KEY` | sí | Llave de servicio con rol `ISSUER` en la bóveda. Se lee al firmar; nunca se escribe. |
| `SFSP410_ISSUER_ADDRESS` | recomendada | Dirección esperada de esa llave. |
| `SFSP410_CHAIN_ID` | no (5550) | Si la RPC no es esta cadena, no se firma. |
| `SFSP410_RPC` | no | Por omisión `OG_CHAIN_PROVIDER`. |
| `SFSP410_REINTENTO_MS` | no (60000) | Espacio entre reintentos automáticos de una entrega. |
| `SFSP410_DESDE_BLOQUE` | no (0) | Desde dónde se buscan eventos al resolver un «ya entregado». |
| `SFSP410_ISSUANCE_ADDRESS`, `SFSP410_ASSET_IDS` | no | Sólo para `emitirToken` (tokens SFSP); Veta no lo usa hoy. |

`TREASURY_POLYGON_PRIVATE_KEY` sigue haciendo falta (paga el USDT de la tarjeta).

## Antes de encender

1. **Conciliar el ORIGEN interno** (SFSP-410 §7 paso 2): nadie puede tener saldo
   en `OrigenBalance` sin contrapartida en cadena cuando se encienda.
   ```
   CONCILIAR_MONGODB_URI=<usuario de SOLO LECTURA> node scripts/conciliar-origen-interno.js [--json] [--con-cadena]
   ```
   Sólo lectura (sin modo de escritura; conectar no crea ni índices). Imprime
   `userId`, `address` y cifras; ningún otro dato personal. Liquidar lo que liste
   es una decisión aparte (liberación por usuario con orden de gobierno).
2. Bóveda desplegada, cupo `SET_RELEASE_BUDGET` aprobado, rol `ISSUER` para la
   llave, cuentas internas declaradas (incluido `TREASURY_OG_ADDRESS`).
3. **Destinos elegibles**: cada `user.address` tiene que estar dado de alta en
   `SFSPIdentityAdapter`; si no, `ReleaseRejected` y la entrega queda en `revisar`.
4. **Precio** (resuelto 26-sep-2026, decisión de la dirección): 1 ORIGEN = gramo de oro / 55,
   igual que Ordenex, y es el modo por omisión de `lib/origenPrice.js`. Los 0,01 USD son la
   **comisión** por transacción (`OG_COMISION_USD=0.01`, `lib/comision.js`), no el precio.

## Revisión del 26-sep (REV-410-06)

La entrega espera el minado (`{ esperar: true }`): 'entregada' ya significa
minada con éxito, no sólo enviada. La petición de `/wallet/deposit` tarda un
bloque más; pasado el plazo queda `en-duda` y se reintenta sola. Una
transacción revertida al minar vuelve a `pendiente` (si la referencia ya estaba
gastada por otro intento, se da por entregada leyendo el evento).

## Encender / apagar / rollback

- Encender: `heroku config:set SFSP410_EMISION=1`.
- Apagar: `heroku config:unset SFSP410_EMISION`. Inmediato: los depósitos
  nuevos vuelven a subir el saldo interno y la recarga vuelve a
  `TREASURY_OG_ADDRESS`.
- Tras apagar, las `EntregaOrigen` no entregadas se quedan quietas (sólo se
  reintentan encendido). **No** las conviertas en saldo interno sin comprobar en
  la cadena `isOperationUsed(paymentRef)`: si es `true`, el ORIGEN ya salió.

## Pruebas

`node pruebas/probar-sfsp410.mjs` (entra en `npm run probar`). Cadena local
(Hardhat en proceso, 127.0.0.1, chainId 31337) con la bóveda de verdad desde los
artefactos de `sfsp/contracts`; controladores de verdad con dobles para Mongo,
sesión y Polygon. Comprueba: apagado = saldo interno y treasury de siempre;
encendido = `releaseOnDemand` con la referencia correcta y `absorb` en la
recarga; repetición = ya entregado; cupo agotado = cola sin bucle; destino
interno rechazado; y que la conciliación es de sólo lectura.

## Pendiente

- Una ruta de operación para listar/reencolar `cola-gobierno` (hoy: `reencolar(id)` de `lib/entregaOrigen.js`).
- Con el interruptor encendido, la recarga con saldo interno heredado sigue funcionando; se apaga sola cuando la conciliación deje los saldos en cero.
