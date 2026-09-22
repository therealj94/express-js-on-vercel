"use strict";
/* P03 · CIERRE. Las cuatro acciones de gobierno que quedaban en el camino viejo
 * —`UPGRADE`, `RECOVERY`, `SET_QUORUM` y `SET_POLICY`— pasaron al patrón del
 * §12.1: se aprueba un DIGEST, quien propone no aprueba, y el ejecutor recalcula
 * el digest desde sus argumentos reales y lo consume.
 *
 * El camino viejo (`propose`/`approve`/`execute` sobre un `operationId`) se
 * retiró entero. Las pruebas que lo ejercitaban se reescriben contra el camino
 * nuevo: lo que comprobaban —timelock, quórum reforzado, expediente completo—
 * sigue comprobándose, pero sobre la acción que de verdad se ejecuta.
 *
 * Todos los valores son sintéticos. Ningún quórum ni ningún retardo está escrito
 * en el código de los contratos: vienen del despliegue (D07). */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");

const SCOPE_UPGRADE = H.b32("SFSP:GOV:UPGRADE");
const SCOPE_QUORUM = H.b32("SFSP:GOV:QUORUM");

/** Ventana larga: las acciones con espera tienen que seguir vigentes al vencer el timelock. */
async function ordenGov(f, over) {
  const ts = await H.now();
  const p = await OA.orden(
    Object.assign({ verifyingContract: f.governance.address, expiry: ts + 7 * 3600 }, over || {}),
  );
  return { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };
}

describe("SFSPGovernanceController · quórum, timelock y pausa caduca", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  it("positivo: los quórums vienen del despliegue, no del código", async function () {
    assert.equal((await f.governance.call("quorumThreshold")).toString(), String(F.GOV.threshold));
    assert.equal((await f.governance.call("upgradeQuorumThreshold")).toString(), String(F.GOV.upgradeThreshold));
    assert.equal((await f.governance.call("signerCount")).toString(), String(f.signers.length));
  });

  it("positivo: la pausa exige motivo y caduca sola", async function () {
    await f.governance.send("emergencyPause", [H.b32("INCIDENT_TEST"), 3600], f.signers[0]);
    assert.equal(await f.governance.call("isPaused"), true);
    const r = await f.governance.call("pauseReason");
    assert.equal(r[0], H.b32("INCIDENT_TEST"));
    await H.increaseTime(3601);
    assert.equal(await f.governance.call("isPaused"), false, "la pausa debe caducar sin intervención");
  });

  it("negativo: pausar sin motivo revierte", async function () {
    await H.expectRevert(
      f.governance.send("emergencyPause", [H.ZERO32, 3600], f.signers[0]),
      "PauseReasonRequired"
    );
  });

  it("negativo: una pausa más larga que el techo del despliegue revierte", async function () {
    await H.expectRevert(
      f.governance.send("emergencyPause", [H.b32("INCIDENT_TEST"), F.GOV.maxPause + 1], f.signers[0]),
      "PauseExpiryInvalid"
    );
  });

  it("negativo: quien no es firmante no propone una autorización", async function () {
    await H.expectRevert(
      f.governance.send("proposeAuthorization", [H.b32("digest_x"), H.b32("PAUSE")], f.alice),
      "NotSigner"
    );
  });
});

