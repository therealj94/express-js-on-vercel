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
| `attestationId` | `att_` + 32 hex | Una attestation de identidad, por propósito y audiencia. |
| `policyId` | `pol_` + 32 hex | Una política concreta referida por `transferPolicyId`, `redemptionPolicyId` o `listingPolicyId`. |
| `releaseId` | `rel_` + 32 hex | Una liberación de tesorería al circulante. |
| `obligationId` | `obl_` + 32 hex | Una obligación de entrega exigible tras una quema. |
| `entitlementId` | `ent_` + 32 hex | Un derecho pendiente nacido de una corporate action o de una migración. |
| `disclosureAccessId` | `dac_` + 32 hex | Una concesión de acceso ampliado a información, con propósito y período. |
| `runbookId` | `rb_` + 32 hex | Un procedimiento operativo de `runbooks/`. |

`SF-XXXX-XXXX-XXXX-C` se valida con el algoritmo de `spec/SFSP-130`. El dígito de
control es **Luhn sobre los 12 dígitos**, congelado en draft-0.3 y sujeto a prueba
T58 antes de producción.

Los siete identificadores del bloque inferior entraron en la integración de las
propuestas de `spec/` (punto C01): estaban siendo referidos por los documentos sin
forma declarada, que es exactamente la deriva que este archivo existe para evitar.

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

### 2.6 Identidad y attestations (SFSP-110)

Hasta draft-0.3 el §7 fijaba el perímetro del dato de identidad pero no la
estructura que lo transporta, así que cada pieza se la inventaba. Aquí está.

```ts
type AttestationStatus = 'VALID' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';

interface SFSPAttestation {
  schemaVersion: string;
  attestationId: string;
  subjectRef: string;          // referencia OPACA; nunca datos personales (§7)
  purpose: string;             // una attestation vale para un propósito, no para todos
  audience: string;            // quién puede consumirla
  policyVersion: string;
  notBefore: string;
  expiry: string;
  status: AttestationStatus;
  issuerId: string;
  signature: string;
}
```

`VALID` es el único estado que habilita. `EXPIRED` se deriva del reloj y no
necesita acto administrativo; `SUSPENDED` y `REVOKED` sí, y sólo la autoridad
emisora puede declararlos. Una attestation ausente o ilegible es
`UNKNOWN_SOURCE`, no un rechazo: son cosas distintas.

### 2.7 Elegibilidad (SFSP-120)

El §4 fija los códigos de resultado, pero `evaluate` devolvía un código suelto y
quien lo recibía no sabía bajo qué política se decidió ni cuándo.

```ts
type EligibilityAction =
  | 'ISSUE' | 'HOLD' | 'TRANSFER' | 'RECEIVE' | 'TRADE' | 'SETTLE'
  | 'REDEEM' | 'BURN' | 'MIGRATE_CLAIM' | 'RECOVER' | 'RELEASE';

interface EligibilityResult {
  decision: 'ALLOW' | 'DENY_POLICY' | 'DENY_ELIGIBILITY' | 'DENY_JURISDICTION'
          | 'DENY_ASSET_STATE' | 'DENY_AUTHORIZATION' | 'DENY_LIMIT'
          | 'REVIEW_REQUIRED' | 'UNKNOWN_SOURCE' | 'BLOCKED_DECISION';
  reasonCode: string;
  policyVersion: string;
  evaluatedAt: string;
}
```

`evaluate` sigue siendo de sólo lectura: por eso `EligibilityEvaluated` no es un
evento (§3). Una decisión sin `policyVersion` no es reproducible y por tanto no
es auditable.

### 2.8 Ciclo de vida de la cuenta y recuperación (SFSP-130)

```ts
interface AccountLifecycleTransition {
  accountId: string;
  from: AccountStatus;
  to: AccountStatus;
  authority: string;            // quién tuvo potestad, por rol
  reasonCode: string;
  operationId: string;          // unidad de idempotencia (§1)
  at: string;
}

type RecoveryCaseState =
  | 'SOLICITADA' | 'VERIFICACION' | 'AVISO' | 'ESPERA'
  | 'EN_DISPUTA' | 'APROBADA' | 'EJECUTADA' | 'RECHAZADA';

interface RecoveryCase {
  caseId: string;
  accountId: string;
  assetId: string | null;       // null cuando la recuperación es de acceso, no de activo
  capability: RecoveryCapability;
  state: RecoveryCaseState;
  approvals: Approval[];        // separadas por rol; nunca dos del mismo firmante
  notBefore: string;            // la espera es parte del control, no un trámite
  expiry: string;
  evidenceRef: string;
}
```

