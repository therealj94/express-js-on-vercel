// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Sondas adversarias. NO SON CONTRATOS DE PRODUCCIÓN.
/// @notice Viven aquí porque una prueba necesita poder desplegar el contrato
///         FALSO que la auditoría describe: sin él, el caso de H05 quedaría
///         narrado en un comentario en vez de encerrado en una prueba.
///         No tienen roles, no tienen autorizaciones y no participan en ninguna
///         ruta de dinero. Ninguna puerta de despliegue las incluye.

/// @notice El activo falso de H05: declara el `assetId` que se espera y su
///         transferencia NO MUEVE NADA, pero tampoco revierte.
/// @dev Es exactamente el atacante del informe. Si el motor de liquidación
///      confiara en que la llamada no revirtió, el efectivo del comprador
///      pasaría al vendedor sin que se entregara un solo título. La defensa no
///      es detectar este contrato —puede mentir en todo lo que declara— sino
///      comprobar el SALDO antes y después.
contract SFSPActivoFalso {
    bytes32 public immutable assetId;

    mapping(address => uint256) private _balances;

    constructor(bytes32 assetId_) {
        assetId = assetId_;
    }

    /// @dev Permite montar el decorado: saldos que parecen reales.
    function sembrar(address cuenta, uint256 monto) external {
        _balances[cuenta] = monto;
    }

    function totalSupply() external pure returns (uint256) {
        return 0;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function mintFromIssuance(address, uint256, bytes32) external {}

    /// @dev La mentira: acepta la orden y no mueve nada.
    function settlementTransfer(address, address, uint256, bytes32) external {}

    function burnForMigration(address, uint256, bytes32) external {}
}
