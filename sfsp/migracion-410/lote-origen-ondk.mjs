#!/usr/bin/env node
// SFSP-410 · Lote «todo tenedor de ONDK con dirección conocida llega a ≥ 1 ORIGEN».
//
// 1. Lee EN VIVO (sólo lectura) el bloque más reciente: saldo de ONDK y de ORIGEN
//    de cada tenedor conocido (censo ONDK + receptores nuevos en eventos Transfer
//    posteriores al censo).
// 2. Excluye cuentas internas / de Orden Global / contratos; marca las direcciones
//    citadas en archivos de prueba y el estado de cada una en la hoja de aceptación.
// 3. Emite el lote en DOS formatos, SIN FIRMAR:
//      A · lista de transacciones nativas sin firmar (transición, desde la
//          cuenta que decida la Junta) y
//      B · llamadas `SFSPNativeVault.releaseOnDemand(destino, monto, paymentRef, evidenceRoot)`.
// 4. Con --simular, ejecuta el lote B en una cadena hardhat LOCAL en memoria
//    (simular-lote-origen.cjs) y comprueba que todos quedan en ≥ 1 ORIGEN.
//
// Nunca firma ni envía nada a una red real.
// Uso:  NODE_USE_ENV_PROXY=1 node lote-origen-ondk.mjs [--simular]
//   BLOQUE=<n>  fija el bloque de lectura (por defecto, el último)
//   BOVEDA=0x…  dirección de SFSPNativeVault cuando exista (si no, marcador)
import {
  RUTAS, CHAIN_ID, rpc, bloqueFijo, balanceOf, saldoNativo, enParalelo, leerXlsx, escribir, csv, norm,
  aTexto, E18, keccak256, defaultAbiCoder, toUtf8Bytes, Interface, arbol, prueba, hexZeroPad,
} from "./lib/comun.mjs";
import { clasificar } from "./lib/clasificacion.mjs";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { AQUI, RAIZ_SFSP } from "./lib/comun.mjs";

const OBJETIVO = BigInt(process.env.OBJETIVO_WEI || E18.toString()); // 1 ORIGEN
// La foto clasificada y la hoja de aceptación son opcionales: sin hoja nadie es
// «firme» (todo el lote queda para decisión) y la clase sale del censo.
const tenedores = existsSync(RUTAS.tenedores) ? JSON.parse(readFileSync(RUTAS.tenedores, "utf8")) : { activos: [] };
const censo = JSON.parse(readFileSync(RUTAS.censoOndk, "utf8"));
const hojas = existsSync(RUTAS.aceptacion) ? leerXlsx(RUTAS.aceptacion) : {};
if (!existsSync(RUTAS.aceptacion)) console.log("sin hoja de aceptación: ningún envío es firme; la clase sale del censo");
const { internas, mencionesPrueba, contratos } = clasificar(tenedores, censo, hojas);
const ONDK = contratos.ONDK || norm(censo.resumen.contrato);

// Estado de cada dirección en la hoja de aceptación, para ONDK y para ORIGEN.
const estadoHoja = (asset, addr) => {
  const k = norm(addr);
  if ((hojas["Usuarios (se conservan)"] || []).some((f) => f[0] === asset && norm(f[1] || "") === k)) return "USUARIO";
  const r = (hojas["En revisión"] || []).find((f) => f[0] === asset && norm(f[1] || "") === k);
  if (r) return "EN_REVISION(" + (String(r[4] || "").trim() || "pendiente") + ")";
  if ((hojas["Se elimina"] || []).some((f) => f[0] === asset && norm(f[1] || "") === k)) return "SE_ELIMINA";
  const c = censo.tenedores.find((t) => norm(t.address) === k);
  return c ? "SIN_HOJA(censo: " + c.clase + ")" : "AUSENTE";
};

const b = await bloqueFijo(process.env.BLOQUE);
console.log(`bloque ${b.numero} (${new Date(b.timestamp * 1000).toISOString()})`);

// Tenedores conocidos: censo + receptores de Transfer posteriores al censo.
const conocidos = new Set(censo.tenedores.filter((t) => t.address.startsWith("0x")).map((t) => norm(t.address)));
const TRANSFER = keccak256(toUtf8Bytes("Transfer(address,address,uint256)"));
const desde = Number(censo.resumen.bloque) + 1;
let nuevos = [];
if (b.numero >= desde) {
  const logs = await rpc("eth_getLogs", [{ address: ONDK, topics: [TRANSFER], fromBlock: "0x" + desde.toString(16), toBlock: b.tag }]);
  for (const l of logs) {
    const para = "0x" + l.topics[2].slice(26);
    if (!conocidos.has(para)) { conocidos.add(para); nuevos.push(para); }
  }
  console.log(`eventos Transfer de ONDK desde el censo (${desde}..${b.numero}): ${logs.length}; receptores nuevos: ${nuevos.length}`);
}

