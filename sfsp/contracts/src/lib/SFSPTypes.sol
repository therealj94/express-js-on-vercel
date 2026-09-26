// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Tipos compartidos del §2.3 del contrato interno.
/// @dev El ciclo de vida NO es un booleano: son cinco ejes independientes más
///      visibilidad. Un `DELISTED` jamás implica ocultar ni tocar el saldo (regla 6).
library SFSPTypes {
    // --- Eje 1: situación jurídica. La fija D08; UNCLASSIFIED no es "sin riesgo".
    enum Legal { UNCLASSIFIED, UNDER_REVIEW, CLASSIFIED, RESTRICTED_BY_LAW }
    // --- Eje 2: expediente de admisión DBNX.
    enum Admission { DRAFT, REVIEW, APPROVED, REJECTED, WITHDRAWN }
    // --- Eje 3: negociación.
    enum Trading { NOT_LISTED, LISTED, SUSPENDED, DELISTED }
    // --- Eje 4: transferibilidad.
    enum Transferability { FREE, RESTRICTED, FROZEN }
    // --- Eje 5: redención.
    enum Redemption { NONE, AVAILABLE, SUSPENDED }
    // --- Visibilidad de catálogo: nunca oculta el activo a su titular.
    enum Visibility { VISIBLE_TO_HOLDER, HIDDEN_FROM_CATALOG }

    enum ImplementationProfile { LEGACY_REGISTERED, SFSP_ENFORCED, CUSTODIAL_ACCOUNTING }
    enum AssetKind { NATIVE, CONTRACT, OFFCHAIN_RECORD }
    enum RiskLevel { SIN_EVALUAR, R1, R2, R3, R4, R5 }
    enum ReportStatus { NONE, CURRENT, DUE, LATE, WARNING }
    enum SupplySource { UNKNOWN, CHAIN_TOTALSUPPLY, REGISTRY, CUSTODIAL_LEDGER }

    struct Lifecycle {
        Legal legal;
        Admission admission;
        Trading trading;
        Transferability transferability;
        Redemption redemption;
        Visibility visibility;
    }

    /// @dev Registrar un legacy NO le añade capacidades: `directTransferBypass`
    ///      deja escrito que su `transfer()` no pasa por SFSP.
    struct EnforcementScope {
        bool transferRestrictions;
        bool freeze;
        bool forcedTransfer;
        bool pause;
        bool directTransferBypass;
        // FALTA EN CONTRATO-INTERNO: el §2.3 define `notes: string`. En cadena se
        // guarda su hash/referencia para no publicar texto libre; el texto vive fuera.
        bytes32 notesRef;
    }

    struct SettlementLocation {
        uint256 chainId;
        address contractAddress;
        bytes32 codehash;
    }

    struct RiskStatus {
        RiskLevel level;
        bytes32 methodologyVersion; // 0 = sin metodología fijada
        uint64 evaluatedAt;         // 0 = nunca evaluado
    }

    /// @dev `decimalsKnown == false` significa desconocido. NUNCA se sustituye por 18:
    ///      una decisión financiera que dependa de eso devuelve UNKNOWN_SOURCE (§5).
    struct Passport {
        bytes32 assetId;
        bytes32 issuerId;
        bytes32 legalInstrumentId;
        bytes32 economicType;
        bytes32 legalClass;      // 0 = sin clasificar
        bytes32 jurisdiction;    // 0 = desconocida
        ImplementationProfile implementationProfile;
        AssetKind assetKind;
        EnforcementScope enforcement;
        SettlementLocation settlementLocation;
        bytes32 unit;
        bool decimalsKnown;
        uint8 decimals;
        bytes32 rightsTemplateId;
        bytes32 rightsTemplateVersion;
        bytes32 documentRoot;
        ReportStatus reportStatus;
        RiskStatus risk;
        bytes32 transferPolicyId;
        bytes32 redemptionPolicyId;
        bytes32 listingPolicyId;
        SupplySource supplySource;
        Lifecycle status;
    }

    // ------------------------------------------------------------------
    // SFSP v0.3 §4.2 · campos del Asset Passport que faltaban.
    //
    // No se añaden DENTRO de `Passport`: esa struct es la que reciben
    // `registerAsset`, el script de despliegue de SFSP-410 y el panel, y
    // meterle campos cambiaría la codificación ABI de todos ellos. Se guardan
    // aparte, versionados, en `SFSPAssetRegistry` (ver `passportDetailsOf`).
    // ------------------------------------------------------------------

    /// @dev Un campo con fecha y vigencia. `value == 0` es «no declarado» y
    ///      entonces las dos fechas son cero. Un campo cuya vigencia pasó se lee
    ///      como VENCIDO, nunca como el último valor conocido (v0.3 §4.2).
    struct DatedField {
        bytes32 value;      // referencia (hash o identificador), nunca texto libre
        uint64 asOf;        // fecha del dato (opinión, dictamen, atestación)
        uint64 validUntil;  // vigencia; exclusiva
    }

    /// @dev Cobertura: ratio en puntos básicos (10000 = 100 %) y fecha de la
    ///      última atestación. `asOf == 0` es «no declarada».
    struct DatedRatio {
        uint32 ratioBps;
        uint64 asOf;
        uint64 validUntil;
    }

    struct PassportDetails {
        DatedField auditor;          // auditor de los estados financieros
        DatedField valuator;         // valuador independiente
        DatedField custodian;        // custodio o fiduciario
        DatedField segment;          // SEGMENT_PRINCIPAL / SEGMENT_CRECIMIENTO
        DatedRatio coverage;         // ratio de cobertura + fecha
        DatedField releaseSchedule;  // calendario de liberación (hash)
        DatedField redemptionTerms;  // condiciones de redención (hash)
        DatedField licenses;         // raíz de las licencias de las que depende
        DatedField documentRoot;     // raíz documental vigente
    }

    /// @dev Estado de lectura de un campo fechado.
    enum FieldStatus { NO_DECLARADO, VIGENTE, VENCIDO }

    /// @dev Segmentos del Mercado de Valores Inclusivo (v0.3 §8.4).
    bytes32 internal constant SEGMENT_PRINCIPAL = bytes32("PRINCIPAL");
    bytes32 internal constant SEGMENT_CRECIMIENTO = bytes32("CRECIMIENTO");

    /// @dev Identificador jerárquico estable (v0.3 §4.2): clase / autoridad de
    ///      admisión / correlativo. No se deriva de la dirección del contrato.
    struct HierarchicalId {
        bytes32 assetClass;  // SECURITY, COMMODITY, MONETARY o UTILITY (§4.1)
        bytes32 authority;   // autoridad de admisión, [A-Z0-9_], 1..16 caracteres
        uint32 serial;       // correlativo por (clase, autoridad), desde 1
    }
}
