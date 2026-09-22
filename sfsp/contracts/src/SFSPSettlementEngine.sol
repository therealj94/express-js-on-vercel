// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
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

    error OperationReplay(bytes32 operationId);
    error SettlementRejected(uint8 code, bytes32 reasonCode);
    error Paused();
    error ZeroArgs();

    ISFSPCashVault public immutable vault;
    ISFSPEligibilityEngine public immutable engine;
    ISFSPIdentityAdapter public immutable identity;
    ISFSPGovernanceController public immutable governance;

    mapping(bytes32 => bool) private _usedOperationId;

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

    /// @param operationId unidad de idempotencia (§1): una liquidación por id.
    function settle(
        bytes32 operationId,
        address assetContract,
        address seller,
        address buyer,
        uint256 assetAmount,
        uint256 cashAmount
    ) external onlyRole(TECH_OPS) nonReentrant {
        if (governance.isPaused()) revert Paused();
        if (operationId == bytes32(0) || assetAmount == 0 || cashAmount == 0) revert ZeroArgs();
        if (seller == address(0) || buyer == address(0)) revert ZeroArgs();
        // El id se consume primero: un reintento con el mismo id no puede liquidar dos veces.
        if (_usedOperationId[operationId]) revert OperationReplay(operationId);
        _usedOperationId[operationId] = true;

        bytes32 assetId = ISFSPRegulatedAsset(assetContract).assetId();

        // Elegibilidad de liquidación para ambas patas, antes de mover nada.
        _requireSettleAllowed(identity.subjectRefOf(seller), assetId, assetAmount);
        _requireSettleAllowed(identity.subjectRefOf(buyer), assetId, assetAmount);

        // 1) Efectivo prefinanciado del comprador queda reservado.
        vault.reserveCash(operationId, buyer, cashAmount);
        // 2) Pata del activo: pasa por la imposición del propio activo. Si es
        //    rechazada, revierte la transacción completa y el paso 1 se deshace.
        ISFSPRegulatedAsset(assetContract).settlementTransfer(seller, buyer, assetAmount, operationId);
        // 3) Sólo entonces el efectivo pasa al vendedor.
        vault.consumeReserve(operationId, seller);

        emit TradeSettled(operationId, assetId, buyer, seller, assetAmount, cashAmount);
    }

    function _requireSettleAllowed(bytes32 subject, bytes32 assetId, uint256 amount) internal view {
        (uint8 code, bytes32 reason,) = engine.evaluate(subject, assetId, bytes32("SETTLE"), bytes32(amount));
        if (code != SFSPCodes.ALLOW) revert SettlementRejected(code, reason);
    }
}
