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

        if (!governance.isAuthorizationApproved(approvedDigest)) revert MintNotAuthorized(approvedDigest);
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
