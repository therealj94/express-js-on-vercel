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
 * Privacidad (v0.3 §11 y §12), revisión del 26-sep:
 *   · la residencia vive en UN propósito (RESIDENCIA) con un compromiso
 *     keccak(etiqueta, país, sal) y sal por dirección: ni el propósito ni el
 *     almacenamiento dicen el país, y dos direcciones de la misma persona no
 *     comparten valor;
 *   · BLOQUEADO se aplica a la IDENTIDAD con el propósito JURISDICCION_BLOQUEADA
 *     que el atestador da de alta en todas sus direcciones;
 *   · el agregado de exposición se calcula FUERA de la cadena y aquí entra sólo
 *     el resultado: una autorización por (dirección, activo, operación).
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
const LIC_EXENTA = V.LIC.EXENTA;
const LIC_ICL = V.LIC.ICL;

describe("SFSP v0.3 §7 y §8.5 · países, suscripción primaria y exposición", function () {
  let f, alice2, carol;

  /** Alta de residencia de `dir` en `pais`; devuelve su sal. */
  async function residencia(dir, pais, o) {
    return await V.altaResidencia(f, dir, pais, o);
  }

  function pais(code, desde, hacia, o) {
    return V.fijarPais(f, code, desde, hacia, o);
  }

  function baseColocacion(assetId, holder, tipo) {
    return V.fijarBaseColocacion(f, assetId, holder, tipo);
  }

  function parametrosExposicion(e) {
    return V.fijarParametrosExposicion(f, e);
  }

  function suscribir(cuenta, ctx) {
    return f.engine.call("evaluateSubscription", [cuenta, F.ASSET_NEW, 100, H.ZERO32, V.ctxSuscripcion(ctx)]);
  }

  function op(cuenta, accion) {
    return f.engine.call("evaluateOperation", [cuenta, F.ASSET_NEW, H.b32(accion), 10, H.ZERO32]);
  }

  async function bloquearIdentidad(dirs, motivo) {
    const pb = await f.engine.call("PURPOSE_JURISDICTION_BLOCK");
    for (const d of dirs) {
      await f.identity.send("bindPurposeCommitment", [d, pb, H.keccak256(Buffer.from("bloqueo_sint:" + d, "utf8"))], f.board);
    }
    return motivo;
  }

  async function desbloquearIdentidad(dirs) {
    const pb = await f.engine.call("PURPOSE_JURISDICTION_BLOCK");
    for (const d of dirs) await f.identity.send("unbindPurposeCommitment", [d, pb], f.board);
  }

  beforeEach(async function () {
    f = await F.deployAll();
    alice2 = f.acc[10]; // segunda dirección de la MISMA identidad que alice
    carol = f.acc[11];
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
      const res = await residencia(f.alice, HN);
      assert.equal(Number(await f.engine.call("countryStatusOf", [HN])), PAIS.SOLO_ENTRANTE);
      for (const accion of ["TRANSFER_IN", "TRANSFER_OUT", "SETTLE", "REDEEM"]) {
        const r = await op(f.alice, accion);
        assert.equal(Number(r.result), CODE.ALLOW, accion + " tiene que pasar en SOLO_ENTRANTE");
      }
      const sinPais = await op(f.alice, "SUBSCRIBE");
      assert.equal(Number(sinPais.result), CODE.DENY_JURISDICTION);
      assert.equal(sinPais.reasonCode, H.b32("COUNTRY_INBOUND_ONLY"));
      const conPais = await suscribir(f.alice, { country: HN, salt: res.salt });
      assert.equal(Number(conPais.result), CODE.DENY_JURISDICTION);
      assert.equal(conPais.reasonCode, H.b32("COUNTRY_INBOUND_ONLY"));
    });

    it("negativo: un país declarado sin residencia acreditada es fuente desconocida, no un permiso", async function () {
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      // Alta de residencia sin claim vigente.
      const res = await residencia(f.alice, PA, { acreditada: false });
      const r = await suscribir(f.alice, { country: PA, salt: res.salt });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("COUNTRY_UNPROVEN"));
      // Y declarar un país que no es el suyo tampoco sirve: ni sin residencia…
      const r2 = await suscribir(f.bob, { country: PA, salt: V.salResidencia(f.bob) });
      assert.equal(Number(r2.result), CODE.UNKNOWN_SOURCE);
      // …ni con la residencia acreditada en OTRO país (su compromiso no coincide).
      const resHN = await residencia(f.bob, HN);
      const r3 = await suscribir(f.bob, { country: PA, salt: resHN.salt });
      assert.equal(Number(r3.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r3.reasonCode, H.b32("COUNTRY_UNPROVEN"));
    });

    it("privacidad: la residencia no revela el país; dos direcciones de la misma persona no comparten compromiso", async function () {
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      const a = await residencia(f.alice, PA);
      const a2 = await residencia(alice2, PA);
      const b = await residencia(f.bob, HN);
      // El evento del alta dice «RESIDENCIA», igual para todos los países.
      const ev = V.logsDe(f.identity, a.rc).find((e) => e.name === "PurposeCommitmentBound");
      assert.equal(ev.args.purpose, H.b32("RESIDENCIA"));
      assert.equal(V.logsDe(f.identity, b.rc).find((e) => e.name === "PurposeCommitmentBound").args.purpose, H.b32("RESIDENCIA"));
      // No hay propósito por país que enumerar: el esquema anterior
      // (keccak(etiqueta, ISO2)) ya no da de alta nada.
      assert.equal(f.engine.iface.functions["residencePurpose(bytes32)"], undefined);
      const viejo = H.keccak256(H.defaultAbiCoder.encode(["bytes32", "bytes32"], [H.keccak256(Buffer.from("SFSP.PURPOSE.RESIDENCE.v1", "utf8")), PA]));
      assert.equal((await f.identity.call("purposeStatus", [f.alice, viejo])).bound, false);
      // Probar el país contra el compromiso exige la sal; sin ella no coincide.
      assert.equal(await f.identity.call("isCommitmentBound", [f.alice, a.purpose, await f.engine.call("residenceCommitment", [PA, H.ZERO32])]), false);
      // Sal por dirección: el compromiso de alice no vale para alice2.
      assert.notEqual(a.c, a2.c);
      assert.equal(await f.identity.call("isCommitmentBound", [alice2, a.purpose, a.c]), false);
      // Y cada una suscribe con SU sal, no con la de la otra.
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO);
      const cruzado = await suscribir(alice2, { country: PA, salt: a.salt });
      assert.equal(cruzado.reasonCode, H.b32("COUNTRY_UNPROVEN"));
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

    it("negativo: BLOQUEADO deniega TODAS las acciones del residente en TODAS sus direcciones, aunque no declaren país", async function () {
      const res = await residencia(f.alice, HN);
      // Bloquear sin fundamento no procede: no se bloquea por precaución.
      await H.expectRevert(pais(HN, PAIS.SOLO_ENTRANTE, PAIS.BLOQUEADO), "EvidenceRequired");
      await pais(HN, PAIS.SOLO_ENTRANTE, PAIS.BLOQUEADO, { reason: H.b32("SANCION_INTERNACIONAL"), evidence: H.b32("hash_resolucion") });
      assert.deepEqual([...(await f.engine.call("blockedCountries"))], [HN]);
      // La suscripción que declara el país bloqueado se deniega por la matriz.
      const s = await suscribir(f.alice, { country: HN, salt: res.salt });
      assert.equal(Number(s.result), CODE.DENY_JURISDICTION);
      assert.equal(s.reasonCode, H.b32("COUNTRY_BLOCKED"));

      // El atestador (Genesis ID sabe qué direcciones son de alice) da de alta
      // JURISDICCION_BLOQUEADA en LAS DOS: alice2 sólo tenía BASE y nunca
      // declaró país, y aun así queda bloqueada.
      await bloquearIdentidad([f.alice, alice2]);
      for (const cuenta of [f.alice, alice2]) {
        for (const accion of ["TRANSFER_IN", "TRANSFER_OUT", "SETTLE", "REDEEM", "SUBSCRIBE", "MINT"]) {
          const r = await op(cuenta, accion);
          assert.equal(Number(r.result), CODE.DENY_JURISDICTION, accion);
          assert.equal(r.reasonCode, H.b32("COUNTRY_BLOCKED"), accion);
        }
      }
      // bob no reside en HN: no le afecta.
      assert.equal(Number((await op(f.bob, "TRANSFER_OUT")).result), CODE.ALLOW);

      // Levantar el bloqueo devuelve el acceso y vacía la lista.
      await pais(HN, PAIS.BLOQUEADO, PAIS.SOLO_ENTRANTE, { reason: H.b32("SANCION_LEVANTADA") });
      await desbloquearIdentidad([f.alice, alice2]);
      assert.equal(Number((await op(f.alice, "TRANSFER_OUT")).result), CODE.ALLOW);
      assert.equal(Number((await op(alice2, "TRANSFER_OUT")).result), CODE.ALLOW);
      assert.deepEqual([...(await f.engine.call("blockedCountries"))], []);
    });

    it("negativo: código de país inválido, estado de partida falso u orden sin quórum no cambian la matriz", async function () {
      for (const malo of [H.b32("hn"), H.b32("HND"), H.b32("H"), H.ZERO32]) {
        await H.expectRevert(pais(malo, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO), "CountryCodeInvalid");
      }
      await H.expectRevert(pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO, { ordenDesde: PAIS.BLOQUEADO }), "CountryTransitionInvalid");
      const contenido = await f.engine.call("countryContent", [PA, PAIS.PERMITIDO, H.b32("X"), H.ZERO32]);
      const ord = await V.ordenGob(f, {
        contrato: f.engine, action: "SET_COUNTRY", scope: await f.engine.call("SCOPE_COUNTRY"), amount: 0, amountSecondary: 1,
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
      const res = await residencia(f.alice, PA);
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO_CON_CONDICIONES);
      const r = await suscribir(f.alice, { country: PA, salt: res.salt });
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("COUNTRY_CONDITIONS_UNSET"));
    });
  });

  describe("base de colocación y alcance de la oferta exenta", function () {
    let salA, salB;
    async function residentesPA() {
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      salA = (await residencia(f.alice, PA)).salt;
      salB = (await residencia(f.bob, PA)).salt;
      // alice es residente de Próspera; bob no tiene ninguno de los tres perfiles.
      await V.perfilProspera(f, f.alice, "alice");
    }

    it("negativo: sin base de colocación, o sin segmento declarado, no se suscribe", async function () {
      await residentesPA();
      let r = await suscribir(f.alice, { country: PA, salt: salA });
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("PLACEMENT_BASIS_UNSET"));
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
      r = await suscribir(f.alice, { country: PA, salt: salA });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("SEGMENT_UNKNOWN"));
    });

    it("negativo: bajo AUTORIZACION_LIMITADA sólo suscribe el perfil admitido; con licencia plena, cualquiera del país", async function () {
      await residentesPA();
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }));
      const rc = await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
      assert.ok(V.logsDe(f.engine, rc).find((e) => e.name === "PlacementBasisSet"));

      assert.equal(Number((await suscribir(f.alice, { country: PA, salt: salA })).result), CODE.ALLOW, "residente de Próspera");
      const rb = await suscribir(f.bob, { country: PA, salt: salB });
      assert.equal(Number(rb.result), CODE.DENY_ELIGIBILITY, "un residente de país PERMITIDO sin perfil admitido no suscribe");
      assert.equal(rb.reasonCode, H.b32("EXEMPT_OFFER_SCOPE"));
      // Transferir sí puede: el alcance limita la SUSCRIPCIÓN, no el secundario.
      assert.equal(Number((await op(f.bob, "TRANSFER_OUT")).result), CODE.ALLOW);

      // Con la Investment Company License como base, el perfil deja de importar.
      await V.licenciaVigente(f, LIC_ICL, V.terminos(TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO);
      assert.equal(Number((await suscribir(f.bob, { country: PA, salt: salB })).result), CODE.ALLOW);
    });

    it("negativo: la autorización suspendida o vencida cierra la suscripción", async function () {
      await residentesPA();
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await V.licenciaVigente(f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }), 0.02);
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA);
      assert.equal(Number((await suscribir(f.alice, { country: PA, salt: salA })).result), CODE.ALLOW);
      await V.transicion(f, LIC_EXENTA, LS.VIGENTE, LS.SUSPENDIDA, SIN_OTORGAMIENTO, H.b32("SUSPENSION"));
      let r = await suscribir(f.alice, { country: PA, salt: salA });
      assert.equal(Number(r.result), CODE.DENY_AUTHORIZATION);
      assert.equal(r.reasonCode, H.b32("PLACEMENT_LICENSE_NOT_IN_FORCE"));
      await V.transicion(f, LIC_EXENTA, LS.SUSPENDIDA, LS.VIGENTE, SIN_OTORGAMIENTO, H.b32("LEVANTAMIENTO"));
      assert.equal(Number((await suscribir(f.alice, { country: PA, salt: salA })).result), CODE.ALLOW);
      // Vence por plazo (unos 29 minutos): nadie tiene que registrarlo.
      await H.increaseTime(1800);
      r = await suscribir(f.alice, { country: PA, salt: salA });
      assert.equal(Number(r.result), CODE.DENY_AUTHORIZATION);
    });
  });

  describe("límite de exposición por identidad (Mercado de Crecimiento)", function () {
    let salA, salA2;
    const PARAMS = { set: true, incomeBps: 1000, floor: 100, ceiling: 10000, declarationTtl: 3000 };
    const N1 = H.b32("operacion_1");

    async function autorizar(dir, nonce, maxCost, o) {
      const x = o || {};
      const id = await f.engine.call("exposureClearanceId", [dir, F.ASSET_NEW, nonce]);
      const hasta = (await H.now()) + (x.dura || 600);
      const rc = await f.engine.send(
        "recordExposureClearance",
        [id, F.ASSET_NEW, String(maxCost), hasta, H.b32("hash_terminos_v3"), 3],
        x.from || f.board,
      );
      return { id, rc, hasta };
    }

    beforeEach(async function () {
      await pais(PA, PAIS.SOLO_ENTRANTE, PAIS.PERMITIDO);
      await V.fijarSegmento(f, F.ASSET_NEW, "CRECIMIENTO");
      await V.licenciaVigente(f, LIC_ICL, V.terminos(TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO));
      await baseColocacion(F.ASSET_NEW, TIT.ORDEN_GLOBAL, TIPO.INVESTMENT_CO);
      // Las DOS direcciones de alice residen en PA, cada una con SU sal.
      salA = (await residencia(f.alice, PA)).salt;
      salA2 = (await residencia(alice2, PA)).salt;
    });

    it("negativo: sin parámetros (null) el límite es BLOCKED_DECISION y no se admiten autorizaciones", async function () {
      const r = await suscribir(f.alice, { country: PA, salt: salA, nonce: N1, cost: 10 });
      assert.equal(Number(r.result), CODE.BLOCKED_DECISION);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_PARAMS_UNSET"));
      await H.expectRevert(autorizar(f.alice, N1, 10), "ExposureParamsNotSet");
      assert.equal((await f.engine.call("exposureLimitFor", [20000])).known, false);
      for (const malo of [
        Object.assign({}, PARAMS, { incomeBps: 0 }),
        Object.assign({}, PARAMS, { incomeBps: 10001 }),
        Object.assign({}, PARAMS, { floor: 20000 }),
        Object.assign({}, PARAMS, { declarationTtl: 0 }),
      ]) {
        await H.expectRevert(parametrosExposicion(malo), "ExposureParamsInvalid");
      }
    });

    it("positivo: el resultado del agregado entra como autorización de UN uso, de ESTA dirección, activo y operación", async function () {
      const rcp = await parametrosExposicion(PARAMS);
      assert.ok(V.logsDe(f.engine, rcp).find((e) => e.name === "ExposureParamsSet"));
      // Sin autorización del agregador, la exposición es desconocida (nunca cero).
      let r = await suscribir(f.alice, { country: PA, salt: salA, nonce: N1, cost: 1500 });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_CLEARANCE_MISSING"));

      // El agregador calculó FUERA que a la identidad de alice le caben 1500.
      const a = await autorizar(f.alice, N1, 1500);
      const evd = V.logsDe(f.engine, a.rc).find((e) => e.name === "ExposureLimitRecorded");
      assert.equal(evd.args.regime, H.b32("CRECIMIENTO"));
      assert.notEqual(evd.args.declarationRef, a.id, "el evento no publica el identificador tal cual");
      const eva = V.logsDe(f.engine, a.rc).find((e) => e.name === "AcquirerDeclarationRecorded");
      assert.equal(eva.args.assetId, F.ASSET_NEW);
      assert.equal(Number(eva.args.documentVersion), 3);
      assert.equal(eva.args.documentHash, H.b32("hash_terminos_v3"));

      assert.equal(Number((await suscribir(f.alice, { country: PA, salt: salA, nonce: N1, cost: 1500 })).result), CODE.ALLOW);
      r = await suscribir(f.alice, { country: PA, salt: salA, nonce: N1, cost: 1501 });
      assert.equal(Number(r.result), CODE.DENY_LIMIT);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_LIMIT_EXCEEDED"));
      // La autorización de alice no la usa su otra dirección, ni otra operación.
      r = await suscribir(alice2, { country: PA, salt: salA2, nonce: N1, cost: 10 });
      assert.equal(r.reasonCode, H.b32("EXPOSURE_CLEARANCE_MISSING"));
      r = await suscribir(f.alice, { country: PA, salt: salA, nonce: H.b32("otra_operacion"), cost: 10 });
      assert.equal(r.reasonCode, H.b32("EXPOSURE_CLEARANCE_MISSING"));

      // Hacerla cumplir la gasta: una autorización, una adquisición.
      await f.engine.send("grantRole", [await f.engine.call("SUBSCRIPTION_EXECUTOR"), f.board], f.board);
      const ctx = V.ctxSuscripcion({ country: PA, salt: salA, nonce: N1, cost: 1500 });
      const rce = await f.engine.send("enforceSubscription", [f.alice, F.ASSET_NEW, 100, ctx], f.board);
      const ev = V.logsDe(f.engine, rce).find((e) => e.name === "EligibilityRecorded");
      assert.equal(ev.args.assetId, F.ASSET_NEW);
      assert.equal(ev.args.action, SUBSCRIBE);
      assert.ok(!Object.values(ev.args).some((v) => String(v).toLowerCase() === f.alice.toLowerCase()), "sin dirección en el evento");
      assert.equal((await f.engine.call("clearanceOf", [a.id])).used, true);
      r = await suscribir(f.alice, { country: PA, salt: salA, nonce: N1, cost: 1500 });
      assert.equal(Number(r.result), CODE.DENY_ELIGIBILITY);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_CLEARANCE_USED"));
      await V.revertCon(f.engine.send("enforceSubscription", [f.alice, F.ASSET_NEW, 100, ctx], f.board), f.engine, "SubscriptionRejected");
    });

    it("privacidad: en cadena no queda el ingreso, ni el agregado, ni un valor común a las direcciones de la identidad", async function () {
      await parametrosExposicion(PARAMS);
      // Las funciones que publicaban ingreso y agregado ya no existen.
      for (const fn of ["declareIncome", "recordAcquisition", "releaseExposure", "exposureUsedOf", "exposureLimitOf", "recordAcquirerDeclaration"]) {
        assert.ok(!Object.keys(f.engine.iface.functions).some((s) => s.startsWith(fn + "(")), fn + " no debe existir");
      }
      // La fórmula se consulta como VISTA: el ingreso no entra en ninguna transacción.
      assert.equal(BigInt((await f.engine.call("exposureLimitFor", [20000])).limit.toString()), 2000n);
      // Registrar la autorización no lleva la dirección en el calldata.
      const a = await autorizar(f.alice, N1, 1500);
      const tx = await H.provider.send("eth_getTransactionByHash", [a.rc.transactionHash]);
      assert.ok(!tx.input.toLowerCase().includes(f.alice.slice(2).toLowerCase()), "la dirección no viaja al registrar");
      // Las dos direcciones de alice no quedan unidas por ningún valor en cadena:
      // la de alice2 es otra autorización, con otro identificador.
      const b = await autorizar(alice2, N1, 500);
      assert.notEqual(a.id, b.id);
      assert.equal(await f.engine.call("PURPOSE_RESIDENCE"), H.b32("RESIDENCIA"));
      assert.equal(f.engine.iface.functions["PURPOSE_EXPOSURE()"], undefined, "ya no hay propósito EXPOSICION común");
    });

    it("positivo: piso y techo acotan el porcentaje del ingreso autodeclarado", async function () {
      await parametrosExposicion(PARAMS);
      assert.equal(BigInt((await f.engine.call("exposureLimitFor", [10])).limit.toString()), 100n); // 10 % de 10 = 1 → piso 100
      assert.equal(BigInt((await f.engine.call("exposureLimitFor", [10_000_000])).limit.toString()), 10000n); // → techo
    });

    it("negativo: autorización vencida, sin costo, más larga que la declaración o repetida no sirven", async function () {
      await parametrosExposicion(PARAMS);
      await autorizar(f.alice, N1, 1500, { dura: 600 });
      let r = await suscribir(f.alice, { country: PA, salt: salA, nonce: N1, cost: 0 });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("ACQUISITION_COST_UNKNOWN"));
      await H.expectRevert(autorizar(f.alice, N1, 1500), H.b32("CLEARANCE_EXISTS"));
      await H.expectRevert(autorizar(f.alice, H.b32("larga"), 1500, { dura: 3100 }), H.b32("WINDOW"));
      await H.increaseTime(601);
      r = await suscribir(f.alice, { country: PA, salt: salA, nonce: N1, cost: 10 });
      assert.equal(Number(r.result), CODE.UNKNOWN_SOURCE);
      assert.equal(r.reasonCode, H.b32("EXPOSURE_CLEARANCE_EXPIRED"));
    });

    it("negativo: sólo el operador registra; y en el Mercado Principal no hay autorización que registrar", async function () {
      await parametrosExposicion(PARAMS);
      await H.expectRevert(autorizar(f.alice, N1, 1500, { from: f.alice }), "Unauthorized");
      await V.fijarSegmento(f, F.ASSET_NEW, "PRINCIPAL");
      await H.expectRevert(autorizar(f.alice, N1, 1500), "NotGrowthSegment");
      // En Principal la suscripción no mira la exposición.
      assert.equal(Number((await suscribir(f.alice, { country: PA, salt: salA })).result), CODE.ALLOW);
    });
  });
});
