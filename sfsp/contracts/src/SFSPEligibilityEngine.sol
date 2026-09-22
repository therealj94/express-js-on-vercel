// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
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

    /// @dev H16 · propósito BASE. Con la referencia global del sujeto fuera de la
    ///      cadena, «sujeto conocido» deja de poder preguntarse en abstracto: una
    ///      dirección se conoce DENTRO de un propósito o no se conoce. Cuando la
    ///      política no exige ningún claim, el alcance que se comprueba es éste:
    ///      una dirección sin alta en BASE es fuente desconocida, no denegada.
    bytes32 public constant PURPOSE_BASE = bytes32("BASE");

    /// @dev §12.5 · alcance canónico de SET_POLICY sobre el motor. Va en
    ///      `evidenceRoot` junto con la acción y el contenido de la política; el
    ///      `assetId` del payload es el activo afectado de verdad.
    bytes32 public constant POLICY_SCOPE = bytes32("SFSP:GOV:ELIGIBILITY_POLICY");

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
    /// @dev H16 · la lista de bloqueo se mudó al adaptador de identidad y pasó a
    ///      estar indexada por (propósito, compromiso). Aquí ya no hay ninguna
    ///      referencia de sujeto con la que indexarla, y ése es el punto.
    event PolicyAuthorizationConsumed(bytes32 indexed assetId, bytes32 indexed action, bytes32 digest);

    error PolicyNotAuthorized(bytes32 digest);
    error AuthorizationActionMismatch(bytes32 expected, bytes32 got);
    error PolicyVersionMismatch(uint32 expected, uint32 got);
    error PolicyContentMismatch(bytes32 expected, bytes32 got);

    ISFSPAssetRegistry public immutable registry;
    ISFSPIdentityAdapter public immutable identity;
    ISFSPGovernanceController public immutable governance;

    mapping(bytes32 => Policy) private _policies;                 // key(assetId,action)
    mapping(bytes32 => mapping(bytes32 => bool)) private _jurisdictionAllowed;
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

    /// @notice Fija la política de (activo, acción) con DOBLE CONTROL.
    /// @dev P03/§12.5 · fila `SET_POLICY`. Hasta este lote bastaba el rol
    ///      TECH_OPS: una sola cuenta podía abrir una acción prohibida, subir un
    ///      límite o quitar el claim exigido, y todas las rutas de dinero pasan
    ///      por aquí. Ahora el ejecutor recalcula el digest del §12.1 desde sus
    ///      argumentos REALES y lo consume:
    ///        · `assetId`        el activo afectado;
    ///        · `amount`         la versión ANTERIOR de esa política;
    ///        · `amountSecondary` la versión NUEVA, que es la anterior más uno;
    ///        · `evidenceRoot`   keccak256(POLICY_SCOPE, acción, política), es
    ///          decir el contenido exacto que se va a escribir.
    ///      Cambiar un solo campo de `p`, o apuntar a otra acción, cambia el
    ///      `evidenceRoot`, cambia el digest y la aprobación deja de servir. El
    ///      rol TECH_OPS se conserva para EJECUTAR: es separación de funciones,
    ///      no autorización.
    /// @param policyAction acción de la política (`MINT`, `TRANSFER_OUT`, ...).
    ///        Va aparte del `action` del payload, que vale siempre `SET_POLICY`.
    function setPolicy(
        bytes32 assetId,
        bytes32 policyAction,
        Policy calldata p,
        SFSPAuthorization.Payload calldata auth,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        if (auth.action != bytes32("SET_POLICY")) {
            revert AuthorizationActionMismatch(bytes32("SET_POLICY"), auth.action);
        }
        if (auth.assetId != assetId) revert AuthorizationActionMismatch(assetId, auth.assetId);

        uint32 previous = _policies[_key(assetId, policyAction)].version;
        uint32 next = previous + 1;
        // Versión anterior y nueva, las dos dentro del digest (§12.5). Con las dos
        // comprometidas, una aprobación no se puede aplicar sobre un estado
        // distinto del que vieron los aprobadores.
        if (auth.amount != previous) revert PolicyVersionMismatch(previous, uint32(auth.amount));
        if (auth.amountSecondary != next) revert PolicyVersionMismatch(next, uint32(auth.amountSecondary));

        bytes32 contenido = policyDigest(policyAction, p);
        if (auth.evidenceRoot != contenido) revert PolicyContentMismatch(contenido, auth.evidenceRoot);

        if (!governance.isAuthorizationApproved(approvedDigest)) revert PolicyNotAuthorized(approvedDigest);
        SFSPAuthorization.Payload memory m = auth;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        Policy memory stored = p;
        stored.configured = true;
        stored.version = next;
        _policies[_key(assetId, policyAction)] = stored;
        emit PolicyConfigured(assetId, policyAction, next);
        emit PolicyAuthorizationConsumed(assetId, policyAction, approvedDigest);
    }

    /// @notice Compromiso del CONTENIDO de una política, campo a campo.
    /// @dev `pure` y pública para que el aprobador calcule exactamente lo mismo
    ///      que recalculará el ejecutor. Se usa `abi.encode` y no
    ///      `encodePacked` por la misma razón del §12.1: con posición fija por
    ///      campo, dos políticas distintas no se pueden reagrupar en la misma
    ///      cadena de bytes.
    function policyDigest(bytes32 policyAction, Policy calldata p) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                POLICY_SCOPE,
                policyAction,
                p.actionAllowed,
                p.requiresHumanReview,
                p.requiresAuthorization,
                p.requiresDecimalsKnown,
                p.jurisdictionAllowlist,
                p.requiredPurpose,
                p.maxAmount
            )
        );
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
    /// @param account dirección evaluada. H16 · el motor ya NO recibe una
    ///        referencia de sujeto: la resolución por propósito ocurre dentro del
    ///        adaptador de identidad y aquí sólo entra la dirección que va a
    ///        operar, que es un dato público de todas formas.
    /// @param context compatibilidad: una sola palabra que hacía de monto Y de
    ///        contexto de autorización a la vez.
    /// @dev H06 · CAMINO HEREDADO. Se conserva porque hay lecturas de interfaz que
    ///      sólo quieren el monto, pero **no debe usarse para autorizar**: con una
    ///      sola palabra, `maxAmount` y el contexto autorizado son el mismo valor,
    ///      de forma que dos operaciones distintas del mismo monto comparten
    ///      autorización. Las rutas de dinero usan `evaluateOperation`.
    function evaluate(address account, bytes32 assetId, bytes32 action, bytes32 context)
        external
        view
        returns (uint8 result, bytes32 reasonCode, uint32 policyVersion)
    {
        return _evaluate(account, assetId, action, uint256(context), context);
    }

    /// @notice Evaluación con el monto y el contexto de autorización SEPARADOS.
    /// @param amount monto real de la operación, para el límite por operación.
    /// @param authorizationDigest digest del §12.1 que compromete el contenido
    ///        completo. `0` significa «sin autorización de gobierno presentada»:
    ///        una política que exija autorización deniega, no pasa.
    function evaluateOperation(
        address account,
        bytes32 assetId,
        bytes32 action,
        uint256 amount,
        bytes32 authorizationDigest
    ) external view returns (uint8 result, bytes32 reasonCode, uint32 policyVersion) {
        return _evaluate(account, assetId, action, amount, authorizationDigest);
    }

    function _evaluate(address account, bytes32 assetId, bytes32 action, uint256 amount, bytes32 authContext)
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

        // 7 y 8. Sujeto y claim, SIEMPRE dentro de un propósito (H16). El motor
        //     ya no recibe ni pide la referencia global del sujeto: le pregunta
        //     al adaptador por (dirección, propósito) y recibe booleanos. El
        //     propósito es el que la política exige; si no exige ninguno, el
        //     alcance es `PURPOSE_BASE`, que es lo mínimo para que una dirección
        //     cuente como sujeto conocido.
        (uint8 subjCode, bytes32 subjReason) = _subjectCheck(account, p.requiredPurpose);
        if (subjCode != SFSPCodes.ALLOW) return (subjCode, subjReason, policyVersion);

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

    /// @dev H16 · sujeto y claim, SIEMPRE dentro de un propósito. Va en función
    ///      aparte por dos razones: el marco de pila de `_evaluate` no admite
    ///      cuatro booleanos más en el EVM de Paris, y así la comprobación de
    ///      identidad se lee entera de una vez.
    ///      "No consta" no equivale a "no cumple": el primero es fuente
    ///      desconocida, el segundo es una denegación de elegibilidad.
    function _subjectCheck(address account, bytes32 requiredPurpose)
        internal
        view
        returns (uint8 code, bytes32 reason)
    {
        if (account == address(0)) return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_SUBJECT_UNKNOWN);
        bytes32 alcance = requiredPurpose != bytes32(0) ? requiredPurpose : PURPOSE_BASE;
        (bool bound, bool blocked, bool claimKnown, bool claimValid) = identity.purposeStatus(account, alcance);
        if (!bound) return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_SUBJECT_UNKNOWN);
        if (blocked) return (SFSPCodes.DENY_ELIGIBILITY, bytes32("SUBJECT_BLOCKED"));
        if (requiredPurpose != bytes32(0)) {
            if (!claimKnown) return (SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_CLAIM_MISSING);
            if (!claimValid) return (SFSPCodes.DENY_ELIGIBILITY, SFSPCodes.R_CLAIM_MISSING);
        }
        return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
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
