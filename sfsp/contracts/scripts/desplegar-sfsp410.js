#!/usr/bin/env node
"use strict";
/* Despliegue SFSP-410 · "el circulante es lo que tienen los usuarios".
 *
 * Despliega y cablea, en orden, a partir de un archivo de parámetros
 * (deploy/sfsp410/parametros.plantilla.json):
 *
 *   gobierno → registro → identidad → motor de elegibilidad → controlador de
 *   emisión → registro de migraciones → bóveda de ORIGEN → un SFSPRegulatedAsset
 *   por activo → cableado → pasaportes → topes → cuentas internas → roles
 *   definitivos → el desplegador se quita TODO → comprobación con hasRole.
 *
 * Lo que NO hace: aprobar nada. Las políticas de elegibilidad y los cupos exigen
 * doble control y espera (SFSP-800 §12, SFSP-410 R5); el script los deja
 * PREPARADOS como órdenes (payload + digest) para que los firmantes los propongan
 * y aprueben, y TECH_OPS los ejecute pasada la espera.
 *
 * Uso:
 *   node scripts/desplegar-sfsp410.js --parametros <archivo.json> [--salida <archivo.json>]
 *        [--red <red de hardhat>]          (por defecto: red en proceso "hardhat")
 *        [--rpc <url del firmante>]        (sólo despliegue real, con --real)
 *        [--real]
 *
 * Salvaguardas:
 *   · Un solo `null` en los parámetros → BLOCKED_DECISION (código de salida 9) y
 *     la lista de lo que falta. No se elige ningún valor por defecto.
 *   · Cualquier red que no sea Hardhat local (en proceso o nodo en 127.0.0.1)
 *     exige --real Y la variable DESPLIEGUE_AUTORIZADO igual al SHA-256 del
 *     archivo de parámetros exacto. Cambiar un byte del archivo invalida la
 *     autorización. Un archivo marcado "sintetico": true nunca va a red real.
 *   · En red real además: chainId y genesisHash del nodo = los del archivo, la
 *     Junta tiene que ser un contrato (multifirma) y el desplegador tiene que
 *     estar entre las cuentas del firmante externo (hardware). El script no lee,
 *     no pide y no guarda llaves.
 *   · El desplegador nunca queda con un rol: se revoca todo y se comprueba.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Interface, defaultAbiCoder } = require("@ethersproject/abi");
const { keccak256 } = require("@ethersproject/keccak256");
const { toUtf8Bytes } = require("@ethersproject/strings");
const { hexlify } = require("@ethersproject/bytes");
const { getAddress } = require("@ethersproject/address");

const RAIZ = path.join(__dirname, "..");
const COD = { BLOCKED_DECISION: 9, DENY_AUTHORIZATION: 5, ERROR: 1 };

// --------------------------------------------------------------- utilidades

const ZERO32 = "0x" + "00".repeat(32);
const ZERO_ADDR = "0x" + "00".repeat(20);

function b32(text) {
  const raw = toUtf8Bytes(text);
  if (raw.length > 32) throw new Error("bytes32 demasiado largo: " + text);
  const out = new Uint8Array(32);
  out.set(raw, 0);
  return hexlify(out);
}

/** Texto corto o bytes32 en hex, tal como lo escribe la Junta. */
function aB32(v, campo) {
  if (typeof v !== "string" || v.length === 0) throw new ErrorParametros(`${campo}: se esperaba texto o bytes32`);
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase();
  return b32(v);
}

function hex(n) {
  return "0x" + BigInt(n).toString(16);
}

