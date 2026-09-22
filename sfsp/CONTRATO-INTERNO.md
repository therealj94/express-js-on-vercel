# Contrato interno de SFSP

Fuente única de tipos, identificadores, estados, eventos y códigos de error que
comparten la especificación (`spec/`), el SDK (`sdk/`), los contratos
(`contracts/`), el indexador (`indexer/`) y la API de DBNX (`dbnx-api/`).

Si una pieza necesita un campo que no está aquí, se añade **aquí primero**. Dos
piezas nunca definen el mismo concepto por su cuenta.

Versión del contrato: `draft-0.3`. Toda estructura firmada lleva `schemaVersion`.

---

## 1 · Identificadores

| Identificador | Forma | Regla |
|---|---|---|
| `accountId` | `acc_` + 32 hex | Aleatorio CSPRNG. Interno. Nunca deriva de datos personales. |
| `accountNumber` | `SF-XXXX-XXXX-XXXX-C` | 12 dígitos CSPRNG + dígito de control. Público, inmutable, no reciclable. |
| `alias` | `@` + 3–30 car. | Opcional. Normalizado. No autentica, no titula. |
| `bindingId` | `bnd_` + 32 hex | Una ruta técnica de una cuenta hacia una dirección en una red. |
| `assetId` | `SFSP:<CLASE>:<EMISOR>:<SERIE>` | Estable. No depende de la clasificación jurídica, que puede cambiar. |
| `issuerId` | `iss_` + 32 hex | Emisor en el registro. Se vincula a un Genesis ID corporativo por referencia privada. |
| `caseId` | `case_` + 32 hex | Expediente de admisión DBNX. |
| `authorizationId` | `auth_` + 32 hex | Autorización firmada con alcance, monto, vigencia y nonce. |
| `operationId` | `op_` + 32 hex | Unidad de idempotencia de toda escritura sensible. |
| `migrationId` | `mig_` + 32 hex | Un reemplazo técnico de un activo por otro. |
| `evidenceId` | `ev_` + 32 hex | Registro de evidencia. |
| `reserveAssetId` | `res_` + 32 hex | Un activo de reserva en el expediente. |
| `lotId` | `lot_` + 32 hex | Un lote físico de metal. |

`SF-XXXX-XXXX-XXXX-C` se valida con el algoritmo de `spec/SFSP-130`. El dígito de
control es **Luhn sobre los 12 dígitos**, congelado en draft-0.3 y sujeto a prueba
T58 antes de producción.

Clases de `assetId`: `SEC`, `COM`, `MON`, `UTIL`, `LEGACY`. La clase del
identificador es un espacio de nombres, **no** una clasificación jurídica: ésa vive
en `legalClass` del pasaporte y la fija D08.

---

## 2 · Tipos compartidos

### 2.1 Cuenta, alias, binding

```ts
type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
type CustodyProfile = 'MANAGED' | 'PERSONAL' | 'INSTITUTIONAL';

interface SFSPAccount {
  accountId: string;
  accountNumber: string;
  status: AccountStatus;
  createdAt: string;            // ISO 8601 UTC
  genesisSubjectRef: string;    // referencia opaca; NUNCA se publica en el ledger
  custodyProfile: CustodyProfile;
  primaryBindingId: string | null;
  policyVersion: string;
}

type BindingStatus =
  | 'PENDING' | 'ACTIVE' | 'PRIMARY' | 'SUSPENDED' | 'REVOKED' | 'RECOVERY_PENDING';

interface WalletBinding {
  bindingId: string;
  accountId: string;
  chainId: number;
  address: string;              // checksum EIP-55
  purpose: 'PAYMENTS' | 'CUSTODY' | 'SETTLEMENT' | 'INTEROP';
  status: BindingStatus;
  custodyProfile: CustodyProfile;
  validFrom: string;
  validUntil: string | null;
  version: number;              // sube en cada cambio; el historial es inmutable
}

interface AliasRecord {
  alias: string;                // forma mostrada, con @
  normalized: string;           // forma canónica de unicidad
  skeleton: string;             // forma anti-confusables
  accountId: string;
  status: 'ACTIVE' | 'RELEASED' | 'RESERVED' | 'DISPUTED';
  createdAt: string;
  releasedAt: string | null;
}
```

