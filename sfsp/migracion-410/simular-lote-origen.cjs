"use strict";
/* Simulacro en cadena hardhat LOCAL (en memoria, chainId 31337) del lote
 * «todo tenedor de ONDK con dirección llega a ≥ 1 ORIGEN» (formato B,
 * SFSPNativeVault.releaseOnDemand). Nunca toca una red real: el proveedor es
 * el de hardhat en proceso y las cuentas son las sintéticas de hardhat.
 *
 * Se lanza desde lote-origen-ondk.mjs --simular, o a mano:
 *   cd sfsp/contracts && LOTE=/ruta/lote-origen-ondk.json npx hardhat run ../migracion-410/simular-lote-origen.cjs
 *
 * Qué comprueba:
 *   1. Las llamadas se ejecutan con el calldata EXACTO del lote.
 *   2. Tras el lote, todo destino queda en ≥ 1 ORIGEN (saldo inicial = el leído en vivo).
 *   3. Repetir un paymentRef revierte (OperationReplay).
 *   4. Una cuenta interna declarada no puede recibir (ReleaseToInternalAccount).
 *   5. La bóveda baja exactamente el total del lote. */
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const hre = require(require.resolve("hardhat", { paths: [process.cwd()] }));
const TEST = join(hre.config.paths.root, "test");
const F = require(join(TEST, "fixture"));
const H = require(join(TEST, "helpers"));
const OA = require(join(TEST, "orden-autorizada"));

async function main() {
  if (hre.network.name !== "hardhat") throw new Error("sólo en la red hardhat en memoria");
  const lote = JSON.parse(readFileSync(process.env.LOTE, "utf8"));
  const items = lote.items.filter((i) => BigInt(i.faltante) > 0n);
  const total = items.reduce((s, i) => s + BigInt(i.faltante), 0n);
  const maxOp = items.reduce((m, i) => (BigInt(i.faltante) > m ? BigInt(i.faltante) : m), 0n);
  const p = H.provider;
  const saldo = async (a) => BigInt(await p.send("eth_getBalance", [a, "latest"]));

  const f = await F.deployAll();
  const GENESIS = 10n ** 30n; // 1.000.000.000.000 ORIGEN
  const v = await H.deploy("SFSPNativeVault", [f.board, f.governance.address, f.engine.address, f.ASSET_NEW, String(GENESIS)], f.board);
  await v.send("grantRole", [await v.call("ISSUER"), f.board], f.board);
  await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), v.address], f.board);

  // Estado inicial: el saldo de ORIGEN leído en vivo, y alta de identidad sintética.
  let k = 0;
  for (const i of items) {
    await p.send("hardhat_setBalance", [i.address, "0x" + BigInt(i.origenActual).toString(16)]);
    const subj = H.b32("subj_sim_" + k), salt = H.b32("salt_sim_" + k);
    await f.identity.send("bindPurposeCommitment", [i.address, F.PURPOSE_BASE, F.compromiso(subj, F.PURPOSE_BASE, salt)], f.board);
    k++;
  }
  // Bóveda fondeada con el total exacto + 1 wei de margen.
  await v.sendValue("absorb", [H.b32("SIMULACRO")], f.board, total + 1n);

  // Cupo con quórum y timelock (SFSP-410 R5). +1 wei para que el negativo de
  // cuenta interna llegue a `_pay` y no lo pare antes el cupo agotado.
  const ts = await H.now();
  const period = 86400, validUntil = ts + 30 * 86400, docRoot = lote.raizLote || H.ZERO32;
  const terms = await v.call("budgetTermsRoot", [period, validUntil, docRoot]);
  const po = await OA.orden({
    verifyingContract: v.address, action: H.b32("SET_RELEASE_BUDGET"), assetId: f.ASSET_NEW,
    amount: String(total + 1n), amountSecondary: String(maxOp), nonce: H.b32("cupo_lote_sim"), expiry: ts + 3 * 3600, evidenceRoot: terms,
  });
  const d = OA.digestDe(po);
  await OA.aprobar(f, d, H.b32("SET_RELEASE_BUDGET"));
  await H.increaseTime(F.GOV.timelockDelay + 1);
  await v.send("setReleaseBudget", [OA.tupla(po), d, period, validUntil, docRoot], f.board);

  const antesBoveda = BigInt((await v.call("vaultBalance")).toString());
  const resultados = [];
  for (const i of items) {
    const hash = await p.send("eth_sendTransaction", [{ from: f.board, to: v.address, data: i.releaseOnDemand.data, gas: "0x" + (500000).toString(16) }]);
    const rc = await p.send("eth_getTransactionReceipt", [hash]);
    const fin = await saldo(i.address);
    resultados.push({ address: i.address, enviado: i.faltante, saldoFinalWei: fin.toString(), ok: rc.status === "0x1" && fin >= BigInt(lote.objetivoWei), gas: parseInt(rc.gasUsed, 16) });
  }
  const despuesBoveda = BigInt((await v.call("vaultBalance")).toString());

  // Negativos.
  let replay = "no probado", interna = "no probado";
  if (items.length) {
    replay = await H.expectRevert(
      p.send("eth_sendTransaction", [{ from: f.board, to: v.address, data: items[0].releaseOnDemand.data, gas: "0x" + (500000).toString(16) }]),
      "OperationReplay",
    ).then(() => "revierte OperationReplay", (e) => "FALLO: " + e.message);
  }
  const ext = (lote.excluidas || [])[0];
  if (ext) {
    await v.send("setInternalAccount", [ext.address, true, H.b32("SIMULACRO_INTERNA")], f.board);
    interna = await H.expectRevert(
      v.send("releaseOnDemand", [ext.address, "1", H.b32("ref_interna_sim"), H.b32("sim")], f.board),
      "ReleaseToInternalAccount",
    ).then(() => "revierte ReleaseToInternalAccount", (e) => "FALLO: " + e.message);
  }

  const out = {
    red: "hardhat en memoria (chainId 31337) — simulacro, nada se envió a la 5550",
    bloqueLecturaVivo: lote.bloque.numero,
    llamadas: items.length,
    totalWei: total.toString(),
    todosLleganA1: resultados.every((r) => r.ok),
    bovedaBajoExactamente: (antesBoveda - despuesBoveda) === total,
    gasTotal: resultados.reduce((s, r) => s + r.gas, 0),
    repeticionPaymentRef: replay,
    envioACuentaInterna: interna,
    resultados,
  };
  writeFileSync(join(process.env.SALIDA, "simulacion-lote-origen.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`simulacro: ${items.length} llamadas · todos ≥ 1 ORIGEN: ${out.todosLleganA1} · bóveda −total exacto: ${out.bovedaBajoExactamente} · replay: ${replay} · interna: ${interna}`);
  if (!out.todosLleganA1 || !out.bovedaBajoExactamente || replay.startsWith("FALLO") || interna.startsWith("FALLO")) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
