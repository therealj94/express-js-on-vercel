"use strict";
/* SFSP v0.3 §10.4 · Tesorería cotizadora de ORIGEN (SFSPTreasuryDesk).
 * Los cinco controles: diferencial ≥ mercado, frescura con tolerancia, límite
 * por identidad y ventana, inventario publicado por ventana y asimetría.
 * Vender ORIGEN desde la tesorería es SUSCRIBIR en primaria (SFSP-120 §0.5
 * regla 3): el comprador pasa SUBSCRIBE. El límite por identidad lo agrega
 * Genesis ID fuera de la cadena y trae aquí el resultado por dirección (v0.3
 * §11). Cada lado exige los módulos de licencia que declare la Junta.
 * Todos los parámetros son de PRUEBA: los reales los fija la Junta (v0.3 §18). */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const C = require("./commodities");
const V = require("./v03");

const E18 = C.E18;
const SELLS = 0; // la tesorería vende ORIGEN
const BUYS = 1; // la tesorería compra ORIGEN
const REF = (C.ORO * 10000n) / 17106925n; // precio del gramin, USD con 8 decimales

const PARAMS = {
  set: false,
  buySpreadBps: 100,
  sellSpreadBps: 150,
  maxOracleAge: 120,
  maxMarketSpreadAge: 86400, // un día, de PRUEBA
  window: 600,
  perIdentityLimit: String(10n * E18),
  sellInventory: String(15n * E18),
  buyInventory: String(8n * E18),
  identityPurpose: F.PURPOSE_BASE,
  version: 0,
};

// Módulos sintéticos de cada lado (la Junta decide los reales, SFSP-140 §3.2).
const MOD_VENTA = [H.b32("MOD_DEPOSITOS"), H.b32("MOD_MERCADO_HIBRIDO"), H.b32("MOD_COLOCACION_PRIVADA")];
const MOD_COMPRA = [H.b32("MOD_RED_PAGOS_OG")];

async function montar(o) {
  const op = o || {};
  const f = await F.deployAll();
  const acc = f.acc;
  const x = { f, board: f.board, pubA: acc[9], pubB: acc[10], fondeador: acc[16], alice2: acc[17] };
  x.o = await C.oraculo(x.board, x.pubA, x.pubB);
  x.d = await H.deploy(
    "SFSPTreasuryDesk",
    [x.board, f.governance.address, f.identity.address, f.engine.address, x.o.address, C.ASSET_ORIGEN],
    x.board,
  );
  for (const rol of ["TECH_OPS", "ISSUER", "LIMIT_OPERATOR"]) await x.d.send("grantRole", [await x.d.call(rol), x.board], x.board);
  await x.d.send("grantRole", [await x.d.call("TECH_OPS"), x.fondeador], x.board);
  await x.d.sendValue("fund", [], x.fondeador, 20n * E18);
  // Control 1: la operación observa el diferencial del mercado (valor de PRUEBA).
  if (!op.sinMercado) await x.d.send("observeMarketSpread", [50], x.board);

  // Licencias: compuerta de prueba con los módulos de cada lado habilitados.
  x.gate = await H.deploy("SFSPCompuertaLicenciaDePrueba", [], x.board);
  for (const m of [...MOD_VENTA, ...MOD_COMPRA]) await x.gate.send("set", [m, true], x.board);
  await x.d.send("setLicenseGate", [x.gate.address], x.board);
  await x.d.send("setRequiredModules", [SELLS, MOD_VENTA], x.board);
  await x.d.send("setRequiredModules", [BUYS, MOD_COMPRA], x.board);

  // ORIGEN en el catálogo y, para vender, SUBSCRIBE: alice (dos direcciones) y bob suscriben.
  await f.registry.send("registerAsset", [F.passport(C.ASSET_ORIGEN)], x.board);

  // Identidad: compromisos por propósito con claim vigente. La segunda dirección
  // de Alice queda atada al MISMO compromiso (misma persona, otra billetera).
  x.cAlice = F.compromiso(F.SUBJ.alice, F.PURPOSE_BASE, F.SALT.alice);
  x.cBob = F.compromiso(F.SUBJ.bob, F.PURPOSE_BASE, F.SALT.bob);
  await f.identity.send("bindPurposeCommitment", [x.alice2, F.PURPOSE_BASE, x.cAlice], x.board);
  await F.atestar(f, { subjectCommitment: x.cAlice, purpose: F.PURPOSE_BASE, attestationId: H.b32("att_alice"), duracion: 30 * 86400 });
  await F.atestar(f, { subjectCommitment: x.cBob, purpose: F.PURPOSE_BASE, attestationId: H.b32("att_bob"), duracion: 30 * 86400 });
  await V.habilitarSuscripcion(f, [C.ASSET_ORIGEN], [f.alice, x.alice2, f.bob], [x.d.address]);
  return x;
}

