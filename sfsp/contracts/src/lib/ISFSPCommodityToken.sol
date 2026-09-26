// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Ganchos que un token de commodity (AUKA, AGKA) expone al motor de reservas.
/// @notice Cada función la puede llamar SÓLO el motor de reservas del token. Son
///         las cosas que el motor necesita para que la regla de SFSP-300 se
///         cumpla por código y no por procedimiento:
///           · colocar (salida de tesorería a un tercero) sólo con capacidad;
///           · bloquear las unidades del tenedor al pedir la redención;
///           · quemar lo bloqueado ANTES o a la vez que la entrega del metal.
/// @dev `SFSPRegulatedAsset` todavía no implementa esta interfaz (pendiente de
///      integrar); las pruebas usan `SFSPTokenCommodityDePrueba`.
interface ISFSPCommodityToken {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    /// @dev Mueve `amount` de la billetera de tesorería `from` al tercero `to`.
    function placementTransfer(address from, address to, uint256 amount, bytes32 operationId) external;
    /// @dev Bloquea `amount` de `holder` bajo `lockId`; el tenedor ya no puede moverlas.
    function lockUnits(address holder, uint256 amount, bytes32 lockId) external;
    /// @dev Devuelve lo bloqueado al tenedor (cancelación o incomparecencia).
    function unlockUnits(bytes32 lockId) external;
    /// @dev Quema lo bloqueado bajo `lockId`. Devuelve la cantidad quemada.
    function burnLocked(bytes32 lockId) external returns (uint256);
}
