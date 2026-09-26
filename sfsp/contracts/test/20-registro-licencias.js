"use strict";
/* SFSP v0.3 §6 · SFSP-140 · registro de licencias.
 *
 * Lo que se prueba es la regla del v0.3: un módulo cuya licencia no esté
 * otorgada y vigente se rechaza POR CÓDIGO. Por eso casi todo aquí son casos
 * adversarios: saltos de estado, licencias vencidas sin que nadie lo registre,
 * la licencia de otro titular que «parece» servir, habilitar sin licencia y
 * órdenes de gobierno que no corresponden a lo que se ejecuta. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const V = require("./v03");

const { LS, AV, KIND, TIT, TIPO, OPER, SIN_OTORGAMIENTO, DIA } = V;

const LIC_CUSTODIA = H.b32("LIC_AU_CUSTODIA_G");
const LIC_CUSTODIA_OG = H.b32("LIC_OG_CUSTODIA_G");
const LIC_CORRETAJE = H.b32("LIC_AU_CORRETAJE_C");
const LIC_ATS_AU = H.b32("LIC_AU_ATS_B");
const LIC_EXENTA = H.b32("AUT_OG_OFERTA_EXENTA");
const MOD_CUSTODIA = H.b32("MOD_CUSTODIA_REDENCION");
const MOD_MERCADO = H.b32("MOD_MERCADO_HIBRIDO");

describe("SFSP v0.3 §6 · registro de licencias (SFSP-140)", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await V.desplegarLicencias(f);
  });

  describe("ciclo de vida sin saltos", function () {
    it("positivo: EN_TRAMITE → OTORGADA → VIGENTE, con eventos canónicos y número en el otorgamiento", async function () {
      const t = V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G, { operator: OPER.ORDENEX });
      const rc0 = await V.registrarLicencia(f, LIC_CUSTODIA, t);
      const alta = V.logsDe(f.lic, rc0).find((e) => e.name === "LicenseRegistered");
      assert.equal(alta.args.licenseId, LIC_CUSTODIA);
      assert.equal(alta.args.holder, TIT.AU_CORP);
      assert.equal(alta.args.operator, OPER.ORDENEX);
      assert.equal((await f.lic.call("licenseOf", [LIC_CUSTODIA])).state, LS.EN_TRAMITE);
      // En trámite no hay número: el registro no lo inventa.
      assert.equal((await f.lic.call("licenseOf", [LIC_CUSTODIA])).grant.number, H.ZERO32);
      assert.equal(await f.lic.call("isLicenseEffective", [LIC_CUSTODIA]), false);

      const g = await V.otorgamiento(30);
      const rc1 = await V.transicion(f, LIC_CUSTODIA, LS.EN_TRAMITE, LS.OTORGADA, g, H.b32("LICENCIA_OTORGADA"));
      const ev = V.logsDe(f.lic, rc1).find((e) => e.name === "LicenseStatusChanged");
      assert.equal(ev.args.previousState, LS.EN_TRAMITE);
      assert.equal(ev.args.newState, LS.OTORGADA);
      assert.equal(ev.args.reasonCode, H.b32("LICENCIA_OTORGADA"));
      // OTORGADA todavía no habilita: sólo VIGENTE (T-140-02).
      assert.equal(await f.lic.call("isLicenseEffective", [LIC_CUSTODIA]), false);

      await V.transicion(f, LIC_CUSTODIA, LS.OTORGADA, LS.VIGENTE);
      assert.equal(await f.lic.call("isLicenseEffective", [LIC_CUSTODIA]), true);
      assert.equal((await f.lic.call("licenseOf", [LIC_CUSTODIA])).grant.number, g.number);
    });

    const saltos = [
      ["EN_TRAMITE → VIGENTE", LS.EN_TRAMITE, LS.VIGENTE, []],
      ["EN_TRAMITE → REVOCADA", LS.EN_TRAMITE, LS.REVOCADA, []],
      ["OTORGADA → SUSPENDIDA", LS.OTORGADA, LS.SUSPENDIDA, [LS.OTORGADA]],
      ["OTORGADA → REVOCADA", LS.OTORGADA, LS.REVOCADA, [LS.OTORGADA]],
      ["VIGENTE → EN_TRAMITE", LS.VIGENTE, LS.EN_TRAMITE, [LS.OTORGADA, LS.VIGENTE]],
      ["VIGENTE → OTORGADA", LS.VIGENTE, LS.OTORGADA, [LS.OTORGADA, LS.VIGENTE]],
      ["VIGENTE → VENCIDA por orden (sólo la produce el plazo)", LS.VIGENTE, LS.VENCIDA, [LS.OTORGADA, LS.VIGENTE]],
      ["REVOCADA → VIGENTE", LS.REVOCADA, LS.VIGENTE, [LS.OTORGADA, LS.VIGENTE, LS.REVOCADA]],
    ];
    for (const [nombre, desde, hacia, camino] of saltos) {
      it("negativo: no se salta " + nombre, async function () {
        await V.registrarLicencia(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G));
        let actual = LS.EN_TRAMITE;
        for (const paso of camino) {
          const g = paso === LS.OTORGADA ? await V.otorgamiento(30) : SIN_OTORGAMIENTO;
          await V.transicion(f, LIC_CUSTODIA, actual, paso, g);
          actual = paso;
        }
        assert.equal(actual, desde);
        await H.expectRevert(V.transicion(f, LIC_CUSTODIA, desde, hacia), "InvalidTransition");
        assert.equal(Number((await f.lic.call("licenseOf", [LIC_CUSTODIA])).state), desde, "el estado no se movió");
      });
    }

    it("negativo: OTORGADA sin número de licencia, sin documento o con plazo vencido se rechaza", async function () {
      await V.registrarLicencia(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G));
      const g = await V.otorgamiento(30);
      await H.expectRevert(
        V.transicion(f, LIC_CUSTODIA, LS.EN_TRAMITE, LS.OTORGADA, Object.assign({}, g, { number: H.ZERO32 })),
        "GrantInvalid",
      );
      await H.expectRevert(
        V.transicion(f, LIC_CUSTODIA, LS.EN_TRAMITE, LS.OTORGADA, Object.assign({}, g, { documentRef: H.ZERO32 })),
        "GrantInvalid",
      );
      const ts = await H.now();
      await H.expectRevert(
        V.transicion(f, LIC_CUSTODIA, LS.EN_TRAMITE, LS.OTORGADA, Object.assign({}, g, { validFrom: ts - 100, validUntil: ts - 1 })),
        "GrantInvalid",
      );
    });

    it("negativo: una orden fuera del otorgamiento no reescribe número ni plazo", async function () {
      await V.licenciaVigente(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G));
      await H.expectRevert(
        V.transicion(f, LIC_CUSTODIA, LS.VIGENTE, LS.SUSPENDIDA, await V.otorgamiento(900)),
        "GrantInvalid",
      );
    });

    it("negativo (T-140-02): OTORGADA con inicio futuro no pasa a VIGENTE antes de su fecha", async function () {
      await V.registrarLicencia(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G));
      const g = await V.otorgamiento(30, 5 * DIA);
      await V.transicion(f, LIC_CUSTODIA, LS.EN_TRAMITE, LS.OTORGADA, g);
      await H.expectRevert(V.transicion(f, LIC_CUSTODIA, LS.OTORGADA, LS.VIGENTE), "NotInValidityWindow");
      await H.increaseTime(5 * DIA);
      await V.transicion(f, LIC_CUSTODIA, LS.OTORGADA, LS.VIGENTE);
      assert.equal(await f.lic.call("isLicenseEffective", [LIC_CUSTODIA]), true);
    });

    it("negativo: una licencia viva del mismo titular y tipo no se pisa; tras revocarla, sí se renueva", async function () {
      const t = V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G);
      await V.licenciaVigente(f, LIC_CUSTODIA, t);
      await H.expectRevert(V.registrarLicencia(f, H.b32("LIC_AU_CUSTODIA_G_2"), t), "LicenseSlotTaken");
      await V.transicion(f, LIC_CUSTODIA, LS.VIGENTE, LS.REVOCADA, SIN_OTORGAMIENTO, H.b32("ORDEN_AUTORIDAD"));
      await V.registrarLicencia(f, H.b32("LIC_AU_CUSTODIA_G_2"), t);
      const r = await f.lic.call("resolveLicense", [TIT.AU_CORP, TIPO.CUSTODIA_G]);
      assert.equal(r.licenseId, H.b32("LIC_AU_CUSTODIA_G_2"));
      assert.equal(r.effective, false, "la renovación nace en trámite");
    });
  });

  describe("módulos: dependencia resuelta por titular", function () {
    it("positivo: módulo DISPONIBLE con su licencia vigente; isModuleAvailable verdadero", async function () {
      await V.licenciaVigente(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G, { operator: OPER.ORDENEX }));
      const rc = await V.declararModulo(f, V.modulo(MOD_CUSTODIA, [[TIT.AU_CORP, TIPO.CUSTODIA_G]], AV.DISPONIBLE));
      const ev = V.logsDe(f.lic, rc).find((e) => e.name === "ModuleAvailabilityChanged");
      assert.equal(ev.args.moduleId, MOD_CUSTODIA);
      assert.equal(ev.args.licenseId, LIC_CUSTODIA);
      assert.equal(ev.args.newAvailability, AV.DISPONIBLE);
      assert.equal(await f.lic.call("isModuleAvailable", [MOD_CUSTODIA]), true);
      assert.equal(Number(await f.lic.call("availabilityOf", [MOD_CUSTODIA])), AV.DISPONIBLE);
    });

    it("negativo (T-140-03): licencia vencida cierra el módulo SOLA; markExpired lo publica y lo puede registrar cualquiera", async function () {
      await V.licenciaVigente(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G), 2);
      await V.declararModulo(f, V.modulo(MOD_CUSTODIA, [[TIT.AU_CORP, TIPO.CUSTODIA_G]], AV.DISPONIBLE));
      await H.expectRevert(f.lic.send("markExpired", [LIC_CUSTODIA], f.mallory), "NotExpiredYet");

      await H.increaseTime(2 * DIA + 1);
      // Nadie ha registrado nada todavía y el módulo YA está cerrado.
      assert.equal(await f.lic.call("isModuleAvailable", [MOD_CUSTODIA]), false);
      assert.equal(Number(await f.lic.call("availabilityOf", [MOD_CUSTODIA])), AV.PROXIMAMENTE, "nunca DISPONIBLE ni BETA");
      assert.equal(Number((await f.lic.call("licenseOf", [LIC_CUSTODIA])).state), LS.VIGENTE);

      const rc = await f.lic.send("markExpired", [LIC_CUSTODIA], f.mallory);
      const evs = V.logsDe(f.lic, rc);
      const st = evs.find((e) => e.name === "LicenseStatusChanged");
      assert.equal(st.args.previousState, LS.VIGENTE);
      assert.equal(st.args.newState, LS.VENCIDA);
      assert.equal(st.args.reasonCode, H.b32("PLAZO_VENCIDO"));
      const mod = evs.find((e) => e.name === "ModuleAvailabilityChanged");
      assert.equal(mod.args.moduleId, MOD_CUSTODIA);
      assert.equal(mod.args.newAvailability, AV.PROXIMAMENTE);
      // Terminal: no vuelve.
      await H.expectRevert(V.transicion(f, LIC_CUSTODIA, LS.VENCIDA, LS.VIGENTE), "InvalidTransition");
      await H.expectRevert(f.lic.send("markExpired", [LIC_CUSTODIA], f.mallory), "InvalidTransition");
    });

    it("negativo (T-140-04): la licencia de OTRO titular no sirve aunque sea del mismo tipo y esté vigente", async function () {
      // Orden Global tiene su propia Custodia G vigente; la de Au Corp. está en trámite.
      await V.licenciaVigente(f, LIC_CUSTODIA_OG, V.terminos(TIT.ORDEN_GLOBAL, TIPO.CUSTODIA_G));
      await V.registrarLicencia(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G, { operator: OPER.ORDENEX }));
      // El módulo lo opera Ordenex, pero depende de la licencia cuyo titular es Au Corp.
      await V.declararModulo(f, V.modulo(MOD_CUSTODIA, [[TIT.AU_CORP, TIPO.CUSTODIA_G]], AV.PROXIMAMENTE));
      assert.equal(await f.lic.call("isModuleAvailable", [MOD_CUSTODIA]), false);
      await V.revertCon(
        V.declararModulo(f, V.modulo(MOD_CUSTODIA, [[TIT.AU_CORP, TIPO.CUSTODIA_G]], AV.DISPONIBLE)),
        f.lic,
        "ModuleLicenseNotEffective",
      );
    });

    it("negativo: con dos licencias (Corretaje C y ATS B), basta una no vigente para cerrar el mercado", async function () {
      await V.licenciaVigente(f, LIC_CORRETAJE, V.terminos(TIT.AU_CORP, TIPO.CORRETAJE_C, { operator: OPER.ORDENEX }));
      await V.licenciaVigente(f, LIC_ATS_AU, V.terminos(TIT.AU_CORP, TIPO.ATS_B, { operator: OPER.ORDENEX }));
      const deps = [[TIT.AU_CORP, TIPO.CORRETAJE_C], [TIT.AU_CORP, TIPO.ATS_B]];
      await V.declararModulo(f, V.modulo(MOD_MERCADO, deps, AV.BETA));
      assert.equal(await f.lic.call("isModuleAvailable", [MOD_MERCADO]), true);

      const rc = await V.transicion(f, LIC_ATS_AU, LS.VIGENTE, LS.SUSPENDIDA, SIN_OTORGAMIENTO, H.b32("SUSPENSION_AUTORIDAD"));
      assert.equal(await f.lic.call("isModuleAvailable", [MOD_MERCADO]), false);
      const mod = V.logsDe(f.lic, rc).find((e) => e.name === "ModuleAvailabilityChanged");
      assert.equal(mod.args.licenseId, LIC_ATS_AU, "el evento nombra la licencia que lo cerró");
      assert.equal(mod.args.newAvailability, AV.PROXIMAMENTE);

      // Levantar la suspensión reabre y vuelve a publicarse.
      const rc2 = await V.transicion(f, LIC_ATS_AU, LS.SUSPENDIDA, LS.VIGENTE, SIN_OTORGAMIENTO, H.b32("LEVANTAMIENTO"));
      assert.equal(await f.lic.call("isModuleAvailable", [MOD_MERCADO]), true);
      assert.equal(V.logsDe(f.lic, rc2).find((e) => e.name === "ModuleAvailabilityChanged").args.newAvailability, AV.BETA);
    });

    it("positivo: USO_INTERNO opera con licencia vigente pero no se anuncia; PROXIMAMENTE no opera", async function () {
      await V.licenciaVigente(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G));
      await V.declararModulo(f, V.modulo(MOD_CUSTODIA, [[TIT.AU_CORP, TIPO.CUSTODIA_G]], AV.USO_INTERNO));
      assert.equal(await f.lic.call("isModuleAvailable", [MOD_CUSTODIA]), true);
      assert.equal(Number(await f.lic.call("availabilityOf", [MOD_CUSTODIA])), AV.USO_INTERNO);
      await V.declararModulo(f, V.modulo(MOD_CUSTODIA, [[TIT.AU_CORP, TIPO.CUSTODIA_G]], AV.PROXIMAMENTE));
      assert.equal(await f.lic.call("isModuleAvailable", [MOD_CUSTODIA]), false);
    });

    it("positivo: la oferta exenta es AUTORIZACION_LIMITADA y así la resuelve el registro", async function () {
      await V.licenciaVigente(
        f, LIC_EXENTA, V.terminos(TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA, { kind: KIND.AUTORIZACION_LIMITADA }),
      );
      const r = await f.lic.call("resolveLicense", [TIT.ORDEN_GLOBAL, TIPO.OFERTA_EXENTA]);
      assert.equal(r.licenseId, LIC_EXENTA);
      assert.equal(Number(r.kind), KIND.AUTORIZACION_LIMITADA);
      assert.equal(r.effective, true);
      // Un módulo desconocido no está disponible (no se lee como público).
      assert.equal(await f.lic.call("isModuleAvailable", [H.b32("MOD_INEXISTENTE")]), false);
    });
  });

  describe("sólo por gobierno", function () {
    it("negativo: un solo aprobador no alcanza; y sin rol ejecutor no se ejecuta", async function () {
      const t = V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G);
      const motivo = H.b32("ALTA_EN_TRAMITE");
      const contenido = await f.lic.call("registerContent", [LIC_CUSTODIA, t, motivo]);
      const o = await V.ordenGob(f, {
        contrato: f.lic, action: "LICENSE_REGISTER", scope: f.SCOPE_LICENSE, evidenceRoot: contenido, aprobar: false,
      });
      await f.governance.send("proposeAuthorization", [o.digest, H.b32("LICENSE_REGISTER")], f.signers[0]);
      await f.governance.send("approveAuthorization", [o.digest], f.signers[1]);
      await H.expectRevert(
        f.lic.send("registerLicense", [LIC_CUSTODIA, t, motivo, o.tupla, o.digest], f.board),
        "OrderNotApproved",
      );
      await f.governance.send("approveAuthorization", [o.digest], f.signers[2]);
      await H.expectRevert(
        f.lic.send("registerLicense", [LIC_CUSTODIA, t, motivo, o.tupla, o.digest], f.mallory),
        "Unauthorized",
      );
      await f.lic.send("registerLicense", [LIC_CUSTODIA, t, motivo, o.tupla, o.digest], f.board);
      // La orden describe ESA alta: no sirve para dar de alta otra licencia.
      const otra = V.terminos(TIT.ORDEN_GLOBAL, TIPO.CUSTODIA_G);
      await H.expectRevert(
        f.lic.send("registerLicense", [H.b32("OTRA"), otra, motivo, o.tupla, o.digest], f.board),
        "OrderMismatch",
      );
    });

    it("negativo: una orden aprobada para otro contenido, otro estado de partida u otra etiqueta no sirve", async function () {
      await V.registrarLicencia(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G));
      const g = await V.otorgamiento(30);
      const motivo = H.b32("LICENCIA_OTORGADA");
      // Aprobada con otro número de licencia que el que se ejecuta.
      const o1 = await V.ordenTransicion(f, LIC_CUSTODIA, LS.EN_TRAMITE, LS.OTORGADA, Object.assign({}, g, { number: H.b32("OTRO_NUMERO") }), motivo);
      await H.expectRevert(
        f.lic.send("transitionLicense", [LIC_CUSTODIA, LS.OTORGADA, g, motivo, o1.tupla, o1.digest], f.board),
        "OrderMismatch",
      );
      // Aprobada como si partiera de otro estado.
      const o2 = await V.ordenTransicion(f, LIC_CUSTODIA, LS.OTORGADA, LS.OTORGADA, g, motivo);
      await H.expectRevert(
        f.lic.send("transitionLicense", [LIC_CUSTODIA, LS.OTORGADA, g, motivo, o2.tupla, o2.digest], f.board),
        "OrderMismatch",
      );
      // Contenido correcto pero aprobada bajo otra etiqueta.
      const o3 = await V.ordenTransicion(f, LIC_CUSTODIA, LS.EN_TRAMITE, LS.OTORGADA, g, motivo, { etiqueta: "SET_POLICY" });
      await H.expectRevert(
        f.lic.send("transitionLicense", [LIC_CUSTODIA, LS.OTORGADA, g, motivo, o3.tupla, o3.digest], f.board),
        "OrderMismatch",
      );
      assert.equal(Number((await f.lic.call("licenseOf", [LIC_CUSTODIA])).state), LS.EN_TRAMITE);
    });

    it("negativo (T-140-05): habilitar un módulo exige orden aprobada por EXACTAMENTE esa disponibilidad", async function () {
      await V.licenciaVigente(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G));
      const aprobado = V.modulo(MOD_CUSTODIA, [[TIT.AU_CORP, TIPO.CUSTODIA_G]], AV.PROXIMAMENTE);
      const contenido = await f.lic.call("moduleContent", [aprobado]);
      const o = await V.ordenGob(f, {
        contrato: f.lic, action: "MODULE_AVAILABILITY", scope: f.SCOPE_MODULE, evidenceRoot: contenido,
      });
      const ejecutado = Object.assign({}, aprobado, { declared: AV.DISPONIBLE });
      await H.expectRevert(f.lic.send("declareModule", [ejecutado, o.tupla, o.digest], f.board), "OrderMismatch");
      await H.expectRevert(f.lic.call("availabilityOf", [MOD_CUSTODIA]), "ModuleUnknown");
    });

    it("negativo: motivo vacío se rechaza", async function () {
      await H.expectRevert(
        V.registrarLicencia(f, LIC_CUSTODIA, V.terminos(TIT.AU_CORP, TIPO.CUSTODIA_G), H.ZERO32),
        "ReasonRequired",
      );
    });
  });
});
