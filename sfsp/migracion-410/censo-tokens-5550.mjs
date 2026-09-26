#!/usr/bin/env node
// SFSP-410 · Censo de TODOS los tokens ERC-20 de la 5550, con saldos a la fecha.
//
// 1. Tokens: todo contrato del inventario de claves (RANURAS, por omisión
//    infra/migracion-cadena/ranuras-todas.json) que responde totalSupply/decimals/symbol
//    en la 5550. Se censan los que tienen totalSupply > 0.
// 2. Direcciones candidatas, un solo conjunto para todos los tokens (quien tiene
//    cualquier token es candidato en todos):
//      - toda la actividad de la 5550 desde el bloque 0: from/to e input de cada
//        transacción, y dirección, topics y data de cada evento de cualquier contrato;
//      - `0x` + 40 hex en los archivos de FUENTES (respaldo de la 8532 SÓLO como
//        diccionario de direcciones, exportaciones de Veta y Genesis ID…).
// 3. Por token, una clave R es de A si keccak256(abi.encode(A, p)) == R, con p la
//    ranura del mapping de saldos (se detecta: la que más claves resuelve), o de un
//    permiso A→S si keccak256(abi.encode(S, keccak256(abi.encode(A, p+1)))) == R.
// 4. SALDOS: siempre balanceOf en la 5550 en un bloque fijo (nunca de la 8532). Se
//    comprueba balanceOf == valor de la ranura, y se concilia contra totalSupply;
//    si no cuadra, barrido de balanceOf sobre todas las candidatas. Lo que sigue sin
//    cuadrar es residuo sin titular (se informa, nunca se reparte).
//
// Nada aquí firma ni envía. Los DATOS se escriben en SALIDA, fuera del repositorio.
// También escribe `censo-ondk.json` (formato de construir-padron / lote-origen-ondk).
// Uso:  NODE_USE_ENV_PROXY=1 SALIDA=… FUENTES=dir1:dir2 node censo-tokens-5550.mjs
//   BLOQUE=<n>     bloque de lectura (por omisión, el último)
//   INTERNAS=…     JSON {direccion: motivo} de cuentas de Orden Global (propuesta D25), fuera del repo
//   EN_REVISION=…  JSON {direccion: motivo} de direcciones pendientes de decisión
import {
  CHAIN_ID, rpc, rpcLote, bloqueFijo, balanceOf, saldoNativo, leerRanura, enParalelo, escribir, csv, norm,
  aTexto, keccak256, defaultAbiCoder, ranuraDeSaldo, RAIZ_SFSP, Interface,
} from "./lib/comun.mjs";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const RANURAS = process.env.RANURAS || join(RAIZ_SFSP, "..", "infra", "migracion-cadena", "ranuras-todas.json");
const ONDK = "0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1";
const MAX_P = 20; // ranuras de mapping que se prueban
// Nunca se leen llaves de nodos ni la red de pruebas, aunque estén dentro de una fuente.
const PROHIBIDO = /(^|\/)(llaves|testnet-5534)(\/|$)|\.tar(\.gz)?$|\.key$/i;
const leerJson = (r, def) => (r && existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : def);
const internas = leerJson(process.env.INTERNAS, {});
const enRevision = leerJson(process.env.EN_REVISION, {});
const CERO = "0x" + "0".repeat(40);

const b = await bloqueFijo(process.env.BLOQUE);
console.log(`bloque ${b.numero} (${new Date(b.timestamp * 1000).toISOString()})`);

// ------------------------------------------------------------ 1. tokens
const inventario = Object.fromEntries(Object.entries(leerJson(RANURAS, {})).map(([c, m]) => [norm(c), Object.fromEntries(Object.entries(m).map(([k, v]) => [norm(k), v]))]));
const ERC20 = new Interface(["function totalSupply() view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"]);
const contratos = Object.keys(inventario);
const lecturas = await rpcLote(contratos.flatMap((c) => ["totalSupply", "decimals", "symbol"].map((f) => ["eth_call", [{ to: c, data: ERC20.encodeFunctionData(f) }, b.tag]])));
const tokens = [];
contratos.forEach((c, i) => {
  const [ts, dec, sym] = lecturas.slice(3 * i, 3 * i + 3);
  if (!ts || ts === "0x" || !dec || dec === "0x") return;
  let symbol = "?";
  try { symbol = ERC20.decodeFunctionResult("symbol", sym)[0]; } catch {}
  tokens.push({ contrato: c, symbol, decimals: Number(BigInt(dec)), totalSupply: BigInt(ts) });
});
const conEmision = tokens.filter((t) => t.totalSupply > 0n);
console.log(`contratos en el inventario: ${contratos.length} · ERC-20: ${tokens.length} · con emisión: ${conEmision.length}`);

