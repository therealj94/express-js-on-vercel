// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPEIP712} from "./lib/SFSPEIP712.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {ISFSPGovernanceController, ISFSPRegulatedAsset, ISFSPEligibilityEngine} from "./lib/ISFSP.sol";

/// @title Controlador de emisión: consume SignedAuthorization del §2.4.
/// @notice Tres topes distintos, a propósito:
///         1) por autorización: lo acuñado acumulado nunca supera su monto aprobado;
///         2) por instrumento (stock): outstanding + reservas concurrentes <= límite;
///         3) por instrumento (flujo): emisión acumulada histórica <= cap acumulado.
///         Quemar reduce el outstanding pero NO reduce (3): quemar no renueva
///         una autorización ni devuelve capacidad de emisión.
contract SFSPIssuanceController is SFSPAccessControl, SFSPEIP712, SFSPReentrancyGuard {
    // §2.4 · el payload firmado, completo. La aprobación humana y la validación
    // técnica tienen que coincidir exactamente sobre ESTE payload.
    struct SignedAuthorization {
        bytes32 schemaVersion;
        bytes32 authorizationId;
        bytes32 actionId;
        uint256 chainId;
        bytes32 genesisHash;
        address verifyingContract;
        bytes32 assetId;
        uint256 amount;
        address destination;
        bytes32 policyVersion;
        bytes32 evidenceRoot;
        bytes32 nonce;
        uint64 notBefore;
        uint64 expiry;
    }

    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256(
        "SignedAuthorization(bytes32 schemaVersion,bytes32 authorizationId,bytes32 actionId,uint256 chainId,bytes32 genesisHash,address verifyingContract,bytes32 assetId,uint256 amount,address destination,bytes32 policyVersion,bytes32 evidenceRoot,bytes32 nonce,uint64 notBefore,uint64 expiry)"
    );

    bytes32 public constant ACTION_MINT = bytes32("MINT");

    // §3 · MintExecuted lo emite IssuanceController.
    event MintExecuted(
        bytes32 indexed assetId,
        bytes32 indexed authorizationId,
        address indexed destination,
        uint256 amount,
        bytes32 operationId,
        bytes32 evidenceRoot
    );
    event InstrumentLimitsSet(bytes32 indexed assetId, uint256 outstandingLimit, uint256 cumulativeIssuanceCap);
    event IssuanceReserveOpened(bytes32 indexed assetId, bytes32 indexed reserveId, uint256 amount);
    event IssuanceReserveClosed(bytes32 indexed assetId, bytes32 indexed reserveId, uint256 amount, bytes32 reasonCode);

    error AuthorizationExpired(uint64 expiry, uint256 nowTs);
    error AuthorizationNotYetValid(uint64 notBefore, uint256 nowTs);
    error NonceAlreadyUsed(bytes32 nonce);
    error OperationReplay(bytes32 operationId);
    error DomainMismatch(uint256 chainId, address verifyingContract);
    error WrongAction(bytes32 actionId);
    error QuorumNotReached(uint256 have, uint256 need);
    error SignerNotAuthorized(address signer);
    error SignersNotSorted();
    error AuthorizationAmountExceeded(bytes32 authorizationId, uint256 minted, uint256 requested, uint256 approved);
    error OutstandingLimitExceeded(uint256 outstanding, uint256 reserved, uint256 requested, uint256 limit);
    error CumulativeIssuanceCapExceeded(uint256 issued, uint256 requested, uint256 cap);
    error LimitsNotFixed(bytes32 assetId, uint8 code);
    error AssetMismatch(bytes32 expected, bytes32 got);
    error Paused();
    // H18 · una reserva pertenece a UN activo; cerrarla contra otro corrompía los
    // contadores de los dos.
    error ReserveAssetMismatch(bytes32 reserveId, bytes32 opened, bytes32 presented);
    error ReserveUnknown(bytes32 reserveId);
    // H18 · un activo sin contrato registrado no vale cero: no se sabe.
    error AssetContractUnknown(bytes32 assetId, uint8 code);
    // H01 · la emisión también se autoriza por contenido, no por identificador.
    error MintNotAuthorized(bytes32 digest);
    error AuthorizationActionMismatch(bytes32 expected, bytes32 got);
    error PayloadDoesNotMatchEnvelope(bytes32 reason);

    // ---- SFSP-410 · política de suministro "circulante = en manos de usuarios"
    error MintToInternalAccount(address destination);
    error InternalAccountUnflagNeedsBoard(address account);
    error BudgetNotSet(bytes32 assetId, uint8 code);
    error BudgetExpired(bytes32 assetId, uint64 validUntil);
    error BudgetPeriodExceeded(bytes32 assetId, uint256 used, uint256 requested, uint256 perPeriod);
    error BudgetOperationTooLarge(bytes32 assetId, uint256 requested, uint256 maxPerOperation);
    error BudgetTermsMismatch(bytes32 evidenceRoot, bytes32 recomputed);
    error BudgetWaitPending(bytes32 digest, uint64 readyAt);
    error BudgetInvalid(bytes32 reason);
    error PaymentReferenceRequired();

    event InternalAccountFlagged(address indexed account, bool internalAccount, address indexed by, bytes32 reasonCode);
    event MintBudgetSet(
        bytes32 indexed assetId,
        bytes32 indexed digest,
        uint256 perPeriod,
        uint64 period,
        uint256 maxPerOperation,
        uint64 validUntil,
        bytes32 termsDocRoot
    );
    event MintBudgetRevoked(bytes32 indexed assetId, address indexed by, bytes32 reasonCode);
    /// @dev Emisión bajo demanda dentro del cupo. `paymentRef` es la referencia
    ///      del pago del usuario (hash del recibo): va como operationId y no se
    ///      puede repetir, así que un mismo pago no acuña dos veces.
    event MintOnDemand(
        bytes32 indexed assetId,
        address indexed destination,
        bytes32 indexed paymentRef,
        uint256 amount,
        uint256 usedInPeriod,
        uint64 periodIndex
    );

    // ---- SFSP v0.3 §5 · verificación previa a la acuñación
    /// @dev Rol de DBNX: registra (firma con su transacción) el documento de
    ///      aprobación de una emisión. DBNX autoriza; Orden Global ejecuta y
    ///      sólo verifica LA FORMA del documento (v0.3 §5).
    bytes32 public constant DBNX = keccak256("SFSP.ROLE.DBNX");

    /// @dev Documento de aprobación DBNX registrado en cadena. Sólo su hash:
    ///      el documento vive fuera. Se gasta en la acuñación —o en el cupo— que
    ///      lo usa. SFSP-200 §0.5 fila 1: activo, cantidad, destino o regla de
    ///      destino, vigencia y firmante son obligatorios.
    struct DbnxApproval {
        bytes32 assetId;
        uint256 amount;       // cantidad EXACTA aprobada (mint) o total del cupo (setMintBudget)
        uint64 validFrom;
        uint64 validUntil;    // exclusiva
        address signer;       // cuenta con rol DBNX que lo registró
        bool revoked;
        bytes32 usedBy;       // operationId (mint) o digest del cupo que lo gastó; 0 = sin usar
        /// @dev Destino o regla de destino. En `mint`, la dirección exacta
        ///      (`bytes32(uint256(uint160(destino)))`). En un cupo comercial,
        ///      `DEST_ELIGIBLE_ACQUIRER` (quien pase SUBSCRIBE). En un cupo de
        ///      migración, la raíz del padrón (ADR-016).
        bytes32 destination;
        /// @dev true: continuidad de tenencia de un heredado (SFSP-700 §0.3,
        ///      ADR-016); no es colocación primaria y no se evalúa SUBSCRIBE,
        ///      sólo MINT. false: colocación primaria (SFSP-120 §0.3).
        bool migration;
    }

    event DbnxApprovalRecorded(
        bytes32 indexed docHash,
        bytes32 indexed assetId,
        address indexed signer,
        uint256 amount,
        uint64 validFrom,
        uint64 validUntil,
        bytes32 destination,
        bool migration
    );
    event DbnxApprovalRevoked(bytes32 indexed docHash, address indexed by, bytes32 reasonCode);
    /// @notice El documento DBNX `docHash` respaldó la acuñación `operationId`.
    /// @dev Apéndice B: el paso de «sin usar» a «usada» es una transición y
    ///      tiene evento. La conciliación casa este `operationId` con el de
    ///      `MintExecuted` sin decodificar calldata.
    event DbnxApprovalUsed(
        bytes32 indexed docHash, bytes32 indexed assetId, uint256 amount, bytes32 indexed operationId
    );

    error DbnxApprovalRequired();
    error DbnxApprovalUnknown(bytes32 docHash);
    error DbnxApprovalExists(bytes32 docHash);
    error DbnxApprovalInvalid(bytes32 reason);
    error DbnxApprovalSignerNotDbnx(address signer);
    error DbnxApprovalRevokedErr(bytes32 docHash);
    error DbnxApprovalAlreadyUsed(bytes32 docHash, bytes32 usedBy);
    error DbnxApprovalNotInForce(uint64 validFrom, uint64 validUntil, uint256 nowTs);
    error DbnxApprovalAssetMismatch(bytes32 approved, bytes32 requested);
    error DbnxApprovalAmountMismatch(uint256 approved, uint256 requested);
    error DbnxSeparationOfDuties(address account);
    error DbnxApprovalDestinationMismatch(bytes32 approved, bytes32 requested);
    error DbnxApprovalWindowExceeded(uint64 approvedUntil, uint64 requestedUntil);
    error BudgetDbnxExhausted(bytes32 assetId, uint256 remaining, uint256 requested);
    /// @dev ADR-016 / T-700-27 · un cupo vigente no se sustituye sin revocarlo antes.
    error BudgetInForce(bytes32 assetId, uint64 validUntil);
    /// @dev SFSP-300 §0.2 salvaguardas 2 y 3 · un activo COM no se coloca con un
    ///      tercero desde aquí: la colocación exige capacidad en onzas y pasa por
    ///      el motor de reservas.
    error CommodityPlacementViaReserveEngine(bytes32 assetId);

    /// @dev Regla de destino de un cupo comercial: cualquier adquirente que pase
    ///      SUBSCRIBE en el motor de elegibilidad.
    bytes32 public constant DEST_ELIGIBLE_ACQUIRER = keccak256("SFSP.DBNX.DESTINO.ADQUIRENTE_ELEGIBLE");

    mapping(bytes32 => DbnxApproval) private _dbnxApproval;

    struct InstrumentLimits {
        bool configured;          // sin fijar => BLOCKED_DECISION, no un número por defecto
        uint256 outstandingLimit; // cap de STOCK
        uint256 cumulativeCap;    // cap ACUMULADO de emisión
    }

    ISFSPGovernanceController public immutable governance;

    mapping(bytes32 => InstrumentLimits) private _limits;      // assetId => límites
    mapping(bytes32 => uint256) private _mintedUnderAuth;      // authorizationId => acuñado
    mapping(bytes32 => bool) private _usedNonce;               // anti-replay explícito
    mapping(bytes32 => bool) private _usedOperationId;         // idempotencia (§1)
    mapping(bytes32 => uint256) private _cumulativeIssued;     // assetId => emitido histórico
    mapping(bytes32 => uint256) private _reservedIssuance;     // assetId => reservas abiertas
    // H18 · la reserva guarda ACTIVO y monto. Guardando sólo el monto se podía
    // abrir contra A y cerrar contra B: el contador de B bajaba sin que nadie
    // hubiera reservado nada en B, y el de A se quedaba alto para siempre.
    struct IssuanceReserve {
        bytes32 assetId;
        uint256 amount;
    }

    mapping(bytes32 => IssuanceReserve) private _reserves;     // reserveId => reserva
    mapping(bytes32 => address) private _assetContract;        // assetId => contrato

    constructor(address board, address governance_)
        SFSPAccessControl(board)
        SFSPEIP712("SFSPIssuanceController", "draft-0.3")
    {
        require(governance_ != address(0), "SFSP: governance=0");
        governance = ISFSPGovernanceController(governance_);
    }

    // ------------------------------------------------------------- configuración

    function registerAssetContract(bytes32 assetId, address contractAddress) external onlyRole(DBNX_BOARD) {
        require(contractAddress != address(0), "SFSP: asset=0");
        require(ISFSPRegulatedAsset(contractAddress).assetId() == assetId, "SFSP: assetId no coincide");
        _assetContract[assetId] = contractAddress;
    }

    function setInstrumentLimits(bytes32 assetId, uint256 outstandingLimit, uint256 cumulativeCap)
        external
        onlyRole(DBNX_BOARD)
    {
        _limits[assetId] = InstrumentLimits({
            configured: true,
            outstandingLimit: outstandingLimit,
            cumulativeCap: cumulativeCap
        });
        emit InstrumentLimitsSet(assetId, outstandingLimit, cumulativeCap);
    }

    function limitsOf(bytes32 assetId) external view returns (InstrumentLimits memory) {
        return _limits[assetId];
    }

    function mintedUnderAuthorization(bytes32 authorizationId) external view returns (uint256) {
        return _mintedUnderAuth[authorizationId];
    }

    function cumulativeIssued(bytes32 assetId) external view returns (uint256) {
        return _cumulativeIssued[assetId];
    }

    function reservedIssuance(bytes32 assetId) external view returns (uint256) {
        return _reservedIssuance[assetId];
    }

    function isNonceUsed(bytes32 nonce) external view returns (bool) {
        return _usedNonce[nonce];
    }

    function reserveOf(bytes32 reserveId) external view returns (IssuanceReserve memory) {
        return _reserves[reserveId];
    }

    // ------------------------------------------------ v0.3 §5 · aprobación DBNX

    function dbnxApprovalOf(bytes32 docHash) external view returns (DbnxApproval memory) {
        return _dbnxApproval[docHash];
    }

    /// @notice DBNX registra el documento de aprobación de una emisión: activo,
    ///         cantidad exacta y vigencia. Registrar con la cuenta DBNX ES la
    ///         firma: la transacción la firma una cuenta con ese rol.
    /// @dev Separación de funciones: quien tiene el rol ISSUER (ejecuta la
    ///      acuñación) no puede registrar aprobaciones. DBNX no emite ni acuña.
    /// @param destination destino o regla de destino (ver `DbnxApproval`).
    /// @param migration true si autoriza la continuidad de tenencia de una
    ///        migración (SFSP-700), no una colocación primaria.
    function registerDbnxApproval(
        bytes32 docHash,
        bytes32 assetId,
        uint256 amount,
        uint64 validFrom,
        uint64 validUntil,
        bytes32 destination,
        bool migration
    ) external onlyRole(DBNX) {
        if (hasRole(ISSUER, msg.sender)) revert DbnxSeparationOfDuties(msg.sender);
        if (docHash == bytes32(0)) revert DbnxApprovalRequired();
        if (_dbnxApproval[docHash].signer != address(0)) revert DbnxApprovalExists(docHash);
        if (assetId == bytes32(0)) revert DbnxApprovalInvalid(bytes32("ASSET"));
        if (amount == 0) revert DbnxApprovalInvalid(bytes32("AMOUNT"));
        if (validUntil <= validFrom || validUntil <= block.timestamp) revert DbnxApprovalInvalid(bytes32("WINDOW"));
        // Sin destino ni regla de destino el documento está incompleto (SFSP-200 §0.5 fila 1).
        if (destination == bytes32(0)) revert DbnxApprovalInvalid(bytes32("DESTINATION"));
        _dbnxApproval[docHash] = DbnxApproval({
            assetId: assetId,
            amount: amount,
            validFrom: validFrom,
            validUntil: validUntil,
            signer: msg.sender,
            revoked: false,
            usedBy: bytes32(0),
            destination: destination,
            migration: migration
        });
        emit DbnxApprovalRecorded(docHash, assetId, msg.sender, amount, validFrom, validUntil, destination, migration);
    }

    /// @notice DBNX retira una aprobación no usada. Reducir poder no necesita quórum.
    function revokeDbnxApproval(bytes32 docHash, bytes32 reasonCode) external onlyRole(DBNX) {
        DbnxApproval storage a = _dbnxApproval[docHash];
        if (a.signer == address(0)) revert DbnxApprovalUnknown(docHash);
        if (a.usedBy != bytes32(0)) revert DbnxApprovalAlreadyUsed(docHash, a.usedBy);
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        a.revoked = true;
        emit DbnxApprovalRevoked(docHash, msg.sender, reasonCode);
    }

    /// @dev La verificación de FORMA previa a la acuñación (v0.3 §5), común a
    ///      las dos rutas (`mint` y `setMintBudget`): el hash que va en la orden
    ///      de gobierno tiene que ser un documento DBNX registrado, firmado por
    ///      quien TODAVÍA tiene el rol, no revocado, sin usar, vigente y del
    ///      mismo activo. Cada ruta comprueba después su cantidad y su destino.
    ///      Si algo falla, revierte; si todo cuadra, se gasta.
    ///      v0.3 §5.2 · la separación DBNX/emisor se comprueba AQUÍ, al usar, y
    ///      no sólo al registrar: si no, quien registró la aprobación podía
    ///      recibir ISSUER después (o perderlo, registrar y recuperarlo) y
    ///      acuñar con su propia firma. Ni el firmante puede ejecutar, ni
    ///      puede tener ISSUER, ni el ejecutor puede tener DBNX.
    ///      Apéndice B · el paso a «usada» emite `DbnxApprovalUsed` con la
    ///      cantidad del documento y el `usedBy` (operationId de la acuñación o
    ///      digest del cupo).
    function _useDbnxApproval(bytes32 docHash, bytes32 assetId, bytes32 usedBy)
        internal
        returns (DbnxApproval storage a)
    {
        if (docHash == bytes32(0)) revert DbnxApprovalRequired();
        a = _dbnxApproval[docHash];
        if (a.signer == address(0)) revert DbnxApprovalUnknown(docHash);
        if (!hasRole(DBNX, a.signer)) revert DbnxApprovalSignerNotDbnx(a.signer);
        if (a.signer == msg.sender || hasRole(ISSUER, a.signer)) revert DbnxSeparationOfDuties(a.signer);
        if (hasRole(DBNX, msg.sender)) revert DbnxSeparationOfDuties(msg.sender);
        if (a.revoked) revert DbnxApprovalRevokedErr(docHash);
        if (a.usedBy != bytes32(0)) revert DbnxApprovalAlreadyUsed(docHash, a.usedBy);
        if (block.timestamp < a.validFrom || block.timestamp >= a.validUntil) {
            revert DbnxApprovalNotInForce(a.validFrom, a.validUntil, block.timestamp);
        }
        if (a.assetId != assetId) revert DbnxApprovalAssetMismatch(a.assetId, assetId);
        a.usedBy = usedBy;
        emit DbnxApprovalUsed(docHash, assetId, a.amount, usedBy);
    }

    // ------------------------------------------------------------- reservas concurrentes

    /// @dev Una reserva es capacidad comprometida todavía no acuñada. Cuenta en
    ///      el tope de stock para que dos emisiones en vuelo no lo superen juntas.
    function openIssuanceReserve(bytes32 assetId, bytes32 reserveId, uint256 amount) external onlyRole(ISSUER) {
        require(_reserves[reserveId].amount == 0 && amount > 0 && assetId != bytes32(0), "SFSP: reserva invalida");
        InstrumentLimits memory lim = _limits[assetId];
        if (!lim.configured) revert LimitsNotFixed(assetId, SFSPCodes.BLOCKED_DECISION);
        uint256 outstanding = _outstanding(assetId);
        uint256 reserved = _reservedIssuance[assetId];
        if (outstanding + reserved + amount > lim.outstandingLimit) {
            revert OutstandingLimitExceeded(outstanding, reserved, amount, lim.outstandingLimit);
        }
        _reserves[reserveId] = IssuanceReserve({assetId: assetId, amount: amount});
        _reservedIssuance[assetId] = reserved + amount;
        emit IssuanceReserveOpened(assetId, reserveId, amount);
    }

    /// @dev H18 · cerrar exige el MISMO activo con el que se abrió. Antes la
    ///      reserva guardaba sólo el monto y el activo lo ponía el llamador al
    ///      cerrar, así que una reserva abierta sobre A se podía cerrar contra B.
    function closeIssuanceReserve(bytes32 assetId, bytes32 reserveId, bytes32 reasonCode) external onlyRole(ISSUER) {
        IssuanceReserve memory r = _reserves[reserveId];
        if (r.amount == 0) revert ReserveUnknown(reserveId);
        if (r.assetId != assetId) revert ReserveAssetMismatch(reserveId, r.assetId, assetId);
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        delete _reserves[reserveId];
        _reservedIssuance[r.assetId] -= r.amount;
        emit IssuanceReserveClosed(r.assetId, reserveId, r.amount, reasonCode);
    }

    /// @dev El outstanding se lee del propio contrato del activo: el inventario
    ///      de tesorería ya acuñado CUENTA. Depositarlo en tesorería no lo
    ///      convierte en "no emitido".
    ///      H18 · un activo sin contrato registrado REVIERTE. Devolver cero era
    ///      indistinguible de «este activo no tiene nada emitido», y con ese cero
    ///      todos los topes de stock pasaban: el error quedaba oculto justo en el
    ///      sitio donde más caro sale (§5, UNKNOWN_SOURCE nunca se degrada a 0).
    function _outstanding(bytes32 assetId) internal view returns (uint256) {
        address a = _assetContract[assetId];
        if (a == address(0)) revert AssetContractUnknown(assetId, SFSPCodes.UNKNOWN_SOURCE);
        return ISFSPRegulatedAsset(a).totalSupply();
    }

    function outstandingOf(bytes32 assetId) external view returns (uint256) {
        return _outstanding(assetId);
    }

    // ------------------------------------------------ SFSP-410 · cuentas internas

    /// @dev Cuentas de la propia organización (tesorería, operación, liquidez,
    ///      ejecutores). Con la política de SFSP-410 no se acuña NUNCA hacia una
    ///      de ellas: acuñar a tesorería es fabricar inventario, y el circulante
    ///      tiene que ser exactamente lo que está en manos de usuarios.
    mapping(address => bool) private _internalAccount;

    function isInternalAccount(address account) external view returns (bool) {
        return _internalAccount[account];
    }

    /// @notice Marca o desmarca una cuenta como interna.
    /// @dev Marcar RESTRINGE, así que basta TECH_OPS o la Junta. Desmarcar
    ///      AMPLÍA lo que se puede acuñar, así que sólo la Junta.
    function setInternalAccount(address account, bool internalAccount, bytes32 reasonCode) external {
        require(account != address(0), "SFSP: account=0");
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        if (internalAccount) {
            if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender)) {
                revert Unauthorized(TECH_OPS, msg.sender);
            }
        } else if (!hasRole(DBNX_BOARD, msg.sender)) {
            revert InternalAccountUnflagNeedsBoard(account);
        }
        _internalAccount[account] = internalAccount;
        emit InternalAccountFlagged(account, internalAccount, msg.sender, reasonCode);
    }

    // ------------------------------------------------ SFSP-300 · activos COM

    /// @dev SFSP-300 §0.2 (v0.3 §9.4): un activo de commodity (AUKA, AGKA) se
    ///      coloca con un tercero SÓLO con capacidad de colocación en onzas, y
    ///      eso lo lleva el motor de reservas (`SFSPReserveEngine.place`). Este
    ///      controlador no conoce las onzas: un activo marcado COM no se acuña
    ///      desde aquí a un tercero (T-300-30). A la tesorería registrada sigue
    ///      rigiendo R1 hasta que D23 decida lo contrario.
    event CommodityAssetFlagged(bytes32 indexed assetId, bool commodity, address indexed by, bytes32 reasonCode);

    mapping(bytes32 => bool) private _commodity;

    function isCommodityAsset(bytes32 assetId) external view returns (bool) {
        return _commodity[assetId];
    }

    /// @notice Marca o desmarca un activo como COM. Marcar RESTRINGE (TECH_OPS o
    ///         la Junta); desmarcar amplía lo que se puede acuñar (sólo la Junta).
    function setCommodityAsset(bytes32 assetId, bool commodity, bytes32 reasonCode) external {
        require(assetId != bytes32(0) && reasonCode != bytes32(0), "SFSP: activo y motivo");
        if (commodity) {
            if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender)) revert Unauthorized(TECH_OPS, msg.sender);
        } else if (!hasRole(DBNX_BOARD, msg.sender)) {
            revert Unauthorized(DBNX_BOARD, msg.sender);
        }
        _commodity[assetId] = commodity;
        emit CommodityAssetFlagged(assetId, commodity, msg.sender, reasonCode);
    }

    // ------------------------------------------------ SFSP-410 · cupo de emisión

    bytes32 public constant ACTION_SET_MINT_BUDGET = bytes32("SET_MINT_BUDGET");
    /// @dev v0.3 §6/§7 · cupo de MIGRACIÓN (padrón, v0.3 §14.3; ADR-016). No
    ///      es una venta: su emisión no es una suscripción primaria.
    ///      Se aprueba con su propia etiqueta, así que los firmantes ven en el
    ///      registro que están aprobando una migración y no un cupo de venta.
    ///      El cupo `SET_MINT_BUDGET` es de VENTA.
    bytes32 public constant ACTION_SET_MIGRATION_BUDGET = bytes32("SET_MIGRATION_BUDGET");
    bytes32 public constant BUDGET_TERMS_TAG = keccak256("SFSP.MINT_BUDGET.TERMS.v1");

    // ---- v0.3 §6 y §7 · SUBSCRIBE en la ruta de dinero
    /// @dev Motor de elegibilidad que hace cumplir la suscripción. Mientras sea
    ///      cero rige el comportamiento anterior (compatibilidad: el emisor
    ///      acuña bajo demanda sin evaluar SUBSCRIBE) y `mintOnSubscription`
    ///      responde BLOCKED_DECISION. Al fijarlo, un cupo de VENTA sólo se
    ///      consume por `mintOnSubscription`; `mintOnDemand` queda para los
    ///      cupos de MIGRACIÓN. Lo fija la Junta: elegir el motor es elegir la
    ///      regla.
    ISFSPEligibilityEngine public subscriptionGate;

    event SubscriptionGateSet(address indexed gate, address indexed by, bytes32 reasonCode);
    error SubscriptionRequired(bytes32 assetId);
    error SubscriptionGateUnset(uint8 code);
    error BudgetKindMismatch(bytes32 assetId, bool migrationBudget);

    /// @notice Enciende (motor ≠ 0) o apaga (cero) la exigencia de SUBSCRIBE en
    ///         la emisión bajo demanda de venta.
    /// @dev El motor tiene que conceder a este contrato el rol
    ///      SUBSCRIPTION_EXECUTOR; si no, toda venta revierte (falla cerrada).
    function setSubscriptionGate(address gate, bytes32 reasonCode) external onlyRole(DBNX_BOARD) {
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        subscriptionGate = ISFSPEligibilityEngine(gate);
        emit SubscriptionGateSet(gate, msg.sender, reasonCode);
    }

    /// @notice true si el cupo vigente del activo es de MIGRACIÓN.
    function isMigrationBudget(bytes32 assetId) external view returns (bool) {
        return _budgetAuth[assetId].migration;
    }

    /// @dev Cupo pre-aprobado por gobierno para emitir BAJO DEMANDA: cuando el
    ///      pago de un usuario se confirma, el emisor acuña exactamente eso al
    ///      usuario, sin una orden de gobierno por cada compra, pero nunca más de
    ///      `perPeriod` por periodo ni más de `maxPerOperation` por operación, y
    ///      siempre bajo los topes de stock y acumulado del instrumento.
    struct MintBudget {
        uint256 perPeriod;
        uint64 period;
        uint256 maxPerOperation;
        uint64 validUntil;
        uint64 periodIndex;
        uint256 usedInPeriod;
    }

    mapping(bytes32 => MintBudget) private _budget;

    /// @dev v0.3 §5 · la autorización DBNX del cupo: qué documento lo respalda,
    ///      cuánto puede crear en TOTAL (lo que DBNX aprobó; los periodos no lo
    ///      renuevan) y si es una migración (sin SUBSCRIBE) o una colocación.
    ///      Va aparte de `MintBudget` para no cambiar lo que devuelve `mintBudgetOf`.
    struct BudgetAuthorization {
        bytes32 docHash;
        uint256 remaining;
        bool migration;
    }

    mapping(bytes32 => BudgetAuthorization) private _budgetAuth;

    function mintBudgetOf(bytes32 assetId) external view returns (MintBudget memory) {
        return _budget[assetId];
    }

    function budgetAuthorizationOf(bytes32 assetId) external view returns (BudgetAuthorization memory) {
        return _budgetAuth[assetId];
    }

    /// @notice Lo que queda del cupo en el periodo en curso, acotado por lo que
    ///         queda de la aprobación DBNX (0 si no hay cupo vigente).
    function budgetRemaining(bytes32 assetId) external view returns (uint256) {
        MintBudget memory b = _budget[assetId];
        if (b.period == 0 || block.timestamp >= b.validUntil) return 0;
        uint64 idx = uint64(block.timestamp / b.period);
        uint256 used = idx == b.periodIndex ? b.usedInPeriod : 0;
        uint256 left = used >= b.perPeriod ? 0 : b.perPeriod - used;
        uint256 dbnx = _budgetAuth[assetId].remaining;
        return left < dbnx ? left : dbnx;
    }

    /// @notice Huella de los términos del cupo que no caben en el payload común.
    /// @dev El payload del §12.1 tiene dos montos (`amount` = por periodo,
    ///      `amountSecondary` = máximo por operación). La duración del periodo, la
    ///      vigencia y el documento de respaldo van comprometidos en `evidenceRoot`
    ///      con esta huella, así que entran en el digest que gobierno aprueba.
    function budgetTermsRoot(uint64 period, uint64 validUntil, bytes32 termsDocRoot) public pure returns (bytes32) {
        return keccak256(abi.encode(BUDGET_TERMS_TAG, period, validUntil, termsDocRoot));
    }

    /// @notice Fija el cupo de un activo con doble control Y espera, y con la
    ///         aprobación de DBNX.
    /// @dev Cambiar un cupo es cambiar cuánto puede crear el sistema sin volver a
    ///      preguntar: se exige la acción SET_MINT_BUDGET (venta) o
    ///      SET_MIGRATION_BUDGET (migración), quórum, la espera del timelock
    ///      contada desde la propuesta, y el digest se gasta. La etiqueta
    ///      aprobada tiene que ser la misma acción: el tipo de cupo lo deciden
    ///      los firmantes, no el ejecutor.
    ///      v0.3 §5 y §8.3 Bloque 7, SFSP-200 §0.5 regla 1 · no hay ruta de
    ///      acuñación exenta de DBNX: `termsDocRoot` es el hash del documento de
    ///      aprobación DBNX del cupo, que va dentro del digest aprobado. Tiene que
    ///      estar registrado, vigente, sin usar y ser del mismo activo; su
    ///      cantidad es el TOTAL que el cupo puede crear (>= el monto por periodo)
    ///      y su vigencia acota la del cupo. Su regla de destino dice si es una
    ///      colocación (`DEST_ELIGIBLE_ACQUIRER`: cada acuñación exige SUBSCRIBE)
    ///      o una migración (la raíz del padrón: sólo MINT, ADR-016), y tiene
    ///      que coincidir con la etiqueta: SET_MIGRATION_BUDGET sólo con un
    ///      documento de migración, SET_MINT_BUDGET sólo con uno de colocación.
    ///      ADR-016 / T-700-27 · un cupo vigente no se sustituye: se revoca
    ///      antes (`revokeMintBudget`, una llave) y después se fija el nuevo.
    function setMintBudget(
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest,
        uint64 period,
        uint64 validUntil,
        bytes32 termsDocRoot
    ) external nonReentrant {
        if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender)) revert Unauthorized(TECH_OPS, msg.sender);
        if (p.action != ACTION_SET_MINT_BUDGET && p.action != ACTION_SET_MIGRATION_BUDGET) {
            revert AuthorizationActionMismatch(ACTION_SET_MINT_BUDGET, p.action);
        }
        if (p.origin != address(0) || p.destination != address(0)) revert BudgetInvalid(bytes32("PARTIES"));
        if (p.amount == 0 || p.amountSecondary == 0 || p.amountSecondary > p.amount) revert BudgetInvalid(bytes32("AMOUNTS"));
        if (period == 0 || validUntil <= block.timestamp) revert BudgetInvalid(bytes32("WINDOW"));
        bytes32 terms = budgetTermsRoot(period, validUntil, termsDocRoot);
        if (p.evidenceRoot != terms) revert BudgetTermsMismatch(p.evidenceRoot, terms);
        if (!_limits[p.assetId].configured) revert LimitsNotFixed(p.assetId, SFSPCodes.BLOCKED_DECISION);
        MintBudget storage vigente = _budget[p.assetId];
        if (vigente.period != 0 && block.timestamp < vigente.validUntil) revert BudgetInForce(p.assetId, vigente.validUntil);

        if (governance.authorizationActionOf(approvedDigest) != p.action) {
            revert AuthorizationActionMismatch(p.action, governance.authorizationActionOf(approvedDigest));
        }
        if (!governance.isAuthorizationApproved(approvedDigest)) revert MintNotAuthorized(approvedDigest);
        uint64 readyAt = governance.authorizationProposedAt(approvedDigest) + governance.timelockDelay();
        if (block.timestamp < readyAt) revert BudgetWaitPending(approvedDigest, readyAt);

        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        DbnxApproval storage a = _useDbnxApproval(termsDocRoot, p.assetId, approvedDigest);
        if (a.amount < p.amount) revert DbnxApprovalAmountMismatch(a.amount, p.amount);
        if (validUntil > a.validUntil) revert DbnxApprovalWindowExceeded(a.validUntil, validUntil);
        if (a.migration ? a.destination == DEST_ELIGIBLE_ACQUIRER : a.destination != DEST_ELIGIBLE_ACQUIRER) {
            revert DbnxApprovalDestinationMismatch(a.destination, DEST_ELIGIBLE_ACQUIRER);
        }
        if (a.migration != (p.action == ACTION_SET_MIGRATION_BUDGET)) revert BudgetKindMismatch(p.assetId, a.migration);
        _budgetAuth[p.assetId] = BudgetAuthorization({docHash: termsDocRoot, remaining: a.amount, migration: a.migration});

        _budget[p.assetId] = MintBudget({
            perPeriod: p.amount,
            period: period,
            maxPerOperation: p.amountSecondary,
            validUntil: validUntil,
            periodIndex: uint64(block.timestamp / period),
            usedInPeriod: 0
        });
        emit MintBudgetSet(p.assetId, approvedDigest, p.amount, period, p.amountSecondary, validUntil, termsDocRoot);
    }

    /// @notice Revoca el cupo al instante. Reducir poder no necesita quórum:
    ///      cualquier firmante de gobierno, TECH_OPS o la Junta puede cortarlo.
    function revokeMintBudget(bytes32 assetId, bytes32 reasonCode) external {
        if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender) && !governance.isSigner(msg.sender)) {
            revert Unauthorized(TECH_OPS, msg.sender);
        }
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        delete _budget[assetId];
        delete _budgetAuth[assetId];
        emit MintBudgetRevoked(assetId, msg.sender, reasonCode);
    }

    /// @notice Emisión bajo demanda: acuña al USUARIO exactamente lo que pagó.
    /// @dev Además del cupo y los topes: nunca más de lo que DBNX aprobó para el
    ///      cupo, y —salvo en un cupo de migración— la suscripción primaria
    ///      sobre el destino (SFSP-120 §0.3 regla 1: acuñar al usuario que pagó
    ///      es colocar), aquí SIN contexto (ruta de residencia por país). Con la
    ///      compuerta de suscripción encendida, sólo consume un cupo de
    ///      MIGRACIÓN: una venta tiene que pasar por `mintOnSubscription`, que
    ///      recibe el contexto (ruta de residencia privada).
    /// @param paymentRef hash del recibo del pago confirmado; es el operationId
    ///        y no se puede repetir.
    /// @param evidenceRoot raíz de la evidencia del pago (recibo, tx de USDT, etc.).
    function mintOnDemand(bytes32 assetId, address destination, uint256 amount, bytes32 paymentRef, bytes32 evidenceRoot)
        external
        onlyRole(ISSUER)
        nonReentrant
    {
        if (governance.isPaused()) revert Paused();
        bool sale = !_budgetAuth[assetId].migration;
        if (sale && address(subscriptionGate) != address(0)) revert SubscriptionRequired(assetId);
        _mintFromBudget(assetId, destination, amount, paymentRef, evidenceRoot, sale);
    }

    /// @notice VENTA primaria bajo demanda: evalúa SUBSCRIBE sobre el
    ///         adquirente y, si es ALLOW, acuña dentro del cupo de venta.
    /// @dev La evaluación y la escritura (gasto de la autorización de
    ///      exposición en el Mercado de Crecimiento) ocurren en el motor en ESTA
    ///      transacción. Un cupo de MIGRACIÓN no vende.
    function mintOnSubscription(
        bytes32 assetId,
        address destination,
        uint256 amount,
        bytes32 paymentRef,
        bytes32 evidenceRoot,
        SFSPTypes.SubscriptionContext calldata ctx
    ) external onlyRole(ISSUER) nonReentrant {
        if (governance.isPaused()) revert Paused();
        if (address(subscriptionGate) == address(0)) revert SubscriptionGateUnset(SFSPCodes.BLOCKED_DECISION);
        if (_budgetAuth[assetId].migration) revert BudgetKindMismatch(assetId, true);
        subscriptionGate.enforceSubscription(destination, assetId, amount, ctx);
        _mintFromBudget(assetId, destination, amount, paymentRef, evidenceRoot, false);
    }

    /// @dev Cupo, topes y acuñación, comunes a las dos entradas bajo demanda.
    /// @param subscribe venta sin contexto: SUBSCRIBE por la ruta de residencia
    ///        por país (la entrada con contexto ya la aplicó).
    function _mintFromBudget(
        bytes32 assetId,
        address destination,
        uint256 amount,
        bytes32 paymentRef,
        bytes32 evidenceRoot,
        bool subscribe
    ) internal {
        if (paymentRef == bytes32(0)) revert PaymentReferenceRequired();
        if (_usedOperationId[paymentRef]) revert OperationReplay(paymentRef);
        _usedOperationId[paymentRef] = true;
        if (amount == 0) revert BudgetInvalid(bytes32("AMOUNT_ZERO"));

        MintBudget storage b = _budget[assetId];
        if (b.period == 0) revert BudgetNotSet(assetId, SFSPCodes.BLOCKED_DECISION);
        if (block.timestamp >= b.validUntil) revert BudgetExpired(assetId, b.validUntil);
        if (amount > b.maxPerOperation) revert BudgetOperationTooLarge(assetId, amount, b.maxPerOperation);
        uint64 idx = uint64(block.timestamp / b.period);
        uint256 used = idx == b.periodIndex ? b.usedInPeriod : 0;
        if (used + amount > b.perPeriod) revert BudgetPeriodExceeded(assetId, used, amount, b.perPeriod);

        BudgetAuthorization storage auth = _budgetAuth[assetId];
        if (amount > auth.remaining) revert BudgetDbnxExhausted(assetId, auth.remaining, amount);
        auth.remaining -= amount;

        _applyInstrumentCaps(assetId, amount);
        b.periodIndex = idx;
        b.usedInPeriod = used + amount;

        _mintTo(assetId, destination, amount, paymentRef);
        if (subscribe) _enforceSubscription(assetId, destination, amount);
        emit MintExecuted(assetId, bytes32("BUDGET"), destination, amount, paymentRef, evidenceRoot);
        emit MintOnDemand(assetId, destination, paymentRef, amount, used + amount, idx);
    }

    /// @dev Topes 2 y 3 del instrumento, comunes a los dos caminos de emisión.
    function _applyInstrumentCaps(bytes32 assetId, uint256 amount) internal {
        InstrumentLimits memory lim = _limits[assetId];
        if (!lim.configured) revert LimitsNotFixed(assetId, SFSPCodes.BLOCKED_DECISION);
        uint256 outstanding = _outstanding(assetId);
        uint256 reserved = _reservedIssuance[assetId];
        if (outstanding + reserved + amount > lim.outstandingLimit) {
            revert OutstandingLimitExceeded(outstanding, reserved, amount, lim.outstandingLimit);
        }
        uint256 issued = _cumulativeIssued[assetId];
        if (issued + amount > lim.cumulativeCap) {
            revert CumulativeIssuanceCapExceeded(issued, amount, lim.cumulativeCap);
        }
        _cumulativeIssued[assetId] = issued + amount;
    }

    /// @dev Único punto que llama al activo. Aquí vive la regla de SFSP-410: no
    ///      se acuña hacia una cuenta interna, venga la emisión de donde venga.
    ///      Y la de SFSP-300 §0.2: un activo COM no se coloca desde aquí.
    function _mintTo(bytes32 assetId, address destination, uint256 amount, bytes32 operationId) internal {
        if (_internalAccount[destination]) revert MintToInternalAccount(destination);
        if (_commodity[assetId]) revert CommodityPlacementViaReserveEngine(assetId);
        address assetContract = _assetContract[assetId];
        require(assetContract != address(0), "SFSP: activo no registrado");
        bytes32 declared = ISFSPRegulatedAsset(assetContract).assetId();
        if (declared != assetId) revert AssetMismatch(assetId, declared);
        ISFSPRegulatedAsset(assetContract).mintFromIssuance(destination, amount, operationId);
    }

    /// @dev SFSP-120 §0.3 regla 1 · la suscripción la aplica el motor del propio
    ///      activo (el mismo que evaluó MINT), en esta transacción. Este
    ///      controlador necesita el rol SUBSCRIPTION_EXECUTOR de ese motor; sin
    ///      él, revierte: no hay colocación sin SUBSCRIBE.
    function _enforceSubscription(bytes32 assetId, address destination, uint256 amount) internal {
        ISFSPEligibilityEngine engine = ISFSPRegulatedAsset(_assetContract[assetId]).engine();
        SFSPTypes.SubscriptionContext memory sinContexto;
        engine.enforceSubscription(destination, assetId, amount, sinContexto);
    }

    // ------------------------------------------------------------- emisión

    /// @dev Se parte en dos codificaciones para no agotar la pila del EVM Paris.
    function hashAuthorization(SignedAuthorization calldata a) public pure returns (bytes32) {
        bytes memory head = abi.encode(
            AUTHORIZATION_TYPEHASH,
            a.schemaVersion,
            a.authorizationId,
            a.actionId,
            a.chainId,
            a.genesisHash,
            a.verifyingContract
        );
        bytes memory tail = abi.encode(
            a.assetId, a.amount, a.destination, a.policyVersion, a.evidenceRoot, a.nonce, a.notBefore, a.expiry
        );
        return keccak256(bytes.concat(head, tail));
    }

    function authorizationDigest(SignedAuthorization calldata a) public view returns (bytes32) {
        return _hashTypedData(hashAuthorization(a));
    }

    /// @notice Acuña contra una autorización firmada Y contra una orden de
    ///         gobierno ligada al contenido de ESTA acuñación concreta.
    /// @dev H01 aplicado a la emisión. El sobre firmado del §2.4 dice cuánto se
    ///      PUEDE acuñar como máximo y a dónde; el monto efectivo y el
    ///      identificador de operación eran, hasta ahora, parámetros libres del
    ///      emisor. Dicho de otro modo: una autorización de 1000 al destino D
    ///      dejaba al emisor elegir cuándo y en cuántos trozos, sin que nadie
    ///      aprobara cada trozo.
    ///      Ahora el monto efectivo es `p.amount` y el `operationId` es `p.nonce`:
    ///      los dos van dentro del digest que gobierno aprobó con doble control,
    ///      el ejecutor lo recalcula desde `p` y lo consume. Acuñar menos de lo
    ///      aprobado en el sobre sigue siendo posible —una acuñación parcial es
    ///      legítima— pero cada parcial necesita su propia orden.
    ///      v0.3 §5 · además, `p.evidenceRoot` es el hash del documento de
    ///      aprobación DBNX (ver `registerDbnxApproval`): sin él, o con otra
    ///      cantidad, fuera de vigencia o ya usado, `mint` revierte.
    /// @param p payload del §12.1 con los argumentos REALES de la acuñación.
    /// @param approvedDigest digest que gobierno aprobó.
    function mint(
        SignedAuthorization calldata a,
        bytes[] calldata signatures,
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest
    ) external onlyRole(ISSUER) nonReentrant {
        if (governance.isPaused()) revert Paused();
        _checkPayload(a, p);
        if (_usedOperationId[p.nonce]) revert OperationReplay(p.nonce);
        _usedOperationId[p.nonce] = true;

        // REV-410 · la etiqueta con la que gobierno APROBÓ el digest tiene que
        // ser MINT, igual que exigen setMintBudget y la bóveda. Sin esto, un
        // payload MINT propuesto con otra etiqueta (que es lo que ven los
        // firmantes en el registro) se ejecutaba como emisión.
        bytes32 label = governance.authorizationActionOf(approvedDigest);
        if (label != ACTION_MINT) revert AuthorizationActionMismatch(ACTION_MINT, label);
        if (!governance.isAuthorizationApproved(approvedDigest)) revert MintNotAuthorized(approvedDigest);
        // v0.3 §5 · verificación previa: el documento de aprobación DBNX va en
        // `p.evidenceRoot`, así que gobierno lo aprobó dentro del digest. Aquí
        // se exige la cantidad EXACTA y el destino EXACTO del documento.
        bool migration = _checkMintApproval(p);
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        _checkEnvelope(a);
        _checkApprovals(a, signatures);
        _applyCaps(a, p.amount);
        _executeMint(a, p.amount, p.nonce);
        // SFSP-120 §0.3 · acuñar a un tercero es colocar, salvo la continuidad
        // de tenencia de una migración que DBNX declaró como tal.
        if (!migration) _enforceSubscription(a.assetId, a.destination, p.amount);
    }

    function _checkMintApproval(SFSPAuthorization.Payload calldata p) internal returns (bool) {
        DbnxApproval storage d = _useDbnxApproval(p.evidenceRoot, p.assetId, p.nonce);
        if (d.amount != p.amount) revert DbnxApprovalAmountMismatch(d.amount, p.amount);
        bytes32 dest = bytes32(uint256(uint160(p.destination)));
        if (d.destination != dest) revert DbnxApprovalDestinationMismatch(d.destination, dest);
        return d.migration;
    }

    /// @dev El payload tiene que describir la MISMA acuñación que el sobre
    ///      firmado. Si no se comprobara, habría dos verdades a la vez: la que
    ///      firmaron los aprobadores del sobre y la que aprobó gobierno.
    function _checkPayload(SignedAuthorization calldata a, SFSPAuthorization.Payload calldata p) internal view {
        if (p.action != ACTION_MINT) revert AuthorizationActionMismatch(ACTION_MINT, p.action);
        if (p.assetId != a.assetId) revert PayloadDoesNotMatchEnvelope(bytes32("ASSET"));
        if (p.destination != a.destination) revert PayloadDoesNotMatchEnvelope(bytes32("DESTINATION"));
        // Acuñar no mueve unidades desde nadie: el origen es la dirección cero, y
        // ese cero también entra en el digest.
        if (p.origin != address(0)) revert PayloadDoesNotMatchEnvelope(bytes32("ORIGIN"));
        if (p.amount == 0) revert PayloadDoesNotMatchEnvelope(bytes32("AMOUNT_ZERO"));
        if (p.verifyingContract != address(this)) revert PayloadDoesNotMatchEnvelope(bytes32("CONTRACT"));
    }

    /// @dev Los tres topes, en orden, con sus efectos. Separado de `mint` para
    ///      mantener el marco de pila dentro de lo que admite el EVM de Paris.
    function _applyCaps(SignedAuthorization calldata a, uint256 amount) internal {
        // --- anti-replay primero: presentar dos veces el mismo sobre se reporta
        //     como replay, no como exceso de monto. EIP-712 no aporta el contador.
        if (_usedNonce[a.nonce]) revert NonceAlreadyUsed(a.nonce);
        _usedNonce[a.nonce] = true;

        // --- tope 1: por autorización, acumulado.
        uint256 minted = _mintedUnderAuth[a.authorizationId];
        if (minted + amount > a.amount) {
            revert AuthorizationAmountExceeded(a.authorizationId, minted, amount, a.amount);
        }

        // --- topes 2 (stock; el inventario de tesorería ya acuñado CUENTA) y
        //     3 (flujo acumulado; quemar NO lo reduce). Efectos incluidos.
        _applyInstrumentCaps(a.assetId, amount);
        _mintedUnderAuth[a.authorizationId] = minted + amount;
    }

    function _executeMint(SignedAuthorization calldata a, uint256 amount, bytes32 operationId) internal {
        _mintTo(a.assetId, a.destination, amount, operationId);
        emit MintExecuted(a.assetId, a.authorizationId, a.destination, amount, operationId, a.evidenceRoot);
    }

    /// @dev El sobre: dominio, acción y vigencia. Una autorización de otra cadena
    ///      o de otro contrato verificador no vale aquí.
    function _checkEnvelope(SignedAuthorization calldata a) internal view {
        if (a.chainId != block.chainid || a.verifyingContract != address(this)) {
            revert DomainMismatch(a.chainId, a.verifyingContract);
        }
        if (a.actionId != ACTION_MINT) revert WrongAction(a.actionId);
        if (block.timestamp < a.notBefore) revert AuthorizationNotYetValid(a.notBefore, block.timestamp);
        if (block.timestamp >= a.expiry) revert AuthorizationExpired(a.expiry, block.timestamp);
    }

    /// @dev Firmas ordenadas estrictamente por dirección: así una misma firma
    ///      repetida no puede contarse dos veces para alcanzar el quórum.
    function _checkApprovals(SignedAuthorization calldata a, bytes[] calldata signatures) internal view {
        bytes32 digest = _hashTypedData(hashAuthorization(a));
        address previous = address(0);
        uint256 valid;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recover(digest, signatures[i]);
            if (signer <= previous) revert SignersNotSorted();
            previous = signer;
            if (!governance.isSigner(signer)) revert SignerNotAuthorized(signer);
            valid++;
        }
        uint256 need = governance.quorumThreshold();
        if (valid < need) revert QuorumNotReached(valid, need);
    }
}
