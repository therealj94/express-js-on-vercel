"use strict";
/* Constructor de ÓRDENES LIGADAS AL CONTENIDO (SFSP-AUTH-v1, §12 de SFSP-800).
 *
 * Existe para que las pruebas de los ejecutores hablen el mismo idioma que
 * `src/lib/SFSPAuthorization.sol`: se construye un payload, se calcula su digest
 * AQUÍ —en JavaScript, de forma independiente de la cadena— y se hace aprobar
 * ese digest por gobierno con doble control y separación de funciones.
 *
 * Que el digest se calcule aquí y no leyéndolo del contrato es deliberado: si el
 * ejecutor recalculara algo distinto de lo que se aprobó, la prueba fallaría, que
 * es exactamente la propiedad que el patrón promete. */
const H = require("./helpers");

const ETIQUETA_DOMINIO = H.keccak256(Buffer.from("SFSP-AUTH-v1", "utf8"));
const TYPEHASH_PAYLOAD = H.keccak256(
  Buffer.from(
    "SFSPAuthPayload(uint256 chainId,address verifyingContract,bytes32 action," +
      "bytes32 assetId,address origin,address destination,uint256 amount," +
      "uint256 amountSecondary,bytes32 nonce,uint64 notBefore,uint64 expiry,bytes32 evidenceRoot)",
    "utf8",
  ),
);

const TIPOS = [
  "bytes32", "bytes32", "uint256", "address", "bytes32", "bytes32",
  "address", "address", "uint256", "uint256", "bytes32", "uint64", "uint64", "bytes32",
];

/** Los campos, en el orden exacto de la struct de Solidity. */
function tupla(p) {
  return [
    String(p.chainId),
    p.verifyingContract,
    p.action,
    p.assetId,
    p.origin,
    p.destination,
    String(p.amount),
    String(p.amountSecondary),
    p.nonce,
    String(p.notBefore),
    String(p.expiry),
    p.evidenceRoot,
  ];
}

function digestDe(p) {
  return H.keccak256(
    H.defaultAbiCoder.encode(TIPOS, [
      ETIQUETA_DOMINIO,
      TYPEHASH_PAYLOAD,
      String(p.chainId),
      p.verifyingContract,
      p.action,
      p.assetId,
      p.origin,
      p.destination,
      String(p.amount),
      String(p.amountSecondary),
      p.nonce,
      String(p.notBefore),
      String(p.expiry),
      p.evidenceRoot,
    ]),
  );
}

/** Payload vigente, atado a esta red y al contrato que lo va a ejecutar. */
async function orden(over) {
  const ts = await H.now();
  const cid = await H.chainId();
  return Object.assign(
    {
      chainId: cid,
      verifyingContract: H.ZERO_ADDR,
      action: H.b32("FORCED_TRANSFER"),
      assetId: H.ZERO32,
      origin: H.ZERO_ADDR,
      destination: H.ZERO_ADDR,
      amount: "0",
      amountSecondary: "0",
      nonce: H.b32("nonce_orden_0001"),
      notBefore: ts - 60,
      expiry: ts + 3600,
      evidenceRoot: H.ZERO32,
    },
    over || {},
  );
}

/**
 * Hace aprobar un digest con doble control REAL: propone un firmante y aprueban
 * otros dos distintos. El proponente no cuenta como aprobador (§12.5, P03).
 */
async function aprobar(f, digest, action, quienes) {
  const firmantes = quienes || { propone: f.signers[0], aprueban: [f.signers[1], f.signers[2]] };
  await f.governance.send("proposeAuthorization", [digest, action], firmantes.propone);
  for (const s of firmantes.aprueban) {
    await f.governance.send("approveAuthorization", [digest], s);
  }
  return digest;
}

/** Atajo: construye la orden, calcula su digest y lo hace aprobar. */
async function ordenAprobada(f, over) {
  const p = await orden(over);
  const d = digestDe(p);
  await aprobar(f, d, p.action);
  return { p, tupla: tupla(p), digest: d };
}

module.exports = { orden, tupla, digestDe, aprobar, ordenAprobada, ETIQUETA_DOMINIO, TYPEHASH_PAYLOAD };