describe("P03/UPGRADE · doble control, quórum reforzado y espera", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  async function ordenUpgrade(over) {
    return await ordenGov(
      f,
      Object.assign(
        {
          action: H.b32("UPGRADE"),
          assetId: SCOPE_UPGRADE,
          destination: f.alice,          // implementación destino (sintética)
          evidenceRoot: H.b32("impl_v2"),// versión destino
          nonce: H.b32("n_upgrade_1"),
        },
        over || {},
      ),
    );
  }

  it("P03 positivo (UPGRADE): con quórum reforzado y pasada la espera, se ejecuta y se consume", async function () {
    const o = await ordenUpgrade({});
    await OA.aprobar(f, o.digest, H.b32("UPGRADE"), {
      propone: f.signers[0],
      aprueban: [f.signers[1], f.signers[2], f.signers[3]],
    });
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await f.governance.send("executeUpgrade", [o.tupla, o.digest], f.signers[0]);
    assert.equal(
      await f.governance.call("isAuthorizationApproved", [o.digest]),
      false,
      "la aprobación se gastó y no sirve para un segundo upgrade",
    );
  });

  it("P03 negativo (UPGRADE): un upgrade no se ejecuta antes de la espera", async function () {
    const o = await ordenUpgrade({ nonce: H.b32("n_upgrade_2") });
    await OA.aprobar(f, o.digest, H.b32("UPGRADE"), {
      propone: f.signers[0],
      aprueban: [f.signers[1], f.signers[2], f.signers[3]],
    });
    await H.expectRevert(
      f.governance.send("executeUpgrade", [o.tupla, o.digest], f.signers[0]),
      "TimelockPending",
    );
  });

  it("P03 negativo (UPGRADE): con quórum general pero no reforzado no se ejecuta", async function () {
    const o = await ordenUpgrade({ nonce: H.b32("n_upgrade_3") });
    await OA.aprobar(f, o.digest, H.b32("UPGRADE"), {
      propone: f.signers[0],
      aprueban: [f.signers[1], f.signers[2]],
    });
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await H.expectRevert(
      f.governance.send("executeUpgrade", [o.tupla, o.digest], f.signers[0]),
      "AuthorizationQuorumNotReached",
    );
  });

  it("P03 negativo (UPGRADE): una aprobación no ejecuta otra implementación destino", async function () {
    const o = await ordenUpgrade({ nonce: H.b32("n_upgrade_4") });
    await OA.aprobar(f, o.digest, H.b32("UPGRADE"), {
      propone: f.signers[0],
      aprueban: [f.signers[1], f.signers[2], f.signers[3]],
    });
    await H.increaseTime(F.GOV.timelockDelay + 1);
    const otro = await ordenUpgrade({ nonce: H.b32("n_upgrade_4"), destination: f.bob });
    await H.expectRevert(
      f.governance.send("executeUpgrade", [otro.tupla, o.digest], f.signers[0]),
      "AuthorizationDigestMismatch",
    );
    // El intento fallido NO gasta la autorización legítima (§12.3).
    assert.equal(await f.governance.call("isAuthorizationApproved", [o.digest]), true);
  });
});

describe("P03/RECOVERY · doble control, expediente y espera", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  async function ordenRecovery(over) {
    return await ordenGov(
      f,
      Object.assign(
        {
          action: H.b32("RECOVERY"),
          assetId: f.ASSET_NEW,
          origin: f.alice,                 // cuenta recuperada
          destination: f.bob,              // destino del control
          evidenceRoot: H.b32("ev_root_1"),// expediente
          nonce: H.b32("case_recovery_1"), // caseId
        },
        over || {},
      ),
    );
  }

  it("P03 positivo (RECOVERY): con doble control y espera, publica el expediente", async function () {
    const o = await ordenRecovery({});
    await OA.aprobar(f, o.digest, H.b32("RECOVERY"));
    await H.increaseTime(F.GOV.timelockDelay + 1);
    const rec = await f.governance.send("executeRecovery", [o.tupla, o.digest], f.signers[0]);
    const ev = f.governance.iface.parseLog(
      rec.logs.find((l) => l.topics[0] === f.governance.iface.getEventTopic("RecoveryExecuted")),
    );
    assert.equal(ev.args.caseId, H.b32("case_recovery_1"), "el caseId es el nonce del payload aprobado");
    assert.equal(ev.args.evidenceRoot, H.b32("ev_root_1"));
    assert.equal(await f.governance.call("isAuthorizationApproved", [o.digest]), false, "se consumió");
  });

  it("P03 negativo (RECOVERY): una recuperación sin expediente completo revierte", async function () {
    const o = await ordenRecovery({ evidenceRoot: H.ZERO32, nonce: H.b32("case_recovery_2") });
    await OA.aprobar(f, o.digest, H.b32("RECOVERY"));
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await H.expectRevert(
      f.governance.send("executeRecovery", [o.tupla, o.digest], f.signers[0]),
      "RecoveryCaseIncomplete",
    );
  });

  it("P03 negativo (RECOVERY): quien propone no la aprueba, y sin segundo aprobador no se ejecuta", async function () {
    const o = await ordenRecovery({ nonce: H.b32("case_recovery_3") });
    await f.governance.send("proposeAuthorization", [o.digest, H.b32("RECOVERY")], f.signers[0]);
    await H.expectRevert(
      f.governance.send("approveAuthorization", [o.digest], f.signers[0]),
      "ProposerCannotApprove",
    );
    await f.governance.send("approveAuthorization", [o.digest], f.signers[1]);
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await H.expectRevert(
      f.governance.send("executeRecovery", [o.tupla, o.digest], f.signers[0]),
      "AuthorizationQuorumNotReached",
    );
  });
});

