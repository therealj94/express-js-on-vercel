"use strict";
/* Utilidades de las pruebas de la fase 2 del SFSP v0.3 (20, 21 y 22).
 *
 * Todo es sintético: titulares, números de licencia, países, montos y
 * parámetros del límite de exposición son valores de prueba, NO propuestas. Los
 * parámetros reales esperan su acta (v0.3 §18) y el contrato responde
 * BLOCKED_DECISION mientras no existan. */
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");

const DIA = 86400;

// Estados y tipos de SFSPLicenseRegistry. El orden es el del contrato.
const LS = { EN_TRAMITE: 0, OTORGADA: 1, VIGENTE: 2, SUSPENDIDA: 3, VENCIDA: 4, REVOCADA: 5 };
const KIND = { LICENCIA: 0, AUTORIZACION_LIMITADA: 1 };
const AV = { USO_INTERNO: 0, PROXIMAMENTE: 1, BETA: 2, DISPONIBLE: 3 };
// Matriz de países de SFSPEligibilityEngine.
const PAIS = { SOLO_ENTRANTE: 0, PERMITIDO: 1, PERMITIDO_CON_CONDICIONES: 2, BLOQUEADO: 3 };
const CAMPO = { VACIO: 0, VIGENTE: 1, VENCIDO: 2 };

// Titulares y tipos sintéticos (referencias, no nombres registrales).
const TIT = { AU_CORP: H.b32("TIT_AU_CORP_SINT"), ORDEN_GLOBAL: H.b32("TIT_ORDEN_GLOBAL_SINT") };
const OPER = { ORDENEX: H.b32("OP_ORDENEX_SINT"), AUBANK: H.b32("OP_AUBANK_SINT"), ORDEN_GLOBAL: H.b32("OP_ORDEN_GLOBAL_SINT") };
const TIPO = {
  CORRETAJE_C: H.b32("CORRETAJE_CLASE_C"),
  ATS_B: H.b32("ATS_CLASE_B"),
  CUSTODIA_G: H.b32("CUSTODIA_CLASE_G"),
  OFERTA_EXENTA: H.b32("OFERTA_EXENTA"),
  INVESTMENT_CO: H.b32("INVESTMENT_COMPANY"),
};

const SIN_OTORGAMIENTO = { number: H.ZERO32, validFrom: 0, validUntil: 0, documentRef: H.ZERO32 };

/** Orden de gobierno ligada al contenido, aprobada con doble control real. */
async function ordenGob(f, o) {
  const p = await OA.orden({
    verifyingContract: o.contrato.address,
    action: H.b32(o.action),
    assetId: o.scope,
    amount: String(o.amount || 0),
    amountSecondary: String(o.amountSecondary || 0),
    nonce: F.nonceUnico(o.tag || o.action),
    evidenceRoot: o.evidenceRoot,
  });
  const digest = OA.digestDe(p);
  if (o.aprobar !== false) await OA.aprobar(f, digest, H.b32(o.etiqueta || o.action));
  return { p, tupla: OA.tupla(p), digest };
}

/** Eventos de `contrato` en un recibo, ya decodificados. */
function logsDe(contrato, rc) {
  const out = [];
  for (const l of rc.logs) {
    if (l.address.toLowerCase() !== contrato.address.toLowerCase()) continue;
    try {
      out.push(contrato.iface.parseLog(l));
    } catch (_) {
      /* evento de otro ABI: no es de este contrato */
    }
  }
  return out;
}

/** Espera un revert por el error `nombre` de `contrato`. Hardhat a veces no
 *  decodifica un error personalizado y deja sólo el selector: se acepta
 *  cualquiera de las dos formas, nunca «cualquier revert». */
async function revertCon(promise, contrato, nombre) {
  let msg = "";
  let fallo = false;
  try {
    await promise;
  } catch (e) {
    fallo = true;
    msg = String((e && e.message) || e);
  }
  if (!fallo) throw new Error("se esperaba un revert " + nombre + " y no lo hubo");
  const selector = contrato.iface.getSighash(nombre);
  if (!msg.includes(nombre) && !msg.includes(selector)) {
    throw new Error("revert con motivo inesperado.\n  esperado: " + nombre + " (" + selector + ")\n  obtenido: " + msg);
  }
  return msg;
}

// ------------------------------------------------------------ licencias

async function desplegarLicencias(f) {
  const lic = await H.deploy("SFSPLicenseRegistry", [f.board, f.governance.address], f.board);
  await lic.send("grantRole", [await lic.call("TECH_OPS"), f.board], f.board);
  await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), lic.address], f.board);
  f.lic = lic;
  f.SCOPE_LICENSE = await lic.call("SCOPE_LICENSE");
  f.SCOPE_MODULE = await lic.call("SCOPE_MODULE");
  return lic;
}

function terminos(holder, licenseType, o) {
  const x = o || {};
  return {
    holder,
    operator: x.operator || OPER.ORDEN_GLOBAL,
    jurisdiction: x.jurisdiction || H.b32("JUR_SINT"),
    licenseType,
    kind: x.kind !== undefined ? x.kind : KIND.LICENCIA,
    authority: x.authority || H.b32("AUTORIDAD_SINT"),
  };
}

async function registrarLicencia(f, id, t, reason) {
  const motivo = reason || H.b32("ALTA_EN_TRAMITE");
  const contenido = await f.lic.call("registerContent", [id, t, motivo]);
  const o = await ordenGob(f, {
    contrato: f.lic, action: "LICENSE_REGISTER", scope: f.SCOPE_LICENSE, evidenceRoot: contenido,
  });
  return await f.lic.send("registerLicense", [id, t, motivo, o.tupla, o.digest], f.board);
}

