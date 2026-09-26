#!/usr/bin/env node
// SFSP-700 / v0.3 §14.3 · Migración a la MISMA dirección por cupo del padrón.
//
// A partir del censo de tokens (`censo-tokens.json`, formato de censo-tokens-5550.mjs)
// genera, POR ACTIVO y SIN FIRMAR:
//   1. la orden de gobierno `SET_MINT_BUDGET` del cupo: S0 = suma de lo que se va a
//      acuñar, máximo por operación = el mayor saldo, `termsDocRoot` = raíz del padrón;
//   2. la lista de llamadas `SFSPIssuanceController.mintOnDemand(assetId, dirección,
//      oldUnits·ratio, paymentRef, evidenceRoot)`, una por titular, con
//        paymentRef   = keccak256(utf8("MIGRACION|<assetId hex minúsculas>|<dirección minúsculas>"))
//        evidenceRoot = raíz del padrón.
// Excluye contratos, cuentas internas, pendientes de revisión y el residuo sin
// titular (claves sin dirección), y lo dice: nunca excluye en silencio.
//
// Nada aquí firma, envía ni lee la red. Los DATOS se escriben en SALIDA, fuera del
// repositorio. Con --simular ejecuta todo en hardhat local (simular-lote-migracion.cjs).
//
// Uso:
//   CENSO=<censo-tokens.json> ACTIVOS=<activos.json> SALIDA=<carpeta fuera del repo> \
//   [INTERNAS=<internas.json>] [EMISOR=0x…] [VALIDO_HASTA=<unix>] [ORDEN_NO_ANTES=<unix>] \
//   [ORDEN_VENCE=<unix>] [BLOQUE_CORTE=<n>] node lote-migracion.mjs [--simular]
//
// activos.json (decisión D09/D26; lo que falte sale BLOCKED_DECISION):
//   { "<contrato heredado>": { "activo": "ONDK", "assetId": "0x<bytes32>",
//                              "ratio": { "num": "1", "den": "1" } } }
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHAIN_ID, keccak256, defaultAbiCoder, toUtf8Bytes, Interface, construirArbol, idMigracion, aTexto, aUnidades, norm,
} from "./lib/comun.mjs";

export const FORMATO = "sfsp-lote-migracion/v1";
const ZERO_ADDR = "0x" + "00".repeat(20);
const ZERO32 = "0x" + "00".repeat(32);
const b32 = (t) => { const r = toUtf8Bytes(t); if (r.length > 32) throw new Error("bytes32 largo"); return "0x" + Buffer.concat([Buffer.from(r), Buffer.alloc(32 - r.length)]).toString("hex"); };
const ACCION = b32("SET_MINT_BUDGET");
const BUDGET_TERMS_TAG = keccak256(toUtf8Bytes("SFSP.MINT_BUDGET.TERMS.v1"));
const DOMINIO = keccak256(toUtf8Bytes("SFSP-AUTH-v1"));
const TYPEHASH = keccak256(toUtf8Bytes(
  "SFSPAuthPayload(uint256 chainId,address verifyingContract,bytes32 action,bytes32 assetId,address origin,address destination,uint256 amount,uint256 amountSecondary,bytes32 nonce,uint64 notBefore,uint64 expiry,bytes32 evidenceRoot)",
));
const EMISOR_ABI = new Interface([
  "function mintOnDemand(bytes32 assetId, address destination, uint256 amount, bytes32 paymentRef, bytes32 evidenceRoot)",
  "function setMintBudget((uint256,address,bytes32,bytes32,address,address,uint256,uint256,bytes32,uint64,uint64,bytes32) p, bytes32 approvedDigest, uint64 period, uint64 validUntil, bytes32 termsDocRoot)",
]);
// Clases del censo que NUNCA reciben: la organización, contratos, lo pendiente y lo sin dueño.
const CLASES_EXCLUIDAS = { "INTERNA-OrdenGlobal": "cuenta interna (D25)", CONTRATO: "contrato", "EN-REVISION": "pendiente de decisión", "SIN-RESOLVER": "residuo sin titular (clave sin dirección)" };

