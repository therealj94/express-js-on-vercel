# migracion-410 · Padrón de migración a los tokens SFSP y lote de ORIGEN

Herramientas del equipo B para SFSP-410 (política de suministro) y SFSP-700
(migración). **Este directorio contiene sólo código.** Los datos que produce
(direcciones y saldos de personas) se escriben **fuera del repositorio**, en la
carpeta de salida (`SALIDA`, por defecto el scratchpad `equipo-b/`), y no se
versionan: el repositorio es público.

Nada de lo que hay aquí firma ni envía transacciones. El cliente RPC
(`lib/comun.mjs`) sólo admite métodos de lectura (`eth_call`, `eth_getBalance`,
`eth_getStorageAt`, `eth_getLogs`, …) y rechaza cualquier otro antes de salir.

## Archivos

| Archivo | Qué hace |
|---|---|
| `construir-padron.mjs` | Padrón por activo (ONDK, AUKA, IBS, HARV): beneficiarios, árbol de Merkle, pruebas, pendientes, excluidos, conflictos y reserva por ranura. |
| `verificar-padron.mjs` | Verificación independiente, sin red, de los padrones ya construidos. |
| `lote-origen-ondk.mjs` | Lote «todo tenedor de ONDK con dirección llega a ≥ 1 ORIGEN», sin firmar, en dos formatos. `--simular` lo ejecuta en hardhat local. |
| `simular-lote-origen.cjs` | Simulacro del lote en la cadena hardhat en memoria (chainId 31337). |
| `lib/comun.mjs` | RPC de sólo lectura, Merkle idéntico al contrato, ids, lector xlsx mínimo, CSV. |
| `lib/clasificacion.mjs` | Cuentas internas / de Orden Global / contratos y direcciones citadas en archivos de prueba, derivadas de los datos de entrada. |
| `../contracts/test/18-migracion-padron.js` | Prueba (datos sintéticos) de que el registro acepta el formato del constructor y rechaza a quien no está. |

## Entradas (fuera del repositorio, sólo lectura)

| Variable | Contenido |
|---|---|
| `TENEDORES` | Foto clasificada de tenedores de todos los activos (`tenedores-clasificados.json`). |
| `CENSO_ONDK` | Censo completo de ONDK por árbol de almacenamiento (`censo-ondk.json`). |
| `ACEPTACION` | Hoja de aceptación (`Padron-Suministro-5550.xlsx`): «Usuarios (se conservan)», «En revisión» (columna ¿Conservar? SÍ/NO), «Se elimina». |
| `SALIDA` | Carpeta de salida de datos. |
| `RPC` | Nodo de la 5550 (lectura). Detrás del proxy del entorno: `NODE_USE_ENV_PROXY=1`. |

## Reconstruir

```bash
cd sfsp/migracion-410
export NODE_USE_ENV_PROXY=1
BLOQUE_CORTE=<bloque> node construir-padron.mjs   # padron-<ACTIVO>.json/.csv + raices-merkle.json
node verificar-padron.mjs                          # recalcula hojas, raíces, pruebas y S0
node lote-origen-ondk.mjs --simular                # lote-origen-ondk.* + simulacion-lote-origen.json
cd ../contracts && npx hardhat test                # incluye 18-migracion-padron.js
```

`--sin-red` en `construir-padron.mjs` usa los saldos de las entradas en lugar de
releerlos (útil para revisar sin nodo; la raíz sólo vale si coincide con la del
bloque de corte).

## Reglas del padrón

1. **Beneficiario** = fila de «Usuarios (se conservan)» del activo + fila de «En
   revisión» marcada **SÍ**. Una celda vacía es **pendiente**: no entra en el árbol
   y se lista aparte para decisión. **NO** la descarta.
2. Se **excluye** toda dirección que cualquier fuente marque como interna o de la
   organización, en cualquier activo: `OPERACION_INTERNA`, `DESCONOCIDO_GRANDE`
   (van a «Se elimina»), `INTERNA-OrdenGlobal` del censo, contratos, y cualquier
   fila de «Se elimina». Una exclusión se informa con su motivo; nunca en silencio.
3. Las unidades son las de **`balanceOf` en el bloque de corte**, en la unidad
   mínima del token (18 decimales), sin redondeo. Un saldo cero sale del árbol.
4. Las direcciones citadas en archivos de prueba del repositorio se **marcan**.
5. Si el censo de ONDK (más reciente) y la hoja no coinciden sobre una dirección,
   se informa como **conflicto** y la dirección no entra.

## Formato del árbol (idéntico a `SFSPMigrationRegistry`)

```
hoja  = keccak256(abi.encode(bytes32 migrationId, address beneficiary, uint256 oldUnits))   // leafOf()
nodo  = keccak256(abi.encodePacked(min(a,b), max(a,b)))                                     // _verifyProof()
```

- Hojas ordenadas de forma ascendente por su valor, así que la raíz no depende del
  orden de las filas. Un nodo impar sube sin duplicarse, igual que
  `test/helpers.js · merkleTree`. Un padrón de una persona tiene raíz = hoja y
  prueba vacía.
- `migrationId`: texto `mig_` + 32 hex (CONTRATO-INTERNO §1). Se deriva de forma
  determinista de la red, el contrato de origen, el bloque de corte y el activo, y
  su `bytes32` es `keccak256(utf8(texto))`, porque el texto no cabe en 32 bytes. Se
  puede fijar con `MIG_ID_<ACTIVO>`. **La raíz depende del `migrationId` y del
  bloque de corte.** Hasta que la Junta fije los dos (D09), cada raíz es una
  propuesta.
- `S0` para `openMigration` = suma de `oldUnits` del árbol. La reserva no está
  incluida.

## Las ranuras sin dirección: reserva de reclamo

