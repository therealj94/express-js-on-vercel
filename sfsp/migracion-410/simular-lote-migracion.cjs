"use strict";
/* Simulacro en cadena hardhat LOCAL (en memoria, chainId 31337) de la migración a
 * la misma dirección por cupo del padrón (lote-migracion.mjs). Nunca toca una red
 * real: el proveedor es el de hardhat en proceso.
 *
 * Se lanza desde lote-migracion.mjs --simular, o a mano:
 *   cd sfsp/contracts && LOTE=/ruta/lote-migracion.json npx hardhat run ../migracion-410/simular-lote-migracion.cjs
 * La prueba test/27-lote-migracion.js llama a `simularLote` con datos sintéticos.
 *
 * Por cada activo comprueba:
 *   1. el cupo SET_MINT_BUDGET se fija con quórum y espera, con S0 y máx/op del lote
 *      y `termsDocRoot` = raíz del padrón;
 *   2. las llamadas se ejecutan con el calldata EXACTO del lote;
 *   3. cada titular recibe EXACTAMENTE su monto;
 *   4. la suma acuñada = S0 y el cupo queda en 0;
 *   5. repetir un paymentRef revierte (OperationReplay);
 *   6. una cuenta interna no recibe (MintToInternalAccount). */
const { readFileSync, writeFileSync } = require("node:fs");
const { join, dirname } = require("node:path");

function cargar(hre) {
  const TEST = join(hre.config.paths.root, "test");
  return { F: require(join(TEST, "fixture")), H: require(join(TEST, "helpers")), OA: require(join(TEST, "orden-autorizada")) };
}

