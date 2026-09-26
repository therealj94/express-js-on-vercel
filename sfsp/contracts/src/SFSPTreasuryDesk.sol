// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {ISFSPGovernanceController, ISFSPIdentityAdapter} from "./lib/ISFSP.sol";
import {SFSPOracleRegistry} from "./SFSPOracleRegistry.sol";

/// @title Tesorería cotizadora de ORIGEN · SFSP v0.3 §10.4.
/// @notice Cotiza compra y venta de ORIGEN contra el oráculo único (precio del
///         gramin = oro por onza / 1.710,6925), con los cinco controles:
///           1. Diferencial ≥ el del mercado: si el diferencial observado del
///              mercado supera al de la tesorería, deja de cotizar.
///           2. Frescura con tolerancia: si la lectura del oráculo no está OK
///              (vieja o fuera de tolerancia) o es más vieja que la tolerancia
///              propia de la tesorería, la cotización se suspende sola.
///           3. Límite por IDENTIDAD y ventana: se cuenta por compromiso de
///              identidad (H16), no por dirección; dos direcciones de la misma
///              persona comparten el mismo cupo.
///           4. Inventario asignado y publicado por ventana, por lado: agotado,
///              la tesorería cierra ese lado hasta la ventana siguiente.
///           5. Asimetría: diferencial de compra y de venta independientes.
///         Sin parámetros fijados por la Junta (v0.3 §18: diferencial,
///         tolerancia, límites) no cotiza: BLOCKED_DECISION.
///
///         La tesorería no condiciona su actuación a un nivel de precio: sólo deja
///         de cotizar cuando la referencia deja de ser confiable.
/// @dev Precios en USD con 8 decimales por ORIGEN; cantidades de ORIGEN en wei.
///      El lado fiduciario (USD) ocurre fuera de la cadena; aquí sólo se mueve
///      ORIGEN y se registra el importe en USD con la referencia de pago.
contract SFSPTreasuryDesk is SFSPAccessControl, SFSPReentrancyGuard {
    uint256 public constant BPS = 10_000;

    /// @dev Lado visto desde la tesorería.
    uint8 public constant SIDE_DESK_SELLS = 0; // el usuario compra ORIGEN
    uint8 public constant SIDE_DESK_BUYS = 1; // el usuario vende ORIGEN

    struct Params {
        bool set;
        uint16 buySpreadBps; // la tesorería compra por debajo de la referencia
        uint16 sellSpreadBps; // la tesorería vende por encima de la referencia
        uint64 maxOracleAge; // tolerancia de frescura propia (≤ la del oráculo)
        uint64 window; // ventana de límites e inventario, en segundos
        uint256 perIdentityLimit; // ORIGEN (wei) por identidad y ventana, sumando ambos lados
        uint256 sellInventory; // ORIGEN que puede vender por ventana
        uint256 buyInventory; // ORIGEN que puede comprar por ventana
        bytes32 identityPurpose;
        uint32 version;
    }

    struct Quote {
        uint8 code;
        bytes32 reason;
        uint256 priceUsd; // por ORIGEN, 8 decimales
        uint256 usdAmount; // total, 8 decimales
        uint64 oracleRound;
    }

    ISFSPGovernanceController public immutable governance;
    ISFSPIdentityAdapter public immutable identity;
    SFSPOracleRegistry public immutable oracle;
    bytes32 public immutable assetId; // ORIGEN

    Params private _params;
    /// @dev Diferencial observado del mercado (control 1) y cuándo se observó.
    uint16 public marketSpreadBps;
    uint64 public marketSpreadObservedAt;

    mapping(uint64 => uint256[2]) private _inventoryUsed; // ventana => [vende, compra]
    mapping(bytes32 => mapping(uint64 => uint256)) private _identityUsed; // compromiso => ventana => usado
    mapping(bytes32 => bool) private _usedOperation;
    uint256 private _buyNonce;

    event DeskParametersSet(
        bytes32 indexed assetId,
        uint32 version,
        uint16 buySpreadBps,
        uint16 sellSpreadBps,
        uint64 maxOracleAge,
        uint64 window,
        uint256 perIdentityLimit,
        uint256 sellInventory,
        uint256 buyInventory
    );
    event DeskParametersCleared(bytes32 indexed assetId, bytes32 reasonCode);
    event MarketSpreadObserved(bytes32 indexed assetId, address indexed by, uint16 marketSpreadBps);
    event DeskFunded(bytes32 indexed assetId, address indexed from, uint256 amount);
    event DeskTradeExecuted(
        bytes32 indexed assetId,
        bytes32 indexed operationId,
        address indexed account,
        uint8 side,
        uint256 origenAmount,
        uint256 usdAmount,
        uint256 priceUsd,
        uint64 oracleRound
    );

    error Paused();
    error QuoteUnavailable(uint8 code, bytes32 reason);
    error IdentityNotBound(address account);
    error IdentityLimitExceeded(uint256 used, uint256 requested, uint256 limit);
    error InventoryExhausted(uint8 side, uint256 used, uint256 requested, uint256 inventory);
    error PriceMoved(uint256 quoted, uint256 limit);
    error RoundMismatch(uint64 expected, uint64 current);
    error OperationReplay(bytes32 operationId);
    error InvalidParams(bytes32 reason);
    error InsufficientDeskBalance(uint256 balance, uint256 needed);
    error TransferFailed();

    constructor(address board, address governance_, address identity_, address oracle_, bytes32 assetId_)
        SFSPAccessControl(board)
    {
        require(governance_ != address(0) && identity_ != address(0) && oracle_ != address(0), "SFSP: dependencias=0");
        require(assetId_ != bytes32(0), "SFSP: activo=0");
        governance = ISFSPGovernanceController(governance_);
        identity = ISFSPIdentityAdapter(identity_);
        oracle = SFSPOracleRegistry(oracle_);
        assetId = assetId_;
    }

    // ------------------------------------------------------------- gobierno

    /// @notice Fija los parámetros (acta D03/D04 del v0.3 §18). Sólo la Junta.
    function setParameters(Params calldata p) external onlyRole(DBNX_BOARD) {
        if (p.buySpreadBps == 0 || p.sellSpreadBps == 0 || p.buySpreadBps >= BPS || p.sellSpreadBps >= BPS) {
            revert InvalidParams("SPREAD");
        }
        // Control 1: el diferencial no puede quedar por debajo del mercado observado.
        if (p.buySpreadBps < marketSpreadBps || p.sellSpreadBps < marketSpreadBps) {
            revert InvalidParams("SPREAD_BELOW_MARKET");
        }
        if (p.maxOracleAge == 0 || p.window == 0 || p.perIdentityLimit == 0) revert InvalidParams("ZERO");
        if (p.identityPurpose == bytes32(0)) revert InvalidParams("PURPOSE");
        uint32 v = _params.version + 1;
        _params = p;
        _params.set = true;
        _params.version = v;
        emit DeskParametersSet(
            assetId, v, p.buySpreadBps, p.sellSpreadBps, p.maxOracleAge, p.window, p.perIdentityLimit, p.sellInventory, p.buyInventory
        );
    }

    /// @dev Limpiar vuelve a BLOCKED_DECISION: no queda el último número como defecto.
    function clearParameters(bytes32 reasonCode) external onlyRole(DBNX_BOARD) {
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        uint32 v = _params.version;
        delete _params;
        _params.version = v;
        emit DeskParametersCleared(assetId, reasonCode);
    }

    /// @notice Registra el diferencial observado del mercado (operación o Junta).
    function observeMarketSpread(uint16 bps) external {
        if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender)) revert Unauthorized(TECH_OPS, msg.sender);
        if (bps >= BPS) revert InvalidParams("SPREAD");
        marketSpreadBps = bps;
        marketSpreadObservedAt = uint64(block.timestamp);
        emit MarketSpreadObserved(assetId, msg.sender, bps);
    }

    function parameters() external view returns (Params memory) {
        return _params;
    }

    /// @notice Deposita ORIGEN como inventario de venta de la tesorería.
    function fund() external payable onlyRole(TECH_OPS) {
        require(msg.value > 0, "SFSP: monto=0");
        emit DeskFunded(assetId, msg.sender, msg.value);
    }

    // ------------------------------------------------------------- lecturas

    function currentWindow() public view returns (uint64) {
        uint64 w = _params.window;
        return w == 0 ? 0 : uint64(block.timestamp / w);
    }

    function inventoryRemaining(uint8 side) public view returns (uint256) {
        Params memory p = _params;
        if (!p.set || side > 1) return 0;
        uint256 inv = side == SIDE_DESK_SELLS ? p.sellInventory : p.buyInventory;
        uint256 used = _inventoryUsed[currentWindow()][side];
        return used >= inv ? 0 : inv - used;
    }

    function identityUsed(bytes32 commitment) external view returns (uint256) {
        return _identityUsed[commitment][currentWindow()];
    }

    /// @notice Cotización. Devuelve siempre un código del §4; precio 0 si no cotiza.
    function quote(uint8 side, uint256 origenAmount) public view returns (Quote memory q) {
        Params memory p = _params;
        if (!p.set) {
            q.code = SFSPCodes.BLOCKED_DECISION;
            q.reason = bytes32("DESK_PARAMS_NOT_SET");
            return q;
        }
        if (side > 1 || origenAmount == 0) {
            q.code = SFSPCodes.DENY_POLICY;
            q.reason = bytes32("BAD_REQUEST");
            return q;
        }
        if (governance.isPaused()) {
            q.code = SFSPCodes.DENY_ASSET_STATE;
            q.reason = SFSPCodes.R_PAUSED;
            return q;
        }
        // Control 1.
        uint16 spread = side == SIDE_DESK_SELLS ? p.sellSpreadBps : p.buySpreadBps;
        if (spread < marketSpreadBps) {
            q.code = SFSPCodes.DENY_POLICY;
            q.reason = bytes32("SPREAD_BELOW_MARKET");
            return q;
        }
        // Control 2.
        SFSPOracleRegistry.Reading memory r = oracle.graminPriceUsd();
        q.oracleRound = r.round;
        if (r.status != SFSPOracleRegistry.Status.OK) {
            q.code = oracle.codeOf(r.status);
            q.reason = bytes32("ORACLE_NOT_OK");
            return q;
        }
        if (block.timestamp > uint256(r.observedAt) + p.maxOracleAge) {
            q.code = SFSPCodes.UNKNOWN_SOURCE;
            q.reason = bytes32("ORACLE_STALE_FOR_DESK");
            return q;
        }
        // Control 4.
        if (inventoryRemaining(side) < origenAmount) {
            q.code = SFSPCodes.DENY_LIMIT;
            q.reason = bytes32("INVENTORY_EXHAUSTED");
            return q;
        }
        // Control 5: cada lado con su diferencial.
        if (side == SIDE_DESK_SELLS) {
            q.priceUsd = (r.price * (BPS + spread) + BPS - 1) / BPS; // hacia arriba: paga el usuario
            q.usdAmount = (origenAmount * q.priceUsd + 1e18 - 1) / 1e18;
        } else {
            q.priceUsd = (r.price * (BPS - spread)) / BPS; // hacia abajo: paga la tesorería
            q.usdAmount = (origenAmount * q.priceUsd) / 1e18;
        }
        q.code = SFSPCodes.ALLOW;
        q.reason = SFSPCodes.R_OK;
    }

    // ------------------------------------------------------------- ejecución

    /// @dev Control 3: la identidad se prueba por compromiso atado a la dirección.
    function _chargeIdentity(address account, bytes32 commitment, uint256 amount) internal {
        Params memory p = _params;
        (bool bound, bool blocked,, bool claimValid) = identity.purposeStatus(account, p.identityPurpose);
        if (!bound || blocked || !claimValid || !identity.isCommitmentBound(account, p.identityPurpose, commitment)) {
            revert IdentityNotBound(account);
        }
        uint64 w = currentWindow();
        uint256 used = _identityUsed[commitment][w];
        if (used + amount > p.perIdentityLimit) revert IdentityLimitExceeded(used, amount, p.perIdentityLimit);
        _identityUsed[commitment][w] = used + amount;
    }

    function _chargeInventory(uint8 side, uint256 amount) internal {
        uint64 w = currentWindow();
        uint256 used = _inventoryUsed[w][side];
        uint256 inv = side == SIDE_DESK_SELLS ? _params.sellInventory : _params.buyInventory;
        if (used + amount > inv) revert InventoryExhausted(side, used, amount, inv);
        _inventoryUsed[w][side] = used + amount;
    }

    /// @notice La tesorería VENDE ORIGEN a `to`, que ya pagó en USD fuera de la cadena.
    /// @param expectedRound la lectura del oráculo con la que se cotizó (misma lectura).
    /// @param maxPriceUsd precio máximo aceptado por el comprador.
    function sell(
        address to,
        bytes32 commitment,
        uint256 origenAmount,
        uint64 expectedRound,
        uint256 maxPriceUsd,
        bytes32 paymentRef
    ) external onlyRole(ISSUER) nonReentrant {
        if (paymentRef == bytes32(0) || _usedOperation[paymentRef]) revert OperationReplay(paymentRef);
        _usedOperation[paymentRef] = true;
        Quote memory q = quote(SIDE_DESK_SELLS, origenAmount);
        if (q.code != SFSPCodes.ALLOW) revert QuoteUnavailable(q.code, q.reason);
        if (q.oracleRound != expectedRound) revert RoundMismatch(expectedRound, q.oracleRound);
        if (q.priceUsd > maxPriceUsd) revert PriceMoved(q.priceUsd, maxPriceUsd);
        _chargeIdentity(to, commitment, origenAmount);
        _chargeInventory(SIDE_DESK_SELLS, origenAmount);
        if (address(this).balance < origenAmount) revert InsufficientDeskBalance(address(this).balance, origenAmount);
        emit DeskTradeExecuted(assetId, paymentRef, to, SIDE_DESK_SELLS, origenAmount, q.usdAmount, q.priceUsd, q.oracleRound);
        (bool ok,) = to.call{value: origenAmount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice La tesorería COMPRA el ORIGEN que envía el usuario. El pago en USD
    ///         (`usdAmount` del evento) se liquida fuera de la cadena.
    function buy(bytes32 commitment, uint64 expectedRound, uint256 minPriceUsd)
        external
        payable
        nonReentrant
        returns (bytes32 operationId)
    {
        Quote memory q = quote(SIDE_DESK_BUYS, msg.value);
        if (q.code != SFSPCodes.ALLOW) revert QuoteUnavailable(q.code, q.reason);
        if (q.oracleRound != expectedRound) revert RoundMismatch(expectedRound, q.oracleRound);
        if (q.priceUsd < minPriceUsd) revert PriceMoved(q.priceUsd, minPriceUsd);
        _chargeIdentity(msg.sender, commitment, msg.value);
        _chargeInventory(SIDE_DESK_BUYS, msg.value);
        _buyNonce += 1;
        operationId = keccak256(abi.encode(address(this), msg.sender, _buyNonce));
        emit DeskTradeExecuted(assetId, operationId, msg.sender, SIDE_DESK_BUYS, msg.value, q.usdAmount, q.priceUsd, q.oracleRound);
    }
}