La capacidad se resuelve por (activo, perfil de custodia) y se guarda **en el
expediente**: si cambia después, el expediente sigue diciendo bajo qué capacidad
se decidió.

Dos registros más, hoy implícitos y por eso inseguros:

- `aliasPolicyVersion: string` en `AliasRecord`: versión de la tabla de
  confusables y del conjunto de escrituras admitidas con la que se calculó
  `skeleton`. Sin ella, cambiar la tabla reescribe el pasado en silencio.
- `retiredAccountNumbers`: registro **permanente** de números retirados. El §1
  promete que `accountNumber` no se recicla; sin un registro que sobreviva al
  cierre de la cuenta, esa promesa no es comprobable.

### 2.9 Admisión, plantillas de derechos y entitlements (SFSP-200)

```ts
// Estado del EXPEDIENTE de admisión. No es el eje `admission` del activo:
// `NEEDS_INFO` es una situación del caso, no del activo.
type AdmissionCaseState =
  | 'DRAFT' | 'REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

type RightsTemplateId = 'EQUITY' | 'DEBT' | 'REVENUE_SHARE' | 'ROYALTY' | 'VEHICLE_INTEREST';

type IssuanceState =
  | 'AUTORIZADA' | 'EN_EJECUCION' | 'EJECUTADA' | 'FALLIDA' | 'UNKNOWN' | 'NO_DISPONIBLE';

interface CorporateAction {
  actionId: string;
  assetId: string;
  kind: string;                 // DIVIDEND, SPLIT, REDEMPTION, ...
  recordDate: string;
  referenceBlock: { blockNumber: number; blockHash: string } | null;
  calculationBase: string;      // qué se usó para prorratear, en texto normativo
  state: 'ANUNCIADA' | 'FIJADA' | 'CALCULADA' | 'PAGADA' | 'CANCELADA';
  reconciliation: string | null;
}

interface Entitlement {
  entitlementId: string;
  assetId: string;
  holder: string;               // accountId, nunca datos personales
  amount: string;               // entero en unidades base (§5)
  state: 'PENDING' | 'CLAIMED' | 'UNCLAIMED_SEGREGATED';
  origin: { kind: 'CORPORATE_ACTION' | 'MIGRATION'; id: string };
}
```

`UNCLAIMED_SEGREGATED` existe porque un derecho no reclamado **no desaparece**:
se segrega y sigue siendo del titular.

### 2.10 Metal, reservas y redención (SFSP-300)

```ts
type MetalLotStatus =
  | 'INTAKE' | 'ATTESTED' | 'ASSIGNED'
  | 'RESERVED_FOR_DELIVERY' | 'DELIVERED' | 'EXPIRED_EVIDENCE';

interface MetalLot {
  lotId: string;
  grossWeight: string;          // entero en la unidad declarada (§5)
  purity: string;               // fracción exacta, nunca coma flotante
  fineOunces: string;
  custodian: string;
  location: string;
  jurisdiction: string;
  evidenceId: string;
  assignedTo: string | null;    // assetId al que respalda, o null
  status: MetalLotStatus;
}

type RedemptionState =
  | 'REQUESTED' | 'VALIDATED' | 'TOKENS_LOCKED' | 'METAL_RESERVED'
  | 'TOKENS_BURNED' | 'DELIVERY_PENDING' | 'DELIVERED' | 'CANCELLED' | 'UNKNOWN';

interface DeliveryObligation {
  obligationId: string;
  redemptionId: string;
  assetId: string;
  fineOunces: string;
  lotId: string;                // el lote reservado, no «algún lote»
  deadline: string;
  state: 'ABIERTA' | 'CUMPLIDA' | 'INCUMPLIDA' | 'CANCELADA';
}

interface ReserveAsset {
  reserveAssetId: string;
  holder: string;
  custodian: string;
  legalLocation: string;
  kind: string;
  unit: string;
  enforceableRights: string;
  encumbrances: string[];       // un gravamen no declarado infla la cobertura
  availability: 'LIBRE' | 'COMPROMETIDA' | 'BLOQUEADA' | 'UNKNOWN';
  valuation: { amount: string; methodology: string; asOf: string } | null;
  sources: string[];
  expiry: string | null;
  attestor: string | null;
  recognizedFactorBps: number | null;   // null hasta D04; 0..10000
  exclusiveAssignments: string[];
}
```

