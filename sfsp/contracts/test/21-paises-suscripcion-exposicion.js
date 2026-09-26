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
 * El país de la suscripción no lo declara el llamador: el motor busca, entre los
 * países abiertos, aquel en que la dirección acredita residencia.
 *
 * Límite de exposición (v0.3 §8.5, §11 y §12; SFSP-110 §0): el agregado por
 * identidad se calcula FUERA de la cadena, en Genesis ID; a la cadena llega sólo
 * el resultado de UNA adquisición, sin ingreso y sin compromiso estable de la
 * identidad. Todos los parámetros del límite de exposición son sintéticos. */
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

  function suscribir(cuenta, unidades) {
    return f.engine.call("evaluateSubscription", [cuenta, F.ASSET_NEW, String(unidades || 100), H.ZERO32]);
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
      // T-120-21 · residente acreditado de un país no evaluado: SOLO_ENTRANTE.
      const conPais = await suscribir(f.alice);
      assert.equal(Number(conPais.result), CODE.DENY_JURISDICTION);
      assert.equal(conPais.reasonCode, H.b32("COUNTRY_INBOUND_ONLY"));
    });

    it("negativo: sin residencia ACREDITADA en un país abierto no se suscribe; el país no se declara", async function () {
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      assert.deepEqual([...(await f.engine.call("openCountries"))], [PA]);
      // Alta de residencia sin claim vigente: no acredita nada.
      await residencia(f.alice, "alice", PA);
      const r = await suscribir(f.alice);
      assert.equal(Number(r.result), CODE.DENY_JURISDICTION);
      assert.equal(r.reasonCode, H.b32("COUNTRY_INBOUND_ONLY"));
      // Quien no tiene residencia en PA tampoco suscribe porque PA esté abierto.
      const r2 = await suscribir(f.bob);
      assert.equal(Number(r2.result), CODE.DENY_JURISDICTION);
      // Cerrar el país lo saca de la lista de países abiertos.
      await pais(PA, PAIS.PERMITIDO, PAIS.SOLO_ENTRANTE, { reason: H.b32("CIERRE_SINT") });
      assert.deepEqual([...(await f.engine.call("openCountries"))], []);
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
      const r = await suscribir(f.alice);
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

    async function exenta() {
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }));
      return await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
    }

    async function perfil(dir, nombre, subj) {
      const purpose = await f.engine.call(nombre);
      const c = await V.darAlta(f, dir, subj, purpose, H.b32("salt_" + nombre.slice(8, 20)));
      await V.acreditar(f, c, purpose);
      return purpose;
    }

    async function criterio(purpose, o) {
      const x = o || {};
      const hash = x.hash || H.b32("acta_criterio_sint");
      const motivo = H.b32("ACTA_D13_SINT");
      const scope = await f.engine.call("SCOPE_INVESTOR_CRITERIA");
      const contenido = await f.engine.call("investorCriteriaContent", [purpose, hash, motivo]);
      const ord = await V.ordenGob(f, {
        contrato: f.engine, action: "SET_INVESTOR_CRITERIA", scope, evidenceRoot: contenido,
        aprobar: x.aprobar, etiqueta: x.etiqueta,
      });
      return await f.engine.send("setInvestorCriteria", [purpose, hash, motivo, ord.tupla, ord.digest], f.board);
    }

    it("negativo: sin base de colocación, o sin segmento declarado, no se suscribe", async function () {
      await residentesPA();
      let r = await suscribir(f.alice);
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("PLACEMENT_BASIS_UNSET"));
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
      r = await suscribir(f.alice);
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("SEGMENT_UNKNOWN"));
    });

    it("negativo (T-120-26, T-140-09): bajo AUTORIZACION_LIMITADA sólo suscribe el perfil admitido; con licencia plena, cualquiera del país", async function () {
      await residentesPA();
      const rc = await exenta();
      assert.ok(V.logsDe(f.engine, rc).find((e) => e.name === "PlacementBasisSet"));

      assert.equal(Number((await suscribir(f.alice)).result), CODE.ALLOW, "residente de Próspera");
      const rb = await suscribir(f.bob);
      assert.equal(Number(rb.result), CODE.DENY_ELIGIBILITY, "un residente de país PERMITIDO sin perfil admitido no suscribe");
      // Código del catálogo de ESTADOS-Y-EVENTOS §C.
      assert.equal(rb.reasonCode, H.b32("FUERA_DE_ALCANCE_OFERTA_EXENTA"));
      // T-120-29 · transferir sí puede: el alcance limita la SUSCRIPCIÓN, no el secundario.
      assert.equal(Number((await op(f.bob, "TRANSFER_OUT")).result), CODE.ALLOW);

      // Con la Investment Company License como base, el perfil deja de importar.
      await V.licenciaVigente(f, LIC_ICL, V.terminos(TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO);
      assert.equal(Number((await suscribir(f.bob)).result), CODE.ALLOW);
    });

    it("negativo (T-120-28): ACREDITADO o SOFISTICADO sin criterio fijado (D13) es BLOCKED_DECISION, no ALLOW", async function () {
      await residentesPA();
      await exenta();
      const acreditado = await perfil(f.bob, "PURPOSE_ACCREDITED", F.SUBJ.bob);
      let r = await suscribir(f.bob);
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("INVESTOR_CRITERIA_UNSET"));
      // Fijar el criterio del OTRO perfil no abre éste.
      const sofisticado = await f.engine.call("PURPOSE_SOPHISTICATED");
      await criterio(sofisticado);
      r = await suscribir(f.bob);
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      // Con su criterio fijado por orden de gobierno, suscribe.
      const rc = await criterio(acreditado);
      const ev = V.logsDe(f.engine, rc).find((e) => e.name === "InvestorCriteriaSet");
      assert.equal(ev.args.purpose, acreditado);
      assert.equal(ev.args.criteriaHash, H.b32("acta_criterio_sint"));
      assert.equal(Number((await suscribir(f.bob)).result), CODE.ALLOW);
      assert.equal(await f.engine.call("investorCriteriaOf", [acreditado]), H.b32("acta_criterio_sint"));
    });

    it("negativo (T-120-27): ACREDITADO con criterio fijado desde un país SOLO_ENTRANTE no suscribe", async function () {
      await exenta();
      const res = await residencia(f.bob, "bob", HN);
      await V.acreditar(f, res.c, res.purpose);
      const acreditado = await perfil(f.bob, "PURPOSE_ACCREDITED", F.SUBJ.bob);
      await criterio(acreditado);
      const r = await suscribir(f.bob);
      assert.equal(Number(r.result), CODE.DENY_JURISDICTION);
      assert.equal(r.reasonCode, H.b32("COUNTRY_INBOUND_ONLY"));
    });

    it("negativo: el criterio sólo se fija para los dos perfiles de D13 y sólo con orden aprobada con su etiqueta", async function () {
      await H.expectRevert(criterio(await f.engine.call("PURPOSE_PROSPERA_RESIDENT")), "InvestorCriteriaInvalid");
      const acreditado = await f.engine.call("PURPOSE_ACCREDITED");
      await H.expectRevert(criterio(acreditado, { etiqueta: "SET_POLICY" }), "OrderMismatch");
      assert.equal(await f.engine.call("investorCriteriaOf", [acreditado]), H.ZERO32);
    });

    it("negativo: la autorización suspendida o vencida cierra la suscripción", async function () {
      await residentesPA();
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }), 0.02);
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
      assert.equal(Number((await suscribir(f.alice)).result), CODE.ALLOW);
      await V.transicion(f, LIC_EXENTA, LS.VIGENTE, LS.SUSPENDIDA, SIN_OTORGAMIENTO, H.b32("SUSPENSION"));
      let r = await suscribir(f.alice);
      assert.equal(Number(r.result), CODE.DENY_AUTHORIZATION);
      assert.equal(r.reasonCode, H.b32("LICENCIA_NO_OTORGADA"));
      await V.transicion(f, LIC_EXENTA, LS.SUSPENDIDA, LS.VIGENTE, SIN_OTORGAMIENTO, H.b32("LEVANTAMIENTO"));
      assert.equal(Number((await suscribir(f.alice)).result), CODE.ALLOW);
      // Vence por plazo (unos 29 minutos): nadie tiene que registrarlo.
      await H.increaseTime(1800);
      r = await suscribir(f.alice);
      assert.equal(Number(r.result), CODE.DENY_AUTHORIZATION);
    });
  });

  describe("límite de exposición: el agregado fuera de la cadena, el resultado dentro", function () {
    const PARAMS = { set: true, incomeBps: 1000, floor: 100, ceiling: 10000, declarationTtl: 3000 };
    const DOC = H.b32("hash_terminos_v3");

    async function resultado(cuenta, maxUnidades, o) {
      const x = o || {};
      const ts = await H.now();
      return await f.engine.send("recordExposureClearance", [
        cuenta, F.ASSET_NEW, String(maxUnidades), x.hasta || ts + 600, x.doc || DOC, x.version !== undefined ? x.version : 3,
      ], x.desde || f.board);
    }

    beforeEach(async function () {
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      await V.fijarSegmento(f, F.ASSET_NEW, "CRECIMIENTO");
      await V.licenciaVigente(f, LIC_ICL, V.terminos(TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO);
      // Las DOS direcciones de alice acreditan residencia en PA.
      for (const dir of [f.alice, alice2]) {
        const res = await residencia(dir, "alice", PA, H.b32("salt_res_" + dir.slice(2, 8)));
        await V.acreditar(f, res.c, res.purpose);
      }
    });

    it("negativo: sin parámetros (null) el límite es BLOCKED_DECISION y no se admiten resultados", async function () {
      const r = await suscribir(f.alice, 10);
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_PARAMS_UNSET"));
      await H.expectRevert(resultado(f.alice, 10), "ExposureParamsNotSet");
      for (const malo of [
        Object.assign({}, PARAMS, { incomeBps: 0 }),
        Object.assign({}, PARAMS, { incomeBps: 10001 }),
        Object.assign({}, PARAMS, { floor: 20000 }),
        Object.assign({}, PARAMS, { declarationTtl: 0 }),
      ]) {
        await H.expectRevert(parametrosExposicion(malo), "ExposureParamsInvalid");
      }
    });

    it("negativo (T-120-24): sin el resultado de exposición la suscripción es UNKNOWN_SOURCE, nunca ALLOW", async function () {
      const rcp = await parametrosExposicion(PARAMS);
      assert.ok(V.logsDe(f.engine, rcp).find((e) => e.name === "ExposureParamsSet"));
      const r = await suscribir(f.alice, 10);
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_RESULT_MISSING"));
    });

    it("positivo: el resultado vale para ESA dirección, ESE activo y hasta ESE máximo, con la declaración del adquirente", async function () {
      await parametrosExposicion(PARAMS);
      const rc = await resultado(f.alice, 150);
      const evl = V.logsDe(f.engine, rc).find((e) => e.name === "ExposureLimitRecorded");
      assert.equal(evl.args.regime, H.b32("CRECIMIENTO"));
      const evd = V.logsDe(f.engine, rc).find((e) => e.name === "AcquirerDeclarationRecorded");
      assert.equal(evd.args.assetId, F.ASSET_NEW);
      assert.equal(evd.args.documentHash, DOC);
      assert.equal(Number(evd.args.documentVersion), 3);

      assert.equal(Number((await suscribir(f.alice, 150)).result), CODE.ALLOW);
      const r = await suscribir(f.alice, 151);
      assert.equal(Number(r.result), CODE.DENY_LIMIT);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_LIMIT_EXCEEDED"));
      // La otra dirección de la misma persona no hereda el resultado: el
      // agregado lo lleva Genesis ID, que trae un resultado propio por dirección.
      assert.equal(Number((await suscribir(alice2, 10)).result), CODE.UNKNOWN_SOURCE);
    });

    it("adversario (v0.3 §11/§12, T23): la cadena no guarda ingreso ni un compromiso estable que una dos direcciones", async function () {
      await parametrosExposicion(PARAMS);
      const a1 = await resultado(f.alice, 100);
      const a2 = await resultado(alice2, 100);
      const ref1 = V.logsDe(f.engine, a1).find((e) => e.name === "ExposureLimitRecorded").args.declarationRef;
      const ref2 = V.logsDe(f.engine, a2).find((e) => e.name === "ExposureLimitRecorded").args.declarationRef;
      assert.notEqual(ref1, ref2, "cada resultado lleva una referencia propia, sin relación con el sujeto");
      // Nada en el ABI recibe ni devuelve el ingreso o un agregado por identidad.
      const nombres = f.engine.abi.filter((x) => x.type === "function").map((x) => x.name);
      for (const retirado of ["declareIncome", "recordAcquisition", "releaseExposure", "exposureUsedOf", "exposureLimitOf", "recordAcquirerDeclaration", "PURPOSE_EXPOSURE"]) {
        assert.ok(!nombres.includes(retirado), retirado + " no puede existir: publicaría el ingreso o enlazaría direcciones");
      }
      // Los argumentos de la escritura son la dirección, el activo y el resultado; ningún bytes32 del sujeto.
      const entradas = f.engine.abi.find((x) => x.name === "recordExposureClearance").inputs.map((i) => i.name);
      assert.deepEqual(entradas, ["account", "assetId", "maxUnits", "validUntil", "documentHash", "documentVersion"]);
    });

    it("negativo: el resultado vence (y no puede durar más que declarationTtl); se gasta al colocar", async function () {
      await parametrosExposicion(PARAMS);
      const ts = await H.now();
      await H.expectRevert(resultado(f.alice, 100, { hasta: ts + 5000 }), "DeclarationInvalid");
      await H.expectRevert(resultado(f.alice, 100, { version: 0 }), "DeclarationInvalid");
      await resultado(f.alice, 100);
      await H.increaseTime(700);
      let r = await suscribir(f.alice, 10);
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);

      await resultado(f.alice, 100);
      // Sólo un ejecutor con el rol aplica la suscripción.
      await H.expectRevert(f.engine.send("enforceSubscription", [f.alice, F.ASSET_NEW, 50], f.board), "Unauthorized");
      await f.engine.send("grantRole", [await f.engine.call("SUBSCRIPTION_EXECUTOR"), carol], f.board);
      await f.engine.send("enforceSubscription", [f.alice, F.ASSET_NEW, 50], carol);
      // Gastado: la segunda colocación con el mismo resultado se rechaza.
      r = await suscribir(f.alice, 10);
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      await V.revertCon(f.engine.send("enforceSubscription", [f.alice, F.ASSET_NEW, 10], carol), f.engine, "SubscriptionRejected");
    });

    it("negativo: sólo el operador registra; y en el Mercado Principal no hay límite que registrar", async function () {
      await parametrosExposicion(PARAMS);
      await H.expectRevert(resultado(f.alice, 100, { desde: f.alice }), "Unauthorized");
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await H.expectRevert(resultado(f.alice, 100), "NotGrowthSegment");
      // En Principal la suscripción no mira la exposición.
      assert.equal(Number((await suscribir(f.alice)).result), CODE.ALLOW);
    });
  });
});
