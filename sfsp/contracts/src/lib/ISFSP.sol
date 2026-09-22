// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPTypes} from "./SFSPTypes.sol";

/// @dev Interfaces mínimas para romper ciclos de compilación entre piezas.
interface ISFSPAssetRegistry {
    function isRegistered(bytes32 assetId) external view returns (bool);
    function lifecycleOf(bytes32 assetId) external view returns (SFSPTypes.Lifecycle memory);
    function enforcementOf(bytes32 assetId) external view returns (SFSPTypes.EnforcementScope memory);
    function decimalsOf(bytes32 assetId) external view returns (bool known, uint8 value);
    function jurisdictionOf(bytes32 assetId) external view returns (bytes32);
    function policyVersionOf(bytes32 assetId) external view returns (uint32);
}

interface ISFSPIdentityAdapter {
    function subjectRefOf(address account) external view returns (bytes32);
    function hasValidClaim(bytes32 subjectRef, bytes32 purpose) external view returns (bool);
    function claimStatus(bytes32 subjectRef, bytes32 purpose)
        external
        view
        returns (bool known, bool valid, uint64 validUntil);
}

interface ISFSPEligibilityEngine {
    function evaluate(bytes32 subject, bytes32 assetId, bytes32 action, bytes32 context)
        external
        view
        returns (uint8 result, bytes32 reasonCode, uint32 policyVersion);
}

interface ISFSPGovernanceController {
    function isPaused() external view returns (bool);
    function pauseReason() external view returns (bytes32 reasonCode, uint64 expiresAt);
    function quorumThreshold() external view returns (uint256);
    function isSigner(address account) external view returns (bool);
    function isActionApproved(bytes32 operationId) external view returns (bool);
    function consumeApprovedAction(bytes32 operationId) external returns (bool);
}

interface ISFSPRegulatedAsset {
    function assetId() external view returns (bytes32);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function mintFromIssuance(address to, uint256 amount, bytes32 operationId) external;
    function settlementTransfer(address from, address to, uint256 amount, bytes32 operationId) external;
    function burnForMigration(address from, uint256 amount, bytes32 migrationId) external;
}

interface ISFSPCashVault {
    function reserveCash(bytes32 operationId, address payer, uint256 amount) external;
    function consumeReserve(bytes32 operationId, address payee) external;
    function releaseReserve(bytes32 operationId) external;
    function balanceOfAccount(address account) external view returns (uint256);
}
