// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Guarda de reentrada propia (§8: guarda de reentrada obligatoria).
/// @dev No se usa transient storage: evmVersion es "paris" y no se asumen
///      opcodes posteriores hasta verificar el nodo real.
abstract contract SFSPReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    error Reentrancy();

    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrancy();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}
