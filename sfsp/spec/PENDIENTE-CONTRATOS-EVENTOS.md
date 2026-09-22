# Pendiente para `contracts/`: alinear los eventos con `spec/eventos.json`

**Origen:** hallazgo H15 del informe `auditoria-20260922-f1d57a31-codex.md`, lote L5
del plan de corrección.

Este documento existe porque `contracts/` está siendo tocado por otro agente y no
se puede editar desde aquí. Contiene el cambio **exacto** que hay que aplicar allí.
Mientras no se aplique, los contratos emiten algo distinto de lo que el indexador
lee, y la única fuente válida es `spec/eventos.json`.

La compuerta: una vez aplicados estos cambios, el ABI compilado de cada contrato
tiene que coincidir campo a campo, tipo a tipo e `indexed` a `indexed` con
`spec/eventos.json`. La comprobación mecánica está pendiente y pertenece al lote
L3 (los `artifacts/` no se leen desde el indexador).

---

## 1 · Unificar el evento de creación de unidades

**Nombre canónico: `MintExecuted`, emitido por `SFSPIssuanceController`.**

`SFSPRegulatedAsset.sol:20` declara hoy:

```solidity
event UnitsMinted(address indexed to, uint256 amount, bytes32 operationId);
```

**Acción:** retirar `UnitsMinted`. El hecho económico «se crearon unidades» lo
publica una sola vez `SFSPIssuanceController.MintExecuted`, que es el que ya lleva
la autorización consumida y el activo. `SFSPRegulatedAsset` sigue emitiendo el
`Transfer(address(0), to, value)` de ERC-20, que es un evento de token, no de
suministro, y el indexador no lo usa para contar.

**Por qué gana `MintExecuted`:** es el nombre que ya figura en el §3 del contrato
interno, es el que lleva `assetId` y `authorizationId`, y es el único que permite
comprobar que lo acuñado no supera lo autorizado. Dos nombres para el mismo hecho
hacen imposible contar una sola vez.

El nombre `UnitsMinted` queda registrado como alias retirado en
`spec/eventos.json` para poder decodificar logs históricos; no se reutiliza para
otro significado.

## 2 · `BurnExecuted` gana `assetId`

`SFSPRegulatedAsset.sol:17` declara hoy:

```solidity
event BurnExecuted(address indexed from, uint256 amount, bytes32 reasonCode, bytes32 operationId);
```

**Sustituir por:**

```solidity
event BurnExecuted(
    bytes32 indexed assetId,
    address indexed from,
    uint256 amount,
    bytes32 reasonCode,
    bytes32 operationId
);
```

**Por qué:** sin `assetId` el burn no se puede atribuir. El indexador lo
descartaba y el suministro emitido quedaba inflado con apariencia de dato firme:
mint 100 + burn 40 daba 100 «conocido». Ahora un burn sin activo deja el
suministro en `UNKNOWN`, que es correcto pero inútil; lo que corresponde es que
el contrato lo emita con el activo.

## 3 · `TreasuryReleased` gana `assetId`

`SFSPCashVault.sol:13` declara hoy:

```solidity
event TreasuryReleased(address indexed to, uint256 amount, bytes32 reasonCode);
```

**Sustituir por:**

```solidity
event TreasuryReleased(
    bytes32 indexed assetId,
    address indexed to,
    uint256 amount,
    bytes32 reasonCode
);
```

**Por qué:** mismo motivo. Un release sin activo no se puede imputar al
circulante de ningún activo concreto.

## 4 · `MigrationClaimed` nombra los dos activos

`SFSPMigrationRegistry.sol:34` declara hoy `migrationId`, `beneficiary`,
`oldUnits`, `newUnits`, `residualNumerator` y `nullifier`. Falta decir **de qué
activo a qué activo**.

**Sustituir por:**

```solidity
event MigrationClaimed(
    bytes32 indexed migrationId,
    address indexed beneficiary,
    bytes32 indexed assetIdAnterior,
    bytes32 assetIdNuevo,
    uint256 oldUnits,
    uint256 newUnits,
    bytes32 nullifier
);
```

`residualNumerator` no se pierde: sigue publicándose en
`ResidualEntitlementRecorded`, que ya lleva numerador y denominador juntos, que es
la única forma de leer una fracción sin inventar el denominador.

## 5 · Eventos del §3 todavía sin contrato

`ReserveAttested`, `ReserveExpired` (emisor `ReserveEngine`) y
`RedemptionUpdated` (emisor `CommodityEngine`) están en el §3 del contrato interno
y en `spec/eventos.json`, con `implementadoEnContratos: false`. No existe contrato
que los emita. Cuando se escriban, la firma tiene que ser exactamente la del JSON,
incluidos `assetId` obligatorio e indexado.

## 6 · Eventos que los contratos emiten y el §3 no lista

Estos **no** son eventos del contrato interno y el indexador los conserva crudos,
que es lo correcto. Hay que decidir, en el lote L3, si alguno asciende al §3:

| Evento | Contrato |
|---|---|
| `LifecycleUpdated` | `SFSPAssetRegistry` |
| `MigrationOpened`, `MigrationClosed`, `ResidualEntitlementRecorded` | `SFSPMigrationRegistry` |
| `InstrumentLimitsSet`, `IssuanceReserveOpened`, `IssuanceReserveClosed` | `SFSPIssuanceController` |
| `CashDeposited`, `CashReserved`, `CashReserveConsumed`, `CashReserveReleased`, `SettlementEngineSet` | `SFSPCashVault` |
| `PolicyConfigured`, `JurisdictionAllowed`, `SubjectBlocked` | `SFSPEligibilityEngine` |
| `FeeParameterSet`, `FeeParameterCleared` | `SFSPFeeController` |
| `AttestationRecorded`, `AttestationRevoked`, `SubjectRefBound` | `SFSPIdentityAdapter` |
| `UnitsTransferred`, `AccountFrozen`, `ForcedTransferExecuted`, `InteropAdapterDeclared` | `SFSPRegulatedAsset` |
| `RoleGranted`, `RoleRevoked` | `SFSPAccessControl` |

`LifecycleUpdated` es el candidato más claro: sin él no se pueden reconstruir los
cinco ejes de `AssetLifecycle`. Se propone subirlo al §3 con
`assetId` indexado, y añadirlo a `spec/eventos.json` en el mismo cambio.

## 7 · Orden de aplicación

1. Cambiar las firmas en Solidity (puntos 1 a 4).
2. Actualizar las pruebas de contratos que esperan las firmas viejas.
3. Comprobar contra `spec/eventos.json`: nombre, orden de campos, tipos y
   `indexed`.
4. No hace falta tocar el indexador: se regenera con `npm run generar:esquema` y
   su prueba `esquema.test.ts` falla si el JSON y el decodificador divergen.
