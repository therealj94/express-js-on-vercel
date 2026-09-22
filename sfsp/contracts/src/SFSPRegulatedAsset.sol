// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {SFSPAuthorization} from "./lib/SFSPAuthorization.sol";
import {ISFSPAssetRegistry, ISFSPIdentityAdapter, ISFSPEligibilityEngine, ISFSPGovernanceController} from "./lib/ISFSP.sol";

/// @title Security emitido bajo reglas SFSP: emisión, tenencia, transferencia y retiro.
/// @notice Implementación propia. El ABI canónico es el SFSP; las funciones
///         ERC-20 son un ADAPTADOR DE INTEROPERABILIDAD DECLARADO que pasa por
///         EXACTAMENTE las mismas reglas. No hay ruta administrativa ni de
///         allowance que las omita: `transferFrom` reevalúa igual que `transferUnits`.
contract SFSPRegulatedAsset is SFSPAccessControl, SFSPReentrancyGuard {
    // §3 · BurnExecuted lo emite RegulatedAsset. H15: lleva `assetId` indexado,
    // porque sin activo una quema no se puede atribuir y el indexador dejaba el
    // suministro inflado con apariencia de dato firme.
    event BurnExecuted(
        bytes32 indexed assetId, address indexed from, uint256 amount, bytes32 reasonCode, bytes32 operationId
    );
    // H15 · `UnitsMinted` se retiró. El hecho económico «se crearon unidades» lo
    // publica una sola vez `SFSPIssuanceController.MintExecuted`, que lleva activo
    // y autorización. Dos nombres para el mismo hecho hacen imposible contar una
    // sola vez. El nombre queda como alias retirado en `spec/eventos.json`.
    event UnitsTransferred(address indexed from, address indexed to, uint256 amount, bytes32 route);
    event AccountFrozen(address indexed account, bool frozen, bytes32 reasonCode);
    event ForcedTransferExecuted(address indexed from, address indexed to, uint256 amount, bytes32 operationId);
    /// @dev H02 · el titular consiente una quema concreta, identificada por su
    ///      digest: activo, titular, monto y motivo van dentro del digest.
    event BurnConsentGiven(bytes32 indexed digest, address indexed holder);
    event InteropAdapterDeclared(string profile, bool erc20Compatible);
    // Adaptador ERC-20 declarado: se emiten los logs esperados por herramientas externas.
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error TransferRejected(uint8 code, bytes32 reasonCode);
    error InsufficientBalance(address account, uint256 have, uint256 need);
    error AccountIsFrozen(address account);
    error NotIssuanceController(address caller);
    error NotSettlementEngine(address caller);
    error NotMigrationRegistry(address caller);
    error ForcedTransferNotAuthorized(bytes32 operationId);
    error BurnNotAuthorized(bytes32 digest, address holder);
    error AuthorizationActionMismatch(bytes32 expected, bytes32 got);
    error AuthorizationAssetMismatch(bytes32 expected, bytes32 got);
    error CapabilityNotDeclared(bytes32 capability);
    error ReasonRequired();
    error AllowanceExceeded(uint256 have, uint256 need);

    bytes32 public immutable assetId;
    ISFSPAssetRegistry public immutable registry;
    ISFSPEligibilityEngine public immutable engine;
    ISFSPIdentityAdapter public immutable identity;
    ISFSPGovernanceController public immutable governance;

    /// @dev Se declara explícitamente: no se afirma "no ERC-20" por marketing.
    bool public immutable erc20InteropEnabled;
    string public constant INTEROP_PROFILE = "SFSP_CANONICAL+ERC20_ADAPTER_ENFORCED";

    address public issuanceController;
    address public settlementEngine;
    address public migrationRegistry;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => bool) private _frozen;
    mapping(address => mapping(address => uint256)) private _allowance;
    mapping(bytes32 => bool) private _usedOperationId;
    // H02 · digest de quema => titular que lo consintió. El digest compromete
    // activo, titular, monto y motivo; consentir uno no consiente ningún otro.
    mapping(bytes32 => address) private _burnConsent;

    constructor(
        address board,
        bytes32 assetId_,
        address registry_,
        address engine_,
        address identity_,
        address governance_,
        bool erc20InteropEnabled_
    ) SFSPAccessControl(board) {
        require(assetId_ != bytes32(0), "SFSP: assetId=0");
        assetId = assetId_;
        registry = ISFSPAssetRegistry(registry_);
        engine = ISFSPEligibilityEngine(engine_);
        identity = ISFSPIdentityAdapter(identity_);
        governance = ISFSPGovernanceController(governance_);
        erc20InteropEnabled = erc20InteropEnabled_;
        emit InteropAdapterDeclared(INTEROP_PROFILE, erc20InteropEnabled_);
    }

    // ------------------------------------------------------------- cableado

    function setIssuanceController(address c) external onlyRole(DBNX_BOARD) {
        issuanceController = c;
    }

    function setSettlementEngine(address c) external onlyRole(DBNX_BOARD) {
        settlementEngine = c;
    }

    function setMigrationRegistry(address c) external onlyRole(DBNX_BOARD) {
        migrationRegistry = c;
    }

    // ------------------------------------------------------------- lecturas

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function isFrozen(address account) external view returns (bool) {
        return _frozen[account];
    }

    /// @dev decimals viene del pasaporte. Si es desconocido, revierte en vez de
    ///      devolver 18: un 18 inventado produce importes falsos (§5).
    function decimals() external view returns (uint8) {
        (bool known, uint8 value) = registry.decimalsOf(assetId);
        if (!known) revert TransferRejected(SFSPCodes.UNKNOWN_SOURCE, SFSPCodes.R_DECIMALS_UNKNOWN);
        return value;
    }

    /// @notice Simulación de vista de la regla de transferencia, para la interfaz.
    function checkTransfer(address from, address to, uint256 amount)
        public
        view
        returns (uint8 code, bytes32 reasonCode)
    {
        if (governance.isPaused()) return (SFSPCodes.DENY_ASSET_STATE, SFSPCodes.R_PAUSED);
        if (_frozen[from] || _frozen[to]) return (SFSPCodes.DENY_ASSET_STATE, SFSPCodes.R_FROZEN);
        if (_balances[from] < amount) return (SFSPCodes.DENY_LIMIT, SFSPCodes.R_LIMIT);

        SFSPTypes.Lifecycle memory lc = registry.lifecycleOf(assetId);
        if (lc.transferability == SFSPTypes.Transferability.FROZEN) {
            return (SFSPCodes.DENY_ASSET_STATE, SFSPCodes.R_ASSET_STATE);
        }

        bytes32 subjFrom = identity.subjectRefOf(from);
        bytes32 subjTo = identity.subjectRefOf(to);
        // H06 · el monto va como monto y el contexto de autorización va aparte.
        // Antes los dos eran la misma palabra `bytes32(amount)`, de forma que dos
        // operaciones distintas del mismo monto compartían autorización.
        (uint8 c1, bytes32 r1,) =
            engine.evaluateOperation(subjFrom, assetId, bytes32("TRANSFER_OUT"), amount, bytes32(0));
        if (c1 != SFSPCodes.ALLOW) return (c1, r1);
        (uint8 c2, bytes32 r2,) =
            engine.evaluateOperation(subjTo, assetId, bytes32("TRANSFER_IN"), amount, bytes32(0));
        if (c2 != SFSPCodes.ALLOW) return (c2, r2);
        return (SFSPCodes.ALLOW, SFSPCodes.R_OK);
    }

    // ------------------------------------------------------------- ruta canónica

    /// @notice Transferencia canónica SFSP. Toda otra ruta termina aquí.
    function transferUnits(address to, uint256 amount) external nonReentrant returns (bool) {
        _transferEnforced(msg.sender, to, amount, bytes32("CANONICAL"));
        return true;
    }

    /// @dev Punto único de imposición. checks-effects: se valida, se ajustan
    ///      saldos y sólo después se emiten eventos; no hay llamada externa
    ///      posterior que pueda reentrar sobre un estado a medias.
    function _transferEnforced(address from, address to, uint256 amount, bytes32 route) internal {
        if (to == address(0)) revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("DESTINATION_ZERO"));
        if (amount == 0) revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("AMOUNT_ZERO"));
        (uint8 code, bytes32 reason) = checkTransfer(from, to, amount);
        if (code != SFSPCodes.ALLOW) revert TransferRejected(code, reason);

        uint256 balance = _balances[from];
        if (balance < amount) revert InsufficientBalance(from, balance, amount);
        unchecked {
            _balances[from] = balance - amount;
        }
        _balances[to] += amount;

        emit UnitsTransferred(from, to, amount, route);
        if (erc20InteropEnabled) emit Transfer(from, to, amount);
    }

    // ------------------------------------------------------------- emisión y retiro

    /// @dev Sólo el IssuanceController acuña. Ninguna cuenta con rol puede
    ///      saltarse la autorización firmada llamando aquí directamente.
    function mintFromIssuance(address to, uint256 amount, bytes32 operationId) external nonReentrant {
        if (msg.sender != issuanceController) revert NotIssuanceController(msg.sender);
        if (to == address(0) || amount == 0) revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("MINT_ARGS"));
        if (_usedOperationId[operationId]) revert TransferRejected(SFSPCodes.DENY_AUTHORIZATION, bytes32("OP_REPLAY"));
        _usedOperationId[operationId] = true;
        if (governance.isPaused()) revert TransferRejected(SFSPCodes.DENY_ASSET_STATE, SFSPCodes.R_PAUSED);
        if (_frozen[to]) revert AccountIsFrozen(to);

        // El destino también se evalúa: emitir a una cuenta no elegible es emitir mal.
        bytes32 subjTo = identity.subjectRefOf(to);
        (uint8 code, bytes32 reason,) =
            engine.evaluateOperation(subjTo, assetId, bytes32("MINT"), amount, bytes32(0));
        if (code != SFSPCodes.ALLOW) revert TransferRejected(code, reason);

        _totalSupply += amount;
        _balances[to] += amount;
        // H15 · aquí no se publica ningún evento de suministro: el canónico es
        // `MintExecuted`, que emite el controlador de emisión con el activo y la
        // autorización consumida. El `Transfer` de abajo es del adaptador ERC-20.
        if (erc20InteropEnabled) emit Transfer(address(0), to, amount);
    }

    /// @notice El titular consiente UNA quema concreta, identificada por su digest.
    /// @dev H02 · alternativa de un solo paso a la decisión de gobierno. El digest
    ///      compromete activo, titular, monto, motivo y ventana, así que consentir
    ///      una quema de 10 no consiente una de 1000, ni la de otro titular.
    ///      Sólo el propio titular puede consentir: no hay forma de que el emisor
    ///      se conceda el consentimiento de nadie.
    function approveBurnAuthorization(bytes32 digest) external {
        if (digest == bytes32(0)) revert BurnNotAuthorized(digest, msg.sender);
        _burnConsent[digest] = msg.sender;
        emit BurnConsentGiven(digest, msg.sender);
    }

    function burnConsentOf(bytes32 digest) external view returns (address) {
        return _burnConsent[digest];
    }

    /// @notice Quema el saldo de `p.origin`, con motivo y con autorización.
    /// @dev H02. Antes bastaba el rol ISSUER, un motivo cualquiera y un
    ///      `operationId` sin usar: el emisor podía quemar el saldo de CUALQUIER
    ///      titular, porque nada en esa comprobación decía de quién era el saldo.
    ///      Ahora hacen falta las dos cosas del §12.5:
    ///        · el rol ISSUER para EJECUTAR, que es separación de funciones; y
    ///        · una autorización que comprometa activo, titular, monto y motivo,
    ///          o bien del titular (`approveBurnAuthorization`) o bien de
    ///          gobierno con doble control.
    ///      El digest se recalcula aquí desde los argumentos reales y se consume,
    ///      así que no vale para una segunda quema ni para otro titular.
    ///      Quemar NO devuelve capacidad de emisión: el cap acumulado vive en el
    ///      IssuanceController y no se reduce aquí.
    function burn(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest) external onlyRole(ISSUER) nonReentrant {
        if (p.action != bytes32("BURN")) revert AuthorizationActionMismatch(bytes32("BURN"), p.action);
        if (p.assetId != assetId) revert AuthorizationAssetMismatch(assetId, p.assetId);
        // El motivo viaja en `evidenceRoot` y es obligatorio: una quema sin motivo
        // no es auditable, y al ir dentro del digest ya no se puede cambiar después.
        if (p.evidenceRoot == bytes32(0)) revert ReasonRequired();
        if (p.amount == 0) revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("AMOUNT_ZERO"));
        // Una quema no tiene destino. Exigirlo en cero impide que un mismo digest
        // se reinterprete como una transferencia hacia alguien.
        if (p.destination != address(0)) revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("BURN_HAS_DEST"));

        bool porTitular = _burnConsent[approvedDigest] == p.origin && p.origin != address(0);
        bool porGobierno = governance.isAuthorizationApproved(approvedDigest);
        if (!porTitular && !porGobierno) revert BurnNotAuthorized(approvedDigest, p.origin);

        // Recálculo del digest desde los argumentos REALES, atadura, vigencia y
        // consumo único, antes de tocar ningún saldo.
        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        if (porGobierno) governance.consumeAuthorization(approvedDigest);

        uint256 balance = _balances[p.origin];
        if (balance < p.amount) revert InsufficientBalance(p.origin, balance, p.amount);
        unchecked {
            _balances[p.origin] = balance - p.amount;
        }
        _totalSupply -= p.amount;
        emit BurnExecuted(assetId, p.origin, p.amount, p.evidenceRoot, p.nonce);
        if (erc20InteropEnabled) emit Transfer(p.origin, address(0), p.amount);
    }

    /// @dev Emisión de migración: sólo el MigrationRegistry y sólo dentro del
    ///      alcance S0 que el propio registro concilia (§6.3). No pasa por el
    ///      cap de emisión ordinario porque no es emisión nueva: es la
    ///      contrapartida de derechos viejos ya excluidos de circulación.
    function mintForMigration(address to, uint256 amount, bytes32 /*migrationId*/ ) external nonReentrant {
        if (msg.sender != migrationRegistry) revert NotMigrationRegistry(msg.sender);
        if (to == address(0) || amount == 0) revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("MINT_ARGS"));
        if (governance.isPaused()) revert TransferRejected(SFSPCodes.DENY_ASSET_STATE, SFSPCodes.R_PAUSED);
        if (_frozen[to]) revert AccountIsFrozen(to);
        bytes32 subjTo = identity.subjectRefOf(to);
        (uint8 code, bytes32 reason,) =
            engine.evaluateOperation(subjTo, assetId, bytes32("MIGRATION_CLAIM"), amount, bytes32(0));
        if (code != SFSPCodes.ALLOW) revert TransferRejected(code, reason);
        _totalSupply += amount;
        _balances[to] += amount;
        // H15 · el hecho lo publica `MigrationClaimed`, con los dos activos.
        if (erc20InteropEnabled) emit Transfer(address(0), to, amount);
    }

    /// @dev Quema para migración: sólo el MigrationRegistry, en el modo
    ///      SURRENDER_ON_CLAIM, y en la misma operación que habilita el derecho nuevo.
    function burnForMigration(address from, uint256 amount, bytes32 migrationId) external nonReentrant {
        if (msg.sender != migrationRegistry) revert NotMigrationRegistry(msg.sender);
        uint256 balance = _balances[from];
        if (balance < amount) revert InsufficientBalance(from, balance, amount);
        unchecked {
            _balances[from] = balance - amount;
        }
        _totalSupply -= amount;
        emit BurnExecuted(assetId, from, amount, bytes32("MIGRATION_SURRENDER"), migrationId);
        if (erc20InteropEnabled) emit Transfer(from, address(0), amount);
    }

    // ------------------------------------------------------------- poderes declarados

    /// @dev Congelar sólo si el pasaporte declara esa capacidad: un poder no
    ///      declarado no puede ejercerse aunque exista el código.
    function setFrozen(address account, bool frozen_, bytes32 reasonCode) external onlyRole(TECH_OPS) {
        SFSPTypes.EnforcementScope memory scope = registry.enforcementOf(assetId);
        if (!scope.freeze) revert CapabilityNotDeclared(bytes32("FREEZE"));
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        _frozen[account] = frozen_;
        emit AccountFrozen(account, frozen_, reasonCode);
    }

    /// @notice Transferencia forzosa, atada al contenido exacto que se aprobó.
    /// @dev H01 y H06. Antes esto comprobaba `governance.isActionApproved(operationId)`
    ///      y nada más: el `operationId` lo elige el llamador y no dice NADA de
    ///      qué se va a hacer, así que una aprobación legítima servía para
    ///      cualquier origen, cualquier destino y cualquier monto. El aprobador
    ///      humano miraba un expediente y el ejecutor podía mover otra cosa.
    ///      Ahora el ejecutor recalcula el digest desde `p`, que son los
    ///      argumentos reales de la transferencia, comprueba que ese digest —y no
    ///      otro— está aprobado con doble control, y lo consume. Una aprobación
    ///      que difiera en un solo campo no ejecuta nada.
    function forcedTransfer(SFSPAuthorization.Payload calldata p, bytes32 approvedDigest)
        external
        onlyRole(TECH_OPS)
        nonReentrant
    {
        SFSPTypes.EnforcementScope memory scope = registry.enforcementOf(assetId);
        if (!scope.forcedTransfer) revert CapabilityNotDeclared(bytes32("FORCED_TRANSFER"));
        if (p.action != bytes32("FORCED_TRANSFER")) {
            revert AuthorizationActionMismatch(bytes32("FORCED_TRANSFER"), p.action);
        }
        if (p.assetId != assetId) revert AuthorizationAssetMismatch(assetId, p.assetId);
        if (p.destination == address(0) || p.amount == 0) {
            revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("FT_ARGS"));
        }
        if (!governance.isAuthorizationApproved(approvedDigest)) {
            revert ForcedTransferNotAuthorized(approvedDigest);
        }

        SFSPAuthorization.Payload memory m = p;
        SFSPAuthorization.authorize(m, approvedDigest);
        governance.consumeAuthorization(approvedDigest);

        uint256 balance = _balances[p.origin];
        if (balance < p.amount) revert InsufficientBalance(p.origin, balance, p.amount);
        unchecked {
            _balances[p.origin] = balance - p.amount;
        }
        _balances[p.destination] += p.amount;
        emit ForcedTransferExecuted(p.origin, p.destination, p.amount, p.nonce);
        if (erc20InteropEnabled) emit Transfer(p.origin, p.destination, p.amount);
    }

    /// @dev Ruta de liquidación: la usa sólo el SettlementEngine y pasa por la
    ///      MISMA imposición. No es un atajo administrativo.
    function settlementTransfer(address from, address to, uint256 amount, bytes32 operationId) external {
        if (msg.sender != settlementEngine) revert NotSettlementEngine(msg.sender);
        if (_usedOperationId[operationId]) revert TransferRejected(SFSPCodes.DENY_AUTHORIZATION, bytes32("OP_REPLAY"));
        _usedOperationId[operationId] = true;
        _transferEnforced(from, to, amount, bytes32("SETTLEMENT"));
    }

    // ------------------------------------------------------------- adaptador ERC-20

    function _requireInterop() internal view {
        if (!erc20InteropEnabled) revert CapabilityNotDeclared(bytes32("ERC20_ADAPTER"));
    }

    /// @dev Adaptador: idéntica imposición que la ruta canónica.
    function transfer(address to, uint256 amount) external nonReentrant returns (bool) {
        _requireInterop();
        _transferEnforced(msg.sender, to, amount, bytes32("ERC20_ADAPTER"));
        return true;
    }

    /// @dev Una allowance NO es una autorización de política: aprobar no permite
    ///      nada que `transferUnits` no permitiera.
    function approve(address spender, uint256 amount) external returns (bool) {
        _requireInterop();
        _allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowance[owner][spender];
    }

    function transferFrom(address from, address to, uint256 amount) external nonReentrant returns (bool) {
        _requireInterop();
        uint256 current = _allowance[from][msg.sender];
        if (current < amount) revert AllowanceExceeded(current, amount);
        unchecked {
            _allowance[from][msg.sender] = current - amount;
        }
        // La allowance se descuenta antes, pero la regla sigue mandando: si la
        // política deniega, revierte toda la transacción y la allowance no baja.
        _transferEnforced(from, to, amount, bytes32("ERC20_ADAPTER"));
        return true;
    }
}
