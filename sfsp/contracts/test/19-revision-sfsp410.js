"use strict";
/* Revisión adversarial de SFSP-410 (2026-09-26) · pruebas de las correcciones.
 * Ver sfsp/auditoria/REVISION-SFSP410-2026-09-26.md (REV-410-04 y REV-410-05). */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");
const { buildAuthorization, aprobacionDbnx } = require("./authorization");
const V = require("./v03");

const DIA = 86400;
const ETH = 10n ** 18n;

describe("Revisión SFSP-410 · correcciones", function () {
  describe("REV-410-04 · mint() exige que gobierno haya aprobado el digest CON la etiqueta MINT", function () {
    let f;
    beforeEach(async function () {
      f = await F.deployAll();
      await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 5000, 1000000], f.board);
      // SFSP-120 §0.3 · acuñar a un tercero es colocar: alice suscribe.
      await V.habilitarSuscripcion(f, [F.ASSET_NEW], [f.alice], [f.issuance.address]);
    });

    async function ordenMint(auth, amount, nonce) {
      // v0.3 §5 · la acuñación exige además el documento de aprobación DBNX,
      // con la cantidad y el destino exactos.
      const docHash = await aprobacionDbnx(f, auth.assetId, amount, "rev_" + nonce, { destination: auth.destination });
      const p = await OA.orden({
        verifyingContract: f.issuance.address,
        action: H.b32("MINT"),
        assetId: auth.assetId,
        origin: H.ZERO_ADDR,
        destination: auth.destination,
        amount: String(amount),
        nonce,
        evidenceRoot: docHash,
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
      Object.assign(P.roles, { junta: A(0x10), techOps: A(0x11), emisor: A(0x12), atestador: A(0x13), atestadorMigracion: A(0x14), auditor: A(0x15), dbnx: A(0x16) }, roles);
      return P;
    }
    const falla = (P) => { try { Dp.validar(P); return null; } catch (e) { return e.message; } };

    it("negativo: techOps = emisor se rechaza", function () {
      assert.match(String(falla(parametros({ emisor: A(0x11) }))), /techOps y emisor/);
    });
    it("negativo: la Junta como emisor se rechaza", function () {
      assert.match(String(falla(parametros({ emisor: A(0x10) }))), /Junta no puede/);
    });
    it("negativo (v0.3 §5): DBNX no puede ser el emisor ni techOps", function () {
      assert.match(String(falla(parametros({ dbnx: A(0x12) }))), /dbnx no puede ser/);
      assert.match(String(falla(parametros({ dbnx: A(0x11) }))), /dbnx no puede ser/);
    });
    it("positivo: con roles distintos la validación pasa de ese punto", function () {
      const m = String(falla(parametros({})));
      assert.doesNotMatch(m, /techOps y emisor|Junta no puede|dbnx/);
    });
    it("negativo (v0.3 §5.2): la cuenta DBNX no puede ser el emisor ni techOps; sin ella, BLOCKED_DECISION", function () {
      assert.match(String(falla(parametros({ dbnx: A(0x12) }))), /dbnx/);
      assert.match(String(falla(parametros({ dbnx: A(0x11) }))), /dbnx/);
      const P = parametros({});
      P.roles.dbnx = null;
      assert.match(String(falla(P)), /BLOCKED_DECISION/);
      const plantilla = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deploy", "sfsp410", "parametros.plantilla.json"), "utf8"));
      assert.equal(plantilla.roles.dbnx, null, "la plantilla deja DBNX sin decidir (D07/D27)");
    });
  });

  describe("despliegue en proceso: el rol DBNX queda concedido y verificado (sin él, toda emisión por mint() revierte)", function () {
    const path = require("node:path");
    const fs = require("node:fs");
    const os = require("node:os");
    const hre = require("hardhat");
    const Dp = require("../scripts/desplegar-sfsp410.js");
    const A = (n) => "0x" + n.toString(16).padStart(40, "0");

    function sinteticos(cuentas) {
      const P = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deploy", "sfsp410", "parametros.plantilla.json"), "utf8"));
      const [desplegador, f1, f2, f3, junta, techOps, emisor, atestador, atestadorMig, auditor, dbnx] = cuentas;
      const pas = (unit) => ({
        issuerId: "SINTETICO:EMISOR", legalInstrumentId: "SINTETICO:INSTRUMENTO", economicType: "SINTETICO",
        legalClass: "SINTETICO:CLASE", jurisdiction: "SINTETICO:JUR", unit,
        rightsTemplateId: "SINTETICO:DERECHOS", rightsTemplateVersion: "v0", documentRoot: "SINTETICO:DOC",
        transferPolicyId: "SINTETICO:TRANSFER", redemptionPolicyId: "SINTETICO:REDENCION", listingPolicyId: "SINTETICO:LISTADO",
        capacidades: { freeze: true, forcedTransfer: true },
        estado: { legal: "CLASSIFIED", admission: "APPROVED", trading: "NOT_LISTED", transferability: "RESTRICTED", redemption: "NONE" },
      });
      const pol = (acciones) => ({
        acciones, requiresHumanReview: false, requiresAuthorization: false, jurisdictionAllowlist: false,
        jurisdiccionesPermitidas: [], requiredPurpose: "NINGUNO", maxAmount: "0",
      });
      const hasta = Math.floor(Date.now() / 1000) + 400 * 86400;
      const cupo = (doc) => ({ perPeriod: "1000", period: 86400, maxPerOperation: "100", validUntil: hasta, termsDocRoot: doc });
      const a0 = P.activos[0];
      return {
        ...P,
        _estado: "SINTETICO — prueba en proceso; nunca va a red real.",
        sintetico: true,
        red: { ...P.red, genesisHash: H.ZERO32 },
        desplegador,
        gobierno: { ...P.gobierno, firmantes: [f1, f2, f3], quorum: 2, quorumUpgrade: 2, timelockSegundos: 10, pausaMaximaSegundos: 10, vigenciaOrdenesSegundos: 100 },
        roles: { ...P.roles, junta, techOps, emisor, atestador, atestadorMigracion: atestadorMig, auditor, dbnx },
        origen: { ...P.origen, pasaporte: pas("ORIGEN"), politicaElegibilidad: pol(["MINT"]), cupoLiberacion: cupo("SINTETICO:CUPO:ORIGEN") },
        activos: [{
          ...a0, erc20Interop: true,
          limites: { outstandingLimit: "1000000", cumulativeCap: "1000000" },
          cupoEmision: cupo("SINTETICO:CUPO:" + a0.simbolo),
          pasaporte: pas(a0.simbolo),
          politicaElegibilidad: pol(a0.politicaElegibilidad.acciones),
        }],
        cuentasInternas: { ...P.cuentasInternas, confirmadaPorActa: true, lista: [{ direccion: A(0x51), grupo: "SINTETICA" }] },
      };
    }

    it("positivo: el paso 6 concede DBNX a roles.dbnx, el paso 8 lo verifica y esa cuenta registra aprobaciones", async function () {
      const cuentas = (await H.accounts()).slice(8, 19);
      const S = sinteticos(cuentas);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sfsp410-dbnx-"));
      const ruta = path.join(dir, "parametros.json");
      fs.writeFileSync(ruta, JSON.stringify(S, null, 2));
      const reg = await Dp.desplegar({ prov: hre.network.provider, rutaParametros: ruta, real: false, modo: "proceso", log: () => {} });
      fs.rmSync(dir, { recursive: true, force: true });
      const fila = reg.roles.find((r) => r.rol === "DBNX");
      assert.ok(fila, "el registro de despliegue muestra quién es DBNX");
      assert.equal(fila.cuenta.toLowerCase(), S.roles.dbnx.toLowerCase());
      assert.equal(fila.verificado, true);
      const art = await hre.artifacts.readArtifact("SFSPIssuanceController");
      const iss = new H.Contract(reg.contratos.SFSPIssuanceController.address, art.abi);
      assert.equal(await iss.call("hasRole", [await iss.call("DBNX"), S.roles.dbnx]), true);
      assert.equal(await iss.call("hasRole", [await iss.call("DBNX"), S.desplegador]), false);
      const ts = await H.now();
      // Destino exacto (una acuñación) y clase colocación: SFSP-200 §0.5 fila 1.
      await iss.send("registerDbnxApproval", [H.b32("doc_despliegue"), reg.activos[S.activos[0].simbolo].assetId, 10, ts - 1, ts + 100, "0x" + S.roles.emisor.slice(2).toLowerCase().padStart(64, "0"), false], S.roles.dbnx);
      assert.equal((await iss.call("dbnxApprovalOf", [H.b32("doc_despliegue")])).signer.toLowerCase(), S.roles.dbnx.toLowerCase());
    });
  });
});
