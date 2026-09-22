// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {ISFSPAssetRegistry, ISFSPIdentityAdapter, ISFSPGovernanceController} from "./lib/ISFSP.sol";

/// @title Motor de elegibilidad.
/// @notice `evaluate` es de SÓLO LECTURA y NO emite eventos: `EligibilityEvaluated`
///         no existe (§3). La auditoría de rechazos vive en el registro operativo.
/// @dev Hay política por (activo, acción) para TODAS las clases. No existe una
///      clase que "pase automáticamente": si la política no está fijada, la
///      respuesta es BLOCKED_DECISION, nunca ALLOW.
contract SFSPEligibilityEngine is SFSPAccessControl {
    // Acciones canónicas evaluables.
    bytes32 public constant ACTION_MINT = bytes32("MINT");
    bytes32 public constant ACTION_TRANSFER_OUT = bytes32("TRANSFER_OUT");
    bytes32 public constant ACTION_TRANSFER_IN = bytes32("TRANSFER_IN");
    bytes32 public constant ACTION_SETTLE = bytes32("SETTLE");
    bytes32 public constant ACTION_REDEEM = bytes32("REDEEM");
    bytes32 public constant ACTION_MIGRATION_CLAIM = bytes32("MIGRATION_CLAIM");

    struct Policy {
        bool configured;             // false => BLOCKED_DECISION; no hay default
        bool actionAllowed;          // false => DENY_POLICY
        bool requiresHumanReview;    // true => REVIEW_REQUIRED
        bool requiresAuthorization;  // true => exige autorización de gobierno previa
        bool requiresDecimalsKnown;  // una decisión que dependa de decimals nulo no se toma
        bool jurisdictionAllowlist;  // true => sólo jurisdicciones en lista
        bytes32 requiredPurpose;     // 0 = no exige claim de identidad
        uint256 maxAmount;           // 0 = sin límite por operación
        uint32 version;
    }

    event PolicyConfigured(bytes32 indexed assetId, bytes32 indexed action, uint32 version);
    event JurisdictionAllowed(bytes32 indexed assetId, bytes32 indexed jurisdiction, bool allowed);
    event SubjectBlocked(bytes32 indexed subjectRef, bytes32 reasonCode, bool blocked);

    ISFSPAssetRegistry public immutable registry;
    ISFSPIdentityAdapter public immutable identity;
    ISFSPGovernanceController public immutable governance;

    mapping(bytes32 => Policy) private _policies;                 // key(assetId,action)
    mapping(bytes32 => mapping(bytes32 => bool)) private _jurisdictionAllowed;
    mapping(bytes32 => bool) private _blockedSubject;             // lista de bloqueo por expediente
    mapping(bytes32 => bool) private _authorizedContext;          // (assetId,action,context) autorizado

    constructor(address board, address registry_, address identity_, address governance_)
        SFSPAccessControl(board)
    {
        require(registry_ != address(0) && identity_ != address(0) && governance_ != address(0), "SFSP: dep=0");
        registry = ISFSPAssetRegistry(registry_);
        identity = ISFSPIdentityAdapter(identity_);
        governance = ISFSPGovernanceController(governance_);
    }

    function _key(bytes32 assetId, bytes32 action) internal pure returns (bytes32) {
        return keccak256(abi.encode(assetId, action));
    }

    // ------------------------------------------------------------- configuración

    function setPolicy(bytes32 assetId, bytes32 action, Policy calldata p) external onlyRole(TECH_OPS) {
        Policy memory stored = p;
        stored.configured = true;
        stored.version = _policies[_key(assetId, action)].version + 1;
        _policies[_key(assetId, action)] = stored;
        emit PolicyConfigured(assetId, action, stored.version);
    }

    function policyOf(bytes32 assetId, bytes32 action) external view returns (Policy memory) {
        return _policies[_key(assetId, action)];
    }

    function setJurisdictionAllowed(bytes32 assetId, bytes32 jurisdiction, bool allowed)
        external
        onlyRole(TECH_OPS)
    {
        _jurisdictionAllowed[assetId][jurisdiction] = allowed;
        emit JurisdictionAllowed(assetId, jurisdiction, allowed);
    }

    function setSubjectBlocked(bytes32 subjectRef, bool blocked, bytes32 reasonCode) external onlyRole(TECH_OPS) {
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        _blockedSubject[subjectRef] = blocked;
        emit SubjectBlocked(subjectRef, reasonCode, blocked);
    }

    /// @dev Contexto autorizado: el hash de una operación concreta que ya pasó
    ///      por gobierno. Sin él, una política que exija autorización deniega.
    function setContextAuthorized(bytes32 assetId, bytes32 action, bytes32 context, bool ok)
        external
        onlyRole(TECH_OPS)
    {
        _authorizedContext[keccak256(abi.encode(assetId, action, context))] = ok;
    }

    // ------------------------------------------------------------- evaluación

    /// @notice VIEW. No escribe, no emite eventos, no consume gas de estado.
    /// @param subject referencia opaca del sujeto (nunca un dato personal)
    /// @param context compatibilidad: una sola palabra que hacía de monto Y de
    ///        contexto de autorización a la vez.
    /// @dev H06 · CAMINO HEREDADO. Se conserva porque hay lecturas de interfaz que
    ///      sólo quieren el monto, pero **no debe usarse para autorizar**: con una
    ///      sola palabra, `maxAmount` y el contexto autorizado son el mismo valor,
    ///      de forma que dos operaciones distintas del mismo monto comparten
    ///      autorización. Las rutas de dinero usan `evaluateOperation`.
    function evaluate(bytes32 subject, bytes32 assetId, bytes32 action, bytes32 context)
        external
        view
        returns (uint8 result, bytes32 reasonCode, uint32 policyVersion)
    {
        return _evaluate(subject, assetId, action, uint256(context), context);
    }

    /// @notice Evaluación con el monto y el contexto de autorización SEPARADOS.
    /// @param amount monto real de la operación, para el límite por operación.
    /// @param authorizationDigest digest del §12.1 que compromete el contenido
    ///        completo. `0` significa «sin autorización de gobierno presentada»:
    ///        una política que exija autorización deniega, no pasa.
    function evaluateOperation(
        bytes32 subject,
        bytes32 assetId,
        bytes32 action,
        uint256 amount,
        bytes32 authorizationDigest
    ) external view returns (uint8 result, bytes32 reasonCode, uint32 policyVersion) {
        return _evaluate(subject, assetId, action, amount, authorizationDigest);
    }

    function _evaluate(bytes32 subject, bytes32 assetId, bytes32 action, uint256 amount, bytes32 authContext)
        internal
        view
        returns (uint8 result, bytes32 reasonCode, uint32 policyVersion)
    {
        Policy storage p = _policies[_key(assetId, action)];

        // 1. Sin política fijada no se elige un valor por defecto (§8).
        if (!p.configured) return (SFSPCodes.BLOCKED_DECISION, SFSPCodes.R_NO_POLICY, 0);
        policyVersion = p.version;

        // 2. El activo debe existir en el catálogo; si no, la fuente no se pudo leer.
        if (!registry.isRegistered(assetId)) {
            return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_ASSET_UNKNOWN, policyVersion);
        }

        // 3. Prohibición explícita de la política para esa acción.
        if (!p.actionAllowed) return (SFSPCodes.DENY_POLICY, SFSPCodes.R_POLICY_FORBIDS, policyVersion);

        // 4. Pausa de emergencia vigente: estado del sistema, no del sujeto.
        if (governance.isPaused()) return (SFSPCodes.DENY_ASSET_STATE, SFSPCodes.R_PAUSED, policyVersion);

        // 5. Estado del activo en los cinco ejes.
        SFSPTypes.Lifecycle memory lc = registry.lifecycleOf(assetId);
        uint8 stateCode = _assetStateFor(lc, action);
        if (stateCode != SFSPCodes.ALLOW) return (stateCode, SFSPCodes.R_ASSET_STATE, policyVersion);

        // 6. decimals desconocido bloquea la decisión que dependa de él (§5).
        if (p.requiresDecimalsKnown) {
            (bool known,) = registry.decimalsOf(assetId);
            if (!known) return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_DECIMALS_UNKNOWN, policyVersion);
        }

        // 7. Sujeto: sin referencia opaca no hay sujeto legible.
        if (subject == bytes32(0)) {
            return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_SUBJECT_UNKNOWN, policyVersion);
        }
        if (_blockedSubject[subject]) {
            return (SFSPCodes.DENY_ELIGIBILITY, bytes32("SUBJECT_BLOCKED"), policyVersion);
        }

        // 8. Claim de identidad por propósito: "no consta" no equivale a "no cumple".
        if (p.requiredPurpose != bytes32(0)) {
            (bool known, bool valid,) = identity.claimStatus(subject, p.requiredPurpose);
            if (!known) return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_CLAIM_MISSING, policyVersion);
            if (!valid) return (SFSPCodes.DENY_ELIGIBILITY, SFSPCodes.R_CLAIM_MISSING, policyVersion);
        }

        // 9. Jurisdicción: si el pasaporte no la tiene, no se adivina.
        if (p.jurisdictionAllowlist) {
            bytes32 j = registry.jurisdictionOf(assetId);
            if (j == bytes32(0)) return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_JURISDICTION, policyVersion);
            if (!_jurisdictionAllowed[assetId][j]) {
                return (SFSPCodes.DENY_JURISDICTION, SFSPCodes.R_JURISDICTION, policyVersion);
            }
        }

        // 10. Límite por operación, contra el MONTO y no contra una palabra que
        //     también hace de clave de autorización (H06).
        if (p.maxAmount != 0 && amount > p.maxAmount) {
            return (SFSPCodes.DENY_LIMIT, SFSPCodes.R_LIMIT, policyVersion);
        }

        // 11. Autorización previa de gobierno para esa operación concreta. El
        //     contexto es el digest ligado al contenido, no el monto (H06).
        if (
            p.requiresAuthorization
                && (authContext == bytes32(0) || !_authorizedContext[keccak256(abi.encode(assetId, action, authContext))])
        ) {
            return (SFSPCodes.DENY_AUTHORIZATION, SFSPCodes.R_AUTHORIZATION, policyVersion);
        }

        // 12. Revisión humana: se responde después de todo lo automático, para que
        //     el revisor no reciba casos que ya tenían un deny objetivo.
        if (p.requiresHumanReview) return (SFSPCodes.REVIEW_REQUIRED, SFSPCodes.R_REVIEW, policyVersion);

        return (SFSPCodes.ALLOW, SFSPCodes.R_OK, policyVersion);
    }

    /// @dev Los ejes se leen por separado. DELISTED no toca saldos ni visibilidad,
    ///      así que no bloquea una transferencia de salida por sí mismo.
    function _assetStateFor(SFSPTypes.Lifecycle memory lc, bytes32 action) internal pure returns (uint8) {
        if (lc.legal == SFSPTypes.Legal.RESTRICTED_BY_LAW) return SFSPCodes.DENY_ASSET_STATE;
        if (lc.transferability == SFSPTypes.Transferability.FROZEN) return SFSPCodes.DENY_ASSET_STATE;

        if (action == ACTION_MINT) {
            // Emitir exige expediente aprobado; UNDER_REVIEW no autoriza emisión.
            if (lc.admission != SFSPTypes.Admission.APPROVED) return SFSPCodes.DENY_ASSET_STATE;
            if (lc.legal == SFSPTypes.Legal.UNCLASSIFIED) return SFSPCodes.REVIEW_REQUIRED;
        } else if (action == ACTION_SETTLE) {
            if (lc.trading == SFSPTypes.Trading.SUSPENDED || lc.trading == SFSPTypes.Trading.DELISTED) {
                return SFSPCodes.DENY_ASSET_STATE;
            }
        } else if (action == ACTION_REDEEM) {
            if (lc.redemption != SFSPTypes.Redemption.AVAILABLE) return SFSPCodes.DENY_ASSET_STATE;
        }
        return SFSPCodes.ALLOW;
    }
}
