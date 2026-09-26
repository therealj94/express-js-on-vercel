// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {ISFSPGovernanceController} from "./lib/ISFSP.sol";

/// @title Registro de activos SFSP (catálogo + pasaporte del §2.3).
/// @notice Registrar un activo legacy NO le añade capacidades. Lo único que
///         cambia al registrarlo es que existe un pasaporte que describe
///         honestamente lo que el contrato ya hacía.
contract SFSPAssetRegistry is SFSPAccessControl {
    // §3 · Eventos emitidos por AssetRegistry.
    event AssetRegistered(bytes32 indexed assetId, bytes32 indexed issuerId, uint8 implementationProfile);
    event PolicyUpdated(
        bytes32 indexed assetId,
        bytes32 indexed policyKind,
        bytes32 previousPolicyId,
        bytes32 newPolicyId,
        uint32 previousVersion,
        uint32 newVersion
    );
    event DisclosurePublished(bytes32 indexed assetId, bytes32 reportHash, uint64 dueDate, uint8 reportStatus);
    event RiskChanged(
        bytes32 indexed assetId,
        uint8 previousLevel,
        uint8 newLevel,
        bytes32 methodologyVersion,
        address indexed responsible
    );
    // FALTA EN CONTRATO-INTERNO: el §3 no lista un evento de cambio de eje.
    // Se añade porque sin él un indexador no puede reconstruir los cinco ejes.
    event LifecycleUpdated(bytes32 indexed assetId, uint8 axis, uint8 previousValue, uint8 newValue);
    // H04 · Exclusión técnica PERMANENTE. No es un eje del ciclo de vida: los ejes
    // vuelven a cambiar, y una migración que se apoye en un eje reversible puede
    // quedarse con el activo viejo descongelado y el nuevo ya emitido, es decir,
    // con doble circulación. Esto se declara una vez y no se deshace nunca.
    event PermanentExclusionDeclared(bytes32 indexed assetId, bytes32 evidenceRoot, uint64 declaredAt);
    /// @dev v0.3 §4.2 · toda modificación de los campos v0.3 del pasaporte o de
    ///      su identificador jerárquico sube la versión y deja la anterior
    ///      consultable (`passportDetailsAt`), con fecha y motivo.
    event PassportUpdated(
        bytes32 indexed assetId, uint32 previousVersion, uint32 newVersion, bytes32 passportHash, bytes32 reasonCode
    );

    error AlreadyRegistered(bytes32 assetId);
    error NotRegistered(bytes32 assetId);
    error InvalidPassport(bytes32 reason);
    error AlreadyPermanentlyExcluded(bytes32 assetId);
    error PermanentExclusionIsIrreversible(bytes32 assetId);
    // §12.5 · SET_POLICY sobre el pasaporte.
    error GovernanceNotWired();
    error PolicyNotAuthorized(bytes32 digest);
    error AuthorizationActionMismatch(bytes32 expected, bytes32 got);
    error PolicyVersionMismatch(uint32 expected, uint32 got);
    error PolicyContentMismatch(bytes32 expected, bytes32 got);
    // v0.3 §4.2 · pasaporte ampliado e identificador jerárquico.
    error PassportFieldInvalid(uint8 field, bytes32 reason);
    error PassportNotAuthorized(bytes32 digest);
    error HierarchicalIdInvalid(bytes32 reason);
    error HierarchicalIdAlreadyAssigned(bytes32 assetId);
    error ReasonRequired();

    mapping(bytes32 => SFSPTypes.Passport) private _passports;
    mapping(bytes32 => bool) private _registered;
    mapping(bytes32 => uint32) private _policyVersion;
    // assetId => raíz de evidencia de la exclusión; 0 = no excluido.
    mapping(bytes32 => bytes32) private _permanentExclusion;
    bytes32[] private _assetIndex;

    /// @dev Se cablea después del despliegue en vez de entrar por el constructor
    ///      para no cambiar la firma con la que el árbol despliega este contrato.
    ///      Mientras no esté cableado, `updatePolicy` REVIERTE: no hay ruta que
    ///      pase sin doble control por no haber configurado gobierno.
    ISFSPGovernanceController public governance;

    /// @dev §12.5 · alcance canónico de SET_POLICY sobre el pasaporte. Distingue
    ///      esta política de la del motor de elegibilidad: una aprobación de una
    ///      no sirve para la otra aunque coincidieran activo y versiones.
    bytes32 public constant POLICY_SCOPE = bytes32("SFSP:GOV:PASSPORT_POLICY");

    // ------------------------------------------------ v0.3 §4.2 · pasaporte ampliado

    /// @dev Alcance del contenido de una actualización de los campos v0.3.
    bytes32 public constant PASSPORT_SCOPE = bytes32("SFSP:GOV:PASSPORT_UPDATE");
    bytes32 public constant ACTION_PASSPORT_UPDATE = bytes32("PASSPORT_UPDATE");
    bytes32 public constant REASON_ID_ASSIGNED = bytes32("ID_JERARQUICO_ASIGNADO");

    /// @dev Metadatos de cada versión: cuándo, por qué y la huella de lo vigente.
    struct PassportVersion {
        uint64 at;
        bytes32 reasonCode;
        bytes32 passportHash;
    }

    mapping(bytes32 => uint32) private _passportVersion;                                   // assetId => versión
    mapping(bytes32 => mapping(uint32 => SFSPTypes.PassportDetails)) private _detailsAt;   // historia
    mapping(bytes32 => mapping(uint32 => PassportVersion)) private _versionMeta;
    mapping(bytes32 => SFSPTypes.HierarchicalId) private _hid;                             // assetId => id
    mapping(bytes32 => bytes32) private _assetByHid;                                       // hash(id) => assetId
    mapping(bytes32 => uint32) private _lastSerial;                                        // hash(clase, autoridad) => último

    constructor(address board) SFSPAccessControl(board) {}

    function setGovernanceController(address governance_) external onlyRole(DBNX_BOARD) {
        require(governance_ != address(0), "SFSP: governance=0");
        governance = ISFSPGovernanceController(governance_);
    }

    // ---------------------------------------------------------------- registro

    /// @dev El pasaporte entra completo en una struct para no perder campos por
    ///      el camino: un campo omitido sería un valor inventado.
    function registerAsset(SFSPTypes.Passport calldata p) external onlyRole(TECH_OPS) {
        if (p.assetId == bytes32(0)) revert InvalidPassport(bytes32("ASSET_ID_EMPTY"));
        if (p.issuerId == bytes32(0)) revert InvalidPassport(bytes32("ISSUER_ID_EMPTY"));
        if (_registered[p.assetId]) revert AlreadyRegistered(p.assetId);

        // Un legacy registrado que declare imposición de restricciones sería falso:
        // su transfer() no pasa por SFSP, así que el bypass debe quedar escrito.
        if (p.implementationProfile == SFSPTypes.ImplementationProfile.LEGACY_REGISTERED) {
            if (!p.enforcement.directTransferBypass) revert InvalidPassport(bytes32("LEGACY_NEEDS_BYPASS"));
            if (p.enforcement.transferRestrictions) revert InvalidPassport(bytes32("LEGACY_CANNOT_ENFORCE"));
        }
        // El perfil SFSP_ENFORCED sí impone de verdad: declararlo con bypass sería marketing.
        if (p.implementationProfile == SFSPTypes.ImplementationProfile.SFSP_ENFORCED) {
            if (p.enforcement.directTransferBypass) revert InvalidPassport(bytes32("ENFORCED_NO_BYPASS"));
        }
        // decimals desconocido se conserva como desconocido; nunca se sustituye por 18 (§5).
        if (!p.decimalsKnown && p.decimals != 0) revert InvalidPassport(bytes32("DECIMALS_INCONSISTENT"));

        _passports[p.assetId] = p;
        _registered[p.assetId] = true;
        _policyVersion[p.assetId] = 1;
        _assetIndex.push(p.assetId);
        // v0.3 §4.2 · el pasaporte nace en la versión 1, con los campos v0.3 sin
        // declarar. Declararlos es una actualización versionada con motivo.
        _passportVersion[p.assetId] = 1;
        _versionMeta[p.assetId][1] = PassportVersion({
            at: uint64(block.timestamp),
            reasonCode: bytes32("REGISTRO"),
            passportHash: _passportHash(p.assetId, 1)
        });

        emit AssetRegistered(p.assetId, p.issuerId, uint8(p.implementationProfile));
    }

    // ---------------------------------------------------------------- lecturas

    function isRegistered(bytes32 assetId) external view returns (bool) {
        return _registered[assetId];
    }

    function passportOf(bytes32 assetId) external view returns (SFSPTypes.Passport memory) {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        return _passports[assetId];
    }

    function lifecycleOf(bytes32 assetId) external view returns (SFSPTypes.Lifecycle memory) {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        return _passports[assetId].status;
    }

    function enforcementOf(bytes32 assetId) external view returns (SFSPTypes.EnforcementScope memory) {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        return _passports[assetId].enforcement;
    }

    /// @dev Devuelve `known=false` en vez de un 18 por defecto: quien decida con
    ///      esto debe responder UNKNOWN_SOURCE, no calcular con un número inventado.
    function decimalsOf(bytes32 assetId) external view returns (bool known, uint8 value) {
        if (!_registered[assetId]) return (false, 0);
        SFSPTypes.Passport storage p = _passports[assetId];
        return (p.decimalsKnown, p.decimalsKnown ? p.decimals : 0);
    }

    function jurisdictionOf(bytes32 assetId) external view returns (bytes32) {
        return _passports[assetId].jurisdiction;
    }

    function policyVersionOf(bytes32 assetId) external view returns (uint32) {
        return _policyVersion[assetId];
    }

    function isPermanentlyExcluded(bytes32 assetId) external view returns (bool) {
        return _permanentExclusion[assetId] != bytes32(0);
    }

    function permanentExclusionOf(bytes32 assetId) external view returns (bytes32) {
        return _permanentExclusion[assetId];
    }

    function assetCount() external view returns (uint256) {
        return _assetIndex.length;
    }

    function assetAt(uint256 i) external view returns (bytes32) {
        return _assetIndex[i];
    }

    // ---------------------------------------------------------------- mutación

    /// @dev PolicyUpdated lleva versión anterior y nueva (§3): un indexador debe
    ///      poder reconstruir qué política regía en cada bloque.
    ///      P03/§12.5 · fila `SET_POLICY`. Antes bastaba el rol TECH_OPS. Ahora el
    ///      ejecutor recalcula el digest del §12.1 desde sus argumentos reales:
    ///      `assetId` el activo, `amount` la versión anterior, `amountSecondary`
    ///      la nueva y `evidenceRoot` el contenido —alcance, tipo de política e
    ///      identificador nuevo—. El rol se conserva para EJECUTAR, que es
    ///      separación de funciones, no autorización.
    function updatePolicy(
        bytes32 assetId,
        bytes32 policyKind,
        bytes32 newPolicyId,
        SFSPAuthorization.Payload calldata auth,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        _authorizePolicyChange(assetId, policyKind, newPolicyId, auth, approvedDigest);
        SFSPTypes.Passport storage p = _passports[assetId];
        bytes32 previous;
        if (policyKind == bytes32("TRANSFER")) {
            previous = p.transferPolicyId;
            p.transferPolicyId = newPolicyId;
        } else if (policyKind == bytes32("REDEMPTION")) {
            previous = p.redemptionPolicyId;
            p.redemptionPolicyId = newPolicyId;
        } else if (policyKind == bytes32("LISTING")) {
            previous = p.listingPolicyId;
            p.listingPolicyId = newPolicyId;
        } else {
            revert InvalidPassport(bytes32("UNKNOWN_POLICY_KIND"));
        }
        uint32 prevVersion = _policyVersion[assetId];
        uint32 newVersion = prevVersion + 1;
        _policyVersion[assetId] = newVersion;
        emit PolicyUpdated(assetId, policyKind, previous, newPolicyId, prevVersion, newVersion);
    }

    /// @notice Compromiso del contenido del cambio de política.
    /// @dev `abi.encode` con posición fija por campo, igual que el §12.1: dos
    ///      cambios distintos no se pueden reagrupar en la misma cadena de bytes.
    function policyDigest(bytes32 policyKind, bytes32 newPolicyId) public pure returns (bytes32) {
        return keccak256(abi.encode(POLICY_SCOPE, policyKind, newPolicyId));
    }

    /// @dev Separado de `updatePolicy` para mantener el marco de pila dentro de lo
    ///      que admite el EVM de Paris.
    function _authorizePolicyChange(
        bytes32 assetId,
        bytes32 policyKind,
        bytes32 newPolicyId,
        SFSPAuthorization.Payload calldata auth,
        bytes32 approvedDigest
    ) internal {
        if (address(governance) == address(0)) revert GovernanceNotWired();
        if (auth.action != bytes32("SET_POLICY")) {
            revert AuthorizationActionMismatch(bytes32("SET_POLICY"), auth.action);
        }
        if (auth.assetId != assetId) revert AuthorizationActionMismatch(assetId, auth.assetId);

        uint32 previous = _policyVersion[assetId];
        uint32 next = previous + 1;
        if (auth.amount != previous) revert PolicyVersionMismatch(previous, uint32(auth.amount));
        if (auth.amountSecondary != next) revert PolicyVersionMismatch(next, uint32(auth.amountSecondary));

        bytes32 contenido = policyDigest(policyKind, newPolicyId);
        if (auth.evidenceRoot != contenido) revert PolicyContentMismatch(contenido, auth.evidenceRoot);

        if (!governance.isAuthorizationApproved(approvedDigest)) revert PolicyNotAuthorized(approvedDigest);
        SFSPAuthorization.Payload memory m = auth;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);
    }

    /// @notice Declara la exclusión técnica permanente de un activo (H04).
    /// @dev La declara el órgano, una sola vez, con evidencia, y **no existe
    ///      función que la deshaga**. Al declararla se fuerza el eje de
    ///      transferibilidad a FROZEN y ese eje queda clavado: `setLifecycleAxis`
    ///      rechaza cualquier intento posterior de sacarlo de FROZEN.
    ///      Sin esto, «congelado» era una etiqueta que TECH_OPS podía revertir
    ///      después de que la migración hubiera emitido el activo nuevo.
    function declarePermanentExclusion(bytes32 assetId, bytes32 evidenceRoot) external onlyRole(DBNX_BOARD) {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        if (evidenceRoot == bytes32(0)) revert InvalidPassport(bytes32("EVIDENCE_REQUIRED"));
        if (_permanentExclusion[assetId] != bytes32(0)) revert AlreadyPermanentlyExcluded(assetId);
        _permanentExclusion[assetId] = evidenceRoot;
        SFSPTypes.Lifecycle storage lc = _passports[assetId].status;
        uint8 previous = uint8(lc.transferability);
        lc.transferability = SFSPTypes.Transferability.FROZEN;
        emit LifecycleUpdated(assetId, 3, previous, uint8(SFSPTypes.Transferability.FROZEN));
        emit PermanentExclusionDeclared(assetId, evidenceRoot, uint64(block.timestamp));
    }

    /// @dev Cinco ejes independientes: se mueve uno por llamada para que ningún
    ///      cambio arrastre a otro. DELISTED no puede ocultar ni tocar saldos.
    function setLifecycleAxis(bytes32 assetId, uint8 axis, uint8 value) external onlyRole(TECH_OPS) {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        // H04 · una exclusión permanente no se levanta por un cambio de eje.
        if (
            axis == 3 && _permanentExclusion[assetId] != bytes32(0)
                && value != uint8(SFSPTypes.Transferability.FROZEN)
        ) {
            revert PermanentExclusionIsIrreversible(assetId);
        }
        SFSPTypes.Lifecycle storage s = _passports[assetId].status;
        uint8 previous;
        if (axis == 0) {
            previous = uint8(s.legal);
            s.legal = SFSPTypes.Legal(value);
        } else if (axis == 1) {
            previous = uint8(s.admission);
            s.admission = SFSPTypes.Admission(value);
        } else if (axis == 2) {
            previous = uint8(s.trading);
            s.trading = SFSPTypes.Trading(value);
        } else if (axis == 3) {
            previous = uint8(s.transferability);
            s.transferability = SFSPTypes.Transferability(value);
        } else if (axis == 4) {
            previous = uint8(s.redemption);
            s.redemption = SFSPTypes.Redemption(value);
        } else if (axis == 5) {
            previous = uint8(s.visibility);
            s.visibility = SFSPTypes.Visibility(value);
        } else {
            revert InvalidPassport(bytes32("UNKNOWN_AXIS"));
        }
        emit LifecycleUpdated(assetId, axis, previous, value);
    }

    /// @dev Se publica el hash del informe y su fecha límite, no el informe.
    function publishDisclosure(bytes32 assetId, bytes32 reportHash, uint64 dueDate, SFSPTypes.ReportStatus status)
        external
        onlyRole(TECH_OPS)
    {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        if (reportHash == bytes32(0)) revert InvalidPassport(bytes32("REPORT_HASH_EMPTY"));
        _passports[assetId].reportStatus = status;
        emit DisclosurePublished(assetId, reportHash, dueDate, uint8(status));
    }

    /// @dev El riesgo sin metodología firmada no es un nivel: vuelve a SIN_EVALUAR.
    function setRisk(bytes32 assetId, SFSPTypes.RiskLevel level, bytes32 methodologyVersion)
        external
        onlyRole(AUDITOR)
    {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        if (level != SFSPTypes.RiskLevel.SIN_EVALUAR && methodologyVersion == bytes32(0)) {
            revert InvalidPassport(bytes32("METHODOLOGY_REQUIRED"));
        }
        SFSPTypes.RiskStatus storage r = _passports[assetId].risk;
        uint8 previous = uint8(r.level);
        r.level = level;
        r.methodologyVersion = methodologyVersion;
        r.evaluatedAt = uint64(block.timestamp);
        emit RiskChanged(assetId, previous, uint8(level), methodologyVersion, msg.sender);
    }

    // ======================================================================
    // v0.3 §4.2 · campos fechados, versionado e identificador jerárquico
    // ======================================================================

    function passportVersionOf(bytes32 assetId) external view returns (uint32) {
        return _passportVersion[assetId];
    }

    /// @notice Campos v0.3 en bruto de la versión vigente.
    /// @dev Para auditoría. Una interfaz NO debe presentar estos valores sin
    ///      pasar por `passportFieldStatus`: un campo vencido se muestra como
    ///      vencido y no como el último valor conocido.
    function passportDetailsOf(bytes32 assetId) external view returns (SFSPTypes.PassportDetails memory) {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        return _detailsAt[assetId][_passportVersion[assetId]];
    }

    /// @notice Una versión anterior, tal como estaba: un adquirente tiene que
    ///         poder acreditar bajo qué condiciones adquirió.
    function passportDetailsAt(bytes32 assetId, uint32 version)
        external
        view
        returns (SFSPTypes.PassportDetails memory details, PassportVersion memory meta)
    {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        if (version == 0 || version > _passportVersion[assetId]) revert InvalidPassport(bytes32("VERSION_UNKNOWN"));
        return (_detailsAt[assetId][version], _versionMeta[assetId][version]);
    }

    /// @notice Lectura de UN campo fechado con su estado.
    /// @param field 0 auditor, 1 valuador, 2 custodio/fiduciario, 3 segmento,
    ///        4 cobertura (valor = ratio en puntos básicos), 5 calendario de
    ///        liberación, 6 condiciones de redención, 7 licencias, 8 raíz documental.
    /// @return status NO_DECLARADO, VIGENTE o VENCIDO.
    /// @return value el valor SOLO si está vigente; vencido devuelve 0, porque
    ///         presentar un dato caduco sin advertencia induce a error (§4.2).
    /// @return asOf fecha del dato.
    /// @return validUntil fin de la vigencia.
    function passportFieldStatus(bytes32 assetId, uint8 field)
        public
        view
        returns (SFSPTypes.FieldStatus status, bytes32 value, uint64 asOf, uint64 validUntil)
    {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        SFSPTypes.PassportDetails storage d = _detailsAt[assetId][_passportVersion[assetId]];
        if (field == 4) {
            SFSPTypes.DatedRatio storage r = d.coverage;
            if (r.asOf == 0) return (SFSPTypes.FieldStatus.NO_DECLARADO, bytes32(0), 0, 0);
            if (block.timestamp >= r.validUntil) {
                return (SFSPTypes.FieldStatus.VENCIDO, bytes32(0), r.asOf, r.validUntil);
            }
            return (SFSPTypes.FieldStatus.VIGENTE, bytes32(uint256(r.ratioBps)), r.asOf, r.validUntil);
        }
        SFSPTypes.DatedField storage f = _datedField(d, field);
        if (f.value == bytes32(0)) return (SFSPTypes.FieldStatus.NO_DECLARADO, bytes32(0), 0, 0);
        if (block.timestamp >= f.validUntil) return (SFSPTypes.FieldStatus.VENCIDO, bytes32(0), f.asOf, f.validUntil);
        return (SFSPTypes.FieldStatus.VIGENTE, f.value, f.asOf, f.validUntil);
    }

    /// @notice Segmento vigente del activo. `inForce == false` si no está
    ///         declarado o venció: el motor de elegibilidad no lo adivina.
    function segmentOf(bytes32 assetId) external view returns (bytes32 segment, bool inForce) {
        if (!_registered[assetId]) return (bytes32(0), false);
        (SFSPTypes.FieldStatus st, bytes32 v,,) = passportFieldStatus(assetId, 3);
        return (v, st == SFSPTypes.FieldStatus.VIGENTE);
    }

    function _datedField(SFSPTypes.PassportDetails storage d, uint8 field)
        internal
        view
        returns (SFSPTypes.DatedField storage)
    {
        if (field == 0) return d.auditor;
        if (field == 1) return d.valuator;
        if (field == 2) return d.custodian;
        if (field == 3) return d.segment;
        if (field == 5) return d.releaseSchedule;
        if (field == 6) return d.redemptionTerms;
        if (field == 7) return d.licenses;
        if (field == 8) return d.documentRoot;
        revert InvalidPassport(bytes32("UNKNOWN_FIELD"));
    }

    /// @notice Compromiso del contenido de una actualización del pasaporte.
    function passportUpdateContent(bytes32 assetId, SFSPTypes.PassportDetails calldata d, bytes32 reasonCode)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(PASSPORT_SCOPE, assetId, d, reasonCode));
    }

    /// @notice Declara o modifica los campos v0.3 del pasaporte con una orden
    ///         de gobierno y motivo. Sube la versión y conserva la anterior.
    /// @dev Payload del §12.1: `assetId` el activo, `amount` la versión anterior,
    ///      `amountSecondary` la nueva y `evidenceRoot` = `passportUpdateContent`.
    ///      El rol TECH_OPS EJECUTA; la autorización es la orden.
    function updatePassportDetails(
        bytes32 assetId,
        SFSPTypes.PassportDetails calldata d,
        bytes32 reasonCode,
        SFSPAuthorization.Payload calldata auth,
        bytes32 approvedDigest
    ) external onlyRole(TECH_OPS) {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        _validateDetails(d);
        uint32 previous = _passportVersion[assetId];
        _authorizePassportUpdate(assetId, previous, passportUpdateContent(assetId, d, reasonCode), auth, approvedDigest);
        _detailsAt[assetId][previous + 1] = d;
        _bumpVersion(assetId, previous, previous + 1, reasonCode);
    }

    /// @dev Separado para mantener el marco de pila dentro de lo que admite Paris.
    function _authorizePassportUpdate(
        bytes32 assetId,
        uint32 previous,
        bytes32 contenido,
        SFSPAuthorization.Payload calldata auth,
        bytes32 approvedDigest
    ) internal {
        if (address(governance) == address(0)) revert GovernanceNotWired();
        if (auth.action != ACTION_PASSPORT_UPDATE) {
            revert AuthorizationActionMismatch(ACTION_PASSPORT_UPDATE, auth.action);
        }
        if (auth.assetId != assetId) revert AuthorizationActionMismatch(assetId, auth.assetId);
        if (auth.amount != previous) revert PolicyVersionMismatch(previous, uint32(auth.amount));
        if (auth.amountSecondary != previous + 1) {
            revert PolicyVersionMismatch(previous + 1, uint32(auth.amountSecondary));
        }
        if (auth.evidenceRoot != contenido) revert PolicyContentMismatch(contenido, auth.evidenceRoot);
        bytes32 label = governance.authorizationActionOf(approvedDigest);
        if (label != ACTION_PASSPORT_UPDATE) revert AuthorizationActionMismatch(ACTION_PASSPORT_UPDATE, label);
        if (!governance.isAuthorizationApproved(approvedDigest)) revert PassportNotAuthorized(approvedDigest);
        SFSPAuthorization.Payload memory m = auth;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);
    }

    function _bumpVersion(bytes32 assetId, uint32 previous, uint32 next, bytes32 reasonCode) internal {
        _passportVersion[assetId] = next;
        bytes32 h = _passportHash(assetId, next);
        _versionMeta[assetId][next] = PassportVersion({at: uint64(block.timestamp), reasonCode: reasonCode, passportHash: h});
        emit PassportUpdated(assetId, previous, next, h, reasonCode);
    }

    /// @dev Huella de lo que describe la versión: campos v0.3 + id jerárquico.
    function _passportHash(bytes32 assetId, uint32 version) internal view returns (bytes32) {
        return keccak256(abi.encode(assetId, version, _detailsAt[assetId][version], _hid[assetId]));
    }

    /// @dev Cada campo fechado: sin valor, sin fechas; con valor, fecha no
    ///      futura y vigencia posterior a la fecha.
    function _validateDetails(SFSPTypes.PassportDetails calldata d) internal view {
        _validateField(0, d.auditor);
        _validateField(1, d.valuator);
        _validateField(2, d.custodian);
        _validateField(3, d.segment);
        if (
            d.segment.value != bytes32(0) && d.segment.value != SFSPTypes.SEGMENT_PRINCIPAL
                && d.segment.value != SFSPTypes.SEGMENT_CRECIMIENTO
        ) {
            revert PassportFieldInvalid(3, bytes32("SEGMENT_UNKNOWN"));
        }
        if (d.coverage.asOf == 0) {
            if (d.coverage.ratioBps != 0 || d.coverage.validUntil != 0) {
                revert PassportFieldInvalid(4, bytes32("UNDECLARED_WITH_DATA"));
            }
        } else {
            if (d.coverage.asOf > block.timestamp) revert PassportFieldInvalid(4, bytes32("DATE_IN_FUTURE"));
            if (d.coverage.validUntil <= d.coverage.asOf) revert PassportFieldInvalid(4, bytes32("WINDOW"));
        }
        _validateField(5, d.releaseSchedule);
        _validateField(6, d.redemptionTerms);
        _validateField(7, d.licenses);
        _validateField(8, d.documentRoot);
    }

    function _validateField(uint8 idx, SFSPTypes.DatedField calldata f) internal view {
        if (f.value == bytes32(0)) {
            if (f.asOf != 0 || f.validUntil != 0) revert PassportFieldInvalid(idx, bytes32("UNDECLARED_WITH_DATA"));
            return;
        }
        if (f.asOf == 0) revert PassportFieldInvalid(idx, bytes32("DATE_REQUIRED"));
        if (f.asOf > block.timestamp) revert PassportFieldInvalid(idx, bytes32("DATE_IN_FUTURE"));
        if (f.validUntil <= f.asOf) revert PassportFieldInvalid(idx, bytes32("WINDOW"));
    }

    // ------------------------------------------------ identificador jerárquico

    function hierarchicalIdOf(bytes32 assetId) external view returns (SFSPTypes.HierarchicalId memory) {
        return _hid[assetId];
    }

    function assetByHierarchicalId(bytes32 assetClass, bytes32 authority, uint32 serial)
        external
        view
        returns (bytes32)
    {
        return _assetByHid[keccak256(abi.encode(assetClass, authority, serial))];
    }

    /// @notice Asigna el identificador jerárquico estable (clase / autoridad /
    ///         correlativo). Una sola vez: después no cambia, aunque cambie el
    ///         contrato del activo, porque no se deriva de su dirección.
    /// @dev El correlativo NO lo elige el llamador: es el siguiente de
    ///      (clase, autoridad), así que no hay huecos ni repetidos.
    function assignHierarchicalId(bytes32 assetId, bytes32 assetClass, bytes32 authority)
        external
        onlyRole(TECH_OPS)
        returns (uint32 serial)
    {
        if (!_registered[assetId]) revert NotRegistered(assetId);
        if (_hid[assetId].serial != 0) revert HierarchicalIdAlreadyAssigned(assetId);
        if (
            assetClass != bytes32("SECURITY") && assetClass != bytes32("COMMODITY")
                && assetClass != bytes32("MONETARY") && assetClass != bytes32("UTILITY")
        ) {
            revert HierarchicalIdInvalid(bytes32("CLASS"));
        }
        _validateAuthority(authority);
        bytes32 pair = keccak256(abi.encode(assetClass, authority));
        serial = _lastSerial[pair] + 1;
        _lastSerial[pair] = serial;
        _hid[assetId] = SFSPTypes.HierarchicalId({assetClass: assetClass, authority: authority, serial: serial});
        _assetByHid[keccak256(abi.encode(assetClass, authority, serial))] = assetId;

        uint32 previous = _passportVersion[assetId];
        _detailsAt[assetId][previous + 1] = _detailsAt[assetId][previous];
        _bumpVersion(assetId, previous, previous + 1, REASON_ID_ASSIGNED);
    }

    /// @dev Autoridad: 1 a 16 caracteres [A-Z0-9_], alineados a la izquierda y
    ///      sin bytes nulos intermedios. Así «DBNX» no tiene dos codificaciones.
    function _validateAuthority(bytes32 a) internal pure {
        bool ended;
        uint256 len;
        for (uint256 i = 0; i < 32; i++) {
            bytes1 c = a[i];
            if (c == 0) {
                ended = true;
                continue;
            }
            if (ended || i >= 16) revert HierarchicalIdInvalid(bytes32("AUTHORITY_FORMAT"));
            bool ok = (c >= 0x41 && c <= 0x5A) || (c >= 0x30 && c <= 0x39) || c == 0x5F;
            if (!ok) revert HierarchicalIdInvalid(bytes32("AUTHORITY_CHARSET"));
            len++;
        }
        if (len == 0) revert HierarchicalIdInvalid(bytes32("AUTHORITY_EMPTY"));
    }
}
