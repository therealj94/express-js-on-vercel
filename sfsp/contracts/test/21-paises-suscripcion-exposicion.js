"use strict";
/* SFSP v0.3 §7 (SFSP-120) y §8.5 · matriz de países, SUBSCRIBE, alcance de la
 * oferta exenta y límite de exposición POR IDENTIDAD.
 *
 * Qué cambia respecto de draft-0.5: la residencia del adquirente deja de poder
 * bloquear por defecto. Todo país no evaluado es SOLO_ENTRANTE: recibe,
 * mantiene, transfiere y redime; sólo SUSCRIBIR en primaria queda cerrado.
 * BLOQUEADO (sanción u orden con fundamento) cierra todo. Las políticas por
 * acción ya fijadas no cambian: por eso las pruebas 03 y 10 siguen como estaban.
 *
 * Todos los parámetros del límite de exposición son sintéticos. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const V = require("./v03");

const { CODE } = F;
const { PAIS, KIND, TIT, TIPO, LS, SIN_OTORGAMIENTO } = V;

const PA = H.b32("PA");
const HN = H.b32("HN");
const SUBSCRIBE = H.b32("SUBSCRIBE");
const LIC_EXENTA = H.b32("AUT_OG_OFERTA_EXENTA");
const LIC_ICL = H.b32("LIC_OG_INVESTMENT_CO");

describe("SFSP v0.3 §7 y §8.5 · países, suscripción primaria y exposición", function () {
  let f, SCOPE_COUNTRY, SCOPE_EXPOSURE, alice2, carol;

  async function residencia(dir, quien, pais, salt) {
    const purpose = await f.engine.call("residencePurpose", [pais]);
    const c = await V.darAlta(f, dir, F.SUBJ[quien] || H.b32("subj_" + quien), purpose, salt || H.b32("salt_res_" + quien));
    return { c, purpose };
  }

  async function pais(code, desde, hacia, o) {
    const x = o || {};
    const motivo = x.reason || H.b32("ASESORIA_LOCAL_SINT");
    const evid = x.evidence !== undefined ? x.evidence : H.ZERO32;
    const contenido = await f.engine.call("countryContent", [code, hacia, motivo, evid]);
    const ord = await V.ordenGob(f, {
      contrato: f.engine, action: "SET_COUNTRY", scope: SCOPE_COUNTRY,
      amount: x.ordenDesde !== undefined ? x.ordenDesde : desde, amountSecondary: hacia, evidenceRoot: contenido,
    });
    return await f.engine.send("setCountryStatus", [code, hacia, motivo, evid, ord.tupla, ord.digest], f.board);
  }

  async function baseColocacion(assetId, holder, tipo) {
    const motivo = H.b32("BASE_COLOCACION_SINT");
    const contenido = await f.engine.call("placementContent", [assetId, holder, tipo, motivo]);
    const ord = await V.ordenGob(f, {
      contrato: f.engine, action: "SET_PLACEMENT_BASIS", scope: assetId, evidenceRoot: contenido,
    });
    return await f.engine.send("setPlacementBasis", [assetId, holder, tipo, motivo, ord.tupla, ord.digest], f.board);
  }

  async function parametrosExposicion(e) {
    const motivo = H.b32("ACTA_SINTETICA");
    const contenido = await f.engine.call("exposureParamsContent", [e, motivo]);
    const ord = await V.ordenGob(f, {
      contrato: f.engine, action: "SET_EXPOSURE_PARAMS", scope: SCOPE_EXPOSURE, evidenceRoot: contenido,
    });
    return await f.engine.send("setExposureParams", [e, motivo, ord.tupla, ord.digest], f.board);
  }

  function suscribir(cuenta, ctx) {
    return f.engine.call("evaluateSubscription", [
      cuenta, F.ASSET_NEW, 100, H.ZERO32,
      { country: ctx.country || H.ZERO32, exposureRef: ctx.exposureRef || H.ZERO32, acquisitionCost: String(ctx.cost || 0) },
    ]);
  }

  function op(cuenta, accion) {
    return f.engine.call("evaluateOperation", [cuenta, F.ASSET_NEW, H.b32(accion), 10, H.ZERO32]);
  }

  beforeEach(async function () {
    f = await F.deployAll();
    alice2 = f.acc[10]; // segunda dirección de la MISMA identidad que alice
    carol = f.acc[11];
    SCOPE_COUNTRY = await f.engine.call("SCOPE_COUNTRY");
    SCOPE_EXPOSURE = await f.engine.call("SCOPE_EXPOSURE");
    await V.desplegarLicencias(f);
    await f.engine.send("setLicenseRegistry", [f.lic.address], f.board);
    await f.engine.send("grantRole", [await f.engine.call("EXPOSURE_OPERATOR"), f.board], f.board);
    await F.fijarPolitica(f, F.ASSET_NEW, SUBSCRIBE, F.policy({}), "sub");
    // El activo redime: así REDEEM se evalúa de verdad y no cae por su eje.
    await f.registry.send("setLifecycleAxis", [F.ASSET_NEW, F.Axis.REDEMPTION, F.Redemption.AVAILABLE], f.board);
    for (const [dir, subj] of [[alice2, F.SUBJ.alice], [carol, H.b32("subj_carol")]]) {
      await f.identity.send("bindPurposeCommitment", [dir, F.PURPOSE_BASE, F.compromiso(subj, F.PURPOSE_BASE, H.b32("salt_base_" + dir.slice(2, 8)))], f.board);
    }
  });

  describe("matriz de países", function () {
    it("positivo: SOLO_ENTRANTE por defecto permite recibir, transferir, liquidar y redimir; SUBSCRIBE no", async function () {
      const res = await residencia(f.alice, "alice", HN);
      await V.acreditar(f, res.c, res.purpose);
      assert.equal(Number(await f.engine.call("countryStatusOf", [HN])), PAIS.SOLO_ENTRANTE);
      for (const accion of ["TRANSFER_IN", "TRANSFER_OUT", "SETTLE", "REDEEM"]) {
        const r = await op(f.alice, accion);
        assert.equal(Number(r.result), CODE.ALLOW, accion + " tiene que pasar en SOLO_ENTRANTE");
      }
      const sinPais = await op(f.alice, "SUBSCRIBE");
      assert.equal(Number(sinPais.result), CODE.DENY_JURISDICTION);
      assert.equal(sinPais.reasonCode, H.b32("COUNTRY_INBOUND_ONLY"));
      const conPais = await suscribir(f.alice, { country: HN });
      assert.equal(Number(conPais.result), CODE.DENY_JURISDICTION);
      assert.equal(conPais.reasonCode, H.b32("COUNTRY_INBOUND_ONLY"));
    });

    it("negativo: un país declarado sin residencia acreditada es fuente desconocida, no un permiso", async function () {
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      // Alta de residencia sin claim vigente.
      await residencia(f.alice, "alice", PA);
      const r = await suscribir(f.alice, { country: PA });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("COUNTRY_UNPROVEN"));
      // Y declarar un país que no es el suyo tampoco sirve.
      const r2 = await suscribir(f.bob, { country: PA });
      assert.equal(Number(r2.result), CODE.UNKNOWN_SOURCE);
    });

    it("positivo: CountryStatusChanged lleva estado anterior, nuevo, motivo y fundamento", async function () {
      const rc = await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      const ev = V.logsDe(f.engine, rc).find((e) => e.name === "CountryStatusChanged");
      assert.equal(ev.args.countryCode, PA);
      assert.equal(ev.args.previousState, PAIS.SOLO_ENTRANTE);
      assert.equal(ev.args.newState, PAIS.PERMITIDO);
      assert.equal(ev.args.reasonCode, H.b32("ASESORIA_LOCAL_SINT"));
      assert.equal(ev.args.evidenceHash, H.ZERO32);
    });

    it("negativo: BLOQUEADO deniega TODAS las acciones del residente, aunque no declare su país", async function () {
      await residencia(f.alice, "alice", HN);
      // Bloquear sin fundamento no procede: no se bloquea por precaución.
      await H.expectRevert(pais(HN, PAIS.SOLO_ENTRANTE, PAIS.BLOQUEADO), "EvidenceRequired");
      await pais(HN, PAIS.SOLO_ENTRANTE, PAIS.BLOQUEADO, { reason: H.b32("SANCION_INTERNACIONAL"), evidence: H.b32("hash_resolucion") });
      for (const accion of ["TRANSFER_IN", "TRANSFER_OUT", "SETTLE", "REDEEM", "SUBSCRIBE", "MINT"]) {
        const r = await op(f.alice, accion);
        assert.equal(Number(r.result), CODE.DENY_JURISDICTION, accion);
        assert.equal(r.reasonCode, H.b32("COUNTRY_BLOCKED"), accion);
      }
      // bob no reside en HN: no le afecta.
      assert.equal(Number((await op(f.bob, "TRANSFER_OUT")).result), CODE.ALLOW);
      assert.deepEqual([...(await f.engine.call("blockedCountries"))], [HN]);

      // Levantar el bloqueo devuelve el acceso y vacía la lista.
      await pais(HN, PAIS.BLOQUEADO, PAIS.SOLO_ENTRANTE, { reason: H.b32("SANCION_LEVANTADA") });
      assert.equal(Number((await op(f.alice, "TRANSFER_OUT")).result), CODE.ALLOW);
      assert.deepEqual([...(await f.engine.call("blockedCountries"))], []);
    });

    it("negativo: código de país inválido, estado de partida falso u orden sin quórum no cambian la matriz", async function () {
      for (const malo of [H.b32("hn"), H.b32("HND"), H.b32("H"), H.ZERO32]) {
        await H.expectRevert(pais(malo, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO), "CountryCodeInvalid");
      }
      await H.expectRevert(pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO, { ordenDesde: PAIS.BLOQUEADO }), "CountryTransitionInvalid");
      const contenido = await f.engine.call("countryContent", [PA, PAIS.PERMITIDO, H.b32("X"), H.ZERO32]);
      const ord = await V.ordenGob(f, {
        contrato: f.engine, action: "SET_COUNTRY", scope: SCOPE_COUNTRY, amount: 0, amountSecondary: 1,
        evidenceRoot: contenido, aprobar: false,
      });
      await f.governance.send("proposeAuthorization", [ord.digest, H.b32("SET_COUNTRY")], f.signers[0]);
      await f.governance.send("approveAuthorization", [ord.digest], f.signers[1]);
      await H.expectRevert(
        f.engine.send("setCountryStatus", [PA, PAIS.PERMITIDO, H.b32("X"), H.ZERO32, ord.tupla, ord.digest], f.board),
        "PolicyNotAuthorized",
      );
      assert.equal(Number(await f.engine.call("countryStatusOf", [PA])), PAIS.SOLO_ENTRANTE);
    });

    it("negativo: PERMITIDO_CON_CONDICIONES sin reglas por instrumento bloquea la decisión", async function () {
      const { c, purpose } = await residencia(f.alice, "alice", PA);
      await V.acreditar(f, c, purpose);
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO_CON_CONDICIONES);
      const r = await suscribir(f.alice, { country: PA });
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("COUNTRY_CONDITIONS_UNSET"));
    });
  });

  describe("base de colocación y alcance de la oferta exenta", function () {
    async function residentesPA() {
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      const a = await residencia(f.alice, "alice", PA);
      await V.acreditar(f, a.c, a.purpose);
      const b = await residencia(f.bob, "bob", PA);
      await V.acreditar(f, b.c, b.purpose);
      // alice es residente de Próspera; bob no tiene ninguno de los tres perfiles.
      const pp = await f.engine.call("PURPOSE_PROSPERA_RESIDENT");
      const cp = await V.darAlta(f, f.alice, F.SUBJ.alice, pp, H.b32("salt_prospera"));
      await V.acreditar(f, cp, pp);
    }

    it("negativo: sin base de colocación, o sin segmento declarado, no se suscribe", async function () {
      await residentesPA();
      let r = await suscribir(f.alice, { country: PA });
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("PLACEMENT_BASIS_UNSET"));
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
      r = await suscribir(f.alice, { country: PA });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("SEGMENT_UNKNOWN"));
    });

    it("negativo: bajo AUTORIZACION_LIMITADA sólo suscribe el perfil admitido; con licencia plena, cualquiera del país", async function () {
      await residentesPA();
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }));
      const rc = await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
      assert.ok(V.logsDe(f.engine, rc).find((e) => e.name === "PlacementBasisSet"));

      assert.equal(Number((await suscribir(f.alice, { country: PA })).result), CODE.ALLOW, "residente de Próspera");
      const rb = await suscribir(f.bob, { country: PA });
      assert.equal(Number(rb.result), CODE.DENY_ELIGIBILITY, "un residente de país PERMITIDO sin perfil admitido no suscribe");
      assert.equal(rb.reasonCode, H.b32("EXEMPT_OFFER_SCOPE"));
      // Transferir sí puede: el alcance limita la SUSCRIPCIÓN, no el secundario.
      assert.equal(Number((await op(f.bob, "TRANSFER_OUT")).result), CODE.ALLOW);

      // Con la Investment Company License como base, el perfil deja de importar.
      await V.licenciaVigente(f, LIC_ICL, V.terminos(TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO);
      assert.equal(Number((await suscribir(f.bob, { country: PA })).result), CODE.ALLOW);
    });

    it("negativo: la autorización suspendida o vencida cierra la suscripción", async function () {
      await residentesPA();
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }), 0.02);
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
      assert.equal(Number((await suscribir(f.alice, { country: PA })).result), CODE.ALLOW);
      await V.transicion(f, LIC_EXENTA, LS.VIGENTE, LS.SUSPENDIDA, SIN_OTORGAMIENTO, H.b32("SUSPENSION"));
      let r = await suscribir(f.alice, { country: PA });
      assert.equal(Number(r.result), CODE.DENY_AUTHORIZATION);
      assert.equal(r.reasonCode, H.b32("PLACEMENT_LICENSE_NOT_IN_FORCE"));
      await V.transicion(f, LIC_EXENTA, LS.SUSPENDIDA, LS.VIGENTE, SIN_OTORGAMIENTO, H.b32("LEVANTAMIENTO"));
      assert.equal(Number((await suscribir(f.alice, { country: PA })).result), CODE.ALLOW);
      // Vence por plazo (unos 29 minutos): nadie tiene que registrarlo.
      await H.increaseTime(1800);
      r = await suscribir(f.alice, { country: PA });
      assert.equal(Number(r.result), CODE.DENY_AUTHORIZATION);
    });
  });

  describe("límite de exposición por identidad (Mercado de Crecimiento)", function () {
    let PURPOSE_EXP, refAlice;
    const PARAMS = { set: true, incomeBps: 1000, floor: 100, ceiling: 10000, declarationTtl: 3000 };

    beforeEach(async function () {
      PURPOSE_EXP = await f.engine.call("PURPOSE_EXPOSURE");
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      await V.fijarSegmento(f, F.ASSET_NEW, "CRECIMIENTO");
      await V.licenciaVigente(f, LIC_ICL, V.terminos(TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO);
      // Las DOS direcciones de alice: misma residencia y MISMO compromiso de
      // exposición, porque son la misma identidad.
      const saltRes = H.b32("salt_res_alice");
      const res = await residencia(f.alice, "alice", PA, saltRes);
      await residencia(alice2, "alice", PA, saltRes);
      await V.acreditar(f, res.c, res.purpose);
      refAlice = await V.darAlta(f, f.alice, F.SUBJ.alice, PURPOSE_EXP, H.b32("salt_exp_alice"));
      await V.darAlta(f, alice2, F.SUBJ.alice, PURPOSE_EXP, H.b32("salt_exp_alice"));
    });

    it("negativo: sin parámetros (null) el límite es BLOCKED_DECISION y no se admiten declaraciones", async function () {
      const r = await suscribir(f.alice, { country: PA, exposureRef: refAlice, cost: 10 });
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_PARAMS_UNSET"));
      await H.expectRevert(f.engine.send("declareIncome", [refAlice, 1000], f.board), "ExposureParamsNotSet");
      await H.expectRevert(
        f.engine.send("recordAcquisition", [f.alice, refAlice, F.ASSET_NEW, 10], f.board),
        "ExposureParamsNotSet",
      );
      for (const malo of [
        Object.assign({}, PARAMS, { incomeBps: 0 }),
        Object.assign({}, PARAMS, { incomeBps: 10001 }),
        Object.assign({}, PARAMS, { floor: 20000 }),
        Object.assign({}, PARAMS, { declarationTtl: 0 }),
      ]) {
        await H.expectRevert(parametrosExposicion(malo), "ExposureParamsInvalid");
      }
    });

    it("negativo: exceder el límite con varias direcciones de la MISMA identidad no funciona", async function () {
      const rcp = await parametrosExposicion(PARAMS);
      assert.ok(V.logsDe(f.engine, rcp).find((e) => e.name === "ExposureParamsSet"));
      const rcd = await f.engine.send("declareIncome", [refAlice, 20000], f.board); // 10 % => 2000
      const evd = V.logsDe(f.engine, rcd).find((e) => e.name === "ExposureLimitRecorded");
      assert.equal(evd.args.regime, H.b32("CRECIMIENTO"));
      assert.notEqual(evd.args.declarationRef, refAlice, "el evento no expone el compromiso tal cual");
      assert.ok(!Object.keys(evd.args).includes("declaredIncome"), "el ingreso no viaja en el evento");

      // Sin declaración del adquirente para ESTE activo, no suscribe.
      let r = await suscribir(f.alice, { country: PA, exposureRef: refAlice, cost: 1500 });
      assert.equal(Number(r.result), CODE.DENY_ELIGIBILITY);
      assert.equal(r.reasonCode, H.b32("ACQUIRER_DECLARATION_MISSING"));
      const rca = await f.engine.send(
        "recordAcquirerDeclaration", [F.ASSET_NEW, refAlice, H.b32("hash_terminos_v3"), 3], f.board,
      );
      const eva = V.logsDe(f.engine, rca).find((e) => e.name === "AcquirerDeclarationRecorded");
      assert.equal(eva.args.assetId, F.ASSET_NEW);
      assert.equal(Number(eva.args.documentVersion), 3);
      assert.equal(eva.args.documentHash, H.b32("hash_terminos_v3"));

      assert.equal(Number((await suscribir(f.alice, { country: PA, exposureRef: refAlice, cost: 1500 })).result), CODE.ALLOW);
      await f.engine.send("recordAcquisition", [f.alice, refAlice, F.ASSET_NEW, 1500], f.board);

      // La segunda dirección de alice ve el MISMO consumo: 1500 + 600 > 2000.
      r = await suscribir(alice2, { country: PA, exposureRef: refAlice, cost: 600 });
      assert.equal(Number(r.result), CODE.DENY_LIMIT);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_LIMIT_EXCEEDED"));
      await H.expectRevert(
        f.engine.send("recordAcquisition", [alice2, refAlice, F.ASSET_NEW, 600], f.board),
        "ExposureLimitExceeded",
      );
      // Presentar otro compromiso (uno inventado) no abre otro límite.
      const inventado = F.compromiso(F.SUBJ.alice, PURPOSE_EXP, H.b32("otra_sal"));
      r = await suscribir(alice2, { country: PA, exposureRef: inventado, cost: 600 });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_REF_UNBOUND"));
      await H.expectRevert(
        f.engine.send("recordAcquisition", [alice2, inventado, F.ASSET_NEW, 600], f.board),
        "ExposureRefUnbound",
      );
      // Lo que cabe, cabe; y al vender se libera a COSTO de adquisición.
      assert.equal(Number((await suscribir(alice2, { country: PA, exposureRef: refAlice, cost: 500 })).result), CODE.ALLOW);
      await f.engine.send("releaseExposure", [refAlice, 1000], f.board);
      assert.equal(BigInt((await f.engine.call("exposureUsedOf", [refAlice])).toString()), 500n);
    });

    it("positivo: piso y techo acotan el porcentaje del ingreso autodeclarado", async function () {
      await parametrosExposicion(PARAMS);
      await f.engine.send("declareIncome", [refAlice, 10], f.board); // 10 % de 10 = 1 → piso 100
      assert.equal(BigInt((await f.engine.call("exposureLimitOf", [refAlice])).limit.toString()), 100n);
      await f.engine.send("declareIncome", [refAlice, 10_000_000], f.board); // → techo 10000
      assert.equal(BigInt((await f.engine.call("exposureLimitOf", [refAlice])).limit.toString()), 10000n);
    });

    it("negativo: la autodeclaración vencida deja el límite desconocido; sin costo tampoco se decide", async function () {
      await parametrosExposicion(PARAMS);
      await f.engine.send("declareIncome", [refAlice, 20000], f.board);
      await f.engine.send("recordAcquirerDeclaration", [F.ASSET_NEW, refAlice, H.b32("hash_terminos_v1"), 1], f.board);
      let r = await suscribir(f.alice, { country: PA, exposureRef: refAlice, cost: 0 });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("ACQUISITION_COST_UNKNOWN"));
      await H.increaseTime(3001);
      r = await suscribir(f.alice, { country: PA, exposureRef: refAlice, cost: 10 });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("INCOME_DECLARATION_MISSING"));
    });

    it("negativo: sólo el operador registra; y en el Mercado Principal no hay límite que registrar", async function () {
      await parametrosExposicion(PARAMS);
      await H.expectRevert(f.engine.send("declareIncome", [refAlice, 20000], f.alice), "Unauthorized");
      await H.expectRevert(
        f.engine.send("recordAcquisition", [f.alice, refAlice, F.ASSET_NEW, 1], f.alice),
        "Unauthorized",
      );
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await f.engine.send("declareIncome", [refAlice, 20000], f.board);
      await H.expectRevert(
        f.engine.send("recordAcquisition", [f.alice, refAlice, F.ASSET_NEW, 1], f.board),
        "NotGrowthSegment",
      );
      // En Principal la suscripción no mira la exposición.
      assert.equal(Number((await suscribir(f.alice, { country: PA })).result), CODE.ALLOW);
    });
  });
});
