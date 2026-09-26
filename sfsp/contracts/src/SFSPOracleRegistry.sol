// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";

/// @title Registro ÚNICO de precio del oro y de la plata · SFSP v0.3 §10.5.
/// @notice Una sola lectura alimenta a ORIGEN (gramin = gramo de oro / 55), a
///         AUKA (onza troy fina de oro) y a la liquidación de AGKA (ratio oro/plata).
///         Dos denominaciones del mismo subyacente con fuentes o frecuencias
///         distintas abrirían arbitraje dentro del propio ecosistema; por eso los
///         consumidores (motor de reservas, tesorería) reciben ESTA dirección como
///         inmutable y no tienen forma de apuntar a otra.
///
///         Reglas:
///           · Publican sólo las cuentas con `ORACLE_PUBLISHER`, que concede la Junta.
///           · Cada precio lleva la marca de tiempo de la observación en la fuente.
///           · Sin edad máxima y tolerancia fijadas por gobierno no se acepta ni se
///             lee ningún precio: `BLOCKED_DECISION` (10 min de edad está PROPUESTO,
///             no decidido: no se escribe aquí).
///           · Una lectura vieja o fuera de tolerancia devuelve precio 0 con su
///             estado (el «guion» de la interfaz), nunca el último valor conocido.
///           · Un salto mayor que la tolerancia queda en CUARENTENA hasta que otro
///             publicador DISTINTO lo confirme dentro de tolerancia. El primer
///             precio de cada metal también necesita esa confirmación.
///
///         Aritmética de denominación (la que usa el repositorio y SFSP-300 §0.4):
///           1 onza troy = 31,1035 g  ⇒  1 onza = 31,1035 × 55 = 1.710,6925 gramin.
///         Se representa como la fracción exacta 17106925 / 10000 y se redondea
///         SIEMPRE hacia abajo en unidades base. 31,1035 g es la cifra de la
///         denominación del v0.3; la onza troy física exacta es 31,1034768 g. La
///         diferencia (0,75 ppm) queda del lado conservador: con 31,1035 una onza
///         vale un poco MÁS de gramin y un gramo, un poco MENOS de onza.
contract SFSPOracleRegistry is SFSPAccessControl {
    bytes32 public constant ORACLE_PUBLISHER = keccak256("SFSP.ROLE.ORACLE_PUBLISHER");

    bytes32 public constant METAL_XAU = bytes32("XAU");
    bytes32 public constant METAL_XAG = bytes32("XAG");

    /// @dev Precios en USD por onza troy fina con 8 decimales. Es representación,
    ///      no decisión económica.
    uint8 public constant PRICE_DECIMALS = 8;
    /// @dev 1 onza troy = 311035 / 10000 g (denominación del v0.3).
    uint256 public constant GRAMS_PER_OZ_NUM = 311035;
    uint256 public constant GRAMS_PER_OZ_DEN = 10000;
    uint256 public constant GRAMIN_PER_GRAM = 55;
    /// @dev gramin por onza = 311035 × 55 / 10000 = 17106925 / 10000 = 1.710,6925.
    uint256 public constant GRAMIN_PER_OZ_NUM = GRAMS_PER_OZ_NUM * GRAMIN_PER_GRAM;
    uint256 public constant GRAMIN_PER_OZ_DEN = GRAMS_PER_OZ_DEN;
    uint256 public constant BPS = 10_000;

    enum Status {
        OK,
        NO_DATA,
        STALE,
        DEVIATION,
        BLOCKED_DECISION
    }

    struct Params {
        bool set;
        uint64 maxAge; // segundos
        uint16 maxDeviationBps; // variación admitida entre lecturas aceptadas
        uint32 version;
    }

    struct Round {
        uint256 price;
        uint64 observedAt;
        address publisher;
        bool quarantined;
    }

    struct Reading {
        Status status;
        uint256 price; // 0 salvo que status == OK
        uint64 observedAt;
        uint64 round;
    }

    mapping(bytes32 => Params) private _params;
    mapping(bytes32 => uint64) private _lastRound;
    mapping(bytes32 => mapping(uint64 => Round)) private _rounds;
    /// @dev Último precio ACEPTADO (no en cuarentena): referencia de la tolerancia.
    mapping(bytes32 => uint256) private _acceptedPrice;

    event OracleParametersSet(bytes32 indexed metal, uint32 version, uint64 maxAge, uint16 maxDeviationBps);
    event OracleParametersCleared(bytes32 indexed metal, bytes32 reasonCode);
    event OraclePricePublished(
        bytes32 indexed metal, uint64 indexed round, address indexed publisher, uint256 price, uint64 observedAt, bool quarantined
    );

    error UnknownMetal(bytes32 metal);
    error OracleBlocked(uint8 code, bytes32 reason);
    error OracleNotFresh(bytes32 metal, Status status);
    error InvalidPublication(bytes32 reason);

    constructor(address board) SFSPAccessControl(board) {}

    modifier knownMetal(bytes32 metal) {
        if (metal != METAL_XAU && metal != METAL_XAG) revert UnknownMetal(metal);
        _;
    }

    // ------------------------------------------------------------- gobierno

    /// @notice Fija edad máxima y tolerancia de un metal. Sólo la Junta.
    function setParameters(bytes32 metal, uint64 maxAge, uint16 maxDeviationBps)
        external
        onlyRole(DBNX_BOARD)
        knownMetal(metal)
    {
        require(maxAge > 0, "SFSP: edad maxima=0");
        require(maxDeviationBps > 0 && maxDeviationBps < BPS, "SFSP: tolerancia invalida");
        Params storage p = _params[metal];
        p.set = true;
        p.maxAge = maxAge;
        p.maxDeviationBps = maxDeviationBps;
        p.version += 1;
        emit OracleParametersSet(metal, p.version, maxAge, maxDeviationBps);
    }

    /// @dev Limpiar vuelve a BLOCKED_DECISION; no deja el último número como defecto.
    function clearParameters(bytes32 metal, bytes32 reasonCode) external onlyRole(DBNX_BOARD) knownMetal(metal) {
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        uint32 v = _params[metal].version;
        delete _params[metal];
        _params[metal].version = v;
        emit OracleParametersCleared(metal, reasonCode);
    }

    function parametersOf(bytes32 metal) external view returns (Params memory) {
        return _params[metal];
    }

    // ------------------------------------------------------------- publicación

    /// @notice Publica un precio (USD por onza troy fina, 8 decimales) observado en `observedAt`.
    function publish(bytes32 metal, uint256 price, uint64 observedAt)
        external
        onlyRole(ORACLE_PUBLISHER)
        knownMetal(metal)
        returns (uint64 round)
    {
        Params memory p = _params[metal];
        if (!p.set) revert OracleBlocked(SFSPCodes.BLOCKED_DECISION, bytes32("ORACLE_PARAMS_NOT_SET"));
        if (price == 0) revert InvalidPublication(bytes32("PRICE_ZERO"));
        if (observedAt > block.timestamp) revert InvalidPublication(bytes32("FUTURE_TIMESTAMP"));
        uint64 last = _lastRound[metal];
        Round memory prev = _rounds[metal][last];
        if (last != 0 && observedAt <= prev.observedAt) revert InvalidPublication(bytes32("NOT_NEWER"));

        bool quarantined;
        uint256 accepted = _acceptedPrice[metal];
        if (accepted != 0 && _within(price, accepted, p.maxDeviationBps)) {
            quarantined = false;
        } else if (
            last != 0 && prev.quarantined && prev.publisher != msg.sender && _within(price, prev.price, p.maxDeviationBps)
        ) {
            // Un publicador DISTINTO confirma el nuevo nivel dentro de tolerancia.
            quarantined = false;
        } else {
            quarantined = true;
        }

        round = last + 1;
        _lastRound[metal] = round;
        _rounds[metal][round] = Round({price: price, observedAt: observedAt, publisher: msg.sender, quarantined: quarantined});
        if (!quarantined) _acceptedPrice[metal] = price;
        emit OraclePricePublished(metal, round, msg.sender, price, observedAt, quarantined);
    }

    function _within(uint256 a, uint256 ref, uint16 bps) internal pure returns (bool) {
        uint256 diff = a > ref ? a - ref : ref - a;
        return diff * BPS <= ref * bps;
    }

    // ------------------------------------------------------------- lecturas

    function roundOf(bytes32 metal, uint64 round) external view returns (Round memory) {
        return _rounds[metal][round];
    }

    function lastRound(bytes32 metal) external view returns (uint64) {
        return _lastRound[metal];
    }

    /// @notice Lectura vigente. Precio 0 si no es OK: nunca un valor antiguo.
    function latest(bytes32 metal) public view knownMetal(metal) returns (Reading memory r) {
        Params memory p = _params[metal];
        uint64 last = _lastRound[metal];
        r.round = last;
        if (!p.set) {
            r.status = Status.BLOCKED_DECISION;
            return r;
        }
        if (last == 0) {
            r.status = Status.NO_DATA;
            return r;
        }
        Round memory x = _rounds[metal][last];
        r.observedAt = x.observedAt;
        if (block.timestamp > uint256(x.observedAt) + p.maxAge) {
            r.status = Status.STALE;
            return r;
        }
        if (x.quarantined) {
            r.status = Status.DEVIATION;
            return r;
        }
        r.status = Status.OK;
        r.price = x.price;
    }

    /// @notice Igual que `latest`, pero revierte si la lectura no es OK.
    function latestOrRevert(bytes32 metal) public view returns (uint256 price, uint64 observedAt, uint64 round) {
        Reading memory r = latest(metal);
        if (r.status == Status.BLOCKED_DECISION) {
            revert OracleBlocked(SFSPCodes.BLOCKED_DECISION, bytes32("ORACLE_PARAMS_NOT_SET"));
        }
        if (r.status != Status.OK) revert OracleNotFresh(metal, r.status);
        return (r.price, r.observedAt, r.round);
    }

    /// @notice Traduce el estado del oráculo a los códigos del §4.
    function codeOf(Status s) public pure returns (uint8) {
        if (s == Status.OK) return SFSPCodes.ALLOW;
        if (s == Status.BLOCKED_DECISION) return SFSPCodes.BLOCKED_DECISION;
        return SFSPCodes.UNKNOWN_SOURCE;
    }

    /// @notice Precio de UN gramin (= ORIGEN) en USD con 8 decimales, desde la
    ///         MISMA lectura del oro: oro por onza / 1.710,6925. Redondeo hacia abajo.
    function graminPriceUsd() external view returns (Reading memory r) {
        r = latest(METAL_XAU);
        if (r.status == Status.OK) r.price = (r.price * GRAMIN_PER_OZ_DEN) / GRAMIN_PER_OZ_NUM;
    }

    /// @notice Ratio oro/plata con 18 decimales, sólo si LAS DOS lecturas están OK.
    function goldSilverRatio()
        external
        view
        returns (Status status, uint256 ratio1e18, uint64 roundXau, uint64 roundXag)
    {
        Reading memory g = latest(METAL_XAU);
        Reading memory s = latest(METAL_XAG);
        roundXau = g.round;
        roundXag = s.round;
        if (g.status != Status.OK) return (g.status, 0, roundXau, roundXag);
        if (s.status != Status.OK) return (s.status, 0, roundXau, roundXag);
        return (Status.OK, (g.price * 1e18) / s.price, roundXau, roundXag);
    }

    // ------------------------------------------------------------- conversión de denominación

    /// @notice Onzas finas (escala 1e18 = una onza) de ORO a gramin (escala 1e18).
    /// @dev Por definición de denominación: no usa precio. Redondeo hacia abajo.
    function goldOuncesToGramin(uint256 ounces1e18) public pure returns (uint256) {
        return (ounces1e18 * GRAMIN_PER_OZ_NUM) / GRAMIN_PER_OZ_DEN;
    }

    /// @notice Gramos a gramin: × 55, exacto.
    function gramsToGramin(uint256 grams1e18) external pure returns (uint256) {
        return grams1e18 * GRAMIN_PER_GRAM;
    }

    /// @notice Onzas finas de PLATA a gramin con el ratio vigente. Revierte si
    ///         alguna de las dos lecturas no está OK (no hay respaldo inventado).
    ///         gramin = onzas_plata × (plata/oro) × 1.710,6925, redondeo hacia abajo.
    function silverOuncesToGramin(uint256 ounces1e18)
        external
        view
        returns (uint256 gramin1e18, uint64 roundXau, uint64 roundXag)
    {
        uint256 g;
        uint256 s;
        (g,, roundXau) = latestOrRevert(METAL_XAU);
        (s,, roundXag) = latestOrRevert(METAL_XAG);
        gramin1e18 = (ounces1e18 * s * GRAMIN_PER_OZ_NUM) / (g * GRAMIN_PER_OZ_DEN);
    }
}
