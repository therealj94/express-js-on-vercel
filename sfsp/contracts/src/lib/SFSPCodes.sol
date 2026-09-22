// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Códigos de resultado del §4 del contrato interno.
/// @dev Son estables y se traducen en la interfaz. Nunca se muestra el texto crudo
///      al usuario final, por eso viajan como uint8 + bytes32 de motivo.
library SFSPCodes {
    // §4 · Códigos de resultado. El orden es parte del contrato: no se reordena.
    uint8 internal constant ALLOW = 0;
    uint8 internal constant DENY_POLICY = 1;
    uint8 internal constant DENY_ELIGIBILITY = 2;
    uint8 internal constant DENY_JURISDICTION = 3;
    uint8 internal constant DENY_ASSET_STATE = 4;
    uint8 internal constant DENY_AUTHORIZATION = 5;
    uint8 internal constant DENY_LIMIT = 6;
    uint8 internal constant REVIEW_REQUIRED = 7;
    // UNKNOWN_SOURCE no es cero y no es deny: bloquea la decisión que dependa de
    // esa fuente, nunca se degrada a ALLOW ni a saldo cero.
    uint8 internal constant UNKNOWN_SOURCE = 8;
    // Falta una decisión Dxx: no se elige un valor por defecto.
    uint8 internal constant BLOCKED_DECISION = 9;

    // Motivos estables. Se emparejan con el código pero dan el detalle operativo.
    bytes32 internal constant R_OK = bytes32("ALLOW");
    bytes32 internal constant R_NO_POLICY = bytes32("POLICY_NOT_SET");
    bytes32 internal constant R_POLICY_FORBIDS = bytes32("POLICY_FORBIDS_ACTION");
    bytes32 internal constant R_ASSET_UNKNOWN = bytes32("ASSET_NOT_REGISTERED");
    bytes32 internal constant R_SUBJECT_UNKNOWN = bytes32("SUBJECT_REF_UNKNOWN");
    bytes32 internal constant R_CLAIM_MISSING = bytes32("CLAIM_MISSING_OR_EXPIRED");
    bytes32 internal constant R_JURISDICTION = bytes32("JURISDICTION_NOT_ALLOWED");
    bytes32 internal constant R_ASSET_STATE = bytes32("ASSET_LIFECYCLE_BLOCKS");
    bytes32 internal constant R_AUTHORIZATION = bytes32("AUTHORIZATION_MISSING");
    bytes32 internal constant R_LIMIT = bytes32("LIMIT_EXCEEDED");
    bytes32 internal constant R_REVIEW = bytes32("HUMAN_REVIEW_REQUIRED");
    bytes32 internal constant R_DECIMALS_UNKNOWN = bytes32("DECIMALS_UNKNOWN");
    bytes32 internal constant R_FEE_UNSET = bytes32("FEE_PARAM_NOT_FIXED");
    bytes32 internal constant R_FEE_STALE = bytes32("FEE_QUOTE_STALE");
    bytes32 internal constant R_PAUSED = bytes32("EMERGENCY_PAUSE_ACTIVE");
    bytes32 internal constant R_FROZEN = bytes32("ACCOUNT_FROZEN");
}
