// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ISFSPCommodityToken} from "../lib/ISFSPCommodityToken.sol";

/// @title Token de commodity DE PRUEBA. NO ES UN CONTRATO DE PRODUCCIÓN.
/// @notice Existe para que las pruebas del motor de reservas recorran la
///         colocación, el bloqueo y la quema contra saldos reales. No tiene roles
///         de gobierno, no emite eventos y ninguna puerta de despliegue lo incluye.
contract SFSPTokenCommodityDePrueba is ISFSPCommodityToken {
    address public immutable owner;
    address public reserveEngine;
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => uint256) public lockedOf;

    struct Lock {
        address holder;
        uint256 amount;
    }

    mapping(bytes32 => Lock) public locks;

    constructor() {
        owner = msg.sender;
    }

    function setReserveEngine(address e) external {
        require(msg.sender == owner && reserveEngine == address(0), "prueba: motor");
        reserveEngine = e;
    }

    modifier onlyEngine() {
        require(msg.sender == reserveEngine, "prueba: solo motor");
        _;
    }

    /// @dev Acuñación por anticipado a tesorería (v0.3 §9.4): no exige metal.
    function mintToTreasury(address treasury, uint256 amount) external {
        require(msg.sender == owner, "prueba: solo dueno");
        _totalSupply += amount;
        _balances[treasury] += amount;
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address a) external view returns (uint256) {
        return _balances[a];
    }

    /// @dev Transferencia entre terceros (circular). Lo bloqueado no se mueve.
    function transfer(address to, uint256 amount) external returns (bool) {
        require(_balances[msg.sender] - lockedOf[msg.sender] >= amount, "prueba: saldo libre");
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        return true;
    }

    function placementTransfer(address from, address to, uint256 amount, bytes32) external onlyEngine {
        require(_balances[from] - lockedOf[from] >= amount, "prueba: saldo tesoreria");
        _balances[from] -= amount;
        _balances[to] += amount;
    }

    function lockUnits(address holder, uint256 amount, bytes32 lockId) external onlyEngine {
        require(locks[lockId].amount == 0, "prueba: bloqueo repetido");
        require(_balances[holder] - lockedOf[holder] >= amount, "prueba: saldo libre");
        lockedOf[holder] += amount;
        locks[lockId] = Lock(holder, amount);
    }

    function unlockUnits(bytes32 lockId) external onlyEngine {
        Lock memory l = locks[lockId];
        require(l.amount > 0, "prueba: sin bloqueo");
        lockedOf[l.holder] -= l.amount;
        delete locks[lockId];
    }

    function burnLocked(bytes32 lockId) external onlyEngine returns (uint256) {
        Lock memory l = locks[lockId];
        require(l.amount > 0, "prueba: sin bloqueo");
        lockedOf[l.holder] -= l.amount;
        _balances[l.holder] -= l.amount;
        _totalSupply -= l.amount;
        delete locks[lockId];
        return l.amount;
    }
}
