"use strict";
/* SFSP-410 / SFSP-700 · El censo de tokens no confunde un fallo del RPC con un saldo.
 *
 * Corre `migracion-410/censo-tokens-5550.mjs` de verdad, como proceso aparte, contra
 * un nodo JSON-RPC SIMULADO en 127.0.0.1 (nada sale de la máquina). Todo es
 * SINTÉTICO: una cadena de 3 bloques con un token y dos titulares:
 *   · A, cuya clave de saldo está en el inventario (100);
 *   · B, que sólo aparece en un evento Transfer (200): lo encuentra el barrido.
 * Cubre:
 *   · un error por elemento en el lote de balanceOf (timeout) se reintenta; si
 *     persiste, el censo SE DETIENE (antes: B salía con saldo 0 y sus 200 acababan
 *     en «residuo sin titular»);
 *   · un bloque que no se puede leer detiene el censo (antes: se saltaba);
 *   · un contrato cuyo totalSupply falla por el RPC se lista en `noLeidos`, y uno
 *     que revierte, en `noErc20` (antes: desaparecían sin aviso);
 *   · INTERNAS / EN_REVISION con direcciones en checksum clasifican igual; una ruta
 *     que no existe o una lista mal formada detienen el censo;
 *   · SALIDA dentro del repositorio se rechaza antes de leer la red. */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const MIG = path.join(__dirname, "..", "..", "migracion-410");
const CENSO = path.join(MIG, "censo-tokens-5550.mjs");
const E18 = 10n ** 18n;
const T = "0x5157000000000000000000000000000000007001"; // token sintético
const U = "0x5157000000000000000000000000000000007002"; // contrato que no es ERC-20
const A = "0x51570000000000000000000000000000000000aa";
const B = "0x51570000000000000000000000000000000000bb";
const SALDO = { [A]: 100n * E18, [B]: 200n * E18 };
const hex = (v) => "0x" + BigInt(v).toString(16).padStart(64, "0");
const pad = (a) => "0x" + "0".repeat(24) + a.slice(2);
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TIMEOUT = { code: -32000, message: "execution aborted (timeout = 5s)" };
const REVIERTE = { code: 3, message: "execution reverted" };

