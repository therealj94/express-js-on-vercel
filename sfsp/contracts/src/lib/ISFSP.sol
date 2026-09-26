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
    /// @dev H04 · exclusión técnica PERMANENTE del activo, declarada e irreversible.
    ///      No es un eje del ciclo de vida: un eje puede volver a cambiar.
    function isPermanentlyExcluded(bytes32 assetId) external view returns (bool);
}

interface ISFSPIdentityAdapter {
    /// @dev H16 · `subjectRefOf(address)` se RETIRÓ. Devolvía la referencia
    ///      global del sujeto y con ella dos direcciones cualesquiera se
    ///      comparaban para saber si eran de la misma persona. Lo que queda son
    ///      preguntas que se responden con booleanos, y una comprobación que
    ///      RECIBE el compromiso en vez de devolverlo.
    function purposeStatus(address account, bytes32 purpose)
        external
        view
        returns (bool bound, bool blocked, bool claimKnown, bool claimValid);
    function isCommitmentBound(address account, bytes32 purpose, bytes32 commitment) external view returns (bool);
    function hasValidClaim(bytes32 subjectCommitment, bytes32 purpose) external view returns (bool);
    function claimStatus(bytes32 subjectCommitment, bytes32 purpose)
        external
        view
        returns (bool known, bool valid, uint64 validUntil);
}

interface ISFSPEligibilityEngine {
    function evaluate(address account, bytes32 assetId, bytes32 action, bytes32 context)
        external
        view
        returns (uint8 result, bytes32 reasonCode, uint32 policyVersion);

    /// @dev H06 · separa el MONTO del CONTEXTO DE AUTORIZACIÓN. En `evaluate` los
    ///      dos viajaban en la misma palabra `bytes32(amount)`, así que dos
    ///      operaciones distintas del mismo monto compartían autorización.
    function evaluateOperation(
        address account,
        bytes32 assetId,
        bytes32 action,
        uint256 amount,
        bytes32 authorizationDigest
    ) external view returns (uint8 result, bytes32 reasonCode, uint32 policyVersion);
}

interface ISFSPGovernanceController {
    function isPaused() external view returns (bool);
    function pauseReason() external view returns (bytes32 reasonCode, uint64 expiresAt);
    function quorumThreshold() external view returns (uint256);
    function isSigner(address account) external view returns (bool);
    /// @dev H01/H06 · aprobación ligada al contenido: lo aprobado es el digest
    ///      del §12.1, no un identificador elegido por el llamador.
    function isAuthorizationApproved(bytes32 digest) external view returns (bool);
    function consumeAuthorization(bytes32 digest) external;
    /// @dev Política de suministro (SFSP-410) · el cupo de emisión se fija con
    ///      espera: el ejecutor necesita saber cuándo se propuso, con qué acción,
    ///      y cuál es la espera del despliegue.
    function authorizationProposedAt(bytes32 digest) external view returns (uint64);
    function authorizationActionOf(bytes32 digest) external view returns (bytes32);
    function timelockDelay() external view returns (uint64);
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
