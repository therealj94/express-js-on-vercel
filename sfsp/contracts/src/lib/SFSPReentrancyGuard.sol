// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Guarda de reentrada propia (§8: guarda de reentrada obligatoria).
/// @dev No se usa transient storage: evmVersion es "paris" y no se asumen
///      opcodes posteriores hasta verificar el nodo real.
///      La entrada y la salida van en funciones internas y no dentro del
///      modificador: el modificador se copia en cada función que lo usa, y así
///      la guarda no se paga en bytes una vez por función (EIP-170). El
///      comportamiento es el mismo.
abstract contract SFSPReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    error Reentrancy();

    modifier nonReentrant() {
        _enterGuard();
        _;
        _status = _NOT_ENTERED;
    }

    function _enterGuard() private {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
    }
}
