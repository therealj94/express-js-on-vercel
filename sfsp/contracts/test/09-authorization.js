"use strict";
/* Autorización ligada al contenido: la mitad Solidity.
 *
 * La prueba más importante de este archivo es la primera: los digests que
 * calcula `SFSPAuthorization` en cadena tienen que coincidir, vector a vector,
 * con los que calcula `sdk/src/autorizacion.ts` fuera de ella. Si los dos lados
 * divergen en un solo campo, el ejecutor rechazaría aprobaciones legítimas o
 * —mucho peor— aceptaría una aprobación calculada sobre otro contenido.
 *
 * El resto son los casos negativos del patrón: cambiar un campo cambia el
 * digest, una ventana cerrada rechaza, y un digest se gasta una sola vez. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const H = require("./helpers");

const RUTA_VECTORES = path.join(__dirname, "..", "..", "fixtures", "vectores-autorizacion.json");
const VEC = JSON.parse(fs.readFileSync(RUTA_VECTORES, "utf8"));

/** El struct de Solidity espera los campos en el orden de su declaración. */
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

function porId(id) {
  const v = VEC.vectores.find((x) => x.id === id);
  if (!v) throw new Error("vector inexistente: " + id);
  return v;
}

/** Un payload vigente aquí y ahora, atado a esta red y a este contrato. */
async function payloadVigente(probe, over) {
  const ts = await H.now();
  const cid = await H.chainId();
  return Object.assign(
    {
      chainId: cid,
      verifyingContract: probe.address,
      action: H.b32("FORCED_TRANSFER"),
      assetId: H.b32("SFSP:SEC:ISS1:S1"),
      origin: "0x" + "00".repeat(19) + "01",
      destination: "0x" + "00".repeat(19) + "02",
      amount: "250",
      amountSecondary: "0",
      nonce: H.b32("nonce_vivo_0001"),
      notBefore: ts - 60,
      expiry: ts + 3600,
      evidenceRoot: H.ZERO32,
    },
    over || {},
  );
}