Reglas invariables:

- Cambiar alias **no** cambia `accountNumber` (T61).
- Cambiar binding **no** cambia `accountNumber` (T62).
- Un binding vencido o revocado **no** resuelve (T63).
- `rebind` **no** mueve activos legacy (T64).

### 2.2 Recuperación

```ts
type RecoveryCapability =
  | 'ACCESS_ONLY'             // se recupera la sesión, no el control de la llave
  | 'CUSTODIAL_KEY_RECOVERY'  // el custodio conserva control de la llave
  | 'CONTRACT_RECOVERY'       // el contrato del activo permite recuperación reglada
  | 'ADMIN_FORCED_TRANSFER'   // existe poder administrativo y está documentado
  | 'NONE';                   // no hay ruta técnica: la interfaz no promete nada
```

La capacidad se resuelve por **(activo, perfil de custodia)**, no por uno solo de
los dos. `PERSONAL` + activo legacy sin poderes = `NONE`, y así se muestra (T65).
Recuperar acceso en `MANAGED` nunca exporta la semilla (T66).

### 2.3 Pasaporte de activo

```ts
type ImplementationProfile = 'LEGACY_REGISTERED' | 'SFSP_ENFORCED' | 'CUSTODIAL_ACCOUNTING';
type AssetKind = 'NATIVE' | 'CONTRACT' | 'OFFCHAIN_RECORD';

interface AssetPassport {
  assetId: string;
  issuerId: string;
  legalInstrumentId: string | null;
  economicType: string;               // p.ej. EQUITY, DEBT, REVENUE_SHARE, METAL, MONETARY
  legalClass: string | null;          // lo fija D08; null = sin clasificar
  jurisdiction: string | null;
  implementationProfile: ImplementationProfile;
  enforcementScope: EnforcementScope;
  assetKind: AssetKind;
  settlementLocation: { chainId: number; address: string | null; codehash: string | null };
  unit: string;
  decimals: number | null;            // null = desconocido; NUNCA se sustituye por 18
  capabilities: string[];
  rightsTemplate: { id: string; version: string } | null;
  documentRoot: string | null;
  reportStatus: 'CURRENT' | 'DUE' | 'LATE' | 'WARNING' | 'NONE';
  riskStatus: { level: 'R1'|'R2'|'R3'|'R4'|'R5'|'SIN_EVALUAR'; methodologyVersion: string|null; evaluatedAt: string|null };
  transferPolicyId: string | null;
  redemptionPolicyId: string | null;
  listingPolicyId: string | null;
  supplySource: 'CHAIN_TOTALSUPPLY' | 'REGISTRY' | 'CUSTODIAL_LEDGER' | 'UNKNOWN';
  aliases: string[];                  // identificadores previos conservados
  status: AssetLifecycle;
}

interface EnforcementScope {
  transferRestrictions: boolean;      // ¿el contrato las impone de verdad?
  freeze: boolean;
  forcedTransfer: boolean;
  pause: boolean;
  directTransferBypass: boolean;      // true en legacy ERC-20: transfer() no pasa por SFSP
  notes: string;
}
```

`AssetLifecycle` **no es un booleano**. Los cinco ejes son independientes:

```ts
interface AssetLifecycle {
  legal: 'UNCLASSIFIED' | 'UNDER_REVIEW' | 'CLASSIFIED' | 'RESTRICTED_BY_LAW';
  admission: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  trading: 'NOT_LISTED' | 'LISTED' | 'SUSPENDED' | 'DELISTED';
  transferability: 'FREE' | 'RESTRICTED' | 'FROZEN';
  redemption: 'NONE' | 'AVAILABLE' | 'SUSPENDED';
  visibility: 'VISIBLE_TO_HOLDER' | 'HIDDEN_FROM_CATALOG';
}
```

Regla 6 del plan: `trading: 'DELISTED'` jamás implica `visibility: 'HIDDEN'` ni
toca el saldo del titular.

### 2.4 Autorización firmada

