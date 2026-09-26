"use strict";
/* SFSP v0.3 §6 y §7 · SFSP-120 §0.3 · SUBSCRIBE en la RUTA DE DINERO.
 *
 * Hallazgo de la revisión del 26-sep: la matriz de países, el alcance de la
 * oferta exenta y el límite de exposición vivían sólo en una vista
 * (`evaluateSubscription`) que ningún contrato llamaba. La venta primaria
 * pasaba por `mintOnDemand` (evalúa MINT) o `releaseOnDemand` (evalúa MINT), y
 * un residente de un país SOLO_ENTRANTE, o alguien fuera del alcance de la
 * oferta exenta, compraba en primaria.
 *
 * Ahora la venta tiene su entrada (`mintOnSubscription`, `releaseOnSubscription`)
 * que hace cumplir SUBSCRIBE en el motor en la MISMA transacción, y la migración
 * tiene su cupo propio (SET_MIGRATION_BUDGET) que sigue por `*OnDemand`.
 *
 * Regla de vivo: la exigencia nace APAGADA (compuerta en cero en el emisor,
 * `subscriptionRequired = false` en la bóveda) para no romper a quien ya integra
 * `mintOnDemand`/`releaseOnDemand`. Encendida, un cupo de venta ya no se consume
 * sin SUBSCRIBE. Todo sintético. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");
const V = require("./v03");

const DIA = 86400;
const ETH = 10n ** 18n;
const PA = H.b32("PA");
const HN = H.b32("HN");

/** Orden de cupo aprobada con la etiqueta `accion` (sin esperar ni ejecutar). */
async function ordenCupo(f, contrato, accion, o) {
  const x = o || {};
  const ts = await H.now();
  const period = DIA;
  const validUntil = ts + 30 * DIA;
  const docRoot = H.b32("acta_cupo_" + accion.slice(0, 12));
  const terms = await contrato.call("budgetTermsRoot", [period, validUntil, docRoot]);
  const p = await OA.orden({
    verifyingContract: contrato.address,
    action: H.b32(accion),
    assetId: f.ASSET_NEW,
    amount: String(x.perPeriod || 1000),
    amountSecondary: String(x.maxPerOp || 500),
    nonce: F.nonceUnico("cupo_" + accion),
    expiry: ts + 3 * 3600,
    evidenceRoot: terms,
  });
  const d = OA.digestDe(p);
  await OA.aprobar(f, d, H.b32(x.etiqueta || accion));
  return { tupla: OA.tupla(p), d, period, validUntil, docRoot };
}

/** Montaje: cupos primero (la espera del timelock vencería las atestaciones),
 *  identidad después. carol reside en HN (SOLO_ENTRANTE por defecto), alice y
 *  bob en PA (PERMITIDO); sólo alice tiene un perfil de la oferta exenta. */
async function montar(o) {
  const x = o || {};
  const f = await F.deployAll();
  f.carol = f.acc[11];
  await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 1_000_000, 100_000_000], f.board);
  f.SUB_EXEC = await f.engine.call("SUBSCRIPTION_EXECUTOR");
  await f.engine.send("grantRole", [f.SUB_EXEC, f.issuance.address], f.board);

  const pendientes = [];
  if (x.cupoEmision) pendientes.push(["iss", await ordenCupo(f, f.issuance, x.cupoEmision)]);
  if (x.boveda) {
    f.v = await H.deploy("SFSPNativeVault", [f.board, f.governance.address, f.engine.address, f.ASSET_NEW, String(10n ** 24n)], f.board);
    await f.v.send("grantRole", [await f.v.call("ISSUER"), f.board], f.board);
    await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), f.v.address], f.board);
    await f.engine.send("grantRole", [f.SUB_EXEC, f.v.address], f.board);
    await f.v.sendValue("absorb", [H.b32("CONSOLIDACION")], f.board, 100n * ETH);
    pendientes.push(["vault", await ordenCupo(f, f.v, x.boveda, { perPeriod: String(50n * ETH), maxPerOp: String(10n * ETH) })]);
  }
  if (pendientes.length) {
    await H.increaseTime(F.GOV.timelockDelay + 1);
    for (const [quien, c] of pendientes) {
      const contrato = quien === "iss" ? f.issuance : f.v;
      const fn = quien === "iss" ? "setMintBudget" : "setReleaseBudget";
      await contrato.send(fn, [c.tupla, c.d, c.period, c.validUntil, c.docRoot], f.board);
    }
  }

  await V.entornoSuscripcion(f, [f.ASSET_NEW], { base: x.base || "EXENTA", segmento: x.segmento });
  await f.identity.send("bindPurposeCommitment", [f.carol, F.PURPOSE_BASE, F.compromiso(H.b32("subj_carol"), F.PURPOSE_BASE, H.b32("salt_base_carol"))], f.board);
  f.sal = {
    alice: (await V.altaResidencia(f, f.alice, PA)).salt,
    bob: (await V.altaResidencia(f, f.bob, PA)).salt,
    carol: (await V.altaResidencia(f, f.carol, HN)).salt,
  };
  // alice y carol tienen el perfil de residente de Próspera: carol es la que
  // cumple el ALCANCE de la oferta exenta pero reside en un país SOLO_ENTRANTE.
  await V.perfilProspera(f, f.alice, "alice");
  await V.perfilProspera(f, f.carol, "carol");
  return f;
}

