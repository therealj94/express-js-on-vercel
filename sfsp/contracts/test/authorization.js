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
async function ordenDeEmision(f, auth, amount, operationId, over) {
  // v0.3 §5 · verificación previa a la acuñación: DBNX registra el documento
  // de aprobación por la cantidad EXACTA y el destino EXACTO, y su hash viaja
  // en `evidenceRoot`, dentro del digest que aprueba gobierno.
  const o = over || {};
  const docHash = await aprobacionDbnx(f, auth.assetId, amount, "doc_" + operationId, {
    destination: auth.destination,
    migration: o.migration,
  });
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

/** Regla de destino de un cupo comercial (SFSPIssuanceController.DEST_ELIGIBLE_ACQUIRER). */
const DEST_ADQUIRENTE_ELEGIBLE = H.keccak256(Buffer.from("SFSP.DBNX.DESTINO.ADQUIRENTE_ELEGIBLE", "utf8"));

/** Una dirección como destino exacto de un documento DBNX (bytes32). */
function destinoExacto(dir) {
  return "0x" + dir.slice(2).toLowerCase().padStart(64, "0");
}

/**
 * v0.3 §5 · DBNX registra un documento de aprobación sintético para `assetId`
 * por exactamente `amount`, vigente desde ahora. Devuelve su hash.
 * `over.destination`: dirección (destino exacto de `mint`) o bytes32 (regla de
 * destino de un cupo). Por omisión, la regla del cupo comercial.
 * `over.migration`: continuidad de tenencia (SFSP-700), sin SUBSCRIBE.
 */
async function aprobacionDbnx(f, assetId, amount, etiqueta, over) {
  const o = over || {};
  const ts = await H.now();
  const docHash = H.keccak256(Buffer.from("DBNX:APROBACION:" + etiqueta, "utf8"));
  let destino = o.destination || DEST_ADQUIRENTE_ELEGIBLE;
  if (/^0x[0-9a-fA-F]{40}$/.test(destino)) destino = destinoExacto(destino);
  await f.issuance.send(
    "registerDbnxApproval",
    [
      docHash,
      assetId,
      String(amount),
      String(o.validFrom !== undefined ? o.validFrom : ts - 60),
      String(o.validUntil !== undefined ? o.validUntil : ts + 7200),
      destino,
      !!o.migration,
    ],
    o.from || f.dbnx,
  );
  return docHash;
}

/**
 * SFSP-120 §0.3 · acuñar a un tercero con `mint` es COLOCAR: el destino tiene
 * que pasar SUBSCRIBE. Deja a `cuentas` en condiciones de suscribir `assetIds`
 * (por omisión ASSET_NEW), una sola vez por despliegue, y da al controlador de
 * emisión el rol de ejecutor en el motor. Todo sintético (v03.js).
 */
async function colocable(f, cuentas, assetIds) {
  const V = require("./v03");
  const ids = assetIds || [f.ASSET_NEW];
  const hecho = f._colocable || (f._colocable = { activos: new Set(), cuentas: new Set(), ejecutor: false });
  const activos = ids.filter((a) => !hecho.activos.has(a));
  const nuevas = cuentas.filter((c) => !hecho.cuentas.has(c.toLowerCase()));
  if (!activos.length && !nuevas.length && hecho.ejecutor) return;
  await V.habilitarSuscripcion(f, activos, nuevas, hecho.ejecutor ? [] : [f.issuance.address]);
  hecho.ejecutor = true;
  for (const a of activos) hecho.activos.add(a);
  for (const c of nuevas) hecho.cuentas.add(c.toLowerCase());
}

/** Acuña: aprueba la orden de esta acuñación concreta y la ejecuta. */
async function acunar(f, sobre, amount, operationId, from, over) {
  const o = await ordenDeEmision(f, sobre.auth, amount, operationId, over);
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
  DEST_ADQUIRENTE_ELEGIBLE,
  destinoExacto,
  colocable,
  acunar,
  ordenDeQuema,
  quemarConGobierno,
  AUTH_TYPES,
};
