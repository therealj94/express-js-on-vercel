// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {
    ISFSPCashVault,
    ISFSPRegulatedAsset,
    ISFSPEligibilityEngine,
    ISFSPIdentityAdapter,
    ISFSPGovernanceController
} from "./lib/ISFSP.sol";

/// @title Liquidación atómica activo contra efectivo (DvP) en la misma transacción.
/// @notice Si cualquier pata falla, revierte entera: no existe un estado en el que
///         el efectivo se movió y el activo no, ni al revés.
contract SFSPSettlementEngine is SFSPAccessControl, SFSPReentrancyGuard {
    // §3 · TradeSettled lo emite SettlementEngine.
    event TradeSettled(
        bytes32 indexed operationId,
        bytes32 indexed assetId,
        address indexed buyer,
        address seller,
        uint256 assetAmount,
        uint256 cashAmount
    );

    event CanonicalAssetRegistered(bytes32 indexed assetId, address indexed contractAddress, bytes32 codehash);

    error OperationReplay(bytes32 operationId);
    error SettlementRejected(uint8 code, bytes32 reasonCode);
    error Paused();
    error ZeroArgs();
    // H05 · el contrato del activo NO lo elige el operador de la liquidación.
    error AssetNotCanonical(bytes32 assetId);
    error CanonicalMismatch(bytes32 assetId, address registered, address declared);
    // H05 · la entrega se comprueba por el SALDO, no por lo que devuelva el contrato.
    error DeliveryNotObserved(address party, uint256 before_, uint256 afterwards, uint256 expected);
    error CashNotObserved(address payee, uint256 before_, uint256 afterwards, uint256 expected);
    error SettlementNotAuthorized(bytes32 digest);
    error AuthorizationActionMismatch(bytes32 expected, bytes32 got);

    ISFSPCashVault public immutable vault;
    ISFSPEligibilityEngine public immutable engine;
    ISFSPIdentityAdapter public immutable identity;
    ISFSPGovernanceController public immutable governance;

    mapping(bytes32 => bool) private _usedOperationId;
    // H05 · registro CANÓNICO de contratos por activo. Un contrato falso que
    // devuelva el `assetId` esperado y cuya transferencia no haga nada movería
    // efectivo sin entregar nada; que el operador pudiera pasar la dirección era
    // justamente lo que lo permitía.
    mapping(bytes32 => address) private _canonicalAsset;

    constructor(address board, address vault_, address engine_, address identity_, address governance_)
        SFSPAccessControl(board)
    {
        require(
            vault_ != address(0) && engine_ != address(0) && identity_ != address(0) && governance_ != address(0),
            "SFSP: dep=0"
        );
        vault = ISFSPCashVault(vault_);
        engine = ISFSPEligibilityEngine(engine_);
        identity = ISFSPIdentityAdapter(identity_);
        governance = ISFSPGovernanceController(governance_);
    }

    function isOperationUsed(bytes32 operationId) external view returns (bool) {
        return _usedOperationId[operationId];
    }

    function canonicalAssetOf(bytes32 assetId) external view returns (address) {
        return _canonicalAsset[assetId];
    }

    /// @notice Declara cuál es el contrato canónico de un activo.
    /// @dev Lo declara el órgano, no el operador. Se guarda además el `codehash`
    ///      en el evento para que una sustitución del código en esa dirección sea
    ///      detectable desde fuera; el contrato comprueba el `assetId` que el
    ///      candidato declara, pero esa comprobación por sí sola no distingue un
    ///      contrato honesto de uno que miente: por eso además existe la
    ///      comprobación de entrega real en `settle`.
    function registerCanonicalAsset(bytes32 assetId, address contractAddress) external onlyRole(DBNX_BOARD) {
        require(assetId != bytes32(0) && contractAddress != address(0), "SFSP: canonico invalido");
        bytes32 declared = ISFSPRegulatedAsset(contractAddress).assetId();
        if (declared != assetId) revert CanonicalMismatch(assetId, contractAddress, address(0));
        _canonicalAsset[assetId] = contractAddress;
        bytes32 codehash;
        assembly {
            codehash := extcodehash(contractAddress)
        }
        emit CanonicalAssetRegistered(assetId, contractAddress, codehash);
    }

    /// @notice Liquidación entrega contra pago, atada a una orden autorizada.
    /// @dev H05. Antes `settle` confiaba en TODO lo que pasaba el operador: el
    ///      contrato del activo, las partes, las cantidades y el precio. Bastaba
    ///      un contrato falso que devolviera el `assetId` esperado y cuya
    ///      `settlementTransfer` no hiciera nada para que el efectivo del
    ///      comprador pasara al vendedor sin que se entregara ningún activo.
    ///      Se cierran las tres puertas a la vez:
    ///        1. el contrato del activo sale del registro canónico del órgano,
    ///           no de un argumento de quien liquida;
    ///        2. la orden compromete activo, partes, cantidad y efectivo en un
    ///           digest aprobado que se recalcula aquí y se consume; y
    ///        3. la entrega se comprueba contra el SALDO antes y después, en las
    ///           dos patas. Lo que devuelva el contrato del activo no cuenta:
    ///           sólo cuenta lo que se movió de verdad.
    /// @param p payload del §12.1: `origin` vendedor, `destination` comprador,
    ///        `amount` unidades del activo, `amountSecondary` efectivo, `nonce`
    ///        identificador de operación.
    function settle(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest)
        external
        onlyRole(TECH_OPS)
        nonReentrant
    {
        if (governance.isPaused()) revert Paused();
        if (p.action != bytes32("SETTLE_DVP")) revert AuthorizationActionMismatch(bytes32("SETTLE_DVP"), p.action);
        if (p.amount == 0 || p.amountSecondary == 0) revert ZeroArgs();
        if (p.origin == address(0) || p.destination == address(0)) revert ZeroArgs();
        // El id se consume primero: un reintento con el mismo id no puede liquidar dos veces.
        if (_usedOperationId[p.nonce]) revert OperationReplay(p.nonce);
        _usedOperationId[p.nonce] = true;

        address assetContract = _canonicalAsset[p.assetId];
        if (assetContract == address(0)) revert AssetNotCanonical(p.assetId);

        if (!governance.isAuthorizationApproved(approvedDigest)) revert SettlementNotAuthorized(approvedDigest);
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        // Elegibilidad de liquidación para ambas patas, antes de mover nada. El
        // digest va como contexto de autorización y el monto va como monto (H06).
        _requireSettleAllowed(identity.subjectRefOf(p.origin), p.assetId, p.amount, approvedDigest);
        _requireSettleAllowed(identity.subjectRefOf(p.destination), p.assetId, p.amount, approvedDigest);

        _move(assetContract, p);

        emit TradeSettled(p.nonce, p.assetId, p.destination, p.origin, p.amount, p.amountSecondary);
    }

    /// @dev Separado de `settle` para que el marco de pila quepa en el EVM de Paris.
    function _move(address assetContract, SFSPAuthorization.Payload calldata p) internal {
        uint256 sellerAssetBefore = ISFSPRegulatedAsset(assetContract).balanceOf(p.origin);
        uint256 buyerAssetBefore = ISFSPRegulatedAsset(assetContract).balanceOf(p.destination);
        uint256 sellerCashBefore = vault.balanceOfAccount(p.origin);

        // 1) Efectivo prefinanciado del comprador queda reservado.
        vault.reserveCash(p.nonce, p.destination, p.amountSecondary);
        // 2) Pata del activo: pasa por la imposición del propio activo. Si es
        //    rechazada, revierte la transacción completa y el paso 1 se deshace.
        ISFSPRegulatedAsset(assetContract).settlementTransfer(p.origin, p.destination, p.amount, p.nonce);

        // 3) Comprobación de la entrega REAL antes de soltar el efectivo. Un
        //    contrato que no revierte pero tampoco mueve nada se detiene aquí.
        uint256 buyerAssetAfter = ISFSPRegulatedAsset(assetContract).balanceOf(p.destination);
        if (buyerAssetAfter != buyerAssetBefore + p.amount) {
            revert DeliveryNotObserved(p.destination, buyerAssetBefore, buyerAssetAfter, p.amount);
        }
        uint256 sellerAssetAfter = ISFSPRegulatedAsset(assetContract).balanceOf(p.origin);
        if (sellerAssetAfter + p.amount != sellerAssetBefore) {
            revert DeliveryNotObserved(p.origin, sellerAssetBefore, sellerAssetAfter, p.amount);
        }

        // 4) Sólo entonces el efectivo pasa al vendedor, y también se comprueba.
        vault.consumeReserve(p.nonce, p.origin);
        uint256 sellerCashAfter = vault.balanceOfAccount(p.origin);
        if (sellerCashAfter != sellerCashBefore + p.amountSecondary) {
            revert CashNotObserved(p.origin, sellerCashBefore, sellerCashAfter, p.amountSecondary);
        }
    }

    function _requireSettleAllowed(bytes32 subject, bytes32 assetId, uint256 amount, bytes32 authDigest)
        internal
        view
    {
        (uint8 code, bytes32 reason,) =
            engine.evaluateOperation(subject, assetId, bytes32("SETTLE"), amount, authDigest);
        if (code != SFSPCodes.ALLOW) revert SettlementRejected(code, reason);
    }
}
