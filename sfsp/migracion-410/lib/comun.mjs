// Utilidades comunes de sfsp/migracion-410. SIN datos de personas: las rutas de
// entrada y salida apuntan FUERA del repositorio (scratchpad) y se pueden cambiar
// con variables de entorno. Nada aquí firma ni envía transacciones.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ_SFSP = join(AQUI, "..", "..");
// Las dependencias ya presentes en contracts/ (no se instala nada nuevo).
const req = createRequire(join(RAIZ_SFSP, "contracts", "package.json"));
const { defaultAbiCoder, Interface } = req("@ethersproject/abi");
const { keccak256 } = req("@ethersproject/keccak256");
const { concat, hexlify, zeroPad, hexZeroPad } = req("@ethersproject/bytes");
const { toUtf8Bytes } = req("@ethersproject/strings");
const { getAddress } = req("@ethersproject/address");
const { serialize: serializarTx } = req("@ethersproject/transactions");
export { defaultAbiCoder, Interface, keccak256, concat, hexlify, zeroPad, hexZeroPad, toUtf8Bytes, getAddress, serializarTx };

// ------------------------------------------------------------------ rutas
const SCRATCH = "/tmp/claude-0/-home-user/e5544210-9858-53e0-afa3-2eaf9db1bf5a/scratchpad";
export const RUTAS = {
  tenedores: process.env.TENEDORES || join(SCRATCH, "supply", "tenedores-clasificados.json"),
  censoOndk: process.env.CENSO_ONDK || join(SCRATCH, "ondk", "censo-ondk.json"),
  aceptacion: process.env.ACEPTACION || join(SCRATCH, "aceptacion", "Padron-Suministro-5550.xlsx"),
  salida: process.env.SALIDA || join(SCRATCH, "equipo-b"),
};
export const RPC = process.env.RPC || "https://rpc.ordenglobal-rpc.com/";
export const CHAIN_ID = 5550;

// ------------------------------------------------------------------ RPC de SÓLO LECTURA
// Lista blanca: cualquier otro método (eth_sendRawTransaction, eth_sendTransaction,
// eth_sign…) se rechaza aquí, antes de salir del proceso.
const METODOS_LECTURA = new Set([
  "eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_call", "eth_getBalance",
  "eth_getStorageAt", "eth_getLogs", "eth_gasPrice", "eth_getCode",
]);
let _id = 0;
export async function rpc(method, params) {
  if (!METODOS_LECTURA.has(method)) throw new Error(`método no permitido (sólo lectura): ${method}`);
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
      return j.result;
    } catch (e) {
      if (intento >= 4) throw e;
      await new Promise((ok) => setTimeout(ok, 400 * intento));
    }
  }
}

/** Lote JSON-RPC (misma lista blanca). `llamadas` = [[método, params], …]; devuelve los `result` (null si falló). */
export async function rpcLote(llamadas) {
  for (const [m] of llamadas) if (!METODOS_LECTURA.has(m)) throw new Error(`método no permitido (sólo lectura): ${m}`);
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(llamadas.map(([method, params], i) => ({ jsonrpc: "2.0", id: i, method, params }))),
      });
      const j = await r.json();
      const porId = new Map(j.map((x) => [x.id, x]));
      return llamadas.map((_, i) => (porId.get(i) && !porId.get(i).error ? porId.get(i).result : null));
    } catch (e) {
      if (intento >= 4) throw e;
      await new Promise((ok) => setTimeout(ok, 400 * intento));
    }
  }
}

export async function bloqueFijo(bloque) {
  const tag = bloque ? "0x" + BigInt(bloque).toString(16) : "latest";
  const b = await rpc("eth_getBlockByNumber", [tag, false]);
  const cid = Number(await rpc("eth_chainId", []));
  if (cid !== CHAIN_ID) throw new Error(`chainId ${cid} ≠ ${CHAIN_ID}`);
  return { numero: Number(b.number), hash: b.hash, timestamp: Number(b.timestamp), tag: b.number };
}

const ERC20 = new Interface(["function balanceOf(address) view returns (uint256)"]);
export async function balanceOf(token, addr, tag) {
  const data = ERC20.encodeFunctionData("balanceOf", [addr]);
  return BigInt(await rpc("eth_call", [{ to: token, data }, tag]));
}
export async function saldoNativo(addr, tag) {
  return BigInt(await rpc("eth_getBalance", [addr, tag]));
}
export async function leerRanura(token, ranura, tag) {
  return BigInt(await rpc("eth_getStorageAt", [token, ranura, tag]));
}

