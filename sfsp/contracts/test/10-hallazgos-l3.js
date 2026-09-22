"use strict";
/* Lote L3 · una prueba por hallazgo, con el caso que la auditoría describe
 * encerrado dentro. Cada `it` lleva el identificador del hallazgo en el nombre,
 * para que un rojo diga inmediatamente qué propiedad se rompió.
 *
 * Todos los valores son sintéticos. No hay ningún número económico: los quórums,
 * los límites y los montos son parámetros del fixture. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");
const { buildAuthorization, acunar, ordenDeQuema } = require("./authorization");

const CASH = 1_000_000_000_000_000n;

async function sembrar(f, to, amount, tag) {
  await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 1000000, 1000000], f.board);
  const { auth, sigs } = await buildAuthorization(f, {
    destination: to,
    amount,
    authorizationId: H.b32("auth_l3_" + tag),
    nonce: H.b32("nonce_l3_" + tag),
  });
  await acunar(f, { auth, sigs }, amount, H.b32("op_l3_" + tag));
}

async function ordenFT(f, over) {
  const p = await OA.orden(
    Object.assign(
      {
        verifyingContract: f.assetNew.address,
        action: H.b32("FORCED_TRANSFER"),
        assetId: f.ASSET_NEW,
        origin: f.alice,
        destination: f.bob,
        amount: "100",
        nonce: H.b32("n_ft_l3"),
      },
      over || {},
    ),
  );
  return { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };
}

// ---------------------------------------------------------------- H01 y H06

describe("H01/H06 · la autorización compromete el contenido, no un identificador", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await sembrar(f, f.alice, 1000, "ft");
  });

  it("H01 positivo: la transferencia forzosa aprobada para ESE contenido se ejecuta y se consume", async function () {
    const o = await ordenFT(f, {});
    await OA.aprobar(f, o.digest, H.b32("FORCED_TRANSFER"));
    await f.assetNew.send("forcedTransfer", [o.tupla, o.digest], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "100");
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "900");
    assert.equal(await f.governance.call("isAuthorizationApproved", [o.digest]), false, "la aprobación se gastó");
  });

  it("H01 negativo: una aprobación válida NO ejecuta otro payload (otro destino)", async function () {
    // Esto es el hallazgo literal: antes bastaba `isActionApproved(operationId)`,
    // así que el expediente aprobado para bob servía para pagar a mallory.
    const aprobada = await ordenFT(f, {});
    await OA.aprobar(f, aprobada.digest, H.b32("FORCED_TRANSFER"));

    const desviada = await ordenFT(f, { destination: f.mallory });
    // a) presentando el digest aprobado junto al payload alterado.
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [desviada.tupla, aprobada.digest], f.board),
      "AuthorizationDigestMismatch",
    );
    // b) presentando el digest que de verdad corresponde al payload alterado.
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [desviada.tupla, desviada.digest], f.board),
      "ForcedTransferNotAuthorized",
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.mallory])).toString(), "0");
    // El intento fallido NO gastó la aprobación legítima.
    assert.equal(await f.governance.call("isAuthorizationApproved", [aprobada.digest]), true);
  });

  it("H01 negativo: una aprobación válida NO ejecuta otro origen ni otro monto", async function () {
    const aprobada = await ordenFT(f, {});
    await OA.aprobar(f, aprobada.digest, H.b32("FORCED_TRANSFER"));
    const otroOrigen = await ordenFT(f, { origin: f.treasury });
    const otroMonto = await ordenFT(f, { amount: "900" });
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [otroOrigen.tupla, aprobada.digest], f.board),
      "AuthorizationDigestMismatch",
    );
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [otroMonto.tupla, aprobada.digest], f.board),
      "AuthorizationDigestMismatch",
    );
  });

  it("H01 negativo: la misma aprobación no sirve dos veces", async function () {
    const o = await ordenFT(f, {});
    await OA.aprobar(f, o.digest, H.b32("FORCED_TRANSFER"));
    await f.assetNew.send("forcedTransfer", [o.tupla, o.digest], f.board);
    await H.expectRevert(
      f.assetNew.send("forcedTransfer", [o.tupla, o.digest], f.board),
      "ForcedTransferNotAuthorized",
    );
  });

  it("H06 positivo: el contexto autorizado es el digest, y el monto va por su cuenta", async function () {
    const d1 = OA.digestDe((await ordenFT(f, { nonce: H.b32("ctx_1") })).p);
    await f.engine.send(
      "setPolicy",
      [f.ASSET_NEW, H.b32("TRANSFER_OUT"), F.policy({ requiresAuthorization: true })],
      f.board,
    );
    await f.engine.send("setContextAuthorized", [f.ASSET_NEW, H.b32("TRANSFER_OUT"), d1, true], f.board);
    const r = await f.engine.call("evaluateOperation", [
      H.b32("subj_alice"), f.ASSET_NEW, H.b32("TRANSFER_OUT"), 100, d1,
    ]);
    assert.equal(Number(r[0]), F.CODE.ALLOW);
  });

  it("H06 negativo: dos operaciones del mismo monto NO comparten autorización", async function () {
    const d1 = OA.digestDe((await ordenFT(f, { nonce: H.b32("ctx_1") })).p);
    // Mismo monto, distinto contenido: antes el contexto era `bytes32(amount)` y
    // las dos operaciones caían en la misma clave.
    const d2 = OA.digestDe((await ordenFT(f, { nonce: H.b32("ctx_2") })).p);
    assert.notEqual(d1, d2);
    await f.engine.send(
      "setPolicy",
      [f.ASSET_NEW, H.b32("TRANSFER_OUT"), F.policy({ requiresAuthorization: true })],
      f.board,
    );
    await f.engine.send("setContextAuthorized", [f.ASSET_NEW, H.b32("TRANSFER_OUT"), d1, true], f.board);
    const r = await f.engine.call("evaluateOperation", [
      H.b32("subj_alice"), f.ASSET_NEW, H.b32("TRANSFER_OUT"), 100, d2,
    ]);
    assert.equal(Number(r[0]), F.CODE.DENY_AUTHORIZATION);
    // Y presentar el monto desnudo como contexto tampoco autoriza.
    const sinDigest = await f.engine.call("evaluateOperation", [
      H.b32("subj_alice"), f.ASSET_NEW, H.b32("TRANSFER_OUT"), 100, H.ZERO32,
    ]);
    assert.equal(Number(sinDigest[0]), F.CODE.DENY_AUTHORIZATION);
  });

  it("H01/P03 negativo: quien propone una autorización no puede aprobarla", async function () {
    const o = await ordenFT(f, { nonce: H.b32("n_sep_funciones") });
    await f.governance.send("proposeAuthorization", [o.digest, H.b32("FORCED_TRANSFER")], f.signers[0]);
    await H.expectRevert(
      f.governance.send("approveAuthorization", [o.digest], f.signers[0]),
      "ProposerCannotApprove",
    );
    // Con un solo aprobador distinto tampoco alcanza el quórum del despliegue.
    await f.governance.send("approveAuthorization", [o.digest], f.signers[1]);
    assert.equal(await f.governance.call("isAuthorizationApproved", [o.digest]), false);
    await f.governance.send("approveAuthorization", [o.digest], f.signers[2]);
    assert.equal(await f.governance.call("isAuthorizationApproved", [o.digest]), true);
  });
});

// ---------------------------------------------------------------------- H02

describe("H02 · el ISSUER no quema el saldo de quien quiera", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await sembrar(f, f.alice, 1000, "burn");
  });

  it("H02 negativo: el emisor NO quema el saldo ajeno sin autorización", async function () {
    // El caso del informe: rol ISSUER, motivo cualquiera y un `operationId` nuevo.
    const o = await ordenDeQuema(f, f.assetNew, f.ASSET_NEW, f.alice, 500, H.b32("PORQUE_SI"), H.b32("op_b_1"));
    await H.expectRevert(f.assetNew.send("burn", [o.tupla, o.digest], f.board), "BurnNotAuthorized");
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "1000");
  });

  it("H02 positivo: con el consentimiento del titular sobre ESA quema, se ejecuta", async function () {
    const o = await ordenDeQuema(f, f.assetNew, f.ASSET_NEW, f.alice, 500, H.b32("REDENCION"), H.b32("op_b_2"));
    await f.assetNew.send("approveBurnAuthorization", [o.digest], f.alice);
    assert.equal((await f.assetNew.call("burnConsentOf", [o.digest])).toLowerCase(), f.alice.toLowerCase());
    await f.assetNew.send("burn", [o.tupla, o.digest], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "500");
    assert.equal((await f.assetNew.call("totalSupply")).toString(), "500");
  });

  it("H02 negativo: el consentimiento de un titular no vale para el saldo de otro", async function () {
    await sembrar(f, f.bob, 200, "burn_bob");
    const deBob = await ordenDeQuema(f, f.assetNew, f.ASSET_NEW, f.bob, 200, H.b32("REDENCION"), H.b32("op_b_3"));
    // Alice consiente el digest de bob: el contrato compara contra `p.origin`.
    await f.assetNew.send("approveBurnAuthorization", [deBob.digest], f.alice);
    await H.expectRevert(f.assetNew.send("burn", [deBob.tupla, deBob.digest], f.board), "BurnNotAuthorized");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "200");
  });

  it("H02 negativo: consentir una quema de 10 no consiente una de 1000", async function () {
    const diez = await ordenDeQuema(f, f.assetNew, f.ASSET_NEW, f.alice, 10, H.b32("AJUSTE"), H.b32("op_b_4"));
    await f.assetNew.send("approveBurnAuthorization", [diez.digest], f.alice);
    const mil = await ordenDeQuema(f, f.assetNew, f.ASSET_NEW, f.alice, 1000, H.b32("AJUSTE"), H.b32("op_b_4"));
    await H.expectRevert(f.assetNew.send("burn", [mil.tupla, diez.digest], f.board), "AuthorizationDigestMismatch");
    await H.expectRevert(f.assetNew.send("burn", [mil.tupla, mil.digest], f.board), "BurnNotAuthorized");
  });

  it("H02 positivo: una decisión de gobierno con doble control también autoriza, y se consume", async function () {
    const o = await ordenDeQuema(f, f.assetNew, f.ASSET_NEW, f.alice, 300, H.b32("ORDEN_JUDICIAL"), H.b32("op_b_5"));
    await OA.aprobar(f, o.digest, H.b32("BURN"));
    await f.assetNew.send("burn", [o.tupla, o.digest], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "700");
    await H.expectRevert(f.assetNew.send("burn", [o.tupla, o.digest], f.board), "BurnNotAuthorized");
  });

  it("H02 negativo: quemar sigue exigiendo el rol ISSUER para ejecutar (separación de funciones)", async function () {
    const o = await ordenDeQuema(f, f.assetNew, f.ASSET_NEW, f.alice, 100, H.b32("AJUSTE"), H.b32("op_b_6"));
    await f.assetNew.send("approveBurnAuthorization", [o.digest], f.alice);
    await H.expectRevert(f.assetNew.send("burn", [o.tupla, o.digest], f.alice), "Unauthorized");
  });
});

// ---------------------------------------------------------------------- H05

describe("H05 · la liquidación no confía en lo que pasa el operador", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await sembrar(f, f.alice, 1000, "dvp");
    await f.vault.sendValue("deposit", [], f.bob, CASH);
  });

  async function orden(over) {
    const p = await OA.orden(
      Object.assign(
        {
          verifyingContract: f.settlement.address,
          action: H.b32("SETTLE_DVP"),
          assetId: f.ASSET_NEW,
          origin: f.alice,
          destination: f.bob,
          amount: "100",
          amountSecondary: String(CASH / 2n),
          nonce: H.b32("n_dvp_l3"),
        },
        over || {},
      ),
    );
    return { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };
  }

  it("H05 positivo: con contrato canónico y orden aprobada, entrega y pago se observan", async function () {
    const o = await orden({});
    await OA.aprobar(f, o.digest, H.b32("SETTLE_DVP"));
    await f.settlement.send("settle", [o.tupla, o.digest], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "100");
    assert.equal((await f.vault.call("balanceOfAccount", [f.alice])).toString(), String(CASH / 2n));
  });

  it("H05 negativo: un activo sin contrato canónico declarado no se liquida", async function () {
    const o = await orden({ assetId: f.ASSET_OLD, nonce: H.b32("n_dvp_nocanon") });
    await OA.aprobar(f, o.digest, H.b32("SETTLE_DVP"));
    await H.expectRevert(f.settlement.send("settle", [o.tupla, o.digest], f.board), "AssetNotCanonical");
  });

  it("H05 negativo: un ACTIVO FALSO que devuelve el assetId esperado no mueve efectivo", async function () {
    // El atacante del informe: declara el assetId correcto, su transferencia no
    // revierte y no hace nada. Aunque se le dé entrada al registro canónico, la
    // comprobación de saldo antes/después lo detiene: lo que cuenta no es lo que
    // devuelve el contrato, sino lo que se movió.
    const falso = await H.deploy("SFSPActivoFalso", [f.ASSET_NEW], f.board);
    await falso.send("sembrar", [f.alice, 1000], f.board);
    await f.settlement.send("registerCanonicalAsset", [f.ASSET_NEW, falso.address], f.board);

    const o = await orden({ nonce: H.b32("n_dvp_falso") });
    await OA.aprobar(f, o.digest, H.b32("SETTLE_DVP"));
    await H.expectRevert(f.settlement.send("settle", [o.tupla, o.digest], f.board), "DeliveryNotObserved");

    // El efectivo del comprador sigue entero: no se pagó nada.
    assert.equal((await f.vault.call("balanceOfAccount", [f.bob])).toString(), String(CASH));
    assert.equal((await f.vault.call("balanceOfAccount", [f.alice])).toString(), "0");
  });

  it("H05 negativo: un contrato que declara otro assetId no entra al registro canónico", async function () {
    const falso = await H.deploy("SFSPActivoFalso", [H.b32("SFSP:OTRO:ACTIVO")], f.board);
    await H.expectRevert(
      f.settlement.send("registerCanonicalAsset", [f.ASSET_NEW, falso.address], f.board),
      "CanonicalMismatch",
    );
  });

  it("H05 negativo: sin orden aprobada no hay liquidación, y una orden no vale para otro precio", async function () {
    const o = await orden({ nonce: H.b32("n_dvp_sin") });
    await H.expectRevert(f.settlement.send("settle", [o.tupla, o.digest], f.board), "SettlementNotAuthorized");

    await OA.aprobar(f, o.digest, H.b32("SETTLE_DVP"));
    const otroPrecio = await orden({ nonce: H.b32("n_dvp_sin"), amountSecondary: String(CASH / 4n) });
    await H.expectRevert(
      f.settlement.send("settle", [otroPrecio.tupla, o.digest], f.board),
      "AuthorizationDigestMismatch",
    );
  });
});

// ---------------------------------------------------------------- H04 y H17

describe("H04/H17 · migración: exclusión permanente, unicidad de origen y dos vigencias", function () {
  let f, tree, expiry;
  const MODE = { FROZEN_SNAPSHOT: 0, SURRENDER_ON_CLAIM: 1 };
  const RATIO_NUM = 3;
  const RATIO_DEN = 2;
  const CLAIM_TYPES = {
    MigrationClaim: [
      { name: "migrationId", type: "bytes32" },
      { name: "beneficiary", type: "address" },
      { name: "oldUnits", type: "uint256" },
      { name: "ratioNum", type: "uint256" },
      { name: "ratioDen", type: "uint256" },
      { name: "sourceChainId", type: "uint256" },
      { name: "targetChainId", type: "uint256" },
      { name: "registry", type: "address" },
      { name: "nonce", type: "bytes32" },
      { name: "expiry", type: "uint64" },
    ],
  };

  async function firmar(c) {
    const cid = await H.chainId();
    return await H.signTypedData(
      f.board,
      { name: "SFSPMigrationRegistry", version: "draft-0.3", chainId: cid, verifyingContract: f.migration.address },
      CLAIM_TYPES,
      "MigrationClaim",
      {
        migrationId: c.migrationId,
        beneficiary: c.beneficiary,
        oldUnits: String(c.oldUnits),
        ratioNum: String(RATIO_NUM),
        ratioDen: String(RATIO_DEN),
        sourceChainId: String(cid),
        targetChainId: String(cid),
        registry: f.migration.address,
        nonce: c.nonce,
        expiry: String(c.expiry),
      },
    );
  }

  function arbol(migrationId) {
    const hojas = [H.merkleLeaf(migrationId, f.alice, 5), H.merkleLeaf(migrationId, f.bob, 4)];
    return { hojas, t: H.merkleTree(hojas) };
  }

  async function abrir(migrationId, mode, root, exp) {
    await f.migration.send(
      "openMigration",
      [migrationId, mode, f.assetOld.address, f.assetNew.address, root, RATIO_NUM, RATIO_DEN, exp || expiry, 9],
      f.board,
    );
  }

  beforeEach(async function () {
    f = await F.deployAll();
    await f.assetOld.send("mintFromIssuance", [f.alice, 5, H.b32("op_old_a")], f.board);
    await f.assetOld.send("mintFromIssuance", [f.bob, 4, H.b32("op_old_b")], f.board);
    expiry = (await H.now()) + 3600;
    tree = arbol(H.b32("mig_A"));
  });

  it("H04 positivo: la exclusión permanente se declara con evidencia y queda escrita", async function () {
    await f.registry.send("declarePermanentExclusion", [f.ASSET_OLD, H.b32("ev_1")], f.board);
    assert.equal(await f.registry.call("isPermanentlyExcluded", [f.ASSET_OLD]), true);
    assert.equal(await f.registry.call("permanentExclusionOf", [f.ASSET_OLD]), H.b32("ev_1"));
    const lc = await f.registry.call("lifecycleOf", [f.ASSET_OLD]);
    assert.equal(Number(lc.transferability), F.Transferability.FROZEN);
  });

  it("H04 negativo: una exclusión permanente NO se deshace con un cambio de eje", async function () {
    // El hallazgo: «congelado» era una etiqueta que volvía a cambiar, de modo que
    // el activo viejo podía descongelarse después de emitir el nuevo.
    await f.registry.send("declarePermanentExclusion", [f.ASSET_OLD, H.b32("ev_1")], f.board);
    await H.expectRevert(
      f.registry.send("setLifecycleAxis", [f.ASSET_OLD, F.Axis.TRANSFERABILITY, F.Transferability.FREE], f.board),
      "PermanentExclusionIsIrreversible",
    );
    await H.expectRevert(
      f.registry.send("declarePermanentExclusion", [f.ASSET_OLD, H.b32("ev_2")], f.board),
      "AlreadyPermanentlyExcluded",
    );
  });

  it("H04 negativo: no se abren dos migraciones a la vez sobre el mismo origen", async function () {
    await abrir(H.b32("mig_A"), MODE.SURRENDER_ON_CLAIM, tree.t.root);
    const b = arbol(H.b32("mig_B"));
    await H.expectRevert(
      abrir(H.b32("mig_B"), MODE.SURRENDER_ON_CLAIM, b.t.root),
      "SourceAlreadyMigrating",
    );
  });

  it("H04 negativo: DOBLE REEMPLAZO ENTRE MIGRACIONES: la misma posición no se reclama dos veces", async function () {
    // Antes el nullifier incluía `migrationId`: abrir otra migración abría otro
    // dominio y la misma posición de origen se reemplazaba de nuevo.
    await f.registry.send("declarePermanentExclusion", [f.ASSET_OLD, H.b32("ev_1")], f.board);
    await abrir(H.b32("mig_A"), MODE.FROZEN_SNAPSHOT, tree.t.root);
    const c1 = { migrationId: H.b32("mig_A"), beneficiary: f.alice, oldUnits: 5, nonce: H.b32("nn_1"), expiry };
    await f.migration.send("claim", [c1, H.merkleProof(tree.t, 0), await firmar(c1)], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "7");

    await f.migration.send("closeMigration", [H.b32("mig_A"), H.b32("FIN")], f.board);

    const b = arbol(H.b32("mig_B"));
    await abrir(H.b32("mig_B"), MODE.FROZEN_SNAPSHOT, b.t.root);
    const c2 = { migrationId: H.b32("mig_B"), beneficiary: f.alice, oldUnits: 5, nonce: H.b32("nn_2"), expiry };
    await H.expectRevert(
      f.migration.send("claim", [c2, H.merkleProof(b.t, 0), await firmar(c2)], f.board),
      "NullifierUsed",
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "7", "no hubo segundo reemplazo");
  });

  it("H04 positivo: otra posición de origen sí se reclama en la migración siguiente", async function () {
    await f.registry.send("declarePermanentExclusion", [f.ASSET_OLD, H.b32("ev_1")], f.board);
    await abrir(H.b32("mig_A"), MODE.FROZEN_SNAPSHOT, tree.t.root);
    const c1 = { migrationId: H.b32("mig_A"), beneficiary: f.alice, oldUnits: 5, nonce: H.b32("nn_3"), expiry };
    await f.migration.send("claim", [c1, H.merkleProof(tree.t, 0), await firmar(c1)], f.board);
    await f.migration.send("closeMigration", [H.b32("mig_A"), H.b32("FIN")], f.board);

    const b = arbol(H.b32("mig_B"));
    await abrir(H.b32("mig_B"), MODE.FROZEN_SNAPSHOT, b.t.root);
    const c2 = { migrationId: H.b32("mig_B"), beneficiary: f.bob, oldUnits: 4, nonce: H.b32("nn_4"), expiry };
    await f.migration.send("claim", [c2, H.merkleProof(b.t, 1), await firmar(c2)], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "6");
  });

  it("H04 positivo: el nullifier no depende del identificador de la migración", async function () {
    const n = await f.migration.call("nullifierOf", [f.ASSET_OLD, f.alice]);
    const otro = await f.migration.call("nullifierOf", [f.ASSET_OLD, f.bob]);
    assert.notEqual(n, otro);
    assert.equal(n.length, 66);
  });

  it("H04 positivo: en modo congelado la circulación del origen es cero desde la apertura", async function () {
    await f.registry.send("declarePermanentExclusion", [f.ASSET_OLD, H.b32("ev_1")], f.board);
    await abrir(H.b32("mig_A"), MODE.FROZEN_SNAPSHOT, tree.t.root);
    // Recién abierta: A = S0 (nada reemplazado todavía) pero la circulación del
    // viejo ya es 0, que es lo que «congelado y excluido» significa de verdad.
    const r = await f.migration.call("reconcile", [H.b32("mig_A")]);
    assert.equal(r[1].toString(), r[0].toString(), "A = S0 al abrir: nada se ha reemplazado");
    assert.equal(r[6].toString(), "0", "circulación del origen = 0");
    assert.equal(r[5], true);
  });

  it("H17 negativo: MIGRACIÓN VENCIDA CON CLAIM VIGENTE: no se reclama", async function () {
    // El hallazgo: `claim` comprobaba `c.expiry` y no `m.expiry`, así que un
    // atestador podía extender la ventana de la migración él solo.
    const corta = (await H.now()) + 600;
    await abrir(H.b32("mig_A"), MODE.SURRENDER_ON_CLAIM, tree.t.root, corta);
    const c = {
      migrationId: H.b32("mig_A"),
      beneficiary: f.alice,
      oldUnits: 5,
      nonce: H.b32("nn_5"),
      expiry: (await H.now()) + 100000, // claim ampliamente vigente
    };
    const sig = await firmar(c);
    await H.increaseTime(1200);
    await H.expectRevert(
      f.migration.send("claim", [c, H.merkleProof(tree.t, 0), sig], f.board),
      "MigrationExpired",
    );
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "0");
  });

  it("H17 positivo: dentro de las dos vigencias el claim procede", async function () {
    const corta = (await H.now()) + 600;
    await abrir(H.b32("mig_A"), MODE.SURRENDER_ON_CLAIM, tree.t.root, corta);
    const c = { migrationId: H.b32("mig_A"), beneficiary: f.alice, oldUnits: 5, nonce: H.b32("nn_6"), expiry: corta - 10 };
    await f.migration.send("claim", [c, H.merkleProof(tree.t, 0), await firmar(c)], f.board);
    assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "7");
  });
});

// ---------------------------------------------------------------------- H18

describe("H18 · la reserva de emisión pertenece a un activo", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 5000, 5000], f.board);
    await f.issuance.send("setInstrumentLimits", [f.ASSET_OLD, 5000, 5000], f.board);
  });

  it("H18 positivo: la reserva guarda activo y monto, y se cierra contra el suyo", async function () {
    await f.issuance.send("openIssuanceReserve", [f.ASSET_NEW, H.b32("res_1"), 600], f.board);
    const r = await f.issuance.call("reserveOf", [H.b32("res_1")]);
    assert.equal(r.assetId, f.ASSET_NEW);
    assert.equal(r.amount.toString(), "600");
    assert.equal((await f.issuance.call("reservedIssuance", [f.ASSET_NEW])).toString(), "600");
    await f.issuance.send("closeIssuanceReserve", [f.ASSET_NEW, H.b32("res_1"), H.b32("FIN")], f.board);
    assert.equal((await f.issuance.call("reservedIssuance", [f.ASSET_NEW])).toString(), "0");
  });

  it("H18 negativo: RESERVA CERRADA CONTRA OTRO ACTIVO: revierte y no corrompe contadores", async function () {
    await f.issuance.send("openIssuanceReserve", [f.ASSET_NEW, H.b32("res_2"), 600], f.board);
    await H.expectRevert(
      f.issuance.send("closeIssuanceReserve", [f.ASSET_OLD, H.b32("res_2"), H.b32("FIN")], f.board),
      "ReserveAssetMismatch",
    );
    assert.equal((await f.issuance.call("reservedIssuance", [f.ASSET_NEW])).toString(), "600");
    assert.equal((await f.issuance.call("reservedIssuance", [f.ASSET_OLD])).toString(), "0");
  });

  it("H18 negativo: cerrar una reserva inexistente revierte", async function () {
    await H.expectRevert(
      f.issuance.send("closeIssuanceReserve", [f.ASSET_NEW, H.b32("res_x"), H.b32("FIN")], f.board),
      "ReserveUnknown",
    );
  });

  it("H18 negativo: un activo sin contrato registrado REVIERTE en vez de devolver cero", async function () {
    const desconocido = H.b32("SFSP:SEC:NADIE:0");
    await H.expectRevert(f.issuance.call("outstandingOf", [desconocido]), "AssetContractUnknown");
    // Y el tope de stock tampoco se evalúa contra un cero inventado.
    await f.issuance.send("setInstrumentLimits", [desconocido, 5000, 5000], f.board);
    await H.expectRevert(
      f.issuance.send("openIssuanceReserve", [desconocido, H.b32("res_3"), 1], f.board),
      "AssetContractUnknown",
    );
  });

  it("H18 positivo: un activo registrado devuelve su outstanding real", async function () {
    assert.equal((await f.issuance.call("outstandingOf", [f.ASSET_NEW])).toString(), "0");
  });
});

// ---------------------------------------------------------------------- H19

describe("H19 · la reanudación se ata a su incidente y se consume", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
  });

  async function ordenUnpause(pauseId, over) {
    const p = await OA.orden(
      Object.assign(
        {
          verifyingContract: f.governance.address,
          action: H.b32("UNPAUSE"),
          assetId: H.b32("SFSP:ALCANCE:GLOBAL"),
          nonce: pauseId,
        },
        over || {},
      ),
    );
    return { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };
  }

  it("H19 positivo: con la aprobación de ESTA pausa, se levanta", async function () {
    await f.governance.send("emergencyPause", [H.b32("INCIDENTE_1"), 3600], f.signers[0]);
    const id1 = await f.governance.call("currentPauseId");
    const o = await ordenUnpause(id1);
    await OA.aprobar(f, o.digest, H.b32("UNPAUSE"));
    await f.governance.send("liftPause", [o.tupla, o.digest], f.signers[0]);
    assert.equal(await f.governance.call("isPaused"), false);
    assert.equal(await f.governance.call("currentPauseId"), H.ZERO32);
  });

  it("H19 negativo: APROBACIÓN UNPAUSE REUTILIZADA: no levanta la pausa siguiente", async function () {
    await f.governance.send("emergencyPause", [H.b32("INCIDENTE_1"), 3600], f.signers[0]);
    const id1 = await f.governance.call("currentPauseId");
    const o = await ordenUnpause(id1);
    await OA.aprobar(f, o.digest, H.b32("UNPAUSE"));
    await f.governance.send("liftPause", [o.tupla, o.digest], f.signers[0]);

    // Incidente nuevo, aprobación vieja.
    await f.governance.send("emergencyPause", [H.b32("INCIDENTE_2"), 3600], f.signers[0]);
    const id2 = await f.governance.call("currentPauseId");
    assert.notEqual(id1, id2, "cada pausa es un incidente distinto");
    await H.expectRevert(
      f.governance.send("liftPause", [o.tupla, o.digest], f.signers[0]),
      "PauseMismatch",
    );
    assert.equal(await f.governance.call("isPaused"), true);
  });

  it("H19 negativo: la aprobación se consume aunque se vuelva a pausar con el mismo motivo", async function () {
    await f.governance.send("emergencyPause", [H.b32("INCIDENTE_1"), 3600], f.signers[0]);
    const id1 = await f.governance.call("currentPauseId");
    const o = await ordenUnpause(id1);
    await OA.aprobar(f, o.digest, H.b32("UNPAUSE"));
    await f.governance.send("liftPause", [o.tupla, o.digest], f.signers[0]);
    assert.equal(await f.governance.call("isAuthorizationApproved", [o.digest]), false);
    // Volver a aprobar el mismo digest tampoco es posible: ya existe y está gastado.
    await H.expectRevert(
      f.governance.send("proposeAuthorization", [o.digest, H.b32("UNPAUSE")], f.signers[0]),
      "AuthorizationDuplicate",
    );
  });

  it("H19 negativo: sin aprobación con quórum no se levanta nada", async function () {
    await f.governance.send("emergencyPause", [H.b32("INCIDENTE_1"), 3600], f.signers[0]);
    const id1 = await f.governance.call("currentPauseId");
    const o = await ordenUnpause(id1);
    await H.expectRevert(
      f.governance.send("liftPause", [o.tupla, o.digest], f.signers[0]),
      "AuthorizationUnknown",
    );
    await f.governance.send("proposeAuthorization", [o.digest, H.b32("UNPAUSE")], f.signers[0]);
    await f.governance.send("approveAuthorization", [o.digest], f.signers[1]);
    await H.expectRevert(
      f.governance.send("liftPause", [o.tupla, o.digest], f.signers[0]),
      "AuthorizationQuorumNotReached",
    );
    assert.equal(await f.governance.call("isPaused"), true);
  });
});

// ---------------------------------------------------------------------- H16

describe("H16 · el vínculo de identidad deja de ser consultable por índice", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  it("H16 positivo: SubjectRefBound no lleva NINGÚN campo indexado", async function () {
    const ev = f.identity.abi.find((x) => x.type === "event" && x.name === "SubjectRefBound");
    assert.ok(ev, "el evento debe existir");
    for (const input of ev.inputs) {
      assert.equal(input.indexed, false, "ningún campo de SubjectRefBound puede ir en los topics: " + input.name);
    }
  });

  it("H16 negativo: la correlación que SIGUE siendo posible queda documentada, no negada", async function () {
    // Esta prueba existe para que nadie afirme una privacidad que no hay: con dos
    // direcciones cualquiera puede comprobar si son del mismo sujeto. Si algún día
    // se implementan referencias no enlazables por propósito, esta prueba tendrá
    // que cambiar, y ese cambio es justamente la señal de que el arreglo llegó.
    await f.identity.send("bindSubjectRef", [f.mallory, H.b32("subj_alice")], f.board);
    const a = await f.identity.call("subjectRefOf", [f.alice]);
    const b = await f.identity.call("subjectRefOf", [f.mallory]);
    assert.equal(a, b, "hoy dos direcciones del mismo sujeto son correlacionables por `subjectRefOf`");
  });
});

// ---------------------------------------------------------------------- H24

describe("H24 · solvencia, y el superávit sin dueño se clasifica", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    await f.vault.sendValue("deposit", [], f.bob, CASH);
  });

  it("H24 negativo: SE PUEDE FORZAR EFECTIVO SIN PASIVO, y la bóveda lo reporta", async function () {
    // La afirmación vieja —«sin receive, todo el efectivo tiene pasivo»— era falsa.
    const forzador = await H.deploy("SFSPForzadorDeEfectivo", [], f.board);
    await forzador.sendValue("forzar", [f.vault.address], f.board, 12345n);

    const rec = await f.vault.call("reconcile");
    assert.equal(rec[2], true, "sigue siendo solvente: activo >= pasivos");
    assert.equal(rec[3].toString(), "12345", "el exceso sin dueño se mide, no se ignora");
    await f.vault.call("requireReconciled");
  });

  it("H24 positivo: clasificar el superávit lo convierte en pasivo explícito", async function () {
    const forzador = await H.deploy("SFSPForzadorDeEfectivo", [], f.board);
    await forzador.sendValue("forzar", [f.vault.address], f.board, 500n);
    await f.vault.send("classifyUnassignedSurplus", [H.b32("FORZADO_SELFDESTRUCT")], f.board);
    assert.equal((await f.vault.call("classifiedSurplus")).toString(), "500");
    const rec = await f.vault.call("reconcile");
    assert.equal(rec[3].toString(), "0", "clasificado deja de contar como exceso");
    assert.equal(rec[1].toString(), String(CASH + 500n), "y pasa a ser pasivo");

    // Un superávit NUEVO vuelve a ser visible: no se confunde con el anterior.
    await (await H.deploy("SFSPForzadorDeEfectivo", [], f.board)).sendValue("forzar", [f.vault.address], f.board, 7n);
    const rec2 = await f.vault.call("reconcile");
    assert.equal(rec2[3].toString(), "7");
  });

  it("H24 negativo: sin superávit no se clasifica nada, y clasificar exige motivo", async function () {
    await H.expectRevert(
      f.vault.send("classifyUnassignedSurplus", [H.b32("SIN_NADA")], f.board),
      "NoSurplusToClassify",
    );
    await H.expectRevert(
      f.vault.send("classifyUnassignedSurplus", [H.ZERO32], f.board),
      "motivo requerido",
    );
  });

  it("H24 negativo: el superávit clasificado no alcanza el saldo de ningún titular", async function () {
    const forzador = await H.deploy("SFSPForzadorDeEfectivo", [], f.board);
    await forzador.sendValue("forzar", [f.vault.address], f.board, 500n);
    await f.vault.send("classifyUnassignedSurplus", [H.b32("FORZADO")], f.board);
    await H.expectRevert(
      f.vault.send("releaseClassifiedSurplus", [f.treasury, "501", H.b32("BARRIDO")], f.board),
      "InsufficientCash",
    );
    await f.vault.send("releaseClassifiedSurplus", [f.treasury, "500", H.b32("BARRIDO")], f.board);
    assert.equal((await f.vault.call("balanceOfAccount", [f.bob])).toString(), String(CASH));
  });
});

// ---------------------------------------------------------------------- H15

describe("H15 · los eventos coinciden con spec/eventos.json", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  it("H15 positivo: BurnExecuted, TreasuryReleased y MigrationClaimed llevan activo", async function () {
    const burn = f.assetNew.abi.find((x) => x.type === "event" && x.name === "BurnExecuted");
    assert.deepEqual(burn.inputs.map((i) => i.name), ["assetId", "from", "amount", "reasonCode", "operationId"]);
    assert.equal(burn.inputs[0].indexed, true);

    const rel = f.vault.abi.find((x) => x.type === "event" && x.name === "TreasuryReleased");
    assert.deepEqual(rel.inputs.map((i) => i.name), ["assetId", "to", "amount", "reasonCode"]);
    assert.equal(rel.inputs[0].indexed, true);

    const mc = f.migration.abi.find((x) => x.type === "event" && x.name === "MigrationClaimed");
    assert.deepEqual(
      mc.inputs.map((i) => i.name),
      ["migrationId", "beneficiary", "assetIdAnterior", "assetIdNuevo", "oldUnits", "newUnits", "nullifier"],
    );
  });

  it("H15 negativo: UnitsMinted ya no existe; el hecho lo publica MintExecuted", async function () {
    const retirado = f.assetNew.abi.find((x) => x.type === "event" && x.name === "UnitsMinted");
    assert.equal(retirado, undefined, "dos nombres para el mismo hecho hacen imposible contar una sola vez");
    const canonico = f.issuance.abi.find((x) => x.type === "event" && x.name === "MintExecuted");
    assert.ok(canonico);
  });
});
