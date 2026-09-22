"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");

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

  async function openMigration(mode) {
    await f.migration.send(
      "openMigration",
      [migrationId, mode, f.assetOld.address, f.assetNew.address, tree.root, RATIO_NUM, RATIO_DEN, expiry, 9],
      f.board
    );
  }

  it("positivo (SURRENDER_ON_CLAIM): entrega el viejo y recibe el nuevo, con resto registrado", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_1"), expiry };
    const sig = await signClaim(f, c);
    await f.migration.send("claim", [c, H.merkleProof(tree, 0), sig], f.board);

    // 5 * 3 / 2 = 7 unidades nuevas y 1/2 de resto: nada se trunca en silencio.
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "7");
    const res = await f.migration.call("residualOf", [migrationId, f.alice]);
    assert.equal(res[0].toString(), "1");
    assert.equal(res[1].toString(), String(RATIO_DEN));
    // El derecho viejo quedó extinguido en la misma operación.
    assert.equal((await f.assetOld.call("balanceOf", [f.alice])).toString(), "0");

    const r = await f.migration.call("reconcile", [migrationId]);
    assert.equal(r[5], true, "S0 = A + N + P y E = N + P");
    assert.equal(r[0].toString(), "27"); // S0 escalado
    assert.equal(r[1].toString(), "12"); // A
    assert.equal(r[2].toString(), "15"); // E
    assert.equal(r[3].toString(), "14"); // N
    assert.equal(r[4].toString(), "1");  // P
  });

  it("positivo (FROZEN_SNAPSHOT): con el activo viejo congelado el claim procede sin entrega", async function () {
    await openMigration(MODE.FROZEN_SNAPSHOT);
    await f.registry.send(
      "setLifecycleAxis",
      [f.ASSET_OLD, F.Axis.TRANSFERABILITY, F.Transferability.FROZEN],
      f.board
    );
    const c = { migrationId, beneficiary: f.bob, oldUnits: 4, nonce: H.b32("n_2"), expiry };
    const sig = await signClaim(f, c);
    await f.migration.send("claim", [c, H.merkleProof(tree, 1), sig], f.board);
    // 4 * 3 / 2 = 6 exactas, sin resto.
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "6");
    assert.equal((await f.assetOld.call("balanceOf", [f.bob])).toString(), "4", "no hay entrega en este modo");
    const r = await f.migration.call("reconcile", [migrationId]);
    assert.equal(r[5], true);
  });

  it("negativo (FROZEN_SNAPSHOT): sin congelación efectiva del viejo no hay claim", async function () {
    await openMigration(MODE.FROZEN_SNAPSHOT);
    const c = { migrationId, beneficiary: f.bob, oldUnits: 4, nonce: H.b32("n_3"), expiry };
    const sig = await signClaim(f, c);
    await H.expectRevert(
      f.migration.send("claim", [c, H.merkleProof(tree, 1), sig], f.board),
      "OldAssetNotFrozen"
    );
  });

  it("negativo: doble claim revierte por nullifier, aunque la firma sea nueva", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c1 = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_4"), expiry };
    await f.migration.send("claim", [c1, H.merkleProof(tree, 0), await signClaim(f, c1)], f.board);

    // Misma firma: lo para el contador de nonce.
    await H.expectRevert(
      f.migration.send("claim", [c1, H.merkleProof(tree, 0), await signClaim(f, c1)], f.board),
      "NonceUsed"
    );
    // Firma nueva sobre el mismo derecho: lo para el nullifier, que va aparte.
    const c2 = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_5"), expiry };
    await H.expectRevert(
      f.migration.send("claim", [c2, H.merkleProof(tree, 0), await signClaim(f, c2)], f.board),
      "NullifierUsed"
    );
  });

  it("negativo: una firma que no es de un ATTESTOR autorizado se rechaza", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_6"), expiry };
    const sig = await signClaim(f, c, f.alice);
    await H.expectRevert(f.migration.send("claim", [c, H.merkleProof(tree, 0), sig], f.board), "NotAttestor");
  });

  it("negativo: una prueba de Merkle que no corresponde se rechaza", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_7"), expiry };
    const sig = await signClaim(f, c);
    await H.expectRevert(f.migration.send("claim", [c, H.merkleProof(tree, 1), sig], f.board), "BadProof");
  });

  it("negativo: en SURRENDER_ON_CLAIM quien ya no tiene los tokens no puede reclamar", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    await f.assetOld.send("transferUnits", [f.bob, 5], f.alice); // alice vendió su posición
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_8"), expiry };
    const sig = await signClaim(f, c);
    await H.expectRevert(
      f.migration.send("claim", [c, H.merkleProof(tree, 0), sig], f.board),
      "SurrenderRequired"
    );
  });

  it("negativo: un claim vencido revierte", async function () {
    await openMigration(MODE.SURRENDER_ON_CLAIM);
    const c = { migrationId, beneficiary: f.alice, oldUnits: 5, nonce: H.b32("n_9"), expiry };
    const sig = await signClaim(f, c);
    await H.increaseTime(4000);
    await H.expectRevert(f.migration.send("claim", [c, H.merkleProof(tree, 0), sig], f.board), "ClaimExpired");
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
