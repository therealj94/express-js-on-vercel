"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const { buildAuthorization } = require("./authorization");

const CASH = 1_000_000_000_000_000n; // wei sintéticos del fixture

describe("SFSPCashVault + SFSPSettlementEngine · DvP atómico", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 1000000, 1000000], f.board);
    const { auth, sigs } = await buildAuthorization(f, { destination: f.alice, amount: 1000 });
    await f.issuance.send("mint", [auth, sigs, 1000, H.b32("op_seed_dvp")], f.board);
    // El nativo no tiene approve: el comprador prefinancia el vault.
    await f.vault.sendValue("deposit", [], f.bob, CASH);
  });

  it("positivo: activo y efectivo se mueven en la misma transacción", async function () {
    await f.settlement.send(
      "settle",
      [H.b32("op_dvp_1"), f.assetNew.address, f.alice, f.bob, 100, String(CASH / 2n)],
      f.board
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "100");
    assert.equal((await f.vault.call("balanceOfAccount", [f.alice])).toString(), String(CASH / 2n));
    assert.equal((await f.vault.call("balanceOfAccount", [f.bob])).toString(), String(CASH / 2n));
    const rec = await f.vault.call("reconcile");
    assert.equal(rec[2], true, "el vault debe conciliar activo contra pasivos");
  });

  it("negativo: si la pata del activo falla, el efectivo no se mueve", async function () {
    await f.assetNew.send("setFrozen", [f.alice, true, H.b32("FREEZE_TEST")], f.board);
    await H.expectRevert(
      f.settlement.send(
        "settle",
        [H.b32("op_dvp_2"), f.assetNew.address, f.alice, f.bob, 100, String(CASH / 2n)],
        f.board
      ),
      "TransferRejected"
    );
    assert.equal((await f.vault.call("balanceOfAccount", [f.bob])).toString(), String(CASH));
    assert.equal((await f.vault.call("balanceOfAccount", [f.alice])).toString(), "0");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
    assert.equal(await f.settlement.call("isOperationUsed", [H.b32("op_dvp_2")]), false);
  });

  it("negativo: sin efectivo prefinanciado suficiente la liquidación entera revierte", async function () {
    await H.expectRevert(
      f.settlement.send(
        "settle",
        [H.b32("op_dvp_3"), f.assetNew.address, f.alice, f.bob, 100, String(CASH * 2n)],
        f.board
      ),
      "InsufficientCash"
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
  });

  it("negativo: el mismo operationId no liquida dos veces", async function () {
    const op = H.b32("op_dvp_4");
    await f.settlement.send("settle", [op, f.assetNew.address, f.alice, f.bob, 10, "1000"], f.board);
    await H.expectRevert(
      f.settlement.send("settle", [op, f.assetNew.address, f.alice, f.bob, 10, "1000"], f.board),
      "OperationReplay"
    );
  });

  it("negativo: sólo el motor de liquidación autorizado consume una reserva", async function () {
    await H.expectRevert(
      f.vault.send("reserveCash", [H.b32("op_x"), f.bob, "1000"], f.board),
      "NotSettlementEngine"
    );
  });

  it("positivo: retirar efectivo respeta el saldo interno y la conciliación", async function () {
    await f.vault.send("withdraw", [String(CASH / 2n), H.b32("RETIRO_TEST")], f.bob);
    assert.equal((await f.vault.call("balanceOfAccount", [f.bob])).toString(), String(CASH / 2n));
    const rec = await f.vault.call("reconcile");
    assert.equal(rec[2], true);
  });

  it("negativo: retirar más del saldo interno revierte", async function () {
    await H.expectRevert(
      f.vault.send("withdraw", [String(CASH * 2n), H.b32("RETIRO_TEST")], f.bob),
      "InsufficientCash"
    );
  });
});