class ErrorParametros extends Error {}
class Bloqueado extends Error {
  constructor(codigo, mensaje, detalle) {
    super(mensaje);
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

function sha256Archivo(ruta) {
  return crypto.createHash("sha256").update(fs.readFileSync(ruta)).digest("hex");
}

function leerArtefacto(nombre) {
  const ruta = path.join(RAIZ, "artifacts", "src", `${nombre}.sol`, `${nombre}.json`);
  if (!fs.existsSync(ruta)) throw new Error(`falta el artefacto ${nombre}: correr 'npx hardhat compile'`);
  return JSON.parse(fs.readFileSync(ruta, "utf8"));
}

/** Todas las rutas con `null`. Las claves que empiezan por "_" son comentarios. */
function nulos(x, ruta = "", out = []) {
  if (x === null || x === undefined) out.push(ruta || "(raiz)");
  else if (Array.isArray(x)) x.forEach((v, i) => nulos(v, `${ruta}[${i}]`, out));
  else if (typeof x === "object") {
    for (const [k, v] of Object.entries(x)) if (!k.startsWith("_")) nulos(v, ruta ? `${ruta}.${k}` : k, out);
  }
  return out;
}

const ENUM = {
  legal: ["UNCLASSIFIED", "UNDER_REVIEW", "CLASSIFIED", "RESTRICTED_BY_LAW"],
  admission: ["DRAFT", "REVIEW", "APPROVED", "REJECTED", "WITHDRAWN"],
  trading: ["NOT_LISTED", "LISTED", "SUSPENDED", "DELISTED"],
  transferability: ["FREE", "RESTRICTED", "FROZEN"],
  redemption: ["NONE", "AVAILABLE", "SUSPENDED"],
};
function enumDe(eje, valor, campo) {
  const i = ENUM[eje].indexOf(valor);
  if (i < 0) throw new ErrorParametros(`${campo}: '${valor}' no es uno de ${ENUM[eje].join("/")}`);
  return i;
}

function dir(v, campo) {
  try {
    return getAddress(v);
  } catch {
    throw new ErrorParametros(`${campo}: dirección inválida (${v})`);
  }
}

function entero(v, campo, { min = 0n } = {}) {
  let n;
  try {
    n = BigInt(v);
  } catch {
    throw new ErrorParametros(`${campo}: se esperaba un entero (${v})`);
  }
  if (n < min) throw new ErrorParametros(`${campo}: debe ser >= ${min}`);
  return n;
}

// --------------------------------------------------------------- validación

/** Comprueba forma y coherencia. Devuelve una vista normalizada. */
function validar(P) {
  const faltan = nulos(P);
  if (faltan.length > 0) {
    throw new Bloqueado(COD.BLOCKED_DECISION, `BLOCKED_DECISION: ${faltan.length} parámetro(s) sin decidir`, faltan);
  }
  const g = P.gobierno;
  const firmantes = g.firmantes.map((a, i) => dir(a, `gobierno.firmantes[${i}]`));
  if (new Set(firmantes.map((a) => a.toLowerCase())).size !== firmantes.length) {
    throw new ErrorParametros("gobierno.firmantes: hay direcciones repetidas");
  }
  const quorum = Number(entero(g.quorum, "gobierno.quorum", { min: 1n }));
  const quorumUpgrade = Number(entero(g.quorumUpgrade, "gobierno.quorumUpgrade", { min: 1n }));
  // El proponente no aprueba (§12.5): hace falta quorum + 1 firmantes distintos.
  if (quorum + 1 > firmantes.length) throw new ErrorParametros("gobierno: quorum+1 > firmantes (el proponente no cuenta como aprobador)");
  if (quorumUpgrade < quorum || quorumUpgrade + 1 > firmantes.length) {
    throw new ErrorParametros("gobierno.quorumUpgrade: debe ser >= quorum y quorumUpgrade+1 <= firmantes");
  }
  const timelock = entero(g.timelockSegundos, "gobierno.timelockSegundos", { min: 1n });
  const maxPausa = entero(g.pausaMaximaSegundos, "gobierno.pausaMaximaSegundos", { min: 1n });
  const vigencia = entero(g.vigenciaOrdenesSegundos, "gobierno.vigenciaOrdenesSegundos", { min: 1n });
  if (vigencia <= timelock) throw new ErrorParametros("gobierno.vigenciaOrdenesSegundos debe ser mayor que timelockSegundos");

  const r = P.roles;
  const roles = {};
  for (const k of ["junta", "techOps", "emisor", "atestador", "atestadorMigracion", "auditor"]) roles[k] = dir(r[k], `roles.${k}`);
  const desplegador = dir(P.desplegador, "desplegador");
  const d = desplegador.toLowerCase();
  if (Object.values(roles).some((a) => a.toLowerCase() === d) || firmantes.some((a) => a.toLowerCase() === d)) {
    throw new ErrorParametros("desplegador: no puede ser la Junta, un firmante ni un rol operativo (nunca retiene poder)");
  }
  if (firmantes.some((a) => a.toLowerCase() === roles.techOps.toLowerCase() || a.toLowerCase() === roles.emisor.toLowerCase())) {
    throw new ErrorParametros("roles: TECH_OPS y ISSUER ejecutan y nunca aprueban; no pueden ser firmantes (ADR-014)");
  }
  // REV-410-10 · separación de funciones: la llave de servicio que emite
  // (ISSUER, caliente) no puede ser la que ejecuta órdenes de cupo y marca
  // cuentas (TECH_OPS), ni la Junta ser una de las dos.
  if (roles.techOps.toLowerCase() === roles.emisor.toLowerCase()) {
    throw new ErrorParametros("roles: techOps y emisor tienen que ser direcciones distintas (separación de funciones)");
  }
  if ([roles.techOps, roles.emisor].some((a) => a.toLowerCase() === roles.junta.toLowerCase())) {
    throw new ErrorParametros("roles: la Junta no puede ser techOps ni emisor");
  }

  const ci = P.cuentasInternas;
  if (ci.confirmadaPorActa !== true) {
    throw new Bloqueado(COD.BLOCKED_DECISION, "BLOCKED_DECISION: cuentasInternas.confirmadaPorActa no es true (D25)", ["cuentasInternas.confirmadaPorActa"]);
  }
  const internas = ci.lista.map((c, i) => ({ ...c, direccion: dir(c.direccion, `cuentasInternas.lista[${i}]`) }));
  if (new Set(internas.map((c) => c.direccion.toLowerCase())).size !== internas.length) {
    throw new ErrorParametros("cuentasInternas.lista: direcciones repetidas");
  }
  if (internas.length > 64) throw new ErrorParametros("cuentasInternas.lista: la bóveda admite 64 como máximo");
  const genesis = entero(P.origen.genesisSupply, "origen.genesisSupply", { min: 1n });
  if (genesis !== 10n ** 12n * 10n ** 18n) throw new ErrorParametros("origen.genesisSupply: se esperaba 1e12 * 1e18 (dato del génesis)");

  const politica = (pol, campo, conCupo) => {
    if (pol.requiresAuthorization === true && conCupo) {
      throw new ErrorParametros(`${campo}: requiresAuthorization=true es incompatible con emisión/liberación bajo demanda (mintOnDemand evalúa sin contexto de autorización)`);
    }
    if (pol.jurisdictionAllowlist === true && (!Array.isArray(pol.jurisdiccionesPermitidas) || pol.jurisdiccionesPermitidas.length === 0)) {
      throw new ErrorParametros(`${campo}: jurisdictionAllowlist=true exige jurisdiccionesPermitidas no vacía`);
    }
    return {
      acciones: pol.acciones,
      requiresHumanReview: !!pol.requiresHumanReview,
      requiresAuthorization: !!pol.requiresAuthorization,
      jurisdictionAllowlist: !!pol.jurisdictionAllowlist,
      jurisdicciones: (pol.jurisdiccionesPermitidas || []).map((j, i) => aB32(j, `${campo}.jurisdiccionesPermitidas[${i}]`)),
      requiredPurpose: pol.requiredPurpose === "NINGUNO" ? ZERO32 : aB32(pol.requiredPurpose, `${campo}.requiredPurpose`),
      maxAmount: entero(pol.maxAmount, `${campo}.maxAmount`),
    };
  };
  const cupo = (c, campo) => {
    const perPeriod = entero(c.perPeriod, `${campo}.perPeriod`, { min: 1n });
    const maxPerOperation = entero(c.maxPerOperation, `${campo}.maxPerOperation`, { min: 1n });
    if (maxPerOperation > perPeriod) throw new ErrorParametros(`${campo}: maxPerOperation > perPeriod`);
    return {
      perPeriod,
      maxPerOperation,
      period: entero(c.period, `${campo}.period`, { min: 1n }),
      validUntil: entero(c.validUntil, `${campo}.validUntil`, { min: 1n }),
      termsDocRoot: aB32(c.termsDocRoot, `${campo}.termsDocRoot`),
    };
  };

  const activos = P.activos.map((a, i) => {
    const campo = `activos[${i}]`;
    const conCupo = typeof a.cupoEmision === "object";
    const out = {
      simbolo: a.simbolo,
      assetId: aB32(a.assetId, `${campo}.assetId`),
      decimales: Number(a.decimales),
      erc20Interop: a.erc20Interop === true,
      outstandingLimit: entero(a.limites.outstandingLimit, `${campo}.limites.outstandingLimit`),
      cumulativeCap: entero(a.limites.cumulativeCap, `${campo}.limites.cumulativeCap`),
      cupo: conCupo ? cupo(a.cupoEmision, `${campo}.cupoEmision`) : null,
      pasaporte: a.pasaporte,
      politica: politica(a.politicaElegibilidad, `${campo}.politicaElegibilidad`, conCupo),
    };
    if (out.cupo && out.cupo.perPeriod > out.outstandingLimit) {
      throw new ErrorParametros(`${campo}: cupo por periodo mayor que el tope de stock`);
    }
    return out;
  });
  if (new Set(activos.map((a) => a.assetId)).size !== activos.length) throw new ErrorParametros("activos: assetId repetido");

  return {
    firmantes,
    quorum,
    quorumUpgrade,
    timelock,
    maxPausa,
    vigencia,
    roles,
    desplegador,
    internas,
    genesis,
    origen: {
      assetId: aB32(P.origen.assetId, "origen.assetId"),
      pasaporte: P.origen.pasaporte,
      politica: politica(P.origen.politicaElegibilidad, "origen.politicaElegibilidad", true),
      cupo: cupo(P.origen.cupoLiberacion, "origen.cupoLiberacion"),
    },
    activos,
  };
}

// --------------------------------------------------------------- transporte

/** Proveedor mínimo: `request({method, params})`. */
function proveedorHttp(url) {
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
  let dispatcher;
  if (!local && (process.env.HTTPS_PROXY || process.env.https_proxy)) {
    const { ProxyAgent } = require("undici");
    dispatcher = new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy);
  }
  const { fetch } = require("undici");
  let id = 0;
  return {
    local,
    url,
    async request({ method, params = [] }) {
      const r = await fetch(url, {
        method: "POST",
        dispatcher,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
      const j = await r.json();
      if (j.error) {
        const e = new Error(j.error.message);
        e.data = j.error.data;
        throw e;
      }
      return j.result;
    },
  };
}

class Contrato {
  constructor(ctx, nombre, address, abi) {
    this.ctx = ctx;
    this.nombre = nombre;
    this.address = address;
    this.iface = new Interface(abi);
  }
  async call(fn, args = []) {
    const data = this.iface.encodeFunctionData(fn, args);
    const ret = await this.ctx.rpc("eth_call", [{ to: this.address, data }, "latest"]);
    const dec = this.iface.decodeFunctionResult(fn, ret);
    return dec.length === 1 ? dec[0] : dec;
  }
  async send(fn, args = [], opciones = {}) {
    const data = this.iface.encodeFunctionData(fn, args);
    return this.ctx.enviar(`${this.nombre}.${fn}`, { to: this.address, data, value: opciones.value }, opciones.from);
  }
}

/** Contexto de transacciones: registra gas por paso y por transacción. */
function crearContexto(prov, { from, gasPrecioCero, topeGas, log }) {
  const ctx = {
    prov,
    from,
    paso: "(sin paso)",
    txs: [],
    log: log || (() => {}),
    rpc: (method, params = []) => prov.request({ method, params }),
    async enviar(etiqueta, tx, fromOverride) {
      const full = { from: fromOverride || ctx.from, ...tx };
      if (full.value === undefined) delete full.value;
      else full.value = hex(full.value);
      if (gasPrecioCero) full.gasPrice = "0x0";
      if (!full.gas) {
        const est = BigInt(await ctx.rpc("eth_estimateGas", [full]));
        let g = (est * 13n) / 10n + 21000n;
        if (g > topeGas) g = topeGas;
        full.gas = hex(g);
      }
      const hash = await ctx.rpc("eth_sendTransaction", [full]);
      let rec = null;
      for (let i = 0; i < 600 && !rec; i++) {
        rec = await ctx.rpc("eth_getTransactionReceipt", [hash]);
        if (!rec) await new Promise((ok) => setTimeout(ok, 1000));
      }
      if (!rec) throw new Error(`sin recibo para ${etiqueta} (${hash})`);
      if (rec.status !== "0x1") throw new Error(`transacción revertida: ${etiqueta} (${hash})`);
      const gasUsed = Number(BigInt(rec.gasUsed));
      ctx.txs.push({ paso: ctx.paso, etiqueta, hash, bloque: Number(BigInt(rec.blockNumber)), gasUsed, from: full.from });
      return rec;
    },
    async desplegar(nombre, args) {
      const art = leerArtefacto(nombre);
      const iface = new Interface(art.abi);
      const data = art.bytecode + iface.encodeDeploy(args).slice(2);
      const rec = await ctx.enviar(`deploy ${nombre}`, { data });
      const c = new Contrato(ctx, nombre, getAddress(rec.contractAddress), art.abi);
      const code = await ctx.rpc("eth_getCode", [c.address, "latest"]);
      c.despliegue = {
        address: c.address,
        txHash: rec.transactionHash,
        bloque: Number(BigInt(rec.blockNumber)),
        gasUsed: Number(BigInt(rec.gasUsed)),
        runtimeCodeHash: keccak256(code),
        argumentosConstructor: args.map((a) => (typeof a === "bigint" ? a.toString() : a)),
      };
      ctx.log(`  ${nombre.padEnd(26)} ${c.address}  gas ${c.despliegue.gasUsed}`);
      return c;
    },
  };
  return ctx;
}

// --------------------------------------------------------------- red

async function comprobarRed(prov, P, { real, rutaParametros, modo }) {
  const chainId = Number(BigInt(await prov.request({ method: "eth_chainId", params: [] })));
  let cliente = "";
  try {
    cliente = await prov.request({ method: "web3_clientVersion", params: [] });
  } catch {
    cliente = "(desconocido)";
  }
  const esHardhat = /^HardhatNetwork/i.test(cliente);
  const local = esHardhat && (modo === "proceso" || prov.local === true);
  const bloque0 = await prov.request({ method: "eth_getBlockByNumber", params: ["0x0", false] });
  const genesisHash = bloque0 && bloque0.hash;

  if (local) {
    // Hardhat local (en proceso o nodo en 127.0.0.1). Con chainId 5550 es una
    // BIFURCACIÓN local: nada de lo que se envía aquí sale de esta máquina.
    return { chainId, cliente, genesisHash, tipo: chainId === 5550 ? "BIFURCACION_LOCAL_5550" : "LOCAL" };
  }
  // Cualquier otra red es real.
  const motivos = [];
  if (!real) motivos.push("falta la bandera --real");
  const esperado = sha256Archivo(rutaParametros);
  if (!process.env.DESPLIEGUE_AUTORIZADO) motivos.push("falta DESPLIEGUE_AUTORIZADO (SHA-256 del archivo de parámetros revisado)");
  else if (process.env.DESPLIEGUE_AUTORIZADO.trim().toLowerCase() !== esperado) {
    motivos.push("DESPLIEGUE_AUTORIZADO no coincide con el SHA-256 de ESTE archivo de parámetros");
  }
  if (P.sintetico === true) motivos.push("el archivo de parámetros es SINTETICO: nunca va a una red real");
  if (P.red && Number(P.red.chainId) !== chainId) motivos.push(`chainId del nodo ${chainId} ≠ parámetros ${P.red.chainId}`);
  if (P.red && P.red.genesisHash && String(P.red.genesisHash).toLowerCase() !== String(genesisHash).toLowerCase()) {
    motivos.push("genesisHash del nodo distinto del de los parámetros");
  }
  if (motivos.length) {
    throw new Bloqueado(COD.DENY_AUTHORIZATION, `RED REAL RECHAZADA (chainId ${chainId}, cliente ${cliente})`, motivos);
  }
  return { chainId, cliente, genesisHash, tipo: "REAL" };
}

// --------------------------------------------------------------- pasaportes

function pasaporte(assetId, pas, { kind, chainId, contrato, codehash, decimales }) {
  const e = pas.estado;
  const nativo = kind === "NATIVE";
  return {
    assetId,
    issuerId: aB32(pas.issuerId, "pasaporte.issuerId"),
    legalInstrumentId: aB32(pas.legalInstrumentId, "pasaporte.legalInstrumentId"),
    economicType: aB32(pas.economicType, "pasaporte.economicType"),
    legalClass: aB32(pas.legalClass, "pasaporte.legalClass"),
    jurisdiction: aB32(pas.jurisdiction, "pasaporte.jurisdiction"),
    // ORIGEN es nativo: su transferencia NO pasa por SFSP. Se declara con honestidad
    // como registrado con bypass, no como impuesto.
    implementationProfile: nativo ? 0 : 1,
    assetKind: nativo ? 0 : 1,
    enforcement: {
      transferRestrictions: !nativo,
      freeze: nativo ? false : pas.capacidades.freeze === true,
      forcedTransfer: nativo ? false : pas.capacidades.forcedTransfer === true,
      pause: !nativo,
      directTransferBypass: nativo,
      notesRef: aB32(pas.documentRoot, "pasaporte.documentRoot"),
    },
    settlementLocation: { chainId, contractAddress: contrato || ZERO_ADDR, codehash: codehash || ZERO32 },
    unit: aB32(pas.unit, "pasaporte.unit"),
    decimalsKnown: true,
    decimals: decimales,
    rightsTemplateId: aB32(pas.rightsTemplateId, "pasaporte.rightsTemplateId"),
    rightsTemplateVersion: aB32(pas.rightsTemplateVersion, "pasaporte.rightsTemplateVersion"),
    documentRoot: aB32(pas.documentRoot, "pasaporte.documentRoot"),
    reportStatus: 0,
    risk: { level: 0, methodologyVersion: ZERO32, evaluatedAt: 0 },
    transferPolicyId: aB32(pas.transferPolicyId, "pasaporte.transferPolicyId"),
    redemptionPolicyId: aB32(pas.redemptionPolicyId, "pasaporte.redemptionPolicyId"),
    listingPolicyId: aB32(pas.listingPolicyId, "pasaporte.listingPolicyId"),
    // Tokens: totalSupply del contrato. ORIGEN: lo publica la bóveda (circulating()).
    supplySource: nativo ? 2 : 1,
    status: {
      legal: enumDe("legal", e.legal, "estado.legal"),
      admission: enumDe("admission", e.admission, "estado.admission"),
      trading: enumDe("trading", e.trading, "estado.trading"),
      transferability: enumDe("transferability", e.transferability, "estado.transferability"),
      redemption: enumDe("redemption", e.redemption, "estado.redemption"),
      visibility: 0,
    },
  };
}

// --------------------------------------------------------------- órdenes

const ETIQUETA_DOMINIO = keccak256(toUtf8Bytes("SFSP-AUTH-v1"));
const TYPEHASH_PAYLOAD = keccak256(
  toUtf8Bytes(
    "SFSPAuthPayload(uint256 chainId,address verifyingContract,bytes32 action,bytes32 assetId,address origin,address destination,uint256 amount,uint256 amountSecondary,bytes32 nonce,uint64 notBefore,uint64 expiry,bytes32 evidenceRoot)",
  ),
);

function digestDe(p) {
  return keccak256(
    defaultAbiCoder.encode(
      ["bytes32", "bytes32", "uint256", "address", "bytes32", "bytes32", "address", "address", "uint256", "uint256", "bytes32", "uint64", "uint64", "bytes32"],
      [ETIQUETA_DOMINIO, TYPEHASH_PAYLOAD, p.chainId, p.verifyingContract, p.action, p.assetId, p.origin, p.destination, p.amount, p.amountSecondary, p.nonce, p.notBefore, p.expiry, p.evidenceRoot],
    ),
  );
}

function tupla(p) {
  return [p.chainId, p.verifyingContract, p.action, p.assetId, p.origin, p.destination, p.amount, p.amountSecondary, p.nonce, p.notBefore, p.expiry, p.evidenceRoot];
}

function nonceOrden(sha, tipo, assetId, accion) {
  return keccak256(defaultAbiCoder.encode(["string", "string", "string", "bytes32", "bytes32"], ["SFSP410.ORDEN.v1", sha, tipo, assetId, accion]));
}

// --------------------------------------------------------------- despliegue

const ROLES = ["DBNX_BOARD", "TECH_OPS", "ATTESTOR", "ISSUER", "AUDITOR"];

/**
 * Despliega todo. `prov` es un proveedor EIP-1193. Devuelve el registro de despliegue.
 * @param {object} o { prov, rutaParametros, real, modo, log, salida }
 */
async function desplegar(o) {
  const log = o.log || console.log;
  const texto = fs.readFileSync(o.rutaParametros, "utf8");
  const P = JSON.parse(texto);
  const sha = sha256Archivo(o.rutaParametros);
  const V = validar(P);
  const red = await comprobarRed(o.prov, P, { real: o.real, rutaParametros: o.rutaParametros, modo: o.modo });
  log(`Red: chainId ${red.chainId} · ${red.cliente} · ${red.tipo}`);
  log(`Parámetros: ${o.rutaParametros} · sha256 ${sha}${P.sintetico ? " · SINTETICO" : ""}`);
  // Las llaves de la propia organización pagan gas en ORIGEN. Si no están
  // declaradas internas, su saldo cuenta como "circulante" (y la bóveda no les
  // puede liberar nada: R2). Se avisa; declararlas es decisión de D25.
  const internasSet = new Set(V.internas.map((c) => c.direccion.toLowerCase()));
  const avisos = [];
  for (const [nombre, a] of [["desplegador", V.desplegador], ...Object.entries(V.roles), ...V.firmantes.map((f, i) => [`firmante${i + 1}`, f])]) {
    if (!internasSet.has(a.toLowerCase())) avisos.push(`${nombre} ${a} no está en cuentasInternas: su ORIGEN (gas) contaría como circulante`);
  }
  for (const w of avisos) log("  AVISO: " + w);

  const ultimo = await o.prov.request({ method: "eth_getBlockByNumber", params: ["latest", false] });
  const baseFeeCero = ultimo.baseFeePerGas === undefined || BigInt(ultimo.baseFeePerGas) === 0n;
  const topeGas = (BigInt(ultimo.gasLimit) * 95n) / 100n;
  const ts0 = BigInt(ultimo.timestamp);

  // Cuentas del firmante.
  const cuentas = (await o.prov.request({ method: "eth_accounts", params: [] })).map((a) => a.toLowerCase());
  if (!cuentas.includes(V.desplegador.toLowerCase())) {
    if (red.tipo === "REAL") {
      throw new Bloqueado(COD.DENY_AUTHORIZATION, "el desplegador no está en las cuentas del firmante externo", [V.desplegador]);
    }
    // Sólo en Hardhat local: se suplanta la cuenta (ensayo con parámetros reales).
    await o.prov.request({ method: "hardhat_impersonateAccount", params: [V.desplegador] });
  }
  if (red.tipo === "REAL") {
    const code = await o.prov.request({ method: "eth_getCode", params: [V.roles.junta, "latest"] });
    if (!code || code === "0x") throw new Bloqueado(COD.DENY_AUTHORIZATION, "roles.junta no es un contrato (se exige multifirma)", [V.roles.junta]);
    if (P.red.genesisHash == null) throw new Bloqueado(COD.BLOCKED_DECISION, "BLOCKED_DECISION: red.genesisHash", ["red.genesisHash"]);
    for (const a of V.activos) if (a.cupo && a.cupo.validUntil <= ts0 + V.timelock) throw new ErrorParametros(`${a.simbolo}: validUntil ya vencido o anterior al fin de la espera`);
  }

  const ctx = crearContexto(o.prov, { from: V.desplegador, gasPrecioCero: baseFeeCero && red.tipo !== "REAL", topeGas, log });
  const D = V.desplegador;
  const bloqueInicio = Number(BigInt(ultimo.number));

  // ---- 1. contratos (el desplegador es Junta PROVISIONAL de cada uno)
  ctx.paso = "1-contratos";
  log("1. Contratos");
  const governance = await ctx.desplegar("SFSPGovernanceController", [D, V.firmantes, V.quorum, V.quorumUpgrade, V.timelock.toString(), V.maxPausa.toString()]);
  const registry = await ctx.desplegar("SFSPAssetRegistry", [D]);
  const identity = await ctx.desplegar("SFSPIdentityAdapter", [D]);
  const engine = await ctx.desplegar("SFSPEligibilityEngine", [D, registry.address, identity.address, governance.address]);
  const issuance = await ctx.desplegar("SFSPIssuanceController", [D, governance.address]);
  const migration = await ctx.desplegar("SFSPMigrationRegistry", [D, registry.address]);
  const vault = await ctx.desplegar("SFSPNativeVault", [D, governance.address, engine.address, V.origen.assetId, V.genesis.toString()]);
  const activos = [];
  for (const a of V.activos) {
    const c = await ctx.desplegar("SFSPRegulatedAsset", [D, a.assetId, registry.address, engine.address, identity.address, governance.address, a.erc20Interop]);
    c.nombre = `SFSPRegulatedAsset[${a.simbolo}]`;
    activos.push({ ...a, c });
  }
  const todos = [governance, registry, identity, engine, issuance, migration, vault, ...activos.map((a) => a.c)];
  const R = {};
  for (const r of ROLES) R[r] = await governance.call(r);

  // ---- 2. cableado
  ctx.paso = "2-cableado";
  log("2. Cableado");
  await registry.send("setGovernanceController", [governance.address]);
  await migration.send("setGovernanceController", [governance.address]);
  // Los ejecutores GASTAN aprobaciones ya logradas; el rol no crea ninguna.
  for (const ej of [...activos.map((a) => a.c), issuance, registry, engine, migration, vault]) {
    await governance.send("grantRole", [R.TECH_OPS, ej.address]);
  }
  for (const a of activos) {
    await a.c.send("setIssuanceController", [issuance.address]);
    await a.c.send("setMigrationRegistry", [migration.address]);
    await issuance.send("registerAssetContract", [a.assetId, a.c.address]);
  }

  // ---- 3. catálogo (TECH_OPS provisional del desplegador en el registro)
  ctx.paso = "3-pasaportes";
  log("3. Pasaportes");
  await registry.send("grantRole", [R.TECH_OPS, D]);
  await registry.send("registerAsset", [
    pasaporte(V.origen.assetId, V.origen.pasaporte, { kind: "NATIVE", chainId: red.chainId, decimales: 18 }),
  ]);
  for (const a of activos) {
    await registry.send("registerAsset", [
      pasaporte(a.assetId, a.pasaporte, { kind: "CONTRACT", chainId: red.chainId, contrato: a.c.address, codehash: a.c.despliegue.runtimeCodeHash, decimales: a.decimales }),
    ]);
  }
  const jur = [[V.origen.assetId, V.origen.politica], ...activos.map((a) => [a.assetId, a.politica])].filter(([, p]) => p.jurisdictionAllowlist);
  if (jur.length) {
    await engine.send("grantRole", [R.TECH_OPS, D]);
    for (const [id, p] of jur) for (const j of p.jurisdicciones) await engine.send("setJurisdictionAllowed", [id, j, true]);
  }

  // ---- 4. topes del instrumento (SFSP-200 §4)
  ctx.paso = "4-topes";
  log("4. Topes por activo");
  for (const a of activos) {
    await issuance.send("setInstrumentLimits", [a.assetId, a.outstandingLimit.toString(), a.cumulativeCap.toString()]);
  }

  // ---- 5. cuentas internas (R1, R2): mismas en emisión y bóveda
  ctx.paso = "5-cuentas-internas";
  log(`5. Cuentas internas (${V.internas.length}) en emisión y bóveda`);
  for (const c of V.internas) {
    const motivo = b32(`SFSP410:D25:${String(c.grupo || "INTERNA").slice(0, 18)}`);
    await issuance.send("setInternalAccount", [c.direccion, true, motivo]);
    await vault.send("setInternalAccount", [c.direccion, true, motivo]);
  }

  // ---- 6. roles definitivos
  ctx.paso = "6-roles";
  log("6. Roles definitivos");
  const esperados = [];
  const conceder = async (c, rol, quien) => {
    await c.send("grantRole", [R[rol], quien]);
    esperados.push({ contrato: c.nombre, address: c.address, rol, cuenta: quien });
  };
  for (const c of todos) await conceder(c, "DBNX_BOARD", V.roles.junta);
  await conceder(registry, "TECH_OPS", V.roles.techOps);
  await conceder(registry, "AUDITOR", V.roles.auditor);
  await conceder(identity, "ATTESTOR", V.roles.atestador);
  await conceder(engine, "TECH_OPS", V.roles.techOps);
  await conceder(issuance, "ISSUER", V.roles.emisor);
  await conceder(issuance, "TECH_OPS", V.roles.techOps);
  await conceder(migration, "ATTESTOR", V.roles.atestadorMigracion);
  await conceder(vault, "ISSUER", V.roles.emisor);
  await conceder(vault, "TECH_OPS", V.roles.techOps);
  for (const a of activos) {
    await conceder(a.c, "TECH_OPS", V.roles.techOps);
    await conceder(a.c, "ISSUER", V.roles.emisor);
  }

  // ---- 7. el desplegador se quita todo
  ctx.paso = "7-renuncia";
  log("7. El desplegador revoca todo lo que tenía");
  for (const c of todos) {
    for (const rol of ROLES) {
      if (rol === "DBNX_BOARD") continue;
      if (await c.call("hasRole", [R[rol], D])) await c.send("revokeRole", [R[rol], D]);
    }
  }
  for (const c of todos) await c.send("revokeRole", [R.DBNX_BOARD, D]);

  // ---- 8. verificación
  ctx.paso = "8-verificacion";
  const fallos = [];
  const tablaRoles = [];
  for (const c of todos) {
    for (const rol of ROLES) {
      if (await c.call("hasRole", [R[rol], D])) fallos.push(`${c.nombre}: el desplegador conserva ${rol}`);
    }
  }
  for (const e of esperados) {
    const ok = await todos.find((c) => c.address === e.address).call("hasRole", [R[e.rol], e.cuenta]);
    tablaRoles.push({ ...e, verificado: ok });
    if (!ok) fallos.push(`${e.contrato}: falta ${e.rol} para ${e.cuenta}`);
  }
  if (await governance.call("isSigner", [D])) fallos.push("el desplegador es firmante de gobierno");
  // REV-410-11 · los ejecutores tienen que poder GASTAR aprobaciones en
  // gobierno (consumeAuthorization exige TECH_OPS); sin esto los cupos y las
  // liberaciones revierten el primer día.
  for (const ej of [...activos.map((a) => a.c), issuance, registry, engine, migration, vault]) {
    if (!(await governance.call("hasRole", [R.TECH_OPS, ej.address]))) fallos.push(`governance: ${ej.nombre} sin TECH_OPS (no podrá consumir aprobaciones)`);
  }
  for (const c of V.internas) {
    if (!(await issuance.call("isInternalAccount", [c.direccion]))) fallos.push(`issuance: ${c.direccion} no quedó interna`);
    if (!(await vault.call("isInternalAccount", [c.direccion]))) fallos.push(`vault: ${c.direccion} no quedó interna`);
  }
  if (fallos.length) throw new Error("VERIFICACION FALLIDA:\n  " + fallos.join("\n  "));
  log("8. Verificado: el desplegador no tiene ningún rol; roles y cuentas internas en su sitio.");

  // ---- 9. órdenes de gobierno preparadas (no se aprueban aquí)
  const fin = await o.prov.request({ method: "eth_getBlockByNumber", params: ["latest", false] });
  const tsFin = BigInt(fin.timestamp);
  const ventana = { notBefore: (tsFin - 60n).toString(), expiry: (tsFin + V.vigencia).toString() };
  const ordenes = [];
  const politicaStruct = (p) => ({
    configured: true,
    actionAllowed: true,
    requiresHumanReview: p.requiresHumanReview,
    requiresAuthorization: p.requiresAuthorization,
    requiresDecimalsKnown: true,
    jurisdictionAllowlist: p.jurisdictionAllowlist,
    requiredPurpose: p.requiredPurpose,
    maxAmount: p.maxAmount.toString(),
    version: 0,
  });
  const pols = [[V.origen.assetId, "ORIGEN", V.origen.politica], ...activos.map((a) => [a.assetId, a.simbolo, a.politica])];
  for (const [assetId, simbolo, pol] of pols) {
    for (const accion of pol.acciones) {
      const st = politicaStruct(pol);
      const ev = await engine.call("policyDigest", [b32(accion), st]);
      const p = {
        chainId: String(red.chainId), verifyingContract: engine.address, action: b32("SET_POLICY"), assetId,
        origin: ZERO_ADDR, destination: ZERO_ADDR, amount: "0", amountSecondary: "1",
        nonce: nonceOrden(sha, "SET_POLICY", assetId, b32(accion)), ...ventana, evidenceRoot: ev,
      };
      ordenes.push({
        tipo: "SET_POLICY", simbolo, accion, accionGobierno: "SET_POLICY", ejecuta: "techOps", contrato: engine.address,
        funcion: "setPolicy", argumentos: { assetId, policyAction: b32(accion), policy: st }, payload: p, digest: digestDe(p), esperaTimelock: false,
      });
    }
  }
  for (const a of activos) {
    if (!a.cupo) continue;
    const ev = await issuance.call("budgetTermsRoot", [a.cupo.period.toString(), a.cupo.validUntil.toString(), a.cupo.termsDocRoot]);
    const p = {
      chainId: String(red.chainId), verifyingContract: issuance.address, action: b32("SET_MINT_BUDGET"), assetId: a.assetId,
      origin: ZERO_ADDR, destination: ZERO_ADDR, amount: a.cupo.perPeriod.toString(), amountSecondary: a.cupo.maxPerOperation.toString(),
      nonce: nonceOrden(sha, "SET_MINT_BUDGET", a.assetId, ZERO32), ...ventana, evidenceRoot: ev,
    };
    ordenes.push({
      tipo: "SET_MINT_BUDGET", simbolo: a.simbolo, accionGobierno: "SET_MINT_BUDGET", ejecuta: "techOps", contrato: issuance.address,
      funcion: "setMintBudget", argumentos: { period: a.cupo.period.toString(), validUntil: a.cupo.validUntil.toString(), termsDocRoot: a.cupo.termsDocRoot },
      payload: p, digest: digestDe(p), esperaTimelock: true,
    });
  }
  {
    const c = V.origen.cupo;
    const ev = await vault.call("budgetTermsRoot", [c.period.toString(), c.validUntil.toString(), c.termsDocRoot]);
    const p = {
      chainId: String(red.chainId), verifyingContract: vault.address, action: b32("SET_RELEASE_BUDGET"), assetId: V.origen.assetId,
      origin: ZERO_ADDR, destination: ZERO_ADDR, amount: c.perPeriod.toString(), amountSecondary: c.maxPerOperation.toString(),
      nonce: nonceOrden(sha, "SET_RELEASE_BUDGET", V.origen.assetId, ZERO32), ...ventana, evidenceRoot: ev,
    };
    ordenes.push({
      tipo: "SET_RELEASE_BUDGET", simbolo: "ORIGEN", accionGobierno: "SET_RELEASE_BUDGET", ejecuta: "techOps", contrato: vault.address,
      funcion: "setReleaseBudget", argumentos: { period: c.period.toString(), validUntil: c.validUntil.toString(), termsDocRoot: c.termsDocRoot },
      payload: p, digest: digestDe(p), esperaTimelock: true,
    });
  }

  const gasPorPaso = {};
  for (const t of ctx.txs) gasPorPaso[t.paso] = (gasPorPaso[t.paso] || 0) + t.gasUsed;
  const registro = {
    schemaVersion: "sfsp410-despliegue/draft-0.1",
    aviso: red.tipo === "REAL" ? "DESPLIEGUE REAL" : `NO ES UN DESPLIEGUE REAL (${red.tipo}). Nada de esto existe en la 5550.`,
    sintetico: P.sintetico === true,
    red: { chainId: red.chainId, cliente: red.cliente, genesisHash: red.genesisHash, tipo: red.tipo },
    parametros: { archivo: path.basename(o.rutaParametros), sha256: sha },
    desplegador: D,
    bloqueInicio,
    bloqueFin: Number(BigInt(fin.number)),
    timestampFin: Number(tsFin),
    contratos: Object.fromEntries(todos.map((c) => [c.nombre, c.despliegue])),
    activos: Object.fromEntries(activos.map((a) => [a.simbolo, { assetId: a.assetId, contrato: a.c.address }])),
    origen: { assetId: V.origen.assetId, boveda: vault.address, genesisSupply: V.genesis.toString() },
    roles: tablaRoles,
    desplegadorSinRoles: true,
    cuentasInternas: V.internas.length,
    avisos,
    gas: { total: ctx.txs.reduce((s, t) => s + t.gasUsed, 0), porPaso: gasPorPaso, transacciones: ctx.txs.length },
    transacciones: ctx.txs,
    ordenesDeGobierno: ordenes,
  };
  if (o.salida) {
    fs.mkdirSync(path.dirname(o.salida), { recursive: true });
    fs.writeFileSync(o.salida, JSON.stringify(registro, null, 2));
    log(`Registro de despliegue: ${o.salida}`);
  }
  return registro;
}

// --------------------------------------------------------------- CLI

function args(argv) {
  const a = { real: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--real") a.real = true;
    else if (k === "--parametros") a.parametros = argv[++i];
    else if (k === "--salida") a.salida = argv[++i];
    else if (k === "--red") a.red = argv[++i];
    else if (k === "--rpc") a.rpc = argv[++i];
    else throw new Error("argumento desconocido: " + k);
  }
  return a;
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!a.parametros) throw new Error("falta --parametros <archivo.json>");
  const rutaParametros = path.resolve(a.parametros);

  // Parámetros primero: sin decisiones no se toca ninguna red.
  validar(JSON.parse(fs.readFileSync(rutaParametros, "utf8")));

  let prov;
  let modo;
  if (a.rpc) {
    prov = proveedorHttp(a.rpc);
    modo = "rpc";
  } else {
    process.env.HARDHAT_NETWORK = a.red || "hardhat";
    process.chdir(RAIZ);
    prov = require("hardhat").network.provider;
    modo = a.red && a.red !== "hardhat" ? "rpc-hardhat" : "proceso";
    if (modo === "rpc-hardhat") {
      const url = require("hardhat").network.config.url || "";
      prov.local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
    }
  }
  const salida = a.salida ? path.resolve(a.salida) : path.join(path.dirname(rutaParametros), `despliegue-${Date.now()}.json`);
  await desplegar({ prov, rutaParametros, real: a.real, modo, salida });
}

if (require.main === module) {
  main().catch((e) => {
    if (e instanceof Bloqueado) {
      console.error(e.message);
      for (const d of e.detalle || []) console.error("  - " + d);
      process.exitCode = e.codigo;
    } else if (e instanceof ErrorParametros) {
      console.error("PARAMETROS INVALIDOS: " + e.message);
      process.exitCode = COD.BLOCKED_DECISION;
    } else {
      console.error(e);
      process.exitCode = COD.ERROR;
    }
  });
}

module.exports = {
  desplegar, validar, nulos, digestDe, tupla, b32, Bloqueado, ErrorParametros, sha256Archivo, COD,
  Contrato, crearContexto, leerArtefacto, ROLES,
};
