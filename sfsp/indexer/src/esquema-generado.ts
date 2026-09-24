// ARCHIVO GENERADO. NO EDITAR A MANO.
//
// Fuente: sfsp/spec/eventos.json (la fuente unica del §3 del contrato interno).
// Regenerar con: npm run generar:esquema
// La prueba 'esquema.test.ts' falla si este archivo y el JSON divergen.

/** Version de la fuente unica desde la que se genero este modulo. */
export const VERSION_ESPEC_EVENTOS = "draft-0.4";

/** Un campo de un evento, con todo lo que el indexador necesita saber. */
export interface CampoEventoGenerado {
  readonly nombre: string;
  readonly tipo: string;
  readonly indexado: boolean;
  readonly obligatorio: boolean;
  readonly atribuyeActivo: boolean;
  readonly esCantidad: boolean;
}

/** Efecto declarado sobre el suministro. */
export type EfectoSuministroGenerado = 'AUMENTA' | 'DISMINUYE' | 'AUTORIZA' | 'NINGUNO';

export interface EventoGenerado {
  readonly nombre: string;
  readonly emisor: string;
  readonly significado: string;
  readonly atribucion: 'POR_ACTIVO' | 'GLOBAL';
  readonly afectaSuministro: EfectoSuministroGenerado;
  readonly implementadoEnContratos: boolean;
  readonly campos: readonly CampoEventoGenerado[];
  /** Campos requeridos, precalculado para no recorrer en cada log. */
  readonly requeridos: readonly string[];
  /** Campos que son cantidades enteras (§5). */
  readonly cantidades: readonly string[];
  /** Campos sin los cuales el evento no se puede atribuir a un activo. */
  readonly camposDeAtribucion: readonly string[];
}

/** Los 29 eventos del §3, por su nombre canonico. */
export type NombreEvento =
  | "AssetRegistered"
  | "PolicyUpdated"
  | "SupplyAuthorized"
  | "MintExecuted"
  | "BurnExecuted"
  | "TreasuryReleased"
  | "ReserveAttested"
  | "ReserveExpired"
  | "DisclosurePublished"
  | "RiskChanged"
  | "TradeSettled"
  | "RedemptionUpdated"
  | "RecoveryExecuted"
  | "MigrationClaimed"
  | "GovernanceAction"
  | "PassportUpdated"
  | "AssetStatusChanged"
  | "SupplyExpansionDeclared"
  | "SplitExecuted"
  | "IdentityLinkChanged"
  | "EligibilityRecorded"
  | "ExposureLimitRecorded"
  | "AcquirerDeclarationRecorded"
  | "CoveragePublished"
  | "LicenseStatusChanged"
  | "ModuleAvailabilityChanged"
  | "CountryStatusChanged"
  | "NetworkPermissionChanged"
  | "ConciliationRecorded";

