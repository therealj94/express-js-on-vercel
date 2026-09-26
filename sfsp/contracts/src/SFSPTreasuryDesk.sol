// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {ISFSPGovernanceController, ISFSPIdentityAdapter, ISFSPEligibilityEngine} from "./lib/ISFSP.sol";
import {ILicenseGate} from "./lib/ILicenseGate.sol";
import {SFSPOracleRegistry} from "./SFSPOracleRegistry.sol";

/// @title Tesorería cotizadora de ORIGEN · SFSP v0.3 §10.4.
/// @notice Cotiza compra y venta de ORIGEN contra el oráculo único (precio del
///         gramin = oro por onza / 1.710,6925), con los cinco controles:
///           1. Diferencial ≥ el del mercado: si el diferencial observado del
///              mercado supera al de la tesorería, deja de cotizar. Y si la
///              observación del mercado falta o es más vieja que su edad
///              máxima, también: sin saber el mercado no se sabe si hay arbitraje.
///           2. Frescura con tolerancia: si la lectura del oráculo no está OK
///              (vieja o fuera de tolerancia) o es más vieja que la tolerancia
///              propia de la tesorería, la cotización se suspende sola.
///           3. Límite por IDENTIDAD y ventana. El agregado por identidad —todas
///              las direcciones de la persona— lo calcula Genesis ID FUERA de la
///              cadena (v0.3 §11, SFSP-110 §0) y trae aquí sólo el RESULTADO para
///              la dirección que opera: cuánto le queda en esta ventana. Ningún
///              compromiso estable de la identidad viaja en la cadena. Además, en
///              la cadena, una sola dirección nunca pasa del límite por identidad.
///           4. Inventario asignado y publicado por ventana, por lado: agotado,
///              la tesorería cierra ese lado hasta la ventana siguiente.
///           5. Asimetría: diferencial de compra y de venta independientes.
///         Sin parámetros fijados por la Junta (v0.3 §18: diferencial,
///         tolerancia, límites) no cotiza: BLOCKED_DECISION.
///
///         Licencias (v0.3 §6 y §13.3, SFSP-140 §3.2): cada lado exige los
///         módulos que la Junta declare (quién opera la tesorería y con qué
///         licencia es SU decisión). Sin módulos declarados: BLOCKED_DECISION;
///         con alguno no habilitado en el registro: LICENCIA_NO_OTORGADA.
///
///         Vender ORIGEN desde la tesorería contra moneda fiduciaria es la
///         «puerta única»: una SUSCRIPCIÓN primaria sobre MON (SFSP-120 §0.5
///         regla 3). `sell` aplica SUBSCRIBE sobre el comprador.
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
        uint64 maxMarketSpreadAge; // edad máxima de la observación del diferencial de mercado
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

    /// @dev Genesis ID: registra el resultado del límite por identidad.
    bytes32 public constant LIMIT_OPERATOR = keccak256("SFSP.ROLE.LIMIT_OPERATOR");
    uint256 public constant MAX_MODULES = 4;

    /// @dev Resultado del límite por identidad para UNA dirección y un lado:
    ///      lo que le queda a su identidad en la ventana en curso.
    struct LimitClearance {
        uint256 remaining;
        uint64 window;
    }

    ISFSPGovernanceController public immutable governance;
    ISFSPIdentityAdapter public immutable identity;
    ISFSPEligibilityEngine public immutable eligibility;
    SFSPOracleRegistry public immutable oracle;
    bytes32 public immutable assetId; // ORIGEN
    ILicenseGate public licenseGate;

    Params private _params;
    /// @dev Diferencial observado del mercado (control 1) y cuándo se observó.
    uint16 public marketSpreadBps;
    uint64 public marketSpreadObservedAt;

    mapping(uint64 => uint256[2]) private _inventoryUsed; // ventana => [vende, compra]
    mapping(address => mapping(uint64 => uint256)) private _accountUsed; // dirección => ventana => usado
    mapping(address => mapping(uint8 => LimitClearance)) private _clearance; // dirección => lado
    mapping(uint8 => bytes32[]) private _requiredModules; // lado => módulos
    mapping(bytes32 => bool) private _usedOperation;
    uint256 private _buyNonce;

    event DeskParametersSet(
        bytes32 indexed assetId,
        uint32 version,
        uint16 buySpreadBps,
        uint16 sellSpreadBps,
        uint64 maxOracleAge,
        uint64 maxMarketSpreadAge,
        uint64 window,
        uint256 perIdentityLimit,
        uint256 sellInventory,
        uint256 buyInventory
    );
    event DeskParametersCleared(bytes32 indexed assetId, bytes32 reasonCode);
    event MarketSpreadObserved(bytes32 indexed assetId, address indexed by, uint16 marketSpreadBps);
    event DeskFunded(bytes32 indexed assetId, address indexed from, uint256 amount);
    event DeskLicenseGateSet(address indexed gate, address indexed by);
    /// @dev Un evento por módulo: `index` de `count` en la lista del lado.
    event DeskLicenseModuleSet(uint8 indexed side, bytes32 indexed moduleId, uint8 index, uint8 count);
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
    error IdentityLimitUnknown(address account, uint8 code);
    error IdentityLimitExceeded(uint256 used, uint256 requested, uint256 limit);
    error InventoryExhausted(uint8 side, uint256 used, uint256 requested, uint256 inventory);
    error PriceMoved(uint256 quoted, uint256 limit);
    error RoundMismatch(uint64 expected, uint64 current);
    error OperationReplay(bytes32 operationId);
    error InvalidParams(bytes32 reason);
    error InsufficientDeskBalance(uint256 balance, uint256 needed);
    error TransferFailed();

    constructor(
        address board,
        address governance_,
        address identity_,
        address eligibility_,
        address oracle_,
        bytes32 assetId_
    ) SFSPAccessControl(board) {
        require(
            governance_ != address(0) && identity_ != address(0) && eligibility_ != address(0) && oracle_ != address(0),
            "SFSP: dependencias=0"
        );
        require(assetId_ != bytes32(0), "SFSP: activo=0");
        governance = ISFSPGovernanceController(governance_);
        identity = ISFSPIdentityAdapter(identity_);
        eligibility = ISFSPEligibilityEngine(eligibility_);
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
        if (p.maxOracleAge == 0 || p.maxMarketSpreadAge == 0 || p.window == 0 || p.perIdentityLimit == 0) {
            revert InvalidParams("ZERO");
        }
        if (p.identityPurpose == bytes32(0)) revert InvalidParams("PURPOSE");
        uint32 v = _params.version + 1;
        _params = p;
        _params.set = true;
        _params.version = v;
        emit DeskParametersSet(
            assetId,
            v,
            p.buySpreadBps,
            p.sellSpreadBps,
            p.maxOracleAge,
            p.maxMarketSpreadAge,
            p.window,
            p.perIdentityLimit,
            p.sellInventory,
            p.buyInventory
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

    /// @notice Cablea el registro de licencias. Sin él, no cotiza.
    function setLicenseGate(address gate) external onlyRole(DBNX_BOARD) {
        licenseGate = ILicenseGate(gate);
        emit DeskLicenseGateSet(gate, msg.sender);
    }

    /// @notice Módulos de los que depende un lado (decisión de la Junta: quién
    ///         opera la tesorería y bajo qué licencia; p. ej., para vender contra
    ///         moneda fiduciaria, SFSP-140 §3.2 regla 1). Todos a la vez.
    function setRequiredModules(uint8 side, bytes32[] calldata modules) external onlyRole(DBNX_BOARD) {
        if (side > 1 || modules.length == 0 || modules.length > MAX_MODULES) revert InvalidParams("MODULES");
        _requiredModules[side] = modules;
        for (uint256 i = 0; i < modules.length; i++) {
            if (modules[i] == bytes32(0)) revert InvalidParams("MODULES");
            emit DeskLicenseModuleSet(side, modules[i], uint8(i), uint8(modules.length));
        }
    }

    function requiredModules(uint8 side) external view returns (bytes32[] memory) {
        return _requiredModules[side];
    }

    /// @notice Genesis ID registra, para la dirección que va a operar, lo que le
    ///         queda a su IDENTIDAD del límite de la ventana en curso en ese lado.
    ///         El agregado entre direcciones se calcula fuera de la cadena.
    function recordLimitClearance(address account, uint8 side, uint256 remaining) external onlyRole(LIMIT_OPERATOR) {
        if (!_params.set) revert QuoteUnavailable(SFSPCodes.BLOCKED_DECISION, bytes32("DESK_PARAMS_NOT_SET"));
        if (account == address(0) || side > 1 || remaining > _params.perIdentityLimit) revert InvalidParams("CLEARANCE");
        _clearance[account][side] = LimitClearance({remaining: remaining, window: currentWindow()});
    }

    function limitClearanceOf(address account, uint8 side) external view returns (uint256) {
        LimitClearance memory c = _clearance[account][side];
        return c.window == currentWindow() ? c.remaining : 0;
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

    /// @notice Lo que ESTA dirección operó en la ventana en curso (dato público:
    ///         está en `DeskTradeExecuted`). El agregado por identidad no existe aquí.
    function accountUsed(address account) external view returns (uint256) {
        return _accountUsed[account][currentWindow()];
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
        // Licencias del lado.
        (q.code, q.reason) = _licenseCheck(side);
        if (q.code != SFSPCodes.ALLOW) return q;
        // Control 1: sin una observación del mercado reciente no se puede comparar.
        uint64 seen = marketSpreadObservedAt;
        if (seen == 0 || block.timestamp > uint256(seen) + p.maxMarketSpreadAge) {
            q.code = SFSPCodes.UNKNOWN_SOURCE;
            q.reason = bytes32("MARKET_SPREAD_STALE");
            return q;
        }
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

    function _licenseCheck(uint8 side) internal view returns (uint8, bytes32) {
        bytes32[] storage mods = _requiredModules[side];
        uint256 n = mods.length;
        if (n == 0) return (SFSPCodes.BLOCKED_DECISION, bytes32("LICENSE_MODULES_UNSET"));
        if (address(licenseGate) == address(0)) return (SFSPCodes.DENY_AUTHORIZATION, bytes32("LICENCIA_NO_OTORGADA"));
        for (uint256 i = 0; i < n; i++) {
            if (!licenseGate.isModuleEnabled(mods[i])) return (SFSPCodes.DENY_AUTHORIZATION, bytes32("LICENCIA_NO_OTORGADA"));
        }
        return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
    }

    // ------------------------------------------------------------- ejecución

    /// @dev Control 3: la dirección tiene alta y claim vigente en el propósito
    ///      de la tesorería; el resultado de Genesis ID para su identidad cubre
    ///      la operación (sin él: UNKNOWN_SOURCE, nunca se supone cero); y la
    ///      dirección sola nunca pasa del límite por identidad.
    function _chargeIdentity(address account, uint8 side, uint256 amount) internal {
        Params memory p = _params;
        (bool bound, bool blocked,, bool claimValid) = identity.purposeStatus(account, p.identityPurpose);
        if (!bound || blocked || !claimValid) revert IdentityNotBound(account);
        uint64 w = currentWindow();
        LimitClearance storage c = _clearance[account][side];
        if (c.window != w) revert IdentityLimitUnknown(account, SFSPCodes.UNKNOWN_SOURCE);
        if (amount > c.remaining) {
            revert IdentityLimitExceeded(p.perIdentityLimit > c.remaining ? p.perIdentityLimit - c.remaining : 0, amount, p.perIdentityLimit);
        }
        c.remaining -= amount;
        uint256 used = _accountUsed[account][w];
        if (used + amount > p.perIdentityLimit) revert IdentityLimitExceeded(used, amount, p.perIdentityLimit);
        _accountUsed[account][w] = used + amount;
    }

    function _chargeInventory(uint8 side, uint256 amount) internal {
        uint64 w = currentWindow();
        uint256 used = _inventoryUsed[w][side];
        uint256 inv = side == SIDE_DESK_SELLS ? _params.sellInventory : _params.buyInventory;
        if (used + amount > inv) revert InventoryExhausted(side, used, amount, inv);
        _inventoryUsed[w][side] = used + amount;
    }

    /// @notice La tesorería VENDE ORIGEN a `to`, que ya pagó en USD fuera de la cadena.
    /// @dev Es una suscripción primaria sobre MON (SFSP-120 §0.5 regla 3): el
    ///      motor de elegibilidad aplica SUBSCRIBE sobre `to` en esta misma
    ///      transacción (país, alcance de la oferta exenta, exposición); la
    ///      tesorería necesita su rol SUBSCRIPTION_EXECUTOR.
    /// @param expectedRound la lectura del oráculo con la que se cotizó (misma lectura).
    /// @param maxPriceUsd precio máximo aceptado por el comprador.
    /// @param ctx contexto de la suscripción (`SFSPTypes.SubscriptionContext`):
    ///        con país y sal, la residencia se prueba por la ruta privada del
    ///        motor; vacío, por la ruta de residencia por país.
    function sell(
        address to,
        uint256 origenAmount,
        uint64 expectedRound,
        uint256 maxPriceUsd,
        bytes32 paymentRef,
        SFSPTypes.SubscriptionContext calldata ctx
    ) external onlyRole(ISSUER) nonReentrant {
        if (paymentRef == bytes32(0) || _usedOperation[paymentRef]) revert OperationReplay(paymentRef);
        _usedOperation[paymentRef] = true;
        Quote memory q = quote(SIDE_DESK_SELLS, origenAmount);
        if (q.code != SFSPCodes.ALLOW) revert QuoteUnavailable(q.code, q.reason);
        if (q.oracleRound != expectedRound) revert RoundMismatch(expectedRound, q.oracleRound);
        if (q.priceUsd > maxPriceUsd) revert PriceMoved(q.priceUsd, maxPriceUsd);
        _chargeIdentity(to, SIDE_DESK_SELLS, origenAmount);
        _chargeInventory(SIDE_DESK_SELLS, origenAmount);
        eligibility.enforceSubscription(to, assetId, origenAmount, ctx);
        if (address(this).balance < origenAmount) revert InsufficientDeskBalance(address(this).balance, origenAmount);
        emit DeskTradeExecuted(assetId, paymentRef, to, SIDE_DESK_SELLS, origenAmount, q.usdAmount, q.priceUsd, q.oracleRound);
        (bool ok,) = to.call{value: origenAmount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice La tesorería COMPRA el ORIGEN que envía el usuario. El pago en USD
    ///         (`usdAmount` del evento) se liquida fuera de la cadena.
    function buy(uint64 expectedRound, uint256 minPriceUsd)
        external
        payable
        nonReentrant
        returns (bytes32 operationId)
    {
        Quote memory q = quote(SIDE_DESK_BUYS, msg.value);
        if (q.code != SFSPCodes.ALLOW) revert QuoteUnavailable(q.code, q.reason);
        if (q.oracleRound != expectedRound) revert RoundMismatch(expectedRound, q.oracleRound);
        if (q.priceUsd < minPriceUsd) revert PriceMoved(q.priceUsd, minPriceUsd);
        _chargeIdentity(msg.sender, SIDE_DESK_BUYS, msg.value);
        _chargeInventory(SIDE_DESK_BUYS, msg.value);
        _buyNonce += 1;
        operationId = keccak256(abi.encode(address(this), msg.sender, _buyNonce));
        emit DeskTradeExecuted(assetId, operationId, msg.sender, SIDE_DESK_BUYS, msg.value, q.usdAmount, q.priceUsd, q.oracleRound);
    }
}
