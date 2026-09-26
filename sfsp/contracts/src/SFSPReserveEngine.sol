// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {ISFSPGovernanceController, ISFSPEligibilityEngine} from "./lib/ISFSP.sol";
import {ILicenseGate} from "./lib/ILicenseGate.sol";
import {ISFSPCommodityToken} from "./lib/ISFSPCommodityToken.sol";
import {SFSPOracleRegistry} from "./SFSPOracleRegistry.sol";

/// @title Motor de reservas y commodities · SFSP v0.3 §9 (SFSP-300).
/// @notice Lleva, para AUKA (oro) y AGKA (plata):
///           · los LOTES de metal, con peso bruto y pureza por separado y las
///             onzas finas derivadas en cadena;
///           · las ATESTACIONES con vencimiento: un lote vencido deja de contar
///             solo, sin que nadie tenga que mandar una transacción;
///           · la CAPACIDAD DE COLOCACIÓN = onzas verificadas, asignadas y no
///             comprometidas. Acuñar a tesorería no exige metal (v0.3 §9.4);
///             COLOCAR con un tercero sí, y aquí es donde se exige;
///           · la COBERTURA contra lo colocado (no contra lo acuñado);
///           · la REDENCIÓN: bloqueo → elegibilidad → cola → liquidación (quema)
///             → entrega. La quema es anterior o simultánea a la entrega, nunca
///             posterior.
///
///         Parámetros no decididos → BLOCKED_DECISION:
///           · límites de concentración por custodio (independiente e interno);
///           · canales de redención (mínimo y diferencial de la liquidación en ORIGEN).
///         Los canales físicos, además, exigen la licencia de custodia Clase G
///         vigente en la compuerta de licencias. Sin compuerta: cerrados.
///
/// @dev Escalas: onzas finas con 18 decimales (`OZ` = una onza). Peso bruto en
///      miligramos. Pureza en partes por millón. Gramo→onza con 31,1035 g (la
///      misma cifra de denominación que el oráculo), redondeo hacia abajo.
///      Correspondencia con CONTRATO-INTERNO §2.10: RECIBIDO≈INTAKE,
///      VERIFICADO≈ATTESTED, ASIGNADO/PARCIALMENTE_TOKENIZADO≈ASSIGNED,
///      BLOQUEADO_POR_REDENCION≈RESERVED_FOR_DELIVERY, LIBERADO≈DELIVERED. Los
///      nombres que manda son los del Apéndice A del v0.3.
contract SFSPReserveEngine is SFSPAccessControl, SFSPReentrancyGuard {
    uint256 public constant OZ = 1e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant PPM = 1_000_000;
    uint256 public constant MAX_LOTS_PER_ASSET = 64;
    bytes32 public constant MODULE_CUSTODY_CLASS_G = bytes32("CUSTODIA_CLASE_G");
    bytes32 public constant R_LICENSE = bytes32("LICENCIA_NO_OTORGADA");

    enum LotState {
        NINGUNO,
        RECIBIDO,
        VERIFICADO,
        ASIGNADO,
        PARCIALMENTE_TOKENIZADO,
        BLOQUEADO_POR_REDENCION,
        LIBERADO
    }

    enum RedemptionState {
        NINGUNO,
        SOLICITADA,
        ELEGIBLE,
        EN_COLA,
        BLOQUEADA,
        LIQUIDADA,
        ENTREGADA,
        CANCELADA,
        VENCIDA_POR_INCOMPARECENCIA
    }

    enum Channel {
        LIQUIDACION_ORIGEN,
        ENVIO_ASEGURADO,
        RETIRO_PRESENCIAL
    }

    struct CommodityAsset {
        bool configured;
        bool physicalAllowed; // AGKA: false (liquidación en ORIGEN permanente)
        bytes32 metal;
        ISFSPCommodityToken token;
        address treasuryWallet;
        uint256 unitsPerOunce; // unidades base del token por onza fina
        uint256 unitsPlaced; // colocadas con terceros (incluye las bloqueadas)
        uint256 ozPendingDelivery; // obligaciones con tokens ya quemados
        uint64 queueTail;
        uint64 queueHead;
    }

    struct Custodian {
        bool registered;
        bool internalCustody; // Au Corp./Ordenex: licencia Clase G + auditor + límite propio
        address attestor;
        bytes32 jurisdiction;
    }

    struct LotIntake {
        bytes32 lotId;
        bytes32 assetId; // destino ÚNICO de este metal
        bytes32 custodianId;
        bytes32 vault;
        bytes32 jurisdiction;
        bytes32 metal;
        uint256 grossWeightMg;
        uint32 purityPpm;
        bytes32 assayCertHash;
    }

    struct Lot {
        bytes32 assetId;
        bytes32 custodianId;
        bytes32 vault;
        bytes32 jurisdiction;
        bytes32 metal;
        uint256 grossWeightMg;
        uint32 purityPpm;
        LotState state;
        bool assigned;
        bool expiryNotified;
        uint256 fineOz;
        bytes32 assayCertHash;
        bytes32 evidenceId;
        bytes32 insuranceRef;
        uint64 insuranceValidUntil;
        uint64 attestedAt;
        uint64 attestationValidUntil;
        uint64 auditVerifiedUntil;
        uint256 ozCommitted;
        uint256 ozLocked;
        uint256 ozPendingDelivery;
        uint256 ozDelivered;
    }

    struct ChannelConfig {
        bool set;
        bool open;
        uint16 spreadBps; // sólo liquidación en ORIGEN: diferencial publicado
        uint256 minUnits;
        bytes32 licenseRef;
    }

    struct Concentration {
        bool set;
        uint16 maxIndependentBps;
        uint16 maxInternalBps;
        uint256 minTotalOz; // por debajo de este total el límite todavía no aplica
    }

    struct Redemption {
        bytes32 assetId;
        address holder;
        Channel channel;
        RedemptionState state;
        uint64 queuePos;
        uint64 deadline;
        uint256 units;
        uint256 oz;
        bytes32 lotId;
    }

    ISFSPGovernanceController public immutable governance;
    ISFSPEligibilityEngine public immutable eligibility;
    SFSPOracleRegistry public immutable oracle;
    ILicenseGate public licenseGate;

    mapping(bytes32 => CommodityAsset) private _assets;
    mapping(bytes32 => Custodian) private _custodians;
    mapping(bytes32 => Lot) private _lots;
    mapping(bytes32 => bytes32[]) private _assetLots;
    mapping(bytes32 => bool) private _certUsed;
    mapping(bytes32 => mapping(uint8 => ChannelConfig)) private _channels;
    mapping(bytes32 => Redemption) private _redemptions;
    mapping(bytes32 => mapping(uint64 => bytes32)) private _queue;
    mapping(bytes32 => bool) private _usedOperation;
    mapping(bytes32 => uint256) public custodianAssignedOz;
    uint256 public totalAssignedOz;
    Concentration private _concentration;
    uint256 private _redemptionNonce;

    event CommodityAssetConfigured(
        bytes32 indexed assetId,
        bytes32 metal,
        address token,
        address treasuryWallet,
        uint256 unitsPerOunce,
        bool physicalAllowed
    );
    event CustodianRegistered(bytes32 indexed custodianId, address indexed attestor, bool internalCustody, bytes32 jurisdiction);
    event LicenseGateSet(address indexed gate, address indexed by);
    event ConcentrationLimitsSet(uint16 maxIndependentBps, uint16 maxInternalBps, uint256 minTotalOz);
    event RedemptionChannelSet(
        bytes32 indexed assetId, uint8 indexed channel, bool open, uint256 minimumUnits, uint16 spreadBps, bytes32 licenseRef
    );
    event MetalLotRegistered(
        bytes32 indexed lotId, bytes32 indexed assetId, bytes32 indexed custodianId, uint256 fineOunces, bytes32 assayCertHash
    );
    event MetalLotStateChanged(
        bytes32 indexed lotId, bytes32 indexed assetId, uint8 previousState, uint8 newState, bytes32 reasonCode
    );
    event LotAuditVerified(bytes32 indexed lotId, address indexed auditor, uint64 validUntil);
    event ReserveAttested(bytes32 indexed reserveAssetId, bytes32 indexed assetId, bytes32 evidenceId, uint64 validUntil);
    event ReserveExpired(bytes32 indexed reserveAssetId, bytes32 indexed assetId, uint64 expiredAt);
    event UnitsPlaced(
        bytes32 indexed assetId, address indexed to, bytes32 indexed operationId, uint256 amount, uint256 ouncesCommitted
    );
    event CoveragePublished(
        bytes32 indexed assetId, uint256 fineOuncesAssigned, uint256 unitsPlaced, uint256 unitsInTreasury, uint64 attestedAt
    );
    event RedemptionUpdated(
        bytes32 indexed redemptionId, bytes32 indexed assetId, uint8 previousState, uint8 newState, uint256 amount
    );
    event OrigenSettlementFunded(address indexed from, uint256 amount);

    error Paused();
    error Blocked(uint8 code, bytes32 reason);
    error Rejected(uint8 code, bytes32 reason);
    error InvalidInput(bytes32 reason);
    error InvalidTransition(uint8 current);
    error NotCustodianAttestor(bytes32 lotId, address caller);
    error OperationReplay(bytes32 operationId);
    error PlacementCapacityExceeded(uint256 capacityOz, uint256 requestedOz);
    error CoverageDeficit(uint256 coveredOz, uint256 obligationsOz);
    error ConcentrationExceeded(bytes32 custodianId, uint256 shareBps, uint16 maxBps);
    error QueueOrder(bytes32 expected);
    error InsufficientSettlementFunds(uint256 balance, uint256 needed);
    error TransferFailed();

    constructor(address board, address governance_, address eligibility_, address oracle_) SFSPAccessControl(board) {
        require(governance_ != address(0) && eligibility_ != address(0) && oracle_ != address(0), "SFSP: dependencias=0");
        governance = ISFSPGovernanceController(governance_);
        eligibility = ISFSPEligibilityEngine(eligibility_);
        oracle = SFSPOracleRegistry(oracle_);
    }

    // =============================================================== configuración (Junta)

    function configureAsset(
        bytes32 assetId,
        bytes32 metal,
        address token,
        address treasuryWallet,
        uint256 unitsPerOunce,
        bool physicalAllowed
    ) external onlyRole(DBNX_BOARD) {
        if (assetId == bytes32(0) || token == address(0) || treasuryWallet == address(0)) revert InvalidInput("ASSET");
        if (metal != oracle.METAL_XAU() && metal != oracle.METAL_XAG()) revert InvalidInput("METAL");
        // Unidades por onza = 10^decimales, divisor exacto de 1e18: sin restos de redondeo.
        if (unitsPerOunce == 0 || OZ % unitsPerOunce != 0) revert InvalidInput("UNITS_PER_OZ");
        CommodityAsset storage a = _assets[assetId];
        if (a.configured) revert InvalidInput("ALREADY_CONFIGURED");
        a.configured = true;
        a.metal = metal;
        a.token = ISFSPCommodityToken(token);
        a.treasuryWallet = treasuryWallet;
        a.unitsPerOunce = unitsPerOunce;
        a.physicalAllowed = physicalAllowed;
        emit CommodityAssetConfigured(assetId, metal, token, treasuryWallet, unitsPerOunce, physicalAllowed);
    }

    function registerCustodian(bytes32 custodianId, address attestor, bool internalCustody, bytes32 jurisdiction)
        external
        onlyRole(DBNX_BOARD)
    {
        if (custodianId == bytes32(0) || attestor == address(0) || jurisdiction == bytes32(0)) revert InvalidInput("CUSTODIAN");
        if (_custodians[custodianId].registered) revert InvalidInput("ALREADY_REGISTERED");
        _custodians[custodianId] = Custodian(true, internalCustody, attestor, jurisdiction);
        emit CustodianRegistered(custodianId, attestor, internalCustody, jurisdiction);
    }

    function setLicenseGate(address gate) external onlyRole(DBNX_BOARD) {
        licenseGate = ILicenseGate(gate);
        emit LicenseGateSet(gate, msg.sender);
    }

    /// @notice Límite de concentración por custodio · v0.3 §9.2 y §18 (pendiente).
    function setConcentrationLimits(uint16 maxIndependentBps, uint16 maxInternalBps, uint256 minTotalOz)
        external
        onlyRole(DBNX_BOARD)
    {
        if (maxIndependentBps == 0 || maxIndependentBps > BPS || maxInternalBps == 0 || maxInternalBps > BPS) {
            revert InvalidInput("BPS");
        }
        _concentration = Concentration(true, maxIndependentBps, maxInternalBps, minTotalOz);
        emit ConcentrationLimitsSet(maxIndependentBps, maxInternalBps, minTotalOz);
    }

    /// @notice Canal de redención. Un canal físico sólo se abre con la licencia
    ///         de custodia Clase G vigente, y nunca para AGKA.
    function setChannel(
        bytes32 assetId,
        Channel channel,
        bool open,
        uint256 minUnits,
        uint16 spreadBps,
        bytes32 licenseRef
    ) external onlyRole(DBNX_BOARD) {
        CommodityAsset storage a = _assets[assetId];
        if (!a.configured) revert InvalidInput("ASSET");
        if (spreadBps >= BPS) revert InvalidInput("SPREAD");
        if (open && channel != Channel.LIQUIDACION_ORIGEN) {
            if (!a.physicalAllowed) revert Rejected(SFSPCodes.DENY_POLICY, bytes32("PHYSICAL_NOT_ALLOWED"));
            if (!_custodyLicensed()) revert Rejected(SFSPCodes.DENY_AUTHORIZATION, R_LICENSE);
            if (licenseRef == bytes32(0)) revert InvalidInput("LICENSE_REF");
        }
        _channels[assetId][uint8(channel)] = ChannelConfig(true, open, spreadBps, minUnits, licenseRef);
        emit RedemptionChannelSet(assetId, uint8(channel), open, minUnits, spreadBps, licenseRef);
    }

    function _custodyLicensed() internal view returns (bool) {
        return address(licenseGate) != address(0) && licenseGate.isModuleEnabled(MODULE_CUSTODY_CLASS_G);
    }

    // =============================================================== lotes

    function registerLot(LotIntake calldata x) external onlyRole(TECH_OPS) {
        CommodityAsset storage a = _assets[x.assetId];
        if (!a.configured) revert InvalidInput("ASSET");
        if (!_custodians[x.custodianId].registered) revert InvalidInput("CUSTODIAN");
        if (x.metal != a.metal) revert InvalidInput("METAL_MISMATCH");
        if (
            x.lotId == bytes32(0) || x.vault == bytes32(0) || x.jurisdiction == bytes32(0) || x.assayCertHash == bytes32(0)
                || x.grossWeightMg == 0 || x.purityPpm == 0 || x.purityPpm > PPM
        ) revert InvalidInput("LOT_INCOMPLETE");
        if (_lots[x.lotId].state != LotState.NINGUNO) revert InvalidInput("LOT_EXISTS");
        // No doble cómputo: un certificado de ensayo, un lote, un destino.
        if (_certUsed[x.assayCertHash]) revert InvalidInput("CERT_ALREADY_USED");
        if (_assetLots[x.assetId].length >= MAX_LOTS_PER_ASSET) revert InvalidInput("TOO_MANY_LOTS");
        _certUsed[x.assayCertHash] = true;

        Lot storage l = _lots[x.lotId];
        l.assetId = x.assetId;
        l.custodianId = x.custodianId;
        l.vault = x.vault;
        l.jurisdiction = x.jurisdiction;
        l.metal = x.metal;
        l.grossWeightMg = x.grossWeightMg;
        l.purityPpm = x.purityPpm;
        l.assayCertHash = x.assayCertHash;
        // onzas finas = mg × ppm / 1e6 / 1000 g × 10000 / 311035 oz, en escala 1e18.
        l.fineOz = (x.grossWeightMg * uint256(x.purityPpm) * 1e13) / 311035;
        l.state = LotState.RECIBIDO;
        _assetLots[x.assetId].push(x.lotId);
        emit MetalLotRegistered(x.lotId, x.assetId, x.custodianId, l.fineOz, x.assayCertHash);
        emit MetalLotStateChanged(x.lotId, x.assetId, uint8(LotState.NINGUNO), uint8(LotState.RECIBIDO), bytes32("INTAKE"));
    }

    /// @notice Atestación del custodio: metal y seguro, cada uno con su vencimiento.
    function attestLot(bytes32 lotId, bytes32 evidenceId, uint64 validUntil, bytes32 insuranceRef, uint64 insuranceValidUntil)
        external
    {
        Lot storage l = _lots[lotId];
        if (l.state == LotState.NINGUNO || l.state == LotState.LIBERADO) revert InvalidInput("LOT");
        if (msg.sender != _custodians[l.custodianId].attestor) revert NotCustodianAttestor(lotId, msg.sender);
        if (evidenceId == bytes32(0) || insuranceRef == bytes32(0)) revert InvalidInput("EVIDENCE");
        if (validUntil <= block.timestamp || insuranceValidUntil <= block.timestamp) revert InvalidInput("VALIDITY");
        l.evidenceId = evidenceId;
        l.attestedAt = uint64(block.timestamp);
        l.attestationValidUntil = validUntil;
        l.insuranceRef = insuranceRef;
        l.insuranceValidUntil = insuranceValidUntil;
        l.expiryNotified = false;
        emit ReserveAttested(lotId, l.assetId, evidenceId, validUntil);
        if (l.state == LotState.RECIBIDO) _setLotState(lotId, l, LotState.VERIFICADO, bytes32("ATTESTED"));
    }

    /// @notice Verificación del auditor externo, exigida a la custodia interna.
    function auditVerifyLot(bytes32 lotId, uint64 validUntil) external onlyRole(AUDITOR) {
        Lot storage l = _lots[lotId];
        if (l.state == LotState.NINGUNO) revert InvalidInput("LOT");
        if (validUntil <= block.timestamp) revert InvalidInput("VALIDITY");
        l.auditVerifiedUntil = validUntil;
        emit LotAuditVerified(lotId, msg.sender, validUntil);
    }

    /// @notice Asigna el lote a su activo: desde aquí cuenta para la capacidad.
    function assignLot(bytes32 lotId) external onlyRole(TECH_OPS) {
        Lot storage l = _lots[lotId];
        if (l.state != LotState.VERIFICADO) revert InvalidTransition(uint8(l.state));
        Custodian memory c = _custodians[l.custodianId];
        if (c.internalCustody && !_custodyLicensed()) revert Rejected(SFSPCodes.DENY_AUTHORIZATION, R_LICENSE);
        if (!_lotValid(l)) revert Rejected(SFSPCodes.UNKNOWN_SOURCE, bytes32("ATTESTATION_NOT_VALID"));
        Concentration memory k = _concentration;
        if (!k.set) revert Blocked(SFSPCodes.BLOCKED_DECISION, bytes32("CONCENTRATION_NOT_SET"));

        uint256 newTotal = totalAssignedOz + l.fineOz;
        uint256 newCust = custodianAssignedOz[l.custodianId] + l.fineOz;
        if (newTotal >= k.minTotalOz) {
            uint16 maxBps = c.internalCustody ? k.maxInternalBps : k.maxIndependentBps;
            uint256 share = (newCust * BPS) / newTotal;
            if (share > maxBps) revert ConcentrationExceeded(l.custodianId, share, maxBps);
        }
        totalAssignedOz = newTotal;
        custodianAssignedOz[l.custodianId] = newCust;
        l.assigned = true;
        _setLotState(lotId, l, LotState.ASIGNADO, bytes32("ASSIGNED"));
    }

    /// @notice Retira un lote sin compromisos del programa (sale el metal).
    function retireLot(bytes32 lotId, bytes32 reasonCode) external onlyRole(DBNX_BOARD) {
        Lot storage l = _lots[lotId];
        if (l.state == LotState.NINGUNO || l.state == LotState.LIBERADO) revert InvalidTransition(uint8(l.state));
        if (l.ozCommitted != 0 || l.ozLocked != 0 || l.ozPendingDelivery != 0) revert InvalidInput("LOT_COMMITTED");
        if (reasonCode == bytes32(0)) revert InvalidInput("REASON");
        if (l.assigned) _unassign(l, l.fineOz - l.ozDelivered);
        l.assigned = false;
        _setLotState(lotId, l, LotState.LIBERADO, reasonCode);
    }

    /// @notice Registra el vencimiento de una atestación. La degradación ya ocurrió
    ///         sola (las lecturas dejan de contar el lote); esto la publica.
    function expireLot(bytes32 lotId) external {
        Lot storage l = _lots[lotId];
        if (l.attestationValidUntil == 0 || block.timestamp < l.attestationValidUntil || l.expiryNotified) {
            revert InvalidInput("NOT_EXPIRED");
        }
        l.expiryNotified = true;
        emit ReserveExpired(lotId, l.assetId, l.attestationValidUntil);
    }

    function _unassign(Lot storage l, uint256 oz) internal {
        totalAssignedOz -= oz;
        custodianAssignedOz[l.custodianId] -= oz;
    }

    function _lotValid(Lot storage l) internal view returns (bool) {
        if (block.timestamp >= l.attestationValidUntil || block.timestamp >= l.insuranceValidUntil) return false;
        if (_custodians[l.custodianId].internalCustody) {
            if (block.timestamp >= l.auditVerifiedUntil || !_custodyLicensed()) return false;
        }
        return true;
    }

    function _lotCounts(Lot storage l) internal view returns (bool) {
        return l.assigned && l.state != LotState.LIBERADO && _lotValid(l);
    }

    function _lotFree(Lot storage l) internal view returns (uint256) {
        uint256 used = l.ozCommitted + l.ozLocked + l.ozPendingDelivery + l.ozDelivered;
        return l.fineOz > used ? l.fineOz - used : 0;
    }

    function _setLotState(bytes32 lotId, Lot storage l, LotState s, bytes32 reason) internal {
        LotState prev = l.state;
        if (prev == s) return;
        l.state = s;
        emit MetalLotStateChanged(lotId, l.assetId, uint8(prev), uint8(s), reason);
    }

    /// @dev Estado derivado de las cantidades, para lotes ya asignados.
    function _refreshLot(bytes32 lotId, Lot storage l) internal {
        if (!l.assigned) return;
        LotState s;
        if (l.ozDelivered >= l.fineOz) s = LotState.LIBERADO;
        else if (l.ozLocked != 0 || l.ozPendingDelivery != 0) s = LotState.BLOQUEADO_POR_REDENCION;
        else if (l.ozCommitted != 0) s = LotState.PARCIALMENTE_TOKENIZADO;
        else s = LotState.ASIGNADO;
        _setLotState(lotId, l, s, bytes32("QUANTITIES"));
    }

    // =============================================================== lecturas

    function assetOf(bytes32 assetId) external view returns (CommodityAsset memory) {
        return _assets[assetId];
    }

    function lotOf(bytes32 lotId) external view returns (Lot memory) {
        return _lots[lotId];
    }

    function lotsOf(bytes32 assetId) external view returns (bytes32[] memory) {
        return _assetLots[assetId];
    }

    function custodianOf(bytes32 custodianId) external view returns (Custodian memory) {
        return _custodians[custodianId];
    }

    function channelOf(bytes32 assetId, Channel channel) external view returns (ChannelConfig memory) {
        return _channels[assetId][uint8(channel)];
    }

    function concentrationLimits() external view returns (Concentration memory) {
        return _concentration;
    }

    function redemptionOf(bytes32 redemptionId) external view returns (Redemption memory) {
        return _redemptions[redemptionId];
    }

    function isLotValid(bytes32 lotId) external view returns (bool) {
        return _lotCounts(_lots[lotId]);
    }

    function unitsToOz(bytes32 assetId, uint256 units) public view returns (uint256) {
        return units * (OZ / _assets[assetId].unitsPerOunce);
    }

    /// @notice Capacidad de colocación en onzas: verificadas, asignadas, vigentes y no comprometidas.
    function placementCapacityOz(bytes32 assetId) public view returns (uint256 cap) {
        bytes32[] storage ids = _assetLots[assetId];
        for (uint256 i = 0; i < ids.length; i++) {
            Lot storage l = _lots[ids[i]];
            if (_lotCounts(l)) cap += _lotFree(l);
        }
    }

    /// @notice Cobertura contra lo COLOCADO.
    /// @return coveredOz onzas asignadas, vigentes y no entregadas.
    /// @return obligationsOz colocado en onzas + obligaciones con tokens ya quemados.
    /// @return unitsPlaced unidades en manos de terceros.
    /// @return unitsInTreasury acuñado sin colocar (se reporta aparte, no cuenta).
    /// @return oldestAttestedAt la atestación vigente más antigua (0 si no hay).
    function coverage(bytes32 assetId)
        public
        view
        returns (uint256 coveredOz, uint256 obligationsOz, uint256 unitsPlaced, uint256 unitsInTreasury, uint64 oldestAttestedAt)
    {
        CommodityAsset storage a = _assets[assetId];
        bytes32[] storage ids = _assetLots[assetId];
        for (uint256 i = 0; i < ids.length; i++) {
            Lot storage l = _lots[ids[i]];
            if (!_lotCounts(l)) continue;
            coveredOz += l.fineOz - l.ozDelivered;
            if (oldestAttestedAt == 0 || l.attestedAt < oldestAttestedAt) oldestAttestedAt = l.attestedAt;
        }
        unitsPlaced = a.unitsPlaced;
        obligationsOz = unitsToOzSafe(a, unitsPlaced) + a.ozPendingDelivery;
        uint256 supply = a.configured ? a.token.totalSupply() : 0;
        unitsInTreasury = supply > unitsPlaced ? supply - unitsPlaced : 0;
    }

    function unitsToOzSafe(CommodityAsset storage a, uint256 units) internal view returns (uint256) {
        return a.unitsPerOunce == 0 ? 0 : units * (OZ / a.unitsPerOunce);
    }

    /// @notice Invariante SFSP-300 §3 contra lo colocado.
    function invariantHolds(bytes32 assetId) public view returns (bool) {
        (uint256 covered, uint256 obligations,,,) = coverage(assetId);
        return covered >= obligations;
    }

    /// @notice Publica la cobertura (cualquiera puede pedirlo; es una lectura).
    function publishCoverage(bytes32 assetId) external returns (uint256 ratioBps) {
        if (!_assets[assetId].configured) revert InvalidInput("ASSET");
        (uint256 covered, uint256 obligations, uint256 placed, uint256 treasury, uint64 attestedAt) = coverage(assetId);
        emit CoveragePublished(assetId, covered, placed, treasury, attestedAt);
        ratioBps = obligations == 0 ? type(uint256).max : (covered * BPS) / obligations;
    }

    // =============================================================== colocación (v0.3 §9.4)

    /// @notice Coloca unidades de la tesorería con un tercero. Exige capacidad.
    function place(bytes32 assetId, address to, uint256 units, bytes32 operationId)
        external
        onlyRole(ISSUER)
        nonReentrant
    {
        if (governance.isPaused()) revert Paused();
        CommodityAsset storage a = _assets[assetId];
        if (!a.configured) revert InvalidInput("ASSET");
        if (units == 0 || to == address(0) || to == a.treasuryWallet) revert InvalidInput("PLACEMENT");
        if (operationId == bytes32(0) || _usedOperation[operationId]) revert OperationReplay(operationId);
        _usedOperation[operationId] = true;
        (uint8 code, bytes32 reason,) = eligibility.evaluateOperation(to, assetId, bytes32("RELEASE"), units, bytes32(0));
        if (code != SFSPCodes.ALLOW) revert Rejected(code, reason);

        // Un descuadre (p. ej. un lote comprometido que venció) detiene toda colocación.
        (uint256 covered, uint256 obligations,,,) = coverage(assetId);
        if (covered < obligations) revert CoverageDeficit(covered, obligations);

        uint256 oz = unitsToOz(assetId, units);
        uint256 remaining = oz;
        bytes32[] storage ids = _assetLots[assetId];
        for (uint256 i = 0; i < ids.length && remaining != 0; i++) {
            Lot storage l = _lots[ids[i]];
            if (!_lotCounts(l)) continue;
            uint256 free = _lotFree(l);
            if (free == 0) continue;
            uint256 take = free < remaining ? free : remaining;
            l.ozCommitted += take;
            remaining -= take;
            _refreshLot(ids[i], l);
        }
        if (remaining != 0) revert PlacementCapacityExceeded(oz - remaining, oz);

        a.unitsPlaced += units;
        emit UnitsPlaced(assetId, to, operationId, units, oz);
        a.token.placementTransfer(a.treasuryWallet, to, units, operationId);
    }

    /// @dev Libera `oz` de compromisos, empezando por los lotes que ya NO cuentan
    ///      (vencidos) y después por el final de la lista. `skip` se excluye.
    function _decommit(bytes32 assetId, uint256 oz, bytes32 skip) internal {
        bytes32[] storage ids = _assetLots[assetId];
        for (uint256 pass = 0; pass < 2 && oz != 0; pass++) {
            for (uint256 j = ids.length; j > 0 && oz != 0; j--) {
                bytes32 id = ids[j - 1];
                if (id == skip) continue;
                Lot storage l = _lots[id];
                if (l.ozCommitted == 0) continue;
                if (pass == 0 && _lotCounts(l)) continue;
                uint256 take = l.ozCommitted < oz ? l.ozCommitted : oz;
                l.ozCommitted -= take;
                oz -= take;
                _refreshLot(id, l);
            }
        }
        if (oz != 0) revert InvalidInput("DECOMMIT");
    }

    // =============================================================== redención (v0.3 §9.3)

    function _move(bytes32 id, Redemption storage r, RedemptionState to) internal {
        RedemptionState prev = r.state;
        r.state = to;
        emit RedemptionUpdated(id, r.assetId, uint8(prev), uint8(to), r.units);
    }

    function _require(Redemption storage r, RedemptionState s) internal view {
        if (r.state != s) revert InvalidTransition(uint8(r.state));
    }

    /// @dev Canal abierto: parámetro fijado y abierto; los físicos, además, con
    ///      licencia Clase G vigente AHORA (una licencia que caduca cierra el canal).
    function _checkChannel(CommodityAsset storage a, bytes32 assetId, Channel ch, uint256 units) internal view {
        ChannelConfig memory c = _channels[assetId][uint8(ch)];
        if (!c.set) revert Blocked(SFSPCodes.BLOCKED_DECISION, bytes32("CHANNEL_NOT_SET"));
        if (ch != Channel.LIQUIDACION_ORIGEN) {
            if (!a.physicalAllowed) revert Rejected(SFSPCodes.DENY_POLICY, bytes32("PHYSICAL_NOT_ALLOWED"));
            if (!_custodyLicensed()) revert Rejected(SFSPCodes.DENY_AUTHORIZATION, R_LICENSE);
        }
        if (!c.open) revert Rejected(SFSPCodes.DENY_POLICY, bytes32("CHANNEL_CLOSED"));
        if (units < c.minUnits) revert Rejected(SFSPCodes.DENY_LIMIT, bytes32("BELOW_CHANNEL_MINIMUM"));
    }

    /// @notice El tenedor pide redimir. Sus unidades quedan BLOQUEADAS en el acto.
    function requestRedemption(bytes32 assetId, uint256 units, Channel channel)
        external
        nonReentrant
        returns (bytes32 id)
    {
        if (governance.isPaused()) revert Paused();
        CommodityAsset storage a = _assets[assetId];
        if (!a.configured) revert InvalidInput("ASSET");
        // La tesorería no redime: sus unidades no están colocadas.
        if (units == 0 || msg.sender == a.treasuryWallet) revert InvalidInput("REDEMPTION");
        _checkChannel(a, assetId, channel, units);

        _redemptionNonce += 1;
        id = keccak256(abi.encode(address(this), assetId, msg.sender, _redemptionNonce));
        Redemption storage r = _redemptions[id];
        r.assetId = assetId;
        r.holder = msg.sender;
        r.channel = channel;
        r.units = units;
        r.oz = unitsToOz(assetId, units);
        _move(id, r, RedemptionState.SOLICITADA);
        a.token.lockUnits(msg.sender, units, id);
    }

    /// @notice Verificación de elegibilidad. Si no es elegible, se cancela y se desbloquea.
    function verifyEligibility(bytes32 id) external onlyRole(TECH_OPS) nonReentrant {
        Redemption storage r = _redemptions[id];
        _require(r, RedemptionState.SOLICITADA);
        (uint8 code,,) = eligibility.evaluateOperation(r.holder, r.assetId, bytes32("REDEEM"), r.units, bytes32(0));
        if (code != SFSPCodes.ALLOW) {
            _move(id, r, RedemptionState.CANCELADA);
            _assets[r.assetId].token.unlockUnits(id);
            return;
        }
        _move(id, r, RedemptionState.ELEGIBLE);
    }

    /// @notice Entra en la cola del activo, por orden de llegada.
    function enqueue(bytes32 id) external onlyRole(TECH_OPS) {
        Redemption storage r = _redemptions[id];
        _require(r, RedemptionState.ELEGIBLE);
        CommodityAsset storage a = _assets[r.assetId];
        a.queueTail += 1;
        r.queuePos = a.queueTail;
        _queue[r.assetId][a.queueTail] = id;
        _move(id, r, RedemptionState.EN_COLA);
    }

    /// @notice Bloquea lo que se va a entregar: para los canales físicos, metal de
    ///         UN lote concreto; para ORIGEN, el turno de liquidación.
    function blockForSettlement(bytes32 id, bytes32 lotId, uint64 deadline) external onlyRole(TECH_OPS) {
        Redemption storage r = _redemptions[id];
        _require(r, RedemptionState.EN_COLA);
        CommodityAsset storage a = _assets[r.assetId];
        // Orden de llegada: nadie se adelanta a una solicitud anterior aún en cola.
        uint64 h = a.queueHead;
        while (h < a.queueTail && _redemptions[_queue[r.assetId][h + 1]].state != RedemptionState.EN_COLA) h++;
        a.queueHead = h;
        if (_queue[r.assetId][h + 1] != id) revert QueueOrder(_queue[r.assetId][h + 1]);

        if (r.channel != Channel.LIQUIDACION_ORIGEN) {
            _checkChannel(a, r.assetId, r.channel, r.units);
            if (r.channel == Channel.RETIRO_PRESENCIAL && deadline <= block.timestamp) revert InvalidInput("DEADLINE");
            Lot storage l = _lots[lotId];
            if (l.assetId != r.assetId || !_lotCounts(l)) revert InvalidInput("LOT");
            uint256 fromLot = l.ozCommitted < r.oz ? l.ozCommitted : r.oz;
            uint256 rest = r.oz - fromLot;
            if (_lotFree(l) < rest) revert InvalidInput("LOT_INSUFFICIENT");
            l.ozCommitted -= fromLot;
            l.ozLocked += r.oz;
            // El resto lo respaldaban otros lotes: ahora lo respalda éste.
            if (rest != 0) _decommit(r.assetId, rest, lotId);
            r.lotId = lotId;
            r.deadline = deadline;
            _refreshLot(lotId, l);
        } else if (lotId != bytes32(0)) {
            revert InvalidInput("LOT_NOT_EXPECTED");
        }
        _move(id, r, RedemptionState.BLOQUEADA);
    }

    /// @notice Liquidación en ORIGEN: quema y paga en la misma transacción.
    ///         AUKA: 1.710,6925 ORIGEN por onza, por denominación. AGKA: con el
    ///         ratio oro/plata vigente del oráculo único (revierte si no está fresco).
    function settleInOrigen(bytes32 id) external onlyRole(TECH_OPS) nonReentrant {
        if (governance.isPaused()) revert Paused();
        Redemption storage r = _redemptions[id];
        _require(r, RedemptionState.BLOQUEADA);
        if (r.channel != Channel.LIQUIDACION_ORIGEN) revert InvalidInput("CHANNEL");
        CommodityAsset storage a = _assets[r.assetId];
        ChannelConfig memory c = _channels[r.assetId][uint8(Channel.LIQUIDACION_ORIGEN)];
        if (!c.set) revert Blocked(SFSPCodes.BLOCKED_DECISION, bytes32("CHANNEL_NOT_SET"));

        uint256 gross;
        if (a.metal == oracle.METAL_XAU()) gross = oracle.goldOuncesToGramin(r.oz);
        else (gross,,) = oracle.silverOuncesToGramin(r.oz);
        uint256 pay = (gross * (BPS - c.spreadBps)) / BPS;
        if (address(this).balance < pay) revert InsufficientSettlementFunds(address(this).balance, pay);

        // Quema ANTES de pagar: nunca hay más unidades que onzas.
        a.token.burnLocked(id);
        a.unitsPlaced -= r.units;
        _decommit(r.assetId, r.oz, bytes32(0));
        _move(id, r, RedemptionState.LIQUIDADA);
        _move(id, r, RedemptionState.ENTREGADA);
        (bool ok,) = r.holder.call{value: pay}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Envío asegurado: se quema al liquidar; la entrega llega después y
    ///         queda como obligación exigible hasta entonces.
    function settleShipment(bytes32 id) external onlyRole(TECH_OPS) nonReentrant {
        Redemption storage r = _redemptions[id];
        _require(r, RedemptionState.BLOQUEADA);
        if (r.channel != Channel.ENVIO_ASEGURADO) revert InvalidInput("CHANNEL");
        _burnPhysical(id, r);
        _move(id, r, RedemptionState.LIQUIDADA);
    }

    /// @notice Confirmación de la entrega por el custodio del lote.
    ///         Envío: sólo si ya se quemó (LIQUIDADA). Retiro presencial: la quema
    ///         ocurre AQUÍ, contra la entrega, dentro del plazo de la cita.
    function confirmDelivery(bytes32 id) external nonReentrant {
        Redemption storage r = _redemptions[id];
        Lot storage l = _lots[r.lotId];
        if (r.lotId == bytes32(0) || msg.sender != _custodians[l.custodianId].attestor) {
            revert NotCustodianAttestor(r.lotId, msg.sender);
        }
        if (r.channel == Channel.RETIRO_PRESENCIAL) {
            _require(r, RedemptionState.BLOQUEADA);
            if (block.timestamp > r.deadline) revert InvalidInput("DEADLINE_PASSED");
            _burnPhysical(id, r);
            _move(id, r, RedemptionState.LIQUIDADA);
        } else {
            // Entregar sin haber quemado es exactamente lo que no puede pasar.
            _require(r, RedemptionState.LIQUIDADA);
        }
        l.ozPendingDelivery -= r.oz;
        l.ozDelivered += r.oz;
        _assets[r.assetId].ozPendingDelivery -= r.oz;
        _unassign(l, r.oz);
        _refreshLot(r.lotId, l);
        _move(id, r, RedemptionState.ENTREGADA);
    }

    function _burnPhysical(bytes32 id, Redemption storage r) internal {
        CommodityAsset storage a = _assets[r.assetId];
        Lot storage l = _lots[r.lotId];
        a.token.burnLocked(id);
        a.unitsPlaced -= r.units;
        l.ozLocked -= r.oz;
        l.ozPendingDelivery += r.oz;
        a.ozPendingDelivery += r.oz;
        _refreshLot(r.lotId, l);
    }

    /// @notice Retiro presencial sin comparecencia: vence SIN quemar.
    function expireNoShow(bytes32 id) external nonReentrant {
        Redemption storage r = _redemptions[id];
        _require(r, RedemptionState.BLOQUEADA);
        if (r.channel != Channel.RETIRO_PRESENCIAL || block.timestamp <= r.deadline) revert InvalidInput("NOT_EXPIRED");
        _unblock(id, r);
        _move(id, r, RedemptionState.VENCIDA_POR_INCOMPARECENCIA);
    }

    /// @notice Cancela antes de liquidar (tenedor u operación). Después de quemar
    ///         no hay cancelación por esta vía (SFSP-300 §4.2 exige pruebas).
    function cancelRedemption(bytes32 id) external nonReentrant {
        Redemption storage r = _redemptions[id];
        if (msg.sender != r.holder && !hasRole(TECH_OPS, msg.sender)) revert Unauthorized(TECH_OPS, msg.sender);
        RedemptionState s = r.state;
        if (s == RedemptionState.NINGUNO || uint8(s) > uint8(RedemptionState.BLOQUEADA)) revert InvalidTransition(uint8(s));
        if (s == RedemptionState.BLOQUEADA) _unblock(id, r);
        else _assets[r.assetId].token.unlockUnits(id);
        _move(id, r, RedemptionState.CANCELADA);
    }

    function _unblock(bytes32 id, Redemption storage r) internal {
        if (r.lotId != bytes32(0)) {
            Lot storage l = _lots[r.lotId];
            l.ozLocked -= r.oz;
            l.ozCommitted += r.oz; // las unidades siguen colocadas: el metal vuelve a respaldarlas
            _refreshLot(r.lotId, l);
        }
        _assets[r.assetId].token.unlockUnits(id);
    }

    // =============================================================== fondos de liquidación en ORIGEN

    /// @notice La tesorería deposita ORIGEN para liquidar redenciones.
    function fundOrigenSettlement() external payable onlyRole(TECH_OPS) {
        require(msg.value > 0, "SFSP: monto=0");
        emit OrigenSettlementFunded(msg.sender, msg.value);
    }
}
