// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {ISFSPGovernanceController} from "./lib/ISFSP.sol";

/// @dev Lo mínimo del registro de activos que hace falta para ADMITIR un destino.
///      Se consulta sólo al dar de alta, nunca desde `transactionAllowed`.
interface ISFSPAssetRegistryPassport {
    function isRegistered(bytes32 assetId) external view returns (bool);
    function isPermanentlyExcluded(bytes32 assetId) external view returns (bool);
    function passportOf(bytes32 assetId) external view returns (SFSPTypes.Passport memory);
}

/// @title Lista de la red cerrada (SFSP-150, v0.3 §2.1).
/// @notice Fuente única de las dos listas de la red cerrada:
///         1. quién puede DESPLEGAR (transacción con `to` vacío);
///         2. a qué DESTINOS se puede mandar una transacción.
///
///         El nodo no ejecuta esta lógica por sí solo. Besu 26.x ya NO tiene
///         permisos de cuentas por contrato (se retiraron en 25.6.0, PR #8597):
///         la consulta la hace el complemento `sfsp/red/filtro-besu/`, que llama a
///         `transactionAllowed` en la cabeza de la cadena con la MISMA interfaz que
///         usaba la opción contractual retirada. Ver `sfsp/red/RED-CERRADA.md`.
///
/// @dev Reglas de diseño, todas por la misma razón: el nodo llama a
///      `transactionAllowed` para CADA transacción del pool, de cada bloque que
///      produce y de cada bloque que importa.
///      - `transactionAllowed` es `view`, sin bucles y sin llamadas externas: un
///        número fijo de lecturas de almacenamiento, más EXTCODEHASH/EXTCODESIZE
///        del destino. Una llamada externa que revierta haría fallar la
///        simulación en unos nodos y no en otros.
///      - Ningún estado se puede llenar desde fuera: TODA escritura pasa por una
///        orden de gobierno con quórum (y espera, si amplía), salvo `purgeExcluded`,
///        que sólo BORRA y sólo lo que el registro ya declaró excluido.
///      - El gobierno y este contrato siempre son destinos admitidos. Si una orden
///        mal hecha los quitara, la red quedaría sin forma de corregirse.
///      - Por defecto, NO: un destino que no está en la lista (entre ellos los 172
///        contratos heredados del génesis) no admite transacciones.
contract SFSPNetworkPermissions is SFSPAccessControl, SFSPReentrancyGuard {
    // ------------------------------------------------------------ tipos

    /// @dev Clases de permiso. Viajan en `permissionKind` del evento.
    ///      `SYSTEM_FUNCTION` lleva el selector en los 4 últimos bytes (ver `kindOf`).
    bytes32 public constant KIND_DEPLOYER = bytes32("DEPLOYER");
    bytes32 public constant KIND_ASSET_CONTRACT = bytes32("ASSET_CONTRACT");
    bytes32 public constant KIND_LEGACY_TRANSITIONAL = bytes32("LEGACY_TRANSITIONAL");
    bytes32 public constant KIND_SYSTEM_TARGET = bytes32("SYSTEM_TARGET");
    bytes32 public constant KIND_SYSTEM_FUNCTION = bytes32("SYSTEM_FUNCTION");

    /// @dev Acción de gobierno y alcance del payload del §12.1.
    bytes32 public constant ACTION_SET_NETWORK_PERMISSION = bytes32("SET_NETWORK_PERMISSION");
    bytes32 public constant NETWORK_SCOPE = bytes32("SFSP:NET:ADMISSION");
    bytes32 public constant CHANGES_TAG = keccak256("SFSP.NETWORK_PERMISSIONS.CHANGES.v1");
    /// @dev Tope de cambios por orden: la lista la escribe gobierno, pero una orden
    ///      enorme no cabría en un bloque y no se podría ejecutar.
    uint256 public constant MAX_CHANGES = 64;

    /// @dev Un cambio. `assetId` sólo cuenta en ASSET_CONTRACT y
    ///      LEGACY_TRANSITIONAL; `selector` sólo en SYSTEM_FUNCTION; `untilBlock`
    ///      sólo en LEGACY_TRANSITIONAL (bloque de corte, exclusivo).
    struct Change {
        bytes32 kind;
        address subject;
        bool granted;
        bytes32 assetId;
        bytes4 selector;
        uint64 untilBlock;
        bytes32 reasonCode;
    }

    /// @dev Un destino admitido ocupa UNA ranura: clase, corte y activo se leen
    ///      juntos. `codehash` va en otra ranura y sólo se lee para ASSET_CONTRACT.
    uint8 internal constant D_NONE = 0;
    uint8 internal constant D_ASSET = 1;
    uint8 internal constant D_LEGACY = 2;
    uint8 internal constant D_SYSTEM = 3;

    struct Destination {
        uint8 kind;
        uint64 untilBlock;
        bytes32 assetId;
        bytes32 codehash;
    }

    // ------------------------------------------------------------ eventos y errores

    /// @dev Firma exacta de `spec/eventos.json` (emisor NetworkAdmission).
    event NetworkPermissionChanged(
        address indexed subject,
        bytes32 indexed permissionKind,
        bool granted,
        bytes32 reasonCode,
        bytes32 operationId
    );

    error AuthorizationActionMismatch(bytes32 expected, bytes32 got);
    error NotAuthorized(bytes32 digest);
    error WaitPending(bytes32 digest, uint64 readyAt);
    error PayloadMismatch(bytes32 reason);
    error InvalidChange(uint256 index, bytes32 reason);
    error NotExcluded(address subject);

    // ------------------------------------------------------------ estado

    ISFSPGovernanceController public immutable governance;
    ISFSPAssetRegistryPassport public immutable registry;

    mapping(address => bool) private _deployer;
    mapping(address => Destination) private _destination;
    mapping(address => mapping(bytes4 => bool)) private _systemFunction;

    constructor(address board, address governance_, address registry_) SFSPAccessControl(board) {
        require(governance_ != address(0), "SFSP: governance=0");
        require(registry_ != address(0), "SFSP: registry=0");
        governance = ISFSPGovernanceController(governance_);
        registry = ISFSPAssetRegistryPassport(registry_);
    }

    // ------------------------------------------------------------ la consulta del nodo

    /// @notice Interfaz exacta de la opción contractual de Besu (retirada en
    ///         25.6.0) que conserva el complemento: selector
    ///         `transactionAllowed(address,address,uint256,uint256,uint256,bytes)`.
    /// @dev `target == address(0)` es una creación de contrato (Besu codifica así
    ///      el `to` vacío). `value`, `gasPrice` y `gasLimit` no se usan: forman parte
    ///      de la interfaz y se dejan sin nombre.
    function transactionAllowed(
        address sender,
        address target,
        uint256, /* value */
        uint256, /* gasPrice */
        uint256, /* gasLimit */
        bytes calldata payload
    ) external view returns (bool) {
        // Nivel 1 · despliegue.
        if (target == address(0)) return _deployer[sender];

        // Gobierno y la propia lista: siempre alcanzables (no hay bloqueo sin salida).
        if (target == address(governance) || target == address(this)) return true;

        // Nivel 2 · destinos.
        Destination storage d = _destination[target];
        uint8 k = d.kind;
        if (k == D_ASSET) return target.codehash == d.codehash;
        if (k == D_SYSTEM) return true;
        if (k == D_LEGACY) return block.number < d.untilBlock;

        // Función de sistema concreta sobre un destino no admitido entero.
        if (payload.length >= 4 && _systemFunction[target][bytes4(payload[:4])]) return true;

        // ORIGEN nativo: sin datos y a una cuenta sin código. Una cuenta con
        // delegación EIP-7702 TIENE código (0xef0100‖dirección) y no entra aquí:
        // si entrara, su código delegado podría llamar a un heredado.
        return payload.length == 0 && target.code.length == 0;
    }

    // ------------------------------------------------------------ lecturas

    function isDeployer(address account) external view returns (bool) {
        return _deployer[account];
    }

    function destinationOf(address target) external view returns (Destination memory) {
        return _destination[target];
    }

    function isSystemFunction(address target, bytes4 selector) external view returns (bool) {
        return _systemFunction[target][selector];
    }

    /// @notice `permissionKind` del evento para un cambio.
    function kindOf(bytes32 kind, bytes4 selector) public pure returns (bytes32) {
        if (kind == KIND_SYSTEM_FUNCTION) return kind | bytes32(uint256(uint32(selector)));
        return kind;
    }

    /// @notice Compromiso del contenido de una orden: va en `evidenceRoot`.
    function changesRoot(Change[] calldata changes) public pure returns (bytes32) {
        return keccak256(abi.encode(CHANGES_TAG, changes));
    }

    /// @notice ¿La orden AMPLÍA algo? Si amplía, lleva la espera del timelock.
    function widens(Change[] calldata changes) public pure returns (bool) {
        for (uint256 i = 0; i < changes.length; i++) {
            if (changes[i].granted) return true;
        }
        return false;
    }

    // ------------------------------------------------------------ gobierno

    /// @notice Aplica una orden de gobierno con quórum sobre las listas.
    /// @dev Payload del §12.1:
    ///      - `action` = SET_NETWORK_PERMISSION (y así se propuso en gobierno);
    ///      - `assetId` = NETWORK_SCOPE;
    ///      - `origin` = `destination` = 0;
    ///      - `amount` = número de cambios;
    ///      - `amountSecondary` = 1 si alguno amplía, 0 si todos restringen;
    ///      - `nonce` = identificador de operación (va en cada evento);
    ///      - `evidenceRoot` = `changesRoot(changes)`.
    ///      Ampliar (dar de alta) espera el timelock desde la propuesta; restringir
    ///      (dar de baja) no espera, pero igual necesita quórum. Ninguna llave sola
    ///      cambia nada: el ejecutor sólo GASTA una aprobación que ya existe.
    function applyChanges(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest, Change[] calldata changes)
        external
        nonReentrant
    {
        if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender)) revert Unauthorized(TECH_OPS, msg.sender);
        if (p.action != ACTION_SET_NETWORK_PERMISSION) {
            revert AuthorizationActionMismatch(ACTION_SET_NETWORK_PERMISSION, p.action);
        }
        if (p.assetId != NETWORK_SCOPE) revert PayloadMismatch(bytes32("SCOPE"));
        if (p.origin != address(0) || p.destination != address(0)) revert PayloadMismatch(bytes32("PARTIES"));
        uint256 n = changes.length;
        if (n == 0 || n > MAX_CHANGES || p.amount != n) revert PayloadMismatch(bytes32("COUNT"));
        bool amplia = widens(changes);
        if (p.amountSecondary != (amplia ? 1 : 0)) revert PayloadMismatch(bytes32("WIDENS"));
        if (p.evidenceRoot != changesRoot(changes)) revert PayloadMismatch(bytes32("CONTENT"));

        bytes32 label = governance.authorizationActionOf(approvedDigest);
        if (label != ACTION_SET_NETWORK_PERMISSION) revert AuthorizationActionMismatch(ACTION_SET_NETWORK_PERMISSION, label);
        if (!governance.isAuthorizationApproved(approvedDigest)) revert NotAuthorized(approvedDigest);
        if (amplia) {
            uint64 readyAt = governance.authorizationProposedAt(approvedDigest) + governance.timelockDelay();
            if (block.timestamp < readyAt) revert WaitPending(approvedDigest, readyAt);
        }
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        for (uint256 i = 0; i < n; i++) {
            _apply(i, changes[i], p.nonce);
        }
    }

    /// @notice Quita un destino cuyo activo el registro ya declaró excluido para
    ///         siempre (H04). Lo puede llamar cualquiera: sólo BORRA, y sólo lo que
    ///         el propio registro (gobernado) ya excluyó.
    function purgeExcluded(address target) external {
        Destination storage d = _destination[target];
        if (d.kind != D_ASSET && d.kind != D_LEGACY) revert NotExcluded(target);
        if (!registry.isPermanentlyExcluded(d.assetId)) revert NotExcluded(target);
        bytes32 kind = d.kind == D_ASSET ? KIND_ASSET_CONTRACT : KIND_LEGACY_TRANSITIONAL;
        delete _destination[target];
        emit NetworkPermissionChanged(
            target, kind, false, bytes32("REGISTRY_EXCLUDED"), keccak256(abi.encode(target, block.number))
        );
    }

    // ------------------------------------------------------------ interno

    function _apply(uint256 i, Change calldata c, bytes32 operationId) internal {
        if (c.subject == address(0)) revert InvalidChange(i, bytes32("SUBJECT_ZERO"));
        if (c.reasonCode == bytes32(0)) revert InvalidChange(i, bytes32("REASON_REQUIRED"));
        if (c.subject == address(governance) || c.subject == address(this)) {
            revert InvalidChange(i, bytes32("ALWAYS_ALLOWED"));
        }
        bytes32 kind = c.kind;
        if (kind == KIND_DEPLOYER) {
            _deployer[c.subject] = c.granted;
        } else if (kind == KIND_SYSTEM_FUNCTION) {
            if (c.selector == bytes4(0)) revert InvalidChange(i, bytes32("SELECTOR_ZERO"));
            if (c.granted && c.subject.code.length == 0) revert InvalidChange(i, bytes32("NO_CODE"));
            _systemFunction[c.subject][c.selector] = c.granted;
        } else if (kind == KIND_ASSET_CONTRACT || kind == KIND_LEGACY_TRANSITIONAL || kind == KIND_SYSTEM_TARGET) {
            _applyDestination(i, c);
        } else {
            revert InvalidChange(i, bytes32("UNKNOWN_KIND"));
        }
        emit NetworkPermissionChanged(c.subject, kindOf(kind, c.selector), c.granted, c.reasonCode, operationId);
    }

    function _applyDestination(uint256 i, Change calldata c) internal {
        uint8 want = c.kind == KIND_ASSET_CONTRACT ? D_ASSET : (c.kind == KIND_LEGACY_TRANSITIONAL ? D_LEGACY : D_SYSTEM);
        Destination storage d = _destination[c.subject];
        if (!c.granted) {
            // Una baja tiene que nombrar la clase que da de baja: así una orden de
            // «quitar sistema» no borra por error un activo, ni al revés.
            if (d.kind != want) revert InvalidChange(i, bytes32("KIND_MISMATCH"));
            delete _destination[c.subject];
            return;
        }
        if (d.kind != D_NONE) revert InvalidChange(i, bytes32("ALREADY_ADMITTED"));
        if (c.subject.code.length == 0) revert InvalidChange(i, bytes32("NO_CODE"));
        if (want == D_SYSTEM) {
            d.kind = D_SYSTEM;
            return;
        }
        // Activo (conforme o heredado en registro transitorio): tiene que estar en
        // el registro, no excluido, y su pasaporte tiene que nombrar ESTE contrato.
        if (!registry.isRegistered(c.assetId)) revert InvalidChange(i, bytes32("NOT_REGISTERED"));
        if (registry.isPermanentlyExcluded(c.assetId)) revert InvalidChange(i, bytes32("EXCLUDED"));
        SFSPTypes.Passport memory pp = registry.passportOf(c.assetId);
        if (pp.settlementLocation.contractAddress != c.subject) revert InvalidChange(i, bytes32("PASSPORT_ADDRESS"));
        if (pp.settlementLocation.chainId != block.chainid) revert InvalidChange(i, bytes32("PASSPORT_CHAIN"));
        if (want == D_ASSET) {
            // Conforme: con clase, sin perfil heredado, y el código de hoy es el del pasaporte (T-150-03).
            if (pp.implementationProfile == SFSPTypes.ImplementationProfile.LEGACY_REGISTERED) {
                revert InvalidChange(i, bytes32("LEGACY_PROFILE"));
            }
            if (pp.legalClass == bytes32(0)) revert InvalidChange(i, bytes32("NO_CLASS"));
            bytes32 h = c.subject.codehash;
            if (pp.settlementLocation.codehash != h) revert InvalidChange(i, bytes32("CODEHASH"));
            d.kind = D_ASSET;
            d.assetId = c.assetId;
            d.codehash = h;
        } else {
            // Heredado en registro transitorio: perfil LEGACY y bloque de corte futuro.
            if (pp.implementationProfile != SFSPTypes.ImplementationProfile.LEGACY_REGISTERED) {
                revert InvalidChange(i, bytes32("NOT_LEGACY"));
            }
            if (c.untilBlock <= block.number) revert InvalidChange(i, bytes32("CUTOFF_PAST"));
            d.kind = D_LEGACY;
            d.assetId = c.assetId;
            d.untilBlock = c.untilBlock;
        }
    }
}
