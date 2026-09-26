"use strict";
// Constructor de SignedAuthorization (§2.4) firmada EIP-712 por firmantes de gobierno.
const H = require("./helpers");
const OA = require("./orden-autorizada");

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

/**
 * H01 aplicado a la emisión: además del sobre firmado del §2.4, cada acuñación
 * necesita su propia orden de gobierno ligada al contenido. El monto efectivo y
 * el `operationId` viajan DENTRO del digest (`amount` y `nonce`), así que ya no
 * son parámetros libres del emisor.
 */
async function ordenDeEmision(f, auth, amount, operationId) {
  // v0.3 §5 · verificación previa a la acuñación: DBNX registra el documento
  // de aprobación por la cantidad EXACTA y su hash viaja en `evidenceRoot`,
  // dentro del digest que aprueba gobierno.
  const docHash = await aprobacionDbnx(f, auth.assetId, amount, "doc_" + operationId);
  const p = await OA.orden({
    verifyingContract: f.issuance.address,
    action: H.b32("MINT"),
    assetId: auth.assetId,
    origin: H.ZERO_ADDR,
    destination: auth.destination,
    amount: String(amount),
    nonce: operationId,
    evidenceRoot: docHash,
  });
  const digest = OA.digestDe(p);
  await OA.aprobar(f, digest, p.action);
  return { p, tupla: OA.tupla(p), digest };
}

/**
 * v0.3 §5 · DBNX registra un documento de aprobación sintético para `assetId`
 * por exactamente `amount`, vigente desde ahora. Devuelve su hash.
 */
async function aprobacionDbnx(f, assetId, amount, etiqueta, over) {
  const o = over || {};
  const ts = await H.now();
  const docHash = H.keccak256(Buffer.from("DBNX:APROBACION:" + etiqueta, "utf8"));
  await f.issuance.send(
    "registerDbnxApproval",
    [
      docHash,
      assetId,
      String(amount),
      String(o.validFrom !== undefined ? o.validFrom : ts - 60),
      String(o.validUntil !== undefined ? o.validUntil : ts + 7200),
    ],
    o.from || f.dbnx,
  );
  return docHash;
}

/** Acuña: aprueba la orden de esta acuñación concreta y la ejecuta. */
async function acunar(f, sobre, amount, operationId, from) {
  const o = await ordenDeEmision(f, sobre.auth, amount, operationId);
  return await f.issuance.send("mint", [sobre.auth, sobre.sigs, o.tupla, o.digest], from || f.board);
}

/**
 * H02: quema con decisión de gobierno. El digest compromete activo, titular,
 * monto y motivo (`evidenceRoot`), y se consume al ejecutarse.
 */
async function ordenDeQuema(f, asset, assetId, holder, amount, reason, nonce) {
  const p = await OA.orden({
    verifyingContract: asset.address,
    action: H.b32("BURN"),
    assetId,
    origin: holder,
    destination: H.ZERO_ADDR,
    amount: String(amount),
    nonce,
    evidenceRoot: reason,
  });
  return { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };
}

async function quemarConGobierno(f, asset, assetId, holder, amount, reason, nonce, from) {
  const o = await ordenDeQuema(f, asset, assetId, holder, amount, reason, nonce);
  await OA.aprobar(f, o.digest, H.b32("BURN"));
  return await asset.send("burn", [o.tupla, o.digest], from || f.board);
}

module.exports = {
  buildAuthorization,
  ordenDeEmision,
  aprobacionDbnx,
  acunar,
  ordenDeQuema,
  quemarConGobierno,
  AUTH_TYPES,
};
