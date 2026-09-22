// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {SFSPAccessControl} from "./lib/SFSPAccessControl.sol";
import {SFSPEIP712} from "./lib/SFSPEIP712.sol";
import {SFSPReentrancyGuard} from "./lib/SFSPReentrancyGuard.sol";
import {SFSPTypes} from "./lib/SFSPTypes.sol";
import {ISFSPAssetRegistry} from "./lib/ISFSP.sol";

interface IMigratableAsset {
    function assetId() external view returns (bytes32);
    function balanceOf(address account) external view returns (uint256);
    function burnForMigration(address from, uint256 amount, bytes32 migrationId) external;
    function mintForMigration(address to, uint256 amount, bytes32 migrationId) external;
}

/// @title Registro de migraciones (P9b) con conciliación S0 = A + N + P (§6.3).
/// @notice Dos modos implementados:
///         FROZEN_SNAPSHOT   — el activo viejo está congelado de forma efectiva
///                             antes de habilitar claims; no se entrega nada.
///         SURRENDER_ON_CLAIM— el poseedor actual quema sus tokens válidos en la
///                             MISMA operación que habilita el derecho nuevo.
/// @dev EIP-712 NO aporta anti-replay: el nullifier es un contador aparte.
contract SFSPMigrationRegistry is SFSPAccessControl, SFSPEIP712, SFSPReentrancyGuard {
    enum Mode { FROZEN_SNAPSHOT, SURRENDER_ON_CLAIM }

    // La firma incluye red origen/destino, registry, migrationId, beneficiario,
    // ratio, nonce y vencimiento, como exige P9b.
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "MigrationClaim(bytes32 migrationId,address beneficiary,uint256 oldUnits,uint256 ratioNum,uint256 ratioDen,uint256 sourceChainId,uint256 targetChainId,address registry,bytes32 nonce,uint64 expiry)"
    );

    // §3 · MigrationClaimed lo emite MigrationRegistry.
    event MigrationClaimed(
        bytes32 indexed migrationId,
        address indexed beneficiary,
        uint256 oldUnits,
        uint256 newUnits,
        uint256 residualNumerator,
        bytes32 nullifier
    );
    event MigrationOpened(bytes32 indexed migrationId, uint8 mode, bytes32 merkleRoot, uint256 s0);
    event MigrationClosed(bytes32 indexed migrationId, bytes32 reasonCode);
    event ResidualEntitlementRecorded(bytes32 indexed migrationId, address indexed beneficiary, uint256 residualNumerator, uint256 denominator);

    error UnknownMigration(bytes32 migrationId);
    error MigrationNotOpen(bytes32 migrationId);
    error NullifierUsed(bytes32 nullifier);
    error NonceUsed(bytes32 nonce);
    error BadProof();
    error ClaimExpired(uint64 expiry);
    error NotAttestor(address signer);
    error OldAssetNotFrozen(bytes32 oldAssetId);
    error SurrenderRequired();
    error RatioInvalid(uint256 num, uint256 den);
    error ScopeExceeded(uint256 excluded, uint256 s0);
    error DomainMismatch();

    struct Migration {
        Mode mode;
        bytes32 oldAssetId;
        bytes32 newAssetId;
        address oldAsset;
        address newAsset;
        bytes32 merkleRoot;
        uint256 ratioNum;
        uint256 ratioDen;
        uint64 expiry;
        bool open;
        // Conciliación en unidades escaladas por ratioNum, para que E = N + P sea exacto.
        uint256 s0Scaled;
        uint256 excludedScaled; // E
        uint256 newScaled;      // N
        uint256 pendingScaled;  // P
    }

    struct ClaimInput {
        bytes32 migrationId;
        address beneficiary;
        uint256 oldUnits;
        bytes32 nonce;
        uint64 expiry;
    }

    ISFSPAssetRegistry public immutable registry;

    mapping(bytes32 => Migration) private _migrations;
    mapping(bytes32 => bool) private _nullifierUsed;   // anti-replay del derecho
    mapping(bytes32 => bool) private _nonceUsed;       // anti-replay de la firma
    // FALTA EN CONTRATO-INTERNO: el §5 exige "registro de fracciones" sin fijar
    // su forma. Se implementa como numerador residual sobre ratioDen.
    mapping(bytes32 => mapping(address => uint256)) private _residual;

    constructor(address board, address registry_)
        SFSPAccessControl(board)
        SFSPEIP712("SFSPMigrationRegistry", "draft-0.3")
    {
        require(registry_ != address(0), "SFSP: registry=0");
        registry = ISFSPAssetRegistry(registry_);
    }

    // ------------------------------------------------------------- apertura

    function openMigration(
        bytes32 migrationId,
        Mode mode,
        address oldAsset,
        address newAsset,
        bytes32 merkleRoot,
        uint256 ratioNum,
        uint256 ratioDen,
        uint64 expiry,
        uint256 s0
    ) external onlyRole(DBNX_BOARD) {
        require(migrationId != bytes32(0) && merkleRoot != bytes32(0), "SFSP: migracion invalida");
        require(_migrations[migrationId].ratioDen == 0, "SFSP: migracion existente");
        if (ratioNum == 0 || ratioDen == 0) revert RatioInvalid(ratioNum, ratioDen);
        require(oldAsset != address(0) && newAsset != address(0), "SFSP: activos=0");

        _migrations[migrationId] = Migration({
            mode: mode,
            oldAssetId: IMigratableAsset(oldAsset).assetId(),
            newAssetId: IMigratableAsset(newAsset).assetId(),
            oldAsset: oldAsset,
            newAsset: newAsset,
            merkleRoot: merkleRoot,
            ratioNum: ratioNum,
            ratioDen: ratioDen,
            expiry: expiry,
            open: true,
            s0Scaled: s0 * ratioNum,
            excludedScaled: 0,
            newScaled: 0,
            pendingScaled: 0
        });
        emit MigrationOpened(migrationId, uint8(mode), merkleRoot, s0);
    }

    /// @dev Cerrar no extingue derechos: sólo detiene la ventana de claims. No hay
    ///      pérdida de derecho por no reclamar a tiempo; la continuidad se
    ///      gestiona fuera de cadena con activos no reclamados segregados.
    function closeMigration(bytes32 migrationId, bytes32 reasonCode) external onlyRole(DBNX_BOARD) {
        Migration storage m = _migrations[migrationId];
        if (m.ratioDen == 0) revert UnknownMigration(migrationId);
        require(reasonCode != bytes32(0), "SFSP: motivo requerido");
        m.open = false;
        emit MigrationClosed(migrationId, reasonCode);
    }

    // ------------------------------------------------------------- lecturas

    function migrationOf(bytes32 migrationId) external view returns (Migration memory) {
        return _migrations[migrationId];
    }

    function residualOf(bytes32 migrationId, address beneficiary) external view returns (uint256 numerator, uint256 denominator) {
        return (_residual[migrationId][beneficiary], _migrations[migrationId].ratioDen);
    }

    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return _nullifierUsed[nullifier];
    }

    /// @notice Conciliación del §6.3, en unidades escaladas por ratioNum.
    /// @dev E es CONTRAPARTE de N + P, no un tercer sumando de S0.
    function reconcile(bytes32 migrationId)
        external
        view
        returns (uint256 s0, uint256 a, uint256 e, uint256 n, uint256 p, bool ok)
    {
        Migration storage m = _migrations[migrationId];
        s0 = m.s0Scaled;
        e = m.excludedScaled;
        n = m.newScaled;
        p = m.pendingScaled;
        a = s0 - e;
        ok = (s0 == a + n + p) && (e == n + p);
    }

    function leafOf(bytes32 migrationId, address beneficiary, uint256 oldUnits) public pure returns (bytes32) {
        return keccak256(abi.encode(migrationId, beneficiary, oldUnits));
    }

    function nullifierOf(bytes32 migrationId, address beneficiary, uint256 oldUnits) public pure returns (bytes32) {
        return keccak256(abi.encode("SFSP.NULLIFIER", migrationId, beneficiary, oldUnits));
    }

    function hashClaim(ClaimInput calldata c) public view returns (bytes32) {
        Migration storage m = _migrations[c.migrationId];
        return _hashTypedData(
            keccak256(
                abi.encode(
                    CLAIM_TYPEHASH,
                    c.migrationId,
                    c.beneficiary,
                    c.oldUnits,
                    m.ratioNum,
                    m.ratioDen,
                    block.chainid,
                    block.chainid,
                    address(this),
                    c.nonce,
                    c.expiry
                )
            )
        );
    }

    // ------------------------------------------------------------- claim

    function claim(ClaimInput calldata c, bytes32[] calldata proof, bytes calldata signature) external nonReentrant {
        Migration storage m = _migrations[c.migrationId];
        if (m.ratioDen == 0) revert UnknownMigration(c.migrationId);
        if (!m.open) revert MigrationNotOpen(c.migrationId);
        if (block.timestamp >= c.expiry) revert ClaimExpired(c.expiry);

        // 1. Firma del atestador autorizado sobre el payload completo.
        address signer = _recover(hashClaim(c), signature);
        if (!hasRole(ATTESTOR, signer)) revert NotAttestor(signer);

        // 2. Anti-replay de la FIRMA (nonce) ...
        if (_nonceUsed[c.nonce]) revert NonceUsed(c.nonce);
        _nonceUsed[c.nonce] = true;

        // 3. ... y anti-replay del DERECHO (nullifier), que es independiente:
        //    otra firma válida del mismo derecho tampoco puede cobrarlo dos veces.
        bytes32 nullifier = nullifierOf(c.migrationId, c.beneficiary, c.oldUnits);
        if (_nullifierUsed[nullifier]) revert NullifierUsed(nullifier);
        _nullifierUsed[nullifier] = true;

        // 4. Prueba de pertenencia al árbol de entitlements.
        if (!_verifyProof(proof, m.merkleRoot, leafOf(c.migrationId, c.beneficiary, c.oldUnits))) revert BadProof();

        // 5. Exclusión del derecho viejo, según el modo.
        _excludeOldRight(m, c);

        // 6. Ratio con regla de restos: el resto NO se trunca en silencio.
        uint256 scaled = c.oldUnits * m.ratioNum;
        uint256 newUnits = scaled / m.ratioDen;
        uint256 residual = scaled % m.ratioDen;

        // 7. Conciliación S0 = A + N + P, en unidades escaladas.
        uint256 excluded = m.excludedScaled + scaled;
        if (excluded > m.s0Scaled) revert ScopeExceeded(excluded, m.s0Scaled);
        m.excludedScaled = excluded;
        m.newScaled += newUnits * m.ratioDen;
        m.pendingScaled += residual;

        if (residual > 0) {
            _residual[c.migrationId][c.beneficiary] += residual;
            emit ResidualEntitlementRecorded(c.migrationId, c.beneficiary, residual, m.ratioDen);
        }

        if (newUnits > 0) {
            IMigratableAsset(m.newAsset).mintForMigration(c.beneficiary, newUnits, c.migrationId);
        }

        emit MigrationClaimed(c.migrationId, c.beneficiary, c.oldUnits, newUnits, residual, nullifier);
    }

    /// @dev FROZEN_SNAPSHOT exige congelación efectiva verificada ANTES de
    ///      habilitar claims: mantener uso económico pleno del viejo y emitir el
    ///      nuevo sería doble circulación.
    ///      SURRENDER_ON_CLAIM exige entrega comprobable en la misma operación:
    ///      un snapshot informativo no autoriza a quien ya vendió sus tokens.
    function _excludeOldRight(Migration storage m, ClaimInput calldata c) internal {
        if (m.mode == Mode.FROZEN_SNAPSHOT) {
            SFSPTypes.Lifecycle memory lc = registry.lifecycleOf(m.oldAssetId);
            if (lc.transferability != SFSPTypes.Transferability.FROZEN) revert OldAssetNotFrozen(m.oldAssetId);
        } else {
            if (IMigratableAsset(m.oldAsset).balanceOf(c.beneficiary) < c.oldUnits) revert SurrenderRequired();
            IMigratableAsset(m.oldAsset).burnForMigration(c.beneficiary, c.oldUnits, c.migrationId);
        }
    }

    /// @dev Merkle con pares ordenados: el árbol es reproducible sin publicar PII.
    function _verifyProof(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            computed = computed <= sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
        }
        return computed == root;
    }
}
