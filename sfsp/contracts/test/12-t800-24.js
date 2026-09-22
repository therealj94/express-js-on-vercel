"use strict";
/* T-800-24 · «Ninguna acción de la tabla de §12.5 se ejecuta con un solo rol».
 *
 * La especificación dejó esta prueba marcada como PENDIENTE porque exigía los
 * ejecutores reales y no sólo el patrón. Ya existen los nueve, así que la prueba
 * se puede escribir: recorre las nueve acciones críticas con ejecutor en este
 * árbol y, para cada una, comprueba DOS cosas distintas.
 *
 *   1. SEPARACIÓN DE FUNCIONES · quien propone no puede aprobar. No es una
 *      formalidad: el camino viejo de gobierno contaba al proponente como primer
 *      aprobador, así que «quórum de dos» significaba de hecho «uno más uno», y
 *      con el proponente ya dentro bastaba un segundo firmante para mover
 *      cualquier cosa.
 *   2. UN SOLO APROBADOR NO EJECUTA · con una única aprobación —la de un
 *      firmante distinto del proponente— el ejecutor real revierte y no cambia
 *      nada. Se comprueba contra el EJECUTOR, no contra el registro: lo que
 *      importa no es que gobierno diga que no alcanza el quórum, sino que la
 *      acción no ocurra.
 *
 * El cuadro de acciones se afirma completo al final: si alguien añade una acción
 * crítica sin ejecutor con doble control, esta prueba no lo detectará sola, pero
 * la cuenta mínima sí deja constancia de cuántas están cubiertas.
 *
 * Décima fila incluida además de las nueve: `MIGRATION_CLAIM`, que §12.5 también
 * exige con doble control y que este lote cerró. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");
const { buildAuthorization } = require("./authorization");

const CASH = 1_000_000_000_000_000n;
const SCOPE_UPGRADE = H.b32("SFSP:GOV:UPGRADE");
const SCOPE_QUORUM = H.b32("SFSP:GOV:QUORUM");

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

/* Cada fila declara: la acción del §12.5, cómo se prepara el terreno, cómo se
   construye el payload del §12.1 y cómo se invoca al EJECUTOR real. */
