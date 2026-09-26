"use strict";
/* SFSP v0.3 §10.4 · Tesorería cotizadora de ORIGEN (SFSPTreasuryDesk).
 * Los cinco controles: diferencial ≥ mercado, frescura con tolerancia, límite
 * por identidad y ventana, inventario publicado por ventana y asimetría.
 * Todos los parámetros son de PRUEBA: los reales los fija la Junta (v0.3 §18). */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const C = require("./commodities");

const E18 = C.E18;
const SELLS = 0; // la tesorería vende ORIGEN
const BUYS = 1; // la tesorería compra ORIGEN
const REF = (C.ORO * 10000n) / 17106925n; // precio del gramin, USD con 8 decimales

const PARAMS = {
  set: false,
  buySpreadBps: 100,
  sellSpreadBps: 150,
  maxOracleAge: 120,
  window: 600,
  perIdentityLimit: String(10n * E18),
  sellInventory: String(15n * E18),
  buyInventory: String(8n * E18),
  identityPurpose: F.PURPOSE_BASE,
  version: 0,
};

async function montar() {
  const f = await F.deployAll();
  const acc = f.acc;
  const x = { f, board: f.board, pubA: acc[9], pubB: acc[10], fondeador: acc[16], alice2: acc[17] };
  x.o = await C.oraculo(x.board, x.pubA, x.pubB);
  x.d = await H.deploy(
    "SFSPTreasuryDesk",
    [x.board, f.governance.address, f.identity.address, x.o.address, C.ASSET_ORIGEN],
    x.board,
  );
  for (const rol of ["TECH_OPS", "ISSUER"]) await x.d.send("grantRole", [await x.d.call(rol), x.board], x.board);
  await x.d.send("grantRole", [await x.d.call("TECH_OPS"), x.fondeador], x.board);
  await x.d.sendValue("fund", [], x.fondeador, 20n * E18);

  // Identidad: compromisos por propósito con claim vigente. La segunda dirección
  // de Alice queda atada al MISMO compromiso (misma persona, otra billetera).
  x.cAlice = F.compromiso(F.SUBJ.alice, F.PURPOSE_BASE, F.SALT.alice);
  x.cBob = F.compromiso(F.SUBJ.bob, F.PURPOSE_BASE, F.SALT.bob);
  await f.identity.send("bindPurposeCommitment", [x.alice2, F.PURPOSE_BASE, x.cAlice], x.board);
  await F.atestar(f, { subjectCommitment: x.cAlice, purpose: F.PURPOSE_BASE, attestationId: H.b32("att_alice") });
  await F.atestar(f, { subjectCommitment: x.cBob, purpose: F.PURPOSE_BASE, attestationId: H.b32("att_bob") });
  return x;
}

async function ronda(x) {
  return (await x.d.call("quote", [SELLS, String(E18)])).oracleRound;
}

async function vender(x, to, commitment, amount, ref, round) {
  const r = round !== undefined ? round : await ronda(x);
  return x.d.send("sell", [to, commitment, String(amount), r, String(REF * 2n), H.b32(ref)], x.board);
}