`RedemptionUpdated` (§3) transporta transiciones de `RedemptionState`. Entre
`TOKENS_BURNED` y `DELIVERED` **siempre** existe una `DeliveryObligation`: quemar
sin obligación registrada deja al titular sin token y sin derecho.

### 2.11 Suministro nativo y cobertura (SFSP-400)

```ts
type ReleaseState =
  | 'SOLICITADO' | 'VALIDADO' | 'EJECUTADO' | 'RECHAZADO' | 'BLOQUEADO' | 'UNKNOWN';

interface NativeSupplySnapshot {
  sGenesis: string; iConsensus: string; bProtocol: string;
  sNative: string; uUnactivated: string; rReleased: string;
  blockNumber: number;
  blockHash: string;            // sin identidad de bloque dos cifras no son comparables
  takenAt: string;
}

interface UnactivatedPerimeter {
  version: string;
  accounts: string[];
  conditions: string;           // qué hace que una unidad cuente como no activada
  approvedBy: string;
}

interface CoverageReport {
  alternative: string;          // qué alternativa de D03 se está evaluando
  scope: string;
  evaluatedAt: string;
  limitations: string;          // se publica con las cifras, no aparte
}
```

Un `NativeSupplySnapshot` sin `blockHash` es `UNKNOWN_SOURCE`: coincidir en altura
no es coincidir en rama.

### 2.12 Órdenes, liquidación y fees (SFSP-500)

```ts
type OrderState =
  | 'RECEIVED' | 'REJECTED' | 'OPEN' | 'PARTIALLY_FILLED'
  | 'FILLED' | 'CANCEL_PENDING' | 'CANCELLED' | 'EXPIRED';

type ExecutionState =
  | 'SETTLEMENT_PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED_FINAL' | 'UNKNOWN';

// Cuatro clases de precio que NO se sustituyen entre sí. Mostrar un indicativo
// donde se esperaba un precio de operación es la forma barata de mentir.
type PriceKind = 'INDICATIVE' | 'DECLARED' | 'REFERENCE' | 'TRADE' | 'RESERVE_VALUATION';

type GasSponsorshipMode = 'NONE' | 'CUSTODIAL' | 'APPROVED_SUBSIDY' | 'SMART_ACCOUNT';

interface FeeQuote {
  schemaVersion: string;
  feeKey: string;
  version: string;
  amount: string | null;        // null hasta D04; NUNCA un valor elegido aquí
  currency: string;
  expiry: string;
  gasSponsored: GasSponsorshipMode;
  signature: string;
}

interface SettlementJournalEntry {
  operationId: string;
  orderId: string;
  executionId: string;
  state: ExecutionState;
  blockNumber: number | null;
  nonce: string | null;
  txRef: string | null;         // txHash o referencia de proveedor
  receiptRecheck: 'OK' | 'MISMATCH' | 'UNKNOWN_SOURCE';
}
```

`receiptRecheck` no es decorativo: una liquidación se da por buena cuando se
vuelve a leer el recibo, no cuando se envió la transacción.

### 2.13 Visibilidad y privacidad (SFSP-600)

```ts
interface ActorView {
  actor: 'PUBLIC' | 'HOLDER' | 'OPERATOR' | 'AUDITOR' | 'AUTHORITY' | 'CUSTODIAN';
  purpose: string;
  retention: string;
  revocationCondition: string;
}

type PrivacyProfile =
  | 'LEGACY_TRANSPARENT' | 'CUSTODIAL_PROTOTYPE'
  | 'CRYPTOGRAPHIC_PROTOTYPE' | 'DISABLED';
```

