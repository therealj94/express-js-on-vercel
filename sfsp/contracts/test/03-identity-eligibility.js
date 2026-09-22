"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");

/* H16 · las attestations dejaron de firmarse sobre la referencia global del
   sujeto y pasan a firmarse sobre el COMPROMISO POR PROPÓSITO. El typehash
   cambió con ellas, así que ninguna attestation vieja se puede releer contra el
   formato nuevo: es el comportamiento deseado. */
const KYC = H.b32("KYC");
const KYC_ALICE = F.compromiso(F.SUBJ.alice, KYC, F.SALT.alice);


const ATT_TYPES = {
  Attestation: [
    { name: "attestationId", type: "bytes32" },
    { name: "subjectCommitment", type: "bytes32" },
    { name: "purpose", type: "bytes32" },
    { name: "claimsRoot", type: "bytes32" },
    { name: "validFrom", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "policyVersion", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};

async function buildAttestation(f, o) {
  const opts = o || {};
  const cid = await H.chainId();
  const ts = await H.now();
  const att = {
    attestationId: opts.attestationId || H.b32("att_0001"),
    subjectCommitment: opts.subjectCommitment || KYC_ALICE,
    purpose: opts.purpose || H.b32("KYC"),
    claimsRoot: H.b32("claims_root"),
    validFrom: opts.validFrom !== undefined ? opts.validFrom : ts - 10,
    validUntil: opts.validUntil !== undefined ? opts.validUntil : ts + 3600,
    policyVersion: H.b32("pol_v1"),
  };
  const domain = {
    name: "SFSPIdentityAdapter",
    version: "draft-0.3",
    chainId: cid,
    verifyingContract: f.identity.address,
  };
  const message = Object.assign({}, att, {
    validFrom: String(att.validFrom),
    validUntil: String(att.validUntil),
    chainId: String(cid),
    verifyingContract: f.identity.address,
  });
  const signer = opts.signer || f.board;
  const sig = await H.signTypedData(signer, domain, ATT_TYPES, "Attestation", message);
  // La struct on-chain no lleva chainId/verifyingContract: los añade el hash.
  return { att, sig };
}

describe("SFSPIdentityAdapter · attestations sin datos personales", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  it("positivo: registra una attestation firmada por el emisor autorizado", async function () {
    const { att, sig } = await buildAttestation(f, {});
    const v = await f.identity.call("verifyAttestation", [att, sig]);
    assert.equal(Number(v[0]), F.CODE.ALLOW);
    await f.identity.send("recordAttestation", [att, sig], f.board);
    assert.equal(await f.identity.call("hasValidClaim", [KYC_ALICE, KYC]), true);
  });

  it("negativo: una attestation firmada por quien no es ATTESTOR se rechaza", async function () {
    const { att, sig } = await buildAttestation(f, { signer: f.alice });
    const v = await f.identity.call("verifyAttestation", [att, sig]);
    assert.equal(Number(v[0]), F.CODE.DENY_AUTHORIZATION);
    await H.expectRevert(f.identity.send("recordAttestation", [att, sig], f.board), "UnauthorizedIssuer");
  });

  it("negativo: reutilizar el attestationId revierte (anti-replay aparte de EIP-712)", async function () {
    const { att, sig } = await buildAttestation(f, {});
    await f.identity.send("recordAttestation", [att, sig], f.board);
    await H.expectRevert(f.identity.send("recordAttestation", [att, sig], f.board), "AttestationReplayed");
  });

  it("negativo: revocar invalida el claim y distingue 'consta' de 'vale'", async function () {
    const { att, sig } = await buildAttestation(f, {});
    await f.identity.send("recordAttestation", [att, sig], f.board);
    await f.identity.send("revokeAttestation", [KYC_ALICE, KYC, H.b32("REVOKED_TEST")], f.board);
    const st = await f.identity.call("claimStatus", [KYC_ALICE, KYC]);
    assert.equal(st[0], true, "consta");
    assert.equal(st[1], false, "pero no vale");
  });
});

describe("SFSPEligibilityEngine · evaluate es view y devuelve códigos del §4", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  it("positivo: evaluate está declarado view y no emite eventos ni cambia estado", async function () {
    const abi = f.engine.abi.find((x) => x.name === "evaluate");
    assert.equal(abi.stateMutability, "view", "evaluate debe ser view");
    const args = [f.alice, f.ASSET_NEW, H.b32("TRANSFER_OUT"), H.b32num(1)];
    const before = await f.engine.call("evaluate", args);
    // Enviar una transacción a una función view no produce logs ni cambia el resultado.
    const receipt = await f.engine.send("evaluate", args, f.board);
    assert.equal(receipt.logs.length, 0, "evaluate no puede emitir eventos");
    const after = await f.engine.call("evaluate", args);
    assert.equal(Number(before[0]), Number(after[0]));
    assert.equal(Number(before[0]), F.CODE.ALLOW);
  });

  it("negativo: sin política fijada devuelve BLOCKED_DECISION, no ALLOW", async function () {
    const r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("ACCION_SIN_POLITICA"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.BLOCKED_DECISION);
  });

  it("negativo: un activo no registrado devuelve UNKNOWN_SOURCE, no deny ni cero", async function () {
    const otro = H.b32("SFSP:MON:Z:1");
    await F.fijarPolitica(f, otro, H.b32("TRANSFER_OUT"), F.policy({}), "t03a");
    const r = await f.engine.call("evaluate", [f.alice, otro, H.b32("TRANSFER_OUT"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.UNKNOWN_SOURCE);
  });

  it("negativo: MON no pasa automáticamente: sin su política también bloquea", async function () {
    const mon = H.b32("SFSP:MON:ISS1:S1");
    await f.registry.send("registerAsset", [F.passport(mon)], f.board);
    const r = await f.engine.call("evaluate", [f.alice, mon, H.b32("TRANSFER_OUT"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.BLOCKED_DECISION);
  });

  /* H16 · «sin referencia opaca» dejó de poder preguntarse: una dirección se
     conoce DENTRO de un propósito o no se conoce. `mallory` no tiene alta en
     ninguno, así que sigue siendo fuente desconocida y no un deny de política. */
  it("negativo: dirección sin alta en el propósito base devuelve UNKNOWN_SOURCE", async function () {
    const r = await f.engine.call("evaluate", [f.mallory, f.ASSET_NEW, H.b32("TRANSFER_OUT"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.UNKNOWN_SOURCE);
  });

  it("negativo: claim exigido y ausente es UNKNOWN_SOURCE; revocado es DENY_ELIGIBILITY", async function () {
    await F.fijarPolitica(f, f.ASSET_NEW, H.b32("TRANSFER_IN"), F.policy({ requiredPurpose: KYC }), "t03b");
    // Alta de alice en el propósito KYC: es otro compromiso, no el mismo valor
    // que en BASE, y desde la cadena no se puede ver que sean del mismo sujeto.
    await f.identity.send("bindPurposeCommitment", [f.alice, KYC, KYC_ALICE], f.board);
    let r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("TRANSFER_IN"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.UNKNOWN_SOURCE);

    const { att, sig } = await buildAttestation(f, {});
    await f.identity.send("recordAttestation", [att, sig], f.board);
    r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("TRANSFER_IN"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.ALLOW);

    await f.identity.send("revokeAttestation", [KYC_ALICE, KYC, H.b32("REVOKED_TEST")], f.board);
    r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("TRANSFER_IN"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.DENY_ELIGIBILITY);
  });

  it("negativo: jurisdicción no permitida devuelve DENY_JURISDICTION", async function () {
    await F.fijarPolitica(f, f.ASSET_NEW, H.b32("SETTLE"), F.policy({ jurisdictionAllowlist: true }), "t03c");
    let r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("SETTLE"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.DENY_JURISDICTION);
    await f.engine.send("setJurisdictionAllowed", [f.ASSET_NEW, H.b32("JUR_TEST"), true], f.board);
    r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("SETTLE"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.ALLOW);
  });

  it("negativo: superar el límite de la política devuelve DENY_LIMIT", async function () {
    await F.fijarPolitica(f, f.ASSET_NEW, H.b32("TRANSFER_OUT"), F.policy({ maxAmount: 100 }), "t03d");
    const r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("TRANSFER_OUT"), H.b32num(101)]);
    assert.equal(Number(r[0]), F.CODE.DENY_LIMIT);
  });

  it("negativo: una acción prohibida por política devuelve DENY_POLICY", async function () {
    await F.fijarPolitica(f, f.ASSET_NEW, H.b32("REDEEM"), F.policy({ actionAllowed: false }), "t03e");
    const r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("REDEEM"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.DENY_POLICY);
  });

  it("negativo: decimals desconocido bloquea la decisión que depende de él", async function () {
    const id = H.b32("SFSP:COM:Y:1");
    await f.registry.send("registerAsset", [F.passport(id, { decimalsKnown: false })], f.board);
    await F.fijarPolitica(f, id, H.b32("TRANSFER_OUT"), F.policy({}), "t03f");
    const r = await f.engine.call("evaluate", [f.alice, id, H.b32("TRANSFER_OUT"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.UNKNOWN_SOURCE);
  });

  it("negativo: con pausa vigente el estado del activo deniega", async function () {
    await f.governance.send("emergencyPause", [H.b32("INCIDENT_TEST"), 600], f.signers[0]);
    const r = await f.engine.call("evaluate", [f.alice, f.ASSET_NEW, H.b32("TRANSFER_OUT"), H.ZERO32]);
    assert.equal(Number(r[0]), F.CODE.DENY_ASSET_STATE);
  });
});
