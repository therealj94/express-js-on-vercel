/* SFSP-410 · UNA CADENA LOCAL CON LOS CONTRATOS DE VERDAD, PARA LAS PRUEBAS.
 *
 *   SFSP_CONTRATOS=/ruta/a/sfsp/contracts node pruebas/sfsp410/cadena-local.cjs
 *
 * No toca ninguna red: levanta la red EN PROCESO de Hardhat (chainId 31337),
 * la sirve por JSON-RPC en 127.0.0.1 y despliega ahí, con los artefactos YA
 * COMPILADOS de sfsp/contracts (no compila, no descarga nada), el mismo
 * fixture sintético que usan las pruebas de los contratos:
 *
 *   · SFSPNativeVault (la bóveda de ORIGEN) con cupo de liberación aprobado
 *     por gobierno con doble control y espera, fondeada con `absorb`;
 *   · SFSPIssuanceController con topes del instrumento y cupo de emisión;
 *   · una cuenta interna declarada en los dos (la "tesorería" del fixture);
 *   · una llave de EMISOR efímera (aleatoria, creada aquí, sin valor fuera de
 *     esta cadena de juguete) con el rol ISSUER en los dos contratos;
 *   · un usuario elegible con llave propia (para probar `absorb`).
 *
 * Cuando está lista escribe UNA línea en stdout:
 *   SFSP410_LISTO {"rpc": "...", ...}
 * y se queda viva hasta que le cierren stdin o le manden SIGTERM.
 *
 * Los números (cupos, topes, génesis) son de PRUEBA, igual que en el fixture:
 * ninguno es una recomendación económica. */
'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const CONTRATOS = process.env.SFSP_CONTRATOS;
if (!CONTRATOS) {
  console.error('falta SFSP_CONTRATOS (ruta a sfsp/contracts)');
  process.exit(2);
}
process.chdir(CONTRATOS);
const req = createRequire(path.join(CONTRATOS, 'package.json'));

const DIA = 86400;
const ETH = 10n ** 18n;
const GENESIS = 10n ** 30n;

// Parámetros de la prueba, con nombre para que el test los lea de la salida.
const CUPO_NATIVO = { porPeriodo: 10n * ETH, porOperacion: 4n * ETH };
const CUPO_EMISION = { porPeriodo: 1000n, porOperacion: 300n };

