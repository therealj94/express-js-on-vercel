// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";

/// @title Controlador de comisiones: cotización versionada con TTL.
/// @notice Si el parámetro económico no está fijado (falta una decisión Dxx),
///         devuelve BLOCKED_DECISION en lugar de cobrar un número inventado.
///         Si está fijado pero la cotización caducó, devuelve UNKNOWN_SOURCE:
///         no se pudo leer una fuente fresca, y eso NO se degrada a cero ni a ALLOW.
contract SFSPFeeController is SFSPAccessControl {
    enum FailurePolicy { BLOCK, REVIEW }

    struct FeeParameter {
        bool fixedParam;          // false => el parámetro no está fijado
        uint256 amount;           // entero en unidades base de `currency`
        bytes32 currency;         // moneda de la comisión
        bool gasSponsored;        // si el gas va patrocinado
        uint64 ttl;               // vigencia de cada cotización, en segundos
        uint64 quotedAt;          // momento de la última fijación
        uint32 version;           // versión de la cotización
        FailurePolicy failurePolicy;
    }

    event FeeParameterSet(bytes32 indexed feeKey, uint32 version, uint256 amount, bytes32 currency, uint64 ttl);
    event FeeParameterCleared(bytes32 indexed feeKey, bytes32 reasonCode);

    // FALTA EN CONTRATO-INTERNO: el contrato interno no define un tipo de
    // cotización de comisión. Se usa lo más cercano: códigos del §4 y la regla
    // del §8 (sin decisión Dxx => BLOCKED_DECISION).
    mapping(bytes32 => FeeParameter) private _params;

    constructor(address board) SFSPAccessControl(board) {}

    function setFeeParameter(
        bytes32 feeKey,
        uint256 amount,
        bytes32 currency,
        bool gasSponsored,
        uint64 ttl,
        FailurePolicy failurePolicy
    ) external onlyRole(DBNX_BOARD) {
        require(currency != bytes32(0), "SFSP: moneda requerida");
        require(ttl > 0, "SFSP: ttl=0");
        FeeParameter storage p = _params[feeKey];
        p.fixedParam = true;
        p.amount = amount;
        p.currency = currency;
        p.gasSponsored = gasSponsored;
        p.ttl = ttl;
        p.quotedAt = uint64(block.timestamp);
        p.version += 1;
        p.failurePolicy = failurePolicy;
        emit FeeParameterSet(feeKey, p.version, amount, currency, ttl);
    }

    /// @dev Limpiar vuelve a "no fijado": no deja el último número como default.
    function clearFeeParameter(bytes32 feeKey, bytes32 reasonCode) external onlyRole(DBNX_BOARD) {
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        delete _params[feeKey];
        emit FeeParameterCleared(feeKey, reasonCode);
    }

    function parameterOf(bytes32 feeKey) external view returns (FeeParameter memory) {
        return _params[feeKey];
    }

    /// @notice Cotización de vista. Devuelve siempre un código del §4.
    function quote(bytes32 feeKey)
        external
        view
        returns (
            uint8 result,
            bytes32 reasonCode,
            uint256 amount,
            bytes32 currency,
            bool gasSponsored,
            uint64 expiresAt,
            uint32 version
        )
    {
        FeeParameter storage p = _params[feeKey];
        if (!p.fixedParam) {
            // Falta la decisión económica: no se elige un valor por defecto (§8).
            return (SFSPCodes.BLOCKED_DECISION, SFSPCodes.R_FEE_UNSET, 0, bytes32(0), false, 0, 0);
        }
        uint64 expiry = p.quotedAt + p.ttl;
        if (block.timestamp >= expiry) {
            uint8 code = p.failurePolicy == FailurePolicy.BLOCK
                ? SFSPCodes.UNKNOWN_SOURCE
                : SFSPCodes.REVIEW_REQUIRED;
            return (code, SFSPCodes.R_FEE_STALE, 0, p.currency, p.gasSponsored, expiry, p.version);
        }
        return (SFSPCodes.ALLOW, SFSPCodes.R_OK, p.amount, p.currency, p.gasSponsored, expiry, p.version);
    }
}
