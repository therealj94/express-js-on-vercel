// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPEIP712} from "./lib/SFSPEIP712.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {ISFSPGovernanceController, ISFSPRegulatedAsset} from "./lib/ISFSP.sol";

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
    ///      el documento vive fuera. Se gasta en la acuñación que lo usa.
    struct DbnxApproval {
        bytes32 assetId;
        uint256 amount;       // cantidad EXACTA aprobada
        uint64 validFrom;
        uint64 validUntil;    // exclusiva
        address signer;       // cuenta con rol DBNX que lo registró
        bool revoked;
        bytes32 usedBy;       // operationId de la acuñación que lo gastó; 0 = sin usar
    }

    event DbnxApprovalRecorded(
        bytes32 indexed docHash,
        bytes32 indexed assetId,
        address indexed signer,
        uint256 amount,
        uint64 validFrom,
        uint64 validUntil
    );
    event DbnxApprovalRevoked(bytes32 indexed docHash, address indexed by, bytes32 reasonCode);

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
    function registerDbnxApproval(
        bytes32 docHash,
        bytes32 assetId,
        uint256 amount,
        uint64 validFrom,
        uint64 validUntil
    ) external onlyRole(DBNX) {
        if (hasRole(ISSUER, msg.sender)) revert DbnxSeparationOfDuties(msg.sender);
        if (docHash == bytes32(0)) revert DbnxApprovalRequired();
        if (_dbnxApproval[docHash].signer != address(0)) revert DbnxApprovalExists(docHash);
        if (assetId == bytes32(0)) revert DbnxApprovalInvalid(bytes32("ASSET"));
        if (amount == 0) revert DbnxApprovalInvalid(bytes32("AMOUNT"));
        if (validUntil <= validFrom || validUntil <= block.timestamp) revert DbnxApprovalInvalid(bytes32("WINDOW"));
        _dbnxApproval[docHash] = DbnxApproval({
            assetId: assetId,
            amount: amount,
            validFrom: validFrom,
            validUntil: validUntil,
            signer: msg.sender,
            revoked: false,
            usedBy: bytes32(0)
        });
        emit DbnxApprovalRecorded(docHash, assetId, msg.sender, amount, validFrom, validUntil);
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

    /// @dev La verificación de FORMA previa a la acuñación (v0.3 §5): el hash
    ///      que va en la orden de gobierno (`p.evidenceRoot`) tiene que ser un
    ///      documento DBNX registrado, firmado por quien TODAVÍA tiene el rol,
    ///      no revocado, sin usar, vigente, del mismo activo y por la cantidad
    ///      EXACTA. Si algo falla, revierte; si todo cuadra, se gasta.
    function _useDbnxApproval(bytes32 docHash, bytes32 assetId, uint256 amount, bytes32 operationId) internal {
        if (docHash == bytes32(0)) revert DbnxApprovalRequired();
        DbnxApproval storage a = _dbnxApproval[docHash];
        if (a.signer == address(0)) revert DbnxApprovalUnknown(docHash);
        if (!hasRole(DBNX, a.signer)) revert DbnxApprovalSignerNotDbnx(a.signer);
        if (a.revoked) revert DbnxApprovalRevokedErr(docHash);
        if (a.usedBy != bytes32(0)) revert DbnxApprovalAlreadyUsed(docHash, a.usedBy);
        if (block.timestamp < a.validFrom || block.timestamp >= a.validUntil) {
            revert DbnxApprovalNotInForce(a.validFrom, a.validUntil, block.timestamp);
        }
        if (a.assetId != assetId) revert DbnxApprovalAssetMismatch(a.assetId, assetId);
        if (a.amount != amount) revert DbnxApprovalAmountMismatch(a.amount, amount);
        a.usedBy = operationId;
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

    // ------------------------------------------------ SFSP-410 · cupo de emisión

    bytes32 public constant ACTION_SET_MINT_BUDGET = bytes32("SET_MINT_BUDGET");
    bytes32 public constant BUDGET_TERMS_TAG = keccak256("SFSP.MINT_BUDGET.TERMS.v1");

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

    function mintBudgetOf(bytes32 assetId) external view returns (MintBudget memory) {
        return _budget[assetId];
    }

    /// @notice Lo que queda del cupo en el periodo en curso (0 si no hay cupo vigente).
    function budgetRemaining(bytes32 assetId) external view returns (uint256) {
        MintBudget memory b = _budget[assetId];
        if (b.period == 0 || block.timestamp >= b.validUntil) return 0;
        uint64 idx = uint64(block.timestamp / b.period);
        uint256 used = idx == b.periodIndex ? b.usedInPeriod : 0;
        return used >= b.perPeriod ? 0 : b.perPeriod - used;
    }

    /// @notice Huella de los términos del cupo que no caben en el payload común.
    /// @dev El payload del §12.1 tiene dos montos (`amount` = por periodo,
    ///      `amountSecondary` = máximo por operación). La duración del periodo, la
    ///      vigencia y el documento de respaldo van comprometidos en `evidenceRoot`
    ///      con esta huella, así que entran en el digest que gobierno aprueba.
    function budgetTermsRoot(uint64 period, uint64 validUntil, bytes32 termsDocRoot) public pure returns (bytes32) {
        return keccak256(abi.encode(BUDGET_TERMS_TAG, period, validUntil, termsDocRoot));
    }

    /// @notice Fija el cupo de un activo con doble control Y espera.
    /// @dev Cambiar un cupo es cambiar cuánto puede crear el sistema sin volver a
    ///      preguntar: se exige la acción SET_MINT_BUDGET, quórum, la espera del
    ///      timelock contada desde la propuesta, y el digest se gasta.
    function setMintBudget(
        SFSPAuthorization.Payload calldata p,
        bytes32 approvedDigest,
        uint64 period,
        uint64 validUntil,
        bytes32 termsDocRoot
    ) external nonReentrant {
        if (!hasRole(TECH_OPS, msg.sender) && !hasRole(DBNX_BOARD, msg.sender)) revert Unauthorized(TECH_OPS, msg.sender);
        if (p.action != ACTION_SET_MINT_BUDGET) revert AuthorizationActionMismatch(ACTION_SET_MINT_BUDGET, p.action);
        if (p.origin != address(0) || p.destination != address(0)) revert BudgetInvalid(bytes32("PARTIES"));
        if (p.amount == 0 || p.amountSecondary == 0 || p.amountSecondary > p.amount) revert BudgetInvalid(bytes32("AMOUNTS"));
        if (period == 0 || validUntil <= block.timestamp) revert BudgetInvalid(bytes32("WINDOW"));
        bytes32 terms = budgetTermsRoot(period, validUntil, termsDocRoot);
        if (p.evidenceRoot != terms) revert BudgetTermsMismatch(p.evidenceRoot, terms);
        if (!_limits[p.assetId].configured) revert LimitsNotFixed(p.assetId, SFSPCodes.BLOCKED_DECISION);

        if (governance.authorizationActionOf(approvedDigest) != ACTION_SET_MINT_BUDGET) {
            revert AuthorizationActionMismatch(ACTION_SET_MINT_BUDGET, governance.authorizationActionOf(approvedDigest));
        }
        if (!governance.isAuthorizationApproved(approvedDigest)) revert MintNotAuthorized(approvedDigest);
        uint64 readyAt = governance.authorizationProposedAt(approvedDigest) + governance.timelockDelay();
        if (block.timestamp < readyAt) revert BudgetWaitPending(approvedDigest, readyAt);

        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

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
        emit MintBudgetRevoked(assetId, msg.sender, reasonCode);
    }

    /// @notice Emisión bajo demanda: acuña al USUARIO exactamente lo que pagó.
    /// @param paymentRef hash del recibo del pago confirmado; es el operationId
    ///        y no se puede repetir.
    /// @param evidenceRoot raíz de la evidencia del pago (recibo, tx de USDT, etc.).
    function mintOnDemand(bytes32 assetId, address destination, uint256 amount, bytes32 paymentRef, bytes32 evidenceRoot)
        external
        onlyRole(ISSUER)
        nonReentrant
    {
        if (governance.isPaused()) revert Paused();
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

        _applyInstrumentCaps(assetId, amount);
        b.periodIndex = idx;
        b.usedInPeriod = used + amount;

        _mintTo(assetId, destination, amount, paymentRef);
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
    function _mintTo(bytes32 assetId, address destination, uint256 amount, bytes32 operationId) internal {
        if (_internalAccount[destination]) revert MintToInternalAccount(destination);
        address assetContract = _assetContract[assetId];
        require(assetContract != address(0), "SFSP: activo no registrado");
        bytes32 declared = ISFSPRegulatedAsset(assetContract).assetId();
        if (declared != assetId) revert AssetMismatch(assetId, declared);
        ISFSPRegulatedAsset(assetContract).mintFromIssuance(destination, amount, operationId);
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
        // `p.evidenceRoot`, así que gobierno lo aprobó dentro del digest.
        _useDbnxApproval(p.evidenceRoot, p.assetId, p.amount, p.nonce);
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        _checkEnvelope(a);
        _checkApprovals(a, signatures);
        _applyCaps(a, p.amount);
        _executeMint(a, p.amount, p.nonce);
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