async function simularLote(hre, lote) {
  if (hre.network.name !== "hardhat") throw new Error("sólo en la red hardhat en memoria");
  const { F, H, OA } = cargar(hre);
  const P = hre.network.provider;
  const assetId = lote.assetId;
  const S0 = BigInt(lote.S0);
  const maxOp = BigInt(lote.maxPorOperacion);

  const f = await F.deployAll();
  const asset = await H.deploy(
    "SFSPRegulatedAsset",
    [f.board, assetId, f.registry.address, f.engine.address, f.identity.address, f.governance.address, true],
    f.board,
  );
  await asset.send("grantRole", [await asset.call("TECH_OPS"), f.board], f.board);
  await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), asset.address], f.board);
  await f.registry.send("registerAsset", [F.passport(assetId)], f.board);
  const fp = { engine: f.engine, registry: f.registry, governance: f.governance, signers: f.signers, board: f.board };
  for (const a of F.ACTIONS) await F.fijarPolitica(fp, assetId, H.b32(a), F.policy({}), "mig");
  await asset.send("setIssuanceController", [f.issuance.address], f.board);
  await f.issuance.send("registerAssetContract", [assetId, asset.address], f.board);
  // Topes del instrumento contando S0 (riesgo 4 del LEEME): exactamente S0.
  await f.issuance.send("setInstrumentLimits", [assetId, String(S0), String(S0)], f.board);

  // Identidad sintética por titular (P9a en la realidad).
  let k = 0;
  for (const c of lote.llamadas) {
    const subj = H.b32("subj_mig_" + k), salt = H.b32("salt_mig_" + k);
    await f.identity.send("bindPurposeCommitment", [c.address, F.PURPOSE_BASE, F.compromiso(subj, F.PURPOSE_BASE, salt)], f.board);
    k++;
  }
  // Cuenta interna: la primera excluida por ser interna, o una sintética.
  const exInterna = (lote.excluidas || []).find((x) => /interna/i.test(x.motivo) && /^0x[0-9a-fA-F]{40}$/.test(x.address));
  const interna = exInterna ? exInterna.address : "0x" + "1e".repeat(20);
  await f.issuance.send("setInternalAccount", [interna, true, H.b32("SIMULACRO_INTERNA")], f.board);
  await f.identity.send("bindPurposeCommitment", [interna, F.PURPOSE_BASE, F.compromiso(H.b32("subj_int"), F.PURPOSE_BASE, H.b32("salt_int"))], f.board);

  // Cupo con quórum y timelock. Los montos y la raíz son los del lote; la cadena, el
  // contrato y la ventana son los de este simulacro.
  const ts = await H.now();
  const validUntil = ts + 30 * 86400;
  const period = validUntil + 1; // un solo periodo para toda la ventana
  const terms = await f.issuance.call("budgetTermsRoot", [period, validUntil, lote.raizPadron]);
  const po = await OA.orden({
    verifyingContract: f.issuance.address, action: H.b32("SET_MINT_BUDGET"), assetId,
    amount: lote.orden.payload.amount, amountSecondary: lote.orden.payload.amountSecondary,
    nonce: lote.orden.payload.nonce, expiry: ts + 3 * 3600, evidenceRoot: terms,
  });
  if (BigInt(po.amount) !== S0 || BigInt(po.amountSecondary) !== maxOp) throw new Error("la orden no lleva S0 / máx por operación del lote");
  const d = OA.digestDe(po);
  await OA.aprobar(f, d, H.b32("SET_MINT_BUDGET"));
  await H.increaseTime(F.GOV.timelockDelay + 1);
  await f.issuance.send("setMintBudget", [OA.tupla(po), d, period, validUntil, lote.raizPadron], f.board);

  const enviar = async (data) => {
    const hash = await P.send("eth_sendTransaction", [{ from: f.board, to: f.issuance.address, data, gas: "0x" + (1_500_000).toString(16) }]);
    return await P.send("eth_getTransactionReceipt", [hash]);
  };

  // 6 · antes del lote (con cupo): una cuenta interna revierte y no gasta nada.
  const interno = await H.expectRevert(
    f.issuance.send("mintOnDemand", [assetId, interna, "1", H.keccak256(Buffer.from("MIGRACION|" + assetId + "|" + interna.toLowerCase())), lote.raizPadron], f.board),
    "MintToInternalAccount",
  ).then(() => "revierte MintToInternalAccount", (e) => "FALLO: " + e.message);

  // 2-3 · el lote, con su calldata exacto.
  const resultados = [];
  for (const c of lote.llamadas) {
    const rc = await enviar(c.mintOnDemand.data);
    const bal = BigInt((await asset.call("balanceOf", [c.address])).toString());
    resultados.push({ address: c.address, monto: c.monto, recibido: bal.toString(), ok: rc.status === "0x1" && bal === BigInt(c.monto), gas: parseInt(rc.gasUsed, 16) });
  }
  const supply = BigInt((await asset.call("totalSupply")).toString());
  const restante = BigInt((await f.issuance.call("budgetRemaining", [assetId])).toString());

  // 5 · repetir un paymentRef.
  const replay = lote.llamadas.length
    ? await H.expectRevert(enviar(lote.llamadas[0].mintOnDemand.data), "OperationReplay").then(() => "revierte OperationReplay", (e) => "FALLO: " + e.message)
    : "no probado";

  const out = {
    activo: lote.activo, assetId, red: "hardhat en memoria (chainId 31337) — simulacro, nada se envió a la 5550",
    llamadas: lote.llamadas.length, S0: S0.toString(),
    cadaTitularRecibeSuSaldo: resultados.every((r) => r.ok),
    sumaIgualS0: supply === S0 && resultados.reduce((s, r) => s + BigInt(r.recibido), 0n) === S0,
    cupoRestante: restante.toString(),
    repeticionPaymentRef: replay, envioACuentaInterna: interno,
    gasTotal: resultados.reduce((s, r) => s + r.gas, 0), resultados,
  };
  out.ok = out.cadaTitularRecibeSuSaldo && out.sumaIgualS0 && restante === 0n && !replay.startsWith("FALLO") && !interno.startsWith("FALLO");
  return out;
}

async function main() {
  const hre = require(require.resolve("hardhat", { paths: [process.cwd()] }));
  const doc = JSON.parse(readFileSync(process.env.LOTE, "utf8"));
  const salida = [];
  for (const l of doc.lotes.filter((x) => x.estado === "GENERADO")) {
    const r = await simularLote(hre, l);
    salida.push(r);
    console.log(`simulacro ${l.activo}: ${r.llamadas} llamadas · cada titular su saldo: ${r.cadaTitularRecibeSuSaldo} · suma = S0: ${r.sumaIgualS0} · cupo restante ${r.cupoRestante} · replay: ${r.repeticionPaymentRef} · interna: ${r.envioACuentaInterna}`);
  }
  writeFileSync(join(dirname(process.env.LOTE), "simulacion-lote-migracion.json"), JSON.stringify(salida, null, 2) + "\n");
  if (!salida.length || !salida.every((r) => r.ok)) process.exitCode = 1;
}

module.exports = { simularLote };
// Con `hardhat run` (LOTE fijado) corre el simulacro; dentro de mocha sólo exporta.
if (process.env.LOTE && typeof describe === "undefined") main().catch((e) => { console.error(e); process.exitCode = 1; });
