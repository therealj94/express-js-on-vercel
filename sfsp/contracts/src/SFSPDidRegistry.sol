// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";

/// @title Registro de identificadores `did:sfsp` de ORGANIZACIONES (SFSP-160 §3).
/// @notice La fuente de verdad de quién es un emisor en el ecosistema es la 5550,
///         no un dominio de internet. Aquí viven los emisores de credenciales
///         (Genesis ID, DBNX, custodios, valuadores) y sus llaves.
///
/// @dev PERSONAS NO. Una persona nunca se registra aquí: sus identificadores son
///      `did:sfsp:<red>:p:<llave>`, que se autocertifican y no dejan rastro en la
///      cadena. Registrar personas publicaría el mapa persona → llaves que
///      SFSP-110 §4 prohíbe. Por eso no hay función que acepte un sujeto persona,
///      y el identificador de organización lo asigna la Junta, no quien se registra.
///
///      Reglas del contrato, cada una con su porqué:
///        · Alta y baja de organizaciones: solo la Junta (DBNX_BOARD). Ser emisor
///          de identidad en SFSP es una admisión, no un autoservicio.
///        · Las llaves las maneja el CONTROLADOR de la organización (su multifirma),
///          no la Junta: la Junta admite, pero no firma por nadie.
///        · Un orgId o un keyId dados de alta no se reutilizan jamás. Rotar una
///          llave es dar de alta otra y revocar la vieja; así una firma vieja
///          nunca pasa a verificarse contra una llave nueva con el mismo nombre.
///        · La baja es irreversible. Volver exige otro orgId, con su expediente.
///        · La Junta puede cambiar el controlador (recuperación si la multifirma
///          se pierde), siempre con código de motivo y evento.
contract SFSPDidRegistry is SFSPAccessControl {
    /// Relaciones de una llave (máscara de bits), las de DID Core.
    uint8 public constant REL_ASSERTION = 1;      // firma credenciales y listas de estado
    uint8 public constant REL_AUTHENTICATION = 2; // se autentica como la organización
    uint8 public constant REL_KEY_AGREEMENT = 4;  // recibe datos cifrados

    uint8 public constant KEY_ED25519 = 1;
    uint8 public constant KEY_X25519 = 2;

    struct Org {
        address controller;
        bool exists;
        bool active;
        uint64 updated;
        bytes32 docHash; // huella del documento DID completo publicado fuera de la cadena
    }

    struct Key {
        uint8 keyType;
        bytes32 publicKey;
        uint8 relations;
        bool revoked;
    }

    mapping(bytes32 => Org) private _orgs;
    mapping(bytes32 => mapping(bytes32 => Key)) private _keys;
    mapping(bytes32 => bytes32[]) private _keyIds;
    mapping(bytes32 => mapping(address => bool)) private _attestors;

    event OrgDidRegistered(bytes32 indexed orgId, address controller, bytes32 docHash);
    event OrgDidControllerChanged(bytes32 indexed orgId, address controller, bytes32 reasonCode);
    event OrgDidKeyChanged(bytes32 indexed orgId, bytes32 keyId, uint8 relations, bool revoked);
    event OrgDidAttestorChanged(bytes32 indexed orgId, address account, bool enabled);
    event OrgDidDocumentChanged(bytes32 indexed orgId, bytes32 docHash);
    event OrgDidDeactivated(bytes32 indexed orgId, bytes32 reasonCode);

    error OrgExists(bytes32 orgId);
    error OrgUnknown(bytes32 orgId);
    error OrgInactive(bytes32 orgId);
    error NotController(bytes32 orgId, address account);
    error KeyExists(bytes32 orgId, bytes32 keyId);
    error KeyUnknown(bytes32 orgId, bytes32 keyId);
    error InvalidKey();
    error ReasonRequired();

    constructor(address board) SFSPAccessControl(board) {}

    modifier activeOrg(bytes32 orgId) {
        Org storage o = _orgs[orgId];
        if (!o.exists) revert OrgUnknown(orgId);
        if (!o.active) revert OrgInactive(orgId);
        _;
    }

    modifier onlyController(bytes32 orgId) {
        if (_orgs[orgId].controller != msg.sender) revert NotController(orgId, msg.sender);
        _;
    }

    // ---------------------------------------------------------------- Junta

    function registerOrg(bytes32 orgId, address controller, bytes32 docHash) external onlyRole(DBNX_BOARD) {
        if (orgId == bytes32(0) || controller == address(0)) revert InvalidKey();
        if (_orgs[orgId].exists) revert OrgExists(orgId);
        _orgs[orgId] = Org({controller: controller, exists: true, active: true, updated: uint64(block.timestamp), docHash: docHash});
        emit OrgDidRegistered(orgId, controller, docHash);
    }

    function changeController(bytes32 orgId, address controller, bytes32 reasonCode)
        external
        onlyRole(DBNX_BOARD)
        activeOrg(orgId)
    {
        if (controller == address(0)) revert InvalidKey();
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        _orgs[orgId].controller = controller;
        _orgs[orgId].updated = uint64(block.timestamp);
        emit OrgDidControllerChanged(orgId, controller, reasonCode);
    }

    /// @notice Baja irreversible. La puede pedir la Junta o el propio controlador.
    function deactivate(bytes32 orgId, bytes32 reasonCode) external activeOrg(orgId) {
        if (!hasRole(DBNX_BOARD, msg.sender) && _orgs[orgId].controller != msg.sender) {
            revert NotController(orgId, msg.sender);
        }
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        _orgs[orgId].active = false;
        _orgs[orgId].updated = uint64(block.timestamp);
        emit OrgDidDeactivated(orgId, reasonCode);
    }

    // --------------------------------------------------------- controlador

    function addKey(bytes32 orgId, bytes32 keyId, uint8 keyType, bytes32 publicKey, uint8 relations)
        external
        activeOrg(orgId)
        onlyController(orgId)
    {
        if (keyId == bytes32(0) || publicKey == bytes32(0) || relations == 0 || relations > 7) revert InvalidKey();
        // Una llave de firma no cifra y una de cifrado no firma: mezclar usos es
        // cómo una llave de acuerdo termina validando credenciales.
        if (keyType == KEY_ED25519) {
            if (relations & REL_KEY_AGREEMENT != 0) revert InvalidKey();
        } else if (keyType == KEY_X25519) {
            if (relations != REL_KEY_AGREEMENT) revert InvalidKey();
        } else {
            revert InvalidKey();
        }
        if (_keys[orgId][keyId].keyType != 0) revert KeyExists(orgId, keyId);
        _keys[orgId][keyId] = Key({keyType: keyType, publicKey: publicKey, relations: relations, revoked: false});
        _keyIds[orgId].push(keyId);
        _orgs[orgId].updated = uint64(block.timestamp);
        emit OrgDidKeyChanged(orgId, keyId, relations, false);
    }

    function revokeKey(bytes32 orgId, bytes32 keyId) external activeOrg(orgId) onlyController(orgId) {
        Key storage k = _keys[orgId][keyId];
        if (k.keyType == 0) revert KeyUnknown(orgId, keyId);
        k.revoked = true;
        _orgs[orgId].updated = uint64(block.timestamp);
        emit OrgDidKeyChanged(orgId, keyId, k.relations, true);
    }

    /// @notice La dirección con la que la organización firma atestaciones EIP-712.
    function setAttestor(bytes32 orgId, address account, bool enabled) external activeOrg(orgId) onlyController(orgId) {
        if (account == address(0)) revert InvalidKey();
        _attestors[orgId][account] = enabled;
        _orgs[orgId].updated = uint64(block.timestamp);
        emit OrgDidAttestorChanged(orgId, account, enabled);
    }

    function setDocument(bytes32 orgId, bytes32 docHash) external activeOrg(orgId) onlyController(orgId) {
        _orgs[orgId].docHash = docHash;
        _orgs[orgId].updated = uint64(block.timestamp);
        emit OrgDidDocumentChanged(orgId, docHash);
    }

    // --------------------------------------------------------------- lectura
    // Solo tipos estáticos: el resolutor del SDK las lee con eth_call sin
    // dependencias y sin decodificar arreglos dinámicos.

    function orgInfo(bytes32 orgId)
        external
        view
        returns (bool exists, bool active, address controller, uint64 updated, bytes32 docHash, uint256 keyCount)
    {
        Org storage o = _orgs[orgId];
        return (o.exists, o.active, o.controller, o.updated, o.docHash, _keyIds[orgId].length);
    }

    function keyIdAt(bytes32 orgId, uint256 index) external view returns (bytes32) {
        return _keyIds[orgId][index];
    }

    function keyInfo(bytes32 orgId, bytes32 keyId)
        external
        view
        returns (uint8 keyType, bytes32 publicKey, uint8 relations, bool revoked)
    {
        Key storage k = _keys[orgId][keyId];
        return (k.keyType, k.publicKey, k.relations, k.revoked);
    }

    /// @notice Falso si la organización está de baja, aunque el permiso siga anotado.
    function isAttestor(bytes32 orgId, address account) external view returns (bool) {
        return _orgs[orgId].active && _attestors[orgId][account];
    }
}