```ts
interface SignedAuthorization {
  schemaVersion: string;
  authorizationId: string;
  actionId: string;                 // MINT | RELEASE | RECOVERY | MIGRATION_CLAIM | ...
  chainId: number;
  genesisHash: string | null;
  verifyingContract: string;
  assetId: string;
  amount: string;                   // entero en unidades base, como cadena
  destination: string;
  policyVersion: string;
  evidenceRoot: string;
  nonce: string;
  notBefore: string;
  expiry: string;
  approvals: Approval[];            // firmas humanas y técnicas, separadas por rol
}
```

La aprobación humana y la validación técnica deben coincidir **exactamente** en
este payload. Un JSON con `approved: true` no es una autorización.

### 2.5 Evidencia

```ts
interface EvidenceRecord {
  evidenceId: string; taskId: string; requirementIds: string[]; findingIds: string[];
  sourceSHA: string; artifactDigest: string | null; configVersion: string;
  environment: string; chainId: number | null; genesisHash: string | null;
  blockNumber: number | null; blockHash: string | null;
  testCommand: string; fixtureId: string;
  result: EvidenceState; timestampUTC: string;
  reviewer: string | null; limitations: string; restrictedEvidenceRef: string | null;
}

type EvidenceState =
  | 'DECLARADO' | 'CODIGO_LEIDO' | 'PROBADO_AISLADO'
  | 'VERIFICADO_RUNTIME' | 'NO_VERIFICADO' | 'BLOQUEADO';
```

---

## 3 · Eventos

Nombre, significado y quién los emite. El indexador deduplica por
`(chainId, blockHash, txHash, logIndex)`.

| Evento | Emisor | Significado |
|---|---|---|
| `AssetRegistered` | AssetRegistry | Un `assetId` entra al catálogo con su pasaporte. |
| `PolicyUpdated` | AssetRegistry | Cambia una política; lleva versión anterior y nueva. |
| `SupplyAuthorized` | GovernanceController | DBNX autoriza una capacidad con monto y vigencia. |
| `MintExecuted` | IssuanceController | Se crearon unidades contra una autorización concreta. |
| `BurnExecuted` | RegulatedAsset | Se destruyeron unidades, con motivo. |
| `TreasuryReleased` | CashVault | Salieron unidades de tesorería al circulante. |
| `ReserveAttested` | ReserveEngine | Una reserva recibió evidencia con vigencia. |
| `ReserveExpired` | ReserveEngine | Una reserva perdió vigencia; la capacidad baja. |
| `DisclosurePublished` | AssetRegistry | Hash de un informe con su fecha límite. |
| `RiskChanged` | AssetRegistry | R1–R5 o `SIN_EVALUAR`, con metodología y responsable. |
| `TradeSettled` | SettlementEngine | Liquidación atómica de una ejecución. |
| `RedemptionUpdated` | CommodityEngine | Avance en la máquina de redención. |
| `RecoveryExecuted` | GovernanceController | Recuperación con expediente, sin datos personales. |
| `MigrationClaimed` | MigrationRegistry | Un derecho viejo quedó excluido y uno nuevo emitido. |
| `GovernanceAction` | GovernanceController | Pausa, upgrade, rotación, cambio de quórum. |

`EligibilityEvaluated` **no es un evento**: `evaluate` es de sólo lectura y no
escribe. La auditoría de rechazos vive en el registro operativo, no en la cadena.

---

## 4 · Códigos de resultado

Un rechazo siempre lleva código. Los códigos son estables y se traducen en la
interfaz; nunca se muestra el texto crudo al usuario final.

```
ALLOW                      la acción puede proceder
DENY_POLICY                una política la prohíbe
DENY_ELIGIBILITY           el sujeto no cumple una condición
DENY_JURISDICTION          restricción por jurisdicción
DENY_ASSET_STATE           el estado del activo no la permite
DENY_AUTHORIZATION         falta autorización, está vencida o ya se consumió
DENY_LIMIT                 supera un límite aprobado
REVIEW_REQUIRED            necesita revisión humana antes de decidir
UNKNOWN_SOURCE             no se pudo leer una fuente necesaria (NO es cero, NO es deny)
BLOCKED_DECISION           falta una decisión Dxx: no se elige un valor por defecto
```