El §7 dice dónde puede estar cada dato; `ActorView` dice **quién lo ve y por
cuánto tiempo**, que es la pregunta que hace un titular. `PrivacyProfile` va en el
pasaporte para que el activo declare su carril en vez de que se deduzca.
`disclosureAccessId` (§1) identifica una concesión de acceso ampliado con
propósito, alcance, período y bitácora: un acceso sin bitácora no es un acceso
concedido, es una fuga ordenada.

### 2.14 Migración (SFSP-700)

```ts
type MigrationMode = 'FROZEN_SNAPSHOT' | 'SURRENDER_ON_CLAIM';

type MigrationUserState =
  | 'ELEGIBLE' | 'CLAIM_SOLICITADO' | 'EXCLUSION_CONFIRMADA'
  | 'EMITIDO' | 'PENDIENTE' | 'UNKNOWN' | 'EXCEPCION';

interface MigrationPlan {
  migrationId: string;
  assetIdOld: string;
  assetIdNew: string;
  mode: MigrationMode;
  ratio: { numerator: string; denominator: string };   // fracción exacta (§5)
  decimalsOld: number | null;
  decimalsNew: number | null;
  cutoff: string;
  scopeS0: string;
  gasPayer: string;
  claimPolicyId: string;
}

interface MigrationReconciliation {
  s0: string; a: string; e: string; n: string; p: string;
  blockNumber: number;
  blockHash: string;
  checks: { s0EqualsAPlusNPlusP: boolean; eEqualsNPlusP: boolean; noDoubleRight: boolean };
}

interface FractionRegistry {
  holder: string;
  assetId: string;
  remainder: string;            // resto en unidades base; no se trunca en silencio (§5)
  destination: string;          // aprobado; un resto sin destino es dinero de nadie
}
```

`MigrationReconciliation` comprueba `S0 = A + N + P` y `E = N + P` por separado,
porque sumar `E + N + P` es la ecuación equivocada (§6.3).

### 2.15 Gobierno y autorización (SFSP-800)

El §2.4 referenciaba `approvals: Approval[]` sin definir `Approval`. Una
aprobación sin alcance, sin límite y sin vencimiento no restringe nada.

```ts
type ApprovalRole =
  | 'BOARD' | 'DBNX' | 'TECH' | 'SECURITY' | 'LEGAL'
  | 'OPERATIONS' | 'CUSTODIAN' | 'AUDITOR';

interface Approval {
  approverRef: string;          // referencia opaca del firmante, no su nombre
  role: ApprovalRole;
  actionId: string;
  scope: string;
  limit: string | null;         // entero en unidades base, o null si no aplica
  destination: string | null;
  environment: string;
  version: string;
  notBefore: string;
  expiry: string;
  evidenceId: string;
  nonce: string;
  signature: string;            // firma real; `approved: true` no es una firma
}

type AuthorizationState =
  | 'ISSUED' | 'ACTIVE' | 'PARTIALLY_CONSUMED' | 'CONSUMED' | 'REVOKED' | 'EXPIRED';

type GovernanceActionKind =
  | 'PAUSE' | 'UNPAUSE' | 'UPGRADE' | 'KEY_ROTATION' | 'QUORUM_CHANGE'
  | 'PARAMETER_CHANGE' | 'FORCED_TRANSFER' | 'RECOVERY' | 'ROLE_GRANT' | 'ROLE_REVOKE';

interface LegalApprovalRegister {
  denomination: string;
  authorizingEntity: string;
  jurisdiction: string;
  permittedActivities: string[];
  crossBorderRestrictions: string[];
  clientRights: string[];
  validFrom: string;
  validUntil: string | null;
  evidenceId: string;
}
```

Dos firmantes con el mismo `approverRef` cuentan como uno. `AuthorizationState`
existe porque una autorización consumida a medias no es ni nueva ni gastada, y
tratarla como cualquiera de las dos habilita una segunda ejecución.

`GovernanceAction` (§3) lleva un `GovernanceActionKind` en su campo `actionKind`.

### 2.16 Operación (SFSP-900)