async function ronda(x) {
  return (await x.d.call("quote", [SELLS, String(E18)])).oracleRound;
}

/** Genesis ID trae lo que le queda a la IDENTIDAD de `to` en esta ventana. */
async function resultado(x, to, side, restante) {
  return x.d.send("recordLimitClearance", [to, side, String(restante)], x.board);
}

async function vender(x, to, amount, ref, round) {
  const r = round !== undefined ? round : await ronda(x);
  // Contexto vacío: la residencia se prueba por la ruta sin contexto (por país).
  return x.d.send("sell", [to, String(amount), r, String(REF * 2n), H.b32(ref), V.ctxSuscripcion({})], x.board);
}

/** Vende con el resultado de Genesis ID ya registrado para `to` (todo su límite). */
async function venderConLimite(x, to, amount, ref, round) {
  await resultado(x, to, SELLS, PARAMS.perIdentityLimit);
  return vender(x, to, amount, ref, round);
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
    await H.expectRevert(vender(x, f.alice, E18, "p1", 0), "QuoteUnavailable(9");
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
    await H.expectRevert(vender(x, f.alice, E18, "p1"), "QuoteUnavailable(1");
  });

  it("control 1 · adversario (mercado sin observar o viejo): sin una observación reciente del mercado no cotiza", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    assert.equal(Number((await x.d.call("quote", [SELLS, String(E18)])).code), F.CODE.ALLOW);
    // Nadie vuelve a observar el mercado: pasada su edad máxima la tesorería deja de cotizar
    // (el mercado pudo ensancharse por encima de su diferencial sin que nadie lo registre).
    await H.increaseTime(PARAMS.maxMarketSpreadAge + 1);
    await C.publicarAmbos(x.o, x.pubA, x.pubB, C.ORO, C.PLATA);
    let q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.UNKNOWN_SOURCE);
    assert.equal(q.reason, H.b32("MARKET_SPREAD_STALE"));
    assert.equal(q.priceUsd.toString(), "0");
    await H.expectRevert(vender(x, f.alice, E18, "p1", q.oracleRound), "QuoteUnavailable(8");
    await H.expectRevert(x.d.sendValue("buy", [q.oracleRound, "0"], f.alice, E18), "QuoteUnavailable(8");
    await x.d.send("observeMarketSpread", [50], x.board);
    q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.ALLOW);
    // Sin edad máxima de la observación, los parámetros no se aceptan.
    await H.expectRevert(x.d.send("setParameters", [Object.assign({}, PARAMS, { maxMarketSpreadAge: 0 })], x.board), H.b32("ZERO"));
  });

  it("control 1 · negativo: una tesorería que nunca observó el mercado no cotiza", async function () {
    const y = await montar({ sinMercado: true });
    await y.d.send("setParameters", [PARAMS], y.board);
    const q = await y.d.call("quote", [BUYS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.UNKNOWN_SOURCE);
    assert.equal(q.reason, H.b32("MARKET_SPREAD_STALE"));
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
    await H.expectRevert(vender(x, f.alice, E18, "p1", q.oracleRound), "QuoteUnavailable(8");
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
    await H.expectRevert(vender(x, f.alice, E18, "p1", vieja), "RoundMismatch");
  });

  it("control 3 · adversario (evasión con varias direcciones): el límite es por identidad y ventana, sin identidad en la cadena", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    // Sin el resultado de Genesis ID no se sabe cuánto le queda: UNKNOWN_SOURCE, nunca cero.
    await V.revertCon(vender(x, f.alice, E18, "p0"), x.d, "IdentityLimitUnknown");
    await resultado(x, f.alice, SELLS, 10n * E18);
    const antes = await C.saldo(f.alice);
    const rec = await vender(x, f.alice, 8n * E18, "p1");
    assert.equal((await C.saldo(f.alice)) - antes, 8n * E18);
    const ev = C.eventos(x.d, rec, "DeskTradeExecuted")[0];
    assert.equal(Number(ev.side), SELLS);
    // Ni la venta ni el resultado llevan un compromiso de la identidad.
    const entradasVenta = x.d.abi.find((a) => a.name === "sell").inputs.map((i) => i.name);
    // Ningún bytes32 del sujeto: el contexto de la suscripción lleva país, sal por
    // dirección, operación y costo, nunca un compromiso de la identidad.
    assert.deepEqual(entradasVenta, ["to", "origenAmount", "expectedRound", "maxPriceUsd", "paymentRef", "ctx"]);
    assert.ok(!x.d.abi.some((a) => a.name === "identityUsed"), "no hay agregado por identidad en la cadena");
    // Otra dirección de la MISMA persona: Genesis ID trae lo que le queda a la
    // identidad (2), no un cupo nuevo.
    await resultado(x, x.alice2, SELLS, 2n * E18);
    await H.expectRevert(vender(x, x.alice2, 3n * E18, "p2"), "IdentityLimitExceeded");
    await vender(x, x.alice2, 2n * E18, "p3");
    assert.equal((await x.d.call("limitClearanceOf", [x.alice2, SELLS])).toString(), "0");
    assert.equal((await x.d.call("accountUsed", [x.alice2])).toString(), String(2n * E18));
    // Una dirección sin alta en el propósito no opera; y el resultado sólo lo registra el operador.
    await resultado(x, f.mallory, SELLS, E18);
    await H.expectRevert(vender(x, f.mallory, E18, "p5"), "IdentityNotBound");
    await H.expectRevert(x.d.send("recordLimitClearance", [f.bob, SELLS, String(E18)], f.bob), "Unauthorized");
    // Nunca más que el límite por identidad, ni aunque el operador lo registrara.
    await H.expectRevert(resultado(x, f.bob, SELLS, 11n * E18), "InvalidParams");
    // Otra persona tiene su propio cupo.
    await venderConLimite(x, f.bob, E18, "p6");
  });

  it("SFSP-120 §0.5 regla 3 · la puerta única: vender ORIGEN a un residente SOLO_ENTRANTE se rechaza (T-500-25)", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    const carol = f.acc[11];
    const cCarol = F.compromiso(H.b32("subj_carol"), F.PURPOSE_BASE, H.b32("salt_carol"));
    await f.identity.send("bindPurposeCommitment", [carol, F.PURPOSE_BASE, cCarol], x.board);
    await F.atestar(f, { subjectCommitment: cCarol, purpose: F.PURPOSE_BASE, attestationId: H.b32("att_carol"), duracion: 30 * 86400 });
    await V.acreditarResidencia(f, carol, H.b32("HN"), "carol");
    await resultado(x, carol, SELLS, E18);
    const antes = await C.saldo(carol);
    await V.revertCon(vender(x, carol, E18, "p_carol"), f.engine, "SubscriptionRejected");
    assert.equal(await C.saldo(carol), antes);
    // Sin el rol de ejecutor en el motor, la tesorería tampoco vende a quien sí suscribe.
    await f.engine.send("revokeRole", [await f.engine.call("SUBSCRIPTION_EXECUTOR"), x.d.address], x.board);
    await H.expectRevert(venderConLimite(x, f.alice, E18, "p_sin_rol"), "Unauthorized");
  });

  it("licencias (v0.3 §13.3): sin módulos declarados no cotiza; con uno no habilitado, LICENCIA_NO_OTORGADA", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    await x.gate.send("set", [MOD_VENTA[1], false], x.board);
    let q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.DENY_AUTHORIZATION);
    assert.equal(q.reason, H.b32("LICENCIA_NO_OTORGADA"));
    await H.expectRevert(venderConLimite(x, f.alice, E18, "p1", q.oracleRound), "QuoteUnavailable(5");
    // El otro lado depende de su propio módulo.
    assert.equal(Number((await x.d.call("quote", [BUYS, String(E18)])).code), F.CODE.ALLOW);
    // Un despliegue sin módulos declarados por la Junta: BLOCKED_DECISION.
    const d2 = await H.deploy(
      "SFSPTreasuryDesk",
      [x.board, f.governance.address, f.identity.address, f.engine.address, x.o.address, C.ASSET_ORIGEN],
      x.board,
    );
    await d2.send("setParameters", [PARAMS], x.board);
    q = await d2.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.BLOCKED_DECISION);
    assert.equal(q.reason, H.b32("LICENSE_MODULES_UNSET"));
    await d2.send("setRequiredModules", [SELLS, MOD_VENTA], x.board);
    q = await d2.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.DENY_AUTHORIZATION, "sin compuerta de licencias no cotiza");
    await H.expectRevert(d2.send("setRequiredModules", [SELLS, []], x.board), "InvalidParams");
    await H.expectRevert(d2.send("setRequiredModules", [SELLS, MOD_VENTA], f.alice), "Unauthorized");
  });

  it("control 4 · inventario publicado: agotado cierra hasta la ventana siguiente", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    await venderConLimite(x, f.alice, 10n * E18, "p1");
    await venderConLimite(x, f.bob, 5n * E18, "p2");
    assert.equal((await x.d.call("inventoryRemaining", [SELLS])).toString(), "0");
    const q = await x.d.call("quote", [SELLS, String(E18)]);
    assert.equal(Number(q.code), F.CODE.DENY_LIMIT);
    await H.expectRevert(vender(x, f.bob, E18, "p3", q.oracleRound), "QuoteUnavailable(6");
    // Ventana siguiente: inventario y cupos se renuevan (y hace falta lectura fresca).
    await H.increaseTime(PARAMS.window);
    await C.publicarAmbos(x.o, x.pubA, x.pubB, C.ORO, C.PLATA);
    assert.equal((await x.d.call("inventoryRemaining", [SELLS])).toString(), PARAMS.sellInventory);
    // El resultado de Genesis ID es de la ventana en que se registró.
    await V.revertCon(vender(x, f.bob, E18, "p3"), x.d, "IdentityLimitUnknown");
    await venderConLimite(x, f.bob, E18, "p3b");
  });

  it("positivo: la tesorería compra ORIGEN con precio mínimo protegido, dentro de su inventario de compra", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    const r = await ronda(x);
    const minimo = (REF * 9900n) / 10000n;
    await resultado(x, f.alice, BUYS, 10n * E18);
    await H.expectRevert(x.d.sendValue("buy", [r, String(minimo + 1n)], f.alice, 2n * E18), "PriceMoved");
    const rec = await x.d.sendValue("buy", [r, String(minimo)], f.alice, 2n * E18);
    const ev = C.eventos(x.d, rec, "DeskTradeExecuted")[0];
    assert.equal(Number(ev.side), BUYS);
    assert.equal(ev.usdAmount.toString(), String((2n * E18 * minimo) / E18));
    await H.expectRevert(x.d.sendValue("buy", [r, "0"], f.alice, 7n * E18), "QuoteUnavailable(6");
  });

  it("negativo: la referencia de pago no se reutiliza y limpiar los parámetros vuelve a BLOCKED_DECISION", async function () {
    await x.d.send("setParameters", [PARAMS], x.board);
    await venderConLimite(x, f.alice, E18, "p1");
    await H.expectRevert(vender(x, f.alice, E18, "p1"), "OperationReplay");
    await x.d.send("clearParameters", [H.b32("REVISION_JUNTA")], x.board);
    assert.equal(Number((await x.d.call("quote", [SELLS, String(E18)])).code), F.CODE.BLOCKED_DECISION);
    assert.equal(Number((await x.d.call("parameters")).version), 1, "la versión no se reinicia");
  });
});
