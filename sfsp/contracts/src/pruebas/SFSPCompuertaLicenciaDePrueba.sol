// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ILicenseGate} from "../lib/ILicenseGate.sol";

/// @title Compuerta de licencias DE PRUEBA. NO ES UN CONTRATO DE PRODUCCIÓN.
/// @notice Sustituye al futuro `SFSPLicenseRegistry` en las pruebas: permite
///         simular una licencia otorgada o no. No emite eventos y ninguna puerta
///         de despliegue la incluye.
contract SFSPCompuertaLicenciaDePrueba is ILicenseGate {
    address public immutable owner;
    mapping(bytes32 => bool) private _enabled;
    mapping(bytes32 => bytes32) private _number;

    constructor() {
        owner = msg.sender;
    }

    function set(bytes32 moduleId, bool enabled) external {
        require(msg.sender == owner, "prueba: solo dueno");
        _enabled[moduleId] = enabled;
    }

    function setNumber(bytes32 moduleId, bytes32 number) external {
        require(msg.sender == owner, "prueba: solo dueno");
        _number[moduleId] = number;
    }

    function isModuleEnabled(bytes32 moduleId) external view returns (bool) {
        return _enabled[moduleId];
    }

    function moduleHasLicenseNumber(bytes32 moduleId, bytes32 number) external view returns (bool) {
        return _enabled[moduleId] && number != bytes32(0) && _number[moduleId] == number;
    }
}