Algunos saldos del génesis sólo se conocen por su **ranura** de almacenamiento
(`ranura:R`, con `R = keccak256(abi.encode(dirección, uint256(0)))`, el mapping de
saldos en la ranura 0). Otros sólo por su **huella**, la clave del trie
(`huella:H`, con `H = keccak256(R)`).

**Qué admite el contrato tal cual.** `SFSPMigrationRegistry` no puede pagar a una
ranura:

- la hoja exige una **dirección** de beneficiario y el claim acuña a esa
  dirección, así que no hay forma de probar en cadena que una dirección es la
  preimagen de `R`;
- la raíz de una migración es **inmutable** (no hay `setRoot`);
- sólo puede haber **una migración abierta por activo de origen**
  (`SourceAlreadyMigrating`).

A cambio, los **nullifiers son globales** por (activo de origen, titular) y
sobreviven al cierre. Eso permite una **segunda raíz diferida** sin tocar el
contrato.

**Diseño mínimo propuesto.**

1. En el padrón, cada ranura o huella con saldo va a la **reserva de reclamo**,
   con su propia raíz (compromiso público):
   `keccak256(abi.encode(ETIQUETA, migrationId, tipo, clave, oldUnits))`, donde
   tipo 0 es ranura y 1 es huella. Esa raíz **no** se usa en `openMigration`; sirve
   para fijar de antemano qué se reservó, por cuánto, y que nadie lo cambie
   después.
2. Cuando alguien reclama una clave, se comprueban **tres** cosas fuera de cadena:
   - que `keccak256(abi.encode(A, 0)) == R`, o su keccak `== H` si es una huella.
     Un permiso (allowance) nunca pasa esta regla;
   - que A controla la dirección, con una firma sobre un mensaje con la clave;
   - que A tiene identidad (P9a / Genesis ID).
3. Periódicamente, por rondas:
   - se **cierra** la migración vigente (`closeMigration`, que no extingue
     derechos);
   - se **abre** otra sobre el mismo origen, con una raíz que incluye todo lo no
     reclamado más las claves resueltas, ya con su dirección.

   Quien ya reclamó y reaparece en la raíz nueva no puede cobrar dos veces, porque
   el claim revierte con `NullifierUsed`. La conciliación S0 = A + N + P es **por
   migración**: la conciliación total del activo suma las rondas fuera de cadena.

Esto lo prueba `18-migracion-padron.js` con datos sintéticos.

Una misma ranura aparece en varios activos cuando dos tokens usan el mapping en
la ranura 0. En ese caso, una sola prueba de dirección resuelve la reserva en
todos.

## Lote de ORIGEN

- Tenedores de ONDK con dirección conocida: los del censo, más los receptores de
  `Transfer` posteriores al censo. Todo se relee en vivo: ONDK, ORIGEN y
  `eth_getCode`.
- `faltante = max(0, 1 ORIGEN − saldo)`. Se excluyen las cuentas internas y los
  contratos. Se marcan las direcciones citadas en pruebas y su estado en la hoja.
- **Firme** = usuario confirmado en la hoja de ONDK y sin marca de prueba. El
  resto requiere decisión.
- **Formato A** (`*.tx-sin-firmar.json`): transferencias nativas sin firmar, con
  `from` y `nonce` vacíos. Sólo sirven para la transición, porque SFSP-410 §4 manda
  liberar desde la bóveda.
- **Formato B** (`*.releaseOnDemand.json`): calldata de
  `SFSPNativeVault.releaseOnDemand(destino, monto, paymentRef, evidenceRoot)`.
  - `paymentRef` es único por destino y lote.
  - `evidenceRoot` es la raíz del lote,
    `keccak256(abi.encode(ETIQUETA_LOTE, destino, monto))`.
  - Requisitos:
    - bóveda desplegada;
    - cupo `SET_RELEASE_BUDGET` con `perPeriod ≥ total` y `maxPerOperation ≥` el
      mayor envío;
    - llave ISSUER;
    - cada destino elegible (identidad).
- El **simulacro** ejecuta el calldata exacto del formato B en hardhat local y
  comprueba cuatro cosas:
  - todos quedan en ≥ 1 ORIGEN;
  - la bóveda baja exactamente el total;
  - repetir un `paymentRef` revierte;
  - pagar a una cuenta interna revierte.

## Hallazgos sobre los contratos (sin cambios en `.sol`)

1. **Los contratos heredados no son `IMigratableAsset`.** `openMigration` llama a
   `oldAsset.assetId()`, y los ERC-20 heredados no tienen esa función (la lectura
   revierte). Tampoco tienen `burnForMigration`. Por eso:
   - `SURRENDER_ON_CLAIM` es imposible con ellos;
   - `FROZEN_SNAPSHOT` necesita un **adaptador** nuevo que exponga
     `assetId()`/`balanceOf()` del heredado, registrado en `SFSPAssetRegistry` con
     `declarePermanentExclusion` y eje de transferibilidad `FROZEN`, además del
     bloqueo por filtro de transacciones (SFSP-700 §0.3).
2. **Cada claim exige su propia orden `MIGRATION_CLAIM`** (dos aprobaciones), la
   firma de un ATTESTOR y un nonce. No hay aprobación por lote: un padrón de N
   personas son N órdenes de gobierno.
3. **`mintForMigration` evalúa la elegibilidad del beneficiario.** Sin alta de
   identidad (P9a), el claim revierte aunque la prueba sea válida.
4. **Decimales.** Si el activo SFSP nuevo no usa 18 decimales, el ratio lo decide
   D09 y el resto va a `ResidualEntitlementRecorded`. La hoja compromete
   `oldUnits`, no el ratio, así que la raíz no cambia con el ratio.
