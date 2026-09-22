"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");

/* §12.5 · la fila `MIGRATION_CLAIM` pide DOS cosas: doble control Y nullifier por
   posición de origen. Hasta este lote sólo estaba la segunda: bastaba la firma de
   un atestador para mover el reemplazo de una posición entera. Ahora cada claim
   lleva además una orden aprobada por dos firmantes distintos del proponente, y
   el digest compromete posición de origen, beneficiario, unidades y raíz de
   prueba. El nullifier no cambió: sigue derivándose de (activo viejo, titular). */
async function ordenClaim(f, c, root, oldAssetId) {
  const p = await OA.orden({
    verifyingContract: f.migration.address,
    action: H.b32("MIGRATION_CLAIM"),
    assetId: oldAssetId || f.ASSET_OLD,
    destination: c.beneficiary,
    amount: String(c.oldUnits),
    nonce: c.nonce,
    evidenceRoot: root,
  });
  const d = OA.digestDe(p);
  await OA.aprobar(f, d, H.b32("MIGRATION_CLAIM"));
  return { tupla: OA.tupla(p), digest: d };
}

/** Reclama con firma del atestador Y orden de gobierno aprobada. */
async function reclamar(f, c, proof, sig, root, oldAssetId) {
  const o = await ordenClaim(f, c, root, oldAssetId);
  return await f.migration.send("claim", [c, proof, sig, o.tupla, o.digest], f.board);
}

const CLAIM_TYPES = {
  MigrationClaim: [
    { name: "migrationId", type: "bytes32" },
    { name: "beneficiary", type: "address" },
    { name: "oldUnits", type: "uint256" },
    { name: "ratioNum", type: "uint256" },
    { name: "ratioDen", type: "uint256" },
    { name: "sourceChainId", type: "uint256" },
    { name: "targetChainId", type: "uint256" },
    { name: "registry", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "expiry", type: "uint64" },
  ],
};

const MODE = { FROZEN_SNAPSHOT: 0, SURRENDER_ON_CLAIM: 1 };
const RATIO_NUM = 3;
const RATIO_DEN = 2;

async function signClaim(f, c, signer) {
  const cid = await H.chainId();
  const domain = {
    name: "SFSPMigrationRegistry",
    version: "draft-0.3",
    chainId: cid,
    verifyingContract: f.migration.address,
  };
  const message = {
    migrationId: c.migrationId,
    beneficiary: c.beneficiary,
    oldUnits: String(c.oldUnits),
    ratioNum: String(RATIO_NUM),
    ratioDen: String(RATIO_DEN),
    sourceChainId: String(cid),
    targetChainId: String(cid),
    registry: f.migration.address,
    nonce: c.nonce,
    expiry: String(c.expiry),
  };
  return await H.signTypedData(signer || f.board, domain, CLAIM_TYPES, "MigrationClaim", message);
}