describe("SFSPAuthorization · autorización ligada al contenido", function () {
  let probe;
  let board;

  beforeEach(async function () {
    const cuentas = await H.accounts();
    board = cuentas[0];
    probe = await H.deploy("SFSPAuthorizationProbe", [], board);
  });

  // ------------------------------------------------------------ vectores

  it("las constantes de dominio y de tipo coinciden con las del SDK", async function () {
    assert.equal(await probe.call("domainTag"), VEC.etiquetaDominio);
    assert.equal(await probe.call("payloadTypehash"), VEC.typehashPayload);
  });

  it("CRUZADA: los 20 vectores compartidos dan en Solidity el mismo digest que en TypeScript", async function () {
    assert.ok(VEC.vectores.length >= 12, "el juego de vectores no puede encogerse");
    for (const v of VEC.vectores) {
      const enCadena = await probe.call("digestOf", [tupla(v.payload)]);
      assert.equal(
        enCadena.toLowerCase(),
        v.digest.toLowerCase(),
        `divergencia Solidity/TypeScript en ${v.id}: ${v.descripcion}`,
      );
    }
  });

  it("ningún par de vectores comparte digest: veinte contenidos, veinte autorizaciones", async function () {
    const vistos = new Map();
    for (const v of VEC.vectores) {
      const d = (await probe.call("digestOf", [tupla(v.payload)])).toLowerCase();
      assert.equal(vistos.has(d), false, `colisión entre ${vistos.get(d)} y ${v.id}`);
      vistos.set(d, v.id);
    }
  });

  // ------------------------------------------- negativo: un campo cambia todo

  it("negativo: cambiar un solo campo cambia el digest, campo por campo", async function () {
    const base = await payloadVigente(probe);
    const original = await probe.call("digestOf", [tupla(base)]);
    const variaciones = {
      chainId: String(BigInt(base.chainId) + 1n),
      verifyingContract: "0x" + "00".repeat(19) + "ff",
      action: H.b32("BURN"),
      assetId: H.b32("SFSP:SEC:ISS1:S2"),
      origin: "0x" + "00".repeat(19) + "03",
      destination: "0x" + "00".repeat(19) + "04",
      amount: "251",
      amountSecondary: "1",
      nonce: H.b32("nonce_vivo_0002"),
      notBefore: base.notBefore - 1,
      expiry: base.expiry + 1,
      evidenceRoot: "0x" + "11".repeat(32),
    };
    for (const campo of Object.keys(variaciones)) {
      const alterado = Object.assign({}, base, { [campo]: variaciones[campo] });
      const d = await probe.call("digestOf", [tupla(alterado)]);
      assert.notEqual(d, original, `cambiar ${campo} debía cambiar el digest`);
    }
  });

  it("negativo: una aprobación legítima no ejecuta un payload alterado en un solo campo", async function () {
    const base = await payloadVigente(probe);
    const aprobado = await probe.call("digestOf", [tupla(base)]);
    // El gobierno aprobó confiscar a `origin`; el ejecutor intenta confiscar a otro.
    const otro = Object.assign({}, base, { origin: "0x" + "00".repeat(19) + "09" });
    await H.expectRevert(probe.send("authorize", [tupla(otro), aprobado], board), "AuthorizationDigestMismatch");
    // Y el digest aprobado sigue sin gastarse: un intento fallido no quema la autorización.
    assert.equal(await probe.call("isConsumed", [aprobado]), false);
  });

  it("negativo: dos payloads que una concatenación ingenua confundiría dan digests distintos", async function () {
    // V16 lleva action="AB", assetId="C"; V17 lleva action="A", assetId="BC".
    // Concatenar sin prefijo de longitud daría "ABC" en los dos casos. Con
    // palabras de 32 bytes en posición fija la reagrupación es imposible.
    const a = porId("V16");
    const b = porId("V17");
    const da = await probe.call("digestOf", [tupla(a.payload)]);
    const db = await probe.call("digestOf", [tupla(b.payload)]);
    assert.notEqual(da, db, "reagrupación de campos: dos contenidos, un digest");
    assert.equal(da.toLowerCase(), a.digest.toLowerCase());
    assert.equal(db.toLowerCase(), b.digest.toLowerCase());
  });

  // ------------------------------------------------------------- vigencia

  it("negativo: un payload aún no vigente revierte con AuthorizationNotYetValid", async function () {
    const ts = await H.now();
    const p = await payloadVigente(probe, { notBefore: ts + 3600, expiry: ts + 7200 });
    const d = await probe.call("digestOf", [tupla(p)]);
    await H.expectRevert(probe.send("authorize", [tupla(p), d], board), "AuthorizationNotYetValid");
    assert.equal(await probe.call("isConsumed", [d]), false);
  });

  it("negativo: un payload vencido revierte con AuthorizationExpired", async function () {
    const ts = await H.now();
    const p = await payloadVigente(probe, { notBefore: ts - 7200, expiry: ts - 10 });
    const d = await probe.call("digestOf", [tupla(p)]);
    await H.expectRevert(probe.send("authorize", [tupla(p), d], board), "AuthorizationExpired");
  });

  it("negativo: una ventana vacía o invertida no es una autorización", async function () {
    const ts = await H.now();
    const vacia = await payloadVigente(probe, { notBefore: ts, expiry: ts });
    await H.expectRevert(probe.call("checkForm", [tupla(vacia)]), "AuthorizationMalformed");
    const invertida = await payloadVigente(probe, { notBefore: ts + 100, expiry: ts + 10 });
    await H.expectRevert(probe.call("checkForm", [tupla(invertida)]), "AuthorizationMalformed");
  });

  it("negativo: action, assetId o nonce en cero se rechazan por forma", async function () {
    for (const campo of ["action", "assetId", "nonce"]) {
      const p = await payloadVigente(probe, { [campo]: H.ZERO32 });
      await H.expectRevert(probe.call("checkForm", [tupla(p)]), "AuthorizationMalformed");
    }
  });

  it("positivo: notBefore es inclusivo y expiry exclusivo", async function () {
    const ts = await H.now();
    // La ventana arranca exactamente ahora: el bloque siguiente ya la ve abierta.
    const p = await payloadVigente(probe, { notBefore: ts, expiry: ts + 600 });
    await probe.call("checkWindow", [tupla(p)]);
    // Y en el segundo exacto de vencimiento ya no.
    const q = await payloadVigente(probe, { notBefore: ts - 600, expiry: ts + 1 });
    await H.increaseTime(5);
    await H.expectRevert(probe.call("checkWindow", [tupla(q)]), "AuthorizationExpired");
  });

  // --------------------------------------------------------- consumo único

  it("positivo: una autorización válida se ejecuta y queda consumida con su instante", async function () {
    const p = await payloadVigente(probe);
    const d = await probe.call("digestOf", [tupla(p)]);
    assert.equal(await probe.call("isConsumed", [d]), false);
    await probe.send("authorize", [tupla(p), d], board);
    assert.equal(await probe.call("isConsumed", [d]), true);
    assert.ok(Number(await probe.call("consumedAt", [d])) > 0, "el instante de consumo queda registrado");
  });

  it("negativo: el segundo consumo del mismo digest revierte (DENY_AUTHORIZATION)", async function () {
    const p = await payloadVigente(probe);
    const d = await probe.call("digestOf", [tupla(p)]);
    await probe.send("authorize", [tupla(p), d], board);
    // El código 5 del §4 es DENY_AUTHORIZATION: «falta autorización, está vencida o ya se consumió».
    await H.expectRevert(probe.send("authorize", [tupla(p), d], board), "AuthorizationConsumed");
    const msg = await H.expectRevert(probe.send("consume", [d], board), "AuthorizationConsumed");
    assert.ok(msg.includes(", 5)"), "el error lleva el código DENY_AUTHORIZATION del §4");
  });

  it("negativo: H19 en pequeño, una aprobación de UNPAUSE no levanta la pausa siguiente", async function () {
    const ts = await H.now();
    const incidente1 = await payloadVigente(probe, {
      action: H.b32("UNPAUSE"),
      destination: H.ZERO_ADDR,
      amount: "0",
      nonce: H.b32("pause_incidente_1"),
      notBefore: ts - 60,
      expiry: ts + 3600,
    });
    const d1 = await probe.call("digestOf", [tupla(incidente1)]);
    await probe.send("authorize", [tupla(incidente1), d1], board);

    const incidente2 = Object.assign({}, incidente1, { nonce: H.b32("pause_incidente_2") });
    const d2 = await probe.call("digestOf", [tupla(incidente2)]);
    assert.notEqual(d1, d2, "cada pausa es una autorización distinta");
    // La aprobación vieja no vale para el incidente nuevo.
    await H.expectRevert(probe.send("authorize", [tupla(incidente2), d1], board), "AuthorizationDigestMismatch");
    assert.equal(await probe.call("isConsumed", [d2]), false);
  });

  // ----------------------------------------------------- atadura al lugar

  it("negativo: una aprobación de otra red o de otro contrato no se presenta aquí", async function () {
    const otraRed = await payloadVigente(probe, { chainId: String(BigInt(await H.chainId()) + 1n) });
    await H.expectRevert(
      probe.send("authorize", [tupla(otraRed), await probe.call("digestOf", [tupla(otraRed)])], board),
      H.b32("CHAIN_MISMATCH"),
    );
    const otroContrato = await payloadVigente(probe, { verifyingContract: "0x" + "00".repeat(19) + "aa" });
    await H.expectRevert(
      probe.send("authorize", [tupla(otroContrato), await probe.call("digestOf", [tupla(otroContrato)])], board),
      H.b32("CONTRACT_MISMATCH"),
    );
  });

  it("negativo: un digest aprobado que no corresponde al payload no autoriza nada", async function () {
    const p = await payloadVigente(probe);
    await H.expectRevert(probe.send("authorize", [tupla(p), H.b32("no-es-el-hash")], board), "AuthorizationDigestMismatch");
    assert.equal(await probe.call("isConsumed", [await probe.call("digestOf", [tupla(p)])]), false);
  });
});
