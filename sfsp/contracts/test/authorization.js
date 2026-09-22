"use strict";
// Constructor de SignedAuthorization (§2.4) firmada EIP-712 por firmantes de gobierno.
const H = require("./helpers");

const AUTH_TYPES = {
  SignedAuthorization: [
    { name: "schemaVersion", type: "bytes32" },
    { name: "authorizationId", type: "bytes32" },
    { name: "actionId", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "genesisHash", type: "bytes32" },
    { name: "verifyingContract", type: "address" },
    { name: "assetId", type: "bytes32" },
    { name: "amount", type: "uint256" },
    { name: "destination", type: "address" },
    { name: "policyVersion", type: "bytes32" },
    { name: "evidenceRoot", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "notBefore", type: "uint64" },
    { name: "expiry", type: "uint64" },
  ],
};

async function buildAuthorization(f, overrides) {
  const o = overrides || {};
  const cid = await H.chainId();
  const ts = await H.now();
  const auth = {
    schemaVersion: H.b32("draft-0.3"),
    authorizationId: o.authorizationId || H.b32("auth_0001"),
    actionId: H.b32("MINT"),
    chainId: cid,
    genesisHash: H.ZERO32,
    verifyingContract: f.issuance.address,
    assetId: o.assetId || f.ASSET_NEW,
    amount: o.amount !== undefined ? String(o.amount) : "1000",
    destination: o.destination || f.treasury,
    policyVersion: H.b32("pol_v1"),
    evidenceRoot: H.b32("ev_root_1"),
    nonce: o.nonce || H.b32("nonce_0001"),
    notBefore: o.notBefore !== undefined ? o.notBefore : ts - 10,
    expiry: o.expiry !== undefined ? o.expiry : ts + 3600,
  };
  const domain = {
    name: "SFSPIssuanceController",
    version: "draft-0.3",
    chainId: cid,
    verifyingContract: f.issuance.address,
  };
  const message = Object.assign({}, auth, {
    chainId: String(auth.chainId),
    notBefore: String(auth.notBefore),
    expiry: String(auth.expiry),
  });
  // Firmas ordenadas por dirección: el contrato exige orden estricto para que
  // una misma firma no cuente dos veces hacia el quórum.
  const who = o.signers || [f.signers[0], f.signers[1]];
  const sigs = [];
  for (const s of who) {
    sigs.push(await H.signTypedData(s, domain, AUTH_TYPES, "SignedAuthorization", message));
  }
  return { auth, sigs };
}

module.exports = { buildAuthorization, AUTH_TYPES };