describe("SFSP v0.3 §10.4 · tesorería cotizadora (SFSPTreasuryDesk)", function () {
  let x, f;
  beforeEach(async function () {
    x = await montar();
    f = x.f;
  });

  it("negativo: sin parámetros de la Junta no cotiza (BLOCKED_DECISION) y no vende", async function () {
    const q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.BLOCKED_DECISION);
    assert.equal(q.priceUsd.toString(), "0");
    await H.expectRevert(vender(x, f.alice, x.cAlice, E18, "p1", 0), "QuoteUnavailable(9");
    await H.expectRevert(x.d.send("setParameters", [PARAMS], x.fondeador), "Unauthorized");
  });

  it("control 1 · el diferencial no puede quedar por debajo del mercado; si el mercado lo supera, deja de cotizar", async function () {
    await x.d.send("observeMarketSpread", [200], x.board);
    await H.expectRevert(x.d.send("setParameters", [PARAMS], x.board), H.b32("SPREAD_BELOW_MARKET"));
    await x.d.send("observeMarketSpread", [50], x.board);
    await x.d.send("setParameters", [PARAMS], x.board);
    assert.equal(Number((await x.d.call("quote", [SELLS, String(E18)])).code), F.CODE.ALLOW);
    await x.d.send("observeMarketSpread", [160], x.board);
    const q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.DENY_POLICY);
    assert.equal(q.reason, H.b32("SPREAD_BELOW_MARKET"));
    await H.expectRevert(vender(x, f.alice, x.cAlice, E18, "p1"), "QuoteUnavailable(1");
  });

  it("control 5 · asimetría: compra y venta con diferenciales distintos contra la misma lectura", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    const v = await x.d.call("quote", [SELLS, String(2n * E18)]);
    const c = await x.d.call("quote", [BUYS, String(2n * E18)]);
    assert.equal(v.oracleRound.toString(), c.oracleRound.toString(), "misma lectura del oráculo único");
    assert.equal(v.priceUsd.toString(), String((REF * 10150n + 9999n) / 10000n));
    assert.equal(c.priceUsd.toString(), String((REF * 9900n) / 10000n));
    assert.ok(BigInt(v.priceUsd) - REF !== REF - BigInt(c.priceUsd), "los diferenciales difieren");
    assert.equal(v.usdAmount.toString(), String(BigInt(v.priceUsd) * 2n));
  });

  it("control 2 · adversario (arbitraje con referencia vieja): con la lectura fuera de tolerancia no cotiza", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    // Más vieja que la tolerancia de la tesorería aunque el oráculo aún la dé por buena.
    await H.increaseTime(130);
    let q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.UNKNOWN_SOURCE);
    assert.equal(q.reason, H.b32("ORACLE_STALE_FOR_DESK"));
    assert.equal(q.priceUsd.toString(), "0");
    await H.expectRevert(vender(x, f.alice, x.cAlice, E18, "p1", q.oracleRound), "QuoteUnavailable(8");
    // Más vieja que la edad máxima del propio oráculo.
    await H.increaseTime(C.EDAD);
    q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.UNKNOWN_SOURCE);
    assert.equal(q.reason, H.b32("ORACLE_NOT_OK"));
    // Un salto sin confirmar también suspende.
    await C.publicarAmbos(x.o, x.pubA, x.pubB, C.ORO, C.PLATA);
    await H.increaseTime(1);
    await x.o.send("publish", [C.XAU, String((C.ORO * 110n) / 100n), await H.now()], x.pubA);
    q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.UNKNOWN_SOURCE);
  });

  it("control 2 · adversario: quien cotizó con una lectura anterior no ejecuta contra la nueva", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    const vieja = await ronda(x);
    await C.publicarAmbos(x.o, x.pubA, x.pubB, C.ORO + 3000000000n, C.PLATA);
    await H.expectRevert(vender(x, f.alice, x.cAlice, E18, "p1", vieja), "RoundMismatch");
  });

  it("control 3 · adversario (evasión con varias direcciones): el límite es por identidad y ventana", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    const antes = await C.saldo(f.alice);
    const rec = await vender(x, f.alice, x.cAlice, 8n * E18, "p1");
    assert.equal((await C.saldo(f.alice)) - antes, 8n * E18);
    const ev = C.eventos(x.d, rec, "DeskTradeExecuted")[0];
    assert.equal(Number(ev.side), SELLS);
    assert.ok(!JSON.stringify(rec.logs).includes(x.cAlice.slice(2)), "el evento no publica el compromiso");
    // Otra dirección de la MISMA persona comparte el cupo.
    await H.expectRevert(vender(x, x.alice2, x.cAlice, 3n * E18, "p2"), "IdentityLimitExceeded");
    await vender(x, x.alice2, x.cAlice, 2n * E18, "p3");
    assert.equal((await x.d.call("identityUsed", [x.cAlice])).toString(), String(10n * E18));
    // Declarar el compromiso de otra persona no sirve: no está atado a esa dirección.
    await H.expectRevert(vender(x, x.alice2, x.cBob, E18, "p4"), "IdentityNotBound");
    await H.expectRevert(vender(x, f.mallory, x.cAlice, E18, "p5"), "IdentityNotBound");
    // Otra persona tiene su propio cupo.
    await vender(x, f.bob, x.cBob, E18, "p6");
  });

  it("control 4 · inventario publicado: agotado cierra hasta la ventana siguiente", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    await vender(x, f.alice, x.cAlice, 10n * E18, "p1");
    await vender(x, f.bob, x.cBob, 5n * E18, "p2");
    assert.equal((await x.d.call("inventoryRemaining", [SELLS])).toString(), "0");
    const q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.DENY_LIMIT);
    await H.expectRevert(vender(x, f.bob, x.cBob, E18, "p3", q.oracleRound), "QuoteUnavailable(6");
    // Ventana siguiente: inventario y cupos se renuevan (y hace falta lectura fresca).
    await H.increaseTime(PARAMS.window);
    await C.publicarAmbos(x.o, x.pubA, x.pubB, C.ORO, C.PLATA);
    assert.equal((await x.d.call("inventoryRemaining", [SELLS])).toString(), PARAMS.sellInventory);
    await vender(x, f.bob, x.cBob, E18, "p3");
  });

  it("positivo: la tesorería compra ORIGEN con precio mínimo protegido, dentro de su inventario de compra", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    const r = await ronda(x);
    const minimo = (REF * 9900n) / 10000n;
    await H.expectRevert(x.d.sendValue("buy", [x.cAlice, r, String(minimo + 1n)], f.alice, 2n * E18), "PriceMoved");
    const rec = await x.d.sendValue("buy", [x.cAlice, r, String(minimo)], f.alice, 2n * E18);
    const ev = C.eventos(x.d, rec, "DeskTradeExecuted")[0];
    assert.equal(Number(ev.side), BUYS);
    assert.equal(ev.usdAmount.toString(), String((2n * E18 * minimo) / E18));
    await H.expectRevert(x.d.sendValue("buy", [x.cAlice, r, "0"], f.alice, 7n * E18), "QuoteUnavailable(6");
  });

  it("negativo: la referencia de pago no se reutiliza y limpiar los parámetros vuelve a BLOCKED_DECISION", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    await vender(x, f.alice, x.cAlice, E18, "p1");
    await H.expectRevert(vender(x, f.alice, x.cAlice, E18, "p1"), "OperationReplay");
    await x.d.send("clearParameters", [H.b32("REVISION_JUNTA")], x.board);
    assert.equal(Number((await x.d.call("quote", [SELLS, String(E18)])).code), F.CODE.BLOCKED_DECISION);
    assert.equal(Number((await x.d.call("parameters")).version), 1, "la versión no se reinicia");
  });
});
