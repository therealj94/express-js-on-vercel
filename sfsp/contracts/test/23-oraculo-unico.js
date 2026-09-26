"use strict";
/* SFSP v0.3 §10.5 · Oráculo único del oro (y de la plata).
 * Un solo registro alimenta ORIGEN (gramin), AUKA (onza) y la liquidación de
 * AGKA (ratio oro/plata). Todos los números son sintéticos: ninguno es una
 * recomendación de edad máxima ni de tolerancia (la Junta no las ha fijado). */
const assert = require("node:assert/strict");
const H = require("./helpers");

const XAU = H.b32("XAU");
const XAG = H.b32("XAG");
const ST = { OK: 0, NO_DATA: 1, STALE: 2, DEVIATION: 3, BLOCKED_DECISION: 4 };
const CODE = { ALLOW: 0, UNKNOWN_SOURCE: 8, BLOCKED_DECISION: 9 };
const E18 = 10n ** 18n;
// Precios sintéticos, USD por onza troy fina con 8 decimales.
const ORO = 443333000000n; // 4.433,33
const PLATA = 5000000000n; // 50,00
// Parámetros de PRUEBA (no recomendados): 600 s y 2 %.
const EDAD = 600;
const TOL = 200;

async function desplegar() {
  const acc = await H.accounts();
  const board = acc[0];
  const pubA = acc[9];
  const pubB = acc[10];
  const extraño = acc[11];
  const o = await H.deploy("SFSPOracleRegistry", [board], board);
  const rol = await o.call("ORACLE_PUBLISHER");
  await o.send("grantRole", [rol, pubA], board);
  await o.send("grantRole", [rol, pubB], board);
  return { o, board, pubA, pubB, extraño };
}

/** Parámetros y un precio aceptado (dos publicadores distintos). */
async function conPrecio(x, metal, precio) {
  await x.o.send("setParameters", [metal, EDAD, TOL], x.board);
  let t = await H.now();
  await x.o.send("publish", [metal, String(precio), t], x.pubA);
  await H.increaseTime(1);
  t = await H.now();
  await x.o.send("publish", [metal, String(precio), t], x.pubB);
}

