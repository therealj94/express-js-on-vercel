"use strict";
/* Despliegue de DEMOSTRACIÓN para el Panel de emisión y quema (SFSP-410).
 *
 * SÓLO MODO PRUEBA. Uso:
 *   terminal 1:  npx hardhat node
 *   terminal 2:  npx hardhat run scripts/demo-panel.js --network localhost
 *
 * Reutiliza el fixture sintético de las pruebas (test/fixture.js), añade la
 * bóveda sellada de ORIGEN y escribe ../panel-emision/config.json.
 *
 * Salvaguardas: se niega a correr contra cualquier red que no sea el nodo local
 * de Hardhat (chainId 31337). Nunca usa claves: firma con las cuentas
 * desbloqueadas del nodo local, que son sintéticas. Nada de esto toca la 5550. */
const { writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const hre = require("hardhat");
const F = require("../test/fixture");
const H = require("../test/helpers");

const CHAIN_PERMITIDA = 31337;
const ETH = 10n ** 18n;
// Suministro génesis SIMULADO: las 20 cuentas del nodo Hardhat × 10 000 ETH.
// En la cadena real este número lo fija el bloque génesis, no este script.
const GENESIS_DEMO = 20n * 10_000n * ETH;
const ASSET_ORIGEN = H.b32("SFSP:NATIVE:ORIGEN:DEMO");
const SALIDA = join(__dirname, "..", "..", "panel-emision", "config.json");

async function main() {
  const chainId = await H.chainId();
  if (chainId !== CHAIN_PERMITIDA) {
    throw new Error(
      `demo-panel: chainId ${chainId} rechazado. Este script sólo corre contra el nodo local ` +
        `de Hardhat (${CHAIN_PERMITIDA}). Nunca contra la 5550 ni ninguna red real.`,
    );
  }
  console.log(`Red: ${hre.network.name} (chainId ${chainId}) — modo prueba`);

  const f = await F.deployAll();
  console.log("Fixture desplegado (gobierno, registro, motor, activos, emisión).");

  // --- activo ORIGEN de demostración: pasaporte propio + política MINT, para
  //     que la bóveda tenga su propio assetId elegible. Si algo falla, se usa el
  //     activo del fixture (igual que la prueba 17).
  let origenId = ASSET_ORIGEN;
  try {
    const pas = F.passport(ASSET_ORIGEN);
    pas.assetKind = F.Kind.NATIVE;
    pas.decimals = 18;
    pas.unit = H.b32("ORIGEN");
    await f.registry.send("registerAsset", [pas], f.board);
    await F.fijarPolitica(f, ASSET_ORIGEN, H.b32("MINT"), F.policy({}), "origen");
    console.log("Activo ORIGEN (demo) registrado con política MINT.");
  } catch (e) {
    origenId = f.ASSET_NEW;
    console.warn("No se pudo registrar ORIGEN demo; la bóveda usa ASSET_NEW:", e.message);
  }

  const vault = await H.deploy(
    "SFSPNativeVault",
    [f.board, f.governance.address, f.engine.address, origenId, String(GENESIS_DEMO)],
    f.board,
  );
  await vault.send("grantRole", [await vault.call("ISSUER"), f.board], f.board);
  await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), vault.address], f.board);

  // Tesorería: cuenta interna en ambos contratos (no se acuña ni se libera hacia ella).
  await f.issuance.send("setInternalAccount", [f.treasury, true, H.b32("TESORERIA")], f.board);
  await vault.send("setInternalAccount", [f.treasury, true, H.b32("TESORERIA")], f.board);

  // Fondear la bóveda: 1000 ETH de prueba "sellados" (equivale a quemar).
  await vault.sendValue("absorb", [H.b32("CONSOLIDACION")], f.board, 1000n * ETH);

  // Límites del instrumento AUKA (decimales 6 en el pasaporte del fixture).
  const U = 10n ** 6n;
  await f.issuance.send(
    "setInstrumentLimits",
    [f.ASSET_NEW, String(1_000_000n * U), String(10_000_000n * U)],
    f.board,
  );

  const abi = async (n) => (await hre.artifacts.readArtifact(n)).abi;
  const [bloque] = [await hre.network.provider.send("eth_blockNumber", [])];

  const config = {
    mode: "prueba",
    aviso: "Configuración de DEMOSTRACIÓN. Nodo local Hardhat, cuentas sintéticas. No usar en la 5550.",
    rpc: "http://127.0.0.1:8545",
    chainId,
    deployBlock: 0,
    generatedAt: new Date().toISOString(),
    lastSetupBlock: Number(bloque),
    addresses: {
      governance: f.governance.address,
      issuance: f.issuance.address,
      registry: f.registry.address,
      engine: f.engine.address,
      assetNew: f.assetNew.address,
      nativeVault: vault.address,
    },
    abis: {
      governance: await abi("SFSPGovernanceController"),
      issuance: await abi("SFSPIssuanceController"),
      asset: await abi("SFSPRegulatedAsset"),
      nativeVault: await abi("SFSPNativeVault"),
    },
    accounts: [
      { label: "Junta", role: "junta", address: f.board },
      ...f.signers.map((s, i) => ({ label: `Firmante ${i + 1}`, role: "firmante", address: s })),
      { label: "Emisor", role: "emisor", address: f.board },
      { label: "Usuario Alice", role: "usuario", address: f.alice },
      { label: "Usuario Bob", role: "usuario", address: f.bob },
      { label: "Tesorería", role: "tesoreria", address: f.treasury },
    ],
    assets: [
      {
        id: f.ASSET_NEW,
        label: "AUKA (demo)",
        symbol: "AUKA",
        kind: "token",
        contract: f.assetNew.address,
        decimals: 6,
      },
      {
        id: origenId,
        label: "ORIGEN (demo)",
        symbol: "ORIGEN",
        kind: "native",
        contract: vault.address,
        decimals: 18,
      },
    ],
    genesisSupply: String(GENESIS_DEMO),
    governanceParams: F.GOV,
  };

  mkdirSync(join(SALIDA, ".."), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(config, null, 2));
  console.log("Bóveda ORIGEN:", vault.address, "(fondeada con 1000 ETH de prueba)");
  console.log("config.json escrito en", SALIDA);
  console.log("Siguiente paso: cd ../panel-emision && python3 -m http.server 8080");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
