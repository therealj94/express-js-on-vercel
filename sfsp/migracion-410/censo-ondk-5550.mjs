#!/usr/bin/env node
// SFSP-410 · Censo de ONDK en la 5550 con las ranuras de saldo resueltas a dirección.
//
// Produce el `censo-ondk.json` que usan construir-padron.mjs y lote-origen-ondk.mjs:
//
// 1. Inventario de claves del contrato ONDK (RANURAS: mapa contrato → {ranura: valor},
//    por omisión infra/migracion-cadena/ranuras-todas.json, el de la construcción del génesis).
// 2. Direcciones candidatas: todo `0x` + 40 hex (o palabra de 32 bytes con 12 ceros
//    delante) en los archivos de FUENTES (respaldo de la 8532, exportaciones de Veta
//    y Genesis ID…), más los `from`/`to` de todos los Transfer de ONDK en la 5550.
// 3. Una clave R se resuelve a la dirección A si keccak256(abi.encode(A, uint256(0))) == R
//    (saldo) o keccak256(abi.encode(S, keccak256(abi.encode(A, 1)))) == R (permiso A→S).
// 4. Se relee EN VIVO (sólo lectura) balanceOf, ranura 0, saldo nativo y código de cada
//    dirección en un bloque fijo, y se concilia contra totalSupply(): lo que no cuadra
//    es saldo en claves que ninguna fuente resuelve (residuo, se informa, nunca se reparte).
//
// Nada aquí firma ni envía. Los DATOS se escriben en SALIDA, fuera del repositorio.
// Uso:  NODE_USE_ENV_PROXY=1 SALIDA=… FUENTES=dir1:dir2:archivo node censo-ondk-5550.mjs
//   BLOQUE=<n>     bloque de lectura (por omisión, el último)
//   INTERNAS=…     JSON {direccion: motivo} de cuentas de Orden Global (propuesta D25), fuera del repo
//   EN_REVISION=…  JSON {direccion: motivo} de direcciones pendientes de decisión
import {
  RUTAS, CHAIN_ID, rpc, bloqueFijo, balanceOf, saldoNativo, leerRanura, enParalelo, escribir, csv, norm,
  aTexto, keccak256, defaultAbiCoder, toUtf8Bytes, ranuraDeSaldo, RAIZ_SFSP,
} from "./lib/comun.mjs";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const ONDK = norm(process.env.ONDK || "0xfb83eea4b384a4b18e5a1eba7a4bb4c0b7ca19c1");
const RANURAS = process.env.RANURAS || join(RAIZ_SFSP, "..", "infra", "migracion-cadena", "ranuras-todas.json");
// Nunca se leen llaves de nodos ni la red de pruebas, aunque estén dentro de una fuente.
const PROHIBIDO = /(^|\/)(llaves|testnet-5534)(\/|$)|\.tar(\.gz)?$|\.key$/i;
const leerJson = (r, def) => (r && existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : def);

// ------------------------------------------------------------ 1. inventario de claves
const inventario = leerJson(RANURAS, {})[ONDK] || {};
const esFija = (r) => BigInt(r) < 2n ** 64n;
const claves = Object.keys(inventario).map(norm).filter((r) => !esFija(r));
console.log(`inventario: ${Object.keys(inventario).length} claves de ONDK (${claves.length} de mapping)`);

// ------------------------------------------------------------ 2. direcciones candidatas
const RE40 = /0x([0-9a-fA-F]{40})(?![0-9a-fA-F])/g;
const RE64 = /(?:0x)?0{24}([0-9a-fA-F]{40})(?![0-9a-fA-F])/g;
const candidatas = new Map(); // dir -> Set(fuente)
const anotar = (a, f) => { const k = "0x" + a.toLowerCase(); if (!candidatas.has(k)) candidatas.set(k, new Set()); candidatas.get(k).add(f); };
function cosechar(ruta, etiqueta) {
  if (PROHIBIDO.test(ruta)) { console.log(`  omitido (prohibido): ${ruta}`); return; }
  if (statSync(ruta).isDirectory()) { for (const n of readdirSync(ruta)) cosechar(join(ruta, n), etiqueta); return; }
  let b = readFileSync(ruta);
  if (ruta.endsWith(".gz")) b = gunzipSync(b);
  const t = b.toString("latin1");
  for (const m of t.matchAll(RE40)) anotar(m[1], etiqueta(ruta));
  for (const m of t.matchAll(RE64)) anotar(m[1], etiqueta(ruta));
}
const fuentes = (process.env.FUENTES || "").split(":").filter(Boolean);
for (const f of fuentes) cosechar(f, (r) => r.slice(f.length - f.split("/").pop().length));