/** Esquema completo por evento. Generado: editar el JSON, no esto. */
export const ESQUEMA_EVENTOS: Readonly<Record<NombreEvento, EventoGenerado>> = {
  AssetRegistered: {
    nombre: "AssetRegistered",
    emisor: "AssetRegistry",
    significado: "Un assetId entra al catalogo con su pasaporte.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "issuerId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "implementationProfile", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "issuerId", "implementationProfile"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  PolicyUpdated: {
    nombre: "PolicyUpdated",
    emisor: "AssetRegistry",
    significado: "Cambia una politica del activo; lleva version anterior y nueva.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "policyKind", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "previousPolicyId", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newPolicyId", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "previousVersion", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newVersion", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "policyKind", "previousPolicyId", "newPolicyId", "previousVersion", "newVersion"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  SupplyAuthorized: {
    nombre: "SupplyAuthorized",
    emisor: "GovernanceController",
    significado: "DBNX autoriza una capacidad de emision con monto y vigencia. NO es emision.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "AUTORIZA",
    implementadoEnContratos: true,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "authorizationId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "amount", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "expiry", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "authorizationId", "amount", "expiry"],
    cantidades: ["amount"],
    camposDeAtribucion: ["assetId"],
  },
  MintExecuted: {
    nombre: "MintExecuted",
    emisor: "IssuanceController",
    significado: "Se crearon unidades contra una autorizacion concreta. Unico evento canonico de creacion de unidades.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "AUMENTA",
    implementadoEnContratos: true,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "authorizationId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "destination", tipo: "address", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "amount", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "operationId", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "evidenceRoot", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "authorizationId", "destination", "amount", "operationId", "evidenceRoot"],
    cantidades: ["amount"],
    camposDeAtribucion: ["assetId"],
  },
  BurnExecuted: {
    nombre: "BurnExecuted",
    emisor: "RegulatedAsset",
    significado: "Se destruyeron unidades, con motivo codificado. Unico evento que reduce lo emitido.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "DISMINUYE",
    implementadoEnContratos: true,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "from", tipo: "address", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "amount", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "operationId", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "from", "amount", "reasonCode", "operationId"],
    cantidades: ["amount"],
    camposDeAtribucion: ["assetId"],
  },
  TreasuryReleased: {
    nombre: "TreasuryReleased",
    emisor: "CashVault",
    significado: "Salieron unidades de tesoreria al circulante. NO cambia lo emitido.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "to", tipo: "address", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "amount", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "to", "amount", "reasonCode"],
    cantidades: ["amount"],
    camposDeAtribucion: ["assetId"],
  },
  ReserveAttested: {
    nombre: "ReserveAttested",
    emisor: "ReserveEngine",
    significado: "Una reserva recibio evidencia con vigencia.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "reserveAssetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "evidenceId", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "validUntil", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["reserveAssetId", "assetId", "evidenceId", "validUntil"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  ReserveExpired: {
    nombre: "ReserveExpired",
    emisor: "ReserveEngine",
    significado: "Una reserva perdio vigencia; la capacidad de emision baja.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "reserveAssetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "expiredAt", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["reserveAssetId", "assetId", "expiredAt"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  DisclosurePublished: {
    nombre: "DisclosurePublished",
    emisor: "AssetRegistry",
    significado: "Hash de un informe con su fecha limite y el estado resultante.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "reportHash", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "dueDate", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "reportStatus", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "reportHash", "dueDate", "reportStatus"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  RiskChanged: {
    nombre: "RiskChanged",
    emisor: "AssetRegistry",
    significado: "R1-R5 o SIN_EVALUAR, con metodologia y responsable.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "previousLevel", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newLevel", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "methodologyVersion", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "responsible", tipo: "address", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "previousLevel", "newLevel", "methodologyVersion", "responsible"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  TradeSettled: {
    nombre: "TradeSettled",
    emisor: "SettlementEngine",
    significado: "Liquidacion atomica de una ejecucion. Mueve unidades entre titulares; no cambia lo emitido.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "operationId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "buyer", tipo: "address", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "seller", tipo: "address", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "assetAmount", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "cashAmount", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
    ],
    requeridos: ["operationId", "assetId", "buyer", "seller", "assetAmount", "cashAmount"],
    cantidades: ["assetAmount", "cashAmount"],
    camposDeAtribucion: ["assetId"],
  },
  RedemptionUpdated: {
    nombre: "RedemptionUpdated",
    emisor: "CommodityEngine",
    significado: "Avance en la maquina de redencion (SFSP-300 §RedemptionState).",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "redemptionId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "previousState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "amount", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
    ],
    requeridos: ["redemptionId", "assetId", "previousState", "newState", "amount"],
    cantidades: ["amount"],
    camposDeAtribucion: ["assetId"],
  },
  RecoveryExecuted: {
    nombre: "RecoveryExecuted",
    emisor: "GovernanceController",
    significado: "Recuperacion ejecutada con expediente, sin datos personales.",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "caseId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "operationId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "evidenceRoot", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "executedAt", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["caseId", "operationId", "evidenceRoot", "executedAt"],
    cantidades: [],
    camposDeAtribucion: [],
  },
  MigrationClaimed: {
    nombre: "MigrationClaimed",
    emisor: "MigrationRegistry",
    significado: "Un derecho viejo quedo excluido y uno nuevo emitido. Atribuye a DOS activos.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "migrationId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "beneficiary", tipo: "address", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "assetIdAnterior", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "assetIdNuevo", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "oldUnits", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "newUnits", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "nullifier", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["migrationId", "beneficiary", "assetIdAnterior", "assetIdNuevo", "oldUnits", "newUnits", "nullifier"],
    cantidades: ["oldUnits", "newUnits"],
    camposDeAtribucion: ["assetIdAnterior", "assetIdNuevo"],
  },
  GovernanceAction: {
    nombre: "GovernanceAction",
    emisor: "GovernanceController",
    significado: "Pausa, upgrade, rotacion o cambio de quorum.",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: true,
    campos: [
      { nombre: "operationId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "actionKind", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "actor", tipo: "address", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "detail", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "effectiveAt", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["operationId", "actionKind", "actor", "detail", "effectiveAt"],
    cantidades: [],
    camposDeAtribucion: [],
  },
  PassportUpdated: {
    nombre: "PassportUpdated",
    emisor: "AssetRegistry",
    significado: "Cambia un campo del Asset Passport; conserva la version anterior consultable (v0.2 §4.2, Apendice B).",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "previousVersion", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newVersion", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "passportHash", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "previousVersion", "newVersion", "passportHash", "reasonCode"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  AssetStatusChanged: {
    nombre: "AssetStatusChanged",
    emisor: "AssetRegistry",
    significado: "Cambio en el ciclo de vida del activo, en uno de sus ejes de estado.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "axis", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "previousState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "axis", "previousState", "newState", "reasonCode"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  SupplyExpansionDeclared: {
    nombre: "SupplyExpansionDeclared",
    emisor: "GovernanceController",
    significado: "Declaracion del tipo de ampliacion (COLOCACION_NUEVA o DIVISION) y de su prueba de neutralidad (SFSP-200 §0.1). No mueve suministro por si misma.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "operationId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "expansionKind", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "neutralityProofHash", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "dilutive", tipo: "bool", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "operationId", "expansionKind", "neutralityProofHash", "dilutive"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  SplitExecuted: {
    nombre: "SplitExecuted",
    emisor: "IssuanceController",
    significado: "Division de denominacion: multiplica las unidades de todos los tenedores sin captar capital. 'amount' son las unidades anadidas al total.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "AUMENTA",
    implementadoEnContratos: false,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "operationId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "ratioNumerator", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "ratioDenominator", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "amount", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
    ],
    requeridos: ["assetId", "operationId", "ratioNumerator", "ratioDenominator", "amount"],
    cantidades: ["amount"],
    camposDeAtribucion: ["assetId"],
  },
  IdentityLinkChanged: {
    nombre: "IdentityLinkChanged",
    emisor: "IdentityAdapter",
    significado: "Alta, cambio o revocacion del vinculo entre una billetera y una identidad. Solo la referencia del vinculo: ni direccion ni datos personales.",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "linkRef", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "previousState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["linkRef", "previousState", "newState", "reasonCode"],
    cantidades: [],
    camposDeAtribucion: [],
  },
  EligibilityRecorded: {
    nombre: "EligibilityRecorded",
    emisor: "EligibilityEngine",
    significado: "Referencia verificable de una evaluacion de elegibilidad. Sin identidad, sin direccion y sin resultado detallado: el detalle vive en el dominio privado (SFSP-600 §0). Sustituye al evento retirado que publicaba la evaluacion completa.",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "evaluationCommitment", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "action", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "policyVersion", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "evaluationCommitment", "action", "policyVersion"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  ExposureLimitRecorded: {
    nombre: "ExposureLimitRecorded",
    emisor: "EligibilityEngine",
    significado: "Registro del regimen de limite de exposicion aplicable a una identidad (Mercado de Crecimiento). Solo la referencia de la declaracion.",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "declarationRef", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "regime", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "validUntil", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["declarationRef", "regime", "validUntil"],
    cantidades: [],
    camposDeAtribucion: [],
  },
  AcquirerDeclarationRecorded: {
    nombre: "AcquirerDeclarationRecorded",
    emisor: "AssetRegistry",
    significado: "El adquirente reconoce los terminos, con la version del documento aceptado (v0.2 §8.3 bloque 7).",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "declarationRef", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "documentHash", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "documentVersion", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "declarationRef", "documentHash", "documentVersion"],
    cantidades: [],
    camposDeAtribucion: ["assetId"],
  },
  CoveragePublished: {
    nombre: "CoveragePublished",
    emisor: "CommodityEngine",
    significado: "Ratio de cobertura de una serie con respaldo, calculado contra lo COLOCADO; la tesorería se reporta aparte (SFSP-300 §0.2).",
    atribucion: "POR_ACTIVO",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "assetId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: true, esCantidad: false },
      { nombre: "fineOuncesAssigned", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "unitsPlaced", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "unitsInTreasury", tipo: "uint256", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: true },
      { nombre: "attestedAt", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["assetId", "fineOuncesAssigned", "unitsPlaced", "unitsInTreasury", "attestedAt"],
    cantidades: ["fineOuncesAssigned", "unitsPlaced", "unitsInTreasury"],
    camposDeAtribucion: ["assetId"],
  },
  LicenseStatusChanged: {
    nombre: "LicenseStatusChanged",
    emisor: "LicenseRegistry",
    significado: "Transicion de estado de una licencia del registro (SFSP-140).",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "licenseId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "previousState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["licenseId", "previousState", "newState", "reasonCode"],
    cantidades: [],
    camposDeAtribucion: [],
  },
  ModuleAvailabilityChanged: {
    nombre: "ModuleAvailabilityChanged",
    emisor: "LicenseRegistry",
    significado: "Un modulo se habilita o se bloquea por dependencia de licencia (SFSP-140).",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "moduleId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "licenseId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newAvailability", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["moduleId", "licenseId", "newAvailability", "reasonCode"],
    cantidades: [],
    camposDeAtribucion: [],
  },
  CountryStatusChanged: {
    nombre: "CountryStatusChanged",
    emisor: "EligibilityEngine",
    significado: "Cambio de estado de un pais en la matriz de jurisdicciones (SFSP-120 §0.2).",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "countryCode", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "previousState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "newState", tipo: "uint8", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "evidenceHash", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["countryCode", "previousState", "newState", "reasonCode", "evidenceHash"],
    cantidades: [],
    camposDeAtribucion: [],
  },
  NetworkPermissionChanged: {
    nombre: "NetworkPermissionChanged",
    emisor: "NetworkAdmission",
    significado: "Alta o baja en la lista de despliegue o en el filtro de transacciones (SFSP-150).",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "subject", tipo: "address", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "permissionKind", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "granted", tipo: "bool", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "reasonCode", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "operationId", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["subject", "permissionKind", "granted", "reasonCode", "operationId"],
    cantidades: [],
    camposDeAtribucion: [],
  },
  ConciliationRecorded: {
    nombre: "ConciliationRecorded",
    emisor: "ReconciliationJob",
    significado: "Resultado de la conciliacion diaria, incluidos los descuadres (SFSP-900 §0.1).",
    atribucion: "GLOBAL",
    afectaSuministro: "NINGUNO",
    implementadoEnContratos: false,
    campos: [
      { nombre: "runId", tipo: "bytes32", indexado: true, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "blockNumber", tipo: "uint64", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "resultHash", tipo: "bytes32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
      { nombre: "discrepancies", tipo: "uint32", indexado: false, obligatorio: true, atribuyeActivo: false, esCantidad: false },
    ],
    requeridos: ["runId", "blockNumber", "resultHash", "discrepancies"],
    cantidades: [],
    camposDeAtribucion: [],
  },
};

/** Nombre de evento -> emisor declarado. Compatibilidad con el §3. */
export const EVENTOS_CONOCIDOS: Readonly<Record<NombreEvento, string>> = {
  AssetRegistered: "AssetRegistry",
  PolicyUpdated: "AssetRegistry",
  SupplyAuthorized: "GovernanceController",
  MintExecuted: "IssuanceController",
  BurnExecuted: "RegulatedAsset",
  TreasuryReleased: "CashVault",
  ReserveAttested: "ReserveEngine",
  ReserveExpired: "ReserveEngine",
  DisclosurePublished: "AssetRegistry",
  RiskChanged: "AssetRegistry",
  TradeSettled: "SettlementEngine",
  RedemptionUpdated: "CommodityEngine",
  RecoveryExecuted: "GovernanceController",
  MigrationClaimed: "MigrationRegistry",
  GovernanceAction: "GovernanceController",
  PassportUpdated: "AssetRegistry",
  AssetStatusChanged: "AssetRegistry",
  SupplyExpansionDeclared: "GovernanceController",
  SplitExecuted: "IssuanceController",
  IdentityLinkChanged: "IdentityAdapter",
  EligibilityRecorded: "EligibilityEngine",
  ExposureLimitRecorded: "EligibilityEngine",
  AcquirerDeclarationRecorded: "AssetRegistry",
  CoveragePublished: "CommodityEngine",
  LicenseStatusChanged: "LicenseRegistry",
  ModuleAvailabilityChanged: "LicenseRegistry",
  CountryStatusChanged: "EligibilityEngine",
  NetworkPermissionChanged: "NetworkAdmission",
  ConciliationRecorded: "ReconciliationJob",
};

/**
 * Nombres retirados que se siguen decodificando al canonico.
 * POR QUE: un log historico emitido con el nombre viejo no se puede reescribir;
 * si se tratara como desconocido, el indice perderia hechos que si sabemos leer.
 * El registro sale marcado con `aliasOrigen` para que nadie lo confunda con un
 * evento emitido hoy.
 */
export const ALIASES_RETIRADOS: Readonly<Record<string, NombreEvento>> = {
  "UnitsMinted": "MintExecuted",
};
