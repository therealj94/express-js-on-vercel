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
}