const b = await bloqueFijo(process.env.BLOQUE);
console.log(`bloque ${b.numero} (${new Date(b.timestamp * 1000).toISOString()})`);

const TRANSFER = keccak256(toUtf8Bytes("Transfer(address,address,uint256)"));
const eventos = [];
for (let desde = 0, paso = 3000; desde <= b.numero; desde += paso) {
  const hasta = Math.min(desde + paso - 1, b.numero);
  eventos.push(...await rpc("eth_getLogs", [{ address: ONDK, topics: [TRANSFER], fromBlock: "0x" + desde.toString(16), toBlock: "0x" + hasta.toString(16) }]));
}
for (const l of eventos) for (const t of l.topics.slice(1, 3)) anotar(t.slice(26), "eventos Transfer ONDK 5550");
candidatas.delete("0x" + "0".repeat(40));
console.log(`candidatas: ${candidatas.size} · eventos Transfer: ${eventos.length}`);

// ------------------------------------------------------------ 3. resolver claves
const pendientes = new Set(claves);
const resueltas = new Map(); // clave -> {tipo, dueno, gastador?}
const dirs = [...candidatas.keys()];
for (const a of dirs) { const r = ranuraDeSaldo(a, 0); if (pendientes.has(r)) { resueltas.set(r, { tipo: "saldo", dueno: a }); pendientes.delete(r); } }
if (pendientes.size) {
  const interior = new Map(dirs.map((a) => [a, keccak256(defaultAbiCoder.encode(["address", "uint256"], [a, 1]))]));
  for (const [o, h] of interior) for (const s of dirs) {
    const r = keccak256(defaultAbiCoder.encode(["address", "bytes32"], [s, h]));
    if (pendientes.has(r)) { resueltas.set(r, { tipo: "permiso", dueno: o, gastador: s }); pendientes.delete(r); }
  }
}
console.log(`claves resueltas: ${resueltas.size}/${claves.length} · sin dirección: ${pendientes.size}`);

// ------------------------------------------------------------ 4. lectura en vivo y conciliación
const internas = leerJson(process.env.INTERNAS, {});
const enRevision = leerJson(process.env.EN_REVISION, {});
const conSaldo = new Set([...resueltas.values()].filter((x) => x.tipo === "saldo").map((x) => x.dueno));
for (const l of eventos) conSaldo.add("0x" + l.topics[2].slice(26));
const filas = [...conSaldo].map((address) => ({ address }));
await enParalelo(filas, async (f) => {
  f.ondk = await balanceOf(ONDK, f.address, b.tag);
  f.ranura0 = await leerRanura(ONDK, ranuraDeSaldo(f.address, 0), b.tag);
  f.origen = await saldoNativo(f.address, b.tag);
  f.codigo = (await rpc("eth_getCode", [f.address, b.tag])) !== "0x";
});
// Saldos cuya clave no está en el inventario (la 8532 se movió después de la foto):
// cualquier candidata con balanceOf > 0 también es tenedora.
const resto = dirs.filter((a) => !conSaldo.has(a)).map((address) => ({ address }));
await enParalelo(resto, async (f) => { f.ondk = await balanceOf(ONDK, f.address, b.tag); });
const fueraDeInventario = resto.filter((f) => f.ondk > 0n);
for (const x of fueraDeInventario) {
  const f = { address: x.address, ondk: x.ondk, fueraDeInventario: true };
  f.ranura0 = await leerRanura(ONDK, ranuraDeSaldo(f.address, 0), b.tag);
  f.origen = await saldoNativo(f.address, b.tag);
  f.codigo = (await rpc("eth_getCode", [f.address, b.tag])) !== "0x";
  filas.push(f);
}
console.log(`tenedoras fuera del inventario (barrido de balanceOf): ${fueraDeInventario.length}`);
const incoherentes = filas.filter((f) => f.ondk !== f.ranura0);
if (incoherentes.length) throw new Error(`balanceOf ≠ ranura 0 en ${incoherentes.length} direcciones: el mapping de saldos no está en la ranura 0`);
const reservas = [...pendientes].map((r) => ({ address: "ranura:" + r }));
await enParalelo(reservas, async (x) => { x.ondk = await leerRanura(ONDK, x.address.slice(7), b.tag); });

