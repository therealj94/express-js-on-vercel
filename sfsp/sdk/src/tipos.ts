/* Tipos compartidos de SFSP.
 *
 * Esta es la traducción literal del §2 de CONTRATO-INTERNO.md. Si un campo
 * cambia aquí, cambia allí primero: dos piezas del árbol no definen el mismo
 * concepto por su cuenta. */

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export type CustodyProfile = 'MANAGED' | 'PERSONAL' | 'INSTITUTIONAL';

export interface SFSPAccount {
  accountId: string;
  accountNumber: string;
  status: AccountStatus;
  createdAt: string;
  /* Referencia opaca hacia Genesis ID. NUNCA se publica en el ledger, en un QR
     ni en una API pública: ver §7 del contrato interno. */
  genesisSubjectRef: string;
  custodyProfile: CustodyProfile;
  primaryBindingId: string | null;
  policyVersion: string;
}

export type BindingStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'PRIMARY'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'RECOVERY_PENDING';

export type BindingPurpose = 'PAYMENTS' | 'CUSTODY' | 'SETTLEMENT' | 'INTEROP';

export interface WalletBinding {
  bindingId: string;
  accountId: string;
  chainId: number;
  /** Dirección con mayúsculas y minúsculas de checksum EIP-55. */
  address: string;
  purpose: BindingPurpose;
  status: BindingStatus;
  custodyProfile: CustodyProfile;
  validFrom: string;
  validUntil: string | null;
  version: number;
}

export type AliasStatus = 'ACTIVE' | 'RELEASED' | 'RESERVED' | 'DISPUTED';

export interface AliasRecord {
  /** Forma que se muestra, con arroba. */
  alias: string;
  /** Forma canónica que decide la unicidad. */
  normalized: string;
  /** Forma anti-confusables: dos alias distintos que se ven igual colisionan. */
  skeleton: string;
  accountId: string;
  status: AliasStatus;
  createdAt: string;
  releasedAt: string | null;
}

/* La capacidad de recuperación se resuelve por (activo, perfil de custodia),
   nunca por uno solo de los dos. Una cuenta MANAGED no vuelve recuperable un
   ERC-20 que vive en una dirección cuya llave no controla nadie. */
export type RecoveryCapability =
  | 'ACCESS_ONLY'
  | 'CUSTODIAL_KEY_RECOVERY'
  | 'CONTRACT_RECOVERY'
  | 'ADMIN_FORCED_TRANSFER'
  | 'NONE';

export type ImplementationProfile =
  | 'LEGACY_REGISTERED'
  | 'SFSP_ENFORCED'
  | 'CUSTODIAL_ACCOUNTING';

export type AssetKind = 'NATIVE' | 'CONTRACT' | 'OFFCHAIN_RECORD';

export interface EnforcementScope {
  transferRestrictions: boolean;
  freeze: boolean;
  forcedTransfer: boolean;
  pause: boolean;
  /** true en un ERC-20 legacy: transfer() no pasa por SFSP y no hay forma de impedirlo. */
  directTransferBypass: boolean;
  notes: string;
}

/* Cinco ejes independientes. Nunca un único booleano «activo»: retirar un
   activo del catálogo no borra su saldo ni el acceso de su titular. */
export interface AssetLifecycle {
  legal: 'UNCLASSIFIED' | 'UNDER_REVIEW' | 'CLASSIFIED' | 'RESTRICTED_BY_LAW';
  admission: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  trading: 'NOT_LISTED' | 'LISTED' | 'SUSPENDED' | 'DELISTED';
  transferability: 'FREE' | 'RESTRICTED' | 'FROZEN';
  redemption: 'NONE' | 'AVAILABLE' | 'SUSPENDED';
  visibility: 'VISIBLE_TO_HOLDER' | 'HIDDEN_FROM_CATALOG';
}

export type RiskLevel = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'SIN_EVALUAR';

export type SupplySource =
  | 'CHAIN_TOTALSUPPLY'
  | 'REGISTRY'
  | 'CUSTODIAL_LEDGER'
  | 'UNKNOWN';

export interface AssetPassport {
  assetId: string;
  issuerId: string;
  legalInstrumentId: string | null;
  economicType: string;
  legalClass: string | null;
  jurisdiction: string | null;
  implementationProfile: ImplementationProfile;
  enforcementScope: EnforcementScope;
  assetKind: AssetKind;
  settlementLocation: { chainId: number; address: string | null; codehash: string | null };
  unit: string;
  /** null significa desconocido. NUNCA se sustituye por 18. */
  decimals: number | null;
  capabilities: string[];
  rightsTemplate: { id: string; version: string } | null;
  documentRoot: string | null;
  reportStatus: 'CURRENT' | 'DUE' | 'LATE' | 'WARNING' | 'NONE';
  riskStatus: { level: RiskLevel; methodologyVersion: string | null; evaluatedAt: string | null };
  transferPolicyId: string | null;
  redemptionPolicyId: string | null;
  listingPolicyId: string | null;
  supplySource: SupplySource;
  /** Identificadores anteriores que se conservan. AGKA es alias de AGK, no otro token. */
  aliases: string[];
  status: AssetLifecycle;
}

export interface Approval {
  actor: string;
  role: string;
  signature: string;
  signedAt: string;
}

export interface SignedAuthorization {
  schemaVersion: string;
  authorizationId: string;
  actionId: string;
  chainId: number;
  genesisHash: string | null;
  verifyingContract: string;
  assetId: string;
  /** Entero en unidades base, como cadena. Nunca coma flotante. */
  amount: string;
  destination: string;
  policyVersion: string;
  evidenceRoot: string;
  nonce: string;
  notBefore: string;
  expiry: string;
  approvals: Approval[];
}

export type EvidenceState =
  | 'DECLARADO'
  | 'CODIGO_LEIDO'
  | 'PROBADO_AISLADO'
  | 'VERIFICADO_RUNTIME'
  | 'NO_VERIFICADO'
  | 'BLOQUEADO';

export interface EvidenceRecord {
  evidenceId: string;
  taskId: string;
  requirementIds: string[];
  findingIds: string[];
  sourceSHA: string;
  artifactDigest: string | null;
  configVersion: string;
  environment: string;
  chainId: number | null;
  genesisHash: string | null;
  blockNumber: number | null;
  blockHash: string | null;
  testCommand: string;
  fixtureId: string;
  result: EvidenceState;
  timestampUTC: string;
  reviewer: string | null;
  limitations: string;
  restrictedEvidenceRef: string | null;
}