/** paymentRef canónica: assetId y dirección SIEMPRE en hex minúsculas (LEEME, riesgo 7). */
export function paymentRefMigracion(assetId, direccion) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(assetId)) throw new Error("assetId no es bytes32: " + assetId);
  if (!/^0x[0-9a-fA-F]{40}$/.test(direccion)) throw new Error("dirección inválida: " + direccion);
  return keccak256(toUtf8Bytes(`MIGRACION|${assetId.toLowerCase()}|${direccion.toLowerCase()}`));
}
/** Igual que SFSPIssuanceController.budgetTermsRoot. */
export function budgetTermsRoot(period, validUntil, termsDocRoot) {
  return keccak256(defaultAbiCoder.encode(["bytes32", "uint64", "uint64", "bytes32"], [BUDGET_TERMS_TAG, String(period), String(validUntil), termsDocRoot]));
}
/** Digest SFSP-AUTH-v1 (idéntico a SFSPAuthorization.digestOf y test/orden-autorizada.js). */
export function digestPayload(p) {
  return keccak256(defaultAbiCoder.encode(
    ["bytes32", "bytes32", "uint256", "address", "bytes32", "bytes32", "address", "address", "uint256", "uint256", "bytes32", "uint64", "uint64", "bytes32"],
    [DOMINIO, TYPEHASH, String(p.chainId), p.verifyingContract, p.action, p.assetId, p.origin, p.destination, String(p.amount), String(p.amountSecondary), p.nonce, String(p.notBefore), String(p.expiry), p.evidenceRoot],
  ));
}
export const tuplaPayload = (p) => [String(p.chainId), p.verifyingContract, p.action, p.assetId, p.origin, p.destination, String(p.amount), String(p.amountSecondary), p.nonce, String(p.notBefore), String(p.expiry), p.evidenceRoot];

/**
 * Genera los lotes. Función pura: sin red, sin disco.
 * @param censo    contenido de censo-tokens.json
 * @param activos  { contrato: { activo, assetId, ratio:{num,den} } }
 * @param o        { internas:{dir:motivo}, emisor, chainId, validUntil, ordenNoAntes, ordenVence, bloqueCorte }
 */