// ------------------------------------------------------------ 2. candidatas
const candidatas = new Map(); // dir -> Set(fuente)
const anotar = (a, f) => { const k = "0x" + a.toLowerCase().replace(/^0x/, ""); if (k === CERO) return; if (!candidatas.has(k)) candidatas.set(k, new Set()); candidatas.get(k).add(f); };
const PALABRA = /^0{24}([0-9a-f]{40})$/;
const palabras = (hex, f) => { const h = hex.replace(/^0x/, "").toLowerCase(); for (let i = 0; i + 64 <= h.length; i += 64) { const m = PALABRA.exec(h.slice(i, i + 64)); if (m) anotar(m[1], f); } };

// 2a. actividad de la 5550: eventos de cualquier contrato y todas las transacciones
let nEventos = 0, nTx = 0;
for (let desde = 0; desde <= b.numero; desde += 3000) {
  const L = await rpc("eth_getLogs", [{ fromBlock: "0x" + desde.toString(16), toBlock: "0x" + Math.min(desde + 2999, b.numero).toString(16) }]);
  for (const l of L) { nEventos++; anotar(l.address, "5550 eventos"); for (const t of l.topics.slice(1)) palabras(t, "5550 eventos"); palabras(l.data, "5550 eventos"); }
}
const rangos = [];
for (let i = 0; i <= b.numero; i += 200) rangos.push(i);
await enParalelo(rangos, async (desde) => {
  const bloques = await rpcLote(Array.from({ length: Math.min(200, b.numero - desde + 1) }, (_, k) => ["eth_getBlockByNumber", ["0x" + (desde + k).toString(16), true]]));
  for (const blq of bloques) for (const tx of (blq && blq.transactions) || []) {
    nTx++; anotar(tx.from, "5550 transacciones"); if (tx.to) anotar(tx.to, "5550 transacciones"); palabras((tx.input || "0x").slice(10), "5550 transacciones");
  }
}, 6);
console.log(`actividad de la 5550: ${nTx} transacciones, ${nEventos} eventos`);

