"use strict";
/* Revisión adversarial de SFSP-410 (2026-09-26) · pruebas de las correcciones.
 * Ver sfsp/auditoria/REVISION-SFSP410-2026-09-26.md (REV-410-04 y REV-410-05). */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");
const { buildAuthorization } = require("./authorization");

const DIA = 86400;
const ETH = 10n ** 18n;

describe("Revisión SFSP-410 · correcciones", function () {
  describe("REV-410-04 · mint() exige que gobierno haya aprobado el digest CON la etiqueta MINT", function () {
    let f;
    beforeEach(async function () {
      f = await F.deployAll();
      await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 5000, 1000000], f.board);
    });

    async function ordenMint(auth, amount, nonce) {
      const p = await OA.orden({
        verifyingContract: f.issuance.address,
        action: H.b32("MINT"),
        assetId: auth.assetId,
        origin: H.ZERO_ADDR,
        destination: auth.destination,
        amount: String(amount),
        nonce,
      });
      return { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };
    }

    it("negativo: un payload MINT aprobado con otra etiqueta no acuña", async function () {
      const { auth, sigs } = await buildAuthorization(f, { destination: f.alice });
      const o = await ordenMint(auth, 100, H.b32("rev_mint_1"));
      await OA.aprobar(f, o.digest, H.b32("SET_POLICY"));
      await H.expectRevert(
        f.issuance.send("mint", [auth, sigs, o.tupla, o.digest], f.board),
        "AuthorizationActionMismatch"
      );
      assert.equal(BigInt((await f.assetNew.call("totalSupply")).toString()), 0n);
    });

    it("positivo: el mismo payload aprobado como MINT sí acuña", async function () {
      const { auth, sigs } = await buildAuthorization(f, { destination: f.alice });
      const o = await ordenMint(auth, 100, H.b32("rev_mint_2"));
      await OA.aprobar(f, o.digest, H.b32("MINT"));
      await f.issuance.send("mint", [auth, sigs, o.tupla, o.digest], f.board);
      assert.equal(BigInt((await f.assetNew.call("balanceOf", [f.alice])).toString()), 100n);
    });
  });

  describe("REV-410-05 · la bóveda no se paga a sí misma", function () {
    let f, v;
    beforeEach(async function () {
      f = await F.deployAll();
      v = await H.deploy("SFSPNativeVault", [f.board, f.governance.address, f.engine.address, f.ASSET_NEW, String(10n ** 24n)], f.board);
      await v.send("grantRole", [await v.call("ISSUER"), f.board], f.board);
      await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), v.address], f.board);
      await v.sendValue("absorb", [H.b32("CONSOLIDACION")], f.board, 100n * ETH);
    });

    it("negativo: releaseOnDemand hacia la propia bóveda revierte y no consume cupo ni paymentRef", async function () {
      const ts = await H.now();
      const period = DIA, validUntil = ts + 30 * DIA, docRoot = H.b32("acta_cupo");
      const terms = await v.call("budgetTermsRoot", [period, validUntil, docRoot]);
      const p = await OA.orden({
        verifyingContract: v.address,
        action: H.b32("SET_RELEASE_BUDGET"),
        assetId: f.ASSET_NEW,
        amount: String(10n * ETH),
        amountSecondary: String(4n * ETH),
        nonce: H.b32("cupo_rev"),
        expiry: ts + 3 * 3600,
        evidenceRoot: terms,
      });
      const d = OA.digestDe(p);
      await OA.aprobar(f, d, H.b32("SET_RELEASE_BUDGET"));
      await H.increaseTime(F.GOV.timelockDelay + 1);
      await v.send("setReleaseBudget", [OA.tupla(p), d, period, validUntil, docRoot], f.board);

      await H.expectRevert(
        v.send("releaseOnDemand", [v.address, String(ETH), H.b32("pago_self"), H.b32("r")], f.board),
        "BudgetInvalid"
      );
      assert.equal(await v.call("isOperationUsed", [H.b32("pago_self")]), false);
      assert.equal(BigInt((await v.call("budgetRemaining")).toString()), 10n * ETH);
      assert.equal(BigInt((await v.call("totalReleased")).toString()), 0n);
    });

    it("negativo: release con orden de gobierno hacia la propia bóveda revierte", async function () {
      const p = await OA.orden({
        verifyingContract: v.address,
        action: H.b32("RELEASE_NATIVE"),
        assetId: f.ASSET_NEW,
        destination: v.address,
        amount: String(ETH),
        nonce: H.b32("lib_self"),
        evidenceRoot: H.b32("acta"),
      });
      const d = OA.digestDe(p);
      await OA.aprobar(f, d, H.b32("RELEASE_NATIVE"));
      await H.expectRevert(v.send("release", [OA.tupla(p), d], f.board), "BudgetInvalid");
      assert.equal(await f.governance.call("isAuthorizationApproved", [d]), true);
    });
  });

  describe("REV-410-10 · el script de despliegue exige TECH_OPS ≠ ISSUER ≠ Junta", function () {
    const path = require("node:path");
    const fs = require("node:fs");
    const Dp = require("../scripts/desplegar-sfsp410.js");
    const A = (n) => "0x" + n.toString(16).padStart(40, "0");

    function parametros(roles) {
      const P = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deploy", "sfsp410", "parametros.plantilla.json"), "utf8"));
      const rellenar = (x) => {
        if (Array.isArray(x)) return x.map(rellenar);
        if (x && typeof x === "object") {
          for (const k of Object.keys(x)) x[k] = x[k] === null ? "1" : rellenar(x[k]);
        }
        return x;
      };
      rellenar(P);
      P.desplegador = A(0x99);
      Object.assign(P.gobierno, {
        firmantes: [A(1), A(2), A(3)], quorum: 2, quorumUpgrade: 2,
        timelockSegundos: 10, pausaMaximaSegundos: 10, vigenciaOrdenesSegundos: 100,
      });
      Object.assign(P.roles, { junta: A(0x10), techOps: A(0x11), emisor: A(0x12), atestador: A(0x13), atestadorMigracion: A(0x14), auditor: A(0x15) }, roles);
      return P;
    }
    const falla = (P) => { try { Dp.validar(P); return null; } catch (e) { return e.message; } };

    it("negativo: techOps = emisor se rechaza", function () {
      assert.match(String(falla(parametros({ emisor: A(0x11) }))), /techOps y emisor/);
    });
    it("negativo: la Junta como emisor se rechaza", function () {
      assert.match(String(falla(parametros({ emisor: A(0x10) }))), /Junta no puede/);
    });
    it("positivo: con roles distintos la validación pasa de ese punto", function () {
      const m = String(falla(parametros({})));
      assert.doesNotMatch(m, /techOps y emisor|Junta no puede/);
    });
  });
});
