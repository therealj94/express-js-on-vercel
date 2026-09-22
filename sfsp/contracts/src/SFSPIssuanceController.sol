// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPEIP712} from "./lib/SFSPEIP712.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
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
    mapping(bytes32 => uint256) private _reserveAmount;        // reserveId => monto
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

    // ------------------------------------------------------------- reservas concurrentes

    /// @dev Una reserva es capacidad comprometida todavía no acuñada. Cuenta en
    ///      el tope de stock para que dos emisiones en vuelo no lo superen juntas.
    function openIssuanceReserve(bytes32 assetId, bytes32 reserveId, uint256 amount) external onlyRole(ISSUER) {
        require(_reserveAmount[reserveId] == 0 && amount > 0, "SFSP: reserva invalida");
        InstrumentLimits memory lim = _limits[assetId];
        if (!lim.configured) revert LimitsNotFixed(assetId, SFSPCodes.BLOCKED_DECISION);
        uint256 outstanding = _outstanding(assetId);
        uint256 reserved = _reservedIssuance[assetId];
        if (outstanding + reserved + amount > lim.outstandingLimit) {
            revert OutstandingLimitExceeded(outstanding, reserved, amount, lim.outstandingLimit);
        }
        _reserveAmount[reserveId] = amount;
        _reservedIssuance[assetId] = reserved + amount;
        emit IssuanceReserveOpened(assetId, reserveId, amount);
    }

    function closeIssuanceReserve(bytes32 assetId, bytes32 reserveId, bytes32 reasonCode) external onlyRole(ISSUER) {
        uint256 amount = _reserveAmount[reserveId];
        require(amount > 0 && reasonCode != bytes32(0), "SFSP: reserva/motivo invalido");
        _reserveAmount[reserveId] = 0;
        _reservedIssuance[assetId] -= amount;
        emit IssuanceReserveClosed(assetId, reserveId, amount, reasonCode);
    }

    /// @dev El outstanding se lee del propio contrato del activo: el inventario
    ///      de tesorería ya acuñado CUENTA. Depositarlo en tesorería no lo
    ///      convierte en "no emitido".
    function _outstanding(bytes32 assetId) internal view returns (uint256) {
        address a = _assetContract[assetId];
        if (a == address(0)) return 0;
        return ISFSPRegulatedAsset(a).totalSupply();
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

    /// @notice Acuña contra una autorización firmada concreta.
    /// @param amount permite acuñar menos de lo aprobado, nunca más.
    function mint(
        SignedAuthorization calldata a,
        bytes[] calldata signatures,
        uint256 amount,
        bytes32 operationId
    ) external onlyRole(ISSUER) nonReentrant {
        if (governance.isPaused()) revert Paused();
        if (_usedOperationId[operationId]) revert OperationReplay(operationId);
        _usedOperationId[operationId] = true;

        _checkEnvelope(a);
        _checkApprovals(a, signatures);
        _applyCaps(a, amount);
        _executeMint(a, amount, operationId);
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

        InstrumentLimits memory lim = _limits[a.assetId];
        if (!lim.configured) revert LimitsNotFixed(a.assetId, SFSPCodes.BLOCKED_DECISION);

        // --- tope 2: stock. El inventario de tesorería ya acuñado CUENTA aquí.
        uint256 outstanding = _outstanding(a.assetId);
        uint256 reserved = _reservedIssuance[a.assetId];
        if (outstanding + reserved + amount > lim.outstandingLimit) {
            revert OutstandingLimitExceeded(outstanding, reserved, amount, lim.outstandingLimit);
        }

        // --- tope 3: flujo acumulado. Quemar NO lo reduce: quemar no renueva
        //     una autorización ni devuelve capacidad de emisión.
        uint256 issued = _cumulativeIssued[a.assetId];
        if (issued + amount > lim.cumulativeCap) {
            revert CumulativeIssuanceCapExceeded(issued, amount, lim.cumulativeCap);
        }

        // Efectos antes de la interacción (checks-effects-interactions).
        _mintedUnderAuth[a.authorizationId] = minted + amount;
        _cumulativeIssued[a.assetId] = issued + amount;
    }

    function _executeMint(SignedAuthorization calldata a, uint256 amount, bytes32 operationId) internal {
        address assetContract = _assetContract[a.assetId];
        require(assetContract != address(0), "SFSP: activo no registrado");
        bytes32 declared = ISFSPRegulatedAsset(assetContract).assetId();
        if (declared != a.assetId) revert AssetMismatch(a.assetId, declared);
        ISFSPRegulatedAsset(assetContract).mintFromIssuance(a.destination, amount, operationId);
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
