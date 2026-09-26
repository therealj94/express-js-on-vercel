"use strict";
/* Montaje común de las pruebas 23 a 25 (oráculo único, reservas y tesorería).
 * Todo es sintético: precios, pesos, límites y diferenciales son valores de
 * PRUEBA y ninguno es una recomendación (los decide la Junta, v0.3 §18). */
const F = require("./fixture");
const H = require("./helpers");

const XAU = H.b32("XAU");
const XAG = H.b32("XAG");
const E18 = 10n ** 18n;
const ORO = 443333000000n; // 4.433,33 USD/oz, 8 decimales
const PLATA = 5000000000n; // 50,00 USD/oz
const EDAD = 600;
const TOL = 200;

const ASSET_AUKA = H.b32("SFSP:COM:AUKA:TEST");
const ASSET_AGKA = H.b32("SFSP:COM:AGKA:TEST");
const ASSET_ORIGEN = H.b32("SFSP:NATIVE:ORIGEN:TEST");

/** Eventos `nombre` emitidos por `c` en un recibo, ya decodificados. */
function eventos(c, receipt, nombre) {
  const topic = c.iface.getEventTopic(nombre);
  return receipt.logs
    .filter((l) => l.address.toLowerCase() === c.address.toLowerCase() && l.topics[0] === topic)
    .map((l) => c.iface.parseLog(l).args);
}

async function saldo(addr) {
  return BigInt(await H.provider.send("eth_getBalance", [addr, "latest"]));
}

/** Oráculo con dos publicadores y precios aceptados de oro y plata. */
async function oraculo(board, pubA, pubB) {
  const o = await H.deploy("SFSPOracleRegistry", [board], board);
  const rol = await o.call("ORACLE_PUBLISHER");
  await o.send("grantRole", [rol, pubA], board);
  await o.send("grantRole", [rol, pubB], board);
  for (const [m, p] of [[XAU, ORO], [XAG, PLATA]]) {
    await o.send("setParameters", [m, EDAD, TOL], board);
  }
  await publicarAmbos(o, pubA, pubB, ORO, PLATA);
  return o;
}

/** Publica oro y plata confirmados por dos publicadores. */
async function publicarAmbos(o, pubA, pubB, oro, plata) {
  for (const pub of [pubA, pubB]) {
    await H.increaseTime(1);
    const t = await H.now();
    await o.send("publish", [XAU, String(oro), t], pub);
    await o.send("publish", [XAG, String(plata), t], pub);
  }
}

/** Registra un activo de commodity en el catálogo, con redención disponible y
 *  políticas de elegibilidad para RELEASE (colocación) y REDEEM. */
async function registrarActivo(f, assetId) {
  const p = F.passport(assetId);
  p.status.redemption = F.Redemption.AVAILABLE;
  p.legalClass = H.b32("COMMODITY_TEST");
  await f.registry.send("registerAsset", [p], f.board);
  const fp = { engine: f.engine, registry: f.registry, governance: f.governance, signers: f.signers, board: f.board };
  for (const action of ["RELEASE", "REDEEM"]) {
    await F.fijarPolitica(fp, assetId, H.b32(action), F.policy({}), "com_" + action);
  }
}

module.exports = {
  XAU, XAG, E18, ORO, PLATA, EDAD, TOL,
  ASSET_AUKA, ASSET_AGKA, ASSET_ORIGEN,
  eventos, saldo, oraculo, publicarAmbos, registrarActivo,
};
