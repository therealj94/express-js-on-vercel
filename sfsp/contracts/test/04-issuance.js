"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const { buildAuthorization } = require("./authorization");

describe("SFSPIssuanceController · autorización firmada y topes", function () {
  let f;
  beforeEach(async function () {
    f = await F.deployAll();
    // Límites sintéticos del fixture; el despliegue real los recibe de DBNX.
    await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 5000, 5000], f.board);
  });

  it("positivo: acuña exactamente lo autorizado y acumula contra la autorización", async function () {
    const { auth, sigs } = await buildAuthorization(f, {});
    await f.issuance.send("mint", [auth, sigs, 1000, H.b32("op_mint_1")], f.board);
    assert.equal((await f.assetNew.call("totalSupply")).toString(), "1000");
    assert.equal((await f.assetNew.call("balanceOf", [f.treasury])).toString(), "1000");
    assert.equal(
      (await f.issuance.call("mintedUnderAuthorization", [auth.authorizationId])).toString(),
      "1000"
    );
  });

  it("negativo: acuñar por encima del monto autorizado revierte", async function () {
    const { auth, sigs } = await buildAuthorization(f, { amount: 1000 });
    await H.expectRevert(
      f.issuance.send("mint", [auth, sigs, 1001, H.b32("op_mint_over")], f.board),
      "AuthorizationAmountExceeded"
    );
    assert.equal((await f.assetNew.call("totalSupply")).toString(), "0");
  });

  it("negativo: dos acuñaciones con el mismo nonce revierten (EIP-712 no da anti-replay)", async function () {
    const { auth, sigs } = await buildAuthorization(f, {});
    await f.issuance.send("mint", [auth, sigs, 500, H.b32("op_mint_a")], f.board);
    await H.expectRevert(
      f.issuance.send("mint", [auth, sigs, 400, H.b32("op_mint_b")], f.board),
      "NonceAlreadyUsed"
    );
    assert.equal((await f.assetNew.call("totalSupply")).toString(), "500");
  });

  it("negativo: una autorización vencida revierte", async function () {
    const ts = await H.now();
    const { auth, sigs } = await buildAuthorization(f, { expiry: ts + 60, nonce: H.b32("nonce_exp") });
    await H.increaseTime(120);
    await H.expectRevert(
      f.issuance.send("mint", [auth, sigs, 100, H.b32("op_mint_exp")], f.board),
      "AuthorizationExpired"
    );
  });

  it("negativo: quemar NO renueva la autorización agotada", async function () {
    const { auth, sigs } = await buildAuthorization(f, { amount: 1000 });
    await f.issuance.send("mint", [auth, sigs, 1000, H.b32("op_mint_full")], f.board);
    await f.assetNew.send("burn", [f.treasury, 1000, H.b32("REASON_TEST"), H.b32("op_burn_1")], f.board);
    assert.equal((await f.assetNew.call("totalSupply")).toString(), "0");

    // Mismo sobre: el nonce ya se consumió.
    await H.expectRevert(
      f.issuance.send("mint", [auth, sigs, 1000, H.b32("op_mint_again")], f.board),
      "NonceAlreadyUsed"
    );
    // Mismo authorizationId con nonce nuevo: el acumulado de esa autorización ya está lleno.
    const renewed = await buildAuthorization(f, { amount: 1000, nonce: H.b32("nonce_0002") });
    await H.expectRevert(
      f.issuance.send("mint", [renewed.auth, renewed.sigs, 1000, H.b32("op_mint_again2")], f.board),
      "AuthorizationAmountExceeded"
    );
  });

  it("negativo: el cap acumulado de emisión no se recupera al quemar (cap de flujo != cap de stock)", async function () {
    await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 5000, 1000], f.board);
    const a1 = await buildAuthorization(f, { amount: 1000 });
    await f.issuance.send("mint", [a1.auth, a1.sigs, 1000, H.b32("op_c1")], f.board);
    await f.assetNew.send("burn", [f.treasury, 1000, H.b32("REASON_TEST"), H.b32("op_cb")], f.board);
    // El stock volvió a cero, pero la emisión acumulada sigue en 1000 = cap.
    const a2 = await buildAuthorization(f, {
      authorizationId: H.b32("auth_0002"),
      nonce: H.b32("nonce_0003"),
      amount: 500,
    });
    await H.expectRevert(
      f.issuance.send("mint", [a2.auth, a2.sigs, 500, H.b32("op_c2")], f.board),
      "CumulativeIssuanceCapExceeded"
    );
    assert.equal((await f.issuance.call("cumulativeIssued", [f.ASSET_NEW])).toString(), "1000");
  });

  it("negativo: outstanding + reservas concurrentes no superan el límite del instrumento", async function () {
    await f.issuance.send("setInstrumentLimits", [f.ASSET_NEW, 1000, 100000], f.board);
    await f.issuance.send("openIssuanceReserve", [f.ASSET_NEW, H.b32("res_1"), 600], f.board);
    const { auth, sigs } = await buildAuthorization(f, { amount: 1000 });
    await H.expectRevert(
      f.issuance.send("mint", [auth, sigs, 500, H.b32("op_res")], f.board),
      "OutstandingLimitExceeded"
    );
    // Con 400 sí cabe: 0 outstanding + 600 reservado + 400 = 1000.
    await f.issuance.send("mint", [auth, sigs, 400, H.b32("op_res_ok")], f.board);
    assert.equal((await f.assetNew.call("totalSupply")).toString(), "400");
  });

  it("negativo: sin límites fijados devuelve BLOCKED_DECISION en vez de inventar un tope", async function () {
    const other = H.b32("SFSP:SEC:ISS9:S9");
    await H.expectRevert(
      f.issuance.send("openIssuanceReserve", [other, H.b32("res_x"), 1], f.board),
      "LimitsNotFixed"
    );
  });

  it("negativo: firmas por debajo del quórum revierten", async function () {
    const { auth, sigs } = await buildAuthorization(f, { signers: [f.signers[0]] });
    await H.expectRevert(
      f.issuance.send("mint", [auth, sigs, 100, H.b32("op_q")], f.board),
      "QuorumNotReached"
    );
  });
});
