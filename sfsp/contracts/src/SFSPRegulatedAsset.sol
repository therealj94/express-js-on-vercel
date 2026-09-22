// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPCodes} from "./lib/SFSPCodes.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {ISFSPAssetRegistry, ISFSPIdentityAdapter, ISFSPEligibilityEngine, ISFSPGovernanceController} from "./lib/ISFSP.sol";

/// @title Security emitido bajo reglas SFSP: emisión, tenencia, transferencia y retiro.
/// @notice Implementación propia. El ABI canónico es el SFSP; las funciones
///         ERC-20 son un ADAPTADOR DE INTEROPERABILIDAD DECLARADO que pasa por
///         EXACTAMENTE las mismas reglas. No hay ruta administrativa ni de
///         allowance que las omita: `transferFrom` reevalúa igual que `transferUnits`.
contract SFSPRegulatedAsset is SFSPAccessControl, SFSPReentrancyGuard {
    // §3 · BurnExecuted lo emite RegulatedAsset.
    event BurnExecuted(address indexed from, uint256 amount, bytes32 reasonCode, bytes32 operationId);
    // FALTA EN CONTRATO-INTERNO: el §3 sólo lista BurnExecuted para este emisor.
    // Los eventos siguientes son auxiliares de trazabilidad, no sustituyen a los del §3.
    event UnitsMinted(address indexed to, uint256 amount, bytes32 operationId);
    event UnitsTransferred(address indexed from, address indexed to, uint256 amount, bytes32 route);
    event AccountFrozen(address indexed account, bool frozen, bytes32 reasonCode);
    event ForcedTransferExecuted(address indexed from, address indexed to, uint256 amount, bytes32 operationId);
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
        (uint8 c1, bytes32 r1,) = engine.evaluate(subjFrom, assetId, bytes32("TRANSFER_OUT"), bytes32(amount));
        if (c1 != SFSPCodes.ALLOW) return (c1, r1);
        (uint8 c2, bytes32 r2,) = engine.evaluate(subjTo, assetId, bytes32("TRANSFER_IN"), bytes32(amount));
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
        (uint8 code, bytes32 reason,) = engine.evaluate(subjTo, assetId, bytes32("MINT"), bytes32(amount));
        if (code != SFSPCodes.ALLOW) revert TransferRejected(code, reason);

        _totalSupply += amount;
        _balances[to] += amount;
        emit UnitsMinted(to, amount, operationId);
        if (erc20InteropEnabled) emit Transfer(address(0), to, amount);
    }

    /// @dev Quemar exige motivo. Quemar NO devuelve capacidad de emisión: el
    ///      cap acumulado vive en el IssuanceController y no se reduce aquí.
    function burn(address from, uint256 amount, bytes32 reasonCode, bytes32 operationId)
        external
        onlyRole(ISSUER)
        nonReentrant
    {
        if (reasonCode == bytes32(0)) revert ReasonRequired();
        if (_usedOperationId[operationId]) revert TransferRejected(SFSPCodes.DENY_AUTHORIZATION, bytes32("OP_REPLAY"));
        _usedOperationId[operationId] = true;
        uint256 balance = _balances[from];
        if (balance < amount) revert InsufficientBalance(from, balance, amount);
        unchecked {
            _balances[from] = balance - amount;
        }
        _totalSupply -= amount;
        emit BurnExecuted(from, amount, reasonCode, operationId);
        if (erc20InteropEnabled) emit Transfer(from, address(0), amount);
    }

    /// @dev Emisión de migración: sólo el MigrationRegistry y sólo dentro del
    ///      alcance S0 que el propio registro concilia (§6.3). No pasa por el
    ///      cap de emisión ordinario porque no es emisión nueva: es la
    ///      contrapartida de derechos viejos ya excluidos de circulación.
    function mintForMigration(address to, uint256 amount, bytes32 migrationId) external nonReentrant {
        if (msg.sender != migrationRegistry) revert NotMigrationRegistry(msg.sender);
        if (to == address(0) || amount == 0) revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("MINT_ARGS"));
        if (governance.isPaused()) revert TransferRejected(SFSPCodes.DENY_ASSET_STATE, SFSPCodes.R_PAUSED);
        if (_frozen[to]) revert AccountIsFrozen(to);
        bytes32 subjTo = identity.subjectRefOf(to);
        (uint8 code, bytes32 reason,) = engine.evaluate(subjTo, assetId, bytes32("MIGRATION_CLAIM"), bytes32(amount));
        if (code != SFSPCodes.ALLOW) revert TransferRejected(code, reason);
        _totalSupply += amount;
        _balances[to] += amount;
        emit UnitsMinted(to, amount, migrationId);
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
        emit BurnExecuted(from, amount, bytes32("MIGRATION_SURRENDER"), migrationId);
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

    /// @dev Transferencia forzosa: exige capacidad declarada Y una aprobación de
    ///      gobierno con quórum que se consume. Sin autorización, revierte.
    function forcedTransfer(address from, address to, uint256 amount, bytes32 operationId)
        external
        onlyRole(TECH_OPS)
        nonReentrant
    {
        SFSPTypes.EnforcementScope memory scope = registry.enforcementOf(assetId);
        if (!scope.forcedTransfer) revert CapabilityNotDeclared(bytes32("FORCED_TRANSFER"));
        if (!governance.isActionApproved(operationId)) revert ForcedTransferNotAuthorized(operationId);
        if (!governance.consumeApprovedAction(operationId)) revert ForcedTransferNotAuthorized(operationId);
        if (to == address(0) || amount == 0) revert TransferRejected(SFSPCodes.DENY_POLICY, bytes32("FT_ARGS"));

        uint256 balance = _balances[from];
        if (balance < amount) revert InsufficientBalance(from, balance, amount);
        unchecked {
            _balances[from] = balance - amount;
        }
        _balances[to] += amount;
        emit ForcedTransferExecuted(from, to, amount, operationId);
        if (erc20InteropEnabled) emit Transfer(from, to, amount);
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