describe("SFSPMigrationRegistry · dos modos, nullifier y regla de restos", function () {
  let f, migrationId, tree, leaves, expiry;

  beforeEach(async function () {
    f = await F.deployAll();
    // Tenencias previas en el activo viejo (fixture sintético).
    await f.assetOld.send("mintFromIssuance", [f.alice, 5, H.b32("op_old_a")], f.board);
    await f.assetOld.send("mintFromIssuance", [f.bob, 4, H.b32("op_old_b")], f.board);
    migrationId = H.b32("mig_0001");
    leaves = [H.merkleLeaf(migrationId, f.alice, 5), H.merkleLeaf(migrationId, f.bob, 4)];
    tree = H.merkleTree(leaves);
    expiry = (await H.now()) + 3600;
  });

  /* H04 · FROZEN_SNAPSHOT ya no se apoya en el eje de transferibilidad, que
     TECH_OPS puede volver a cambiar, sino en una exclusión técnica PERMANENTE
     declarada por el órgano antes de abrir la migración. */
  async function excluirOrigen() {
    await f.registry.send("declarePermanentExclusion", [f.ASSET_OLD, H.b32("ev_exclusion_1")], f.board);
  }

  async function openMigration(mode, id) {
    await f.migration.send(
      "openMigration",
      [id || migrationId, mode, f.assetOld.address, f.assetNew.address, tree.root, RATIO_NUM, RATIO_DEN, expiry, 9],
      f.board
    );
  }

  it("positivo (SURRENDER_ON_CLAIM): entrega el viejo y recibe el nuevo, con resto registrado", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_1"), expiry };
    const sig = await signClaim(f, c);
    await reclamar(f, c, H.merkleProof(tree, 0), sig, tree.root);

    // 5 * 3 / 2 = 7 unidades nuevas y 1/2 de resto: nada se trunca en silencio.
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "7");
    const res = await f.migration.call("residualOf", [migrationId, f.alice]);
    assert.equal(res[0].toString(), "1");
    assert.equal(res[1].toString(), String(RATIO_DEN));
    // El derecho viejo quedó extinguido en la misma operación.
    assert.equal((await f.assetOld.call("balanceOf", [f.alice])).toString(), "0");

    const r = await f.migration.call("reconcile", [migrationId]);
    assert.equal(r[5], true, "S0 = A + N + P y E = N + P");
    // En SURRENDER_ON_CLAIM lo que todavía no se entregó sigue circulando.
    assert.equal(r[6].toString(), r[1].toString());
    assert.equal(r[0].toString(), "27"); // S0 escalado
    assert.equal(r[1].toString(), "12"); // A
    assert.equal(r[2].toString(), "15"); // E
    assert.equal(r[3].toString(), "14"); // N
    assert.equal(r[4].toString(), "1");  // P
  });

  it("positivo (FROZEN_SNAPSHOT): con el activo viejo excluido de forma permanente el claim procede sin entrega", async function () {
    // La exclusión va ANTES de abrir: abrir una migración congelada sobre un
    // origen que todavía circula era el agujero de H04.
    await excluirOrigen();
    await openMigration(MODE.FROZEN_SNAPSHOT);
    const c = { migrationId, beneficiary: f.bob, oldUnits: 4, nonce: H.b32("n_2"), expiry };
    const sig = await signClaim(f, c);
    await reclamar(f, c, H.merkleProof(tree, 1), sig, tree.root);
    // 4 * 3 / 2 = 6 exactas, sin resto.
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "6");
    assert.equal((await f.assetOld.call("balanceOf", [f.bob])).toString(), "4", "no hay entrega en este modo");
    const r = await f.migration.call("reconcile", [migrationId]);
    assert.equal(r[5], true);
    // H04 · en modo congelado la circulación del origen es CERO desde la
    // apertura: la exclusión es técnica, permanente y anterior a todo claim.
    assert.equal(r[6].toString(), "0");
  });

  it("negativo (FROZEN_SNAPSHOT): sin exclusión permanente del viejo no se abre la migración", async function () {
    // El rechazo llegó antes que en draft-0.3: ya no se puede abrir la migración
    // congelada y descubrir en el primer claim que el origen seguía circulando.
    await H.expectRevert(
      openMigration(MODE.FROZEN_SNAPSHOT),
      "OldAssetNotPermanentlyExcluded"
    );
  });

  it("negativo: doble claim revierte por nullifier, aunque la firma sea nueva", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c1 = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_4"), expiry };
    // La orden de gobierno se construye UNA vez: su digest compromete el `nonce`
    // del claim, así que repetir el claim es repetir el digest. Se reutiliza tal
    // cual para que lo que pare el segundo intento sea el contador de `nonce` del
    // registro y no el registro de autorizaciones.
    const o1 = await ordenClaim(f, c1, tree.root);
    await f.migration.send("claim", [c1, H.merkleProof(tree, 0), await signClaim(f, c1), o1.tupla, o1.digest], f.board);

    // Misma firma: lo para el contador de nonce.
    await H.expectRevert(
      f.migration.send(
        "claim",
        [c1, H.merkleProof(tree, 0), await signClaim(f, c1), o1.tupla, o1.digest],
        f.board,
      ),
      "NonceUsed"
    );
    // Firma nueva sobre el mismo derecho: lo para el nullifier, que va aparte.
    const c2 = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_5"), expiry };
    await H.expectRevert(
      reclamar(f, c2, H.merkleProof(tree, 0), await signClaim(f, c2), tree.root),
      "NullifierUsed"
    );
  });

  it("negativo: una firma que no es de un ATTESTOR autorizado se rechaza", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_6"), expiry };
    const sig = await signClaim(f, c, f.alice);
    await H.expectRevert(reclamar(f, c, H.merkleProof(tree, 0), sig, tree.root), "NotAttestor");
  });

  it("negativo: una prueba de Merkle que no corresponde se rechaza", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_7"), expiry };
    const sig = await signClaim(f, c);
    await H.expectRevert(reclamar(f, c, H.merkleProof(tree, 1), sig, tree.root), "BadProof");
  });

  it("negativo: en SURRENDER_ON_CLAIM quien ya no tiene los tokens no puede reclamar", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    await f.assetOld.send("transferUnits", [f.bob, 5], f.alice); // alice vendió su posición
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_8"), expiry };
    const sig = await signClaim(f, c);
    await H.expectRevert(
      reclamar(f, c, H.merkleProof(tree, 0), sig, tree.root),
      "SurrenderRequired"
    );
  });

  /* Se acorta la ventana del claim para que venza ANTES que la de la migración.
     Con las dos ventanas iguales, el rechazo llegaba ahora por `MigrationExpired`
     y esta prueba dejaba de ejercitar `ClaimExpired`, que es lo que le toca. */
  it("negativo: un claim vencido revierte", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_9"), expiry: expiry - 1800 };
    const sig = await signClaim(f, c);
    await H.increaseTime(2000);
    await H.expectRevert(reclamar(f, c, H.merkleProof(tree, 0), sig, tree.root), "ClaimExpired");
  });

  /* §12.5 · MIGRATION_CLAIM = doble control + nullifier por posición de origen.
     Antes bastaba la firma de un atestador. */
  it("positivo (MIGRATION_CLAIM): con firma del atestador Y doble control, la orden se consume", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_dc_1"), expiry };
    const o = await ordenClaim(f, c, tree.root);
    await f.migration.send("claim", [c, H.merkleProof(tree, 0), await signClaim(f, c), o.tupla, o.digest], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "7");
    assert.equal(
      await f.governance.call("isAuthorizationApproved", [o.digest]),
      false,
      "la orden del claim se gasta una sola vez",
    );
  });

  it("negativo (MIGRATION_CLAIM): la firma del atestador SOLA ya no basta", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_dc_2"), expiry };
    // Orden bien formada, pero nadie la propuso ni la aprobó en gobierno.
    const p = await OA.orden({
      verifyingContract: f.migration.address,
      action: H.b32("MIGRATION_CLAIM"),
      assetId: f.ASSET_OLD,
      destination: c.beneficiary,
      amount: String(c.oldUnits),
      nonce: c.nonce,
      evidenceRoot: tree.root,
    });
    await H.expectRevert(
      f.migration.send(
        "claim",
        [c, H.merkleProof(tree, 0), await signClaim(f, c), OA.tupla(p), OA.digestDe(p)],
        f.board,
      ),
      "ClaimNotAuthorized",
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "0");
  });

  it("negativo (MIGRATION_CLAIM): una orden aprobada para otro beneficiario no reclama", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_dc_3"), expiry };
    // Aprobada para bob; se presenta con el claim de alice.
    const o = await ordenClaim(f, { beneficiary: f.bob, oldUnits: 5, nonce: c.nonce }, tree.root);
    await H.expectRevert(
      f.migration.send("claim", [c, H.merkleProof(tree, 0), await signClaim(f, c), o.tupla, o.digest], f.board),
      "ClaimDoesNotMatchAuthorization",
    );
  });

  it("negativo: un ratio con denominador cero no se admite", async function () {
    await H.expectRevert(
      f.migration.send(
        "openMigration",
        [H.b32("mig_bad"), MODE.SURRENDER_ON_CLAIM, f.assetOld.address, f.assetNew.address, tree.root, 3, 0, expiry, 9],
        f.board
      ),
      "RatioInvalid"
    );
  });
});
