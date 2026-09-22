// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";

/// @title Bóveda de efectivo nativo prefinanciada para DvP.
/// @notice El nativo NO tiene `approve`: por eso el comprador prefinancia con una
///         transferencia payable y la liquidación consume un saldo interno ya
///         depositado. No existe "tirar" del saldo de nadie.
contract SFSPCashVault is SFSPAccessControl, SFSPReentrancyGuard {
    // §3 · TreasuryReleased lo emite CashVault. H15: lleva `assetId` indexado,
    // porque un release sin activo no se puede imputar al circulante de nada.
    event TreasuryReleased(bytes32 indexed assetId, address indexed to, uint256 amount, bytes32 reasonCode);
    event CashDeposited(address indexed beneficiary, uint256 amount, address indexed from);
    event CashReserved(bytes32 indexed operationId, address indexed payer, uint256 amount);
    event CashReserveConsumed(bytes32 indexed operationId, address indexed payee, uint256 amount);
    event CashReserveReleased(bytes32 indexed operationId, address indexed payer, uint256 amount);
    event SettlementEngineSet(address indexed engine);
    // H24 · un superávit inesperado se CLASIFICA, no se ignora.
    event UnassignedSurplusClassified(bytes32 indexed assetId, uint256 amount, bytes32 reasonCode);

    error NotSettlementEngine(address caller);
    error InsufficientCash(address account, uint256 have, uint256 need);
    error ReserveExists(bytes32 operationId);
    error ReserveMissing(bytes32 operationId);
    error TransferFailed(address to, uint256 amount);
    error ReconciliationBroken(uint256 onchain, uint256 liabilities);
    error ZeroAmount();
    error NoSurplusToClassify();

    struct Reserve {
        address payer;
        uint256 amount;
        bool open;
    }

    address public settlementEngine;

    /// @dev Identificador del activo-efectivo de esta bóveda. H15: sin él,
    ///      `TreasuryReleased` no se puede imputar a ningún circulante.
    bytes32 public immutable cashAssetId;

    mapping(address => uint256) private _balances;   // saldo libre por beneficiario
    mapping(bytes32 => Reserve) private _reserves;   // reservas por operationId
    uint256 private _totalFree;                      // pasivo disponible
    uint256 private _totalReserved;                  // pasivo comprometido
    // H24 · efectivo que existe en la dirección y NO tiene titular conocido.
    // Mientras no se clasifique no es pasivo de nadie; clasificarlo lo convierte
    // en una línea explícita, con motivo, en vez de dejarlo como ruido.
    uint256 private _classifiedSurplus;

    constructor(address board, bytes32 cashAssetId_) SFSPAccessControl(board) {
        require(cashAssetId_ != bytes32(0), "SFSP: cashAssetId=0");
        cashAssetId = cashAssetId_;
    }

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

    /// @dev No hay `receive()` anónimo, y eso reduce las formas de que entre
    ///      efectivo sin titular, pero NO las elimina: H24. `SELFDESTRUCT` —y, en
    ///      redes donde exista, el pago al productor del bloque— deposita Ether en
    ///      cualquier dirección sin ejecutar código, así que la afirmación «todo
    ///      el efectivo de esta bóveda tiene pasivo asignado» sería falsa y se
    ///      retira. Lo que sí se afirma, y `reconcile` comprueba, es SOLVENCIA:
    ///      el activo en la dirección es mayor o igual que los pasivos. El exceso
    ///      se mide, se publica y se clasifica; no se reparte solo ni se ignora.
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
        emit TreasuryReleased(cashAssetId, msg.sender, amount, reasonCode);
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
        return _totalFree + _totalReserved + _classifiedSurplus;
    }

    function classifiedSurplus() external view returns (uint256) {
        return _classifiedSurplus;
    }

    /// @notice Conciliación de SOLVENCIA, con el superávit clasificado aparte.
    /// @dev H24. La invariante que se comprueba es `activo >= pasivos`, no
    ///      «activo == pasivos»: el segundo sería falso en cuanto alguien fuerce
    ///      Ether a la dirección, y una invariante que se rompe sola deja de
    ///      vigilarse. `unassignedSurplus` es exactamente ese exceso: efectivo
    ///      que existe y todavía no es pasivo de nadie. Se devuelve siempre, para
    ///      que un panel no pueda mostrar «todo cuadra» mientras hay dinero sin
    ///      dueño en la bóveda.
    function reconcile()
        public
        view
        returns (uint256 onchain, uint256 liabilities, bool ok, uint256 unassignedSurplus)
    {
        onchain = address(this).balance;
        liabilities = totalLiabilities();
        ok = onchain >= liabilities;
        unassignedSurplus = ok ? onchain - liabilities : 0;
    }

    function requireReconciled() external view {
        (uint256 onchain, uint256 liabilities, bool ok,) = reconcile();
        if (!ok) revert ReconciliationBroken(onchain, liabilities);
    }

    /// @notice Convierte el superávit sin dueño en una línea de pasivo explícita.
    /// @dev H24 · el órgano lo reconoce con motivo. A partir de ahí cuenta como
    ///      pasivo y deja de aparecer como exceso, de forma que un superávit
    ///      NUEVO vuelve a ser visible en vez de confundirse con el anterior.
    ///      No se acredita a ninguna cuenta: nadie ha demostrado ser su titular,
    ///      e inventarle uno sería exactamente el error que esto evita.
    function classifyUnassignedSurplus(bytes32 reasonCode) external onlyRole(DBNX_BOARD) returns (uint256) {
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        (,, bool ok, uint256 surplus) = reconcile();
        if (!ok || surplus == 0) revert NoSurplusToClassify();
        _classifiedSurplus += surplus;
        emit UnassignedSurplusClassified(cashAssetId, surplus, reasonCode);
        return surplus;
    }

    /// @notice Retira superávit ya clasificado a un destino declarado.
    /// @dev Sólo toca la línea de superávit: no puede alcanzar el saldo de ningún
    ///      titular, porque `_balances` y `_totalFree` no se leen aquí.
    function releaseClassifiedSurplus(address to, uint256 amount, bytes32 reasonCode)
        external
        onlyRole(DBNX_BOARD)
        nonReentrant
    {
        require(to != address(0) && reasonCode != bytes32(0), "SFSP: destino/motivo invalido");
        if (amount == 0) revert ZeroAmount();
        if (amount > _classifiedSurplus) revert InsufficientCash(address(this), _classifiedSurplus, amount);
        unchecked {
            _classifiedSurplus -= amount;
        }
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed(to, amount);
        emit TreasuryReleased(cashAssetId, to, amount, reasonCode);
    }
}
