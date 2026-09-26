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
    assert.equal(a.conciliacionCenso.residuoSinTitular, "0");
    assert.equal(a.conciliacionCenso.incoherentes, 0);
    assert.equal(a.conciliacionCenso.sumaMasResiduoIgualTotal, true);
    assert.equal(a.conciliacionCenso.cuadra, true, "residuo 0, sin incoherentes y suma + residuo = totalSupply");
  });

  it("S0 = suma de los montos; máx/op = el mayor; termsDocRoot y evidenceRoot = raíz del padrón", function () {
    const a = lote("SINTA");
    const suma = a.llamadas.reduce((s, c) => s + BigInt(c.monto), 0n);
    assert.equal(BigInt(a.S0), suma);
    assert.equal(a.S0, (850n * 10n ** 18n + 5n * 10n ** 17n).toString());
    assert.equal(a.maxPorOperacion, (500n * 10n ** 18n).toString());
    assert.equal(a.orden.payload.amount, a.S0);
    assert.equal(a.orden.payload.amountSecondary, a.maxPorOperacion);
    assert.equal(a.orden.termsDocRoot, a.raizPadron);
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
    assert.equal(a.orden.payload.evidenceRoot, G.budgetTermsRoot(a.orden.period, VENTANA.validUntil, a.raizPadron));
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

  const copia = (x) => JSON.parse(JSON.stringify(x));
  const SINTA = "0x5157000000000000000000000000000000000a01";
  const resumenDe = (c, contrato) => c.resumen.tokens.find((t) => t.contrato === contrato);
  let opciones; // se arma en el before del bloque: `internas` se carga en el before general
  before(function () { opciones = { internas, emisor: EMISOR, ...VENTANA }; });

  it("negativo: residuo sin titular ≠ 0 o tenedores incoherentes => la orden sale BLOCKED_DECISION, sin digest", function () {
    // Un titular perdido por una lectura fallida del censo: a3 (100,5) desaparece y su
    // saldo acaba en el residuo. Σ + residuo sigue siendo totalSupply: eso solo no basta.
    const c = copia(censo);
    c.tokens[SINTA].tenedores = c.tokens[SINTA].tenedores.filter((t) => !t.address.endsWith("a3"));
    resumenDe(c, SINTA).residuoSinTitular = "100.5";
    const a = G.generarLotes(c, activos, opciones).find((l) => l.activo === "SINTA");
    assert.equal(a.conciliacionCenso.sumaMasResiduoIgualTotal, true);
    assert.equal(a.conciliacionCenso.cuadra, false);
    assert.equal(a.orden.estado, "BLOCKED_DECISION");
    assert.equal(a.orden.digest, null);
    assert.ok(a.orden.faltan.some((x) => /residuo sin titular 100\.5/.test(x)), a.orden.faltan.join("; "));
    // Residuo explicado por el censo sintético original de 997,5 (7,5 sin titular).
    const c2 = copia(censo);
    Object.assign(resumenDe(c2, SINTA), { totalSupply: "997.5", residuoSinTitular: "7.5" });
    assert.equal(G.generarLotes(c2, activos, opciones).find((l) => l.activo === "SINTA").orden.estado, "BLOCKED_DECISION");
    // Tenedores con balanceOf ≠ ranura, o un censo que no lo informa.
    const c3 = copia(censo);
    resumenDe(c3, SINTA).incoherentes = 2;
    const a3 = G.generarLotes(c3, activos, opciones).find((l) => l.activo === "SINTA");
    assert.equal(a3.orden.estado, "BLOCKED_DECISION");
    assert.ok(a3.orden.faltan.some((x) => /2 tenedores con balanceOf ≠ ranura/.test(x)));
    delete resumenDe(c3, SINTA).incoherentes;
    assert.equal(G.generarLotes(c3, activos, opciones).find((l) => l.activo === "SINTA").orden.estado, "BLOCKED_DECISION");
    // Las llamadas se siguen generando (son una propuesta); lo que no sale es la orden lista.
    assert.equal(a.llamadas.length, 2);
  });

  it("negativo: dos contratos heredados hacia el mismo assetId => los dos BLOCKED_DECISION, sin cupo ni llamadas", function () {
    const act = copia(activos);
    act["0x5157000000000000000000000000000000000b02"].assetId = act[SINTA].assetId.toUpperCase().replace("0X", "0x");
    const ls = G.generarLotes(censo, act, opciones);
    for (const n of ["SINTA", "SINTB"]) {
      const l = ls.find((x) => x.activo === n);
      assert.equal(l.estado, "BLOCKED_DECISION", n);
      assert.equal(l.llamadas, undefined);
      assert.ok(l.bloqueos.some((x) => /mismo assetId/.test(x)), l.bloqueos.join("; "));
    }
    // El mismo nombre de activo dos veces (los archivos de salida se pisarían).
    const act2 = copia(activos);
    act2["0x5157000000000000000000000000000000000b02"].activo = "SINTA";
    assert.ok(G.generarLotes(censo, act2, opciones).every((l) => l.estado === "BLOCKED_DECISION"));
    // El mismo contrato dos veces (mayúsculas y minúsculas) con dos assetId distintos.
    const act3 = copia(activos);
    act3[SINTA.toUpperCase().replace("0X", "0x")] = { ...act3[SINTA], activo: "SINTA2", assetId: "0x" + "ab".repeat(32) };
    const ls3 = G.generarLotes(censo, act3, opciones).filter((l) => /^SINTA/.test(l.activo));
    assert.equal(ls3.length, 2);
    assert.ok(ls3.every((l) => l.estado === "BLOCKED_DECISION" && l.bloqueos.some((x) => /más de una vez/.test(x))));
  });

  it("EN_REVISION e INTERNAS con direcciones en checksum excluyen igual; una lista mal formada detiene", function () {
    const enRevision = { "0x51570000000000000000000000000000000000A3": "pendiente sintético (checksum)" };
    const a = G.generarLotes(censo, activos, { ...opciones, enRevision }).find((l) => l.activo === "SINTA");
    assert.ok(!a.llamadas.some((c) => c.address.endsWith("a3")), "una pendiente no puede entrar al padrón");
    assert.match(a.excluidas.find((x) => x.address.toLowerCase().endsWith("a3")).motivo, /pendiente/);
    const internasMayus = { "0x51570000000000000000000000000000000000A4": internas["0x51570000000000000000000000000000000000a4"] };
    const b = G.generarLotes(censo, activos, { ...opciones, internas: internasMayus }).find((l) => l.activo === "SINTA");
    assert.ok(!b.llamadas.some((c) => c.address.endsWith("a4")));
    assert.throws(() => G.generarLotes(censo, activos, { ...opciones, internas: ["0x51570000000000000000000000000000000000a4"] }), /objeto/);
    assert.throws(() => G.generarLotes(censo, activos, { ...opciones, enRevision: { "0xa4": "corta" } }), /no es una dirección/);
    assert.throws(() => G.generarLotes(censo, activos, { ...opciones, internas: { "0x51570000000000000000000000000000000000a4": "" } }), /motivo/);
  });

  it("lista blanca: sólo la clase USUARIO recibe; una clase desconocida o ausente sale excluida con su motivo", function () {
    const c = copia(censo);
    const ten = c.tokens[SINTA].tenedores;
    ten.find((t) => t.address.endsWith("a1")).clase = "OPERACION_INTERNA";
    delete ten.find((t) => t.address.endsWith("a3")).clase;
    const a = G.generarLotes(c, activos, opciones).find((l) => l.activo === "SINTA");
    assert.deepEqual(a.llamadas.map((x) => x.address), ["0x51570000000000000000000000000000000000a2"]);
    const motivos = Object.fromEntries(a.excluidas.map((x) => [x.address.toLowerCase(), x.motivo]));
    assert.match(motivos["0x51570000000000000000000000000000000000a1"], /clase no admitida: OPERACION_INTERNA/);
    assert.match(motivos["0x51570000000000000000000000000000000000a3"], /clase no admitida: \(sin clase\)/);
  });

  it("BLOQUE_CORTE distinto del bloque del censo detiene; el migrationId fijado entra por parámetro", function () {
    assert.throws(() => G.generarLotes(censo, activos, { ...opciones, bloqueCorte: 999 }), /BLOQUE_CORTE 999 ≠ bloque del censo 100000/);
    const igual = G.generarLotes(censo, activos, { ...opciones, bloqueCorte: 100000 }).find((l) => l.activo === "SINTA");
    assert.equal(igual.bloqueCorte, 100000);
    assert.equal(igual.bloqueCenso, 100000);
    assert.equal(igual.raizPadron, lote("SINTA").raizPadron);
    const fijo = "mig_" + "5a".repeat(16);
    const conId = G.generarLotes(censo, activos, { ...opciones, migrationIds: { SINTA: fijo } }).find((l) => l.activo === "SINTA");
    assert.equal(conId.migrationId, fijo);
    assert.notEqual(conId.raizPadron, lote("SINTA").raizPadron);
  });

  it("CLI: una ruta de INTERNAS o EN_REVISION que no existe, o SALIDA dentro del repositorio, detienen el proceso", function () {
    const { spawnSync } = require("node:child_process");
    const os = require("node:os");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sfsp-lote-"));
    try {
      const base = {
        PATH: process.env.PATH, CENSO: path.join(MIG, "sintetico", "censo-tokens-sintetico.json"),
        ACTIVOS: path.join(MIG, "sintetico", "activos-sintetico.json"), SALIDA: tmp,
      };
      const correr = (env) => spawnSync(process.execPath, [path.join(MIG, "lote-migracion.mjs")], { env: { ...base, ...env }, encoding: "utf8" });
      const bien = correr({ INTERNAS: path.join(MIG, "sintetico", "internas-sintetico.json") });
      assert.equal(bien.status, 0, bien.stderr);
      assert.match(bien.stdout, /INTERNAS: 1 direcciones/);
      const mal = correr({ INTERNAS: path.join(MIG, "sintetico", "internas-sintetico.jsonX") });
      assert.notEqual(mal.status, 0, "una ruta de INTERNAS rota no puede ignorarse");
      assert.match(mal.stderr, /no existe/);
      const mal2 = correr({ EN_REVISION: path.join(tmp, "no-existe.json") });
      assert.notEqual(mal2.status, 0);
      const dentro = path.join(MIG, "salida-prueba-no-versionar");
      const mal3 = correr({ SALIDA: dentro });
      assert.notEqual(mal3.status, 0);
      assert.match(mal3.stderr, /dentro del repositorio/);
      assert.equal(fs.existsSync(dentro), false);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
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