const ctx = (f, quien, pais, extra) => V.ctxSuscripcion(Object.assign({ country: pais, salt: f.sal[quien] }, extra || {}));
const saldoDe = async (f, who) => BigInt((await f.assetNew.call("balanceOf", [who])).toString());
const nativo = async (who) => BigInt(await H.provider.send("eth_getBalance", [who, "latest"]));

/** Revierte con SubscriptionRejected(código, motivo) del motor. */
async function rechazada(f, promise, motivo) {
  const msg = await V.revertCon(promise, f.engine, "SubscriptionRejected");
  assert.ok(msg.toLowerCase().includes(H.b32(motivo).slice(2)), "motivo esperado " + motivo + "\n" + msg);
}

describe("SFSP v0.3 §6 y §7 · SUBSCRIBE en la ruta de dinero", function () {
  describe("emisión bajo demanda (SFSPIssuanceController)", function () {
    let f;
    beforeEach(async function () {
      f = await montar({ cupoEmision: "SET_MINT_BUDGET" });
    });

    it("compatibilidad: con la compuerta apagada (valor de despliegue) mintOnDemand acuña como antes y la venta con SUBSCRIBE responde BLOCKED_DECISION", async function () {
      assert.equal(await f.issuance.call("subscriptionGate"), H.ZERO_ADDR);
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.carol, 10, H.b32("pago_legado"), H.b32("r")], f.board);
      assert.equal(await saldoDe(f, f.carol), 10n);
      await V.revertCon(
        f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.alice, 10, H.b32("pago_v"), H.b32("r"), ctx(f, "alice", PA)], f.board),
        f.issuance, "SubscriptionGateUnset",
      );
    });

    it("escenario del hallazgo: compuerta encendida, un residente de un país SOLO_ENTRANTE no compra en primaria, ni por mintOnDemand ni por la venta", async function () {
      const rc = await f.issuance.send("setSubscriptionGate", [f.engine.address, H.b32("V03_SUSCRIPCION")], f.board);
      const ev = V.logsDe(f.issuance, rc).find((e) => e.name === "SubscriptionGateSet");
      assert.equal(ev.args.gate.toLowerCase(), f.engine.address.toLowerCase());
      // carol (HN, SOLO_ENTRANTE por defecto) tiene alta BASE, perfil admitido
      // y MINT la dejaría pasar: antes recibía en primaria.
      assert.equal(Number((await f.engine.call("evaluateOperation", [f.carol, f.ASSET_NEW, H.b32("MINT"), 100, H.ZERO32])).result), F.CODE.ALLOW);
      await V.revertCon(
        f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.carol, 100, H.b32("pago_1"), H.b32("r")], f.board),
        f.issuance, "SubscriptionRequired",
      );
      await rechazada(f, f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.carol, 100, H.b32("pago_2"), H.b32("r"), ctx(f, "carol", HN)], f.board), "COUNTRY_INBOUND_ONLY");
      assert.equal(await saldoDe(f, f.carol), 0n);
      assert.equal((await f.issuance.call("budgetRemaining", [f.ASSET_NEW])).toString(), "1000", "el cupo no se consume");
    });

    it("negativo: fuera del alcance de la oferta exenta no compra aunque su país esté PERMITIDO", async function () {
      await f.issuance.send("setSubscriptionGate", [f.engine.address, H.b32("V03_SUSCRIPCION")], f.board);
      await rechazada(f, f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.bob, 100, H.b32("pago_b"), H.b32("r"), ctx(f, "bob", PA)], f.board), "EXEMPT_OFFER_SCOPE");
      assert.equal(await saldoDe(f, f.bob), 0n);
    });

    it("positivo: el perfil admitido desde un país PERMITIDO compra; el motor deja constancia sin publicar la dirección", async function () {
      await f.issuance.send("setSubscriptionGate", [f.engine.address, H.b32("V03_SUSCRIPCION")], f.board);
      const rc = await f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.alice, 250, H.b32("pago_a"), H.b32("recibo_a"), ctx(f, "alice", PA)], f.board);
      assert.equal(await saldoDe(f, f.alice), 250n);
      assert.equal((await f.issuance.call("budgetRemaining", [f.ASSET_NEW])).toString(), "750");
      const ev = V.logsDe(f.engine, rc).find((e) => e.name === "EligibilityRecorded");
      assert.ok(ev, "EligibilityRecorded en la misma transacción");
      assert.equal(ev.args.action, H.b32("SUBSCRIBE"));
      assert.ok(V.logsDe(f.issuance, rc).find((e) => e.name === "MintOnDemand"));
      // El mismo pago no compra dos veces.
      await V.revertCon(
        f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.alice, 250, H.b32("pago_a"), H.b32("recibo_a"), ctx(f, "alice", PA)], f.board),
        f.issuance, "OperationReplay",
      );
    });

    it("negativo: sólo la Junta enciende o apaga la compuerta; sin el rol de ejecutor en el motor, la venta falla cerrada", async function () {
      await f.issuance.send("grantRole", [await f.issuance.call("TECH_OPS"), f.signers[0]], f.board);
      await H.expectRevert(f.issuance.send("setSubscriptionGate", [f.engine.address, H.b32("X")], f.signers[0]), "Unauthorized");
      await H.expectRevert(f.issuance.send("setSubscriptionGate", [f.engine.address, H.b32("X")], f.alice), "Unauthorized");
      await f.issuance.send("setSubscriptionGate", [f.engine.address, H.b32("V03_SUSCRIPCION")], f.board);
      await f.engine.send("revokeRole", [f.SUB_EXEC, f.issuance.address], f.board);
      await H.expectRevert(
        f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.alice, 10, H.b32("pago_z"), H.b32("r"), ctx(f, "alice", PA)], f.board),
        "Unauthorized",
      );
      // Y nadie sin el rol hace cumplir (ni gasta) una suscripción en el motor.
      await H.expectRevert(f.engine.send("enforceSubscription", [f.alice, f.ASSET_NEW, 10, ctx(f, "alice", PA)], f.alice), "Unauthorized");
    });
  });

  describe("cupo de MIGRACIÓN (SET_MIGRATION_BUDGET)", function () {
    let f;
    beforeEach(async function () {
      f = await montar({ cupoEmision: "SET_MIGRATION_BUDGET" });
      await f.issuance.send("setSubscriptionGate", [f.engine.address, H.b32("V03_SUSCRIPCION")], f.board);
    });

    it("positivo: con la compuerta encendida la migración sigue por mintOnDemand, también para un tenedor de un país SOLO_ENTRANTE", async function () {
      assert.equal(await f.issuance.call("isMigrationBudget", [f.ASSET_NEW]), true);
      // Migrar no es suscribir: el alcance limita la suscripción, no la tenencia.
      await f.issuance.send("mintOnDemand", [f.ASSET_NEW, f.carol, 300, H.b32("MIGRACION_carol"), H.b32("raiz_padron")], f.board);
      assert.equal(await saldoDe(f, f.carol), 300n);
    });

    it("negativo: un cupo de migración no vende; al revocarlo deja de ser de migración", async function () {
      await V.revertCon(
        f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.alice, 10, H.b32("pago_m"), H.b32("r"), ctx(f, "alice", PA)], f.board),
        f.issuance, "BudgetKindMismatch",
      );
      await f.issuance.send("revokeMintBudget", [f.ASSET_NEW, H.b32("MIGRACION_FIN")], f.board);
      assert.equal(await f.issuance.call("isMigrationBudget", [f.ASSET_NEW]), false);
    });

    it("negativo: el tipo de cupo lo deciden los firmantes: una orden de migración aprobada con la etiqueta de venta no se ejecuta", async function () {
      const c = await ordenCupo(f, f.issuance, "SET_MIGRATION_BUDGET", { etiqueta: "SET_MINT_BUDGET" });
      await H.increaseTime(F.GOV.timelockDelay + 1);
      await H.expectRevert(
        f.issuance.send("setMintBudget", [c.tupla, c.d, c.period, c.validUntil, c.docRoot], f.board),
        "AuthorizationActionMismatch",
      );
    });
  });

  describe("Mercado de Crecimiento: la venta gasta la autorización de exposición en la misma transacción", function () {
    it("positivo y negativo: una autorización, una compra; la segunda revierte", async function () {
      const f = await montar({ cupoEmision: "SET_MINT_BUDGET", base: "ICL", segmento: "CRECIMIENTO" });
      await f.issuance.send("setSubscriptionGate", [f.engine.address, H.b32("V03_SUSCRIPCION")], f.board);
      await f.engine.send("grantRole", [await f.engine.call("EXPOSURE_OPERATOR"), f.board], f.board);
      await V.fijarParametrosExposicion(f, { set: true, incomeBps: 1000, floor: 100, ceiling: 10000, declarationTtl: 3000 });
      const N = H.b32("op_bob_1");
      // Sin autorización del agregador: la exposición es desconocida y no compra.
      await rechazada(f, f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.bob, 100, H.b32("pb0"), H.b32("r"), ctx(f, "bob", PA, { nonce: N, cost: 100 })], f.board), "EXPOSURE_CLEARANCE_MISSING");
      const id = await f.engine.call("exposureClearanceId", [f.bob, f.ASSET_NEW, N]);
      await f.engine.send("recordExposureClearance", [id, f.ASSET_NEW, 150, (await H.now()) + 600, H.b32("terminos"), 1], f.board);
      await f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.bob, 100, H.b32("pb1"), H.b32("r"), ctx(f, "bob", PA, { nonce: N, cost: 150 })], f.board);
      assert.equal(await saldoDe(f, f.bob), 100n);
      assert.equal((await f.engine.call("clearanceOf", [id])).used, true);
      await rechazada(f, f.issuance.send("mintOnSubscription", [f.ASSET_NEW, f.bob, 100, H.b32("pb2"), H.b32("r"), ctx(f, "bob", PA, { nonce: N, cost: 150 })], f.board), "EXPOSURE_CLEARANCE_USED");
    });
  });

  describe("bóveda de ORIGEN (SFSPNativeVault): la puerta única", function () {
    it("compatibilidad y cierre: apagada libera como antes; encendida, la venta exige SUBSCRIBE", async function () {
      const f = await montar({ boveda: "SET_RELEASE_BUDGET" });
      assert.equal(await f.v.call("subscriptionRequired"), false);
      const c0 = await nativo(f.carol);
      await f.v.send("releaseOnDemand", [f.carol, String(ETH), H.b32("pago_legado"), H.b32("r")], f.board);
      assert.equal((await nativo(f.carol)) - c0, ETH);

      await H.expectRevert(f.v.send("setSubscriptionRequired", [true, H.b32("X")], f.alice), "Unauthorized");
      const rc = await f.v.send("setSubscriptionRequired", [true, H.b32("V03_SUSCRIPCION")], f.board);
      const ev = V.logsDe(f.v, rc).find((e) => e.name === "SubscriptionRequirementSet");
      assert.equal(ev.args.required, true);
      assert.equal(ev.args.assetId, f.ASSET_NEW);

      await V.revertCon(f.v.send("releaseOnDemand", [f.carol, String(ETH), H.b32("pago_1"), H.b32("r")], f.board), f.v, "SubscriptionRequired");
      await rechazada(f, f.v.send("releaseOnSubscription", [f.carol, String(ETH), H.b32("pago_2"), H.b32("r"), ctx(f, "carol", HN)], f.board), "COUNTRY_INBOUND_ONLY");
      await rechazada(f, f.v.send("releaseOnSubscription", [f.bob, String(ETH), H.b32("pago_3"), H.b32("r"), ctx(f, "bob", PA)], f.board), "EXEMPT_OFFER_SCOPE");
      const a0 = await nativo(f.alice);
      await f.v.send("releaseOnSubscription", [f.alice, String(2n * ETH), H.b32("pago_4"), H.b32("r"), ctx(f, "alice", PA)], f.board);
      assert.equal((await nativo(f.alice)) - a0, 2n * ETH);
    });

    it("positivo: el lote de migración (SET_MIGRATION_BUDGET) sigue por releaseOnDemand con la exigencia encendida, y no vende", async function () {
      const f = await montar({ boveda: "SET_MIGRATION_BUDGET" });
      await f.v.send("setSubscriptionRequired", [true, H.b32("V03_SUSCRIPCION")], f.board);
      assert.equal(await f.v.call("releaseBudgetIsMigration"), true);
      const c0 = await nativo(f.carol);
      await f.v.send("releaseOnDemand", [f.carol, String(ETH), H.b32("LOTE_ORIGEN_carol"), H.b32("raiz_lote")], f.board);
      assert.equal((await nativo(f.carol)) - c0, ETH);
      await V.revertCon(
        f.v.send("releaseOnSubscription", [f.alice, String(ETH), H.b32("pago_x"), H.b32("r"), ctx(f, "alice", PA)], f.board),
        f.v, "BudgetKindMismatch",
      );
    });
  });
});