// 2b. fuentes externas (diccionario de direcciones)
const RE40 = /0x([0-9a-fA-F]{40})(?![0-9a-fA-F])/g;
const RE64 = /(?:0x)?0{24}([0-9a-fA-F]{40})(?![0-9a-fA-F])/g;
function cosechar(ruta, base) {
  if (PROHIBIDO.test(ruta)) { console.log(`  omitido (prohibido): ${ruta}`); return; }
  if (statSync(ruta).isDirectory()) { for (const n of readdirSync(ruta)) cosechar(join(ruta, n), base); return; }
  let buf = readFileSync(ruta);
  if (ruta.endsWith(".gz")) buf = gunzipSync(buf);
  const t = buf.toString("latin1"), f = ruta.slice(base.length).replace(/^\//, "") || ruta.split("/").pop();
  for (const m of t.matchAll(RE40)) anotar(m[1], f);
  for (const m of t.matchAll(RE64)) anotar(m[1], f);
}
for (const f of (process.env.FUENTES || "").split(":").filter(Boolean)) cosechar(f, f.replace(/\/[^/]*$/, ""));
const dirs = [...candidatas.keys()];
console.log(`candidatas: ${dirs.length}`);

// ------------------------------------------------------------ 3. resolver claves
const porClave = new Map(); // ranura -> [dir, p]
for (const a of dirs) for (let p = 0; p <= MAX_P; p++) porClave.set(ranuraDeSaldo(a, p).toLowerCase(), [a, p]);
const esFija = (r) => BigInt(r) < 2n ** 64n;
const interiores = new Map(); // p -> Map(dir -> keccak(abi.encode(dir, p)))
for (const t of conEmision) {
  const claves = Object.keys(inventario[t.contrato]).filter((r) => !esFija(r));
  const cuenta = {};
  for (const r of claves) { const x = porClave.get(r); if (x) cuenta[x[1]] = (cuenta[x[1]] || 0) + 1; }
  t.p = Number(Object.entries(cuenta).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0);
  t.saldos = new Map(); t.permisos = []; t.sinDireccion = [];
  for (const r of claves) { const x = porClave.get(r); if (x && x[1] === t.p) t.saldos.set(x[0], r); else t.sinDireccion.push(r); }
  if (t.sinDireccion.length) {
    const q = t.p + 1;
    if (!interiores.has(q)) interiores.set(q, new Map(dirs.map((a) => [a, ranuraDeSaldo(a, q)])));
    const pend = new Set(t.sinDireccion);
    for (const [o, h] of interiores.get(q)) for (const s of dirs) {
      const r = keccak256(defaultAbiCoder.encode(["address", "bytes32"], [s, h])).toLowerCase();
      if (pend.has(r)) { t.permisos.push({ clave: r, dueno: o, gastador: s }); pend.delete(r); }
      if (!pend.size) break;
    }
    t.sinDireccion = [...pend];
  }
  t.claves = claves.length;
}

// ------------------------------------------------------------ 4. saldos en la 5550 y conciliación
const nativo = new Map(), codigo = new Map();
async function fichaDir(a) {
  if (!nativo.has(a)) { nativo.set(a, await saldoNativo(a, b.tag)); codigo.set(a, (await rpc("eth_getCode", [a, b.tag])) !== "0x"); }
}
for (const t of conEmision) {
  const filas = [...t.saldos.keys()].map((address) => ({ address }));
  await enParalelo(filas, async (f) => {
    f.saldo = await balanceOf(t.contrato, f.address, b.tag);
    f.ranura = await leerRanura(t.contrato, ranuraDeSaldo(f.address, t.p), b.tag);
  });
  t.incoherentes = filas.filter((f) => f.saldo !== f.ranura).length;
  let suma = filas.reduce((s, f) => s + f.saldo, 0n);
  t.barrido = false;
  if (suma !== t.totalSupply) {
    t.barrido = true;
    const resto = dirs.filter((a) => !t.saldos.has(a)).map((address) => ({ address }));
    const res = [];
    for (let i = 0; i < resto.length; i += 200) res.push(...await rpcLote(resto.slice(i, i + 200).map((f) => ["eth_call", [{ to: t.contrato, data: "0x70a08231" + "0".repeat(24) + f.address.slice(2) }, b.tag]])));
    resto.forEach((f, i) => { f.saldo = res[i] ? BigInt(res[i]) : 0n; f.fueraDeInventario = true; });
    for (const f of resto.filter((x) => x.saldo > 0n)) { filas.push(f); suma += f.saldo; }
  }
  const sinDir = t.sinDireccion.map((r) => ({ address: "ranura:" + r }));
  await enParalelo(sinDir, async (x) => { x.saldo = await leerRanura(t.contrato, x.address.slice(7), b.tag); });
  t.filas = filas.filter((f) => f.saldo > 0n);
  t.sinDirFilas = sinDir.filter((x) => x.saldo > 0n);
  t.suma = suma;
  t.residuo = t.totalSupply - suma - t.sinDirFilas.reduce((s, x) => s + x.saldo, 0n);
  await enParalelo(t.filas, (f) => fichaDir(f.address));
}

const clase = (a) => (codigo.get(a) ? "CONTRATO" : internas[a] ? "INTERNA-OrdenGlobal" : enRevision[a] ? "EN-REVISION" : "USUARIO");
const nota = (f) => [internas[f.address] || enRevision[f.address], f.fueraDeInventario && "clave fuera del inventario del génesis"].filter(Boolean).join("; ");
const fuente = (a) => [...(candidatas.get(a) || [])].sort().join(" | ");
const fmt = (t, v) => aTexto(v, t.decimals);
const resumenToken = (t) => {
  const porClase = {};
  for (const f of t.filas) { const c = clase(f.address); porClase[c] ??= { tenedores: 0, raw: 0n }; porClase[c].tenedores++; porClase[c].raw += f.saldo; }
  return {
    contrato: t.contrato, symbol: t.symbol, decimals: t.decimals, ranuraSaldos: t.p,
    totalSupply: fmt(t, t.totalSupply), conDireccion: fmt(t, t.suma), residuoSinTitular: fmt(t, t.residuo),
    claves: t.claves, clavesResueltas: t.saldos.size + t.permisos.length, clavesSinDireccion: t.sinDireccion.length,
    barridoBalanceOf: t.barrido, incoherentes: t.incoherentes, tenedores: t.filas.length,
    porClase: Object.fromEntries(Object.entries(porClase).map(([k, v]) => [k, { tenedores: v.tenedores, saldo: fmt(t, v.raw) }])),
  };
};
const tenedoresDe = (t) => [
  ...t.filas.sort((x, y) => (y.saldo > x.saldo ? 1 : -1)).map((f) => ({
    address: f.address, saldoRaw: f.saldo.toString(), saldo: fmt(t, f.saldo), origen: aTexto(nativo.get(f.address) ?? 0n),
    clase: clase(f.address), nota: nota(f), fuente: fuente(f.address),
  })),
  ...t.sinDirFilas.map((x) => ({ address: x.address, saldoRaw: x.saldo.toString(), saldo: fmt(t, x.saldo), clase: "SIN-RESOLVER", nota: "clave sin preimagen en las fuentes", fuente: "inventario" })),
];

const censo = {
  formato: "sfsp-censo-tokens/v1",
  advertencia: "DATOS PERSONALES. No se versiona en el repositorio público.",
  resumen: { chainId: CHAIN_ID, bloque: b.numero, hash: b.hash, timestamp: b.timestamp, candidatas: dirs.length, actividad5550: { transacciones: nTx, eventos: nEventos }, tokens: conEmision.map(resumenToken) },
  tokens: Object.fromEntries(conEmision.map((t) => [t.contrato, { symbol: t.symbol, tenedores: tenedoresDe(t), permisos: t.permisos }])),
  vacios: tokens.filter((t) => t.totalSupply === 0n).map((t) => ({ contrato: t.contrato, symbol: t.symbol })),
};
escribir("censo-tokens.json", censo);
escribir("censo-tokens.csv", csv([["token", "contrato", "direccion", "saldo", "origen", "clase", "nota"], ...conEmision.flatMap((t) => tenedoresDe(t).map((x) => [t.symbol, t.contrato, x.address, x.saldo, x.origen ?? "", x.clase, x.nota]))]));

// Titulares por dirección, todos los tokens (padrón completo).
const porDir = new Map();
for (const t of conEmision) for (const f of t.filas) { if (!porDir.has(f.address)) porDir.set(f.address, []); porDir.get(f.address).push(`${t.symbol}(${t.contrato.slice(0, 8)})=${fmt(t, f.saldo)}`); }
escribir("padron-titulares.csv", csv([["direccion", "clase", "origen", "tokens"], ...[...porDir].map(([a, xs]) => [a, clase(a), aTexto(nativo.get(a) ?? 0n), xs.join(" ; ")])]));

// Compatibilidad: censo-ondk.json para construir-padron.mjs y lote-origen-ondk.mjs.
const tO = conEmision.find((t) => t.contrato === ONDK);
if (tO) escribir("censo-ondk.json", {
  formato: "sfsp-censo-ondk/v2", advertencia: censo.advertencia,
  resumen: { chainId: CHAIN_ID, contrato: ONDK, bloque: b.numero, hash: b.hash, timestamp: b.timestamp, ...resumenToken(tO), permisos: tO.permisos },
  tenedores: tenedoresDe(tO).map((x) => ({ ...x, ondkRaw: x.saldoRaw, ondk: x.saldo })),
});

for (const t of conEmision) console.log(`${t.symbol.padEnd(10)} ${t.contrato.slice(0, 10)} tenedores ${String(t.filas.length).padStart(4)} · claves ${t.saldos.size + t.permisos.length}/${t.claves} · residuo ${fmt(t, t.residuo)}${t.incoherentes ? " · ¡INCOHERENTES " + t.incoherentes + "!" : ""}`);
console.log(`titulares distintos (todos los tokens): ${porDir.size}`);
