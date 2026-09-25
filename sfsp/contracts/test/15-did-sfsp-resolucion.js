"use strict";
/* SFSP-160 · prueba cruzada: el resolutor did:sfsp del SDK lee el contrato
   SFSPDidRegistry REAL con eth_call, y una credencial de un emisor registrado
   en la cadena se verifica; al revocar la llave en la cadena, deja de pasar.

   Es la prueba de que la fuente de verdad de quién es un emisor es la 5550:
   el SDK no tiene otra forma de saberlo. */
const assert = require("node:assert/strict");
const path = require("node:path");
const H = require("./helpers");

const SDK = path.resolve(__dirname, "../../sdk/dist/index.js");

describe("SFSP-160 · did:sfsp resuelto desde el registro en la cadena", function () {
  let sdk, reg, board, ctrl, lector;
  before(async function () { sdk = await import(SDK); });

  beforeEach(async function () {
    const acc = await H.accounts();
    [board, ctrl] = [acc[0], acc[1]];
    reg = await H.deploy("SFSPDidRegistry", [board], board);
    const red = String(await H.chainId()) === "5550" ? "5550" : "5534";
    // Hardhat corre con su propio chainId: el lector se ata a una red SFSP para
    // la prueba y la llamada va al contrato desplegado aquí.
    lector = sdk.lectorRpc(red, reg.address, (to, data) => H.provider.send("eth_call", [{ to, data }, "latest"]));
  });

  async function emisorRegistrado(red) {
    const llaves = sdk.nuevasLlaves();
    const orgId = "genesis_kyc";
    await reg.send("registerOrg", [sdk.b32Texto(orgId), ctrl, H.ZERO32], board);
    await reg.send("addKey", [sdk.b32Texto(orgId), sdk.b32Texto("firma-1"), 1, "0x" + Buffer.from(llaves.publica).toString("hex"), 1], ctrl);
    return { did: sdk.didOrganizacion(orgId, red), kid: "#firma-1", llaves, orgId };
  }

  it("el documento del emisor sale de la cadena, con su llave", async function () {
    const e = await emisorRegistrado(lector.red);
    const doc = await sdk.resolver(e.did, { registro: lector });
    assert.equal(doc.assertionMethod[0], `${e.did}#firma-1`);
    assert.deepEqual(sdk.publicaDeMetodo(doc, "#firma-1", "assertionMethod"), e.llaves.publica);
  });

  it("una credencial del emisor registrado se verifica; revocada la llave en la cadena, no", async function () {
    const e = await emisorRegistrado(lector.red);
    const persona = sdk.nuevasLlaves();
    const ahora = new Date();
    const em = sdk.emitirCredencial({
      emisor: e, sujeto: sdk.didPersona(persona.publica, lector.red), proposito: "KYC",
      claims: { mayorDeEdad: true, nivel: 2 }, politica: "kyc-hn-v1",
      validoDesde: new Date(ahora.getTime() - 60000), validoHasta: new Date(ahora.getTime() + 3600000),
    });
    const aud = sdk.didOrganizacion("dbnx", lector.red);
    const vp = (nonce) => sdk.presentar({ credencialJwt: em.jwt, divulgaciones: em.divulgaciones, revelar: ["mayorDeEdad"], titular: persona, audiencia: aud, nonce, ahora, red: lector.red });
    const opts = (nonce) => ({ audiencia: aud, nonce, emisoresConfiables: { KYC: [e.did] }, proposito: "KYC", exigir: ["mayorDeEdad"], registro: lector, ahora });
    const r1 = await sdk.verificarPresentacion(vp("a"), opts("a"));
    assert.equal(r1.codigo, "ALLOW", r1.detalle);
    await reg.send("revokeKey", [sdk.b32Texto(e.orgId), sdk.b32Texto("firma-1")], ctrl);
    const r2 = await sdk.verificarPresentacion(vp("b"), opts("b"));
    assert.equal(r2.codigo, "DENY_AUTHORIZATION");
  });

  it("el firmante de atestaciones lo dice la cadena, y la baja lo apaga", async function () {
    const e = await emisorRegistrado(lector.red);
    const acc = await H.accounts();
    await reg.send("setAttestor", [sdk.b32Texto(e.orgId), acc[3], true], ctrl);
    assert.equal(await sdk.esFirmanteDeCadena(e.did, acc[3], lector), true);
    await reg.send("deactivate", [sdk.b32Texto(e.orgId), H.b32("PRUEBA")], board);
    assert.equal(await sdk.esFirmanteDeCadena(e.did, acc[3], lector), false);
    await assert.rejects(sdk.resolver(e.did, { registro: lector }), /baja/);
  });
});
