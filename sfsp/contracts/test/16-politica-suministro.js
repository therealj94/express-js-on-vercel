"use strict";
/* SFSP-410 · Política de suministro: el circulante es lo que está en manos de
 * usuarios. No se acuña inventario; se acuña al usuario cuando paga, dentro de
 * un cupo que gobierno aprobó con doble control y espera, y se quema cuando el
 * usuario devuelve. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");
const { buildAuthorization, acunar, ordenDeQuema } = require("./authorization");

const DIA = 86400;

async function ordenDeCupo(f, o) {
  const ts = await H.now();
  const period = o.period || DIA;
  const validUntil = o.validUntil || ts + 30 * DIA;
  const docRoot = o.docRoot || H.b32("acta_junta_cupo_1");
  const terms = await f.issuance.call("budgetTermsRoot", [period, validUntil, docRoot]);
  const p = await OA.orden({
    verifyingContract: f.issuance.address,
    action: o.action || H.b32("SET_MINT_BUDGET"),
    assetId: o.assetId || f.ASSET_NEW,
    amount: String(o.perPeriod || 1000),
    amountSecondary: String(o.maxPerOp || 300),
    nonce: o.nonce || H.b32("cupo_1"),
    expiry: ts + 3 * 3600,
    evidenceRoot: o.evidenceRoot || terms,
  });
  return { p, tupla: OA.tupla(p), digest: OA.digestDe(p), period, validUntil, docRoot };
}

async function fijarCupo(f, o) {
  const c = await ordenDeCupo(f, o || {});
  await OA.aprobar(f, c.digest, H.b32("SET_MINT_BUDGET"));
  await H.increaseTime(F.GOV.timelockDelay + 1);
  await f.issuance.send("setMintBudget", [c.tupla, c.digest, c.period, c.validUntil, c.docRoot], f.board);
  return c;
}

const bal = async (f, who) => BigInt((await f.assetNew.call("balanceOf", [who])).toString());
const supply = async (f) => BigInt((await f.assetNew.call("totalSupply")).toString());

describe("SFSP-410 · política de suministro: circulante = usuarios", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 5000, 1000000], f.board);
    await f.issuance.send("setInternalAccount", [f.treasury, true, H.b32("TESORERIA")], f.board);
  });

  describe("no se acuña inventario", function () {
    it("negativo: la emisión por orden de gobierno tampoco puede ir a una cuenta interna", async function () {
      const { auth, sigs } = await buildAuthorization(f, { destination: f.treasury });
      await H.expectRevert(acunar(f, { auth, sigs }, 100, H.b32("op_inv")), "MintToInternalAccount");
      assert.equal(await supply(f), 0n);
    });

    it("positivo: la misma orden hacia un usuario sí acuña", async function () {
      const { auth, sigs } = await buildAuthorization(f, { destination: f.alice });
      await acunar(f, { auth, sigs }, 100, H.b32("op_user"));
      assert.equal(await bal(f, f.alice), 100n);
    });

    it("negativo: desmarcar una cuenta interna sólo lo hace la Junta; marcar, también TECH_OPS", async function () {
      await f.issuance.send("grantRole", [await f.issuance.call("TECH_OPS"), f.signers[0]], f.board);
      await f.issuance.send("setInternalAccount", [f.bob, true, H.b32("OPERACION")], f.signers[0]);
      assert.equal(await f.issuance.call("isInternalAccount", [f.bob]), true);
      await H.expectRevert(
        f.issuance.send("setInternalAccount", [f.bob, false, H.b32("ERROR")], f.signers[0]),
        "InternalAccountUnflagNeedsBoard"
      );
      await f.issuance.send("setInternalAccount", [f.bob, false, H.b32("ERROR")], f.board);
      assert.equal(await f.issuance.call("isInternalAccount", [f.bob]), false);
    });
  });

  describe("cupo: doble control, espera y consumo único", function () {
    it("negativo: sin cupo fijado, la emisión bajo demanda queda bloqueada", async function () {
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 10, H.b32("pago_1"), H.b32("ev")], f.board),
        "BudgetNotSet"
      );
    });

    it("negativo: el cupo aprobado no se aplica antes de la espera", async function () {
      const c = await ordenDeCupo(f, {});
      await OA.aprobar(f, c.digest, H.b32("SET_MINT_BUDGET"));
      await H.expectRevert(
        f.issuance.send("setMintBudget", [c.tupla, c.digest, c.period, c.validUntil, c.docRoot], f.board),
        "BudgetWaitPending"
      );
    });

    it("negativo: un digest aprobado como MINT no sirve para fijar un cupo", async function () {
      const c = await ordenDeCupo(f, {});
      await OA.aprobar(f, c.digest, H.b32("MINT"));
      await H.increaseTime(F.GOV.timelockDelay + 1);
      await H.expectRevert(
        f.issuance.send("setMintBudget", [c.tupla, c.digest, c.period, c.validUntil, c.docRoot], f.board),
        "AuthorizationActionMismatch"
      );
    });

    it("negativo: cambiar la duración del periodo tras aprobar rompe la huella de términos", async function () {
      const c = await ordenDeCupo(f, {});
      await OA.aprobar(f, c.digest, H.b32("SET_MINT_BUDGET"));
      await H.increaseTime(F.GOV.timelockDelay + 1);
      await H.expectRevert(
        f.issuance.send("setMintBudget", [c.tupla, c.digest, 7 * DIA, c.validUntil, c.docRoot], f.board),
        "BudgetTermsMismatch"
      );
    });

    it("negativo: la aprobación del cupo se gasta; no se reutiliza", async function () {
      const c = await fijarCupo(f, {});
      await H.expectRevert(
        f.issuance.send("setMintBudget", [c.tupla, c.digest, c.period, c.validUntil, c.docRoot], f.board)
      );
    });

    it("negativo: sin límites del instrumento fijados, no hay cupo", async function () {
      const c = await ordenDeCupo(f, { assetId: f.ASSET_OLD });
      await OA.aprobar(f, c.digest, H.b32("SET_MINT_BUDGET"));
      await H.increaseTime(F.GOV.timelockDelay + 1);
      await H.expectRevert(
        f.issuance.send("setMintBudget", [c.tupla, c.digest, c.period, c.validUntil, c.docRoot], f.board),
        "LimitsNotFixed"
      );
    });
  });

  describe("emisión bajo demanda dentro del cupo", function () {
    beforeEach(async function () {
      await fijarCupo(f, { perPeriod: 1000, maxPerOp: 300 });
    });

    it("positivo: acuña al usuario exactamente lo pagado y descuenta del cupo", async function () {
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 250, H.b32("pago_1"), H.b32("recibo_1")], f.board);
      assert.equal(await bal(f, f.alice), 250n);
      assert.equal((await f.issuance.call("budgetRemaining", [f.ASSET_NEW])).toString(), "750");
    });

    it("negativo: el mismo pago no acuña dos veces", async function () {
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 100, H.b32("pago_1"), H.b32("r")], f.board);
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 100, H.b32("pago_1"), H.b32("r")], f.board),
        "OperationReplay"
      );
    });

    it("negativo: por encima del máximo por operación revierte", async function () {
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 301, H.b32("pago_x"), H.b32("r")], f.board),
        "BudgetOperationTooLarge"
      );
    });

    it("negativo: agotado el cupo del periodo revierte; el periodo siguiente se renueva", async function () {
      for (let i = 0; i < 3; i++) {
        await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 300, H.b32("p" + i), H.b32("r")], f.board);
      }
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.bob, 200, H.b32("p3"), H.b32("r")], f.board),
        "BudgetPeriodExceeded"
      );
      await H.increaseTime(DIA);
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.bob, 200, H.b32("p4"), H.b32("r")], f.board);
      assert.equal(await bal(f, f.bob), 200n);
    });

    it("negativo: nunca hacia una cuenta interna, ni dentro del cupo", async function () {
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.treasury, 10, H.b32("p_t"), H.b32("r")], f.board),
        "MintToInternalAccount"
      );
    });

    it("negativo: un destino no elegible lo rechaza el activo", async function () {
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.mallory, 10, H.b32("p_m"), H.b32("r")], f.board)
      );
      assert.equal(await supply(f), 0n);
    });

    it("negativo: el cupo no salta el tope de stock del instrumento", async function () {
      await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 400, 1000000], f.board);
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 300, H.b32("p1"), H.b32("r")], f.board);
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 200, H.b32("p2"), H.b32("r")], f.board),
        "OutstandingLimitExceeded"
      );
    });

    it("negativo: sólo el rol emisor ejecuta", async function () {
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 10, H.b32("p_z"), H.b32("r")], f.alice),
        "Unauthorized"
      );
    });

    it("negativo: con gobierno en pausa no se emite", async function () {
      await f.governance.send("emergencyPause", [H.b32("INCIDENTE"), 3600], f.signers[0]);
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 10, H.b32("p_p"), H.b32("r")], f.board),
        "Paused"
      );
    });

    it("positivo: un solo firmante corta el cupo al instante; reducir poder no necesita quórum", async function () {
      await f.issuance.send("revokeMintBudget", [f.ASSET_NEW, H.b32("SOSPECHA")], f.signers[2]);
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 10, H.b32("p_r"), H.b32("r")], f.board),
        "BudgetNotSet"
      );
      await H.expectRevert(
        f.issuance.send("revokeMintBudget", [f.ASSET_NEW, H.b32("X")], f.alice),
        "Unauthorized"
      );
    });

    it("negativo: vencido el cupo, no emite", async function () {
      await H.increaseTime(31 * DIA);
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 10, H.b32("p_v"), H.b32("r")], f.board),
        "BudgetExpired"
      );
    });
  });

  describe("quema al devolver: el circulante sigue siendo lo que tienen los usuarios", function () {
    it("positivo: el usuario consiente la quema de lo que devuelve y el suministro baja lo mismo", async function () {
      await fijarCupo(f, { perPeriod: 1000, maxPerOp: 500 });
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 400, H.b32("compra_a"), H.b32("r")], f.board);
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.bob, 100, H.b32("compra_b"), H.b32("r")], f.board);
      assert.equal(await supply(f), (await bal(f, f.alice)) + (await bal(f, f.bob)));

      const o = await ordenDeQuema(f, f.assetNew, f.ASSET_NEW, f.alice, 150, H.b32("REDENCION"), H.b32("venta_a"));
      await f.assetNew.send("approveBurnAuthorization", [o.digest], f.alice);
      await f.assetNew.send("burn", [o.tupla, o.digest], f.board);

      assert.equal(await bal(f, f.alice), 250n);
      assert.equal(await supply(f), 350n);
      assert.equal(await supply(f), (await bal(f, f.alice)) + (await bal(f, f.bob)));
    });
  });
});
