// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";

/// @title Bóveda de efectivo nativo prefinanciada para DvP.
/// @notice El nativo NO tiene `approve`: por eso el comprador prefinancia con una
///         transferencia payable y la liquidación consume un saldo interno ya
///         depositado. No existe "tirar" del saldo de nadie.
contract SFSPCashVault is SFSPAccessControl, SFSPReentrancyGuard {
    // §3 · TreasuryReleased lo emite CashVault.
    event TreasuryReleased(address indexed to, uint256 amount, bytes32 reasonCode);
    event CashDeposited(address indexed beneficiary, uint256 amount, address indexed from);
    event CashReserved(bytes32 indexed operationId, address indexed payer, uint256 amount);
    event CashReserveConsumed(bytes32 indexed operationId, address indexed payee, uint256 amount);
    event CashReserveReleased(bytes32 indexed operationId, address indexed payer, uint256 amount);
    event SettlementEngineSet(address indexed engine);

    error NotSettlementEngine(address caller);
    error InsufficientCash(address account, uint256 have, uint256 need);
    error ReserveExists(bytes32 operationId);
    error ReserveMissing(bytes32 operationId);
    error TransferFailed(address to, uint256 amount);
    error ReconciliationBroken(uint256 onchain, uint256 liabilities);
    error ZeroAmount();

    struct Reserve {
        address payer;
        uint256 amount;
        bool open;
    }

    address public settlementEngine;

    mapping(address => uint256) private _balances;   // saldo libre por beneficiario
    mapping(bytes32 => Reserve) private _reserves;   // reservas por operationId
    uint256 private _totalFree;                      // pasivo disponible
    uint256 private _totalReserved;                  // pasivo comprometido

    constructor(address board) SFSPAccessControl(board) {}

    modifier onlySettlement() {
        if (msg.sender != settlementEngine) revert NotSettlementEngine(msg.sender);
        _;
    }

    function setSettlementEngine(address engine) external onlyRole(DBNX_BOARD) {
        require(engine != address(0), "SFSP: engine=0");
        settlementEngine = engine;
        emit SettlementEngineSet(engine);
    }

    // ------------------------------------------------------------- prefinanciación

    /// @dev Depositar a nombre de otro es válido (un custodio prefinancia a su
    ///      cliente), pero queda registrado quién envió el nativo.
    function depositFor(address beneficiary) public payable {
        if (msg.value == 0) revert ZeroAmount();
        require(beneficiary != address(0), "SFSP: beneficiario=0");
        _balances[beneficiary] += msg.value;
        _totalFree += msg.value;
        emit CashDeposited(beneficiary, msg.value, msg.sender);
    }

    function deposit() external payable {
        depositFor(msg.sender);
    }

    /// @dev Sin `receive()` anónimo: un envío sin beneficiario crearía efectivo
    ///      sin pasivo asignado y rompería la conciliación.
    function withdraw(uint256 amount, bytes32 reasonCode) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 balance = _balances[msg.sender];
        if (balance < amount) revert InsufficientCash(msg.sender, balance, amount);
        // checks-effects-interactions: el saldo baja ANTES de la llamada externa.
        unchecked {
            _balances[msg.sender] = balance - amount;
        }
        _totalFree -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed(msg.sender, amount);
        emit TreasuryReleased(msg.sender, amount, reasonCode);
    }

    // ------------------------------------------------------------- reservas DvP

    /// @dev Sólo el contrato de liquidación autorizado mueve efectivo ajeno.
    function reserveCash(bytes32 operationId, address payer, uint256 amount) external onlySettlement {
        if (amount == 0) revert ZeroAmount();
        if (_reserves[operationId].open) revert ReserveExists(operationId);
        uint256 balance = _balances[payer];
        if (balance < amount) revert InsufficientCash(payer, balance, amount);
        unchecked {
            _balances[payer] = balance - amount;
        }
        _totalFree -= amount;
        _totalReserved += amount;
        _reserves[operationId] = Reserve({payer: payer, amount: amount, open: true});
        emit CashReserved(operationId, payer, amount);
    }

    function consumeReserve(bytes32 operationId, address payee) external onlySettlement {
        Reserve storage r = _reserves[operationId];
        if (!r.open) revert ReserveMissing(operationId);
        uint256 amount = r.amount;
        r.open = false;
        r.amount = 0;
        _totalReserved -= amount;
        _balances[payee] += amount;
        _totalFree += amount;
        emit CashReserveConsumed(operationId, payee, amount);
    }

    function releaseReserve(bytes32 operationId) external onlySettlement {
        Reserve storage r = _reserves[operationId];
        if (!r.open) revert ReserveMissing(operationId);
        uint256 amount = r.amount;
        address payer = r.payer;
        r.open = false;
        r.amount = 0;
        _totalReserved -= amount;
        _balances[payer] += amount;
        _totalFree += amount;
        emit CashReserveReleased(operationId, payer, amount);
    }

    // ------------------------------------------------------------- conciliación

    function balanceOfAccount(address account) external view returns (uint256) {
        return _balances[account];
    }

    function reserveOf(bytes32 operationId) external view returns (Reserve memory) {
        return _reserves[operationId];
    }

    function totalLiabilities() public view returns (uint256) {
        return _totalFree + _totalReserved;
    }

    /// @dev Concilia el activo on-chain contra los pasivos de cuentas. El OMS no
    ///      inventa balances: si esto no cuadra, la operación se detiene.
    function reconcile() public view returns (uint256 onchain, uint256 liabilities, bool ok) {
        onchain = address(this).balance;
        liabilities = totalLiabilities();
        ok = onchain >= liabilities;
    }

    function requireReconciled() external view {
        (uint256 onchain, uint256 liabilities, bool ok) = reconcile();
        if (!ok) revert ReconciliationBroken(onchain, liabilities);
    }
}