const totalSupply = BigInt(await rpc("eth_call", [{ to: ONDK, data: "0x18160ddd" }, b.tag]));
const suma = filas.reduce((s, f) => s + f.ondk, 0n) + reservas.reduce((s, x) => s + x.ondk, 0n);
const residuo = totalSupply - suma;

const clase = (f) => (f.codigo ? "CONTRATO" : internas[f.address] ? "INTERNA-OrdenGlobal" : enRevision[f.address] ? "EN-REVISION" : "USUARIO");
const nota = (f) => [internas[f.address] || enRevision[f.address], f.fueraDeInventario && "clave fuera del inventario del génesis"].filter(Boolean).join("; ");
const fuente = (a) => [...(candidatas.get(a) || [])].sort().join(" | ");
const tenedores = [
  ...filas.filter((f) => f.ondk > 0n).sort((x, y) => (y.ondk > x.ondk ? 1 : -1)).map((f) => ({
    address: f.address, ondkRaw: f.ondk.toString(), ondk: aTexto(f.ondk), origenRaw: f.origen.toString(), origen: aTexto(f.origen),
    clase: clase(f), nota: nota(f), fuente: fuente(f.address),
  })),
  ...reservas.filter((x) => x.ondk > 0n).map((x) => ({ address: x.address, ondkRaw: x.ondk.toString(), ondk: aTexto(x.ondk), clase: "SIN-RESOLVER", nota: "clave de mapping sin preimagen en las fuentes", fuente: "inventario" })),
];
const porClase = {};
for (const t of tenedores) { porClase[t.clase] ??= { n: 0, raw: 0n }; porClase[t.clase].n++; porClase[t.clase].raw += BigInt(t.ondkRaw); }
const permisos = [...resueltas.entries()].filter(([, v]) => v.tipo === "permiso").map(([clave, v]) => ({ clave, dueno: v.dueno, gastador: v.gastador, valorInventario: inventario[clave] }));

const censo = {
  formato: "sfsp-censo-ondk/v2",
  advertencia: "DATOS PERSONALES. No se versiona en el repositorio público.",
  resumen: {
    chainId: CHAIN_ID, contrato: ONDK, bloque: b.numero, hash: b.hash, timestamp: b.timestamp,
    totalSupplyRaw: totalSupply.toString(), totalSupply: aTexto(totalSupply),
    sumaConDireccionRaw: filas.reduce((s, f) => s + f.ondk, 0n).toString(),
    residuoSinClaveConocidaRaw: residuo.toString(), residuoSinClaveConocida: aTexto(residuo),
    inventario: { claves: Object.keys(inventario).length, mapping: claves.length, resueltas: resueltas.size, sinDireccion: pendientes.size },
    candidatas: candidatas.size, eventosTransfer: eventos.length,
    porClase: Object.fromEntries(Object.entries(porClase).map(([k, v]) => [k, { tenedores: v.n, ondk: aTexto(v.raw) }])),
    permisos,
  },
  tenedores,
};
escribir("censo-ondk.json", censo);
escribir("censo-ondk.csv", csv([["direccion", "ondk", "origen", "clase", "nota", "fuente"], ...tenedores.map((t) => [t.address, t.ondk, t.origen ?? "", t.clase, t.nota, t.fuente])]));
console.log(JSON.stringify(censo.resumen.porClase));
console.log(`totalSupply ${aTexto(totalSupply)} · con dirección ${aTexto(suma - reservas.reduce((s, x) => s + x.ondk, 0n))} · residuo sin clave conocida ${aTexto(residuo)}`);
