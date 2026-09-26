// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {
    ISFSPAssetRegistry,
    ISFSPIdentityAdapter,
    ISFSPGovernanceController,
    ISFSPLicenseRegistry
} from "./lib/ISFSP.sol";

/// @title Motor de elegibilidad.
/// @notice `evaluate` es de SÓLO LECTURA y NO emite eventos: `EligibilityEvaluated`
///         no existe (§3). La auditoría de rechazos vive en el registro operativo.
/// @dev Hay política por (activo, acción) para TODAS las clases. No existe una
///      clase que "pase automáticamente": si la política no está fijada, la
///      respuesta es BLOCKED_DECISION, nunca ALLOW.
///
///      SFSP v0.3 §7 (SFSP-120) · MATRIZ DE PAÍSES. El acceso es abierto por
///      defecto: todo país no evaluado está en SOLO_ENTRANTE, que permite todo
///      salvo SUSCRIBIR en primaria (`SUBSCRIBE`). BLOQUEADO (sanción u orden de
///      autoridad, con su fundamento) deniega TODAS las acciones. El control por
///      jurisdicción del residente se aplica sólo a la suscripción primaria.
///      Cambio respecto de draft-0.5: la lista `jurisdictionAllowlist` de la
///      política —que bloquea por defecto— se conserva tal cual para no alterar
///      políticas ya fijadas, pero es una lista sobre la jurisdicción DEL ACTIVO,
///      no del residente, y es opcional (falsa por defecto). Por el v0.3 §7 no
///      debe activarse en acciones distintas de `SUBSCRIBE`; la residencia del
///      adquirente la gobierna la matriz de países de este contrato.
contract SFSPEligibilityEngine is SFSPAccessControl {
    // Acciones canónicas evaluables.
    bytes32 public constant ACTION_MINT = bytes32("MINT");
    bytes32 public constant ACTION_TRANSFER_OUT = bytes32("TRANSFER_OUT");
    bytes32 public constant ACTION_TRANSFER_IN = bytes32("TRANSFER_IN");
    bytes32 public constant ACTION_SETTLE = bytes32("SETTLE");
    bytes32 public constant ACTION_REDEEM = bytes32("REDEEM");
    bytes32 public constant ACTION_MIGRATION_CLAIM = bytes32("MIGRATION_CLAIM");
    /// @dev v0.3 §7 · suscripción en oferta primaria. Es la ÚNICA acción que
    ///      SOLO_ENTRANTE deniega; recibir, mantener, transferir y redimir no.
    bytes32 public constant ACTION_SUBSCRIBE = bytes32("SUBSCRIBE");

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

    // ------------------------------------------------ v0.3 §7 y §8.5
    /// @dev Apéndice A · País en la matriz. El 0 es SOLO_ENTRANTE: el estado de
    ///      todo país no evaluado. El orden es parte del contrato.
    enum CountryState { SOLO_ENTRANTE, PERMITIDO, PERMITIDO_CON_CONDICIONES, BLOQUEADO }

    /// @dev Parámetros del límite de exposición (v0.3 §8.5, decisión D03/D04 en
    ///      §18). `set == false` ⇒ BLOCKED_DECISION: no hay valor por defecto.
    ///      Son reglas PÚBLICAS: Genesis ID las aplica FUERA de la cadena sobre
    ///      el agregado de la identidad (SFSP-110 §0). En la cadena sólo acotan
    ///      la vigencia del resultado que Genesis ID trae (`declarationTtl`).
    struct ExposureParams {
        bool set;
        uint32 incomeBps;       // porcentaje del ingreso autodeclarado, en pb
        uint256 floor;          // piso, en unidad de cuenta
        uint256 ceiling;        // techo, en unidad de cuenta
        uint64 declarationTtl;  // vigencia máxima de un resultado de exposición
    }

    /// @dev Resultado del límite de exposición para UNA adquisición (v0.3 §11 y
    ///      §12, SFSP-110 §0): Genesis ID calcula fuera de la cadena el agregado
    ///      de la identidad —todas sus direcciones, a costo de adquisición,
    ///      contra el % de su ingreso autodeclarado— y trae a la cadena sólo el
    ///      resultado: «esta dirección puede adquirir hasta `maxUnits` de este
    ///      activo hasta `validUntil`, con la declaración del adquirente
    ///      `documentHash` v`documentVersion` aceptada». No viaja ningún
    ///      compromiso estable de la identidad ni el ingreso: desde la cadena no
    ///      se puede saber que dos direcciones son de la misma persona. Se gasta
    ///      en la colocación que lo usa.
    struct ExposureClearance {
        uint256 maxUnits;
        uint64 validUntil;
        uint32 documentVersion;
        bytes32 documentHash;
    }

    /// @dev Base legal de la colocación primaria de un activo: la licencia o
    ///      autorización (titular, tipo) del registro de licencias.
    struct PlacementBasis {
        bool set;
        bytes32 holder;
        bytes32 licenseType;
    }

    event CountryStatusChanged(
        bytes32 indexed countryCode, uint8 previousState, uint8 newState, bytes32 reasonCode, bytes32 evidenceHash
    );
    event ExposureLimitRecorded(bytes32 indexed declarationRef, bytes32 regime, uint64 validUntil);
    event AcquirerDeclarationRecorded(
        bytes32 indexed assetId, bytes32 indexed declarationRef, bytes32 documentHash, uint32 documentVersion
    );
    event PlacementBasisSet(
        bytes32 indexed assetId, bytes32 indexed holder, bytes32 indexed licenseType, bytes32 reasonCode
    );
    event ExposureParamsSet(
        bytes32 indexed digest, uint32 incomeBps, uint256 floor, uint256 ceiling, uint64 declarationTtl
    );
    /// @dev D13 · criterio aprobado de ACREDITADO o SOFISTICADO (hash del acta).
    event InvestorCriteriaSet(bytes32 indexed purpose, bytes32 criteriaHash, bytes32 reasonCode);

    error OrderMismatch(bytes32 field, bytes32 expected, bytes32 got);
    error CountryCodeInvalid(bytes32 countryCode);
    error CountryTransitionInvalid(uint8 fromState, uint8 toState);
    error BlockedCountriesFull(uint256 max);
    error OpenCountriesFull(uint256 max);
    error EvidenceRequired();
    error ReasonRequired();
    error ExposureParamsInvalid(bytes32 reason);
    error ExposureParamsNotSet(uint8 code);
    error NotGrowthSegment(bytes32 assetId);
    error DeclarationInvalid(bytes32 reason);
    error InvestorCriteriaInvalid(bytes32 purpose);
    /// @dev La suscripción no dio ALLOW: el ejecutor no coloca (SFSP-120 §0.3).
    error SubscriptionRejected(uint8 code, bytes32 reason);

    bytes32 public constant ACTION_SET_COUNTRY = bytes32("SET_COUNTRY");
    bytes32 public constant ACTION_SET_EXPOSURE_PARAMS = bytes32("SET_EXPOSURE_PARAMS");
    bytes32 public constant ACTION_SET_PLACEMENT_BASIS = bytes32("SET_PLACEMENT_BASIS");
    bytes32 public constant ACTION_SET_INVESTOR_CRITERIA = bytes32("SET_INVESTOR_CRITERIA");
    bytes32 public constant SCOPE_COUNTRY = bytes32("SFSP:GOV:COUNTRY_MATRIX");
    bytes32 public constant SCOPE_EXPOSURE = bytes32("SFSP:GOV:EXPOSURE_LIMIT");
    bytes32 public constant SCOPE_INVESTOR_CRITERIA = bytes32("SFSP:GOV:INVESTOR_CRITERIA");

    /// @dev Propósitos de identidad. La residencia es un propósito por país
    ///      (`residencePurpose`). La exposición NO tiene propósito en la
    ///      cadena: se agrega fuera, en Genesis ID (ver `ExposureClearance`).
    bytes32 public constant RESIDENCE_TAG = keccak256("SFSP.PURPOSE.RESIDENCE.v1");
    /// @dev Los tres perfiles que admite la notificación de oferta exenta
    ///      (v0.3 §6). No son parámetros: los fija el texto de la exención. Los
    ///      CRITERIOS de acreditado y sofisticado sí lo son (D13): mientras no
    ///      estén fijados, esos dos perfiles dan BLOCKED_DECISION.
    bytes32 public constant PURPOSE_PROSPERA_RESIDENT = bytes32("RESIDENTE_PROSPERA");
    bytes32 public constant PURPOSE_ACCREDITED = bytes32("INVERSIONISTA_ACREDITADO");
    bytes32 public constant PURPOSE_SOPHISTICATED = bytes32("INVERSIONISTA_SOFISTICADO");
    /// @dev `SFSPLicenseRegistry.LicenseKind.AUTORIZACION_LIMITADA`.
    uint8 public constant LICENSE_KIND_LIMITED = 1;
    bytes32 public constant REGIME_CRECIMIENTO = bytes32("CRECIMIENTO");
    bytes32 public constant DECLARATION_TAG = keccak256("SFSP.EXPOSURE.DECLARATION.v1");
    bytes32 public constant ACQUIRER_TAG = keccak256("SFSP.ACQUIRER.DECLARATION.v1");
    /// @dev Genesis ID: registra el resultado del límite de exposición de una
    ///      adquisición concreta. Lo hace un operador, no la dirección del
    ///      adquirente, y sin ninguna referencia estable de la identidad (H16).
    bytes32 public constant EXPOSURE_OPERATOR = keccak256("SFSP.ROLE.EXPOSURE_OPERATOR");
    /// @dev Los contratos que COLOCAN (motor de reservas, controlador de
    ///      emisión, bóveda nativa, tesorería): aplican la suscripción en la
    ///      misma transacción que la colocación y gastan el resultado de
    ///      exposición (SFSP-120 §0.3, regla 1).
    bytes32 public constant SUBSCRIPTION_EXECUTOR = keccak256("SFSP.ROLE.SUBSCRIPTION_EXECUTOR");
    /// @dev Techo técnico de las listas de países (bloqueados y abiertos a la
    ///      suscripción): cada evaluación las recorre. No es un parámetro económico.
    uint256 public constant MAX_BLOCKED_COUNTRIES = 64;
    uint256 public constant MAX_OPEN_COUNTRIES = 64;

    ISFSPLicenseRegistry public licenses;
    mapping(bytes32 => CountryState) private _country;
    bytes32[] private _blockedCountries;
    mapping(bytes32 => uint256) private _blockedIndex;              // país => índice + 1
    /// @dev Países PERMITIDO o PERMITIDO_CON_CONDICIONES: los únicos desde los
    ///      que se puede suscribir. El resto es SOLO_ENTRANTE o BLOQUEADO.
    bytes32[] private _openCountries;
    mapping(bytes32 => uint256) private _openIndex;                 // país => índice + 1
    ExposureParams private _exposure;
    mapping(address => mapping(bytes32 => ExposureClearance)) private _clearance; // dirección => activo
    uint256 private _clearanceNonce;
    mapping(bytes32 => PlacementBasis) private _placement;
    /// @dev D13 · hash del acta que fija el criterio; 0 = null (BLOCKED_DECISION).
    mapping(bytes32 => bytes32) private _investorCriteria;

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
        (result, reasonCode, policyVersion) = _evaluate(account, assetId, action, uint256(context), context);
        if (result == SFSPCodes.ALLOW && action == ACTION_SUBSCRIBE) {
            (result, reasonCode) = (SFSPCodes.DENY_JURISDICTION, R_INBOUND_ONLY);
        }
        return _finish(assetId, action, result, reasonCode, policyVersion);
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
        (result, reasonCode, policyVersion) = _evaluate(account, assetId, action, amount, authorizationDigest);
        // Una suscripción evaluada sin acreditar residencia es la de un país no
        // evaluado: SOLO_ENTRANTE, que no suscribe (v0.3 §7).
        if (result == SFSPCodes.ALLOW && action == ACTION_SUBSCRIBE) {
            (result, reasonCode) = (SFSPCodes.DENY_JURISDICTION, R_INBOUND_ONLY);
        }
        return _finish(assetId, action, result, reasonCode, policyVersion);
    }

    /// @notice Evaluación de una SUSCRIPCIÓN primaria (v0.3 §7 y §8.5).
    /// @dev Además de todo lo de `evaluateOperation`: residencia acreditada en
    ///      un país que permita suscribir; base legal de la colocación y, si es
    ///      la notificación de oferta exenta, su alcance; y en el Mercado de
    ///      Crecimiento, el resultado del límite de exposición de la identidad
    ///      que Genesis ID trajo para ESTA dirección y ESTE activo.
    ///      El país no lo declara el llamador: se busca entre los países
    ///      abiertos aquel en que la dirección acredita residencia (claim
    ///      vigente). Callarlo no ayuda: sin residencia acreditada en un país
    ///      abierto, la dirección es SOLO_ENTRANTE.
    /// @param amount unidades del activo que se colocarían.
    function evaluateSubscription(address account, bytes32 assetId, uint256 amount, bytes32 authorizationDigest)
        external
        view
        returns (uint8 result, bytes32 reasonCode, uint32 policyVersion)
    {
        return _subscription(account, assetId, amount, authorizationDigest);
    }

    /// @notice Aplica la suscripción en la ruta de dinero (SFSP-120 §0.3).
    /// @dev Lo llama, en la MISMA transacción que la colocación, cada contrato
    ///      que saca unidades del emisor o de su tesorería hacia un tercero:
    ///      `SFSPReserveEngine.place`, `SFSPIssuanceController.mint` y
    ///      `mintOnDemand`, `SFSPNativeVault.releaseOnDemand` y
    ///      `SFSPTreasuryDesk.sell`. Revierte si la evaluación no es ALLOW y, en
    ///      el Mercado de Crecimiento, gasta el resultado de exposición: un
    ///      resultado sirve para una sola colocación.
    function enforceSubscription(address account, bytes32 assetId, uint256 amount)
        external
        onlyRole(SUBSCRIPTION_EXECUTOR)
    {
        (uint8 code, bytes32 reason,) = _subscription(account, assetId, amount, bytes32(0));
        if (code != SFSPCodes.ALLOW) revert SubscriptionRejected(code, reason);
        (bytes32 segment,) = registry.segmentOf(assetId);
        if (segment == SFSPTypes.SEGMENT_CRECIMIENTO) delete _clearance[account][assetId];
    }

    function _subscription(address account, bytes32 assetId, uint256 amount, bytes32 authorizationDigest)
        internal
        view
        returns (uint8 result, bytes32 reasonCode, uint32 policyVersion)
    {
        (result, reasonCode, policyVersion) = _evaluate(account, assetId, ACTION_SUBSCRIBE, amount, authorizationDigest);
        if (result == SFSPCodes.ALLOW) (result, reasonCode) = _subscriptionCheck(account, assetId, amount);
        return _finish(assetId, ACTION_SUBSCRIBE, result, reasonCode, policyVersion);
    }

    /// @dev Paso 12 (revisión humana), común a todas las entradas: se responde
    ///      después de todo lo automático, para que el revisor no reciba casos
    ///      que ya tenían un deny objetivo.
    function _finish(bytes32 assetId, bytes32 action, uint8 result, bytes32 reasonCode, uint32 policyVersion)
        internal
        view
        returns (uint8, bytes32, uint32)
    {
        if (result == SFSPCodes.ALLOW && _policies[_key(assetId, action)].requiresHumanReview) {
            return (SFSPCodes.REVIEW_REQUIRED, SFSPCodes.R_REVIEW, policyVersion);
        }
        return (result, reasonCode, policyVersion);
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

        // 12. La revisión humana la aplica `_finish`, después de lo específico
        //     de cada entrada (p. ej. la suscripción), por la misma razón de
        //     siempre: el revisor no recibe casos con un deny objetivo.
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
        // v0.3 §7 · BLOQUEADO deniega TODAS las acciones. Se busca si la cuenta
        // tiene alta de residencia en algún país bloqueado; no hace falta que el
        // llamador declare el país, así que no se elude callándolo.
        if (_residesInBlockedCountry(account)) return (SFSPCodes.DENY_JURISDICTION, R_COUNTRY_BLOCKED);
        return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
    }

    /// @dev Los ejes se leen por separado. DELISTED no toca saldos ni visibilidad,
    ///      así que no bloquea una transferencia de salida por sí mismo.
    function _assetStateFor(SFSPTypes.Lifecycle memory lc, bytes32 action) internal pure returns (uint8) {
        if (lc.legal == SFSPTypes.Legal.RESTRICTED_BY_LAW) return SFSPCodes.DENY_ASSET_STATE;
        if (lc.transferability == SFSPTypes.Transferability.FROZEN) return SFSPCodes.DENY_ASSET_STATE;

        if (action == ACTION_MINT || action == ACTION_SUBSCRIBE) {
            // Emitir —y suscribir en primaria— exige expediente aprobado;
            // UNDER_REVIEW no autoriza ni la emisión ni la colocación.
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

    // ======================================================================
    // v0.3 §7 · matriz de países · §6 base de colocación · §8.5 exposición
    // ======================================================================

    // Códigos de motivo: los del catálogo de ESTADOS-Y-EVENTOS §C. El catálogo
    // se completa ANTES de usar un código nuevo, y uno retirado no se reutiliza.
    bytes32 internal constant R_INBOUND_ONLY = bytes32("COUNTRY_INBOUND_ONLY");
    bytes32 internal constant R_COUNTRY_BLOCKED = bytes32("COUNTRY_BLOCKED");
    bytes32 internal constant R_COUNTRY_CONDITIONS = bytes32("COUNTRY_CONDITIONS_UNSET");
    bytes32 internal constant R_PLACEMENT_UNSET = bytes32("PLACEMENT_BASIS_UNSET");
    bytes32 internal constant R_PLACEMENT_LICENSE = bytes32("LICENCIA_NO_OTORGADA");
    bytes32 internal constant R_EXEMPT_SCOPE = bytes32("FUERA_DE_ALCANCE_OFERTA_EXENTA");
    bytes32 internal constant R_INVESTOR_CRITERIA = bytes32("INVESTOR_CRITERIA_UNSET");
    bytes32 internal constant R_SEGMENT_UNKNOWN = bytes32("SEGMENT_UNKNOWN");
    bytes32 internal constant R_EXPOSURE_UNSET = bytes32("EXPOSURE_PARAMS_UNSET");
    bytes32 internal constant R_EXPOSURE_UNKNOWN = bytes32("EXPOSURE_RESULT_MISSING");
    bytes32 internal constant R_EXPOSURE_LIMIT = bytes32("EXPOSURE_LIMIT_EXCEEDED");
    bytes32 internal constant R_LICENSES_UNWIRED = bytes32("LICENSE_REGISTRY_UNSET");

    /// @notice Cablea el registro de licencias. Mientras no esté cableado,
    ///         toda suscripción responde BLOCKED_DECISION.
    function setLicenseRegistry(address licenses_) external onlyRole(DBNX_BOARD) {
        require(licenses_ != address(0), "SFSP: licenses=0");
        licenses = ISFSPLicenseRegistry(licenses_);
    }

    // ------------------------------------------------------------- lecturas

    function residencePurpose(bytes32 countryCode) public pure returns (bytes32) {
        return keccak256(abi.encode(RESIDENCE_TAG, countryCode));
    }

    function countryStatusOf(bytes32 countryCode) external view returns (CountryState) {
        return _country[countryCode];
    }

    function blockedCountries() external view returns (bytes32[] memory) {
        return _blockedCountries;
    }

    /// @notice Países desde los que se puede suscribir: PERMITIDO o
    ///         PERMITIDO_CON_CONDICIONES.
    function openCountries() external view returns (bytes32[] memory) {
        return _openCountries;
    }

    function exposureParams() external view returns (ExposureParams memory) {
        return _exposure;
    }

    function placementBasisOf(bytes32 assetId) external view returns (PlacementBasis memory) {
        return _placement[assetId];
    }

    /// @notice Resultado de exposición vigente de una dirección para un activo.
    function exposureClearanceOf(address account, bytes32 assetId) external view returns (ExposureClearance memory) {
        return _clearance[account][assetId];
    }

    /// @notice D13 · hash del acta del criterio; 0 = sin fijar (BLOCKED_DECISION).
    function investorCriteriaOf(bytes32 purpose) external view returns (bytes32) {
        return _investorCriteria[purpose];
    }

    // ------------------------------------------------------------- suscripción

    /// @dev País → base de colocación (y alcance de la oferta exenta) →
    ///      exposición. Cada paso devuelve su código; ninguno se degrada a ALLOW.
    function _subscriptionCheck(address account, bytes32 assetId, uint256 amount)
        internal
        view
        returns (uint8, bytes32)
    {
        (uint8 c, bytes32 r) = _countryCheck(account);
        if (c != SFSPCodes.ALLOW) return (c, r);
        (c, r) = _placementCheck(account, assetId);
        if (c != SFSPCodes.ALLOW) return (c, r);
        return _exposureCheck(account, assetId, amount);
    }

    /// @dev Residencia no acreditada en un país abierto = país no evaluado =
    ///      SOLO_ENTRANTE. Con residencia acreditada en un país PERMITIDO,
    ///      suscribe; si sólo la acredita en uno PERMITIDO_CON_CONDICIONES, cuyas
    ///      reglas por instrumento no están parametrizadas, la decisión se
    ///      bloquea. BLOQUEADO ya lo resolvió `_subjectCheck` (deniega todo).
    function _countryCheck(address account) internal view returns (uint8, bytes32) {
        bool conditional;
        uint256 n = _openCountries.length;
        for (uint256 i = 0; i < n; i++) {
            bytes32 c = _openCountries[i];
            if (!_hasValidClaim(account, residencePurpose(c))) continue;
            if (_country[c] == CountryState.PERMITIDO) return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
            conditional = true;
        }
        if (conditional) return (SFSPCodes.BLOCKED_DECISION, R_COUNTRY_CONDITIONS);
        return (SFSPCodes.DENY_JURISDICTION, R_INBOUND_ONLY);
    }

    /// @dev v0.3 §6 y §7: mientras la colocación se base en la notificación de
    ///      oferta exenta, sólo suscriben residentes de Próspera, acreditados y
    ///      sofisticados, con independencia del estado del país.
    ///      SFSP-140 §4 regla 2 · mientras el criterio de acreditado o de
    ///      sofisticado sea null (D13), sólo RESIDENTE_PROSPERA puede evaluarse:
    ///      una suscripción que dependa de los otros dos es BLOCKED_DECISION,
    ///      nunca ALLOW (T-120-28).
    function _placementCheck(address account, bytes32 assetId) internal view returns (uint8, bytes32) {
        if (address(licenses) == address(0)) return (SFSPCodes.BLOCKED_DECISION, R_LICENSES_UNWIRED);
        PlacementBasis storage b = _placement[assetId];
        if (!b.set) return (SFSPCodes.BLOCKED_DECISION, R_PLACEMENT_UNSET);
        (bytes32 licenseId, uint8 kind, bool effective) = licenses.resolveLicense(b.holder, b.licenseType);
        if (licenseId == bytes32(0) || !effective) return (SFSPCodes.DENY_AUTHORIZATION, R_PLACEMENT_LICENSE);
        if (kind != LICENSE_KIND_LIMITED) return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
        if (_hasValidClaim(account, PURPOSE_PROSPERA_RESIDENT)) return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
        bool pending;
        bytes32[2] memory perfiles = [PURPOSE_ACCREDITED, PURPOSE_SOPHISTICATED];
        for (uint256 i = 0; i < 2; i++) {
            if (!_hasValidClaim(account, perfiles[i])) continue;
            if (_investorCriteria[perfiles[i]] != bytes32(0)) return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
            pending = true;
        }
        if (pending) return (SFSPCodes.BLOCKED_DECISION, R_INVESTOR_CRITERIA);
        return (SFSPCodes.DENY_ELIGIBILITY, R_EXEMPT_SCOPE);
    }

    function _hasValidClaim(address account, bytes32 purpose) internal view returns (bool) {
        (bool bound, bool blocked,, bool valid) = identity.purposeStatus(account, purpose);
        return bound && !blocked && valid;
    }

    /// @dev v0.3 §8.5 · sólo en el Mercado de Crecimiento. El agregado por
    ///      identidad lo calcula Genesis ID fuera de la cadena; aquí se exige su
    ///      resultado para ESTA dirección y ESTE activo, vigente y suficiente.
    ///      Sin resultado: UNKNOWN_SOURCE, nunca se supone cero (SFSP-120 §0.7).
    function _exposureCheck(address account, bytes32 assetId, uint256 amount)
        internal
        view
        returns (uint8, bytes32)
    {
        (bytes32 segment, bool inForce) = registry.segmentOf(assetId);
        if (!inForce) return (SFSPCodes.UNKNOWN_SOURCE, R_SEGMENT_UNKNOWN);
        if (segment != SFSPTypes.SEGMENT_CRECIMIENTO) return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
        if (!_exposure.set) return (SFSPCodes.BLOCKED_DECISION, R_EXPOSURE_UNSET);
        ExposureClearance storage c = _clearance[account][assetId];
        if (c.validUntil <= block.timestamp) return (SFSPCodes.UNKNOWN_SOURCE, R_EXPOSURE_UNKNOWN);
        if (amount == 0 || amount > c.maxUnits) return (SFSPCodes.DENY_LIMIT, R_EXPOSURE_LIMIT);
        return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
    }

    function _residesInBlockedCountry(address account) internal view returns (bool) {
        uint256 n = _blockedCountries.length;
        for (uint256 i = 0; i < n; i++) {
            (bool bound,,,) = identity.purposeStatus(account, residencePurpose(_blockedCountries[i]));
            if (bound) return true;
        }
        return false;
    }

    // ------------------------------------------------------------- gobierno

    function countryContent(bytes32 countryCode, uint8 newState, bytes32 reasonCode, bytes32 evidenceHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(SCOPE_COUNTRY, countryCode, newState, reasonCode, evidenceHash));
    }

    function exposureParamsContent(ExposureParams calldata e, bytes32 reasonCode) public pure returns (bytes32) {
        return keccak256(abi.encode(SCOPE_EXPOSURE, e.incomeBps, e.floor, e.ceiling, e.declarationTtl, reasonCode));
    }

    function placementContent(bytes32 assetId, bytes32 holder, bytes32 licenseType, bytes32 reasonCode)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(ACTION_SET_PLACEMENT_BASIS, assetId, holder, licenseType, reasonCode));
    }

    function investorCriteriaContent(bytes32 purpose, bytes32 criteriaHash, bytes32 reasonCode)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(SCOPE_INVESTOR_CRITERIA, purpose, criteriaHash, reasonCode));
    }

    /// @notice Cambia el estado de un país en la matriz, por orden de gobierno.
    /// @dev `amount` = estado anterior, `amountSecondary` = nuevo. BLOQUEADO
    ///      exige fundamento (`evidenceHash`): no se bloquea por precaución.
    function setCountryStatus(
        bytes32 countryCode,
        CountryState newState,
        bytes32 reasonCode,
        bytes32 evidenceHash,
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        _validateCountryCode(countryCode);
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        CountryState prev = _country[countryCode];
        if (prev == newState) revert CountryTransitionInvalid(uint8(prev), uint8(newState));
        if (newState == CountryState.BLOQUEADO && evidenceHash == bytes32(0)) revert EvidenceRequired();
        if (p.amount != uint256(prev) || p.amountSecondary != uint256(newState)) {
            revert CountryTransitionInvalid(uint8(p.amount), uint8(p.amountSecondary));
        }
        _consumeOrder(
            p,
            approvedDigest,
            ACTION_SET_COUNTRY,
            SCOPE_COUNTRY,
            countryContent(countryCode, uint8(newState), reasonCode, evidenceHash)
        );
        if (newState == CountryState.BLOQUEADO) {
            if (_blockedCountries.length >= MAX_BLOCKED_COUNTRIES) revert BlockedCountriesFull(MAX_BLOCKED_COUNTRIES);
            _blockedCountries.push(countryCode);
            _blockedIndex[countryCode] = _blockedCountries.length;
        } else if (prev == CountryState.BLOQUEADO) {
            _removeFrom(_blockedCountries, _blockedIndex, countryCode);
        }
        // Lista de países abiertos a la suscripción: la que recorre `_countryCheck`.
        bool wasOpen = _isOpen(prev);
        bool isOpen = _isOpen(newState);
        if (isOpen && !wasOpen) {
            if (_openCountries.length >= MAX_OPEN_COUNTRIES) revert OpenCountriesFull(MAX_OPEN_COUNTRIES);
            _openCountries.push(countryCode);
            _openIndex[countryCode] = _openCountries.length;
        } else if (wasOpen && !isOpen) {
            _removeFrom(_openCountries, _openIndex, countryCode);
        }
        _country[countryCode] = newState;
        emit CountryStatusChanged(countryCode, uint8(prev), uint8(newState), reasonCode, evidenceHash);
    }

    function _isOpen(CountryState st) internal pure returns (bool) {
        return st == CountryState.PERMITIDO || st == CountryState.PERMITIDO_CON_CONDICIONES;
    }

    /// @dev Quita `code` de una lista con índice (índice + 1), intercambiando
    ///      con el último. El orden de la lista no significa nada.
    function _removeFrom(bytes32[] storage list, mapping(bytes32 => uint256) storage index, bytes32 code) internal {
        uint256 idx = index[code] - 1;
        uint256 last = list.length - 1;
        if (idx != last) {
            bytes32 moved = list[last];
            list[idx] = moved;
            index[moved] = idx + 1;
        }
        list.pop();
        delete index[code];
    }

    /// @dev ISO 3166-1 alfa-2: dos letras mayúsculas y nada más.
    function _validateCountryCode(bytes32 c) internal pure {
        if (uint256(c) & ((uint256(1) << 240) - 1) != 0) revert CountryCodeInvalid(c);
        for (uint256 i = 0; i < 2; i++) {
            if (c[i] < 0x41 || c[i] > 0x5A) revert CountryCodeInvalid(c);
        }
    }

    /// @notice Fija los parámetros del límite de exposición (§18: «porcentaje,
    ///         piso y techo»). Hasta que existan, el límite responde BLOCKED_DECISION.
    function setExposureParams(
        ExposureParams calldata e,
        bytes32 reasonCode,
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        if (e.incomeBps == 0 || e.incomeBps > 10000) revert ExposureParamsInvalid(bytes32("BPS"));
        if (e.ceiling == 0 || e.floor > e.ceiling) revert ExposureParamsInvalid(bytes32("FLOOR_CEILING"));
        if (e.declarationTtl == 0) revert ExposureParamsInvalid(bytes32("TTL"));
        _consumeOrder(p, approvedDigest, ACTION_SET_EXPOSURE_PARAMS, SCOPE_EXPOSURE, exposureParamsContent(e, reasonCode));
        _exposure = ExposureParams({
            set: true,
            incomeBps: e.incomeBps,
            floor: e.floor,
            ceiling: e.ceiling,
            declarationTtl: e.declarationTtl
        });
        emit ExposureParamsSet(approvedDigest, e.incomeBps, e.floor, e.ceiling, e.declarationTtl);
    }

    /// @notice Fija la base legal de la colocación primaria de un activo: la
    ///         licencia o autorización (titular, tipo) en la que se sustenta.
    function setPlacementBasis(
        bytes32 assetId,
        bytes32 holder,
        bytes32 licenseType,
        bytes32 reasonCode,
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        if (holder == bytes32(0) || licenseType == bytes32(0)) revert DeclarationInvalid(bytes32("BASIS_EMPTY"));
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        _consumeOrder(
            p, approvedDigest, ACTION_SET_PLACEMENT_BASIS, assetId, placementContent(assetId, holder, licenseType, reasonCode)
        );
        _placement[assetId] = PlacementBasis({set: true, holder: holder, licenseType: licenseType});
        emit PlacementBasisSet(assetId, holder, licenseType, reasonCode);
    }

    /// @notice D13 · fija el criterio de INVERSIONISTA_ACREDITADO o de
    ///         INVERSIONISTA_SOFISTICADO, por orden de gobierno con referencia al
    ///         acta (`criteriaHash`). Hasta entonces, una suscripción que dependa
    ///         de ese perfil es BLOCKED_DECISION (SFSP-140 §4 regla 2).
    function setInvestorCriteria(
        bytes32 purpose,
        bytes32 criteriaHash,
        bytes32 reasonCode,
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        if (purpose != PURPOSE_ACCREDITED && purpose != PURPOSE_SOPHISTICATED) revert InvestorCriteriaInvalid(purpose);
        if (criteriaHash == bytes32(0)) revert DeclarationInvalid(bytes32("CRITERIA"));
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        _consumeOrder(
            p,
            approvedDigest,
            ACTION_SET_INVESTOR_CRITERIA,
            SCOPE_INVESTOR_CRITERIA,
            investorCriteriaContent(purpose, criteriaHash, reasonCode)
        );
        _investorCriteria[purpose] = criteriaHash;
        emit InvestorCriteriaSet(purpose, criteriaHash, reasonCode);
    }

    // ------------------------------------------------------------- exposición

    /// @notice Genesis ID trae el RESULTADO del límite de exposición para una
    ///         adquisición concreta (v0.3 §8.5, SFSP-110 §0): la dirección
    ///         `account` puede adquirir hasta `maxUnits` de `assetId` hasta
    ///         `validUntil`, y aceptó la declaración del adquirente
    ///         `documentHash` en su versión `documentVersion`.
    /// @dev Lo que NO viaja, a propósito (v0.3 §11 y §12, SFSP-600 T23): el
    ///      ingreso autodeclarado, el agregado de la identidad y cualquier
    ///      compromiso estable de la identidad. Las dos referencias de los
    ///      eventos salen de un contador, no del sujeto: no enlazan direcciones.
    ///      La vigencia no puede superar `declarationTtl`. Registrar otra vez
    ///      para el mismo par sustituye el resultado anterior.
    function recordExposureClearance(
        address account,
        bytes32 assetId,
        uint256 maxUnits,
        uint64 validUntil,
        bytes32 documentHash,
        uint32 documentVersion
    ) external onlyRole(EXPOSURE_OPERATOR) {
        if (!_exposure.set) revert ExposureParamsNotSet(SFSPCodes.BLOCKED_DECISION);
        (bytes32 segment, bool inForce) = registry.segmentOf(assetId);
        if (!inForce || segment != SFSPTypes.SEGMENT_CRECIMIENTO) revert NotGrowthSegment(assetId);
        if (account == address(0) || maxUnits == 0) revert DeclarationInvalid(bytes32("CLEARANCE"));
        if (validUntil <= block.timestamp || validUntil > block.timestamp + _exposure.declarationTtl) {
            revert DeclarationInvalid(bytes32("VALIDITY"));
        }
        if (documentHash == bytes32(0) || documentVersion == 0) revert DeclarationInvalid(bytes32("DOCUMENT"));
        _clearance[account][assetId] = ExposureClearance({
            maxUnits: maxUnits,
            validUntil: validUntil,
            documentVersion: documentVersion,
            documentHash: documentHash
        });
        _clearanceNonce += 1;
        bytes32 ref = keccak256(abi.encode(DECLARATION_TAG, address(this), _clearanceNonce));
        emit ExposureLimitRecorded(ref, REGIME_CRECIMIENTO, validUntil);
        emit AcquirerDeclarationRecorded(
            assetId, keccak256(abi.encode(ACQUIRER_TAG, ref)), documentHash, documentVersion
        );
    }

    /// @notice Retira un resultado no usado (la compra no se hizo).
    function revokeExposureClearance(address account, bytes32 assetId) external onlyRole(EXPOSURE_OPERATOR) {
        delete _clearance[account][assetId];
    }

    /// @dev Patrón de `consumeAuthorization`: acción, alcance y contenido
    ///      recalculados aquí; la etiqueta aprobada tiene que ser la acción; y
    ///      el digest se gasta.
    function _consumeOrder(
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest,
        bytes32 action,
        bytes32 scope,
        bytes32 content
    ) internal {
        if (p.action != action) revert OrderMismatch(bytes32("ACTION"), action, p.action);
        if (p.assetId != scope) revert OrderMismatch(bytes32("SCOPE"), scope, p.assetId);
        if (p.evidenceRoot != content) revert OrderMismatch(bytes32("CONTENT"), content, p.evidenceRoot);
        bytes32 label = governance.authorizationActionOf(approvedDigest);
        if (label != action) revert OrderMismatch(bytes32("LABEL"), action, label);
        if (!governance.isAuthorizationApproved(approvedDigest)) revert PolicyNotAuthorized(approvedDigest);
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);
    }
}
