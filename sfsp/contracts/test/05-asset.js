"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const { buildAuthorization } = require("./authorization");

async function seed(f, to, amount, tag) {
  await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 1000000, 1000000], f.board);
  const { auth, sigs } = await buildAuthorization(f, {
    destination: to,
    amount,
    authorizationId: H.b32("auth_seed_" + tag),
    nonce: H.b32("nonce_seed_" + tag),
  });
  await f.issuance.send("mint", [auth, sigs, amount, H.b32("op_seed_" + tag)], f.board);
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
    await f.engine.send(
      "setPolicy",
      [f.ASSET_NEW, H.b32("TRANSFER_IN"), F.policy({ requiredPurpose: H.b32("KYC") })],
      f.board
    );
    const check = await f.assetNew.call("checkTransfer", [f.alice, f.bob, 100]);
    assert.equal(Number(check[0]), F.CODE.UNKNOWN_SOURCE);
    await H.expectRevert(f.assetNew.send("transferUnits", [f.bob, 100], f.alice), "TransferRejected");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
  });

  it("negativo: el adaptador ERC-20 no elude las reglas (ni transfer ni transferFrom)", async function () {
    await f.engine.send(
      "setPolicy",
      [f.ASSET_NEW, H.b32("TRANSFER_IN"), F.policy({ requiredPurpose: H.b32("KYC") })],
      f.board
    );
    await H.expectRevert(f.assetNew.send("transfer", [f.bob, 100], f.alice), "TransferRejected");
    await f.assetNew.send("approve", [f.board, 100], f.alice);
    await H.expectRevert(f.assetNew.send("transferFrom", [f.alice, f.bob, 100], f.board), "TransferRejected");
    // Una allowance concedida no crea una ruta de escape.
    assert.equal((await f.assetNew.call("allowance", [f.alice, f.board])).toString(), "100");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
  });

  it("negativo: una cuenta sin referencia opaca no puede recibir", async function () {
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

  it("negativo: una transferencia forzosa sin autorización de gobierno revierte", async function () {
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [f.alice, f.bob, 100, H.b32("op_ft_sin_auth")], f.board),
      "ForcedTransferNotAuthorized"
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "1000");
  });

  it("positivo: una transferencia forzosa con quórum se ejecuta y consume la aprobación", async function () {
    const op = H.b32("op_ft_1");
    await f.governance.send("propose", [op, H.b32("RECOVERY"), H.b32("detalle")], f.signers[0]);
    await f.governance.send("approve", [op], f.signers[1]);
    await f.assetNew.send("forcedTransfer", [f.alice, f.bob, 100, op], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "100");
    // La misma aprobación no vale dos veces.
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [f.alice, f.bob, 100, op], f.board),
      "ForcedTransferNotAuthorized"
    );
  });

  it("negativo: quemar sin motivo revierte", async function () {
    await H.expectRevert(
      f.assetNew.send("burn", [f.alice, 10, H.ZERO32, H.b32("op_burn_x")], f.board),
      "ReasonRequired"
    );
    await f.assetNew.send("burn", [f.alice, 10, H.b32("MOTIVO_TEST"), H.b32("op_burn_y")], f.board);
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
