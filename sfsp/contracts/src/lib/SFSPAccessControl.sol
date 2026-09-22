// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Control de acceso mínimo propio (sin dependencias externas).
/// @dev Se escribe lo mínimo a propósito: cada rol del plan tiene función distinta
///      y ningún rol es "admin de todo" salvo DBNX_BOARD, que es el órgano.
abstract contract SFSPAccessControl {
    bytes32 public constant DBNX_BOARD = keccak256("SFSP.ROLE.DBNX_BOARD");
    bytes32 public constant TECH_OPS = keccak256("SFSP.ROLE.TECH_OPS");
    bytes32 public constant ATTESTOR = keccak256("SFSP.ROLE.ATTESTOR");
    bytes32 public constant ISSUER = keccak256("SFSP.ROLE.ISSUER");
    bytes32 public constant AUDITOR = keccak256("SFSP.ROLE.AUDITOR");

    // FALTA EN CONTRATO-INTERNO: los nombres de rol vienen del plan (P4/P5), no
    // del §2 del contrato interno. Se fijan aquí como constantes derivadas.
    mapping(bytes32 => mapping(address => bool)) private _roles;

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed by);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed by);

    error Unauthorized(bytes32 role, address account);

    constructor(address board) {
        // El despliegue recibe el órgano; no se auto-asigna el deployer en silencio.
        require(board != address(0), "SFSP: board=0");
        _roles[DBNX_BOARD][board] = true;
        emit RoleGranted(DBNX_BOARD, board, msg.sender);
    }

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized(role, msg.sender);
        _;
    }

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }

    /// @dev Sólo la Junta concede o revoca. La separación de funciones del plan
    ///      se rompería si TECH_OPS pudiera auto-ampliarse.
    function grantRole(bytes32 role, address account) external onlyRole(DBNX_BOARD) {
        require(account != address(0), "SFSP: account=0");
        _roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(DBNX_BOARD) {
        _roles[role][account] = false;
        emit RoleRevoked(role, account, msg.sender);
    }
}