describe("SFSP v0.3 §10.5 · oráculo único (SFSPOracleRegistry)", function () {
  let x;
  beforeEach(async function () {
    x = await desplegar();
  });

  it("negativo: sin edad máxima ni tolerancia fijadas, BLOCKED_DECISION y precio 0", async function () {
    const r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.BLOCKED_DECISION);
    assert.equal(r.price.toString(), "0");
    await H.expectRevert(x.o.send("publish", [XAU, String(ORO), await H.now()], x.pubA), "OracleBlocked");
    await H.expectRevert(x.o.call("latestOrRevert", [XAU]), "OracleBlocked");
  });

  it("negativo: sólo publica quien tiene ORACLE_PUBLISHER, y sólo la Junta fija parámetros", async function () {
    await H.expectRevert(x.o.send("setParameters", [XAU, EDAD, TOL], x.pubA), "Unauthorized");
    await x.o.send("setParameters", [XAU, EDAD, TOL], x.board);
    await H.expectRevert(x.o.send("publish", [XAU, String(ORO), await H.now()], x.extraño), "Unauthorized");
    await H.expectRevert(x.o.send("publish", [H.b32("XPT"), String(ORO), await H.now()], x.pubA), "UnknownMetal");
  });

  it("adversario: el primer precio queda en cuarentena y el mismo publicador no se confirma a sí mismo", async function () {
    await x.o.send("setParameters", [XAU, EDAD, TOL], x.board);
    await x.o.send("publish", [XAU, String(ORO), await H.now()], x.pubA);
    let r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.DEVIATION);
    assert.equal(r.price.toString(), "0", "sin confirmar no hay precio");
    await H.increaseTime(1);
    await x.o.send("publish", [XAU, String(ORO), await H.now()], x.pubA);
    r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.DEVIATION, "un publicador no es dos fuentes");
    await H.increaseTime(1);
    await x.o.send("publish", [XAU, String(ORO + 1000n), await H.now()], x.pubB);
    r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.OK);
    assert.equal(r.price.toString(), String(ORO + 1000n));
    assert.equal(Number(r.round), 3);
  });

  it("positivo: cada precio lleva su marca de tiempo; no se aceptan futuros ni repetidos", async function () {
    await conPrecio(x, XAU, ORO);
    const r = await x.o.call("latest", [XAU]);
    const ronda = await x.o.call("roundOf", [XAU, r.round]);
    assert.equal(ronda.observedAt.toString(), r.observedAt.toString());
    assert.equal(ronda.publisher.toLowerCase(), x.pubB.toLowerCase());
    await H.expectRevert(x.o.send("publish", [XAU, String(ORO), (await H.now()) + 100], x.pubA), "InvalidPublication");
    await H.expectRevert(x.o.send("publish", [XAU, String(ORO), Number(r.observedAt)], x.pubA), "InvalidPublication");
    await H.expectRevert(x.o.send("publish", [XAU, "0", await H.now()], x.pubA), "InvalidPublication");
  });

  it("adversario (oráculo viejo): pasada la edad máxima, STALE y precio 0, nunca el último valor", async function () {
    await conPrecio(x, XAU, ORO);
    assert.equal(Number((await x.o.call("latest", [XAU])).status), ST.OK);
    await H.increaseTime(EDAD + 5);
    const r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.STALE);
    assert.equal(r.price.toString(), "0");
    await H.expectRevert(x.o.call("latestOrRevert", [XAU]), "OracleNotFresh");
    assert.equal(Number(await x.o.call("codeOf", [ST.STALE])), CODE.UNKNOWN_SOURCE);
    const g = await x.o.call("graminPriceUsd");
    assert.equal(Number(g.status), ST.STALE);
    assert.equal(g.price.toString(), "0");
  });

  it("adversario: un salto mayor que la tolerancia suspende la lectura hasta que otro publicador lo confirme", async function () {
    await conPrecio(x, XAU, ORO);
    await H.increaseTime(1);
    const salto = (ORO * 110n) / 100n; // +10 % con tolerancia de 2 %
    await x.o.send("publish", [XAU, String(salto), await H.now()], x.pubA);
    let r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.DEVIATION);
    assert.equal(r.price.toString(), "0");
    // Un precio normal de nuevo, dentro de tolerancia del último ACEPTADO, se acepta.
    await H.increaseTime(1);
    await x.o.send("publish", [XAU, String(ORO + 5000n), await H.now()], x.pubA);
    r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.OK);
    // Un nivel nuevo confirmado por DOS publicadores distintos sí se acepta.
    await H.increaseTime(1);
    await x.o.send("publish", [XAU, String(salto), await H.now()], x.pubA);
    await H.increaseTime(1);
    await x.o.send("publish", [XAU, String(salto + 100n), await H.now()], x.pubB);
    r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.OK);
    assert.equal(r.price.toString(), String(salto + 100n));
  });

  it("positivo: 1 onza troy = 31,1035 g = 1.710,6925 gramin, con redondeo hacia abajo", async function () {
    assert.equal((await x.o.call("goldOuncesToGramin", [String(E18)])).toString(), String(17106925n * E18 / 10000n));
    // Una unidad base de onza no da 1.710,69 unidades base de gramin: da 1.710.
    assert.equal((await x.o.call("goldOuncesToGramin", ["1"])).toString(), "1710");
    assert.equal((await x.o.call("gramsToGramin", [String(E18)])).toString(), String(55n * E18));
    assert.equal((await x.o.call("GRAMIN_PER_OZ_NUM")).toString(), "17106925");
    assert.equal((await x.o.call("GRAMIN_PER_OZ_DEN")).toString(), "10000");
  });

  it("positivo: el precio del gramin sale de la MISMA lectura del oro que AUKA", async function () {
    await conPrecio(x, XAU, ORO);
    const oro = await x.o.call("latest", [XAU]);
    const g = await x.o.call("graminPriceUsd");
    assert.equal(Number(g.status), ST.OK);
    assert.equal(g.round.toString(), oro.round.toString(), "misma ronda");
    assert.equal(g.price.toString(), String((ORO * 10000n) / 17106925n));
  });

  it("positivo: ratio oro/plata y conversión de AGKA a gramin con las dos lecturas vigentes", async function () {
    await conPrecio(x, XAU, ORO);
    await conPrecio(x, XAG, PLATA);
    const r = await x.o.call("goldSilverRatio");
    assert.equal(Number(r.status), ST.OK);
    assert.equal(r.ratio1e18.toString(), String((ORO * E18) / PLATA));
    const c = await x.o.call("silverOuncesToGramin", [String(E18)]);
    assert.equal(c.gramin1e18.toString(), String((E18 * PLATA * 17106925n) / (ORO * 10000n)));
  });

  it("adversario: sin lectura fresca de la plata no hay ratio ni conversión de AGKA", async function () {
    await conPrecio(x, XAG, PLATA);
    await conPrecio(x, XAU, ORO);
    await x.o.send("setParameters", [XAG, 10, TOL], x.board); // la plata caduca antes
    await H.increaseTime(30);
    const r = await x.o.call("goldSilverRatio");
    assert.equal(Number(r.status), ST.STALE);
    assert.equal(r.ratio1e18.toString(), "0");
    await H.expectRevert(x.o.call("silverOuncesToGramin", [String(E18)]), "OracleNotFresh");
  });

  it("negativo: limpiar los parámetros vuelve a BLOCKED_DECISION, no deja el último precio", async function () {
    await conPrecio(x, XAU, ORO);
    await x.o.send("clearParameters", [XAU, H.b32("REVISION_JUNTA")], x.board);
    const r = await x.o.call("latest", [XAU]);
    assert.equal(Number(r.status), ST.BLOCKED_DECISION);
    assert.equal(r.price.toString(), "0");
    assert.equal(Number(await x.o.call("codeOf", [ST.BLOCKED_DECISION])), CODE.BLOCKED_DECISION);
  });
});
