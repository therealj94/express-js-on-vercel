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
}
