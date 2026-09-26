"use strict";
/* v0.3 §14.3 / REV-410-17 · Migración a la misma dirección por cupo del padrón.
 *
 * Genera el lote con `migracion-410/lote-migracion.mjs` a partir de un censo
 * SINTÉTICO versionado (`migracion-410/sintetico/`), y lo ejecuta en la cadena
 * hardhat en memoria con `simular-lote-migracion.cjs`. Ninguna dirección es real. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const hre = require("hardhat");
const H = require("./helpers");
const OA = require("./orden-autorizada");

const MIG = path.join(__dirname, "..", "..", "migracion-410");
const leer = (n) => JSON.parse(fs.readFileSync(path.join(MIG, "sintetico", n), "utf8"));
const { simularLote } = require(path.join(MIG, "simular-lote-migracion.cjs"));

const VENTANA = { validUntil: 1790600000, ordenNoAntes: 1790400000, ordenVence: 1790500000 };
const EMISOR = "0x5157000000000000000000000000000000000e00";

describe("v0.3 §14.3 · migración por cupo del padrón (datos sintéticos)", function () {
  let G, censo, activos, internas, lotes;
  before(async function () {
    G = await import(path.join(MIG, "lote-migracion.mjs"));
    censo = leer("censo-tokens-sintetico.json");
    activos = leer("activos-sintetico.json");
    internas = leer("internas-sintetico.json");
    lotes = G.generarLotes(censo, activos, { internas, emisor: EMISOR, ...VENTANA });
  });
  const lote = (a) => lotes.find((l) => l.activo === a);

  it("excluye internas (censo y lista), contratos, pendientes y el residuo sin titular, con su motivo", function () {
    const a = lote("SINTA");
    assert.equal(a.estado, "GENERADO");
    const dest = a.llamadas.map((c) => c.address).sort();
    assert.deepEqual(dest, [
      "0x51570000000000000000000000000000000000a1",
      "0x51570000000000000000000000000000000000a2",
      "0x51570000000000000000000000000000000000a3",
    ]);
    const motivos = Object.fromEntries(a.excluidas.map((x) => [x.address.toLowerCase(), x.motivo]));
    assert.match(motivos["0x51570000000000000000000000000000000000f1"], /interna/);
    assert.match(motivos["0x51570000000000000000000000000000000000a4"], /interna/);
    assert.match(motivos["0x51570000000000000000000000000000000000c1"], /contrato/);
    assert.match(motivos["0x51570000000000000000000000000000000000e1"], /pendiente/);
    assert.ok(a.excluidas.some((x) => x.address.startsWith("ranura:") && /residuo/.test(x.motivo)));
    assert.equal(a.conciliacionCenso.cuadra, true, "suma del censo + residuo = totalSupply");
  });

  it("S0 = suma de los montos; máx/op = el mayor; termsDocRoot = documento DBNX; evidenceRoot = raíz del padrón", function () {
    const a = lote("SINTA");
    const suma = a.llamadas.reduce((s, c) => s + BigInt(c.monto), 0n);
    assert.equal(BigInt(a.S0), suma);
    assert.equal(a.S0, (850n * 10n ** 18n + 5n * 10n ** 17n).toString());
    assert.equal(a.maxPorOperacion, (500n * 10n ** 18n).toString());
    assert.equal(a.orden.payload.amount, a.S0);
    assert.equal(a.orden.payload.amountSecondary, a.maxPorOperacion);
    // v0.3 §5 · el documento de respaldo del cupo es la aprobación DBNX, cuya
    // regla de destino es la raíz del padrón y cuya cantidad es S0.
    assert.equal(a.orden.termsDocRoot, activos["0x5157000000000000000000000000000000000a01"].dbnxDocHash);
    assert.equal(a.solicitudDbnx.destino, a.raizPadron);
    assert.equal(a.solicitudDbnx.cantidad, a.S0);
    assert.equal(a.solicitudDbnx.migracion, true);
    for (const c of a.llamadas) assert.equal(c.mintOnDemand.args.evidenceRoot, a.raizPadron);
    // La raíz es la de SFSP-700: cada hoja verifica con su prueba.
    for (const c of a.llamadas) {
      let x = c.hoja;
      for (const s of c.prueba) x = H.keccak256(BigInt(x) <= BigInt(s) ? Buffer.concat([Buffer.from(x.slice(2), "hex"), Buffer.from(s.slice(2), "hex")]) : Buffer.concat([Buffer.from(s.slice(2), "hex"), Buffer.from(x.slice(2), "hex")]));
      assert.equal(x, a.raizPadron);
    }
  });

  it("paymentRef = keccak256(utf8(\"MIGRACION|<assetId minúsculas>|<dirección minúsculas>\")), aunque el censo traiga mayúsculas", function () {
    const a = lote("SINTA");
    const c = a.llamadas.find((x) => x.address.endsWith("a2"));
    const esperado = H.keccak256(Buffer.from("MIGRACION|" + a.assetId.toLowerCase() + "|0x51570000000000000000000000000000000000a2", "utf8"));
    assert.equal(c.paymentRef, esperado);
    assert.equal(G.paymentRefMigracion(a.assetId.toUpperCase().replace("0X", "0x"), "0x51570000000000000000000000000000000000A2"), esperado);
  });

  it("la orden lleva el digest SFSP-AUTH-v1 del payload, y period = validUntil + 1 (un solo periodo)", function () {
    const a = lote("SINTA");
    assert.equal(a.orden.estado, "LISTA_PARA_PROPONER");
    assert.equal(a.orden.firmado, false);
    assert.equal(a.orden.digest, OA.digestDe(a.orden.payload));
    assert.equal(BigInt(a.orden.period), BigInt(VENTANA.validUntil) + 1n);
    assert.equal(a.orden.payload.evidenceRoot, G.budgetTermsRoot(a.orden.period, VENTANA.validUntil, a.orden.termsDocRoot));
  });

  it("negativo (v0.3 §5): sin el documento DBNX registrado la orden sale BLOCKED_DECISION", function () {
    const sinDbnx = JSON.parse(JSON.stringify(activos));
    delete sinDbnx["0x5157000000000000000000000000000000000a01"].dbnxDocHash;
    const a = G.generarLotes(censo, sinDbnx, { internas, emisor: EMISOR, ...VENTANA }).find((l) => l.activo === "SINTA");
    assert.equal(a.orden.estado, "BLOCKED_DECISION");
    assert.equal(a.orden.digest, null);
    assert.ok(a.orden.faltan.some((x) => /DBNX/.test(x)));
  });

  it("negativo (T-700-25): un censo que no cuadra no produce una orden lista para proponer", function () {
    const c2 = JSON.parse(JSON.stringify(censo));
    const r = c2.resumen.tokens.find((t) => t.symbol === "SINTA");
    r.totalSupply = "2000";
    const a = G.generarLotes(c2, activos, { internas, emisor: EMISOR, ...VENTANA }).find((l) => l.activo === "SINTA");
    assert.equal(a.conciliacionCenso.cuadra, false);
    assert.equal(a.orden.estado, "BLOCKED_DECISION");
    assert.equal(a.orden.digest, null);
    assert.ok(a.orden.bloqueos.some((x) => /no cuadra/.test(x)));
  });

  it("negativo (T-700-25, SFSP-700 §0.5; T-300-30): ONDK sin acta de la Junta y AUKA (COM) salen BLOCKED_DECISION", function () {
    const cfg = JSON.parse(JSON.stringify(activos));
    cfg["0x5157000000000000000000000000000000000a01"].activo = "ONDK";
    cfg["0x5157000000000000000000000000000000000b02"].activo = "AUKA";
    cfg["0x5157000000000000000000000000000000000b02"].actaConciliacion = "0x" + "ac".repeat(32);
    const ls = G.generarLotes(censo, cfg, { internas, emisor: EMISOR, ...VENTANA });
    const ondk = ls.find((l) => l.activo === "ONDK");
    assert.equal(ondk.orden.estado, "BLOCKED_DECISION");
    assert.ok(ondk.orden.bloqueos.some((x) => /SFSP-700 §0.5/.test(x)));
    // Con el acta, ONDK deja de estar bloqueado por la conciliación.
    cfg["0x5157000000000000000000000000000000000a01"].actaConciliacion = "0x" + "ad".repeat(32);
    const ondk2 = G.generarLotes(censo, cfg, { internas, emisor: EMISOR, ...VENTANA }).find((l) => l.activo === "ONDK");
    assert.equal(ondk2.orden.estado, "LISTA_PARA_PROPONER");
    // AUKA es COM: aun con el acta de conciliación, no se coloca por el cupo.
    const auka = ls.find((l) => l.activo === "AUKA");
    assert.equal(auka.orden.estado, "BLOCKED_DECISION");
    assert.ok(auka.orden.bloqueos.some((x) => /COM/.test(x)));
  });

  it("ratio de D09: trunca y anota el resto; sin assetId o sin ventana => BLOCKED_DECISION", function () {
    const b = lote("SINTB");
    assert.equal(b.llamadas.find((c) => c.address.endsWith("a1")).monto, "20000000000000000");
    assert.deepEqual(b.restos.map((r) => r.restoNumerador), ["123"]);
    assert.equal(lote("SINTC").estado, "BLOCKED_DECISION");
    const sinVentana = G.generarLotes(censo, activos, { internas, emisor: EMISOR });
    const a = sinVentana.find((l) => l.activo === "SINTA");
    assert.equal(a.orden.estado, "BLOCKED_DECISION");
    assert.equal(a.orden.digest, null);
    assert.equal(a.llamadas.length, 3, "las llamadas no dependen de la ventana");
  });

  it("negativo: una dirección repetida o un censo de otro formato detienen el proceso", function () {
    const c2 = JSON.parse(JSON.stringify(censo));
    c2.tokens["0x5157000000000000000000000000000000000b02"].tenedores.push({ ...c2.tokens["0x5157000000000000000000000000000000000b02"].tenedores[0], address: "0x51570000000000000000000000000000000000A1" });
    assert.throws(() => G.generarLotes(c2, activos, { internas }), /repetida/);
    assert.throws(() => G.generarLotes({ ...censo, formato: "otro" }, activos, {}), /formato/);
  });

  for (const activo of ["SINTA", "SINTB"]) {
    it("simulacro " + activo + ": cada titular recibe exactamente su saldo, suma = S0, replay e interna revierten", async function () {
      const r = await simularLote(hre, lote(activo));
      assert.equal(r.cadaTitularRecibeSuSaldo, true);
      assert.equal(r.sumaIgualS0, true);
      assert.equal(r.cupoRestante, "0");
      assert.equal(r.repeticionPaymentRef, "revierte OperationReplay");
      assert.equal(r.envioACuentaInterna, "revierte MintToInternalAccount");
      assert.equal(r.ok, true);
    });
  }
});
