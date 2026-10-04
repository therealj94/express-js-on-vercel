// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Registro de elegibilidad (SFSP-120)
/// @notice Dice si una dirección puede tener y mover activos conformes. La fuente es Genesis ID: un
///         verificador habilita la dirección cuando su identidad está verificada, y la bloquea si se
///         suspende. El contrato no guarda datos personales: solo el estado de cada dirección.
contract RegistroElegibilidad is AccessControl {
    /// @notice Quien refleja en cadena las decisiones de Genesis ID.
    bytes32 public constant VERIFICADOR_ROLE = keccak256("VERIFICADOR_ROLE");

    enum Estado { SinVerificar, Habilitada, Bloqueada }

    mapping(address => Estado) public estado;

    event EstadoCambiado(address indexed cuenta, Estado anterior, Estado nuevo, bytes32 motivo);

    error DireccionCero();

    /// @param admin La firma múltiple de gobernanza (SFSP §5.3).
    constructor(address admin) {
        if (admin == address(0)) revert DireccionCero();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function fijar(address cuenta, Estado nuevo, bytes32 motivo) public onlyRole(VERIFICADOR_ROLE) {
        if (cuenta == address(0)) revert DireccionCero();
        Estado anterior = estado[cuenta];
        estado[cuenta] = nuevo;
        emit EstadoCambiado(cuenta, anterior, nuevo, motivo);
    }

    function fijarLote(address[] calldata cuentas, Estado nuevo, bytes32 motivo) external onlyRole(VERIFICADOR_ROLE) {
        for (uint256 i = 0; i < cuentas.length; i++) fijar(cuentas[i], nuevo, motivo);
    }

    /// @notice Una dirección puede recibir y enviar si está habilitada.
    function habilitada(address cuenta) external view returns (bool) {
        return estado[cuenta] == Estado.Habilitada;
    }
}
