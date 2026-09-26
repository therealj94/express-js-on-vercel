// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title Compuerta mínima de licencias · SFSP v0.3 §6.
/// @notice La implementa `SFSPLicenseRegistry` (fase 2 punto 1), que es la
///         compuerta real que se cablea en los módulos (`setLicenseGate`). Sin
///         compuerta, los módulos que dependen de una licencia reciben la
///         dirección cero y quedan CERRADOS: ausencia de registro = licencia no
///         otorgada, nunca «abierto por defecto».
///         Quien la consulta trata una compuerta que revierte como «no otorgada».
interface ILicenseGate {
    /// @return true sólo si TODAS las licencias de las que depende `moduleId`
    ///         están otorgadas y vigentes a la fecha del bloque y el módulo está
    ///         declarado DISPONIBLE o BETA (una función de cara al cliente no se
    ///         habilita con USO_INTERNO). Un módulo desconocido devuelve false.
    function isModuleEnabled(bytes32 moduleId) external view returns (bool);
}
