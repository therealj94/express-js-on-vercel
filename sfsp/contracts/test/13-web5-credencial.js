"use strict";
/* SFSP-160 · prueba cruzada: lo que arma el SDK Web5 es exactamente lo que el
   adaptador de identidad acepta.

   Una credencial W3C emitida por el SDK se proyecta a una atestación. Si el
   compromiso, el typehash, el dominio o el orden de los campos difirieran en un
   solo byte, el emisor firmaría un digest que el contrato no reconoce y toda
   credencial real quedaría fuera de la cadena. Esta prueba lo impide. */
const assert = require("node:assert/strict");
const path = require("node:path");
const F = require("./fixture");
const H = require("./helpers");

const SDK = path.resolve(__dirname, "../../sdk/dist/index.js");

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

describe("SFSP-160 · credencial W3C → atestación SFSP en el adaptador", function () {
  let f, sdk;
  before(async function () { sdk = await import(SDK); });
  beforeEach(async function () { f = await F.deployAll(); });

  async function emitirYProyectar() {
    const ts = await H.now();
    const emisor = { did: "did:web:genesis.ordenglobal.link:emisores:kyc", kid: "#firma-1", llaves: sdk.nuevasLlaves() };
    const persona = sdk.nuevasLlaves();
    const e = sdk.emitirCredencial({
      emisor,
      sujeto: sdk.didKeyDe(persona.publica),
      proposito: "KYC",
      claims: { nivel: 2, mayorDeEdad: true, pais: "HN" },
      politica: "kyc-hn-v1",
      validoDesde: new Date((ts - 10) * 1000),
      validoHasta: new Date((ts + 3600) * 1000),
    });
    const subjectRef = H.b32("sujeto_sintetico_web5");
    const salt = H.b32("sal_sintetica_web5");
    const att = sdk.proyectarCredencial(e.credencial, subjectRef, salt);
    return { e, att, subjectRef, salt };
  }

  async function firmar(att) {
    const cid = await H.chainId();
    const domain = { name: "SFSPIdentityAdapter", version: "draft-0.3", chainId: cid, verifyingContract: f.identity.address };
    const message = Object.assign({}, att, {
      validFrom: String(att.validFrom),
      validUntil: String(att.validUntil),
      chainId: String(cid),
      verifyingContract: f.identity.address,
    });
    return H.signTypedData(f.board, domain, ATT_TYPES, "Attestation", message);
  }

  it("el compromiso por propósito del SDK es el del contrato", async function () {
    const { att, subjectRef, salt } = await emitirYProyectar();
    const delContrato = await f.identity.call("purposeCommitment", [subjectRef, att.purpose, salt]);
    assert.equal(String(delContrato).toLowerCase(), att.subjectCommitment);
  });

  it("el digest EIP-712 del SDK es, byte por byte, hashAttestation del contrato", async function () {
    const { att } = await emitirYProyectar();
    const cid = await H.chainId();
    const delContrato = await f.identity.call("hashAttestation", [att]);
    assert.equal(String(delContrato).toLowerCase(), sdk.digestDeAtestacion(att, cid, f.identity.address));
  });

  it("la atestación de la credencial se registra, vale, y deja de valer al revocarla", async function () {
    const { e, att } = await emitirYProyectar();
    const sig = await firmar(att);
    const v = await f.identity.call("verifyAttestation", [att, sig]);
    assert.equal(Number(v[0]), F.CODE.ALLOW);
    await f.identity.send("recordAttestation", [att, sig], f.board);
    assert.equal(await f.identity.call("hasValidClaim", [att.subjectCommitment, att.purpose]), true);
    // La raíz en la cadena es la de la credencial: la misma prueba de Merkle sirve dentro y fuera.
    assert.equal(att.claimsRoot, e.credencial.credentialSubject.claimsRoot);
    await f.identity.send("revokeAttestation", [att.subjectCommitment, att.purpose, H.b32("KYC_REVOCADO")], f.board);
    assert.equal(await f.identity.call("hasValidClaim", [att.subjectCommitment, att.purpose]), false);
  });

  it("negativo: una credencial alterada después de firmar no pasa en la cadena", async function () {
    const { att } = await emitirYProyectar();
    const sig = await firmar(att);
    const alterada = Object.assign({}, att, { claimsRoot: H.b32("otra_raiz") });
    const v = await f.identity.call("verifyAttestation", [alterada, sig]);
    assert.equal(Number(v[0]), F.CODE.DENY_AUTHORIZATION);
  });
});
