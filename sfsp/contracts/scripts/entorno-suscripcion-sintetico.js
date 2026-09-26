"use strict";
/* Entorno SINTÉTICO de suscripción primaria para los ENSAYOS (Hardhat local o
 * bifurcación local de la 5550). NUNCA para una red real: se niega si el nodo
 * no es la red Hardhat en proceso.
 *
 * Por qué existe: desde las correcciones de conformidad del v0.3 (§7, SFSP-120
 * §0.3), vender ORIGEN desde la bóveda (`releaseOnDemand` con cupo de venta) y
 * emitir al usuario que pagó (`mintOnDemand`, `mint`) es COLOCAR: el motor de
 * elegibilidad aplica SUBSCRIBE sobre el adquirente. En la 5550 eso exige
 * decisiones que la Junta todavía no tomó (primera ola de países, base de
 * colocación, licencias; v0.3 §18) y hasta entonces responde BLOCKED_DECISION o
 * DENY. Para que un ensayo pueda recorrer una venta, este módulo monta valores
 * SINTÉTICOS —no propuestas—: registro de licencias con una licencia plena
 * vigente, país PERMITIDO, base de colocación, política SUBSCRIBE, segmento
 * PRINCIPAL y residencia acreditada de los usuarios del ensayo.
 *
 * Todo lo hace la Junta sintética del ensayo, con las órdenes de gobierno
 * aprobadas por los firmantes sintéticos (doble control real, como en la cadena). */
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");

/**
 * @param {object} o
 * @param {object} o.reg       registro que devuelve desplegar-sfsp410.js
 * @param {string} o.junta     cuenta DBNX_BOARD del ensayo
 * @param {string[]} o.firmantes firmantes de gobierno del ensayo (≥ 3)
 * @param {string[]} o.assetIds activos que se van a colocar
 * @param {string[]} o.usuarios direcciones que van a suscribir
 */
async function montarSuscripcionSintetica(o) {
  const hre = require(require.resolve("hardhat", { paths: [RAIZ] }));
  const prov = hre.network.provider;
  const rpc = (method, params = []) => prov.request({ method, params });
  const cliente = await rpc("web3_clientVersion");
  if (!/^HardhatNetwork/i.test(cliente)) throw new Error("entorno sintético: sólo en la red Hardhat en proceso (" + cliente + ")");

  const H = require(path.join(RAIZ, "test", "helpers"));
  const V = require(path.join(RAIZ, "test", "v03"));
  const Dp = require(path.join(__dirname, "desplegar-sfsp410"));
  const abi = (n) => Dp.leerArtefacto(n).abi;
  const c = o.reg.contratos;
  const f = {
    board: o.junta,
    signers: o.firmantes,
    engine: new H.Contract(c.SFSPEligibilityEngine.address, abi("SFSPEligibilityEngine")),
    registry: new H.Contract(c.SFSPAssetRegistry.address, abi("SFSPAssetRegistry")),
    governance: new H.Contract(c.SFSPGovernanceController.address, abi("SFSPGovernanceController")),
    identity: new H.Contract(c.SFSPIdentityAdapter.address, abi("SFSPIdentityAdapter")),
  };

  // En una bifurcación las cuentas sintéticas tienen su saldo REAL de la 5550
  // (cero). Para pagar el gas de estas transacciones se les da saldo y después
  // se les devuelve EXACTAMENTE el que tenían: el circulante no cambia.
  const quienes = [o.junta, ...o.firmantes];
  const antes = {};
  for (const q of quienes) antes[q] = await rpc("eth_getBalance", [q, "latest"]);
  for (const q of quienes) await rpc("hardhat_setBalance", [q, "0x" + (10n ** 21n).toString(16)]);
  try {
    // Roles operativos de la Junta SINTÉTICA, sólo en el ensayo: en la red real
    // estas acciones las ejecutan TECH_OPS y el atestador de Genesis ID.
    await f.engine.send("grantRole", [await f.engine.call("TECH_OPS"), o.junta], o.junta);
    await f.registry.send("grantRole", [await f.registry.call("TECH_OPS"), o.junta], o.junta);
    await f.identity.send("grantRole", [await f.identity.call("ATTESTOR"), o.junta], o.junta);
    await V.habilitarSuscripcion(f, o.assetIds, o.usuarios, []);
  } finally {
    for (const q of quienes) await rpc("hardhat_setBalance", [q, antes[q]]);
  }
  return { licencias: f.lic.address, pais: V.PAIS_SUSCRIPCION };
}

module.exports = { montarSuscripcionSintetica };
