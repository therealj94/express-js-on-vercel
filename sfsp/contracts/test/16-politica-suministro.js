"use strict";
/* SFSP-410 · Política de suministro: el circulante es lo que está en manos de
 * usuarios. No se acuña inventario; se acuña al usuario cuando paga, dentro de
 * un cupo que gobierno aprobó con doble control y espera, y se quema cuando el
 * usuario devuelve. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");
const { buildAuthorization, acunar, ordenDeQuema, aprobacionDbnx, colocable, DEST_ADQUIRENTE_ELEGIBLE } = require("./authorization");
const V = require("./v03");

const DIA = 86400;

async function ordenDeCupo(f, o) {
  const ts = await H.now();
  const period = o.period || DIA;
  const validUntil = o.validUntil || ts + 30 * DIA;
  // v0.3 §5 · el documento de respaldo del cupo es la aprobación DBNX: su
  // cantidad es el TOTAL que el cupo puede crear y su regla de destino dice si
  // es una colocación (SUBSCRIBE) o una migración.
  const docRoot = o.docRoot || (await aprobacionDbnx(f, o.assetId || f.ASSET_NEW, o.dbnxTotal || 1000000,
    "cupo_" + String(o.nonce || "1") + "_" + ts, { validUntil: ts + 60 * DIA, migration: o.migration, destination: o.destino }));
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
    // SFSP-120 §0.3 · acuñar al usuario que pagó es colocar: alice y bob suscriben.
    await colocable(f, [f.alice, f.bob]);
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

  describe("v0.3 §5 · el cupo también pasa por DBNX (T-200-28/29 en la ruta de cupo)", function () {
    async function intentar(o) {
      const c = await ordenDeCupo(f, o);
      await OA.aprobar(f, c.digest, H.b32("SET_MINT_BUDGET"));
      await H.increaseTime(F.GOV.timelockDelay + 1);
      return f.issuance.send("setMintBudget", [c.tupla, c.digest, c.period, c.validUntil, c.docRoot], f.board);
    }

    it("negativo: sin documento DBNX registrado, de otro activo o de destino exacto, no hay cupo", async function () {
      await H.expectRevert(intentar({ docRoot: H.b32("acta_sin_dbnx") }), "DbnxApprovalUnknown");
      const otro = await aprobacionDbnx(f, f.ASSET_OLD, 1000000, "cupo_otro_activo", { validUntil: (await H.now()) + 60 * DIA });
      await H.expectRevert(intentar({ docRoot: otro, nonce: H.b32("c2") }), "DbnxApprovalAssetMismatch");
      // Un documento para UNA acuñación a una dirección no sirve de cupo.
      const exacto = await aprobacionDbnx(f, f.ASSET_NEW, 1000000, "cupo_exacto", { destination: f.alice, validUntil: (await H.now()) + 60 * DIA });
      await H.expectRevert(intentar({ docRoot: exacto, nonce: H.b32("c3") }), "DbnxApprovalDestinationMismatch");
      assert.equal((await f.issuance.call("budgetRemaining", [f.ASSET_NEW])).toString(), "0");
    });

    it("negativo: DBNX por menos que el monto por periodo, o con vigencia más corta que el cupo, no sirve", async function () {
      await H.expectRevert(intentar({ dbnxTotal: 999, perPeriod: 1000 }), "DbnxApprovalAmountMismatch");
      const ts = await H.now();
      const corto = await aprobacionDbnx(f, f.ASSET_NEW, 1000000, "cupo_corto", { validUntil: ts + 5 * DIA });
      await H.expectRevert(intentar({ docRoot: corto, nonce: H.b32("c4") }), "DbnxApprovalWindowExceeded");
    });

    it("negativo: el documento DBNX del cupo se gasta al fijarlo y acota el TOTAL, aunque el periodo se renueve", async function () {
      const c = await fijarCupo(f, { perPeriod: 500, maxPerOp: 300, dbnxTotal: 700 });
      const a = await f.issuance.call("dbnxApprovalOf", [c.docRoot]);
      assert.equal(a.usedBy, c.digest, "gastado por el digest del cupo");
      assert.equal((await f.issuance.call("budgetRemaining", [f.ASSET_NEW])).toString(), "500");
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 300, H.b32("d1"), H.b32("r")], f.board);
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 200, H.b32("d2"), H.b32("r")], f.board);
      await H.increaseTime(DIA);
      // Periodo nuevo: el cupo del periodo se renueva, lo aprobado por DBNX no.
      assert.equal((await f.issuance.call("budgetRemaining", [f.ASSET_NEW])).toString(), "200");
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.bob, 300, H.b32("d3"), H.b32("r")], f.board),
        "BudgetDbnxExhausted",
      );
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.bob, 200, H.b32("d4"), H.b32("r")], f.board);
      assert.equal(await supply(f), 700n, "nunca más de lo que DBNX aprobó");
    });

    it("negativo (T-700-27): un cupo vigente no se sustituye sin revocarlo antes", async function () {
      await fijarCupo(f, { nonce: H.b32("m1"), migration: true, destino: H.b32("raiz_padron_sint") });
      await H.expectRevert(fijarCupo(f, { nonce: H.b32("m2") }), "BudgetInForce");
      await f.issuance.send("revokeMintBudget", [f.ASSET_NEW, H.b32("MIGRACION_FIN")], f.board);
      await fijarCupo(f, { nonce: H.b32("m3") });
      assert.equal((await f.issuance.call("budgetAuthorizationOf", [f.ASSET_NEW])).migration, false);
    });
  });

  describe("SFSP-120 §0.3 · emitir al usuario que pagó es COLOCAR: SUBSCRIBE en la misma transacción", function () {
    let carol;
    beforeEach(async function () {
      carol = f.acc[11];
      // carol es conocida (BASE) y reside en un país SOLO_ENTRANTE: puede tener,
      // no suscribir en primaria.
      await f.identity.send("bindPurposeCommitment", [carol, F.PURPOSE_BASE, F.compromiso(H.b32("subj_carol"), F.PURPOSE_BASE, H.b32("salt_carol"))], f.board);
      await V.acreditarResidencia(f, carol, H.b32("HN"), "carol");
    });

    it("negativo (T-120-21, T-120-25): mintOnDemand a un residente SOLO_ENTRANTE revierte, aunque MINT dé ALLOW", async function () {
      await fijarCupo(f, {});
      const mint = await f.engine.call("evaluateOperation", [carol, f.ASSET_NEW, H.b32("MINT"), 10, H.ZERO32]);
      assert.equal(Number(mint.result), F.CODE.ALLOW);
      await V.revertCon(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, carol, 10, H.b32("p_carol"), H.b32("r")], f.board),
        f.engine, "SubscriptionRejected",
      );
      assert.equal(await bal(f, carol), 0n);
    });

    it("negativo: mint por orden de gobierno a un residente SOLO_ENTRANTE también revierte", async function () {
      const { auth, sigs } = await buildAuthorization(f, { destination: carol, amount: 100, nonce: H.b32("n_carol") });
      await V.revertCon(acunar(f, { auth, sigs }, 100, H.b32("op_carol")), f.engine, "SubscriptionRejected");
      assert.equal(await bal(f, carol), 0n);
    });

    it("positivo: un cupo de MIGRACIÓN (continuidad de tenencia, ADR-016) evalúa MINT y no SUBSCRIBE", async function () {
      await fijarCupo(f, { migration: true, destino: H.b32("raiz_padron_sint") });
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, carol, 10, H.b32("MIGRACION_carol"), H.b32("raiz_padron_sint")], f.board);
      assert.equal(await bal(f, carol), 10n);
    });

    it("negativo: sin el rol de ejecutor en el motor, no se coloca (no hay colocación sin SUBSCRIBE)", async function () {
      await fijarCupo(f, {});
      await f.engine.send("revokeRole", [await f.engine.call("SUBSCRIPTION_EXECUTOR"), f.issuance.address], f.board);
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 10, H.b32("p_sin_rol"), H.b32("r")], f.board),
        "Unauthorized",
      );
      assert.equal(await supply(f), 0n);
    });
  });

  describe("SFSP-300 §0.2 · un activo COM no se coloca desde el controlador de emisión (T-300-30)", function () {
    it("negativo: marcado COM, ni mintOnDemand ni mint acuñan a un tercero; sólo la Junta lo desmarca", async function () {
      await fijarCupo(f, {});
      await f.issuance.send("grantRole", [await f.issuance.call("TECH_OPS"), f.signers[0]], f.board);
      const rc = await f.issuance.send("setCommodityAsset", [f.ASSET_NEW, true, H.b32("CLASE_COM")], f.signers[0]);
      assert.ok(V.logsDe(f.issuance, rc).find((e) => e.name === "CommodityAssetFlagged"));
      await H.expectRevert(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.alice, 10, H.b32("p_com"), H.b32("r")], f.board),
        "CommodityPlacementViaReserveEngine",
      );
      const { auth, sigs } = await buildAuthorization(f, { destination: f.alice, amount: 10, nonce: H.b32("n_com") });
      await H.expectRevert(acunar(f, { auth, sigs }, 10, H.b32("op_com")), "CommodityPlacementViaReserveEngine");
      await H.expectRevert(
        f.issuance.send("setCommodityAsset", [f.ASSET_NEW, false, H.b32("ERROR")], f.signers[0]),
        "Unauthorized",
      );
      assert.equal(await supply(f), 0n);
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