function filas() {
  return [
    {
      accion: "MINT",
      async preparar(f) {
        await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 1000000, 1000000], f.board);
        f._sobre = await buildAuthorization(f, { destination: f.alice, amount: 100 });
      },
      async orden(f) {
        return await OA.orden({
          verifyingContract: f.issuance.address,
          action: H.b32("MINT"),
          assetId: f.ASSET_NEW,
          origin: H.ZERO_ADDR,
          destination: f.alice,
          amount: "100",
          nonce: H.b32("t824_mint"),
        });
      },
      ejecutar: (f, o) => f.issuance.send("mint", [f._sobre.auth, f._sobre.sigs, o.tupla, o.digest], f.board),
      async intacto(f) {
        assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "0");
      },
    },
    {
      accion: "BURN",
      async orden(f) {
        return await OA.orden({
          verifyingContract: f.assetNew.address,
          action: H.b32("BURN"),
          assetId: f.ASSET_NEW,
          origin: f.alice,
          destination: H.ZERO_ADDR,
          amount: "10",
          nonce: H.b32("t824_burn"),
          evidenceRoot: H.b32("MOTIVO_TEST"),
        });
      },
      ejecutar: (f, o) => f.assetNew.send("burn", [o.tupla, o.digest], f.board),
    },
    {
      accion: "FORCED_TRANSFER",
      async orden(f) {
        return await OA.orden({
          verifyingContract: f.assetNew.address,
          action: H.b32("FORCED_TRANSFER"),
          assetId: f.ASSET_NEW,
          origin: f.alice,
          destination: f.bob,
          amount: "10",
          nonce: H.b32("t824_ft"),
        });
      },
      ejecutar: (f, o) => f.assetNew.send("forcedTransfer", [o.tupla, o.digest], f.board),
      async intacto(f) {
        assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
      },
    },
    {
      accion: "UNPAUSE",
      async preparar(f) {
        await f.governance.send("emergencyPause", [H.b32("INCIDENTE_T824"), 3600], f.signers[0]);
      },
      async orden(f) {
        return await OA.orden({
          verifyingContract: f.governance.address,
          action: H.b32("UNPAUSE"),
          assetId: H.b32("SFSP:ALCANCE:GLOBAL"),
          nonce: await f.governance.call("currentPauseId"),
        });
      },
      ejecutar: (f, o) => f.governance.send("liftPause", [o.tupla, o.digest], f.signers[0]),
      async intacto(f) {
        assert.equal(await f.governance.call("isPaused"), true, "la pausa sigue vigente");
      },
    },
    {
      accion: "SETTLE_DVP",
      async preparar(f) {
        await f.vault.sendValue("deposit", [], f.bob, CASH);
      },
      async orden(f) {
        return await OA.orden({
          verifyingContract: f.settlement.address,
          action: H.b32("SETTLE_DVP"),
          assetId: f.ASSET_NEW,
          origin: f.alice,
          destination: f.bob,
          amount: "10",
          amountSecondary: String(CASH / 2n),
          nonce: H.b32("t824_dvp"),
        });
      },
      ejecutar: (f, o) => f.settlement.send("settle", [o.tupla, o.digest], f.board),
      async intacto(f) {
        assert.equal((await f.vault.call("balanceOfAccount", [f.alice])).toString(), "0");
      },
    },
    {
      accion: "UPGRADE",
      async orden(f) {
        const ts = await H.now();
        return await OA.orden({
          verifyingContract: f.governance.address,
          action: H.b32("UPGRADE"),
          assetId: SCOPE_UPGRADE,
          destination: f.alice,
          evidenceRoot: H.b32("impl_t824"),
          nonce: H.b32("t824_upgrade"),
          expiry: ts + 7 * 3600,
        });
      },
      async antesDeEjecutar() {
        await H.increaseTime(F.GOV.timelockDelay + 1);
      },
      ejecutar: (f, o) => f.governance.send("executeUpgrade", [o.tupla, o.digest], f.signers[0]),
    },
    {
      accion: "RECOVERY",
      async orden(f) {
        const ts = await H.now();
        return await OA.orden({
          verifyingContract: f.governance.address,
          action: H.b32("RECOVERY"),
          assetId: f.ASSET_NEW,
          origin: f.alice,
          destination: f.bob,
          evidenceRoot: H.b32("ev_t824"),
          nonce: H.b32("t824_case"),
          expiry: ts + 7 * 3600,
        });
      },
      async antesDeEjecutar() {
        await H.increaseTime(F.GOV.timelockDelay + 1);
      },
      ejecutar: (f, o) => f.governance.send("executeRecovery", [o.tupla, o.digest], f.signers[0]),
    },
    {
      accion: "SET_QUORUM",
      async orden(f) {
        return await OA.orden({
          verifyingContract: f.governance.address,
          action: H.b32("SET_QUORUM"),
          assetId: SCOPE_QUORUM,
          amount: "1",
          amountSecondary: "1",
          nonce: H.b32("t824_quorum"),
        });
      },
      ejecutar: (f, o) => f.governance.send("setQuorum", [o.tupla, o.digest], f.signers[0]),
      async intacto(f) {
        assert.equal((await f.governance.call("quorumThreshold")).toString(), String(F.GOV.threshold));
      },
    },
    {
      accion: "SET_POLICY",
      async preparar(f) {
        f._politica = F.policy({ maxAmount: 1 });
        f._versionPrevia = Number((await f.engine.call("policyOf", [f.ASSET_NEW, H.b32("MINT")])).version);
      },
      async orden(f) {
        return await OA.orden({
          verifyingContract: f.engine.address,
          action: H.b32("SET_POLICY"),
          assetId: f.ASSET_NEW,
          amount: String(f._versionPrevia),
          amountSecondary: String(f._versionPrevia + 1),
          nonce: H.b32("t824_policy"),
          evidenceRoot: F.digestPolitica(H.b32("MINT"), f._politica),
        });
      },
      ejecutar: (f, o) =>
        f.engine.send("setPolicy", [f.ASSET_NEW, H.b32("MINT"), f._politica, o.tupla, o.digest], f.board),
      async intacto(f) {
        const p = await f.engine.call("policyOf", [f.ASSET_NEW, H.b32("MINT")]);
        assert.equal(Number(p.version), f._versionPrevia, "la política no cambió de versión");
      },
    },
    {
      accion: "MIGRATION_CLAIM",
      async preparar(f) {
        await f.assetOld.send("mintFromIssuance", [f.alice, 5, H.b32("t824_old")], f.board);
        f._hojas = [H.merkleLeaf(H.b32("t824_mig"), f.alice, 5), H.merkleLeaf(H.b32("t824_mig"), f.bob, 4)];
        f._arbol = H.merkleTree(f._hojas);
        f._expiry = (await H.now()) + 3600;
        await f.migration.send(
          "openMigration",
          [H.b32("t824_mig"), 1, f.assetOld.address, f.assetNew.address, f._arbol.root, 3, 2, f._expiry, 9],
          f.board,
        );
        f._claim = {
          migrationId: H.b32("t824_mig"),
          beneficiary: f.alice,
          oldUnits: 5,
          nonce: H.b32("t824_claim"),
          expiry: f._expiry,
        };
        const cid = await H.chainId();
        f._firma = await H.signTypedData(
          f.board,
          {
            name: "SFSPMigrationRegistry",
            version: "draft-0.3",
            chainId: cid,
            verifyingContract: f.migration.address,
          },
          CLAIM_TYPES,
          "MigrationClaim",
          {
            migrationId: f._claim.migrationId,
            beneficiary: f._claim.beneficiary,
            oldUnits: "5",
            ratioNum: "3",
            ratioDen: "2",
            sourceChainId: String(cid),
            targetChainId: String(cid),
            registry: f.migration.address,
            nonce: f._claim.nonce,
            expiry: String(f._claim.expiry),
          },
        );
      },
      async orden(f) {
        return await OA.orden({
          verifyingContract: f.migration.address,
          action: H.b32("MIGRATION_CLAIM"),
          assetId: f.ASSET_OLD,
          destination: f.alice,
          amount: "5",
          nonce: f._claim.nonce,
          evidenceRoot: f._arbol.root,
        });
      },
      ejecutar: (f, o) =>
        f.migration.send(
          "claim",
          [f._claim, H.merkleProof(f._arbol, 0), f._firma, o.tupla, o.digest],
          f.board,
        ),
      async intacto(f) {
        assert.equal((await f.assetNew.call("balanceOf", [f.alice])).toString(), "0");
      },
    },
  ];
}