/** Lecturas en paralelo con tope de concurrencia. */
export async function enParalelo(items, fn, tope = 8) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(tope, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ------------------------------------------------------------------ unidades
export const E18 = 10n ** 18n;
export function aUnidades(texto, dec = 18) {
  const s = String(texto).trim();
  const [ent, frac = ""] = s.split(".");
  if (frac.length > dec) throw new Error(`demasiados decimales: ${s}`);
  return BigInt(ent || "0") * 10n ** BigInt(dec) + BigInt((frac + "0".repeat(dec)).slice(0, dec) || "0");
}
export function aTexto(raw, dec = 18) {
  const neg = raw < 0n; const v = neg ? -raw : raw;
  const ent = v / 10n ** BigInt(dec);
  const frac = (v % 10n ** BigInt(dec)).toString().padStart(dec, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + ent.toString() + (frac ? "." + frac : "");
}

// ------------------------------------------------------------------ Merkle
// IDÉNTICO a SFSPMigrationRegistry: hoja = keccak256(abi.encode(bytes32 migrationId,
// address beneficiary, uint256 oldUnits)); nodos = keccak256(abi.encodePacked(min, max))
// (pares ORDENADOS, `_verifyProof`); un nodo impar sube sin duplicar (como
// contracts/test/helpers.js · merkleTree).
export function hojaMigracion(migrationId, beneficiario, oldUnits) {
  return keccak256(defaultAbiCoder.encode(["bytes32", "address", "uint256"], [migrationId, beneficiario, BigInt(oldUnits).toString()]));
}
export function parOrdenado(a, b) {
  const [x, y] = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
  return keccak256(concat([x, y]));
}
export function arbol(hojas) {
  if (hojas.length === 0) throw new Error("árbol vacío");
  let nivel = hojas.slice();
  const capas = [nivel];
  while (nivel.length > 1) {
    const sig = [];
    for (let i = 0; i < nivel.length; i += 2) sig.push(i + 1 < nivel.length ? parOrdenado(nivel[i], nivel[i + 1]) : nivel[i]);
    nivel = sig;
    capas.push(nivel);
  }
  return { raiz: nivel[0], capas };
}
export function prueba(t, indice) {
  const out = [];
  let idx = indice;
  for (let l = 0; l < t.capas.length - 1; l++) {
    const capa = t.capas[l];
    const par = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (par < capa.length) out.push(capa[par]);
    idx = Math.floor(idx / 2);
  }
  return out;
}
/** Réplica de `_verifyProof` del contrato, para verificar fuera de cadena. */
export function verificarPrueba(pruebaArr, raiz, hoja) {
  let c = hoja;
  for (const s of pruebaArr) c = parOrdenado(c, s);
  return c.toLowerCase() === raiz.toLowerCase();
}
/** Orden canónico: por valor de hoja ascendente. Así el árbol es reproducible
 *  sin depender del orden de las filas de entrada. */
export function construirArbol(entradas, migrationId) {
  const conHoja = entradas.map((e) => ({ ...e, hoja: hojaMigracion(migrationId, e.address, e.oldUnits) }));
  conHoja.sort((a, b) => (BigInt(a.hoja) < BigInt(b.hoja) ? -1 : BigInt(a.hoja) > BigInt(b.hoja) ? 1 : 0));
  const t = arbol(conHoja.map((e) => e.hoja));
  conHoja.forEach((e, i) => { e.indice = i; e.prueba = prueba(t, i); });
  return { raiz: t.raiz, entradas: conHoja };
}

// ------------------------------------------------------------------ reserva por ranura
/** Ranura de saldo de un ERC-20 con `mapping(address=>uint256)` en la ranura `p`:
 *  keccak256(abi.encode(address, uint256 p)). */
export function ranuraDeSaldo(addr, p = 0) {
  return keccak256(defaultAbiCoder.encode(["address", "uint256"], [addr, p]));
}
/** «Huella» = clave del trie de almacenamiento = keccak256(ranura). */
export function huellaDeRanura(ranura) {
  return keccak256(ranura);
}
/** ¿La dirección es la dueña de la clave de reserva? Acepta «ranura:0x…» y «huella:0x…». */
export function direccionCorrespondeAClave(addr, clave, p = 0) {
  const r = ranuraDeSaldo(addr, p).toLowerCase();
  if (clave.startsWith("ranura:")) return r === clave.slice(7).toLowerCase();
  if (clave.startsWith("huella:")) return huellaDeRanura(r).toLowerCase() === clave.slice(7).toLowerCase();
  return false;
}
export const ETIQUETA_RESERVA = keccak256(toUtf8Bytes("SFSP.MIG.RESERVA_RANURA.v1"));
/** Hoja de la RAÍZ DE RESERVA (compromiso público, no se reclama en cadena con ella). */
export function hojaReserva(migrationId, clave, oldUnits) {
  const tipo = clave.startsWith("huella:") ? 1 : 0;
  return keccak256(defaultAbiCoder.encode(
    ["bytes32", "bytes32", "uint8", "bytes32", "uint256"],
    [ETIQUETA_RESERVA, migrationId, tipo, clave.slice(7), BigInt(oldUnits).toString()],
  ));
}

// ------------------------------------------------------------------ ids
/** migrationId textual `mig_` + 32 hex (CONTRATO-INTERNO §1) y su bytes32.
 *  Determinista para que el padrón sea reproducible: se deriva de la red, el
 *  contrato de origen y el bloque de corte. Se puede fijar con MIG_ID_<ACTIVO>. */
export function idMigracion(activo, contrato, bloqueCorte) {
  const fijo = process.env["MIG_ID_" + activo];
  const texto = fijo || "mig_" + keccak256(toUtf8Bytes(`SFSP-700|${CHAIN_ID}|${contrato.toLowerCase()}|${bloqueCorte}|${activo}`)).slice(2, 34);
  if (!/^mig_[0-9a-f]{32}$/.test(texto)) throw new Error(`migrationId mal formado: ${texto}`);
  // bytes32 = keccak256(utf8(texto)): el texto (36 bytes) no cabe en bytes32.
  return { texto, bytes32: keccak256(toUtf8Bytes(texto)) };
}

// ------------------------------------------------------------------ xlsx mínimo (sin dependencias)
function leerZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("xlsx: no es un zip");
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const archivos = {};
  for (let k = 0; k < n; k++) {
    const metodo = buf.readUInt16LE(off + 10);
    const tam = buf.readUInt32LE(off + 20);
    const ln = buf.readUInt16LE(off + 28), le = buf.readUInt16LE(off + 30), lc = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const nombre = buf.slice(off + 46, off + 46 + ln).toString("utf8");
    const lnl = buf.readUInt16LE(local + 26), lel = buf.readUInt16LE(local + 28);
    const datos = buf.slice(local + 30 + lnl + lel, local + 30 + lnl + lel + tam);
    archivos[nombre] = metodo === 8 ? inflateRawSync(datos) : datos;
    off += 46 + ln + le + lc;
  }
  return archivos;
}
const desXml = (s) => s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export function leerXlsx(ruta) {
  const z = leerZip(readFileSync(ruta));
  const ss = [];
  const sst = z["xl/sharedStrings.xml"] ? z["xl/sharedStrings.xml"].toString("utf8") : "";
  for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(desXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  const wb = z["xl/workbook.xml"].toString("utf8");
  const rels = z["xl/_rels/workbook.xml.rels"].toString("utf8");
  const destino = {};
  for (const m of rels.matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) destino[m[1]] = m[2];
  for (const m of rels.matchAll(/<Relationship [^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)) destino[m[2]] = m[1];
  const hojas = {};
  for (const m of wb.matchAll(/<sheet [^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const nombre = desXml(m[1]);
    const t = destino[m[2]].replace(/^\/?(xl\/)?/, "xl/");
    const xml = z[t].toString("utf8");
    const filas = [];
    for (const f of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const fila = [];
      for (const c of f[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+)\d+"/.exec(c[1])[1];
        let col = 0; for (const ch of ref) col = col * 26 + ch.charCodeAt(0) - 64;
        const tipo = (/t="([^"]+)"/.exec(c[1]) || [])[1];
        const cuerpo = c[2] || "";
        let v = (/<v>([\s\S]*?)<\/v>/.exec(cuerpo) || [])[1];
        if (tipo === "s") v = ss[Number(v)];
        else if (tipo === "inlineStr") v = desXml([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
        else if (v !== undefined) v = desXml(v);
        fila[col - 1] = v === undefined ? null : v;
      }
      filas.push(fila);
    }
    hojas[nombre] = filas;
  }
  return hojas;
}

// ------------------------------------------------------------------ salida
export function csv(filas) {
  const esc = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return filas.map((f) => f.map(esc).join(",")).join("\n") + "\n";
}
export function escribir(nombre, contenido) {
  mkdirSync(RUTAS.salida, { recursive: true });
  const ruta = join(RUTAS.salida, nombre);
  writeFileSync(ruta, typeof contenido === "string" ? contenido : JSON.stringify(contenido, null, 2) + "\n");
  return ruta;
}
export const norm = (a) => String(a).toLowerCase();

/** Separa candidatos en beneficiarios y excluidos por ser cuenta interna / de
 *  Orden Global / contrato. `internas`: Map o Set de direcciones en minúsculas. */
export function separarInternas(candidatos, internas) {
  const beneficiarios = [], excluidos = [];
  for (const c of candidatos) {
    const k = norm(c.address);
    if (internas.has(k)) excluidos.push({ ...c, motivos: internas.get ? internas.get(k) : ["interna"] });
    else beneficiarios.push(c);
  }
  return { beneficiarios, excluidos };
}
