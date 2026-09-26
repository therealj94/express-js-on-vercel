/* SFSP-410 · el deposito de USDT entregado EN CADENA y la recarga que vuelve
 * a la boveda, contra los contratos DE VERDAD.
 *
 *   node pruebas/probar-sfsp410.mjs
 *
 * Levanta una cadena LOCAL (Hardhat en proceso, chainId 31337, solo en
 * 127.0.0.1) con SFSPNativeVault desplegado desde los artefactos compilados de
 * sfsp/contracts (pruebas/sfsp410/cadena-local.cjs). Los controladores se leen
 * del archivo de verdad y se ejecutan con dobles para Mongo, la sesion y
 * Polygon (como el resto de esta carpeta); lib/sfsp410.js es el de verdad y
 * habla con la cadena local.
 *
 *   · interruptor APAGADO → el deposito sube el saldo interno y la recarga va
 *     a TREASURY_OG_ADDRESS, sin tocar SFSP;
 *   · ENCENDIDO → releaseOnDemand a la direccion del usuario con la referencia
 *     del deposito; la recarga hace absorb en la boveda;
 *   · la misma entrega otra vez → OperationReplay = ya entregado;
 *   · cupo agotado → cola de gobierno, sin reintento en bucle;
 *   · destino que es cuenta interna → rechazada;
 *   · el script de conciliacion: solo lectura y sin URI no arranca.
 *
 * Ninguna red de verdad, ninguna llave de verdad.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");
const CONTRATOS = path.resolve(RAIZ, "../../sfsp/contracts");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");
const requerir = createRequire(path.join(RAIZ, "package.json"));

let fallos = 0;
const ok = (c, que, detalle = "") => {
  console.log(`  ${c ? "ok   " : "FALLA"} ${que}${detalle && !c ? "\n           " + detalle : ""}`);
  if (!c) fallos++;
};
const titulo = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(2, 58 - t.length))}`);

if (!fs.existsSync(path.join(CONTRATOS, "node_modules", "hardhat"))
    || !fs.existsSync(path.join(CONTRATOS, "artifacts", "src", "SFSPNativeVault.sol", "SFSPNativeVault.json"))) {
  console.log(`sfsp/contracts sin node_modules o sin compilar (${CONTRATOS}): esta prueba NO corrio y NO probo nada.`);
  process.exit(0);
}

const ethers = await import("ethers");
const { JsonRpcProvider, Interface, keccak256, toUtf8Bytes, getAddress, AbiCoder } = ethers;
const { default: mongoose } = await import("mongoose");

// ── la cadena local ─────────────────────────────────────────────────────────
const hijo = spawn(process.execPath, [path.join(AQUI, "sfsp410", "cadena-local.cjs")], {
  env: { ...process.env, SFSP_CONTRATOS: CONTRATOS },
  stdio: ["pipe", "pipe", "pipe"],
});
let errHijo = "";
hijo.stderr.on("data", (d) => { errHijo += d; });
const L = await new Promise((listo, falla) => {
  let buf = "";
  const t = setTimeout(() => falla(new Error(`la cadena local no arranco en 120s\n${errHijo}`)), 120_000);
  hijo.stdout.on("data", (d) => {
    buf += d;
    const m = /SFSP410_LISTO (\{.*\})\n/.exec(buf);
    if (m) { clearTimeout(t); listo(JSON.parse(m[1])); }
  });
  hijo.on("exit", (c) => { clearTimeout(t); falla(new Error(`la cadena local salio (${c})\n${errHijo}`)); });
});
const apagarCadena = () => { try { hijo.stdin.end(); hijo.kill("SIGTERM"); } catch {} };

const cadena = new JsonRpcProvider(L.rpc, undefined, { cacheTimeout: -1 });
const saldo = async (a) => BigInt(await cadena.getBalance(a));
const ETH = 10n ** 18n;
const [ALICE, BOB] = L.elegibles.map((a) => getAddress(a));
const TESORERIA_VIEJA = getAddress("0x00000000000000000000000000000000000c0ffe");

process.env.OG_CHAIN_PROVIDER = L.rpc;          // la 5550 de las pruebas es la local
process.env.SFSP410_RPC = L.rpc;
process.env.SFSP410_CHAIN_ID = String(L.chainId);
process.env.SFSP410_VAULT_ADDRESS = L.vault;
process.env.SFSP410_ISSUER_KEY = L.emisorLlave;
process.env.SFSP410_REINTENTO_MS = "0";
process.env.TREASURY_OG_ADDRESS = TESORERIA_VIEJA;
process.env.TREASURY_POLYGON_PRIVATE_KEY = ethers.Wallet.createRandom().privateKey;
delete process.env.SFSP410_EMISION;

// ── el adaptador de verdad, espiado ─────────────────────────────────────────
const sfsp410Real = requerir("./lib/sfsp410.js");
const llamadas = { entregarOrigen: 0, devolverOrigen: 0 };
const sfsp410 = {
  ...sfsp410Real,
  entregarOrigen: (...a) => { llamadas.entregarOrigen++; return sfsp410Real.entregarOrigen(...a); },
  devolverOrigen: (...a) => { llamadas.devolverOrigen++; return sfsp410Real.devolverOrigen(...a); },
};

// ── Mongo, fingido en memoria (lo justo que usan estos archivos) ────────────
const iguales = (a, b) => (a == null && b == null) || String(a) === String(b);
function casa(doc, filtro) {
  for (const [k, v] of Object.entries(filtro || {})) {
    if (k === "$or") { if (!v.some((f) => casa(doc, f))) return false; continue; }
    const x = doc[k];
    if (v && typeof v === "object" && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date)
        && Object.keys(v).some((q) => q.startsWith("$"))) {
      for (const [op, w] of Object.entries(v)) {
        if (op === "$in" && !w.some((y) => iguales(x, y))) return false;
        if (op === "$ne" && iguales(x, w)) return false;
        if (op === "$gte" && !(x >= w)) return false;
        if (op === "$gt" && !(x > w)) return false;
        if (op === "$lt" && !(x != null && x < w)) return false;
      }
    } else if (!iguales(x, v)) return false;
  }
  return true;
}
function aplicar(doc, upd, insertando) {
  const ops = Object.keys(upd).some((k) => k.startsWith("$")) ? upd : { $set: upd };
  Object.assign(doc, ops.$set || {});
  for (const [k, v] of Object.entries(ops.$inc || {})) doc[k] = (doc[k] || 0) + v;
  if (insertando) Object.assign(doc, ops.$setOnInsert || {});
}
function modelo(nombre, { unicos = [], defecto = {} } = {}) {
  const filas = [];
  const conSave = (d) => {
    Object.defineProperty(d, "save", { value: async () => d, enumerable: false, configurable: true });
    Object.defineProperty(d, "toObject", { value: () => ({ ...d }), enumerable: false, configurable: true });
    return d;
  };
  const consulta = (lista) => {
    const q = {
      _l: lista,
      sort: (s) => { const [[k, dir]] = Object.entries(s); q._l = [...q._l].sort((a, b) => (a[k] > b[k] ? dir : -dir)); return q; },
      limit: (n) => { q._l = q._l.slice(0, n); return q; },
      lean: () => q,
      then: (res, rej) => Promise.resolve(q._l).then(res, rej),
    };
    return q;
  };
  return {
    nombre, filas,
    async create(d) {
      for (const u of unicos) {
        if (d[u] != null && filas.some((f) => iguales(f[u], d[u]))) {
          throw Object.assign(new Error(`E11000 ${nombre}.${u}`), { code: 11000 });
        }
      }
      const doc = conSave({ ...defecto, _id: d._id || new mongoose.Types.ObjectId(), createdAt: new Date(), ...d });
      filas.push(doc);
      return doc;
    },
    async findOne(f) { return filas.find((d) => casa(d, f)) || null; },
    async findById(id) { return filas.find((d) => iguales(d._id, id)) || null; },
    find(f) { return consulta(filas.filter((d) => casa(d, f))); },
    async findOneAndUpdate(f, u, o = {}) {
      let d = filas.find((x) => casa(x, f));
      if (!d && o.upsert) {
        d = conSave({ ...defecto, _id: new mongoose.Types.ObjectId(), ...Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v !== "object" || v instanceof mongoose.Types.ObjectId)) });
        aplicar(d, u, true);
        filas.push(d);
        return d;
      }
      if (!d) return null;
      aplicar(d, u, false);
      return d;
    },
    async updateOne(f, u) {
      const d = filas.find((x) => casa(x, f));
      if (d) aplicar(d, u, false);
      return { matchedCount: d ? 1 : 0 };
    },
  };
}

// ── cargar el archivo de verdad, sin imports ni exports ─────────────────────
function cargar(archivo, deps, nombres) {
  const fuente = leer(...archivo).replace(/^import .*$/gm, "").replace(/^export /gm, "");
  const claves = Object.keys(deps);
  return new Function(...claves, `${fuente}\nreturn { ${nombres.join(", ")} };`)(...claves.map((k) => deps[k]));
}

const EntregaOrigen = modelo("EntregaOrigen", { unicos: ["depositId", "canonica", "paymentRef"], defecto: { intentos: 0, ultimoIntento: null, hash: null } });
const OrigenBalance = modelo("OrigenBalance");
const Deposit = modelo("Deposit");
const Users = modelo("Users");
const Card = modelo("Card");
const CardFunding = modelo("CardFunding");

const E = cargar(["lib", "entregaOrigen.js"], { EntregaOrigen, sfsp410, console },
  ["intentarEntrega", "reintentarPendientes", "reencolar", "paraPantalla"]);

// Polygon fingido: el saldo USDT de cada direccion lo pone la prueba.
const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const usdtDe = new Map();
const abi = AbiCoder.defaultAbiCoder();
const polygonFalso = {
  call: async (tx) => {
    const quien = "0x" + String(tx.data).slice(-40);
    return abi.encode(["uint256"], [usdtDe.get(getAddress(quien)) || 0n]);
  },
};
let precioOrigen = 2.5;
const deps = {
  jwt: { verify: (t) => ({ userId: t }) },
  ethers: ethers.ethers || ethers,
  proveedorPolygon: async () => polygonFalso,
  Users, OrigenBalance, Deposit,
  getOrigenPriceUsd: async () => precioOrigen,
  mongoose,
  sfsp410,
  EntregaOrigen,
  intentarEntrega: E.intentarEntrega,
  reintentarPendientes: E.reintentarPendientes,
  paraPantalla: E.paraPantalla,
  console: { ...console, log: () => {} },
  process,
};
const D = cargar(["controller", "depositController.js"], deps, ["checkDeposit", "depositInfo", "revisarYAcreditar"]);

async function usuario(address) {
  return Users.create({ address, kycStatus: "approved", password: "x", privateKey: "cifrada" });
}
async function revisar(u) {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await D.checkDeposit({ headers: { authorization: `Bearer ${u._id}` } }, res);
  return res;
}
const IFACE = new Interface([
  "event NativeReleased(bytes32 indexed assetId, address indexed destination, bytes32 indexed operationId, uint256 amount, bytes32 route, bytes32 evidenceRoot)",
  "event NativeAbsorbed(bytes32 indexed assetId, address indexed from, bytes32 indexed reasonCode, uint256 amount)",
]);
async function liberaciones(ref) {
  const logs = await cadena.getLogs({ address: L.vault, fromBlock: 0, toBlock: "latest", topics: [IFACE.getEvent("NativeReleased").topicHash, null, null, ref] });
  return logs.map((l) => ({ ...IFACE.parseLog(l).args.toObject(), hash: l.transactionHash }));
}
const minar = (h) => (h ? cadena.waitForTransaction(h, 1, 30_000) : null);

try {
  titulo("interruptor APAGADO: el deposito sube el saldo interno, como siempre");
  {
    const u = await usuario(ALICE);
    usdtDe.set(ALICE, 5_000_000n); // 5 USDT
    const antes = await saldo(ALICE);
    const res = await revisar(u);
    const s = await OrigenBalance.findOne({ userId: u._id });
    ok(res.code === 200 && res.body?.acreditado?.origenAmount === 2, "se acreditan 2 ORIGEN (5 USDT a 2,5)", JSON.stringify(res.body));
    ok(s.origen === 2 && s.creditedUsdtWei === "5000000", "en el saldo INTERNO, con la marca de agua al dia");
    ok(!("entrega" in res.body), "la respuesta es la de siempre: sin campo «entrega»", Object.keys(res.body).join(","));
    ok(EntregaOrigen.filas.length === 0, "no se escribe ninguna entrega SFSP-410");
    ok(llamadas.entregarOrigen === 0, "y el adaptador no se llama");
    ok((await saldo(ALICE)) === antes, "en la cadena no se mueve nada");
    ok(JSON.stringify(Object.keys(res.body)) === JSON.stringify(["sinRed", "origen", "usdValue", "origenPriceUsd", "creditedUsdt", "acreditado"]),
      "con exactamente las claves de antes, en el mismo orden");
  }

  titulo("interruptor ENCENDIDO: releaseOnDemand a la direccion del usuario");
  process.env.SFSP410_EMISION = "1";
  let primera;
  {
    const u = await usuario(BOB);
    usdtDe.set(BOB, 5_000_000n); // 5 USDT → 2 ORIGEN
    const antes = await saldo(BOB);
    const antesBoveda = await saldo(L.vault);
    const res = await revisar(u);
    const e = EntregaOrigen.filas.find((x) => iguales(x.userId, u._id));
    await minar(e?.hash);
    const s = await OrigenBalance.findOne({ userId: u._id });
    ok(res.code === 200 && res.body?.entrega?.estado === "entregada", "la entrega sale en cadena", JSON.stringify(res.body));
    ok(s.origen === 0, "el saldo INTERNO no sube: el ORIGEN ya no vive en la base", String(s.origen));
    ok(s.creditedUsdtWei === "5000000", "pero la marca de agua avanza (el deposito no se vuelve a ver)");
    const dep = Deposit.filas.find((d) => iguales(d.userId, u._id));
    const esperada = keccak256(toUtf8Bytes(`SFSP410/v1|veta|deposito-usdt|${dep._id}`));
    ok(e.paymentRef === esperada && e.canonica === `SFSP410/v1|veta|deposito-usdt|${dep._id}`,
      "paymentRef = keccak256(\"SFSP410/v1|veta|deposito-usdt|<_id del Deposit>\")", e.paymentRef);
    const evs = await liberaciones(esperada);
    ok(evs.length === 1 && evs[0].destination === BOB && evs[0].amount === 2n * ETH, "una liberacion de la boveda, a su direccion, por 2 ORIGEN");
    ok((await saldo(BOB)) - antes === 2n * ETH, "el usuario tiene 2 ORIGEN mas EN CADENA");
    ok(antesBoveda - (await saldo(L.vault)) === 2n * ETH, "y salen de la boveda");
    ok(dep.origenAmount === 2 && e.depositId && iguales(e.depositId, dep._id), "el historial de depositos se escribe igual, ligado a su entrega");
    primera = { u, e, hash: e.hash };
  }

  titulo("la misma entrega otra vez: OperationReplay = ya entregado");
  {
    // Lo que pasaria si el proceso muere despues de liberar y antes de anotar.
    const e = EntregaOrigen.filas.find((x) => iguales(x._id, primera.e._id));
    e.estado = "pendiente"; e.hash = null; e.ultimoIntento = null;
    const antes = await saldo(BOB);
    await revisar(primera.u); // retoma pendientes antes de mirar lo nuevo
    ok(e.estado === "entregada" && e.codigo === "YA_ENTREGADO", "se da por entregada", `${e.estado} ${e.codigo}`);
    ok(e.hash === primera.hash, "con el hash de la PRIMERA entrega", `${e.hash} vs ${primera.hash}`);
    ok((await saldo(BOB)) === antes, "y no se entrega otra vez");
    ok((await liberaciones(e.paymentRef)).length === 1, "sigue habiendo una sola liberacion");
  }

  titulo("cupo agotado: a la cola de gobierno, sin bucle");
  {
    // Cupo de prueba: 10 por periodo, 4 por operacion. Ya van 2.
    const u = await usuario(BOB);
    usdtDe.set(BOB, 0n);
    await revisar(u); // marca de agua a 0 para este usuario nuevo
    let r;
    usdtDe.set(BOB, 10_000_000n); r = await revisar(u); await minar(r.body?.entrega?.hash);   // +4 → 6
    usdtDe.set(BOB, 20_000_000n); r = await revisar(u); await minar(r.body?.entrega?.hash);   // +4 → 10
    ok(r.body?.entrega?.estado === "entregada", "dentro del cupo se entrega (2 + 4 + 4 = 10)", JSON.stringify(r.body?.entrega));
    const antes = await saldo(BOB);
    usdtDe.set(BOB, 25_000_000n); r = await revisar(u);                                          // +2 → se pasa
    ok(r.body?.entrega?.estado === "cola-gobierno", "la que se pasa va a la cola de gobierno", JSON.stringify(r.body?.entrega));
    const e = EntregaOrigen.filas.find((x) => x.estado === "cola-gobierno");
    ok(e?.codigo === "CUPO_AGOTADO" && /cupo/.test(e?.mensaje || ""), "con el motivo en castellano", `${e?.codigo}: ${e?.mensaje}`);
    ok((await saldo(BOB)) === antes, "no se movio nada");
    const intentos = e.intentos;
    await revisar(u); await revisar(u);
    ok(e.intentos === intentos && e.estado === "cola-gobierno", "revisar otra vez NO la reintenta: no hay bucle", `${e.intentos}`);
    ok((await OrigenBalance.findOne({ userId: u._id })).origen === 0, "y tampoco cae al saldo interno por la puerta de atras");

    usdtDe.set(BOB, 37_500_000n); r = await revisar(u);                                          // +5 ORIGEN > 4 por op
    ok(r.body?.entrega?.estado === "cola-gobierno" && EntregaOrigen.filas.some((x) => x.codigo === "MONTO_SOBRE_CUPO"),
      "sobre el maximo por operacion: tambien a la cola", JSON.stringify(r.body?.entrega));

    // Periodo nuevo: una persona la devuelve a la fila y sale.
    await cadena.send("evm_increaseTime", [86400]); await cadena.send("evm_mine", []);
    await E.reencolar(e._id);
    ok(e.estado === "pendiente", "reencolar la devuelve a la fila");
    await revisar(u); await minar(e.hash);
    ok(e.estado === "entregada", "y en el periodo nuevo se entrega", `${e.estado} ${e.codigo}`);
  }

  titulo("destino que es cuenta interna: rechazada");
  {
    const u = await usuario(getAddress(L.interna));
    usdtDe.set(getAddress(L.interna), 2_500_000n);
    const antes = await saldo(L.interna);
    const r = await revisar(u);
    ok(r.body?.entrega?.estado === "rechazada", "no se entrega", JSON.stringify(r.body?.entrega));
    ok(EntregaOrigen.filas.some((x) => x.estado === "rechazada" && x.codigo === "DESTINO_INTERNO"), "con codigo DESTINO_INTERNO");
    ok((await saldo(L.interna)) === antes, "y la cuenta interna no recibe nada");
    ok((await OrigenBalance.findOne({ userId: u._id })).origen === 0, "ni se le acredita en la base");
  }

  titulo("la recarga de la tarjeta: absorb en la boveda");
  {
    const USDT_FALSO = function (direccion, abiX, runner) {
      if (String(direccion).toLowerCase() === USDT_POLYGON.toLowerCase()) {
        return { balanceOf: async () => 10n ** 12n, transfer: async () => ({ wait: async () => ({ hash: "0x" + "ee".repeat(32) }) }) };
      }
      return new ethers.Contract(direccion, abiX, runner);
    };
    const ethersFalso = { ...(ethers.ethers || ethers), Contract: USDT_FALSO };
    const S = cargar(["controller", "swapController.js"], {
      axios: { get: async () => ({ data: [] }) },
      jwt: { verify: (t) => ({ userId: t }) },
      CryptoJS: {},
      descifrarLlavePrivada: () => L.usuarioLlave,
      bcrypt: { compare: async () => true },
      ethers: ethersFalso,
      Users, Card, CardFunding, OrigenBalance,
      getOrigenPriceUsd: async () => 2.5,
      precioDeGas: async (p) => (await p.getFeeData()).gasPrice,
      proveedorPolygon: async () => ({}),
      sfsp410,
      console: { ...console, log: () => {} },
      process,
    }, ["fundCard"]);

    const u = await usuario(getAddress(L.usuario));
    await Card.create({ userId: u._id, status: "ACTIVE", cryptomateCardId: "c1", topUpAddress: "0x" + "11".repeat(20) });
    const fondear = async () => {
      const res = { code: 200, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
      await S.fundCard({ headers: { authorization: `Bearer ${u._id}` }, body: { amount: "5", password: "x" } }, res);
      return res;
    };

    // Apagado: al treasury de siempre.
    delete process.env.SFSP410_EMISION;
    const antesTes = await saldo(TESORERIA_VIEJA);
    const antesBov = await saldo(L.vault);
    const d0 = llamadas.devolverOrigen;
    let r = await fondear();
    ok(r.code === 200 && r.body?.status === "funded", "apagado: la recarga se completa", JSON.stringify(r.body));
    ok((await saldo(TESORERIA_VIEJA)) - antesTes === 5n * ETH, "y el ORIGEN va a TREASURY_OG_ADDRESS, como antes");
    ok((await saldo(L.vault)) === antesBov && llamadas.devolverOrigen === d0, "sin tocar la boveda ni el adaptador");

    // Encendido: a la boveda, con absorb.
    process.env.SFSP410_EMISION = "1";
    const antesTes2 = await saldo(TESORERIA_VIEJA);
    const antesBov2 = await saldo(L.vault);
    r = await fondear();
    ok(r.code === 200 && r.body?.status === "funded", "encendido: la recarga se completa igual", JSON.stringify(r.body));
    ok((await saldo(L.vault)) - antesBov2 === 5n * ETH, "y el ORIGEN vuelve a la boveda");
    ok((await saldo(TESORERIA_VIEJA)) === antesTes2, "TREASURY_OG_ADDRESS no recibe nada");
    const logs = await cadena.getLogs({ address: L.vault, fromBlock: 0, topics: [IFACE.getEvent("NativeAbsorbed").topicHash, null, null, ethers.encodeBytes32String("RECARGA_TARJETA")] });
    const ev = logs.map((l) => IFACE.parseLog(l).args).find((a) => getAddress(a.from) === getAddress(L.usuario));
    ok(!!ev && ev.amount === 5n * ETH, "NativeAbsorbed(from = el usuario, motivo = RECARGA_TARJETA, 5 ORIGEN)");
    ok(r.body?.ogTxHash === logs[logs.length - 1]?.transactionHash, "y el hash anotado en la recarga es el del absorb");

    // Sin la boveda configurada, encendido, no se cobra nada.
    const bov = process.env.SFSP410_VAULT_ADDRESS;
    delete process.env.SFSP410_VAULT_ADDRESS;
    r = await fondear();
    ok(r.code === 500 && /SFSP410_VAULT_ADDRESS/.test(r.body?.message || ""), "sin SFSP410_VAULT_ADDRESS, se niega antes de cobrar", JSON.stringify(r.body));
    process.env.SFSP410_VAULT_ADDRESS = bov;
  }

  titulo("la conciliacion: solo lectura");
  {
    const guion = path.join(RAIZ, "scripts", "conciliar-origen-interno.js");
    const env = { ...process.env };
    delete env.MONGODB_URI; delete env.CONCILIAR_MONGODB_URI;
    const a = spawnSync(process.execPath, [guion], { env, encoding: "utf8" });
    ok(a.status === 2 && /SOLO LECTURA/.test(a.stderr), "sin URI no arranca, y lo dice", a.stderr);
    const b = spawnSync(process.execPath, [guion, "--aplicar"], { env, encoding: "utf8" });
    ok(b.status === 2 && /no tiene modo de escritura/.test(b.stderr), "no existe un modo de escritura: --aplicar se rechaza");
    const fuente = leer("scripts", "conciliar-origen-interno.js");
    ok(!/\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|replaceOne|findOneAndUpdate|findOneAndDelete|findOneAndReplace|drop|dropCollection|bulkWrite|createIndex|createCollection|save)\(/.test(fuente),
      "el script no tiene ni una operacion de escritura");
    ok(!/email|nombre|name|phone/.test(fuente.split("async function main")[1].replace(/nombre\)/g, "")),
      "y no lee datos personales mas alla de userId y address");
  }
} catch (e) {
  fallos++;
  console.error(e);
} finally {
  apagarCadena();
}

console.log(`\n${fallos === 0 ? "TODO EN VERDE" : `${fallos} en rojo`}`);
process.exit(fallos === 0 ? 0 : 1);
