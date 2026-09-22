// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";

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
        emit GovernanceAction(
            keccak256(abi.encode("PAUSE", reasonCode, block.timestamp)),
            bytes32("PAUSE"),
            msg.sender,
            reasonCode,
            _pauseExpiresAt
        );
    }

    /// @dev Levantar antes de tiempo exige quórum: pausar es urgente, despausar no.
    function liftPause(bytes32 operationId) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        Proposal storage p = _proposals[operationId];
        if (p.proposedAt == 0 || p.actionKind != bytes32("UNPAUSE")) revert UnknownProposal(operationId);
        if (p.approvals < _threshold) revert QuorumNotReached(operationId, p.approvals, _threshold);
        _pauseExpiresAt = 0;
        _pauseReason = bytes32(0);
        emit GovernanceAction(operationId, bytes32("UNPAUSE"), msg.sender, SFSPCodes.R_PAUSED, uint64(block.timestamp));
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
