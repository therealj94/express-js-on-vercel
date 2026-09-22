"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const { buildAuthorization, acunar, quemarConGobierno } = require("./authorization");
const OA = require("./orden-autorizada");

async function seed(f, to, amount, tag) {
  await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 1000000, 1000000], f.board);
  const { auth, sigs } = await buildAuthorization(f, {
    destination: to,
    amount,
    authorizationId: H.b32("auth_seed_" + tag),
    nonce: H.b32("nonce_seed_" + tag),
  });
  await acunar(f, { auth, sigs }, amount, H.b32("op_seed_" + tag));
}

describe("SFSPRegulatedAsset · restricciones impuestas de verdad", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await seed(f, f.alice, 1000, "1");
  });

  it("positivo: una transferencia elegible se ejecuta por la ruta canónica", async function () {
    await f.assetNew.send("transferUnits", [f.bob, 100], f.alice);
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "100");
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "900");
  });

  it("negativo: una transferencia restringida se bloquea de verdad", async function () {
    // La política de entrada exige un claim que el destinatario no tiene.
    await F.fijarPolitica(f, f.ASSET_NEW, H.b32("TRANSFER_IN"), F.policy({ requiredPurpose: H.b32("KYC") }), "t05a");
    const check = await f.assetNew.call("checkTransfer", [f.alice, f.bob, 100]);
    assert.equal(Number(check[0]), F.CODE.UNKNOWN_SOURCE);
    await H.expectRevert(f.assetNew.send("transferUnits", [f.bob, 100], f.alice), "TransferRejected");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
  });

  it("negativo: el adaptador ERC-20 no elude las reglas (ni transfer ni transferFrom)", async function () {
    await F.fijarPolitica(f, f.ASSET_NEW, H.b32("TRANSFER_IN"), F.policy({ requiredPurpose: H.b32("KYC") }), "t05b");
    await H.expectRevert(f.assetNew.send("transfer", [f.bob, 100], f.alice), "TransferRejected");
    await f.assetNew.send("approve", [f.board, 100], f.alice);
    await H.expectRevert(f.assetNew.send("transferFrom", [f.alice, f.bob, 100], f.board), "TransferRejected");
    // Una allowance concedida no crea una ruta de escape.
    assert.equal((await f.assetNew.call("allowance", [f.alice, f.board])).toString(), "100");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
  });

  it("negativo: una cuenta sin alta en el propósito base no puede recibir", async function () {
    await H.expectRevert(f.assetNew.send("transferUnits", [f.mallory, 10], f.alice), "TransferRejected");
  });

  it("negativo: una cuenta congelada no transfiere", async function () {
    await f.assetNew.send("setFrozen", [f.alice, true, H.b32("FREEZE_TEST")], f.board);
    await H.expectRevert(f.assetNew.send("transferUnits", [f.bob, 10], f.alice), "TransferRejected");
  });

  it("negativo: congelar exige la capacidad declarada en el pasaporte", async function () {
    const id = H.b32("SFSP:SEC:NOFREEZE:1");
    await f.registry.send("registerAsset", [F.passport(id, { freeze: false })], f.board);
    const a = await H.deploy(
      "SFSPRegulatedAsset",
      [f.board, id, f.registry.address, f.engine.address, f.identity.address, f.governance.address, false],
      f.board
    );
    await a.send("grantRole", [await a.call("TECH_OPS"), f.board], f.board);
    await H.expectRevert(
      a.send("setFrozen", [f.alice, true, H.b32("FREEZE_TEST")], f.board),
      "CapabilityNotDeclared"
    );
  });

  /* Antes esta prueba pedía una transferencia forzosa con un `operationId` sin
     aprobación. Ahora el argumento es el payload completo y el digest aprobado,
     porque el ejecutor recalcula el digest desde sus argumentos reales (H01). */
  it("negativo: una transferencia forzosa sin autorización de gobierno revierte", async function () {
    const p = await OA.orden({
      verifyingContract: f.assetNew.address,
      action: H.b32("FORCED_TRANSFER"),
      assetId: f.ASSET_NEW,
      origin: f.alice,
      destination: f.bob,
      amount: "100",
      nonce: H.b32("op_ft_sin_auth"),
    });
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [OA.tupla(p), OA.digestDe(p)], f.board),
      "ForcedTransferNotAuthorized"
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "1000");
  });

  it("positivo: una transferencia forzosa con quórum se ejecuta y consume la aprobación", async function () {
    const p = await OA.orden({
      verifyingContract: f.assetNew.address,
      action: H.b32("FORCED_TRANSFER"),
      assetId: f.ASSET_NEW,
      origin: f.alice,
      destination: f.bob,
      amount: "100",
      nonce: H.b32("op_ft_1"),
    });
    const d = OA.digestDe(p);
    await OA.aprobar(f, d, H.b32("FORCED_TRANSFER"));
    await f.assetNew.send("forcedTransfer", [OA.tupla(p), d], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "100");
    // La misma aprobación no vale dos veces.
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [OA.tupla(p), d], f.board),
      "ForcedTransferNotAuthorized"
    );
  });

  /* La quema dejó de tomar `(from, amount, reasonCode, operationId)`: ese cuarteto
     no estaba atado a ninguna autorización y era H02. Ahora toma el payload y su
     digest, y el motivo viaja en `evidenceRoot`, comprometido dentro del digest. */
  it("negativo: quemar sin motivo revierte", async function () {
    const sin = await OA.orden({
      verifyingContract: f.assetNew.address,
      action: H.b32("BURN"),
      assetId: f.ASSET_NEW,
      origin: f.alice,
      amount: "10",
      nonce: H.b32("op_burn_x"),
      evidenceRoot: H.ZERO32,
    });
    const dSin = OA.digestDe(sin);
    await OA.aprobar(f, dSin, H.b32("BURN"));
    await H.expectRevert(f.assetNew.send("burn", [OA.tupla(sin), dSin], f.board), "ReasonRequired");

    await quemarConGobierno(f, f.assetNew, f.ASSET_NEW, f.alice, 10, H.b32("MOTIVO_TEST"), H.b32("op_burn_y"));
    assert.equal((await f.assetNew.call("totalSupply")).toString(), "990");
  });

  it("negativo: nadie salvo el IssuanceController acuña", async function () {
    await H.expectRevert(
      f.assetNew.send("mintFromIssuance", [f.alice, 1, H.b32("op_direct")], f.board),
      "NotIssuanceController"
    );
  });

  it("positivo: el perfil de interoperabilidad se declara explícitamente", async function () {
    assert.equal(await f.assetNew.call("erc20InteropEnabled"), true);
    assert.equal(await f.assetNew.call("INTEROP_PROFILE"), "SFSP_CANONICAL+ERC20_ADAPTER_ENFORCED");
  });
});