`UNKNOWN_SOURCE` nunca se degrada a `ALLOW` ni a saldo cero. Bloquea la decisión
que dependa de esa fuente y deja el resto de la interfaz utilizable.

---

## 5 · Unidades y aritmética

- Toda cantidad viaja como **entero en unidades base**, en `string` o `bigint`.
  Nunca `number`, nunca coma flotante.
- `decimals: null` significa desconocido. Una decisión financiera que dependa de
  `decimals` desconocido devuelve `UNKNOWN_SOURCE`.
- El redondeo se especifica por operación. Los restos de una conversión de ratio
  no se truncan en silencio: van a un registro de fracciones o elevan la precisión
  del entitlement.
- La interfaz puede redondear la **presentación** y siempre da acceso al importe
  exacto.

---

## 6 · Fórmulas normativas

### 6.1 Suministro nativo (SFSP-400)

```
S_native(b) = S_genesis + I_consensus(0..b) - B_protocol(0..b)
R_released  = S_native - U_unactivated
RAC_units   = floor(EligibleReserveUSD / ReferenceUSDperUnit * 10^decimals)
release(x) exige  R_released + x <= min(ReleaseCap, RAC_units)
```

Enviar unidades a una dirección supuestamente inaccesible **no** reduce
`S_native`. Las transferencias entre cuentas no cambian `S_native`. Depositar
unidades de usuarios en tesorería no las vuelve «no emitidas».

### 6.2 Valor elegible de reserva (SFSP-300/400)

```
EligibleValue_i = NetRealizableValue_i
                  × EligibilityFactor_i
                  × (1 - Haircut_i)
                  × ConcentrationFactor_i
```

`NetRealizableValue` no es «onzas × spot». Los tres factores son distintos y no
se duplican entre sí. Todos los porcentajes son `null` hasta D04.

### 6.3 Conciliación de migración (SFSP-700)

```
S0 = A + E          E = N + P          =>   S0 = A + N + P
```

`S0` suministro en alcance · `A` derechos originales no extinguidos ·
`E` derechos excluidos de circulación · `N` unidades nuevas válidas ·
`P` entitlements pendientes correspondientes a derechos ya excluidos.

`E` es **contraparte** de `N + P`, no un tercer sumando de `S0`. Sumar `E + N + P`
es la ecuación equivocada.

### 6.4 Invariante de commodity (SFSP-300)

```
FineOunces_assigned_not_delivered  >=  Tokens_outstanding_backed + PendingDeliveryObligations_burned
```

Las unidades `locked` que siguen en `totalSupply` no se cuentan dos veces. Un lote
reservado para entrega no vuelve a habilitar emisión.

---

## 7 · Perímetro de datos

| Dato | Dónde puede estar | Dónde nunca |
|---|---|---|
| Semilla, llave privada | Custodia (KMS/HSM/MPC) | Código, pruebas, registros, evidencia, CI, staging, documentos |
| Datos personales, biometría, documentos | Genesis ID, bóveda cifrada | Cadena, eventos, índice público, evidencia publicable |
| `genesisSubjectRef` | Directorio privado | Ledger, API pública, QR |
| Vínculo cuenta ↔ dirección | Directorio privado, por propósito | Enumeración pública |
| `accountNumber` | Público, es un destino | — |
| Alias | Público | Como factor de autenticación |

Un `commitment` determinista y global correlaciona personas. Donde haga falta un
compromiso público se usa aleatorización, y se documenta qué se puede inferir.

---

## 8 · Convenciones de código

- TypeScript con `strict`. Salida ESM. Sin dependencias de ejecución en el SDK.
- Pruebas con el corredor incluido de Node (`node:test`), sin marco externo.
- Solidity `0.8.28`, EVM target `paris` (compatible con la configuración Besu
  observada; **no** se asumen opcodes posteriores hasta verificar el nodo real).
- Contratos: `operationId` único, control de autorización y nonce,
  checks-effects-interactions, guarda de reentrada y redondeo especificado.
- Nada de `console.log` en biblioteca. Los mensajes de error llevan código del §4.
- Todo lo que se pueda decidir sin una decisión Dxx se decide; lo demás devuelve
  `BLOCKED_DECISION` y se anota en `DECISIONES-SFSP.json`.
