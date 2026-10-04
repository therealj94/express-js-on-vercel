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
///         - roles en vez de dueño único, repartidos como pide la tabla de §5.3: la administración en la
///           firma múltiple de los tres custodios, la operación en la de dos de tres;
///         - pausa de emergencia de un solo custodio, que vence a las 72 horas si dos custodios no la
///           ratifican (§5.3), y suspensión de cuentas;
///         - ampliación de supply con demora pública cuando la serie la exige (siete días en un security, §5.3),
///           por cualquier camino que acuñe: emisión o ronda de migración;
///         - restricción de transferencia por elegibilidad (Genesis ID), cuando el registro está fijado;
///         - acreditación de la migración por raíz de Merkle: cada saldo de la instantánea se acuña a la
///           misma dirección, por el monto que fijó la política (§14.6), una sola vez.
/// @dev Las hojas siguen el formato de OpenZeppelin (keccak256 doble de abi.encode(address, uint256)),
///      el mismo de la plataforma de migración: su archivo de acuñación se usa tal cual.
contract TokenSFSP is ERC20, AccessControl, Pausable {
    /// @notice Abre rondas de migración y acuña emisión nueva conforme a la serie (§9.4, §8.1).
    bytes32 public constant EMISOR_ROLE = keccak256("EMISOR_ROLE");
    /// @notice Suspende cuentas, ratifica y levanta la pausa: la firma múltiple de dos de tres.
    bytes32 public constant SUSPENSION_ROLE = keccak256("SUSPENSION_ROLE");
    /// @notice Pausa de emergencia con una sola firma: cada custodio de nivel 1, o DBNX para un security.
    bytes32 public constant PAUSA_ROLE = keccak256("PAUSA_ROLE");

    /// @notice Una pausa de una sola firma vence si en este plazo no la ratifican dos custodios (§5.3).
    uint256 public constant VENCE_PAUSA = 72 hours;
    /// @notice Demora entre anunciar una emisión y poder ejecutarla. Cero en commodities y utilidad;
    ///         siete días en un security (ampliación de supply, §5.3). Fija desde el despliegue.
    uint256 public immutable demoraEmision;
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

    /// @notice Cuándo empezó la pausa vigente y si dos custodios ya la ratificaron.
    uint256 public pausadaEn;
    bool public pausaRatificada;

    /// @notice Emisiones anunciadas (hash de cuenta, monto y motivo) y desde cuándo se pueden ejecutar.
    mapping(bytes32 => uint256) public emisionAnunciada;

    event MigracionAbierta(bytes32 indexed raiz, uint256 total, bytes32 referencia);
    event EquivalenciaAcunada(bytes32 indexed raiz, address indexed cuenta, uint256 monto);
    event EmisionEjecutada(address indexed cuenta, uint256 monto, bytes32 motivo);
    event QuemaEjecutada(address indexed cuenta, uint256 monto, bytes32 motivo);
    event CuentaSuspendida(address indexed cuenta, bool suspendida, bytes32 motivo);
    event RegistroCambiado(address anterior, address nuevo);
    event PausaRatificada(address indexed por);
    event EmisionAnunciada(bytes32 indexed id, address indexed cuenta, uint256 monto, bytes32 motivo, uint256 ejecutableDesde);
    event EmisionCancelada(bytes32 indexed id);
    event MigracionAnunciada(bytes32 indexed id, bytes32 indexed raiz, uint256 total, bytes32 referencia, uint256 ejecutableDesde);

    error DireccionCero();
    error RaizYaAbierta();
    error RaizNoAbierta();
    error YaAcreditada();
    error PruebaInvalida();
    error SuperaLoAbierto();
    error CuentaSuspendidaError(address cuenta);
    error NoElegible(address cuenta);
    error SinPausa();
    error EmisionNoAnunciada();
    error EmisionEnDemora(uint256 ejecutableDesde);
    error EmisionYaAnunciada();

    /// @param admin La firma múltiple de los tres custodios (§5.3): administra los roles y el registro.
    /// @param operativa La firma múltiple de dos de tres: emite, abre la migración, quema, suspende y ratifica pausas.
    /// @param pausadores Cada custodio de nivel 1 (o DBNX en un security), que puede pausar solo en emergencia.
    /// @param demoraEmision_ Demora pública de una ampliación de supply: siete días en un security, cero en las demás.
    constructor(
        string memory nombre, string memory simbolo, string memory pasaporte_, string memory serie_,
        address admin, address operativa, address[] memory pausadores, uint256 demoraEmision_
    ) ERC20(nombre, simbolo) {
        if (admin == address(0) || operativa == address(0)) revert DireccionCero();
        pasaporte = pasaporte_;
        serie = serie_;
        demoraEmision = demoraEmision_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(EMISOR_ROLE, operativa);
        _grantRole(SUSPENSION_ROLE, operativa);
        _grantRole(QUEMA_ROLE, operativa);
        for (uint256 i = 0; i < pausadores.length; i++) {
            if (pausadores[i] == address(0)) revert DireccionCero();
            _grantRole(PAUSA_ROLE, pausadores[i]);
        }
    }

    // ─── Migración ─────────────────────────────────────────────────────────

    /// @notice Con demora de emisión, una ronda también se anuncia antes: abrir una raíz es acuñar, y sin
    ///         esto el emisor podría saltarse la demora con una «migración» de una sola hoja.
    function anunciarMigracion(bytes32 raiz, uint256 total, bytes32 referencia) external onlyRole(EMISOR_ROLE) {
        bytes32 id = idMigracion(raiz, total, referencia);
        if (emisionAnunciada[id] != 0) revert EmisionYaAnunciada();
        uint256 desde = block.timestamp + demoraEmision;
        emisionAnunciada[id] = desde;
        emit MigracionAnunciada(id, raiz, total, referencia, desde);
    }

    function cancelarMigracion(bytes32 raiz, uint256 total, bytes32 referencia) external onlyRole(EMISOR_ROLE) {
        bytes32 id = idMigracion(raiz, total, referencia);
        if (emisionAnunciada[id] == 0) revert EmisionNoAnunciada();
        delete emisionAnunciada[id];
        emit EmisionCancelada(id);
    }

    function idMigracion(bytes32 raiz, uint256 total, bytes32 referencia) public pure returns (bytes32) {
        return keccak256(abi.encode("migracion", raiz, total, referencia));
    }

    /// @notice Abre una ronda: la raíz publicada por la plataforma y el total que se va a acuñar con ella.
    ///         Una ronda para la instantánea y otra por cada lote de reclamos aprobados. Con demora de
    ///         emisión (un security), solo lo anunciado y pasada la demora.
    function abrirMigracion(bytes32 raiz, uint256 total, bytes32 referencia) external onlyRole(EMISOR_ROLE) {
        if (restante[raiz] != 0) revert RaizYaAbierta();
        if (demoraEmision > 0) _consumirAnuncio(idMigracion(raiz, total, referencia));
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

    /// @notice Anuncia una emisión con demora: queda pública en la cadena desde ahora y se puede
    ///         ejecutar pasada `demoraEmision`. Solo hace falta cuando la serie tiene demora.
    function anunciarEmision(address cuenta, uint256 monto, bytes32 motivo) external onlyRole(EMISOR_ROLE) {
        bytes32 id = idEmision(cuenta, monto, motivo);
        if (emisionAnunciada[id] != 0) revert EmisionYaAnunciada();
        uint256 desde = block.timestamp + demoraEmision;
        emisionAnunciada[id] = desde;
        emit EmisionAnunciada(id, cuenta, monto, motivo, desde);
    }

    function cancelarEmision(address cuenta, uint256 monto, bytes32 motivo) external onlyRole(EMISOR_ROLE) {
        bytes32 id = idEmision(cuenta, monto, motivo);
        if (emisionAnunciada[id] == 0) revert EmisionNoAnunciada();
        delete emisionAnunciada[id];
        emit EmisionCancelada(id);
    }

    function idEmision(address cuenta, uint256 monto, bytes32 motivo) public pure returns (bytes32) {
        return keccak256(abi.encode(cuenta, monto, motivo));
    }

    /// @notice Emisión nueva conforme a la serie: la tesorería que se re-acuña, o la colocación contra metal.
    ///         Con demora (un security), solo lo anunciado y pasada la demora, una vez.
    function emitir(address cuenta, uint256 monto, bytes32 motivo) external onlyRole(EMISOR_ROLE) whenNotPaused {
        if (demoraEmision > 0) _consumirAnuncio(idEmision(cuenta, monto, motivo));
        _mint(cuenta, monto);
        emit EmisionEjecutada(cuenta, monto, motivo);
    }

    function _consumirAnuncio(bytes32 id) private {
        uint256 desde = emisionAnunciada[id];
        if (desde == 0) revert EmisionNoAnunciada();
        if (block.timestamp < desde) revert EmisionEnDemora(desde);
        delete emisionAnunciada[id];
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

    /// @notice Pausa de emergencia. Un custodio solo (PAUSA_ROLE): inmediata, y vence a las 72 horas si la
    ///         firma múltiple de dos de tres no la ratifica. Desde la firma múltiple ya nace ratificada.
    function pausar() external {
        bool deDos = hasRole(SUSPENSION_ROLE, msg.sender);
        if (!deDos && !hasRole(PAUSA_ROLE, msg.sender)) revert AccessControlUnauthorizedAccount(msg.sender, PAUSA_ROLE);
        _pause();
        pausadaEn = block.timestamp;
        pausaRatificada = deDos;
        if (deDos) emit PausaRatificada(msg.sender);
    }

    function ratificarPausa() external onlyRole(SUSPENSION_ROLE) {
        if (!paused()) revert SinPausa();
        pausaRatificada = true;
        emit PausaRatificada(msg.sender);
    }

    /// @notice Levanta la pausa: la firma múltiple de dos de tres.
    function reanudar() external onlyRole(SUSPENSION_ROLE) {
        if (!paused()) revert SinPausa();
        _unpause();
        pausaRatificada = false;
    }

    /// @notice En pausa: si alguien la puso y, siendo de una sola firma, no venció sin ratificar.
    function paused() public view override returns (bool) {
        return super.paused() && (pausaRatificada || block.timestamp < pausadaEn + VENCE_PAUSA);
    }

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