const filas = [...conocidos].map((address) => ({ address }));
await enParalelo(filas, async (f) => {
  f.ondk = await balanceOf(ONDK, f.address, b.tag);
  f.origen = await saldoNativo(f.address, b.tag);
  f.codigo = (await rpc("eth_getCode", [f.address, b.tag])) !== "0x";
});
const tenedoresVivos = filas.filter((f) => f.ondk > 0n);
const excluidas = [];
const items = [];
for (const f of tenedoresVivos) {
  if (internas.has(f.address) || f.codigo) { excluidas.push({ address: f.address, ondk: aTexto(f.ondk), origen: aTexto(f.origen), motivos: internas.get(f.address) || ["tiene código (contrato)"] }); continue; }
  const faltante = f.origen >= OBJETIVO ? 0n : OBJETIVO - f.origen;
  items.push({
    address: f.address, ondk: f.ondk, origenActual: f.origen, faltante,
    estadoHojaONDK: estadoHoja("ONDK", f.address), estadoHojaORIGEN: estadoHoja("ORIGEN", f.address),
    citadaEnArchivoDePrueba: mencionesPrueba.get(f.address) || null,
    nuevaDesdeCenso: nuevos.includes(f.address),
  });
}
items.sort((x, y) => (y.ondk > x.ondk ? 1 : y.ondk < x.ondk ? -1 : 0));
const aEnviar = items.filter((i) => i.faltante > 0n);
// Firme = usuario confirmado en la hoja de ONDK y sin marca de archivo de prueba.
const esFirme = (i) => i.estadoHojaONDK === "USUARIO" && !i.citadaEnArchivoDePrueba;

// Raíz del lote = evidenceRoot de cada llamada (compromete destino y monto de todo el lote).
const ETIQ = keccak256(toUtf8Bytes("SFSP410.LOTE_ORIGEN_ONDK.v1"));
const hojaLote = (i) => keccak256(defaultAbiCoder.encode(["bytes32", "address", "uint256"], [ETIQ, i.address, i.faltante.toString()]));
const ordenLote = aEnviar.map((i) => ({ i, h: hojaLote(i) })).sort((a, c) => (BigInt(a.h) < BigInt(c.h) ? -1 : 1));
const raizLote = ordenLote.length ? arbol(ordenLote.map((x) => x.h)).raiz : null;
const tLote = ordenLote.length ? arbol(ordenLote.map((x) => x.h)) : null;
ordenLote.forEach((x, k) => { x.i.pruebaLote = prueba(tLote, k); x.i.hojaLote = x.h; });

const BOVEDA = process.env.BOVEDA || null;
const VAULT = new Interface(["function releaseOnDemand(address destination, uint256 amount, bytes32 paymentRef, bytes32 evidenceRoot)"]);
const gasPrice = await rpc("eth_gasPrice", []);
for (const i of aEnviar) {
  i.paymentRef = keccak256(defaultAbiCoder.encode(["bytes32", "uint256", "uint256", "address"], [ETIQ, CHAIN_ID, b.numero, i.address]));
  i.txSinFirmar = { chainId: CHAIN_ID, from: null, to: i.address, value: "0x" + i.faltante.toString(16), data: "0x", gasLimit: "0x5208", gasPrice, nonce: null, firmado: false };
  i.releaseOnDemand = {
    to: BOVEDA || "PENDIENTE_DESPLIEGUE_SFSPNativeVault",
    funcion: "releaseOnDemand(address,uint256,bytes32,bytes32)",
    args: { destination: i.address, amount: i.faltante.toString(), paymentRef: i.paymentRef, evidenceRoot: raizLote },
    data: VAULT.encodeFunctionData("releaseOnDemand", [i.address, i.faltante.toString(), i.paymentRef, raizLote]),
    value: "0x0", firmado: false,
  };
}
const suma = (xs) => xs.reduce((s, i) => s + i.faltante, 0n);
const maxOp = aEnviar.reduce((m, i) => (i.faltante > m ? i.faltante : m), 0n);
const ser = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === "bigint" ? v.toString() : v)));

