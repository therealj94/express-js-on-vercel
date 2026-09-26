// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {ISFSPGovernanceController, ISFSPEligibilityEngine} from "./lib/ISFSP.sol";

/// @title Bóveda sellada de la moneda nativa (ORIGEN) · SFSP-410 §4.
/// @notice ORIGEN es la moneda nativa de la cadena: su suministro quedó fijado en
///         el bloque génesis y ningún contrato puede acuñarlo ni quemarlo (ADR-006).
///         Para cumplir la política "circulante = lo que tienen los usuarios", todo
///         el ORIGEN que no es de usuarios vive AQUÍ, sellado:
///           · EMITIR  = liberar desde la bóveda a un usuario, con orden de gobierno
///                       (doble control) o dentro de un cupo aprobado con espera;
///           · QUEMAR  = devolver a la bóveda (`absorb`); vuelve a no existir para
///                       el circulante.
///         La bóveda no tiene retiro de administrador, ni dueño, ni actualización:
///         la ÚNICA salida es `release` o `releaseOnDemand`.
/// @dev El circulante que publica `circulating()` es
///      génesis − bóveda − saldos de las cuentas internas declaradas, y se puede
///      recalcular desde fuera con lecturas de saldo: no depende de confiar en
///      ningún contador de este contrato.
contract SFSPNativeVault is SFSPAccessControl, SFSPReentrancyGuard {
    bytes32 public constant ACTION_RELEASE = bytes32("RELEASE_NATIVE");
    bytes32 public constant ACTION_SET_RELEASE_BUDGET = bytes32("SET_RELEASE_BUDGET");
    bytes32 public constant BUDGET_TERMS_TAG = keccak256("SFSP.RELEASE_BUDGET.TERMS.v1");
    uint256 public constant MAX_INTERNAL_ACCOUNTS = 64;

    ISFSPGovernanceController public immutable governance;
    ISFSPEligibilityEngine public immutable engine;
    bytes32 public immutable assetId;
    /// @dev Suministro nativo fijado en el génesis (en unidades mínimas). Es un
    ///      dato de la cadena, no una decisión: se entrega en el despliegue.
    uint256 public immutable genesisSupply;

    struct ReleaseBudget {
        uint256 perPeriod;
        uint64 period;
        uint256 maxPerOperation;
        uint64 validUntil;
        uint64 periodIndex;
        uint256 usedInPeriod;
    }

    ReleaseBudget private _budget;
    mapping(bytes32 => bool) private _usedOperation;
    mapping(address => bool) private _internalAccount;
    address[] private _internalList;
    uint256 public totalReleased;
    uint256 public totalAbsorbed;

    // Todo evento que mueve el circulante lleva `assetId` (regla de spec/eventos.json).
    event NativeAbsorbed(bytes32 indexed assetId, address indexed from, bytes32 indexed reasonCode, uint256 amount);
    event NativeReleased(
        bytes32 indexed assetId,
        address indexed destination,
        bytes32 indexed operationId,
        uint256 amount,
        bytes32 route,
        bytes32 evidenceRoot
    );
    event ReleaseBudgetSet(
        bytes32 indexed assetId,
        bytes32 indexed digest,
        uint256 perPeriod,
        uint64 period,
        uint256 maxPerOperation,
        uint64 validUntil,
        bytes32 termsDocRoot
    );
    event ReleaseBudgetRevoked(bytes32 indexed assetId, address indexed by, bytes32 reasonCode);
    event VaultInternalAccountFlagged(address indexed account, bool internalAccount, address indexed by, bytes32 reasonCode);

    error Paused();
    error OperationReplay(bytes32 operationId);
    error ReleaseToInternalAccount(address destination);
    error ReleaseNotAuthorized(bytes32 digest);
    error AuthorizationActionMismatch(bytes32 expected, bytes32 got);
    error ReleaseRejected(uint8 code, bytes32 reason);
    error InsufficientVaultBalance(uint256 balance, uint256 requested);
    error BudgetNotSet(uint8 code);
    error BudgetExpired(uint64 validUntil);
    error BudgetPeriodExceeded(uint256 used, uint256 requested, uint256 perPeriod);
    error BudgetOperationTooLarge(uint256 requested, uint256 maxPerOperation);
    error BudgetTermsMismatch(bytes32 evidenceRoot, bytes32 recomputed);
    error BudgetWaitPending(bytes32 digest, uint64 readyAt);
    error BudgetInvalid(bytes32 reason);
    error InternalAccountUnflagNeedsBoard(address account);
    error TooManyInternalAccounts();
    error TransferFailed();

    constructor(address board, address governance_, address engine_, bytes32 assetId_, uint256 genesisSupply_)
        SFSPAccessControl(board)
    {
        require(governance_ != address(0) && engine_ != address(0), "SFSP: dependencias=0");
        require(assetId_ != bytes32(0) && genesisSupply_ > 0, "SFSP: activo invalido");
        governance = ISFSPGovernanceController(governance_);
        engine = ISFSPEligibilityEngine(engine_);
        assetId = assetId_;
        genesisSupply = genesisSupply_;
    }

    // ------------------------------------------------------------- entrada

    /// @notice Devolver ORIGEN a la bóveda: el equivalente de quemar.
    /// @param reasonCode motivo (REDENCION, CONSOLIDACION_TESORERIA, …).
    function absorb(bytes32 reasonCode) external payable {
        require(msg.value > 0, "SFSP: monto=0");
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        totalAbsorbed += msg.value;
        emit NativeAbsorbed(assetId, msg.sender, reasonCode, msg.value);
    }

    /// @dev Un envío directo también se sella: nada entra sin quedar registrado.
    receive() external payable {
        totalAbsorbed += msg.value;
        emit NativeAbsorbed(assetId, msg.sender, bytes32("DIRECT"), msg.value);
    }

    // ------------------------------------------------------------- lecturas

    function vaultBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function internalAccounts() external view returns (address[] memory) {
        return _internalList;
    }

    function isInternalAccount(address account) external view returns (bool) {
        return _internalAccount[account];
    }

    /// @notice Saldo nativo de las cuentas internas que siguen FUERA de la bóveda.
    function internalOutsideVault() public view returns (uint256 sum) {
        for (uint256 i = 0; i < _internalList.length; i++) {
            address a = _internalList[i];
            if (_internalAccount[a]) sum += a.balance;
        }
    }

    /// @notice Circulante = génesis − bóveda − cuentas internas fuera de la bóveda.
    function circulating() external view returns (uint256) {
        uint256 held = vaultBalance() + internalOutsideVault();
        return held >= genesisSupply ? 0 : genesisSupply - held;
    }

    function releaseBudget() external view returns (ReleaseBudget memory) {
        return _budget;
    }

    function budgetRemaining() external view returns (uint256) {
        ReleaseBudget memory b = _budget;
        if (b.period == 0 || block.timestamp >= b.validUntil) return 0;
        uint64 idx = uint64(block.timestamp / b.period);
        uint256 used = idx == b.periodIndex ? b.usedInPeriod : 0;
        return used >= b.perPeriod ? 0 : b.perPeriod - used;
    }

    function isOperationUsed(bytes32 operationId) external view returns (bool) {
        return _usedOperation[operationId];
    }

    // ------------------------------------------------------------- cuentas internas

    /// @dev Marcar restringe (TECH_OPS o Junta); desmarcar amplía (sólo Junta).
    function setInternalAccount(address account, bool internalAccount, bytes32 reasonCode) external {
        require(account != address(0), "SFSP: account=0");
        // La propia bóveda no es una cuenta interna "fuera de la bóveda": marcarla
        // contaría su saldo dos veces y rebajaría el circulante publicado.
        require(account != address(this), "SFSP: la boveda no es cuenta interna");
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        if (internalAccount) {
            if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender)) revert Unauthorized(TECH_OPS, msg.sender);
            if (!_internalAccount[account]) {
                bool listed;
                for (uint256 i = 0; i < _internalList.length; i++) {
                    if (_internalList[i] == account) listed = true;
                }
                if (!listed) {
                    if (_internalList.length >= MAX_INTERNAL_ACCOUNTS) revert TooManyInternalAccounts();
                    _internalList.push(account);
                }
            }
        } else if (!hasRole(DBNX_BOARD, msg.sender)) {
            revert InternalAccountUnflagNeedsBoard(account);
        }
        _internalAccount[account] = internalAccount;
        emit VaultInternalAccountFlagged(account, internalAccount, msg.sender, reasonCode);
    }

    // ------------------------------------------------------------- salida 1: orden de gobierno

    /// @notice Libera con una orden de gobierno ligada al contenido (doble control).
    /// @dev Payload: action RELEASE_NATIVE, assetId de ORIGEN, destination, amount,
    ///      nonce = operationId, evidenceRoot = motivo/evidencia.
    function release(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest) external onlyRole(ISSUER) nonReentrant {
        if (governance.isPaused()) revert Paused();
        if (p.action != ACTION_RELEASE) revert AuthorizationActionMismatch(ACTION_RELEASE, p.action);
        if (p.assetId != assetId) revert BudgetInvalid(bytes32("ASSET"));
        if (p.origin != address(0) || p.amount == 0 || p.evidenceRoot == bytes32(0)) revert BudgetInvalid(bytes32("PAYLOAD"));
        if (governance.authorizationActionOf(approvedDigest) != ACTION_RELEASE) {
            revert AuthorizationActionMismatch(ACTION_RELEASE, governance.authorizationActionOf(approvedDigest));
        }
        if (!governance.isAuthorizationApproved(approvedDigest)) revert ReleaseNotAuthorized(approvedDigest);
        if (_usedOperation[p.nonce]) revert OperationReplay(p.nonce);
        _usedOperation[p.nonce] = true;

        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        _pay(p.destination, p.amount, p.nonce, bytes32("GOVERNANCE"), p.evidenceRoot);
    }

    // ------------------------------------------------------------- salida 2: cupo

    function budgetTermsRoot(uint64 period, uint64 validUntil, bytes32 termsDocRoot) public pure returns (bytes32) {
        return keccak256(abi.encode(BUDGET_TERMS_TAG, period, validUntil, termsDocRoot));
    }

    /// @notice Fija el cupo de liberación con doble control, espera y consumo único.
    function setReleaseBudget(
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest,
        uint64 period,
        uint64 validUntil,
        bytes32 termsDocRoot
    ) external nonReentrant {
        if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender)) revert Unauthorized(TECH_OPS, msg.sender);
        if (p.action != ACTION_SET_RELEASE_BUDGET) revert AuthorizationActionMismatch(ACTION_SET_RELEASE_BUDGET, p.action);
        if (p.assetId != assetId) revert BudgetInvalid(bytes32("ASSET"));
        if (p.origin != address(0) || p.destination != address(0)) revert BudgetInvalid(bytes32("PARTIES"));
        if (p.amount == 0 || p.amountSecondary == 0 || p.amountSecondary > p.amount) revert BudgetInvalid(bytes32("AMOUNTS"));
        if (period == 0 || validUntil <= block.timestamp) revert BudgetInvalid(bytes32("WINDOW"));
        bytes32 terms = budgetTermsRoot(period, validUntil, termsDocRoot);
        if (p.evidenceRoot != terms) revert BudgetTermsMismatch(p.evidenceRoot, terms);

        if (governance.authorizationActionOf(approvedDigest) != ACTION_SET_RELEASE_BUDGET) {
            revert AuthorizationActionMismatch(ACTION_SET_RELEASE_BUDGET, governance.authorizationActionOf(approvedDigest));
        }
        if (!governance.isAuthorizationApproved(approvedDigest)) revert ReleaseNotAuthorized(approvedDigest);
        uint64 readyAt = governance.authorizationProposedAt(approvedDigest) + governance.timelockDelay();
        if (block.timestamp < readyAt) revert BudgetWaitPending(approvedDigest, readyAt);

        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        _budget = ReleaseBudget({
            perPeriod: p.amount,
            period: period,
            maxPerOperation: p.amountSecondary,
            validUntil: validUntil,
            periodIndex: uint64(block.timestamp / period),
            usedInPeriod: 0
        });
        emit ReleaseBudgetSet(assetId, approvedDigest, p.amount, period, p.amountSecondary, validUntil, termsDocRoot);
    }

    /// @notice Corta el cupo al instante; reducir poder no necesita quórum.
    function revokeReleaseBudget(bytes32 reasonCode) external {
        if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender) && !governance.isSigner(msg.sender)) {
            revert Unauthorized(TECH_OPS, msg.sender);
        }
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        delete _budget;
        emit ReleaseBudgetRevoked(assetId, msg.sender, reasonCode);
    }

    /// @notice Libera al USUARIO exactamente lo que pagó, dentro del cupo.
    function releaseOnDemand(address destination, uint256 amount, bytes32 paymentRef, bytes32 evidenceRoot)
        external
        onlyRole(ISSUER)
        nonReentrant
    {
        if (governance.isPaused()) revert Paused();
        if (paymentRef == bytes32(0) || amount == 0) revert BudgetInvalid(bytes32("ARGS"));
        if (_usedOperation[paymentRef]) revert OperationReplay(paymentRef);
        _usedOperation[paymentRef] = true;

        ReleaseBudget storage b = _budget;
        if (b.period == 0) revert BudgetNotSet(SFSPCodes.BLOCKED_DECISION);
        if (block.timestamp >= b.validUntil) revert BudgetExpired(b.validUntil);
        if (amount > b.maxPerOperation) revert BudgetOperationTooLarge(amount, b.maxPerOperation);
        uint64 idx = uint64(block.timestamp / b.period);
        uint256 used = idx == b.periodIndex ? b.usedInPeriod : 0;
        if (used + amount > b.perPeriod) revert BudgetPeriodExceeded(used, amount, b.perPeriod);
        b.periodIndex = idx;
        b.usedInPeriod = used + amount;

        _pay(destination, amount, paymentRef, bytes32("BUDGET"), evidenceRoot);
    }

    // ------------------------------------------------------------- pago

    /// @dev Reglas comunes a las dos salidas: nunca a una cuenta interna (eso
    ///      sería sacar ORIGEN de la bóveda para guardarlo en otro cajón), el
    ///      destino tiene que ser elegible, y efectos antes de la transferencia.
    function _pay(address destination, uint256 amount, bytes32 operationId, bytes32 route, bytes32 evidenceRoot) internal {
        if (destination == address(0)) revert BudgetInvalid(bytes32("DESTINATION"));
        if (_internalAccount[destination]) revert ReleaseToInternalAccount(destination);
        (uint8 code, bytes32 reason,) = engine.evaluateOperation(destination, assetId, bytes32("MINT"), amount, bytes32(0));
        if (code != SFSPCodes.ALLOW) revert ReleaseRejected(code, reason);
        uint256 bal = address(this).balance;
        if (bal < amount) revert InsufficientVaultBalance(bal, amount);
        totalReleased += amount;
        emit NativeReleased(assetId, destination, operationId, amount, route, evidenceRoot);
        (bool ok,) = destination.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