describe("T-800-24 · ninguna acción de §12.5 se ejecuta con un solo rol", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  it("T-800-24 positivo: el cuadro recorre al menos las nueve acciones con ejecutor", function () {
    const acciones = filas().map((x) => x.accion);
    assert.equal(new Set(acciones).size, acciones.length, "ninguna acción se cuenta dos veces");
    assert.ok(acciones.length >= 9, "se esperaban al menos nueve acciones del §12.5, hay " + acciones.length);
    for (const obligatoria of [
      "MINT", "BURN", "FORCED_TRANSFER", "UNPAUSE", "SETTLE_DVP",
      "UPGRADE", "RECOVERY", "SET_QUORUM", "SET_POLICY",
    ]) {
      assert.ok(acciones.includes(obligatoria), "falta la acción " + obligatoria);
    }
  });

  for (const fila of filas()) {
    it("T-800-24 negativo (" + fila.accion + "): quien propone no aprueba y un solo aprobador no ejecuta", async function () {
      if (fila.preparar) await fila.preparar(f);
      const p = await fila.orden(f);
      const o = { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };

      // 1. Separación de funciones: el proponente no cuenta como aprobador.
      await f.governance.send("proposeAuthorization", [o.digest, H.b32(fila.accion)], f.signers[0]);
      await H.expectRevert(
        f.governance.send("approveAuthorization", [o.digest], f.signers[0]),
        "ProposerCannotApprove",
      );

      // 2. Con UN solo aprobador distinto, el ejecutor real no ejecuta.
      await f.governance.send("approveAuthorization", [o.digest], f.signers[1]);
      assert.equal(
        await f.governance.call("isAuthorizationApproved", [o.digest]),
        false,
        fila.accion + ": un solo aprobador no puede dar por alcanzado el quórum",
      );
      if (fila.antesDeEjecutar) await fila.antesDeEjecutar(f);
      const motivo = await H.expectRevert(fila.ejecutar(f, o));
      assert.match(
        motivo,
        /QuorumNotReached|NotAuthorized/,
        fila.accion + ": el rechazo tiene que ser de AUTORIZACIÓN y no otro cualquiera: " + motivo,
      );

      // 3. Y el mundo no se movió.
      if (fila.intacto) await fila.intacto(f);
    });
  }
});
