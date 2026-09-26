"use strict";
/* SFSP v0.3 §4.2 y §5 · pasaporte ampliado, identificador jerárquico y
 * verificación previa a la acuñación.
 *
 * Pasaporte: cada campo nuevo lleva fecha y vigencia, y un campo cuya vigencia
 * pasó se LEE como VENCIDO, no como el último valor conocido. Cada cambio sube
 * la versión y deja la anterior consultable (PassportUpdated con motivo).
 *
 * Acuñación: DBNX no acuña; Orden Global no crea supply sin su aprobación.
 * `mint` exige que el hash de un documento de aprobación DBNX —registrado por
 * una cuenta con el rol DBNX, vigente, del mismo activo y por la cantidad
 * EXACTA— vaya dentro de la orden de gobierno. Si no, revierte y no se acuña. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");
const V = require("./v03");
const { buildAuthorization, aprobacionDbnx } = require("./authorization");

const { CAMPO, DIA } = V;

describe("SFSP v0.3 §4.2 · pasaporte ampliado", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  async function detallesCompletos(dias) {
    const d = (x) => V.campoFechado(x, dias);
    const ts = await H.now();
    return V.detalles({
      auditor: await d("AUDITOR_SINT"),
      valuator: await d("VALUADOR_SINT"),
      custodian: await d("CUSTODIO_SINT"),
      segment: await d("CRECIMIENTO"),
      coverage: { ratioBps: 10250, asOf: ts - 10, validUntil: ts + Math.round(dias * DIA) },
      releaseSchedule: await d("hash_calendario"),
      redemptionTerms: await d("hash_redencion"),
      licenses: await d("raiz_licencias"),
      documentRoot: await d("raiz_documental"),
    });
  }

  it("positivo: declarar los campos v0.3 sube la versión, emite PassportUpdated y conserva la anterior", async function () {
    assert.equal(Number(await f.registry.call("passportVersionOf", [F.ASSET_NEW])), 1);
    const d = await detallesCompletos(30);
    const rc = await V.fijarDetalles(f, F.ASSET_NEW, d, H.b32("ADMISION_DBNX"));
    const ev = V.logsDe(f.registry, rc).find((e) => e.name === "PassportUpdated");
    assert.equal(ev.args.assetId, F.ASSET_NEW);
    assert.equal(Number(ev.args.previousVersion), 1);
    assert.equal(Number(ev.args.newVersion), 2);
    assert.equal(ev.args.reasonCode, H.b32("ADMISION_DBNX"));
    assert.notEqual(ev.args.passportHash, H.ZERO32);

    for (let i = 0; i <= 8; i++) {
      const st = await f.registry.call("passportFieldStatus", [F.ASSET_NEW, i]);
      assert.equal(Number(st.status), CAMPO.VIGENTE, "campo " + i);
    }
    assert.equal(BigInt((await f.registry.call("passportFieldStatus", [F.ASSET_NEW, 4])).value), 10250n);
    const seg = await f.registry.call("segmentOf", [F.ASSET_NEW]);
    assert.equal(seg.segment, H.b32("CRECIMIENTO"));
    assert.equal(seg.inForce, true);

    // La versión 1 sigue consultable, tal como estaba: sin declarar.
    const v1 = await f.registry.call("passportDetailsAt", [F.ASSET_NEW, 1]);
    assert.equal(v1.details.auditor.value, H.ZERO32);
    assert.equal(v1.meta.reasonCode, H.b32("REGISTRO"));
    const v2 = await f.registry.call("passportDetailsAt", [F.ASSET_NEW, 2]);
    assert.equal(v2.details.auditor.value, H.b32("AUDITOR_SINT"));
    assert.equal(v2.meta.passportHash, ev.args.passportHash);
  });

  it("negativo: un campo vencido se lee VENCIDO y sin valor; el segmento vencido no está en vigor", async function () {
    const d = await detallesCompletos(30);
    d.auditor = await V.campoFechado("AUDITOR_SINT", 1);
    d.segment = await V.campoFechado("CRECIMIENTO", 1);
    await V.fijarDetalles(f, F.ASSET_NEW, d);
    await H.increaseTime(DIA + 1);
    const aud = await f.registry.call("passportFieldStatus", [F.ASSET_NEW, 0]);
    assert.equal(Number(aud.status), CAMPO.VENCIDO);
    assert.equal(aud.value, H.ZERO32, "un dato caduco no se presenta como vigente");
    assert.ok(Number(aud.validUntil) > 0, "sí se informa hasta cuándo valió");
    const seg = await f.registry.call("segmentOf", [F.ASSET_NEW]);
    assert.equal(seg.inForce, false);
    // Los demás siguen vigentes: la vigencia es por campo.
    assert.equal(Number((await f.registry.call("passportFieldStatus", [F.ASSET_NEW, 1])).status), CAMPO.VIGENTE);
    // Y un campo nunca declarado no es «vencido»: es NO_DECLARADO.
    await V.fijarDetalles(f, F.ASSET_OLD, V.detalles({}));
    assert.equal(Number((await f.registry.call("passportFieldStatus", [F.ASSET_OLD, 2])).status), CAMPO.VACIO);
  });

  it("negativo: campos mal fechados, segmento desconocido o datos sin valor se rechazan", async function () {
    const ts = await H.now();
    const casos = [
      { auditor: { value: H.b32("A"), asOf: 0, validUntil: ts + 100 } },               // valor sin fecha
      { valuator: { value: H.b32("V"), asOf: ts + 1000, validUntil: ts + 2000 } },     // fecha futura
      { custodian: { value: H.b32("C"), asOf: ts - 10, validUntil: ts - 20 } },        // vigencia invertida
      { segment: { value: H.b32("MEDIANO"), asOf: ts - 10, validUntil: ts + 100 } },   // segmento inexistente
      { licenses: { value: H.ZERO32, asOf: ts - 10, validUntil: ts + 100 } },          // fechas sin valor
      { coverage: { ratioBps: 5000, asOf: 0, validUntil: 0 } },                        // ratio sin fecha
    ];
    for (const o of casos) {
      await H.expectRevert(V.fijarDetalles(f, F.ASSET_NEW, V.detalles(o)), "PassportFieldInvalid");
    }
    assert.equal(Number(await f.registry.call("passportVersionOf", [F.ASSET_NEW])), 1);
  });

  it("negativo: sin orden, con otra versión, otro contenido u otra etiqueta no se modifica el pasaporte", async function () {
    const d = await detallesCompletos(30);
    const motivo = H.b32("MOTIVO_SINT");
    // Orden aprobada para otro motivo: el contenido difiere.
    const o1 = await V.ordenPasaporte(f, F.ASSET_NEW, d, H.b32("OTRO_MOTIVO"));
    await H.expectRevert(
      f.registry.send("updatePassportDetails", [F.ASSET_NEW, d, motivo, o1.tupla, o1.digest], f.board),
      "PolicyContentMismatch",
    );
    // Orden con la versión equivocada.
    const o2 = await V.ordenPasaporte(f, F.ASSET_NEW, d, motivo, { amount: 7, amountSecondary: 8 });
    await H.expectRevert(
      f.registry.send("updatePassportDetails", [F.ASSET_NEW, d, motivo, o2.tupla, o2.digest], f.board),
      "PolicyVersionMismatch",
    );
    // Etiqueta distinta de PASSPORT_UPDATE.
    const o3 = await V.ordenPasaporte(f, F.ASSET_NEW, d, motivo, { etiqueta: "SET_POLICY" });
    await H.expectRevert(
      f.registry.send("updatePassportDetails", [F.ASSET_NEW, d, motivo, o3.tupla, o3.digest], f.board),
      "AuthorizationActionMismatch",
    );
    // Motivo vacío.
    await H.expectRevert(V.fijarDetalles(f, F.ASSET_NEW, d, H.ZERO32), "ReasonRequired");
    // La buena, una vez; repetida ya no (versión y consumo).
    const ok = await V.ordenPasaporte(f, F.ASSET_NEW, d, motivo);
    await f.registry.send("updatePassportDetails", [F.ASSET_NEW, d, motivo, ok.tupla, ok.digest], f.board);
    await H.expectRevert(
      f.registry.send("updatePassportDetails", [F.ASSET_NEW, d, motivo, ok.tupla, ok.digest], f.board),
      "PolicyVersionMismatch",
    );
    assert.equal(Number(await f.registry.call("passportVersionOf", [F.ASSET_NEW])), 2);
  });

  describe("identificador jerárquico", function () {
    it("positivo: clase/autoridad/correlativo, estable, correlativo sin huecos y con búsqueda inversa", async function () {
      const rc = await f.registry.send("assignHierarchicalId", [F.ASSET_NEW, H.b32("SECURITY"), H.b32("DBNX")], f.board);
      const ev = V.logsDe(f.registry, rc).find((e) => e.name === "PassportUpdated");
      assert.equal(ev.args.reasonCode, H.b32("ID_JERARQUICO_ASIGNADO"));
      await f.registry.send("assignHierarchicalId", [F.ASSET_OLD, H.b32("SECURITY"), H.b32("DBNX")], f.board);
      const a = await f.registry.call("hierarchicalIdOf", [F.ASSET_NEW]);
      const b = await f.registry.call("hierarchicalIdOf", [F.ASSET_OLD]);
      assert.equal(Number(a.serial), 1);
      assert.equal(Number(b.serial), 2);
      assert.equal(await f.registry.call("assetByHierarchicalId", [H.b32("SECURITY"), H.b32("DBNX"), 2]), F.ASSET_OLD);
      // Otra autoridad empieza su propio correlativo.
      const id = H.b32("SFSP:COM:TEST:1");
      await f.registry.send("registerAsset", [F.passport(id)], f.board);
      await f.registry.send("assignHierarchicalId", [id, H.b32("COMMODITY"), H.b32("DBNX_COM")], f.board);
      assert.equal(Number((await f.registry.call("hierarchicalIdOf", [id])).serial), 1);
    });

    it("negativo: clase desconocida, autoridad mal formada o reasignación se rechazan", async function () {
      const malos = [
        [H.b32("BOND"), H.b32("DBNX"), "HierarchicalIdInvalid"],
        [H.b32("SECURITY"), H.b32("dbnx"), "HierarchicalIdInvalid"],
        [H.b32("SECURITY"), H.ZERO32, "HierarchicalIdInvalid"],
        [H.b32("SECURITY"), H.b32("DB NX"), "HierarchicalIdInvalid"],
        [H.b32("SECURITY"), H.b32("AUTORIDAD_DEMASIADO_LARGA"), "HierarchicalIdInvalid"],
        // Un byte nulo en medio daría dos codificaciones de la misma autoridad.
        [H.b32("SECURITY"), "0x4442004e58" + "00".repeat(27), "HierarchicalIdInvalid"],
      ];
      for (const [clase, autoridad, frag] of malos) {
        await H.expectRevert(f.registry.send("assignHierarchicalId", [F.ASSET_NEW, clase, autoridad], f.board), frag);
      }
      await H.expectRevert(
        f.registry.send("assignHierarchicalId", [F.ASSET_NEW, H.b32("SECURITY"), H.b32("DBNX")], f.mallory),
        "Unauthorized",
      );
      await f.registry.send("assignHierarchicalId", [F.ASSET_NEW, H.b32("SECURITY"), H.b32("DBNX")], f.board);
      await H.expectRevert(
        f.registry.send("assignHierarchicalId", [F.ASSET_NEW, H.b32("MONETARY"), H.b32("DBNX")], f.board),
        "HierarchicalIdAlreadyAssigned",
      );
    });
  });
});

describe("SFSP v0.3 §5 · verificación previa a la acuñación (aprobación DBNX)", function () {
  let f, seq;
  beforeEach(async function () {
    f = await F.deployAll();
    seq = 0;
    await f.issuance.send("setInstrumentLimits", [F.ASSET_NEW, 1000000, 1000000], f.board);
  });

  /** Intenta acuñar `amount` con `docHash` en la orden de gobierno. */
  async function acunarCon(amount, docHash, o) {
    const x = o || {};
    seq += 1;
    const sobre = await buildAuthorization(f, { destination: f.alice, amount: 5000, nonce: H.b32("pre_env_" + seq) });
    const p = await OA.orden({
      verifyingContract: f.issuance.address,
      action: H.b32("MINT"),
      assetId: x.assetId || F.ASSET_NEW,
      origin: H.ZERO_ADDR,
      destination: f.alice,
      amount: String(amount),
      nonce: H.b32("pre_op_" + seq),
      evidenceRoot: docHash,
    });
    const d = OA.digestDe(p);
    await OA.aprobar(f, d, H.b32("MINT"));
    return await f.issuance.send("mint", [sobre.auth, sobre.sigs, OA.tupla(p), d], f.board);
  }

  async function saldo() {
    return BigInt((await f.assetNew.call("balanceOf", [f.alice])).toString());
  }

  it("positivo: con la aprobación DBNX por la cantidad exacta, acuña; el documento queda gastado por esa operación", async function () {
    const rc0Hash = await aprobacionDbnx(f, F.ASSET_NEW, 1000, "exacta");
    await acunarCon(1000, rc0Hash);
    assert.equal(await saldo(), 1000n);
    const a = await f.issuance.call("dbnxApprovalOf", [rc0Hash]);
    assert.equal(a.signer.toLowerCase(), f.dbnx.toLowerCase());
    assert.equal(a.usedBy, H.b32("pre_op_1"));
  });

  it("positivo: DbnxApprovalRecorded publica activo, firmante, cantidad y vigencia", async function () {
    const ts = await H.now();
    const doc = H.b32("doc_evento");
    const rc = await f.issuance.send("registerDbnxApproval", [doc, F.ASSET_NEW, 777, ts - 1, ts + 100], f.dbnx);
    const ev = V.logsDe(f.issuance, rc).find((e) => e.name === "DbnxApprovalRecorded");
    assert.equal(ev.args.docHash, doc);
    assert.equal(ev.args.assetId, F.ASSET_NEW);
    assert.equal(ev.args.signer.toLowerCase(), f.dbnx.toLowerCase());
    assert.equal(BigInt(ev.args.amount.toString()), 777n);
  });

  it("negativo: una aprobación por OTRA cantidad no acuña, ni de más ni de menos", async function () {
    const doc = await aprobacionDbnx(f, F.ASSET_NEW, 1000, "monto");
    await H.expectRevert(acunarCon(999, doc), "DbnxApprovalAmountMismatch");
    await H.expectRevert(acunarCon(1001, doc), "DbnxApprovalAmountMismatch");
    assert.equal(await saldo(), 0n);
  });

  it("negativo: sin documento, con un hash no registrado o de otro activo, revierte", async function () {
    await H.expectRevert(acunarCon(100, H.ZERO32), "DbnxApprovalRequired");
    await H.expectRevert(acunarCon(100, H.b32("doc_no_registrado")), "DbnxApprovalUnknown");
    const otro = await aprobacionDbnx(f, F.ASSET_OLD, 100, "otro_activo");
    await H.expectRevert(acunarCon(100, otro), "DbnxApprovalAssetMismatch");
    assert.equal(await saldo(), 0n);
  });

  it("negativo: una aprobación vencida o todavía no vigente no acuña", async function () {
    const ts = await H.now();
    const futura = await aprobacionDbnx(f, F.ASSET_NEW, 100, "futura", { validFrom: ts + 5000, validUntil: ts + 9000 });
    await H.expectRevert(acunarCon(100, futura), "DbnxApprovalNotInForce");
    const corta = await aprobacionDbnx(f, F.ASSET_NEW, 100, "corta", { validFrom: ts - 10, validUntil: ts + 120 });
    await H.increaseTime(121);
    await H.expectRevert(acunarCon(100, corta), "DbnxApprovalNotInForce");
    assert.equal(await saldo(), 0n);
  });

  it("negativo: la misma aprobación no sirve dos veces, ni revocada", async function () {
    const doc = await aprobacionDbnx(f, F.ASSET_NEW, 100, "una_vez");
    await acunarCon(100, doc);
    await H.expectRevert(acunarCon(100, doc), "DbnxApprovalAlreadyUsed");
    await H.expectRevert(f.issuance.send("revokeDbnxApproval", [doc, H.b32("X")], f.dbnx), "DbnxApprovalAlreadyUsed");
    const rev = await aprobacionDbnx(f, F.ASSET_NEW, 100, "revocada");
    const rc = await f.issuance.send("revokeDbnxApproval", [rev, H.b32("ERROR_EXPEDIENTE")], f.dbnx);
    assert.ok(V.logsDe(f.issuance, rc).find((e) => e.name === "DbnxApprovalRevoked"));
    await H.expectRevert(acunarCon(100, rev), "DbnxApprovalRevokedErr");
    assert.equal(await saldo(), 100n);
  });

  it("negativo: sólo el rol DBNX registra, el emisor no puede ser DBNX y un firmante que perdió el rol no vale", async function () {
    const ts = await H.now();
    await H.expectRevert(
      f.issuance.send("registerDbnxApproval", [H.b32("doc_x"), F.ASSET_NEW, 100, ts - 1, ts + 100], f.mallory),
      "Unauthorized",
    );
    // El emisor (ISSUER) recibe también el rol DBNX: la separación lo impide.
    await f.issuance.send("grantRole", [await f.issuance.call("DBNX"), f.board], f.board);
    await H.expectRevert(
      f.issuance.send("registerDbnxApproval", [H.b32("doc_y"), F.ASSET_NEW, 100, ts - 1, ts + 100], f.board),
      "DbnxSeparationOfDuties",
    );
    // Registrada por DBNX y luego DBNX pierde el rol: la aprobación deja de valer.
    const doc = await aprobacionDbnx(f, F.ASSET_NEW, 100, "rol_perdido");
    await f.issuance.send("revokeRole", [await f.issuance.call("DBNX"), f.dbnx], f.board);
    await H.expectRevert(acunarCon(100, doc), "DbnxApprovalSignerNotDbnx");
    assert.equal(await saldo(), 0n);
  });

  it("negativo: registrar dos veces el mismo documento, o con cantidad cero, se rechaza", async function () {
    const doc = await aprobacionDbnx(f, F.ASSET_NEW, 100, "duplicado");
    const ts = await H.now();
    await H.expectRevert(
      f.issuance.send("registerDbnxApproval", [doc, F.ASSET_NEW, 100, ts - 1, ts + 100], f.dbnx),
      "DbnxApprovalExists",
    );
    await H.expectRevert(
      f.issuance.send("registerDbnxApproval", [H.b32("doc_cero"), F.ASSET_NEW, 0, ts - 1, ts + 100], f.dbnx),
      "DbnxApprovalInvalid",
    );
  });
});