async function main() {
  const hre = req('hardhat');
  const { TASK_NODE_CREATE_SERVER } = req('hardhat/builtin-tasks/task-names');
  const F = req('./test/fixture');
  const H = req('./test/helpers');
  const OA = req('./test/orden-autorizada');

  const server = await hre.run(TASK_NODE_CREATE_SERVER, {
    hostname: '127.0.0.1',
    port: 0,
    provider: hre.network.provider,
  });
  const { port } = await server.listen();

  const f = await F.deployAll();

  // Llaves efímeras: se crean aquí y mueren con el proceso.
  // ethers v6 del propio backend (el de sfsp/contracts es el v5 de Hardhat).
  const { Wallet } = require('ethers');
  const emisor = new Wallet('0x' + crypto.randomBytes(32).toString('hex'));
  const usuario = new Wallet('0x' + crypto.randomBytes(32).toString('hex'));

  const enviarValor = async (a, wei) => {
    await H.provider.send('eth_sendTransaction', [{
      from: f.board, to: a, value: '0x' + BigInt(wei).toString(16),
    }]);
  };

  // ── la bóveda de ORIGEN ─────────────────────────────────────────────────
  const vault = await H.deploy('SFSPNativeVault',
    [f.board, f.governance.address, f.engine.address, f.ASSET_NEW, String(GENESIS)], f.board);
  await vault.send('grantRole', [await vault.call('ISSUER'), emisor.address], f.board);
  await f.governance.send('grantRole', [await f.governance.call('TECH_OPS'), vault.address], f.board);
  await vault.sendValue('absorb', [H.b32('CONSOLIDACION')], f.board, 100n * ETH);
  await vault.send('setInternalAccount', [f.treasury, true, H.b32('TESORERIA')], f.board);

  {
    const ts = await H.now();
    const period = DIA, validUntil = ts + 30 * DIA, docRoot = H.b32('acta_cupo_prueba');
    const terms = await vault.call('budgetTermsRoot', [period, validUntil, docRoot]);
    const p = await OA.orden({
      verifyingContract: vault.address,
      action: H.b32('SET_RELEASE_BUDGET'),
      assetId: f.ASSET_NEW,
      amount: String(CUPO_NATIVO.porPeriodo),
      amountSecondary: String(CUPO_NATIVO.porOperacion),
      nonce: H.b32('cupo_nativo_prueba'),
      expiry: ts + 3 * 3600,
      evidenceRoot: terms,
    });
    const d = OA.digestDe(p);
    await OA.aprobar(f, d, H.b32('SET_RELEASE_BUDGET'));
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await vault.send('setReleaseBudget', [OA.tupla(p), d, period, validUntil, docRoot], f.board);
  }

  // ── el controlador de emisión (tokens SFSP) ─────────────────────────────
  await f.issuance.send('setInstrumentLimits', [f.ASSET_NEW, 1000000, 100000000], f.board);
  await f.issuance.send('setInternalAccount', [f.treasury, true, H.b32('TESORERIA')], f.board);
  await f.issuance.send('grantRole', [await f.issuance.call('ISSUER'), emisor.address], f.board);
  {
    const ts = await H.now();
    const period = DIA, validUntil = ts + 30 * DIA, docRoot = H.b32('acta_cupo_emision');
    const terms = await f.issuance.call('budgetTermsRoot', [period, validUntil, docRoot]);
    const p = await OA.orden({
      verifyingContract: f.issuance.address,
      action: H.b32('SET_MINT_BUDGET'),
      assetId: f.ASSET_NEW,
      amount: String(CUPO_EMISION.porPeriodo),
      amountSecondary: String(CUPO_EMISION.porOperacion),
      nonce: H.b32('cupo_emision_prueba'),
      expiry: ts + 3 * 3600,
      evidenceRoot: terms,
    });
    const d = OA.digestDe(p);
    await OA.aprobar(f, d, H.b32('SET_MINT_BUDGET'));
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await f.issuance.send('setMintBudget', [OA.tupla(p), d, period, validUntil, docRoot], f.board);
  }

  // ── el usuario con llave, dado de alta como elegible ────────────────────
  await f.identity.send('bindPurposeCommitment', [
    usuario.address, F.PURPOSE_BASE,
    F.compromiso(H.b32('subj_usuario_llave'), F.PURPOSE_BASE, H.b32('salt_usuario_llave')),
  ], f.board);

  await enviarValor(emisor.address, 10n * ETH);   // sólo para gas
  await enviarValor(usuario.address, 20n * ETH);  // su ORIGEN propio

  const salida = {
    rpc: `http://127.0.0.1:${port}`,
    chainId: 31337,
    board: f.board,
    firmantes: f.signers,
    vault: vault.address,
    issuance: f.issuance.address,
    governance: f.governance.address,
    asset: f.assetNew.address,
    assetId: f.ASSET_NEW,
    interna: f.treasury,
    elegibles: [f.alice, f.bob],
    noElegible: f.mallory,
    emisorLlave: emisor.privateKey,
    emisor: emisor.address,
    usuarioLlave: usuario.privateKey,
    usuario: usuario.address,
    cupoNativo: { porPeriodo: String(CUPO_NATIVO.porPeriodo), porOperacion: String(CUPO_NATIVO.porOperacion) },
    cupoEmision: { porPeriodo: String(CUPO_EMISION.porPeriodo), porOperacion: String(CUPO_EMISION.porOperacion) },
  };
  process.stdout.write(`SFSP410_LISTO ${JSON.stringify(salida)}\n`);

  const cerrar = async () => { try { await server.close(); } catch {} process.exit(0); };
  process.stdin.on('end', cerrar);
  process.stdin.on('close', cerrar);
  process.stdin.resume();
  process.on('SIGTERM', cerrar);
}

main().catch((e) => {
  console.error(`[cadena-local] ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
