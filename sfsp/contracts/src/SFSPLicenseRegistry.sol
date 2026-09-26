// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {ISFSPGovernanceController} from "./lib/ISFSP.sol";

/// @title Registro de licencias (SFSP v0.3 §6 · SFSP-140).
/// @notice Cada módulo del protocolo declara de qué licencias depende y una
///         operación del módulo se rechaza por código cuando alguna no está
///         otorgada y vigente. No basta con que una pantalla la esconda.
/// @dev Tres reglas que este contrato hace cumplir:
///      1. La dependencia se resuelve POR TITULAR, no por el operador del
///         módulo: el módulo dice «licencia de tipo T cuyo titular es X», y el
///         registro busca la licencia de ESE titular. Au Corp. y Orden Global
///         tienen cada una su ATS Clase B, y son licencias independientes.
///      2. Los estados no se saltan (Apéndice A). Las únicas excepciones son las
///         del plazo: una licencia OTORGADA o SUSPENDIDA cuyo plazo terminó pasa
///         a VENCIDA sin actor humano, porque su causa es el reloj.
///      3. Todo cambio, salvo el vencimiento por plazo, es una orden de gobierno
///         aprobada con doble control y con motivo, recalculada aquí desde los
///         argumentos reales y consumida (patrón de `consumeAuthorization`).
///      Ningún número de licencia vive en el código: entra por la orden.
contract SFSPLicenseRegistry is SFSPAccessControl {
    // Apéndice A · Licencia. El orden es parte del contrato: no se reordena.
    enum LicenseState { EN_TRAMITE, OTORGADA, VIGENTE, SUSPENDIDA, VENCIDA, REVOCADA }

    /// @dev La notificación de oferta exenta NO es una licencia: es una
    ///      autorización de alcance limitado (v0.3 §6). El motor de elegibilidad
    ///      lee este tipo y aplica ese alcance a la suscripción primaria.
    enum LicenseKind { LICENCIA, AUTORIZACION_LIMITADA }

    /// @dev Taxonomía ÚNICA de disponibilidad (v0.3 §6). `USO_INTERNO` es el 0
    ///      para que un módulo no declarado nunca se lea como público.
    enum Availability { USO_INTERNO, PROXIMAMENTE, BETA, DISPONIBLE }

    struct LicenseTerms {
        bytes32 holder;        // titular (Genesis ID corporativo, referencia)
        bytes32 operator;      // entidad que opera bajo la licencia
        bytes32 jurisdiction;
        bytes32 licenseType;   // p. ej. "ATS_CLASE_B", "CUSTODIA_CLASE_G"
        LicenseKind kind;
        bytes32 authority;     // autoridad que la otorga (p. ej. RFSA)
    }

    /// @dev Datos del otorgamiento. Todos cero salvo en EN_TRAMITE → OTORGADA.
    struct LicenseGrant {
        bytes32 number;        // número de licencia; nunca se inventa
        uint64 validFrom;
        uint64 validUntil;
        bytes32 documentRef;   // hash del documento de otorgamiento
    }

    struct License {
        bool exists;
        LicenseState state;
        LicenseTerms terms;
        LicenseGrant grant;
    }

    /// @dev Declaración de un módulo: dependencias por (titular, tipo) y la
    ///      disponibilidad que gobierno publica.
    struct ModuleDeclaration {
        bytes32 moduleId;
        bytes32[] holders;
        bytes32[] licenseTypes;
        Availability declared;
        bytes32 reasonCode;
    }

    struct Module {
        bool exists;
        Availability declared;   // parámetro publicado por gobierno
        Availability published;  // último valor efectivo publicado en evento
        bytes32[] depKeys;       // keccak(titular, tipo) de cada dependencia
    }

    event LicenseRegistered(
        bytes32 indexed licenseId,
        bytes32 indexed holder,
        bytes32 indexed licenseType,
        bytes32 operator,
        bytes32 jurisdiction,
        uint8 kind
    );
    event LicenseStatusChanged(bytes32 indexed licenseId, uint8 previousState, uint8 newState, bytes32 reasonCode);
    event ModuleAvailabilityChanged(
        bytes32 indexed moduleId, bytes32 indexed licenseId, uint8 newAvailability, bytes32 reasonCode
    );

    error LicenseUnknown(bytes32 licenseId);
    error LicenseExists(bytes32 licenseId);
    error LicenseSlotTaken(bytes32 holder, bytes32 licenseType, bytes32 current);
    error LicenseTermsInvalid(bytes32 reason);
    error InvalidTransition(uint8 fromState, uint8 toState);
    error GrantInvalid(bytes32 reason);
    error NotInValidityWindow(uint64 validFrom, uint64 validUntil, uint64 nowTs);
    error NotExpiredYet(uint64 validUntil, uint64 nowTs);
    error ModuleUnknown(bytes32 moduleId);
    error ModuleDependenciesInvalid(bytes32 reason);
    error ModuleLicenseNotEffective(bytes32 moduleId, bytes32 holder, bytes32 licenseType);
    error ReasonRequired();
    error OrderMismatch(bytes32 field, bytes32 expected, bytes32 got);
    error OrderNotApproved(bytes32 digest);

    bytes32 public constant ACTION_LICENSE_REGISTER = bytes32("LICENSE_REGISTER");
    bytes32 public constant ACTION_LICENSE_STATUS = bytes32("LICENSE_STATUS");
    bytes32 public constant ACTION_MODULE_AVAILABILITY = bytes32("MODULE_AVAILABILITY");
    /// @dev Alcances de las órdenes: el `assetId` del §12.1 no puede ser cero.
    bytes32 public constant SCOPE_LICENSE = bytes32("SFSP:GOV:LICENSE");
    bytes32 public constant SCOPE_MODULE = bytes32("SFSP:GOV:MODULE");
    bytes32 public constant REASON_TERM_EXPIRED = bytes32("PLAZO_VENCIDO");
    /// @dev Techo técnico (gas), no un parámetro económico.
    uint256 public constant MAX_DEPENDENCIES = 4;

    ISFSPGovernanceController public immutable governance;

    mapping(bytes32 => License) private _licenses;
    mapping(bytes32 => bytes32) private _slot;                        // depKey => licenseId
    mapping(bytes32 => Module) private _modules;
    mapping(bytes32 => bytes32[]) private _modulesByDep;              // depKey => módulos
    mapping(bytes32 => mapping(bytes32 => bool)) private _indexed;    // depKey => módulo => ya indexado

    constructor(address board, address governance_) SFSPAccessControl(board) {
        require(governance_ != address(0), "SFSP: governance=0");
        governance = ISFSPGovernanceController(governance_);
    }

    // ---------------------------------------------------------------- lecturas

    function depKeyOf(bytes32 holder, bytes32 licenseType) public pure returns (bytes32) {
        return keccak256(abi.encode(holder, licenseType));
    }

    function licenseOf(bytes32 licenseId) external view returns (License memory) {
        if (!_licenses[licenseId].exists) revert LicenseUnknown(licenseId);
        return _licenses[licenseId];
    }

    /// @notice Otorgada Y vigente: estado VIGENTE y el reloj dentro del plazo.
    /// @dev El plazo se comprueba aquí y no sólo en `markExpired`: un módulo se
    ///      cierra solo al vencer la licencia, aunque nadie haya registrado aún
    ///      la transición a VENCIDA (T-140-03).
    function isLicenseEffective(bytes32 licenseId) public view returns (bool) {
        License storage l = _licenses[licenseId];
        if (!l.exists || l.state != LicenseState.VIGENTE) return false;
        return block.timestamp >= l.grant.validFrom && block.timestamp < l.grant.validUntil;
    }

    /// @notice Resolución por titular: la licencia de tipo `licenseType` cuyo
    ///         titular es `holder`. `licenseId == 0` si no hay ninguna.
    function resolveLicense(bytes32 holder, bytes32 licenseType)
        external
        view
        returns (bytes32 licenseId, uint8 kind, bool effective)
    {
        licenseId = _slot[depKeyOf(holder, licenseType)];
        if (licenseId == bytes32(0)) return (bytes32(0), 0, false);
        return (licenseId, uint8(_licenses[licenseId].terms.kind), isLicenseEffective(licenseId));
    }

    /// @notice ¿Se puede operar el módulo? Falso si CUALQUIERA de sus licencias
    ///         no está otorgada y vigente, o si gobierno lo declaró PROXIMAMENTE.
    /// @dev `USO_INTERNO` con licencias vigentes sí opera: es operación interna,
    ///      no oferta al público.
    function isModuleAvailable(bytes32 moduleId) public view returns (bool) {
        Module storage m = _modules[moduleId];
        if (!m.exists || m.declared == Availability.PROXIMAMENTE) return false;
        return _allEffective(m);
    }

    /// @notice Disponibilidad PÚBLICA efectiva, en la taxonomía única.
    /// @dev Nada que dependa de una licencia no vigente sale como DISPONIBLE ni
    ///      como BETA (T-140-06): baja a PROXIMAMENTE («en trámite»), salvo que
    ///      el módulo sea de USO_INTERNO, que no se anuncia.
    function availabilityOf(bytes32 moduleId) public view returns (Availability) {
        Module storage m = _modules[moduleId];
        if (!m.exists) revert ModuleUnknown(moduleId);
        return _effectiveAvailability(m);
    }

    function moduleOf(bytes32 moduleId) external view returns (Module memory) {
        if (!_modules[moduleId].exists) revert ModuleUnknown(moduleId);
        return _modules[moduleId];
    }

    function _allEffective(Module storage m) internal view returns (bool) {
        uint256 n = m.depKeys.length;
        for (uint256 i = 0; i < n; i++) {
            if (!isLicenseEffective(_slot[m.depKeys[i]])) return false;
        }
        return n > 0;
    }

    function _effectiveAvailability(Module storage m) internal view returns (Availability) {
        if (m.declared == Availability.USO_INTERNO) return Availability.USO_INTERNO;
        if (!_allEffective(m)) return Availability.PROXIMAMENTE;
        return m.declared;
    }

    // ------------------------------------------------------------ contenidos

    function registerContent(bytes32 licenseId, LicenseTerms calldata t, bytes32 reasonCode)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(SCOPE_LICENSE, ACTION_LICENSE_REGISTER, licenseId, t, reasonCode));
    }

    function transitionContent(bytes32 licenseId, uint8 newState, LicenseGrant calldata g, bytes32 reasonCode)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(SCOPE_LICENSE, ACTION_LICENSE_STATUS, licenseId, newState, g, reasonCode));
    }

    function moduleContent(ModuleDeclaration calldata md) public pure returns (bytes32) {
        return keccak256(abi.encode(SCOPE_MODULE, ACTION_MODULE_AVAILABILITY, md));
    }

    // ------------------------------------------------------------ mutación

    /// @notice Alta de una licencia en EN_TRAMITE. El registro interno puede
    ///         contener licencias en trámite porque hace falta para planificar.
    /// @param p payload del §12.1: `assetId` = SCOPE_LICENSE, `evidenceRoot` =
    ///        `registerContent(...)`.
    function registerLicense(
        bytes32 licenseId,
        LicenseTerms calldata t,
        bytes32 reasonCode,
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        if (licenseId == bytes32(0)) revert LicenseTermsInvalid(bytes32("ID_EMPTY"));
        if (_licenses[licenseId].exists) revert LicenseExists(licenseId);
        if (t.holder == bytes32(0) || t.operator == bytes32(0)) revert LicenseTermsInvalid(bytes32("PARTIES"));
        if (t.licenseType == bytes32(0) || t.jurisdiction == bytes32(0) || t.authority == bytes32(0)) {
            revert LicenseTermsInvalid(bytes32("TERMS"));
        }
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        bytes32 key = depKeyOf(t.holder, t.licenseType);
        bytes32 current = _slot[key];
        // Una licencia viva del mismo titular y tipo no se pisa. Sólo una
        // terminal (VENCIDA o REVOCADA) deja el hueco para su renovación.
        if (current != bytes32(0) && !_isTerminal(_licenses[current].state)) {
            revert LicenseSlotTaken(t.holder, t.licenseType, current);
        }
        _consumeOrder(p, approvedDigest, ACTION_LICENSE_REGISTER, SCOPE_LICENSE, registerContent(licenseId, t, reasonCode));

        License storage l = _licenses[licenseId];
        l.exists = true;
        l.state = LicenseState.EN_TRAMITE;
        l.terms = t;
        _slot[key] = licenseId;
        // El alta es la creación del objeto, no una transición: la publica
        // `LicenseRegistered`, y el estado inicial es siempre EN_TRAMITE.
        emit LicenseRegistered(licenseId, t.holder, t.licenseType, t.operator, t.jurisdiction, uint8(t.kind));
        // Si sustituye a una terminal del mismo titular y tipo, los módulos que
        // dependían de ella siguen cerrados; se recalculan igualmente.
        _refresh(key, licenseId, reasonCode);
    }

    /// @notice Transición de estado por orden de gobierno, sin saltos.
    /// @dev Definidas: EN_TRAMITE→OTORGADA (con número, plazo y documento),
    ///      OTORGADA→VIGENTE (dentro del plazo), VIGENTE↔SUSPENDIDA (volver
    ///      exige estar dentro del plazo), VIGENTE→REVOCADA y SUSPENDIDA→REVOCADA.
    ///      VENCIDA no se ordena: la produce el plazo (`markExpired`).
    ///      `amount` = estado anterior y `amountSecondary` = estado nuevo, los dos
    ///      comprometidos en el digest: una orden aprobada para otro estado de
    ///      partida no se puede aplicar.
    function transitionLicense(
        bytes32 licenseId,
        LicenseState newState,
        LicenseGrant calldata g,
        bytes32 reasonCode,
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        License storage l = _licenses[licenseId];
        if (!l.exists) revert LicenseUnknown(licenseId);
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        LicenseState prev = l.state;
        _checkTransition(l, prev, newState, g);
        if (p.amount != uint256(prev)) revert OrderMismatch(bytes32("PREVIOUS_STATE"), bytes32(uint256(prev)), bytes32(p.amount));
        if (p.amountSecondary != uint256(newState)) {
            revert OrderMismatch(bytes32("NEW_STATE"), bytes32(uint256(newState)), bytes32(p.amountSecondary));
        }
        _consumeOrder(
            p,
            approvedDigest,
            ACTION_LICENSE_STATUS,
            SCOPE_LICENSE,
            transitionContent(licenseId, uint8(newState), g, reasonCode)
        );
        if (newState == LicenseState.OTORGADA) l.grant = g;
        l.state = newState;
        emit LicenseStatusChanged(licenseId, uint8(prev), uint8(newState), reasonCode);
        _refresh(depKeyOf(l.terms.holder, l.terms.licenseType), licenseId, reasonCode);
    }

    /// @notice Vencimiento por plazo. Lo puede registrar cualquiera: sólo
    ///         RESTRINGE, y su actor es el reloj (Apéndice A: «el vencimiento de
    ///         un plazo, que se registra como transición automática con su causa»).
    /// @dev Excepción expresamente definida a la regla de no saltar estados:
    ///      desde OTORGADA (nunca llegó a iniciar) y desde SUSPENDIDA, además de
    ///      VIGENTE, porque el plazo termina igual para las tres.
    function markExpired(bytes32 licenseId) external {
        License storage l = _licenses[licenseId];
        if (!l.exists) revert LicenseUnknown(licenseId);
        LicenseState prev = l.state;
        if (prev != LicenseState.OTORGADA && prev != LicenseState.VIGENTE && prev != LicenseState.SUSPENDIDA) {
            revert InvalidTransition(uint8(prev), uint8(LicenseState.VENCIDA));
        }
        if (block.timestamp < l.grant.validUntil) revert NotExpiredYet(l.grant.validUntil, uint64(block.timestamp));
        l.state = LicenseState.VENCIDA;
        emit LicenseStatusChanged(licenseId, uint8(prev), uint8(LicenseState.VENCIDA), REASON_TERM_EXPIRED);
        _refresh(depKeyOf(l.terms.holder, l.terms.licenseType), licenseId, REASON_TERM_EXPIRED);
    }

    /// @notice Declara (o vuelve a declarar) un módulo, sus dependencias y su
    ///         disponibilidad publicada.
    /// @dev Habilitar (DISPONIBLE o BETA) exige que TODAS las licencias de las
    ///      que depende estén otorgadas y vigentes en ese momento (T-140-05):
    ///      la especificación no cambia, cambia un parámetro publicado, y sólo
    ///      cuando la licencia existe.
    function declareModule(
        ModuleDeclaration calldata md,
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        if (md.moduleId == bytes32(0)) revert ModuleDependenciesInvalid(bytes32("ID_EMPTY"));
        uint256 n = md.holders.length;
        if (n == 0 || n > MAX_DEPENDENCIES || n != md.licenseTypes.length) {
            revert ModuleDependenciesInvalid(bytes32("COUNT"));
        }
        if (md.reasonCode == bytes32(0)) revert ReasonRequired();
        _consumeOrder(p, approvedDigest, ACTION_MODULE_AVAILABILITY, SCOPE_MODULE, moduleContent(md));

        Module storage m = _modules[md.moduleId];
        delete m.depKeys;
        bool enabling = md.declared == Availability.DISPONIBLE || md.declared == Availability.BETA;
        for (uint256 i = 0; i < n; i++) {
            if (md.holders[i] == bytes32(0) || md.licenseTypes[i] == bytes32(0)) {
                revert ModuleDependenciesInvalid(bytes32("DEPENDENCY_EMPTY"));
            }
            bytes32 key = depKeyOf(md.holders[i], md.licenseTypes[i]);
            if (enabling && !isLicenseEffective(_slot[key])) {
                revert ModuleLicenseNotEffective(md.moduleId, md.holders[i], md.licenseTypes[i]);
            }
            m.depKeys.push(key);
            if (!_indexed[key][md.moduleId]) {
                _indexed[key][md.moduleId] = true;
                _modulesByDep[key].push(md.moduleId);
            }
        }
        m.exists = true;
        m.declared = md.declared;
        Availability eff = _effectiveAvailability(m);
        m.published = eff;
        emit ModuleAvailabilityChanged(md.moduleId, _slot[m.depKeys[0]], uint8(eff), md.reasonCode);
    }

    // ------------------------------------------------------------ internos

    function _isTerminal(LicenseState s) internal pure returns (bool) {
        return s == LicenseState.VENCIDA || s == LicenseState.REVOCADA;
    }

    function _checkTransition(License storage l, LicenseState from, LicenseState to, LicenseGrant calldata g)
        internal
        view
    {
        uint64 ts = uint64(block.timestamp);
        if (from == LicenseState.EN_TRAMITE && to == LicenseState.OTORGADA) {
            // Sin número no hay licencia: se rechaza, no se rellena.
            if (g.number == bytes32(0)) revert GrantInvalid(bytes32("NUMBER_REQUIRED"));
            if (g.documentRef == bytes32(0)) revert GrantInvalid(bytes32("DOCUMENT_REQUIRED"));
            if (g.validFrom == 0 || g.validUntil <= g.validFrom) revert GrantInvalid(bytes32("WINDOW"));
            if (g.validUntil <= ts) revert GrantInvalid(bytes32("ALREADY_EXPIRED"));
            return;
        }
        // Fuera del otorgamiento, el payload del otorgamiento va vacío: una orden
        // no puede reescribir número ni plazo de pasada.
        if (g.number != bytes32(0) || g.documentRef != bytes32(0) || g.validFrom != 0 || g.validUntil != 0) {
            revert GrantInvalid(bytes32("GRANT_ONLY_ON_OTORGADA"));
        }
        if (
            (from == LicenseState.OTORGADA && to == LicenseState.VIGENTE)
                || (from == LicenseState.SUSPENDIDA && to == LicenseState.VIGENTE)
        ) {
            if (ts < l.grant.validFrom || ts >= l.grant.validUntil) {
                revert NotInValidityWindow(l.grant.validFrom, l.grant.validUntil, ts);
            }
            return;
        }
        if (from == LicenseState.VIGENTE && (to == LicenseState.SUSPENDIDA || to == LicenseState.REVOCADA)) return;
        if (from == LicenseState.SUSPENDIDA && to == LicenseState.REVOCADA) return;
        revert InvalidTransition(uint8(from), uint8(to));
    }

    /// @dev Recalcula los módulos que dependen de (titular, tipo) y publica los
    ///      que cambiaron. La vista (`isModuleAvailable`) ya era correcta; esto
    ///      deja el cambio VISIBLE para el indexador.
    function _refresh(bytes32 depKey, bytes32 licenseId, bytes32 reasonCode) internal {
        bytes32[] storage mods = _modulesByDep[depKey];
        for (uint256 i = 0; i < mods.length; i++) {
            Module storage m = _modules[mods[i]];
            Availability eff = _effectiveAvailability(m);
            if (eff != m.published) {
                m.published = eff;
                emit ModuleAvailabilityChanged(mods[i], licenseId, uint8(eff), reasonCode);
            }
        }
    }

    /// @dev Patrón de `SFSPGovernanceController.consumeAuthorization`: acción,
    ///      alcance y contenido recalculados aquí; la etiqueta con la que gobierno
    ///      APROBÓ el digest tiene que ser la misma acción; y el digest se gasta.
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
        if (!governance.isAuthorizationApproved(approvedDigest)) revert OrderNotApproved(approvedDigest);
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);
    }
}
