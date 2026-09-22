// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";

/// @title Gobierno SFSP: multisig por umbral, timelock de upgrades y pausa caduca.
/// @notice Los quórums, el retardo del timelock y el techo de pausa son parámetros
///         del constructor. No se hardcodea ningún número "recomendado": el
///         despliegue los recibe y una prueba usa fixtures sintéticos.
contract SFSPGovernanceController is SFSPAccessControl {
    // §3 · Eventos emitidos por GovernanceController.
    event GovernanceAction(
        bytes32 indexed operationId,
        bytes32 indexed actionKind,
        address indexed actor,
        bytes32 detail,
        uint64 effectiveAt
    );
    event RecoveryExecuted(bytes32 indexed caseId, bytes32 indexed operationId, bytes32 evidenceRoot, uint64 executedAt);
    event SupplyAuthorized(bytes32 indexed assetId, bytes32 indexed authorizationId, uint256 amount, uint64 expiry);

    // --- H01/H06 · registro de autorizaciones LIGADAS AL CONTENIDO (SFSP-AUTH-v1).
    //     Lo que se aprueba aqui es un digest del §12.1 de SFSP-800, no un
    //     `operationId`. El ejecutor recalcula ese digest desde sus argumentos
    //     reales antes de actuar, asi que una aprobacion no puede servir para otro
    //     origen, otro destino ni otro monto.
    event AuthorizationProposed(bytes32 indexed digest, bytes32 indexed action, address indexed proposer);
    event AuthorizationApproved(bytes32 indexed digest, address indexed signer, uint32 approvals);
    event AuthorizationConsumed(bytes32 indexed digest, address indexed executor, uint64 consumedAt);

    error NotSigner(address account);
    error UnknownProposal(bytes32 operationId);
    error DuplicateProposal(bytes32 operationId);
    error AlreadyApproved(bytes32 operationId, address signer);
    error QuorumNotReached(bytes32 operationId, uint256 have, uint256 need);
    error TimelockPending(bytes32 operationId, uint64 readyAt);
    error PauseReasonRequired();
    error PauseExpiryInvalid(uint64 expiresAt, uint64 maxAllowed);
    error AlreadyExecuted(bytes32 operationId);
    error InvalidQuorum(uint256 threshold, uint256 signers);
    error AuthorizationUnknown(bytes32 digest);
    error AuthorizationDuplicate(bytes32 digest);
    error AuthorizationSpent(bytes32 digest);
    error AuthorizationQuorumNotReached(bytes32 digest, uint256 have, uint256 need);
    // P03/§12.5 · separacion de funciones: quien propone NO aprueba. Un mismo
    // actor no puede contar dos veces por proponer y aprobar lo mismo.
    error ProposerCannotApprove(bytes32 digest, address proposer);
    error AlreadyApprovedAuthorization(bytes32 digest, address signer);
    // H19 · la reanudacion se ata al incidente concreto que levanta.
    error PauseMismatch(bytes32 expectedPauseId, bytes32 presentedNonce);
    error NotPaused();

    struct Proposal {
        bytes32 actionKind;   // PAUSE | UPGRADE | ROTATE | QUORUM | RECOVERY | ISSUANCE | ...
        bytes32 detail;       // hash del payload aprobado; el payload no vive en cadena
        uint64 proposedAt;
        uint64 readyAt;       // timelock: 0 para acciones sin retardo
        uint32 approvals;
        bool executed;
        bool consumed;        // lo consumió el contrato ejecutor (mint, forced transfer...)
    }

    mapping(bytes32 => Proposal) private _proposals;
    mapping(bytes32 => mapping(address => bool)) private _approved;
    mapping(address => bool) private _signers;
    address[] private _signerList;

    uint256 private _threshold;          // quórum general
    uint256 private _upgradeThreshold;   // quórum reforzado para upgrades
    uint64 public immutable timelockDelay;
    uint64 public immutable maxPauseDuration;

    // Pausa de emergencia: siempre con motivo y siempre con caducidad.
    bytes32 private _pauseReason;
    uint64 private _pauseExpiresAt;

    // H19 · Identidad de la pausa VIGENTE. Antes, `liftPause` sólo exigía una
    // propuesta de tipo UNPAUSE con quórum y no la consumía: una aprobación
    // emitida para el incidente de ayer levantaba la pausa de hoy. Ahora cada
    // pausa tiene un identificador propio, la aprobación lo compromete en su
    // `nonce`, y al levantarla el identificador se borra y el digest se gasta.
    bytes32 private _pauseId;
    uint64 private _pauseSeq;

    /// @dev Autorización ligada al contenido. `digest` es el del §12.1 de
    ///      SFSP-800; aquí sólo vive quién lo propuso, cuántos lo aprobaron y si
    ///      ya se gastó. El contenido NO se guarda: el ejecutor lo recalcula.
    struct ContentAuthorization {
        bytes32 action;
        address proposer;
        uint64 proposedAt;
        uint32 approvals;
        bool consumed;
    }

    mapping(bytes32 => ContentAuthorization) private _contentAuth;
    mapping(bytes32 => mapping(address => bool)) private _contentApproved;

    /// @param signers_ firmantes iniciales (fixtures sintéticos en pruebas)
    /// @param threshold_ quórum general; el despliegue lo decide, no este código
    /// @param upgradeThreshold_ quórum de upgrade; puede ser mayor que el general
    /// @param timelockDelay_ retardo obligatorio antes de ejecutar un upgrade
    /// @param maxPauseDuration_ techo de duración de una pausa de emergencia
    constructor(
        address board,
        address[] memory signers_,
        uint256 threshold_,
        uint256 upgradeThreshold_,
        uint64 timelockDelay_,
        uint64 maxPauseDuration_
    ) SFSPAccessControl(board) {
        if (threshold_ == 0 || threshold_ > signers_.length) revert InvalidQuorum(threshold_, signers_.length);
        if (upgradeThreshold_ < threshold_ || upgradeThreshold_ > signers_.length) {
            revert InvalidQuorum(upgradeThreshold_, signers_.length);
        }
        // Una pausa sin techo es una pausa permanente encubierta.
        require(maxPauseDuration_ > 0, "SFSP: maxPauseDuration=0");
        for (uint256 i = 0; i < signers_.length; i++) {
            address s = signers_[i];
            require(s != address(0) && !_signers[s], "SFSP: signer invalido");
            _signers[s] = true;
            _signerList.push(s);
        }
        _threshold = threshold_;
        _upgradeThreshold = upgradeThreshold_;
        timelockDelay = timelockDelay_;
        maxPauseDuration = maxPauseDuration_;
    }

    // ---------------------------------------------------------------- lecturas

    function isSigner(address account) public view returns (bool) {
        return _signers[account];
    }

    function signerCount() external view returns (uint256) {
        return _signerList.length;
    }

    function quorumThreshold() external view returns (uint256) {
        return _threshold;
    }

    function upgradeQuorumThreshold() external view returns (uint256) {
        return _upgradeThreshold;
    }

    /// @dev La pausa caduca sola: pasado `expiresAt` el sistema vuelve a operar
    ///      sin necesidad de que nadie "recuerde" despausar.
    function isPaused() public view returns (bool) {
        return _pauseExpiresAt > block.timestamp;
    }

    function pauseReason() external view returns (bytes32 reasonCode, uint64 expiresAt) {
        if (!isPaused()) return (bytes32(0), 0);
        return (_pauseReason, _pauseExpiresAt);
    }

    function proposalOf(bytes32 operationId) external view returns (Proposal memory) {
        return _proposals[operationId];
    }

    function isActionApproved(bytes32 operationId) public view returns (bool) {
        Proposal storage p = _proposals[operationId];
        if (p.proposedAt == 0 || p.consumed) return false;
        if (p.approvals < _requiredFor(p.actionKind)) return false;
        if (p.readyAt > block.timestamp) return false;
        return true;
    }

    function _requiredFor(bytes32 actionKind) internal view returns (uint256) {
        return actionKind == bytes32("UPGRADE") ? _upgradeThreshold : _threshold;
    }

    // ------------------------------------------------------------ propuestas

    /// @dev `operationId` es la unidad de idempotencia (§1): una propuesta por id.
    function propose(bytes32 operationId, bytes32 actionKind, bytes32 detail) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        if (operationId == bytes32(0)) revert UnknownProposal(operationId);
        if (_proposals[operationId].proposedAt != 0) revert DuplicateProposal(operationId);

        // Sólo los upgrades llevan timelock: una pausa que esperase no serviría.
        uint64 readyAt = actionKind == bytes32("UPGRADE")
            ? uint64(block.timestamp) + timelockDelay
            : uint64(block.timestamp);

        _proposals[operationId] = Proposal({
            actionKind: actionKind,
            detail: detail,
            proposedAt: uint64(block.timestamp),
            readyAt: readyAt,
            approvals: 0,
            executed: false,
            consumed: false
        });
        emit GovernanceAction(operationId, bytes32("PROPOSED"), msg.sender, detail, readyAt);
        _approve(operationId);
    }

    function approve(bytes32 operationId) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        if (_proposals[operationId].proposedAt == 0) revert UnknownProposal(operationId);
        _approve(operationId);
    }

    function _approve(bytes32 operationId) internal {
        if (_approved[operationId][msg.sender]) revert AlreadyApproved(operationId, msg.sender);
        _approved[operationId][msg.sender] = true;
        _proposals[operationId].approvals += 1;
        emit GovernanceAction(
            operationId, bytes32("APPROVED"), msg.sender, bytes32(uint256(_proposals[operationId].approvals)), 0
        );
    }

    /// @dev Ejecutar sólo marca la decisión como tomada en cadena. El efecto lo
    ///      aplica el contrato afectado, que vuelve a comprobar el quórum.
    function execute(bytes32 operationId) external {
        Proposal storage p = _proposals[operationId];
        if (p.proposedAt == 0) revert UnknownProposal(operationId);
        if (p.executed) revert AlreadyExecuted(operationId);
        uint256 need = _requiredFor(p.actionKind);
        if (p.approvals < need) revert QuorumNotReached(operationId, p.approvals, need);
        if (p.readyAt > block.timestamp) revert TimelockPending(operationId, p.readyAt);
        p.executed = true;
        emit GovernanceAction(operationId, p.actionKind, msg.sender, p.detail, uint64(block.timestamp));
    }

    /// @dev Un ejecutor autorizado (emisión, forced transfer, migración) consume
    ///      la aprobación: una misma aprobación no vale para dos operaciones.
    function consumeApprovedAction(bytes32 operationId) external onlyRole(TECH_OPS) returns (bool) {
        if (!isActionApproved(operationId)) return false;
        _proposals[operationId].consumed = true;
        emit GovernanceAction(operationId, bytes32("CONSUMED"), msg.sender, bytes32(0), uint64(block.timestamp));
        return true;
    }

    // ------------------------------------------------------------ pausa

    /// @param reasonCode motivo obligatorio: una pausa sin motivo no es auditable.
    /// @param duration duración; acotada por `maxPauseDuration` del despliegue.
    function emergencyPause(bytes32 reasonCode, uint64 duration) external {
        if (!_signers[msg.sender] && !hasRole(TECH_OPS, msg.sender)) revert NotSigner(msg.sender);
        if (reasonCode == bytes32(0)) revert PauseReasonRequired();
        if (duration == 0 || duration > maxPauseDuration) {
            revert PauseExpiryInvalid(duration, maxPauseDuration);
        }
        _pauseReason = reasonCode;
        _pauseExpiresAt = uint64(block.timestamp) + duration;
        // H19 · el identificador incluye un contador monótono además del reloj:
        // dos pausas con el mismo motivo en el mismo segundo siguen siendo dos
        // incidentes distintos y no comparten aprobación de reanudación.
        _pauseSeq += 1;
        _pauseId = keccak256(
            abi.encode("SFSP.PAUSE.ID.v1", block.chainid, address(this), reasonCode, block.timestamp, _pauseSeq)
        );
        emit GovernanceAction(_pauseId, bytes32("PAUSE"), msg.sender, reasonCode, _pauseExpiresAt);
    }

    /// @notice Identificador de la pausa vigente; `0` cuando no hay ninguna.
    /// @dev Es lo que la aprobación de reanudación tiene que llevar en su `nonce`.
    function currentPauseId() external view returns (bytes32) {
        return isPaused() ? _pauseId : bytes32(0);
    }

    /// @notice Levanta LA pausa vigente, y sólo ésa.
    /// @dev H19. Antes bastaba una propuesta `UNPAUSE` con quórum, que no se
    ///      consumía: la misma aprobación servía para el incidente siguiente.
    ///      Ahora hacen falta tres cosas a la vez, y las tres son del §12.3:
    ///      1. el payload lleva en `nonce` el identificador de ESTA pausa;
    ///      2. el digest recalculado desde el payload está aprobado con quórum
    ///         y separación de funciones;
    ///      3. el digest se consume, aquí y en el registro de la biblioteca.
    ///      Con eso, una aprobación de reanudación no sobrevive a su incidente.
    function liftPause(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        if (!isPaused()) revert NotPaused();
        if (p.action != bytes32("UNPAUSE")) revert AuthorizationUnknown(approvedDigest);
        if (p.nonce != _pauseId) revert PauseMismatch(_pauseId, p.nonce);
        _requireAuthorizationApproved(approvedDigest);

        // Recalcula el digest desde el payload real, comprueba atadura y
        // vigencia, y lo gasta. Un payload alterado en un campo no autoriza.
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        _consumeAuthorization(approvedDigest, msg.sender);

        _pauseExpiresAt = 0;
        _pauseReason = bytes32(0);
        _pauseId = bytes32(0);
        emit GovernanceAction(
            approvedDigest, bytes32("UNPAUSE"), msg.sender, SFSPCodes.R_PAUSED, uint64(block.timestamp)
        );
    }

    // ------------------------------------------- autorizacion ligada al contenido

    /// @notice Propone un digest del §12.1. El proponente NO cuenta como aprobador.
    /// @dev P03/§12.5: doble control con separación de funciones en TODA acción
    ///      crítica. El camino viejo de `propose` cuenta al proponente como primer
    ///      aprobador; éste no, a propósito: ahí estaba la mitad del control.
    function proposeAuthorization(bytes32 digest, bytes32 action) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        if (digest == bytes32(0) || action == bytes32(0)) revert AuthorizationUnknown(digest);
        if (_contentAuth[digest].proposedAt != 0) revert AuthorizationDuplicate(digest);
        _contentAuth[digest] = ContentAuthorization({
            action: action,
            proposer: msg.sender,
            proposedAt: uint64(block.timestamp),
            approvals: 0,
            consumed: false
        });
        emit AuthorizationProposed(digest, action, msg.sender);
    }

    function approveAuthorization(bytes32 digest) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        ContentAuthorization storage a = _contentAuth[digest];
        if (a.proposedAt == 0) revert AuthorizationUnknown(digest);
        if (a.consumed) revert AuthorizationSpent(digest);
        if (msg.sender == a.proposer) revert ProposerCannotApprove(digest, msg.sender);
        if (_contentApproved[digest][msg.sender]) revert AlreadyApprovedAuthorization(digest, msg.sender);
        _contentApproved[digest][msg.sender] = true;
        a.approvals += 1;
        emit AuthorizationApproved(digest, msg.sender, a.approvals);
    }

    function authorizationOf(bytes32 digest) external view returns (ContentAuthorization memory) {
        return _contentAuth[digest];
    }

    function isAuthorizationApproved(bytes32 digest) public view returns (bool) {
        ContentAuthorization storage a = _contentAuth[digest];
        if (a.proposedAt == 0 || a.consumed) return false;
        return a.approvals >= _requiredFor(a.action);
    }

    function _requireAuthorizationApproved(bytes32 digest) internal view {
        ContentAuthorization storage a = _contentAuth[digest];
        if (a.proposedAt == 0) revert AuthorizationUnknown(digest);
        if (a.consumed) revert AuthorizationSpent(digest);
        uint256 need = _requiredFor(a.action);
        if (a.approvals < need) revert AuthorizationQuorumNotReached(digest, a.approvals, need);
    }

    function _consumeAuthorization(bytes32 digest, address executor) internal {
        _contentAuth[digest].consumed = true;
        emit AuthorizationConsumed(digest, executor, uint64(block.timestamp));
    }

    /// @notice Gasto de la aprobación por el ejecutor que la usa.
    /// @dev Revierte en vez de devolver `false`. El camino viejo
    ///      `consumeApprovedAction` devolvía `false` y dejaba al llamador la
    ///      responsabilidad de mirar el booleano; un ejecutor que lo ignorase
    ///      ejecutaba sin autorización. Aquí no hay booleano que ignorar.
    function consumeAuthorization(bytes32 digest) external onlyRole(TECH_OPS) {
        _requireAuthorizationApproved(digest);
        _consumeAuthorization(digest, msg.sender);
    }

    // ------------------------------------------------------------ quórum y recuperación

    /// @dev Cambiar el quórum es una acción de gobierno aprobada, no un setter libre.
    function setQuorum(bytes32 operationId, uint256 newThreshold, uint256 newUpgradeThreshold) external {
        Proposal storage p = _proposals[operationId];
        if (p.proposedAt == 0 || p.actionKind != bytes32("QUORUM")) revert UnknownProposal(operationId);
        if (p.consumed) revert AlreadyExecuted(operationId);
        if (p.approvals < _threshold) revert QuorumNotReached(operationId, p.approvals, _threshold);
        if (newThreshold == 0 || newThreshold > _signerList.length) {
            revert InvalidQuorum(newThreshold, _signerList.length);
        }
        if (newUpgradeThreshold < newThreshold || newUpgradeThreshold > _signerList.length) {
            revert InvalidQuorum(newUpgradeThreshold, _signerList.length);
        }
        p.consumed = true;
        _threshold = newThreshold;
        _upgradeThreshold = newUpgradeThreshold;
        emit GovernanceAction(operationId, bytes32("QUORUM"), msg.sender, bytes32(newThreshold), uint64(block.timestamp));
    }

    /// @dev Recuperación con expediente y evidencia; NUNCA datos personales (§7).
    function recordRecovery(bytes32 operationId, bytes32 caseId, bytes32 evidenceRoot) external {
        Proposal storage p = _proposals[operationId];
        if (p.proposedAt == 0 || p.actionKind != bytes32("RECOVERY")) revert UnknownProposal(operationId);
        if (p.consumed) revert AlreadyExecuted(operationId);
        if (p.approvals < _threshold) revert QuorumNotReached(operationId, p.approvals, _threshold);
        require(caseId != bytes32(0) && evidenceRoot != bytes32(0), "SFSP: expediente incompleto");
        p.consumed = true;
        emit RecoveryExecuted(caseId, operationId, evidenceRoot, uint64(block.timestamp));
    }

    /// @dev Registra en cadena que DBNX autorizó una capacidad con monto y vigencia.
    function recordSupplyAuthorization(bytes32 assetId, bytes32 authorizationId, uint256 amount, uint64 expiry)
        external
        onlyRole(DBNX_BOARD)
    {
        emit SupplyAuthorized(assetId, authorizationId, amount, expiry);
    }
}
