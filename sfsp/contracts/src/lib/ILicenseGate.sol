// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Compuerta mínima de licencias · SFSP v0.3 §6.
/// @notice Interfaz provisional: el registro de licencias (`SFSPLicenseRegistry`,
///         fase 2 punto 1) la implementará. Mientras no exista, los módulos que
///         dependen de una licencia reciben la dirección cero y quedan CERRADOS:
///         ausencia de registro = licencia no otorgada, nunca «abierto por defecto».
interface ILicenseGate {
    /// @return true sólo si la licencia de la que depende `moduleId` está otorgada
    ///         y vigente a la fecha del bloque.
    function isModuleEnabled(bytes32 moduleId) external view returns (bool);
}