export function generarLotes(censo, activos, o = {}) {
  if (!censo || censo.formato !== "sfsp-censo-tokens/v1") throw new Error("CENSO no tiene el formato sfsp-censo-tokens/v1");
  const internas = new Map(Object.entries(o.internas || {}).map(([k, v]) => [norm(k), v]));
  const chainId = o.chainId ?? CHAIN_ID;
  const emisor = o.emisor || null;
  const resumenes = new Map((censo.resumen.tokens || []).map((t) => [norm(t.contrato), t]));
  const lotes = [];
  for (const [contratoCfg, cfg] of Object.entries(activos)) {
    const contrato = norm(contratoCfg);
    const tok = censo.tokens[contrato] || censo.tokens[contratoCfg];
    const res = resumenes.get(contrato);
    const bloqueos = [];
    if (!tok || !res) { lotes.push({ contrato, activo: cfg.activo, estado: "BLOCKED_DECISION", bloqueos: ["el contrato no está en el censo"] }); continue; }
    if (!cfg.activo) bloqueos.push("falta el nombre del activo");
    if (!cfg.assetId || !/^0x[0-9a-fA-F]{64}$/.test(cfg.assetId)) bloqueos.push("falta el assetId del activo SFSP nuevo (D08/D26)");
    if (!cfg.ratio || !cfg.ratio.num || !cfg.ratio.den || BigInt(cfg.ratio.den) === 0n) bloqueos.push("falta el ratio de unidades (D09)");
    if (bloqueos.length) { lotes.push({ contrato, activo: cfg.activo || null, symbol: tok.symbol, estado: "BLOCKED_DECISION", bloqueos }); continue; }

    const assetId = cfg.assetId.toLowerCase();
    const num = BigInt(cfg.ratio.num), den = BigInt(cfg.ratio.den);
    const dec = res.decimals;
    const bloqueCorte = o.bloqueCorte ?? censo.resumen.bloque;
    const mig = idMigracion(cfg.activo, contrato, bloqueCorte);

    const vistos = new Set();
    const beneficiarios = [], excluidas = [], restos = [];
    let sumaCenso = 0n;
    for (const t of tok.tenedores) {
      const raw = BigInt(t.saldoRaw);
      sumaCenso += raw;
      const dir = String(t.address);
      const motivo = CLASES_EXCLUIDAS[t.clase]
        || (!/^0x[0-9a-fA-F]{40}$/.test(dir) ? "sin dirección" : null)
        || (internas.has(norm(dir)) ? "cuenta interna: " + internas.get(norm(dir)) : null)
        || (raw === 0n ? "saldo cero" : null);
      if (motivo) { excluidas.push({ address: dir, clase: t.clase, oldUnits: raw.toString(), motivo }); continue; }
      const k = norm(dir);
      if (vistos.has(k)) throw new Error(`dirección repetida en ${tok.symbol}: ${k}`);
      vistos.add(k);
      const monto = (raw * num) / den;
      const resto = (raw * num) % den;
      if (resto !== 0n) restos.push({ address: k, restoNumerador: resto.toString(), den: den.toString() });
      if (monto === 0n) { excluidas.push({ address: k, clase: t.clase, oldUnits: raw.toString(), motivo: "monto cero tras el ratio (resto anotado)" }); continue; }
      beneficiarios.push({ address: k, oldUnits: raw, monto });
    }
    if (!beneficiarios.length) { lotes.push({ contrato, activo: cfg.activo, symbol: tok.symbol, estado: "SIN_BENEFICIARIOS", excluidas }); continue; }

    // Padrón: hojas de SFSP-700 (migrationId, dirección, oldUnits), en orden canónico.
    const arbol = construirArbol(beneficiarios.map((b) => ({ address: b.address, oldUnits: b.oldUnits.toString() })), mig.bytes32);
    const raiz = arbol.raiz;
    const S0 = beneficiarios.reduce((s, b) => s + b.monto, 0n);
    const maxOp = beneficiarios.reduce((m, b) => (b.monto > m ? b.monto : m), 0n);
    const residuoRaw = res.residuoSinTitular !== undefined ? aUnidades(String(res.residuoSinTitular).replace(/^-/, ""), dec) * (String(res.residuoSinTitular).startsWith("-") ? -1n : 1n) : null;
    const totalSupply = res.totalSupply !== undefined ? aUnidades(res.totalSupply, dec) : null;

    // Orden SET_MINT_BUDGET. period = validUntil + 1 => toda la ventana cae en el periodo 0.
    const faltan = [];
    if (!o.validUntil) faltan.push("VALIDO_HASTA (fin de la ventana de migración)");
    if (!o.ordenNoAntes || !o.ordenVence) faltan.push("ORDEN_NO_ANTES / ORDEN_VENCE (vigencia de la orden)");
    if (!emisor) faltan.push("EMISOR (SFSPIssuanceController desplegado)");
    const period = o.validUntil ? BigInt(o.validUntil) + 1n : null;
    const payload = {
      chainId, verifyingContract: emisor || ZERO_ADDR, action: ACCION, assetId, origin: ZERO_ADDR, destination: ZERO_ADDR,
      amount: S0.toString(), amountSecondary: maxOp.toString(),
      nonce: keccak256(toUtf8Bytes(`MIGRACION_CUPO|${assetId}|${raiz.toLowerCase()}`)),
      notBefore: o.ordenNoAntes ? String(o.ordenNoAntes) : null, expiry: o.ordenVence ? String(o.ordenVence) : null,
      evidenceRoot: period ? budgetTermsRoot(period, o.validUntil, raiz) : null,
    };
    const orden = {
      accion: "SET_MINT_BUDGET", estado: faltan.length ? "BLOCKED_DECISION" : "LISTA_PARA_PROPONER", faltan, firmado: false,
      payload, period: period ? period.toString() : null, validUntil: o.validUntil ? String(o.validUntil) : null, termsDocRoot: raiz,
      digest: faltan.length ? null : digestPayload(payload),
      comprobacionPeriodoUnico: period ? "floor(t/period) = 0 para todo t < validUntil < period" : null,
      aprobacion: "proposeAuthorization(digest, \"SET_MINT_BUDGET\") + quórum + timelock; ejecutor TECH_OPS: setMintBudget(payload, digest, period, validUntil, termsDocRoot)",
    };

    const llamadas = arbol.entradas.map((e) => {
      const b = beneficiarios.find((x) => x.address === e.address);
      const paymentRef = paymentRefMigracion(assetId, b.address);
      return {
        indice: e.indice, address: b.address, oldUnits: b.oldUnits.toString(), monto: b.monto.toString(), hoja: e.hoja, prueba: e.prueba, paymentRef,
        mintOnDemand: {
          to: emisor || "PENDIENTE_DESPLIEGUE_SFSPIssuanceController", funcion: "mintOnDemand(bytes32,address,uint256,bytes32,bytes32)",
          args: { assetId, destination: b.address, amount: b.monto.toString(), paymentRef, evidenceRoot: raiz },
          data: EMISOR_ABI.encodeFunctionData("mintOnDemand", [assetId, b.address, b.monto.toString(), paymentRef, raiz]), value: "0x0", firmado: false,
        },
      };
    });

    lotes.push({
      contrato, activo: cfg.activo, symbol: tok.symbol, decimals: dec, assetId, estado: "GENERADO",
      migrationId: mig.texto, migrationIdBytes32: mig.bytes32, bloqueCorte,
      ratio: { num: num.toString(), den: den.toString() },
      raizPadron: raiz, S0: S0.toString(), S0Texto: num === den ? aTexto(S0, dec) : null, maxPorOperacion: maxOp.toString(),
      beneficiarios: llamadas.length, excluidas, restos,
      conciliacionCenso: {
        sumaTenedoresCenso: sumaCenso.toString(), residuoSinTitular: residuoRaw === null ? null : residuoRaw.toString(),
        totalSupply: totalSupply === null ? null : totalSupply.toString(),
        cuadra: totalSupply === null || residuoRaw === null ? null : sumaCenso + residuoRaw === totalSupply,
        sumaOldUnitsPadron: beneficiarios.reduce((s, b) => s + b.oldUnits, 0n).toString(),
        sumaExcluida: excluidas.reduce((s, x) => s + BigInt(x.oldUnits), 0n).toString(),
      },
      requisitos: {
        limites: `setInstrumentLimits(assetId, outstanding ≥ S0, cumulativeCap ≥ S0) por la Junta ANTES del cupo`,
        internas: "cruzar cada beneficiario con isInternalAccount (lectura); una coincidencia detiene el proceso",
        elegibilidad: "evaluateOperation(dir, assetId, \"MINT\", monto, 0) = ALLOW para cada uno; los que no, a otra ronda",
        emisor: "llave ISSUER; un OperationReplay es «ya migrado», no un error",
        cierre: "revokeMintBudget(assetId, \"MIGRACION_FIN\") al terminar",
      },
      orden, llamadas,
    });
  }
  return lotes;
}

