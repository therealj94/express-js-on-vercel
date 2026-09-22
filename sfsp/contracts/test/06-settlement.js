"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const { buildAuthorization, acunar } = require("./authorization");
const OA = require("./orden-autorizada");

const CASH = 1_000_000_000_000_000n; // wei sintéticos del fixture

/* H05 · `settle` dejó de recibir la dirección del contrato del activo, las
   partes y los importes como argumentos sueltos del operador. Ahora recibe una
   ORDEN: el payload del §12.1 con activo, vendedor (`origin`), comprador
   (`destination`), unidades (`amount`) y efectivo (`amountSecondary`), más el
   digest que gobierno aprobó. El contrato del activo sale del registro canónico. */
async function ordenDvP(f, over) {
  const p = await OA.orden(Object.assign({
    verifyingContract: f.settlement.address,
    action: H.b32("SETTLE_DVP"),
    assetId: f.ASSET_NEW,
    origin: f.alice,
    destination: f.bob,
    amount: "100",
    amountSecondary: String(CASH / 2n),
    nonce: H.b32("op_dvp_1"),
  }, over || {}));
  return { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };
}

async function liquidar(f, over) {
  const o = await ordenDvP(f, over);
  await OA.aprobar(f, o.digest, H.b32("SETTLE_DVP"));
  return await f.settlement.send("settle", [o.tupla, o.digest], f.board);
}

describe("SFSPCashVault + SFSPSettlementEngine · DvP atómico", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 1000000, 1000000], f.board);
    const { auth, sigs } = await buildAuthorization(f, { destination: f.alice, amount: 1000 });
    await acunar(f, { auth, sigs }, 1000, H.b32("op_seed_dvp"));
    // El nativo no tiene approve: el comprador prefinancia el vault.
    await f.vault.sendValue("deposit", [], f.bob, CASH);
  });

  it("positivo: activo y efectivo se mueven en la misma transacción", async function () {
    await liquidar(f, {});
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "100");
    assert.equal((await f.vault.call("balanceOfAccount", [f.alice])).toString(), String(CASH / 2n));
    assert.equal((await f.vault.call("balanceOfAccount", [f.bob])).toString(), String(CASH / 2n));
    const rec = await f.vault.call("reconcile");
    assert.equal(rec[2], true, "el vault debe ser solvente: activo >= pasivos");
    assert.equal(rec[3].toString(), "0", "sin superávit sin dueño");
  });

  it("negativo: si la pata del activo falla, el efectivo no se mueve", async function () {
    await f.assetNew.send("setFrozen", [f.alice, true, H.b32("FREEZE_TEST")], f.board);
    await H.expectRevert(
      liquidar(f, { nonce: H.b32("op_dvp_2") }),
      "TransferRejected"
    );
    assert.equal((await f.vault.call("balanceOfAccount", [f.bob])).toString(), String(CASH));
    assert.equal((await f.vault.call("balanceOfAccount", [f.alice])).toString(), "0");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
    assert.equal(await f.settlement.call("isOperationUsed", [H.b32("op_dvp_2")]), false);
  });

  it("negativo: sin efectivo prefinanciado suficiente la liquidación entera revierte", async function () {
    await H.expectRevert(
      liquidar(f, { nonce: H.b32("op_dvp_3"), amountSecondary: String(CASH * 2n) }),
      "InsufficientCash"
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
  });

  it("negativo: el mismo operationId no liquida dos veces", async function () {
    const over = { nonce: H.b32("op_dvp_4"), amount: "10", amountSecondary: "1000" };
    const o = await ordenDvP(f, over);
    await OA.aprobar(f, o.digest, H.b32("SETTLE_DVP"));
    await f.settlement.send("settle", [o.tupla, o.digest], f.board);
    // Reintentar con el MISMO `operationId` (el `nonce` del payload) se para en
    // la idempotencia antes incluso de mirar la autorización.
    await H.expectRevert(
      f.settlement.send("settle", [o.tupla, o.digest], f.board),
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
