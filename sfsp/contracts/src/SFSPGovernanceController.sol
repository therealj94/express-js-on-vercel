// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";

/// @title Gobierno SFSP: doble control sobre digests, timelock y pausa caduca.
/// @notice Los quórums, el retardo del timelock y el techo de pausa son parámetros
///         del constructor. No se hardcodea ningún número "recomendado": el
///         despliegue los recibe y una prueba usa fixtures sintéticos.
/// @dev P03 · CIERRE COMPLETO. Hasta draft-0.3 convivían dos caminos:
///      `propose(operationId, actionKind, detail)`, donde quien proponía contaba
///      como primer aprobador y el objeto aprobado era un identificador elegido
///      por el llamador; y `proposeAuthorization(digest)`, con separación de
///      funciones real. El primero se ha retirado ENTERO —struct, mapas,
///      `isActionApproved` y `consumeApprovedAction` incluidos— porque mientras
///      existiera seguía habiendo una ruta crítica de un solo rol: `UPGRADE`,
///      `RECOVERY`, `SET_QUORUM` y `SET_POLICY` pasaban por él. Ahora las nueve
///      acciones del §12.5 con ejecutor en este árbol usan el mismo patrón:
///      aprobación sobre el digest del §12.1, el proponente no aprueba, y el
///      ejecutor recalcula el digest desde sus argumentos reales y lo consume.
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
    error PauseReasonRequired();
    error PauseExpiryInvalid(uint64 expiresAt, uint64 maxAllowed);
    error InvalidQuorum(uint256 threshold, uint256 signers);
    error AuthorizationUnknown(bytes32 digest);
    error AuthorizationDuplicate(bytes32 digest);
    error AuthorizationSpent(bytes32 digest);
    error AuthorizationQuorumNotReached(bytes32 digest, uint256 have, uint256 need);
    error AuthorizationActionMismatch(bytes32 expected, bytes32 got);
    // P03/§12.5 · separacion de funciones: quien propone NO aprueba. Un mismo
    // actor no puede contar dos veces por proponer y aprobar lo mismo.
    error ProposerCannotApprove(bytes32 digest, address proposer);
    error AlreadyApprovedAuthorization(bytes32 digest, address signer);
    // §12.5 · UPGRADE y RECOVERY llevan espera ademas de doble control.
    error TimelockPending(bytes32 digest, uint64 readyAt);
    // H19 · la reanudacion se ata al incidente concreto que levanta.
    error PauseMismatch(bytes32 expectedPauseId, bytes32 presentedNonce);
    error NotPaused();
    error UpgradeTargetRequired();
    error RecoveryCaseIncomplete();

    // §12.5 · alcances canonicos de las acciones de gobierno que no tienen un
    // activo concreto. `assetId` no puede ser cero (§12.2), asi que cada accion
    // de gobierno declara aqui SU alcance y una aprobacion de una no vale para
    // otra ni aunque coincidiera el resto del payload.
    bytes32 public constant SCOPE_UPGRADE = bytes32("SFSP:GOV:UPGRADE");
    bytes32 public constant SCOPE_QUORUM = bytes32("SFSP:GOV:QUORUM");

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
        /// @dev §12.5 · quórum EXIGIBLE EN EL MOMENTO DE PROPONER, congelado aquí.
        ///      Sin este número guardado, `SET_QUORUM` se podría usar para
        ///      rebajarse a sí misma: bastaría bajar el quórum general con una
        ///      operación y ejecutar con el quórum nuevo, más barato, todas las
        ///      autorizaciones que estaban pendientes bajo el anterior. Con el
        ///      congelado, una aprobación nunca se valida con un quórum menor
        ///      que el que regía cuando se propuso; subirlo sí la afecta, porque
        ///      se exige el mayor de los dos.
        uint32 quorumAtProposal;
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

    function _requiredFor(bytes32 actionKind) internal view returns (uint256) {
        return actionKind == bytes32("UPGRADE") ? _upgradeThreshold : _threshold;
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
        if (p.action != bytes32("UNPAUSE")) revert AuthorizationActionMismatch(bytes32("UNPAUSE"), p.action);
        if (p.nonce != _pauseId) revert PauseMismatch(_pauseId, p.nonce);
        _requireAuthorizationApproved(approvedDigest, bytes32("UNPAUSE"));

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
    ///      crítica. El camino viejo de `propose` contaba al proponente como primer
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
            consumed: false,
            quorumAtProposal: uint32(_requiredFor(action))
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

    /// @dev El quórum exigible es el MAYOR entre el congelado al proponer y el
    ///      vigente. Ver `ContentAuthorization.quorumAtProposal`.
    function _needFor(ContentAuthorization storage a) internal view returns (uint256) {
        uint256 vigente = _requiredFor(a.action);
        return vigente > a.quorumAtProposal ? vigente : a.quorumAtProposal;
    }

    function isAuthorizationApproved(bytes32 digest) public view returns (bool) {
        ContentAuthorization storage a = _contentAuth[digest];
        if (a.proposedAt == 0 || a.consumed) return false;
        return a.approvals >= _needFor(a);
    }

    /// @notice Instante en que un digest quedó propuesto; `0` si no existe.
    /// @dev Lo consultan los ejecutores que llevan espera (§12.5: UPGRADE y
    ///      RECOVERY). La espera se mide desde la PROPUESTA, no desde la última
    ///      aprobación: si se midiera desde la última, juntar las aprobaciones
    ///      tarde acortaría la ventana de reacción a cero.
    function authorizationProposedAt(bytes32 digest) external view returns (uint64) {
        return _contentAuth[digest].proposedAt;
    }

    /// @notice Acción con la que se propuso un digest; `0` si no existe.
    /// @dev SFSP-410 · un ejecutor que no es este contrato también tiene que
    ///      poder exigir que lo aprobado lo fuera CON SU acción: un digest
    ///      aprobado como MINT no puede gastarse para fijar un cupo.
    function authorizationActionOf(bytes32 digest) external view returns (bytes32) {
        return _contentAuth[digest].action;
    }

    function _requireAuthorizationApproved(bytes32 digest, bytes32 expectedAction) internal view {
        ContentAuthorization storage a = _contentAuth[digest];
        if (a.proposedAt == 0) revert AuthorizationUnknown(digest);
        if (a.consumed) revert AuthorizationSpent(digest);
        // La acción con la que se propuso tiene que ser la que se va a ejecutar:
        // un digest aprobado "como SET_POLICY" no puede gastarse como SET_QUORUM
        // aunque el payload lo dijera, porque lo que los aprobadores vieron en el
        // registro era la otra etiqueta.
        if (expectedAction != bytes32(0) && a.action != expectedAction) {
            revert AuthorizationActionMismatch(expectedAction, a.action);
        }
        uint256 need = _needFor(a);
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
        _requireAuthorizationApproved(digest, bytes32(0));
        _consumeAuthorization(digest, msg.sender);
    }

    // ------------------------------------------------------------ §12.5 · UPGRADE

    /// @notice Registra en cadena la decisión de actualización, con doble control
    ///         y espera.
    /// @dev P03. Antes esto era `propose(op, "UPGRADE", detail)` + `execute(op)`:
    ///      el proponente contaba como aprobador y lo aprobado era un
    ///      `operationId` con un `detail` opaco que nadie recalculaba. Ahora el
    ///      payload compromete la implementación destino (`destination`), la
    ///      versión (`evidenceRoot`) y el `nonce`, el digest se recalcula aquí y
    ///      se consume, y hace falta el quórum REFORZADO de upgrade más la espera
    ///      del timelock del despliegue.
    /// @param p payload del §12.1: `destination` implementación destino,
    ///        `evidenceRoot` versión destino, `assetId` el alcance `SCOPE_UPGRADE`.
    function executeUpgrade(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        if (p.action != bytes32("UPGRADE")) revert AuthorizationActionMismatch(bytes32("UPGRADE"), p.action);
        if (p.assetId != SCOPE_UPGRADE) revert AuthorizationActionMismatch(SCOPE_UPGRADE, p.assetId);
        // Una actualización sin implementación destino ni versión no es auditable:
        // el aprobador estaría firmando "actualizar" sin decir a qué.
        if (p.destination == address(0) || p.evidenceRoot == bytes32(0)) revert UpgradeTargetRequired();
        _requireAuthorizationApproved(approvedDigest, bytes32("UPGRADE"));
        _requireWait(approvedDigest);

        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        _consumeAuthorization(approvedDigest, msg.sender);
        emit GovernanceAction(approvedDigest, bytes32("UPGRADE"), msg.sender, p.evidenceRoot, uint64(block.timestamp));
    }

    /// @dev La espera del §12.5. Se reutiliza `timelockDelay`, que es el ÚNICO
    ///      retardo que el despliegue entrega: inventar aquí un segundo número
    ///      para la recuperación sería fijar un valor económico en el código, que
    ///      es exactamente lo que D07 prohíbe.
    function _requireWait(bytes32 digest) internal view {
        uint64 readyAt = _contentAuth[digest].proposedAt + timelockDelay;
        if (block.timestamp < readyAt) revert TimelockPending(digest, readyAt);
    }

    // ---------------------------------------------------------- §12.5 · RECOVERY

    /// @notice Recuperación con expediente, doble control y espera.
    /// @dev P03. `recordRecovery(operationId, caseId, evidenceRoot)` aceptaba una
    ///      propuesta auto-aprobada y, además, el `caseId` y la evidencia eran
    ///      argumentos libres del ejecutor: la decisión aprobada y el expediente
    ///      publicado podían no ser el mismo. Ahora los dos están dentro del
    ///      digest —el expediente en `nonce`, la evidencia en `evidenceRoot`—
    ///      junto con la cuenta (`origin`), el activo (`assetId`) y el destino.
    function executeRecovery(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        if (p.action != bytes32("RECOVERY")) revert AuthorizationActionMismatch(bytes32("RECOVERY"), p.action);
        // Expediente y evidencia obligatorios (§7: nunca datos personales, sólo raíces).
        if (p.evidenceRoot == bytes32(0) || p.origin == address(0) || p.destination == address(0)) {
            revert RecoveryCaseIncomplete();
        }
        _requireAuthorizationApproved(approvedDigest, bytes32("RECOVERY"));
        _requireWait(approvedDigest);

        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        _consumeAuthorization(approvedDigest, msg.sender);
        // `caseId` es el `nonce` del payload: es lo que ata la recuperación a SU
        // expediente y lo que impide que dos recuperaciones por lo demás iguales
        // colapsen en el mismo digest.
        emit RecoveryExecuted(p.nonce, approvedDigest, p.evidenceRoot, uint64(block.timestamp));
    }

    // -------------------------------------------------------- §12.5 · SET_QUORUM

    /// @notice Cambia los quórums, con doble control bajo el quórum ANTERIOR.
    /// @dev P03 y §12.5. Es la más delicada de las cuatro porque cambia el
    ///      control de todas las demás. Tres cosas la sujetan:
    ///        1. la aprobación se comprueba ANTES de escribir, así que el número
    ///           que la valida es el viejo y nunca el que ella misma introduce;
    ///        2. el quórum exigible está congelado en la autorización desde que
    ///           se propuso (`quorumAtProposal`), así que bajar el quórum no
    ///           abarata retroactivamente ninguna aprobación pendiente —incluida
    ///           una segunda `SET_QUORUM`—; y
    ///        3. el digest se consume, así que la misma decisión no se aplica dos
    ///           veces.
    ///      Los valores nuevos vienen del payload aprobado, no del código: aquí no
    ///      hay ningún número (D07).
    /// @param p `amount` quórum general nuevo, `amountSecondary` quórum de upgrade
    ///        nuevo, `assetId` el alcance `SCOPE_QUORUM`.
    function setQuorum(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest) external {
        if (!_signers[msg.sender]) revert NotSigner(msg.sender);
        if (p.action != bytes32("SET_QUORUM")) revert AuthorizationActionMismatch(bytes32("SET_QUORUM"), p.action);
        if (p.assetId != SCOPE_QUORUM) revert AuthorizationActionMismatch(SCOPE_QUORUM, p.assetId);

        uint256 newThreshold = p.amount;
        uint256 newUpgradeThreshold = p.amountSecondary;
        if (newThreshold == 0 || newThreshold > _signerList.length) {
            revert InvalidQuorum(newThreshold, _signerList.length);
        }
        if (newUpgradeThreshold < newThreshold || newUpgradeThreshold > _signerList.length) {
            revert InvalidQuorum(newUpgradeThreshold, _signerList.length);
        }

        // Comprobación del quórum ANTERIOR, antes de tocar nada.
        _requireAuthorizationApproved(approvedDigest, bytes32("SET_QUORUM"));

        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        _consumeAuthorization(approvedDigest, msg.sender);

        _threshold = newThreshold;
        _upgradeThreshold = newUpgradeThreshold;
        emit GovernanceAction(
            approvedDigest, bytes32("SET_QUORUM"), msg.sender, bytes32(newThreshold), uint64(block.timestamp)
        );
    }

    // ------------------------------------------------------------ capacidad

    /// @dev Registra en cadena que DBNX autorizó una capacidad con monto y vigencia.
    function recordSupplyAuthorization(bytes32 assetId, bytes32 authorizationId, uint256 amount, uint64 expiry)
        external
        onlyRole(DBNX_BOARD)
    {
        emit SupplyAuthorized(assetId, authorizationId, amount, expiry);
    }
}