```ts
interface ReconciliationRun {
  date: string;
  blockNumber: number;
  blockHash: string;            // la conciliación compara identidad, no altura
  concept: string;
  figures: { indexed: string; source: string };
  difference: string;
  caseOpened: string | null;    // una diferencia sin expediente es una diferencia ignorada
}

interface AcceptedRisk {
  riskId: string;
  approver: string;
  scope: string;
  expiry: string;               // un riesgo aceptado para siempre no está aceptado: está olvidado
  evidenceId: string;
}
```

---

## 3 · Eventos

Nombre, significado y quién los emite. El indexador deduplica por
`(chainId, blockHash, txHash, logIndex)`.

**La forma exacta de cada evento —campos, tipos, cuáles van `indexed` y cuáles
son obligatorios para poder atribuir el evento a un activo— vive en
[`spec/eventos.json`](spec/eventos.json), que es la fuente única.** Esta tabla da
el nombre y el significado; el JSON da la firma. El decodificador del indexador
se **genera** desde ese archivo (`indexer/src/esquema-generado.ts`) y una prueba
falla si los dos divergen. Por qué se llegó a eso: hasta draft-0.3 había una
tabla escrita a mano en Solidity y otra en TypeScript, y no coincidían (H15).

Dos reglas que el JSON impone y los contratos todavía tienen que cumplir (ver
`spec/PENDIENTE-CONTRATOS-EVENTOS.md`):

1. **Un solo nombre por hecho.** `UnitsMinted` queda retirado; el evento canónico
   de creación de unidades es `MintExecuted`, emitido por `IssuanceController`,
   que es el único que lleva la autorización consumida.
2. **Todo evento que cambie el suministro lleva `assetId`, obligatorio e
   indexado.** Sin activo, el evento no se puede atribuir y el suministro del
   activo sale `UNKNOWN`. Un suministro reconstruido a partir de eventos **nunca**
   se etiqueta `CHAIN_TOTALSUPPLY`: esa etiqueta significa una lectura directa de
   `totalSupply()` en cadena. Su origen honesto es `REGISTRY`, o `UNKNOWN` si
   falta cobertura.

| Evento | Emisor | Significado |
|---|---|---|
| `AssetRegistered` | AssetRegistry | Un `assetId` entra al catálogo con su pasaporte. |
| `PolicyUpdated` | AssetRegistry | Cambia una política; lleva versión anterior y nueva. |
| `SupplyAuthorized` | GovernanceController | DBNX autoriza una capacidad con monto y vigencia. |
| `MintExecuted` | IssuanceController | Se crearon unidades contra una autorización concreta. Nombre canónico único: absorbe `UnitsMinted`. |
| `BurnExecuted` | RegulatedAsset | Se destruyeron unidades, con activo y motivo. |
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

---

## 9 · Integración de las propuestas de `spec/` (C01)

Trece documentos de `spec/` terminaban con una sección «Propuestas para el
contrato interno» que nunca se integró. Mientras eso duró, este archivo decía ser
la fuente única y no lo era: la deriva empezó el mismo día que se escribió.

Las propuestas coherentes y necesarias están integradas en el §1 y en las
subsecciones 2.6 a 2.16. Las que no se integraron siguen en su documento de
origen marcadas **RECHAZADA** con el motivo en una línea, y son cuatro:

| Propuesta | Documento | Por qué se rechazó |
|---|---|---|
| `OracleQuoteKind` | SFSP-300 | Duplica `PriceKind` (§2.12), al que se añadió `RESERVE_VALUATION`. Dos enumeraciones para la misma distinción se desincronizan. |
| `MetadataClass` | SFSP-600 | La usa sólo la prueba de fuga de `privacy/`. No la comparten dos piezas, y este archivo es para lo compartido. |
| `ServiceManifestEntry` | SFSP-900 | El manifiesto de servicios vive en `deploy/MANIFIESTO.md`. No aparece en ninguna ruta de dinero. |
| `AlertDefinition` | SFSP-900 | Configuración de observabilidad, propia de `runbooks/`. `runbookId` sí se integró, porque a él sí lo referencian varias piezas. |

Para que la deriva no vuelva, `indexer/src/test/deriva-spec.test.ts` falla si un
documento de `spec/` propone un tipo que este archivo no define y que no está
marcado como rechazado.
