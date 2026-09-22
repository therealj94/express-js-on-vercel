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

    // §3 · MigrationClaimed lo emite MigrationRegistry. H15: nombra los DOS
    // activos, porque sin ellos el reemplazo no se puede imputar a ningún
    // circulante. `residualNumerator` no se pierde: sigue en
    // `ResidualEntitlementRecorded`, que lleva numerador y denominador juntos,
    // que es la única forma de leer una fracción sin inventar el denominador.
    event MigrationClaimed(
        bytes32 indexed migrationId,
        address indexed beneficiary,
        bytes32 indexed assetIdAnterior,
        bytes32 assetIdNuevo,
        uint256 oldUnits,
        uint256 newUnits,
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
    // H04 · el origen tiene que estar excluido de forma técnica y PERMANENTE,
    // no llevar una etiqueta de ciclo de vida que puede volver a cambiar.
    error OldAssetNotPermanentlyExcluded(bytes32 oldAssetId);
    // H04 · un mismo origen no puede tener dos migraciones abiertas a la vez.
    error SourceAlreadyMigrating(bytes32 oldAssetId, bytes32 openMigrationId);
    error MigrationExpired(uint64 expiry);
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
    mapping(bytes32 => bool) private _nullifierUsed;   // anti-replay del derecho, GLOBAL
    // H04 · oldAssetId => migración abierta sobre ese origen. Cero = ninguna.
    mapping(bytes32 => bytes32) private _openMigrationOf;
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
        require(expiry > block.timestamp, "SFSP: ventana vencida");

        bytes32 oldAssetId = IMigratableAsset(oldAsset).assetId();
        // H04 · unicidad global por origen. Con dos migraciones abiertas sobre el
        // mismo activo viejo, cada una llevaba su propio dominio de nullifier y la
        // misma posición se podía reemplazar dos veces.
        bytes32 abierta = _openMigrationOf[oldAssetId];
        if (abierta != bytes32(0)) revert SourceAlreadyMigrating(oldAssetId, abierta);
        // H04 · en FROZEN_SNAPSHOT la exclusión tiene que estar declarada ANTES de
        // habilitar claims, y ser irreversible. Un eje de ciclo de vida no sirve:
        // TECH_OPS podía devolverlo a FREE después de emitir el activo nuevo, y
        // entonces el viejo y el nuevo circulaban a la vez.
        if (mode == Mode.FROZEN_SNAPSHOT && !registry.isPermanentlyExcluded(oldAssetId)) {
            revert OldAssetNotPermanentlyExcluded(oldAssetId);
        }
        _openMigrationOf[oldAssetId] = migrationId;

        _migrations[migrationId] = Migration({
            mode: mode,
            oldAssetId: oldAssetId,
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
        // El candado del origen se libera, pero los nullifiers NO: son globales y
        // no dependen de la migración, así que una migración posterior sobre el
        // mismo origen no puede reemplazar una posición ya reemplazada.
        if (_openMigrationOf[m.oldAssetId] == migrationId) _openMigrationOf[m.oldAssetId] = bytes32(0);
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

    function openMigrationOf(bytes32 oldAssetId) external view returns (bytes32) {
        return _openMigrationOf[oldAssetId];
    }

    /// @notice Conciliación del §6.3, en unidades escaladas por ratioNum.
    /// @dev E es CONTRAPARTE de N + P, no un tercer sumando de S0.
    ///      H04 · sobre `A = S0` al abrir. `A` es «derecho de origen todavía no
    ///      reemplazado», y al abrir vale S0 porque no se ha reemplazado nada:
    ///      eso es correcto. Lo que era incompatible con «congelado y excluido»
    ///      era leer ese `A` como circulación del activo viejo. En
    ///      FROZEN_SNAPSHOT la circulación del viejo es CERO desde la apertura,
    ///      porque la exclusión es técnica, permanente y anterior a cualquier
    ///      claim; en SURRENDER_ON_CLAIM sí coincide con `A`, porque lo que
    ///      todavía no se entregó sigue circulando. Se devuelve por separado para
    ///      que nadie tenga que deducirlo.
    function reconcile(bytes32 migrationId)
        external
        view
        returns (uint256 s0, uint256 a, uint256 e, uint256 n, uint256 p, bool ok, uint256 oldCirculatingScaled)
    {
        Migration storage m = _migrations[migrationId];
        s0 = m.s0Scaled;
        e = m.excludedScaled;
        n = m.newScaled;
        p = m.pendingScaled;
        a = s0 - e;
        ok = (s0 == a + n + p) && (e == n + p);
        oldCirculatingScaled = m.mode == Mode.FROZEN_SNAPSHOT ? 0 : a;
    }

    function leafOf(bytes32 migrationId, address beneficiary, uint256 oldUnits) public pure returns (bytes32) {
        return keccak256(abi.encode(migrationId, beneficiary, oldUnits));
    }

    /// @notice Nullifier de una POSICIÓN DE ORIGEN, no de una migración.
    /// @dev H04 · antes el nullifier incluía `migrationId`, que es un
    ///      identificador arbitrario que elige quien abre la migración: abrir otra
    ///      migración abría otro dominio de nullifiers y permitía reemplazar dos
    ///      veces la misma posición. Ahora se deriva del activo de origen y del
    ///      titular, y por eso vale en TODAS las migraciones presentes y futuras.
    ///      Tampoco entra `oldUnits`: si entrara, dos migraciones con recuentos
    ///      distintos para el mismo titular volverían a ser dos dominios.
    function nullifierOf(bytes32 oldAssetId, address beneficiary) public pure returns (bytes32) {
        return keccak256(abi.encode("SFSP.NULLIFIER.POSICION.v2", oldAssetId, beneficiary));
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
        // H17 · las DOS vigencias. Antes sólo se comprobaba la del claim, así que
        // una migración vencida seguía abierta de hecho si el claim traía un
        // vencimiento posterior: el atestador podía extender la ventana solo.
        if (block.timestamp >= m.expiry) revert MigrationExpired(m.expiry);
        if (block.timestamp >= c.expiry) revert ClaimExpired(c.expiry);

        // 1. Firma del atestador autorizado sobre el payload completo.
        address signer = _recover(hashClaim(c), signature);
        if (!hasRole(ATTESTOR, signer)) revert NotAttestor(signer);

        // 2. Anti-replay de la FIRMA (nonce) ...
        if (_nonceUsed[c.nonce]) revert NonceUsed(c.nonce);
        _nonceUsed[c.nonce] = true;

        // 3. ... y anti-replay del DERECHO (nullifier), que es independiente:
        //    otra firma válida del mismo derecho tampoco puede cobrarlo dos veces.
        bytes32 nullifier = nullifierOf(m.oldAssetId, c.beneficiary);
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

        _emitClaimed(m, c, newUnits, nullifier);
    }

    /// @dev Emitir desde una función aparte mantiene el marco de pila de `claim`
    ///      dentro de lo que admite el EVM de Paris (el evento lleva siete campos).
    function _emitClaimed(Migration storage m, ClaimInput calldata c, uint256 newUnits, bytes32 nullifier)
        internal
    {
        emit MigrationClaimed(
            c.migrationId, c.beneficiary, m.oldAssetId, m.newAssetId, c.oldUnits, newUnits, nullifier
        );
    }

    /// @dev FROZEN_SNAPSHOT exige congelación efectiva verificada ANTES de
    ///      habilitar claims: mantener uso económico pleno del viejo y emitir el
    ///      nuevo sería doble circulación.
    ///      SURRENDER_ON_CLAIM exige entrega comprobable en la misma operación:
    ///      un snapshot informativo no autoriza a quien ya vendió sus tokens.
    function _excludeOldRight(Migration storage m, ClaimInput calldata c) internal {
        if (m.mode == Mode.FROZEN_SNAPSHOT) {
            // Se comprueban las dos cosas: la exclusión permanente declarada (que
            // no se puede deshacer) y el eje efectivo. La segunda sin la primera
            // era el defecto de H04.
            if (!registry.isPermanentlyExcluded(m.oldAssetId)) {
                revert OldAssetNotPermanentlyExcluded(m.oldAssetId);
            }
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