async function ordenTransicion(f, id, desde, hacia, g, reason, extra) {
  const contenido = await f.lic.call("transitionContent", [id, hacia, g, reason]);
  return await ordenGob(f, Object.assign({
    contrato: f.lic, action: "LICENSE_STATUS", scope: f.SCOPE_LICENSE,
    amount: desde, amountSecondary: hacia, evidenceRoot: contenido,
  }, extra || {}));
}

async function transicion(f, id, desde, hacia, g, reason) {
  const motivo = reason || H.b32("MOTIVO_SINT");
  const otorg = g || SIN_OTORGAMIENTO;
  const o = await ordenTransicion(f, id, desde, hacia, otorg, motivo);
  return await f.lic.send("transitionLicense", [id, hacia, otorg, motivo, o.tupla, o.digest], f.board);
}

async function otorgamiento(dias, desfase) {
  const ts = await H.now();
  return {
    number: H.b32("NUM-SINT-" + ts),
    validFrom: ts - 10 + (desfase || 0),
    validUntil: ts + Math.round(dias * DIA),
    documentRef: H.b32("doc_otorgamiento"),
  };
}

/** Alta + otorgamiento + inicio de vigencia, en tres órdenes distintas. */
async function licenciaVigente(f, id, t, dias) {
  await registrarLicencia(f, id, t);
  await transicion(f, id, LS.EN_TRAMITE, LS.OTORGADA, await otorgamiento(dias || 30), H.b32("LICENCIA_OTORGADA"));
  await transicion(f, id, LS.OTORGADA, LS.VIGENTE, SIN_OTORGAMIENTO, H.b32("INICIO_VIGENCIA"));
}

async function declararModulo(f, md) {
  const contenido = await f.lic.call("moduleContent", [md]);
  const o = await ordenGob(f, {
    contrato: f.lic, action: "MODULE_AVAILABILITY", scope: f.SCOPE_MODULE, evidenceRoot: contenido,
  });
  return await f.lic.send("declareModule", [md, o.tupla, o.digest], f.board);
}

function modulo(id, deps, declared, reason) {
  return {
    moduleId: id,
    holders: deps.map((d) => d[0]),
    licenseTypes: deps.map((d) => d[1]),
    declared,
    reasonCode: reason || H.b32("DECLARACION_MODULO"),
  };
}

// ------------------------------------------------------------ pasaporte

const VACIO = { value: H.ZERO32, asOf: 0, validUntil: 0 };
const COBERTURA_VACIA = { ratioBps: 0, asOf: 0, validUntil: 0 };

function detalles(o) {
  const x = o || {};
  return {
    auditor: x.auditor || VACIO,
    valuator: x.valuator || VACIO,
    custodian: x.custodian || VACIO,
    segment: x.segment || VACIO,
    coverage: x.coverage || COBERTURA_VACIA,
    releaseSchedule: x.releaseSchedule || VACIO,
    redemptionTerms: x.redemptionTerms || VACIO,
    licenses: x.licenses || VACIO,
    documentRoot: x.documentRoot || VACIO,
  };
}

async function campoFechado(valor, dias) {
  const ts = await H.now();
  return { value: typeof valor === "string" && valor.startsWith("0x") ? valor : H.b32(valor), asOf: ts - 10, validUntil: ts + Math.round(dias * DIA) };
}

async function ordenPasaporte(f, assetId, d, reason, extra) {
  const previa = Number(await f.registry.call("passportVersionOf", [assetId]));
  const contenido = await f.registry.call("passportUpdateContent", [assetId, d, reason]);
  return await ordenGob(f, Object.assign({
    contrato: f.registry, action: "PASSPORT_UPDATE", scope: assetId,
    amount: previa, amountSecondary: previa + 1, evidenceRoot: contenido,
  }, extra || {}));
}

async function fijarDetalles(f, assetId, d, reason) {
  const motivo = reason || H.b32("ACTUALIZACION_SINT");
  const o = await ordenPasaporte(f, assetId, d, motivo);
  return await f.registry.send("updatePassportDetails", [assetId, d, motivo, o.tupla, o.digest], f.board);
}

async function fijarSegmento(f, assetId, segmento, dias) {
  return await fijarDetalles(f, assetId, detalles({ segment: await campoFechado(segmento, dias || 30) }));
}

// ------------------------------------------------------------ identidad

async function darAlta(f, dir, subj, purpose, salt) {
  const c = F.compromiso(subj, purpose, salt);
  await f.identity.send("bindPurposeCommitment", [dir, purpose, c], f.board);
  return c;
}

let _att = 0;
async function acreditar(f, commitment, purpose) {
  _att += 1;
  return await F.atestar(f, { subjectCommitment: commitment, purpose, attestationId: H.b32("att_v03_" + _att) });
}

module.exports = {
  DIA, LS, KIND, AV, PAIS, CAMPO, TIT, OPER, TIPO, SIN_OTORGAMIENTO, VACIO, COBERTURA_VACIA,
  ordenGob, logsDe, revertCon,
  desplegarLicencias, terminos, registrarLicencia, ordenTransicion, transicion, otorgamiento,
  licenciaVigente, declararModulo, modulo,
  detalles, campoFechado, ordenPasaporte, fijarDetalles, fijarSegmento,
  darAlta, acreditar,
};
