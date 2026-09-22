"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");

describe("SFSPFeeController · cotización versionada con TTL", function () {
  let f;
  const KEY = H.b32("FEE.TRANSFER.SEC");
  beforeEach(async function () { f = await F.deployAll(); });

  it("negativo: sin parámetro económico fijado devuelve BLOCKED_DECISION", async function () {
    const q = await f.fee.call("quote", [KEY]);
    assert.equal(Number(q[0]), F.CODE.BLOCKED_DECISION);
    assert.equal(q[2].toString(), "0", "no se cobra un número inventado");
  });

  it("positivo: con el parámetro fijado devuelve ALLOW, monto, moneda y expiración", async function () {
    await f.fee.send("setFeeParameter", [KEY, 250, H.b32("UNIT_TEST"), true, 600, 0], f.board);
    const q = await f.fee.call("quote", [KEY]);
    assert.equal(Number(q[0]), F.CODE.ALLOW);
    assert.equal(q[2].toString(), "250");
    assert.equal(q[3], H.b32("UNIT_TEST"));
    assert.equal(q[4], true, "gas patrocinado declarado");
    assert.ok(Number(q[5]) > (await H.now()));
    assert.equal(Number(q[6]), 1, "la cotización está versionada");
  });

  it("negativo: una cotización caducada devuelve UNKNOWN_SOURCE, no cero", async function () {
    await f.fee.send("setFeeParameter", [KEY, 250, H.b32("UNIT_TEST"), false, 60, 0], f.board);
    await H.increaseTime(120);
    const q = await f.fee.call("quote", [KEY]);
    assert.equal(Number(q[0]), F.CODE.UNKNOWN_SOURCE);
    assert.equal(q[2].toString(), "0");
  });

  it("positivo: la política de fallos REVIEW devuelve REVIEW_REQUIRED al caducar", async function () {
    await f.fee.send("setFeeParameter", [KEY, 250, H.b32("UNIT_TEST"), false, 60, 1], f.board);
    await H.increaseTime(120);
    const q = await f.fee.call("quote", [KEY]);
    assert.equal(Number(q[0]), F.CODE.REVIEW_REQUIRED);
  });

  it("negativo: limpiar el parámetro vuelve a BLOCKED_DECISION, no deja el último número", async function () {
    await f.fee.send("setFeeParameter", [KEY, 250, H.b32("UNIT_TEST"), false, 600, 0], f.board);
    await f.fee.send("clearFeeParameter", [KEY, H.b32("MOTIVO_TEST")], f.board);
    const q = await f.fee.call("quote", [KEY]);
    assert.equal(Number(q[0]), F.CODE.BLOCKED_DECISION);
  });
});