// ------------------------------------------------------------------ CLI
const ES_PRINCIPAL = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (ES_PRINCIPAL) {
  const { CENSO, ACTIVOS, SALIDA } = process.env;
  if (!CENSO || !ACTIVOS || !SALIDA) throw new Error("faltan CENSO, ACTIVOS o SALIDA (la salida va FUERA del repositorio)");
  const raizRepo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  if (resolve(SALIDA).startsWith(raizRepo) && !process.env.PERMITIR_SALIDA_EN_REPO) throw new Error("SALIDA está dentro del repositorio: son datos personales");
  const leer = (r) => JSON.parse(readFileSync(r, "utf8"));
  const num = (v) => (v ? Number(v) : null);
  const lotes = generarLotes(leer(CENSO), leer(ACTIVOS), {
    internas: process.env.INTERNAS && existsSync(process.env.INTERNAS) ? leer(process.env.INTERNAS) : {},
    emisor: process.env.EMISOR || null,
    validUntil: num(process.env.VALIDO_HASTA), ordenNoAntes: num(process.env.ORDEN_NO_ANTES), ordenVence: num(process.env.ORDEN_VENCE),
    bloqueCorte: process.env.BLOQUE_CORTE ? Number(process.env.BLOQUE_CORTE) : undefined,
  });
  mkdirSync(SALIDA, { recursive: true });
  const salida = { formato: FORMATO, advertencia: "DATOS PERSONALES. SIN FIRMAR. No se versiona en el repositorio público.", generado: new Date().toISOString(), lotes };
  writeFileSync(join(SALIDA, "lote-migracion.json"), JSON.stringify(salida, null, 2) + "\n");
  for (const l of lotes) {
    if (l.estado !== "GENERADO") { console.log(`${l.symbol || l.contrato}: ${l.estado} — ${(l.bloqueos || []).join("; ")}`); continue; }
    writeFileSync(join(SALIDA, `lote-migracion-${l.activo}.mintOnDemand.json`), JSON.stringify(l.llamadas.map((c) => c.mintOnDemand), null, 2) + "\n");
    writeFileSync(join(SALIDA, `lote-migracion-${l.activo}.orden-cupo.json`), JSON.stringify(l.orden, null, 2) + "\n");
    console.log(`${l.activo} (${l.symbol}): ${l.beneficiarios} titulares · S0 ${l.S0Texto ?? l.S0 + " (unidades mínimas del activo nuevo)"} · máx/op ${l.maxPorOperacion} · excluidas ${l.excluidas.length} · raíz ${l.raizPadron} · orden ${l.orden.estado}${l.orden.faltan.length ? " (" + l.orden.faltan.join(", ") + ")" : ""} · censo cuadra: ${l.conciliacionCenso.cuadra}`);
  }
  if (process.argv.includes("--simular")) {
    const r = spawnSync("npx", ["hardhat", "run", join(raizRepo, "sfsp", "migracion-410", "simular-lote-migracion.cjs")], {
      cwd: join(raizRepo, "sfsp", "contracts"), stdio: "inherit",
      env: { ...process.env, NODE_USE_ENV_PROXY: "", LOTE: join(SALIDA, "lote-migracion.json"), HARDHAT_NETWORK: "hardhat" },
    });
    if (r.status !== 0) { console.error("el simulacro falló"); process.exit(1); }
  }
}
