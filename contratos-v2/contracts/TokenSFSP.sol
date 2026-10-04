// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IRegistroElegibilidad {
    function habilitada(address cuenta) external view returns (bool);
}

/// @title Token conforme a SFSP (la v2 de las monedas de la red Orden Global)
/// @notice Lo que el ERC-20 heredado no tiene y las series 200 y 300 exigen (SFSP §14.2):
///         - roles en vez de dueño único, todos bajo la firma múltiple (§5.3);
///         - suspensión de cuentas y pausa de emergencia;
///         - restricción de transferencia por elegibilidad (Genesis ID), cuando el registro está fijado;
///         - acreditación de la migración por raíz de Merkle: cada saldo de la instantánea se acuña a la
///           misma dirección, por el monto que fijó la política (§14.6), una sola vez.
/// @dev Las hojas siguen el formato de OpenZeppelin (keccak256 doble de abi.encode(address, uint256)),
///      el mismo de la plataforma de migración: su archivo de acuñación se usa tal cual.
contract TokenSFSP is ERC20, AccessControl, Pausable {
    /// @notice Abre rondas de migración y acuña emisión nueva conforme a la serie (§9.4, §8.1).
    bytes32 public constant EMISOR_ROLE = keccak256("EMISOR_ROLE");
    /// @notice Suspende cuentas y pausa en emergencia: un custodio de nivel 1, o DBNX para un security.
    bytes32 public constant SUSPENSION_ROLE = keccak256("SUSPENSION_ROLE");
    /// @notice Quema por redención o recuperación, con su causa.
    bytes32 public constant QUEMA_ROLE = keccak256("QUEMA_ROLE");

    /// @notice Identificador estable del Asset Passport (§4.2) y serie del protocolo.
    string public pasaporte;
    string public serie;

    /// @notice Registro de elegibilidad. Sin registro (dirección cero), la transferencia no se restringe por identidad.
    IRegistroElegibilidad public registro;

    mapping(address => bool) public suspendida;

    /// @notice Cuánto queda por acreditar de cada raíz de migración abierta.
    mapping(bytes32 => uint256) public restante;
    /// @notice Hojas ya acreditadas: nadie recibe dos veces la misma equivalencia.
    mapping(bytes32 => bool) public acreditada;

    event MigracionAbierta(bytes32 indexed raiz, uint256 total, bytes32 referencia);
    event EquivalenciaAcunada(bytes32 indexed raiz, address indexed cuenta, uint256 monto);
    event EmisionEjecutada(address indexed cuenta, uint256 monto, bytes32 motivo);
    event QuemaEjecutada(address indexed cuenta, uint256 monto, bytes32 motivo);
    event CuentaSuspendida(address indexed cuenta, bool suspendida, bytes32 motivo);
    event RegistroCambiado(address anterior, address nuevo);

    error DireccionCero();
    error RaizYaAbierta();
    error RaizNoAbierta();
    error YaAcreditada();
    error PruebaInvalida();
    error SuperaLoAbierto();
    error CuentaSuspendidaError(address cuenta);
    error NoElegible(address cuenta);

    /// @param admin La firma múltiple de gobernanza (§5.3): recibe todos los roles al nacer y los reparte.
    constructor(string memory nombre, string memory simbolo, string memory pasaporte_, string memory serie_, address admin)
        ERC20(nombre, simbolo)
    {
        if (admin == address(0)) revert DireccionCero();
        pasaporte = pasaporte_;
        serie = serie_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(EMISOR_ROLE, admin);
        _grantRole(SUSPENSION_ROLE, admin);
        _grantRole(QUEMA_ROLE, admin);
    }

    // ─── Migración ─────────────────────────────────────────────────────────

    /// @notice Abre una ronda: la raíz publicada por la plataforma y el total que se va a acuñar con ella.
    ///         Una ronda para la instantánea y otra por cada lote de reclamos aprobados.
    function abrirMigracion(bytes32 raiz, uint256 total, bytes32 referencia) external onlyRole(EMISOR_ROLE) {
        if (restante[raiz] != 0) revert RaizYaAbierta();
        restante[raiz] = total;
        emit MigracionAbierta(raiz, total, referencia);
    }

    /// @notice Acredita la equivalencia de una dirección. Lo puede ejecutar cualquiera: la prueba fija la
    ///         dirección y el monto, y el destino es siempre la dirección de la hoja.
    function acreditar(bytes32 raiz, address cuenta, uint256 monto, bytes32[] calldata prueba) public whenNotPaused {
        if (restante[raiz] == 0) revert RaizNoAbierta();
        bytes32 hoja = keccak256(bytes.concat(keccak256(abi.encode(cuenta, monto))));
        if (acreditada[hoja]) revert YaAcreditada();
        if (!MerkleProof.verifyCalldata(prueba, raiz, hoja)) revert PruebaInvalida();
        if (monto > restante[raiz]) revert SuperaLoAbierto();
        acreditada[hoja] = true;
        restante[raiz] -= monto;
        // La equivalencia no pasa por elegibilidad: es el mismo saldo, en la misma dirección.
        _mint(cuenta, monto);
        emit EquivalenciaAcunada(raiz, cuenta, monto);
    }

    function acreditarLote(bytes32 raiz, address[] calldata cuentas, uint256[] calldata montos, bytes32[][] calldata pruebas) external {
        for (uint256 i = 0; i < cuentas.length; i++) acreditar(raiz, cuentas[i], montos[i], pruebas[i]);
    }

    // ─── Emisión y quema ───────────────────────────────────────────────────

    /// @notice Emisión nueva conforme a la serie: la tesorería que se re-acuña, o la colocación contra metal.
    function emitir(address cuenta, uint256 monto, bytes32 motivo) external onlyRole(EMISOR_ROLE) whenNotPaused {
        _mint(cuenta, monto);
        emit EmisionEjecutada(cuenta, monto, motivo);
    }

    function quemar(address cuenta, uint256 monto, bytes32 motivo) external onlyRole(QUEMA_ROLE) {
        _burn(cuenta, monto);
        emit QuemaEjecutada(cuenta, monto, motivo);
    }

    // ─── Controles ─────────────────────────────────────────────────────────

    function suspender(address cuenta, bool valor, bytes32 motivo) external onlyRole(SUSPENSION_ROLE) {
        suspendida[cuenta] = valor;
        emit CuentaSuspendida(cuenta, valor, motivo);
    }

    function pausar() external onlyRole(SUSPENSION_ROLE) { _pause(); }

    function reanudar() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function fijarRegistro(address nuevo) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RegistroCambiado(address(registro), nuevo);
        registro = IRegistroElegibilidad(nuevo);
    }

    /// @dev Toda transferencia entre terceros pasa por aquí: pausa, suspensión y elegibilidad.
    ///      La acuñación (from = 0) y la quema (to = 0) se controlan por rol en sus funciones.
    function _update(address from, address to, uint256 valor) internal override {
        if (from != address(0) && to != address(0)) {
            _requireNotPaused();
            if (suspendida[from]) revert CuentaSuspendidaError(from);
            if (suspendida[to]) revert CuentaSuspendidaError(to);
            if (address(registro) != address(0)) {
                if (!registro.habilitada(from)) revert NoElegible(from);
                if (!registro.habilitada(to)) revert NoElegible(to);
            }
        }
        super._update(from, to, valor);
    }
}