const lote = {
  formato: "sfsp-lote-origen-ondk/v1",
  advertencia: "DATOS PERSONALES. SIN FIRMAR. No se versiona en el repositorio público.",
  chainId: CHAIN_ID, bloque: b, objetivoWei: OBJETIVO.toString(), objetivo: aTexto(OBJETIVO),
  fuenteTenedores: { censoBloque: censo.resumen.bloque, receptoresNuevosDesdeCenso: nuevos.length },
  totales: {
    tenedoresOndkConDireccion: tenedoresVivos.length,
    excluidosInternos: excluidas.length,
    evaluados: items.length,
    yaTienen1: items.length - aEnviar.length,
    necesitan: aEnviar.length,
    origenTotalWei: suma(aEnviar).toString(), origenTotal: aTexto(suma(aEnviar)),
    firmes: aEnviar.filter(esFirme).length, origenFirmeWei: suma(aEnviar.filter(esFirme)).toString(), origenFirme: aTexto(suma(aEnviar.filter(esFirme))),
    requierenJose: aEnviar.filter((i) => !esFirme(i)).length, origenRequiereJose: aTexto(suma(aEnviar.filter((i) => !esFirme(i)))),
    citadasEnPruebas: aEnviar.filter((i) => i.citadaEnArchivoDePrueba).length,
    sinDireccion_reservaOndk: censo.tenedores.filter((t) => t.clase === "SIN-RESOLVER").length,
    peorCasoSinDireccion: aTexto(BigInt(censo.tenedores.filter((t) => t.clase === "SIN-RESOLVER").length) * OBJETIVO),
  },
  raizLote, etiquetaLote: ETIQ,
  requisitosDeEjecucion: {
    cupo: { perPeriodMinimoWei: suma(aEnviar).toString(), maxPerOperationMinimoWei: maxOp.toString(), accion: "SET_RELEASE_BUDGET (quórum + timelock, SFSP-410 R5)" },
    boveda: BOVEDA || "SFSPNativeVault no desplegada en 5550",
    identidad: "cada destino debe ser elegible (engine.evaluateOperation MINT sobre el assetId de ORIGEN): alta de identidad por propósito",
    ejecutor: "llave ISSUER de servicio (sin poder de aprobación)",
    formatoA: "sólo transición: SFSP-410 §4 manda liberar desde la bóveda; un envío directo desde una cuenta interna exige decisión D23/D25",
  },
  items: ser(items),
  excluidas,
};
escribir("lote-origen-ondk.json", lote);
escribir("lote-origen-ondk.csv", csv([
  ["direccion", "ondk", "origen_actual", "enviar_origen", "enviar_wei", "firme", "estado_hoja_ONDK", "estado_hoja_ORIGEN", "citada_en_prueba", "paymentRef"],
  ...items.map((i) => [i.address, aTexto(i.ondk), aTexto(i.origenActual), aTexto(i.faltante), i.faltante.toString(), i.faltante > 0n ? (esFirme(i) ? "SI" : "NO (José)") : "-", i.estadoHojaONDK, i.estadoHojaORIGEN, i.citadaEnArchivoDePrueba ? i.citadaEnArchivoDePrueba.join(" | ") : "", i.paymentRef || ""]),
  ...excluidas.map((e) => [e.address, e.ondk, e.origen, "0", "0", "EXCLUIDA (interna)", "", "", "", e.motivos.join(" | ")]),
]));
escribir("lote-origen-ondk.tx-sin-firmar.json", ser(aEnviar.map((i) => i.txSinFirmar)));
escribir("lote-origen-ondk.releaseOnDemand.json", ser(aEnviar.map((i) => i.releaseOnDemand)));
console.log(`tenedores ONDK con dirección: ${tenedoresVivos.length} · excluidos internos: ${excluidas.length} · necesitan ORIGEN: ${aEnviar.length} · total ${aTexto(suma(aEnviar))} ORIGEN (firme ${lote.totales.origenFirme}) · raíz del lote ${raizLote}`);

if (process.argv.includes("--simular")) {
  const contratosDir = join(RAIZ_SFSP, "contracts");
  const r = spawnSync("npx", ["hardhat", "run", join(AQUI, "..", "simular-lote-origen.cjs")], {
    cwd: contratosDir, stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "", LOTE: join(RUTAS.salida, "lote-origen-ondk.json"), SALIDA: RUTAS.salida, HARDHAT_NETWORK: "hardhat" },
  });
  if (r.status !== 0) { console.error("la simulación falló"); process.exit(1); }
}