describe("P03/SET_QUORUM · el cambio de quórum no se rebaja a sí mismo", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  async function ordenQuorum(nuevo, nuevoUpgrade, nonce) {
    return await ordenGov(f, {
      action: H.b32("SET_QUORUM"),
      assetId: SCOPE_QUORUM,
      amount: String(nuevo),
      amountSecondary: String(nuevoUpgrade),
      nonce,
    });
  }

  it("P03 positivo (SET_QUORUM): con el quórum ANTERIOR, el cambio se aplica y se consume", async function () {
    const nuevo = F.GOV.threshold + 1;
    const o = await ordenQuorum(nuevo, F.GOV.upgradeThreshold, H.b32("n_quorum_1"));
    await OA.aprobar(f, o.digest, H.b32("SET_QUORUM"));
    await f.governance.send("setQuorum", [o.tupla, o.digest], f.signers[0]);
    assert.equal((await f.governance.call("quorumThreshold")).toString(), String(nuevo));
    assert.equal(await f.governance.call("isAuthorizationApproved", [o.digest]), false);
  });

  /* El caso que el encargo pide encerrar: una SET_QUORUM que baja el quórum NO
     puede validarse con el número que ella misma introduce. La comprobación
     ocurre antes de escribir, así que lo que la valida es el quórum anterior. */
  it("P03 negativo (SET_QUORUM): NO puede rebajarse a sí misma en la misma operación", async function () {
    const o = await ordenQuorum(1, 1, H.b32("n_quorum_2"));
    // Un solo aprobador: alcanzaría el quórum NUEVO (1) pero no el anterior.
    await f.governance.send("proposeAuthorization", [o.digest, H.b32("SET_QUORUM")], f.signers[0]);
    await f.governance.send("approveAuthorization", [o.digest], f.signers[1]);
    await H.expectRevert(
      f.governance.send("setQuorum", [o.tupla, o.digest], f.signers[0]),
      "AuthorizationQuorumNotReached",
    );
    assert.equal(
      (await f.governance.call("quorumThreshold")).toString(),
      String(F.GOV.threshold),
      "el quórum no se movió",
    );
  });

  /* La variante encadenada: bajar el quórum con una operación legítima no puede
     abaratar retroactivamente otra que ya estaba propuesta bajo el anterior. Es
     lo que guarda `quorumAtProposal`. */
  it("P03 negativo (SET_QUORUM): bajar el quórum no abarata una autorización ya propuesta", async function () {
    const pendiente = await ordenGov(f, {
      action: H.b32("RECOVERY"),
      assetId: f.ASSET_NEW,
      origin: f.alice,
      destination: f.bob,
      evidenceRoot: H.b32("ev_root_2"),
      nonce: H.b32("case_recovery_4"),
    });
    // Se propone bajo el quórum anterior y sólo reúne UNA aprobación.
    await f.governance.send("proposeAuthorization", [pendiente.digest, H.b32("RECOVERY")], f.signers[0]);
    await f.governance.send("approveAuthorization", [pendiente.digest], f.signers[1]);

    // Ahora el quórum general baja a uno, legítimamente.
    const q = await ordenQuorum(1, 1, H.b32("n_quorum_3"));
    await OA.aprobar(f, q.digest, H.b32("SET_QUORUM"));
    await f.governance.send("setQuorum", [q.tupla, q.digest], f.signers[0]);
    assert.equal((await f.governance.call("quorumThreshold")).toString(), "1");

    // La autorización pendiente sigue exigiendo el quórum con el que se propuso.
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await H.expectRevert(
      f.governance.send("executeRecovery", [pendiente.tupla, pendiente.digest], f.signers[0]),
      "AuthorizationQuorumNotReached",
    );
  });

  it("P03 negativo (SET_QUORUM): un quórum mayor que el número de firmantes no se admite", async function () {
    const o = await ordenQuorum(f.signers.length + 1, f.signers.length + 1, H.b32("n_quorum_4"));
    await OA.aprobar(f, o.digest, H.b32("SET_QUORUM"));
    await H.expectRevert(f.governance.send("setQuorum", [o.tupla, o.digest], f.signers[0]), "InvalidQuorum");
  });
});