/** Nodo simulado. `fallos` decide qué elementos fallan: (método, params, intento) → error | null. */
function nodo(fallos) {
  const intentos = new Map();
  const responder = (req) => {
    const { id, method, params } = req;
    const k = method + JSON.stringify(params);
    const n = (intentos.get(k) || 0) + 1;
    intentos.set(k, n);
    const err = fallos(method, params, n);
    if (err) return { jsonrpc: "2.0", id, error: err };
    const ok = (result) => ({ jsonrpc: "2.0", id, result });
    switch (method) {
      case "eth_chainId": return ok("0x15ae");
      case "eth_getBlockByNumber": {
        const num = params[0] === "latest" ? 2 : Number(BigInt(params[0]));
        return ok({ number: "0x" + num.toString(16), hash: hex(1000 + num), timestamp: "0x" + (1790000000 + num).toString(16), transactions: [] });
      }
      case "eth_getLogs": return ok([{ address: T, topics: [TRANSFER, pad(A), pad(B)], data: hex(200n * E18), blockNumber: "0x1" }]);
      case "eth_call": {
        const { to, data } = params[0];
        const sel = data.slice(0, 10);
        if (to.toLowerCase() === U) return { jsonrpc: "2.0", id, error: REVIERTE };
        if (to.toLowerCase() !== T) return ok("0x");
        if (sel === "0x18160ddd") return ok(hex(300n * E18));
        if (sel === "0x313ce567") return ok(hex(18));
        if (sel === "0x95d89b41") return ok("0x");
        if (sel === "0x70a08231") return ok(hex(SALDO["0x" + data.slice(34, 74).toLowerCase()] || 0n));
        return { jsonrpc: "2.0", id, error: REVIERTE };
      }
      case "eth_getStorageAt": return ok(hex(params[1].toLowerCase() === ranuraA ? SALDO[A] : 0n));
      case "eth_getBalance": return ok("0x0");
      case "eth_getCode": return ok("0x");
      default: return { jsonrpc: "2.0", id, error: { code: -32601, message: "no simulado" } };
    }
  };
  const srv = http.createServer((q, r) => {
    let cuerpo = "";
    q.on("data", (c) => (cuerpo += c));
    q.on("end", () => {
      const j = JSON.parse(cuerpo);
      const out = Array.isArray(j) ? j.map(responder) : responder(j);
      r.setHeader("content-type", "application/json");
      r.end(JSON.stringify(out));
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

let ranuraA;
function correr(env) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [CENSO], { env: { PATH: process.env.PATH, NODE_USE_ENV_PROXY: "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    p.stdout.on("data", (c) => (salida += c));
    p.stderr.on("data", (c) => (salida += c));
    p.on("close", (code) => ok({ code, salida }));
  });
}

describe("SFSP-410 · censo de tokens: un fallo del RPC no es un saldo cero", function () {
  this.timeout(60000);
  let C, dir, ranuras, getAddress;
  before(async function () {
    C = await import(pathToFileURL(path.join(MIG, "lib", "comun.mjs")).href);
    getAddress = C.getAddress;
    ranuraA = C.ranuraDeSaldo(A, 0).toLowerCase();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sfsp-censo-"));
    ranuras = path.join(dir, "ranuras.json");
    fs.writeFileSync(ranuras, JSON.stringify({ [T]: { "0x02": hex(300n * E18), [ranuraA]: hex(SALDO[A]) }, [U]: { "0x00": "0x01" } }));
  });
  after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

  async function censo(fallos, extra = {}) {
    const srv = await nodo(fallos);
    const salida = fs.mkdtempSync(path.join(dir, "salida-"));
    try {
      const r = await correr({ RPC: `http://127.0.0.1:${srv.address().port}/`, RANURAS: ranuras, SALIDA: salida, ...extra });
      const f = path.join(salida, "censo-tokens.json");
      r.censo = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
      return r;
    } finally { srv.close(); }
  }
  const esBalanceOfDeB = (m, p) => m === "eth_call" && p[0].data.startsWith("0x70a08231") && p[0].data.toLowerCase().endsWith(B.slice(2));

  it("sin fallos: el barrido encuentra a B y el token cuadra con residuo 0", async function () {
    const r = await censo(() => null);
    assert.equal(r.code, 0, r.salida);
    const ten = Object.fromEntries(r.censo.tokens[T].tenedores.map((x) => [x.address, x.saldo]));
    assert.deepEqual(ten, { [A]: "100", [B]: "200" });
    assert.equal(r.censo.resumen.tokens[0].residuoSinTitular, "0");
  });

  it("un timeout transitorio en un elemento del lote se reintenta y B sigue en el censo", async function () {
    const r = await censo((m, p, n) => (esBalanceOfDeB(m, p) && n === 1 ? TIMEOUT : null));
    assert.equal(r.code, 0, r.salida);
    assert.ok(r.censo.tokens[T].tenedores.some((x) => x.address === B && x.saldo === "200"), "B no puede desaparecer por un timeout");
    assert.equal(r.censo.resumen.tokens[0].residuoSinTitular, "0");
  });

  it("negativo: si el balanceOf de B falla siempre, el censo se detiene (no lo toma por 0)", async function () {
    const r = await censo((m, p) => (esBalanceOfDeB(m, p) ? TIMEOUT : null));
    assert.notEqual(r.code, 0, "el censo tenía que fallar: " + r.salida);
    assert.equal(r.censo, null, "no se escribe un censo con un titular perdido");
    assert.match(r.salida, /rpcLote|sin respuesta válida/);
  });

  it("negativo: un bloque que no se puede leer detiene el censo", async function () {
    const r = await censo((m, p) => (m === "eth_getBlockByNumber" && p[0] === "0x1" && p[1] === true ? TIMEOUT : null));
    assert.notEqual(r.code, 0, "el censo tenía que fallar: " + r.salida);
    assert.equal(r.censo, null);
  });

  it("totalSupply con fallo del RPC → «noLeidos»; un contrato que revierte → «noErc20»", async function () {
    const r = await censo((m, p) => (m === "eth_call" && p[0].to.toLowerCase() === T && p[0].data === "0x18160ddd" ? TIMEOUT : null));
    assert.equal(r.code, 0, r.salida);
    assert.deepEqual(r.censo.noLeidos.map((x) => x.contrato), [T]);
    assert.deepEqual(r.censo.noErc20.map((x) => x.contrato), [U]);
    assert.equal(r.censo.tokens[T], undefined);
    assert.match(r.salida, /NO se pudieron leer/);
  });

  it("INTERNAS y EN_REVISION con direcciones en checksum clasifican igual que en minúsculas", async function () {
    const internas = path.join(dir, "internas-checksum.json");
    const revision = path.join(dir, "revision-checksum.json");
    assert.notEqual(getAddress(A), A, "la prueba necesita una dirección con mayúsculas");
    fs.writeFileSync(internas, JSON.stringify({ [getAddress(A)]: "tesorería sintética" }));
    fs.writeFileSync(revision, JSON.stringify({ [getAddress(B)]: "pendiente sintético" }));
    const r = await censo(() => null, { INTERNAS: internas, EN_REVISION: revision });
    assert.equal(r.code, 0, r.salida);
    const clase = Object.fromEntries(r.censo.tokens[T].tenedores.map((x) => [x.address, x.clase]));
    assert.equal(clase[A], "INTERNA-OrdenGlobal");
    assert.equal(clase[B], "EN-REVISION");
  });

  it("negativo: una ruta de INTERNAS que no existe, o una lista mal formada, detienen el censo", async function () {
    const r1 = await censo(() => null, { INTERNAS: path.join(dir, "no-existe.json") });
    assert.notEqual(r1.code, 0);
    assert.match(r1.salida, /no existe/);
    const lista = path.join(dir, "lista-array.json");
    fs.writeFileSync(lista, JSON.stringify([A]));
    const r2 = await censo(() => null, { EN_REVISION: lista });
    assert.notEqual(r2.code, 0);
    assert.match(r2.salida, /objeto/);
  });

  it("negativo: SALIDA dentro del repositorio se rechaza antes de leer la red", async function () {
    let llamadas = 0;
    const srv = await nodo(() => { llamadas++; return null; });
    const dentro = path.join(MIG, "salida-prueba-no-versionar");
    try {
      const r = await correr({ RPC: `http://127.0.0.1:${srv.address().port}/`, RANURAS: ranuras, SALIDA: dentro });
      assert.notEqual(r.code, 0);
      assert.match(r.salida, /dentro del repositorio/);
      assert.equal(llamadas, 0, "no tenía que llegar a leer la red");
      assert.equal(fs.existsSync(dentro), false, "no tenía que crear la carpeta");
    } finally { srv.close(); fs.rmSync(dentro, { recursive: true, force: true }); }
  });

  it("comprobarSalidaFueraDelRepo: fuera pasa; dentro, o por un enlace que apunta dentro, se rechaza", function () {
    const fuera = path.join(dir, "fuera", "sub");
    assert.ok(C.comprobarSalidaFueraDelRepo(fuera));
    assert.throws(() => C.comprobarSalidaFueraDelRepo(path.join(MIG, "no-crear-esto")), /dentro del repositorio/);
    assert.equal(fs.existsSync(path.join(MIG, "no-crear-esto")), false);
    const enlace = path.join(dir, "enlace-al-repo");
    fs.symlinkSync(MIG, enlace);
    assert.throws(() => C.comprobarSalidaFueraDelRepo(path.join(enlace, "x")), /dentro del repositorio/);
  });
});
