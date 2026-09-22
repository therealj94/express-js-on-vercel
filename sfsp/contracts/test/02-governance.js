"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");

describe("SFSPGovernanceController · quórum, timelock y pausa caduca", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  it("positivo: los quórums vienen del despliegue, no del código", async function () {
    assert.equal((await f.governance.call("quorumThreshold")).toString(), String(F.GOV.threshold));
    assert.equal((await f.governance.call("upgradeQuorumThreshold")).toString(), String(F.GOV.upgradeThreshold));
    assert.equal((await f.governance.call("signerCount")).toString(), "3");
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

  it("negativo: un upgrade no se ejecuta antes del timelock", async function () {
    const op = H.b32("op_upgrade_1");
    await f.governance.send("propose", [op, H.b32("UPGRADE"), H.b32("detalle_hash")], f.signers[0]);
    await f.governance.send("approve", [op], f.signers[1]);
    await f.governance.send("approve", [op], f.signers[2]);
    await H.expectRevert(f.governance.send("execute", [op], f.signers[0]), "TimelockPending");
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await f.governance.send("execute", [op], f.signers[0]);
    assert.equal((await f.governance.call("proposalOf", [op])).executed, true);
  });

  it("negativo: un upgrade con quórum general pero no reforzado revierte", async function () {
    const op = H.b32("op_upgrade_2");
    await f.governance.send("propose", [op, H.b32("UPGRADE"), H.b32("detalle_hash")], f.signers[0]);
    await f.governance.send("approve", [op], f.signers[1]);
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await H.expectRevert(f.governance.send("execute", [op], f.signers[0]), "QuorumNotReached");
  });

  it("negativo: una recuperación sin expediente completo revierte", async function () {
    const op = H.b32("op_recovery_1");
    await f.governance.send("propose", [op, H.b32("RECOVERY"), H.b32("detalle")], f.signers[0]);
    await f.governance.send("approve", [op], f.signers[1]);
    await H.expectRevert(
      f.governance.send("recordRecovery", [op, H.ZERO32, H.b32("ev_root")], f.signers[0]),
      "expediente incompleto"
    );
    await f.governance.send("recordRecovery", [op, H.b32("case_1"), H.b32("ev_root")], f.signers[0]);
  });

  it("negativo: quien no es firmante no propone", async function () {
    await H.expectRevert(
      f.governance.send("propose", [H.b32("op_x"), H.b32("PAUSE"), H.ZERO32], f.alice),
      "NotSigner"
    );
  });
});
