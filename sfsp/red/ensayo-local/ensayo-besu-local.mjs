#!/usr/bin/env node
// SFSP-150 · Ensayo LOCAL de la red cerrada con un nodo Besu 26.7.1 real.
//
// Levanta UNA red QBFT de un validador en 127.0.0.1 (chainId 1337, génesis nuevo,
// claves de prueba públicas de Hardhat), despliega la lista SFSPNetworkPermissions y
// comprueba, con transacciones reales, que el complemento `filtro-besu` rechaza lo
// que el contrato niega en el pool, en la producción y en la importación de bloques.
//
// NUNCA toca la 5550 ni la 5534: el RPC se fija a 127.0.0.1 y se exige chainId 1337.
//
// Uso (ver sfsp/red/RED-CERRADA.md §6):
//   BESU_HOME=<besu-26.7.1 descomprimido, con el jar en plugins/> JAVA_HOME=<JDK 25> \
//   ENSAYO_DIR=<carpeta vacía fuera del repo> node ensayo-besu-local.mjs
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATOS = join(AQUI, "..", "..", "contracts");
const req = createRequire(join(CONTRATOS, "package.json"));
const { Interface, defaultAbiCoder } = req("@ethersproject/abi");
const { keccak256 } = req("@ethersproject/keccak256");
const { toUtf8Bytes } = req("@ethersproject/strings");
const { SigningKey } = req("@ethersproject/signing-key");
const { serialize, computeAddress } = req("@ethersproject/transactions");
const { hexlify, zeroPad } = req("@ethersproject/bytes");

const BESU_HOME = process.env.BESU_HOME;
const ENSAYO = process.env.ENSAYO_DIR;
if (!BESU_HOME || !ENSAYO || !process.env.JAVA_HOME) throw new Error("faltan BESU_HOME, JAVA_HOME o ENSAYO_DIR");
const CHAIN_ID = 1337;
const PUERTO = Number(process.env.PUERTO || 18545);
const RPC = `http://127.0.0.1:${PUERTO}`;
const BESU = join(BESU_HOME, "bin", "besu");

// Claves de prueba PÚBLICAS de Hardhat (mnemónico «test test … junk»). Sin valor.
const CLAVES = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
];
const CUENTAS = CLAVES.map((k) => ({ clave: k, dir: computeAddress(k) }));
const [junta, s1, s2, s3, s4, usuario, desplegador] = CUENTAS;

// ------------------------------------------------------------------ utilidades
const b32 = (t) => { const r = toUtf8Bytes(t); const o = new Uint8Array(32); o.set(r); return hexlify(o); };
const ZERO32 = "0x" + "00".repeat(32);
const ZERO = "0x" + "00".repeat(20);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let _id = 0;
const rpc = (method, params = []) => rpcEn(RPC, method, params);
async function rpcEn(url, method, params = []) {
  if (!url.startsWith("http://127.0.0.1:")) throw new Error("sólo 127.0.0.1");
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method, params }) });
  const j = await r.json();
  if (j.error) { const e = new Error(`${method}: ${j.error.message}`); e.rpc = j.error; throw e; }
  return j.result;
}
const bloque = async () => Number(await rpc("eth_blockNumber"));
const art = (n) => JSON.parse(readFileSync(join(CONTRATOS, "artifacts", "src", n.startsWith("SFSPHeredado") ? "pruebas/SFSPSondasDePrueba.sol" : n + ".sol", n + ".json"), "utf8"));

async function enviar(cuenta, { to = null, data = "0x", value = 0n, gas = 6_000_000 }) {
  const nonce = Number(await rpc("eth_getTransactionCount", [cuenta.dir, "pending"]));
  const tx = { chainId: CHAIN_ID, nonce, gasPrice: 0, gasLimit: gas, to: to || undefined, data, value: "0x" + BigInt(value).toString(16) };
  const firma = new SigningKey(cuenta.clave).signDigest(keccak256(serialize(tx)));
  const hash = await rpc("eth_sendRawTransaction", [serialize(tx, firma)]);
  for (let i = 0; i < 60; i++) {
    const rc = await rpc("eth_getTransactionReceipt", [hash]);
    if (rc) return rc;
    await dormir(500);
  }
  throw new Error("sin recibo: " + hash);
}
/** Devuelve {ok, rc|error}: `ok=false` con el error del nodo si el pool la rechaza. */
async function intentar(cuenta, tx) {
  try { const rc = await enviar(cuenta, tx); return { ok: rc.status === "0x1", rc }; }
  catch (e) { return { ok: false, error: e.message }; }
}
async function desplegar(cuenta, nombre, args = []) {
  const a = art(nombre);
  const data = a.bytecode + new Interface(a.abi).encodeDeploy(args).slice(2);
  const rc = await enviar(cuenta, { data, gas: 12_000_000 });
  if (rc.status !== "0x1") throw new Error("despliegue fallido " + nombre);
  return { address: rc.contractAddress, iface: new Interface(a.abi) };
}
const llamar = async (c, fn, args = []) => c.iface.decodeFunctionResult(fn, await rpc("eth_call", [{ to: c.address, data: c.iface.encodeFunctionData(fn, args) }, "latest"]));
async function mandar(cuenta, c, fn, args = []) {
  const rc = await enviar(cuenta, { to: c.address, data: c.iface.encodeFunctionData(fn, args) });
  if (rc.status !== "0x1") throw new Error("revirtió " + fn);
  return rc;
}

// ------------------------------------------------------------------ nodo
let proceso = null;
function arrancar(extra) {
  const args = [
    `--data-path=${join(ENSAYO, "datos")}`, `--genesis-file=${join(ENSAYO, "genesis.json")}`,
    `--node-private-key-file=${join(ENSAYO, "clave-validador")}`,
    "--rpc-http-enabled", "--rpc-http-host=127.0.0.1", `--rpc-http-port=${PUERTO}`,
    "--rpc-http-api=ETH,NET,WEB3,QBFT,TXPOOL", "--host-allowlist=127.0.0.1,localhost",
    "--p2p-host=127.0.0.1", "--p2p-port=30399", "--discovery-enabled=false", "--min-gas-price=0",
    "--logging=INFO", ...extra,
  ];
  proceso = spawn(BESU, args, { env: { ...process.env, BESU_OPTS: "" }, stdio: ["ignore", "pipe", "pipe"] });
  const log = [];
  proceso.stdout.on("data", (d) => log.push(d.toString()));
  proceso.stderr.on("data", (d) => log.push(d.toString()));
  proceso.log = log;
  return proceso;
}
async function listo() {
  for (let i = 0; i < 240; i++) {
    try { if (Number(await rpc("eth_chainId")) === CHAIN_ID && (await bloque()) >= 0) return; } catch {}
    await dormir(500);
  }
  throw new Error("el nodo no arrancó:\n" + proceso.log.join("").slice(-3000));
}
async function parar() {
  if (!proceso) return;
  const p = proceso; proceso = null;
  p.kill("SIGTERM");
  for (let i = 0; i < 60 && p.exitCode === null; i++) await dormir(500);
  if (p.exitCode === null) p.kill("SIGKILL");
  writeFileSync(join(ENSAYO, `besu-${Date.now()}.log`), p.log.join(""));
}

// ------------------------------------------------------------------ génesis QBFT de 1 validador
function genesis() {
  if (existsSync(ENSAYO)) rmSync(ENSAYO, { recursive: true, force: true });
  mkdirSync(ENSAYO, { recursive: true });
  const conf = {
    genesis: {
      config: { chainId: CHAIN_ID, berlinBlock: 0, londonBlock: 0, zeroBaseFee: true, qbft: { blockperiodseconds: 1, epochlength: 30000, requesttimeoutseconds: 4 } },
      nonce: "0x0", timestamp: "0x58ee40ba", gasLimit: "0x1fffffffffffff", difficulty: "0x1",
      mixHash: "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365", coinbase: ZERO,
      alloc: Object.fromEntries(CUENTAS.map((c) => [c.dir, { balance: "0x" + (10n ** 24n).toString(16) }])),
    },
    blockchain: { nodes: { generate: true, count: 1 } },
  };
  writeFileSync(join(ENSAYO, "qbft.json"), JSON.stringify(conf, null, 2));
  const r = spawnSync(BESU, ["operator", "generate-blockchain-config", `--config-file=${join(ENSAYO, "qbft.json")}`, `--to=${join(ENSAYO, "red")}`, "--private-key-file-name=key"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("generate-blockchain-config: " + r.stderr + r.stdout);
  writeFileSync(join(ENSAYO, "genesis.json"), readFileSync(join(ENSAYO, "red", "genesis.json")));
  const claves = join(ENSAYO, "red", "keys");
  const nodo = readdirSync(claves)[0];
  writeFileSync(join(ENSAYO, "clave-validador"), readFileSync(join(claves, nodo, "key")));
}

// ------------------------------------------------------------------ orden de gobierno
const ACCION = b32("SET_NETWORK_PERMISSION"), ALCANCE = b32("SFSP:NET:ADMISSION");
const TIPO = "tuple(bytes32 kind,address subject,bool granted,bytes32 assetId,bytes4 selector,uint64 untilBlock,bytes32 reasonCode)[]";
const DOM = keccak256(toUtf8Bytes("SFSP-AUTH-v1"));
const TH = keccak256(toUtf8Bytes("SFSPAuthPayload(uint256 chainId,address verifyingContract,bytes32 action,bytes32 assetId,address origin,address destination,uint256 amount,uint256 amountSecondary,bytes32 nonce,uint64 notBefore,uint64 expiry,bytes32 evidenceRoot)"));
let nOp = 0;
async function ordenRed(gov, np, cambios, espera) {
  const ts = Number((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp);
  const tuplas = cambios.map((c) => [c.kind, c.subject, c.granted, c.assetId || ZERO32, c.selector || "0x00000000", String(c.untilBlock || 0), c.reasonCode]);
  const raiz = keccak256(defaultAbiCoder.encode(["bytes32", TIPO], [keccak256(toUtf8Bytes("SFSP.NETWORK_PERMISSIONS.CHANGES.v1")), tuplas]));
  const amplia = cambios.some((c) => c.granted);
  const p = [String(CHAIN_ID), np.address, ACCION, ALCANCE, ZERO, ZERO, String(cambios.length), amplia ? "1" : "0", b32("ensayo_op_" + ++nOp), String(ts - 60), String(ts + 3600), raiz];
  const d = keccak256(defaultAbiCoder.encode(["bytes32", "bytes32", "uint256", "address", "bytes32", "bytes32", "address", "address", "uint256", "uint256", "bytes32", "uint64", "uint64", "bytes32"], [DOM, TH, ...p]));
  await mandar(s1, gov, "proposeAuthorization", [d, ACCION]);
  await mandar(s2, gov, "approveAuthorization", [d]);
  await mandar(s3, gov, "approveAuthorization", [d]);
  if (amplia) await dormir((espera + 2) * 1000);
  return await mandar(junta, np, "applyChanges", [p, d, tuplas]);
}

function pasaporte(assetId, contrato, codehash, legado) {
  return [assetId, b32("iss_ensayo"), b32("legal_ensayo"), b32("EQUITY"), b32("CLASE_ENSAYO"), b32("JUR_ENSAYO"),
    legado ? 0 : 1, 1, [!legado, !legado, !legado, true, !!legado, b32("notas")], [CHAIN_ID, contrato, codehash],
    b32("UNIT"), true, 18, b32("tpl"), b32("v1"), b32("doc"), 1, [0, ZERO32, 0], b32("t"), ZERO32, b32("l"), 1, [2, 2, 1, legado ? 0 : 1, 0, 0]];
}

// ------------------------------------------------------------------ guion
const resultado = { red: `local 127.0.0.1:${PUERTO}, chainId ${CHAIN_ID}, QBFT 1 validador`, besu: null, pasos: [] };
const paso = (nombre, ok, detalle) => { resultado.pasos.push({ nombre, ok, detalle }); console.log(`${ok ? "OK  " : "FALLO"} ${nombre}${detalle ? " — " + detalle : ""}`); };

async function main() {
  genesis();
  resultado.besu = (spawnSync(BESU, ["--version"], { encoding: "utf8" }).stdout.match(/besu\/v[^\s]+/) || ["?"])[0];

  // Fase A · sin filtro: despliegue de la lista y de los destinos de prueba.
  arrancar(["--plugin-sfsp-filtro-habilitado=false"]);
  await listo();
  if (Number(await rpc("eth_chainId")) !== CHAIN_ID) throw new Error("no es la red local");
  const TIMELOCK = 2;
  const registry = await desplegar(junta, "SFSPAssetRegistry", [junta.dir]);
  const gov = await desplegar(junta, "SFSPGovernanceController", [junta.dir, [s1.dir, s2.dir, s3.dir, s4.dir], 2, 3, TIMELOCK, 86400]);
  const np = await desplegar(junta, "SFSPNetworkPermissions", [junta.dir, gov.address, registry.address]);
  const heredado = await desplegar(junta, "SFSPHeredadoDePrueba", [usuario.dir, 1000]);
  const transitorio = await desplegar(junta, "SFSPHeredadoDePrueba", [usuario.dir, 1000]);
  const conforme = await desplegar(junta, "SFSPHeredadoDePrueba", [usuario.dir, 1000]); // hace de «conforme» con pasaporte SFSP_ENFORCED
  await mandar(junta, registry, "grantRole", [(await llamar(registry, "TECH_OPS"))[0], junta.dir]);
  await mandar(junta, gov, "grantRole", [(await llamar(gov, "TECH_OPS"))[0], np.address]);
  const ch = async (a) => keccak256(await rpc("eth_getCode", [a, "latest"]));
  await mandar(junta, registry, "registerAsset", [pasaporte(b32("ENSAYO:CONFORME"), conforme.address, await ch(conforme.address), false)]);
  await mandar(junta, registry, "registerAsset", [pasaporte(b32("ENSAYO:TRANSITORIO"), transitorio.address, await ch(transitorio.address), true)]);
  const corte = (await bloque()) + 60;
  await ordenRed(gov, np, [
    { kind: b32("ASSET_CONTRACT"), subject: conforme.address, granted: true, assetId: b32("ENSAYO:CONFORME"), reasonCode: b32("ENSAYO") },
    { kind: b32("LEGACY_TRANSITIONAL"), subject: transitorio.address, granted: true, assetId: b32("ENSAYO:TRANSITORIO"), untilBlock: corte, reasonCode: b32("ENSAYO") },
  ], TIMELOCK);
  const antes = await intentar(usuario, { to: heredado.address, data: "0xa9059cbb" + defaultAbiCoder.encode(["address", "uint256"], [junta.dir, 1]).slice(2), gas: 100000 });
  paso("fase A (filtro apagado): el heredado todavía opera", antes.ok, antes.error);
  // Parado, el nodo no produce bloques: la activación queda unos bloques después del último.
  const activacion = (await bloque()) + 10;
  await parar();

  // Fase B · filtro encendido desde un bloque de activación.
  arrancar(["--plugin-sfsp-filtro-habilitado=true", `--plugin-sfsp-filtro-contrato=${np.address}`, `--plugin-sfsp-filtro-bloque-activacion=${activacion}`]);
  await listo();
  while ((await bloque()) + 1 < activacion) await dormir(500);
  const transfer = (to) => "0xa9059cbb" + defaultAbiCoder.encode(["address", "uint256"], [to, 1]).slice(2);

  let r = await intentar(usuario, { to: heredado.address, data: transfer(junta.dir), gas: 100000 });
  paso("T-150-02 heredado fuera del catálogo: el nodo lo rechaza", !r.ok && /not authorized|allowlist|TX_SENDER_NOT_AUTHORIZED|Sender/i.test(r.error || ""), r.error);
  r = await intentar(usuario, { to: desplegador.dir, value: 10n ** 18n, gas: 21000 });
  paso("T-150-05 ORIGEN nativo entre cuentas sigue funcionando", r.ok, r.error);
  r = await intentar(usuario, { to: conforme.address, data: transfer(junta.dir), gas: 100000 });
  paso("conforme registrado opera", r.ok, r.error);
  r = await intentar(usuario, { to: transitorio.address, data: transfer(junta.dir), gas: 100000 });
  paso("T-150-04 transitorio opera antes del corte", r.ok, r.error);
  const art0 = art("SFSPHeredadoDePrueba");
  const dataDespliegue = art0.bytecode + new Interface(art0.abi).encodeDeploy([desplegador.dir, 1]).slice(2);
  r = await intentar(desplegador, { data: dataDespliegue, gas: 3_000_000 });
  paso("T-150-01 cuenta fuera de la lista no despliega", !r.ok, r.error);
  // Alta por gobierno: la orden entera viaja por la red cerrada (gobierno y lista siempre admitidos).
  await ordenRed(gov, np, [{ kind: b32("DEPLOYER"), subject: desplegador.dir, granted: true, reasonCode: b32("ENSAYO_D07") }], TIMELOCK);
  r = await intentar(desplegador, { data: dataDespliegue, gas: 3_000_000 });
  paso("T-150-01 con alta de gobierno sí despliega", r.ok, r.error);
  while ((await bloque()) + 1 < corte) await dormir(500);
  r = await intentar(usuario, { to: transitorio.address, data: transfer(junta.dir), gas: 100000 });
  paso("T-150-04 transitorio rechazado desde el bloque de corte", !r.ok, r.error);
  await parar();

  // Fase C · reversión e importación. El validador arranca con el complemento
  // APAGADO (reversión) y un nodo observador lo sigue con el complemento ENCENDIDO.
  // Lo prohibido que el validador mete en un bloque, el observador no lo importa:
  // el filtro actúa también al importar, y por eso tiene que estar igual en todos.
  arrancar(["--plugin-sfsp-filtro-habilitado=false"]);
  await listo();
  const enode = `enode://${new SigningKey("0x" + readFileSync(join(ENSAYO, "clave-validador"), "utf8").trim().replace(/^0x/, "")).publicKey.slice(4)}@127.0.0.1:30399`;
  writeFileSync(join(ENSAYO, "static-nodes.json"), JSON.stringify([enode]));
  const obs = spawn(BESU, [
    `--data-path=${join(ENSAYO, "datos-observador")}`, `--genesis-file=${join(ENSAYO, "genesis.json")}`,
    "--rpc-http-enabled", "--rpc-http-host=127.0.0.1", `--rpc-http-port=${PUERTO + 1}`, "--rpc-http-api=ETH,NET",
    "--host-allowlist=127.0.0.1,localhost", "--p2p-host=127.0.0.1", "--p2p-port=30400", "--discovery-enabled=false",
    `--static-nodes-file=${join(ENSAYO, "static-nodes.json")}`, "--sync-mode=FULL", "--min-gas-price=0",
    "--plugin-sfsp-filtro-habilitado=true", `--plugin-sfsp-filtro-contrato=${np.address}`, `--plugin-sfsp-filtro-bloque-activacion=${activacion}`,
  ], { env: { ...process.env, BESU_OPTS: "" }, stdio: ["ignore", "pipe", "pipe"] });
  const logObs = [];
  obs.stdout.on("data", (d) => logObs.push(d.toString()));
  obs.stderr.on("data", (d) => logObs.push(d.toString()));
  const bloqueObs = async () => { try { return Number(await rpcEn(`http://127.0.0.1:${PUERTO + 1}`, "eth_blockNumber")); } catch { return -1; } };
  let alDia = false;
  for (let i = 0; i < 240 && !alDia; i++) { await dormir(500); alDia = (await bloqueObs()) >= (await bloque()) - 1 && (await bloqueObs()) > corte; }
  paso("el observador CON filtro importa toda la historia admitida (antes y después de la activación)", alDia, `observador en ${await bloqueObs()}, validador en ${await bloque()}`);
  r = await intentar(usuario, { to: heredado.address, data: transfer(junta.dir), gas: 100000 });
  paso("reversión: con el filtro apagado el validador vuelve a admitir el heredado", r.ok, r.error);
  const bloqueMalo = r.rc ? Number(r.rc.blockNumber) : -1;
  await dormir(8000);
  const bObs = await bloqueObs();
  paso("importación: el observador CON filtro rechaza el bloque con la transacción prohibida y se queda atrás",
    alDia && bloqueMalo > 0 && bObs >= bloqueMalo - 1 && bObs < bloqueMalo && (await bloque()) > bloqueMalo, `bloque ${bloqueMalo}; observador en ${bObs}; validador en ${await bloque()}`);
  obs.kill("SIGTERM");
  for (let i = 0; i < 60 && obs.exitCode === null; i++) await dormir(500);
  writeFileSync(join(ENSAYO, `besu-observador-${Date.now()}.log`), logObs.join(""));
  await parar();

  resultado.todoOk = resultado.pasos.every((p) => p.ok);
  writeFileSync(join(ENSAYO, "resultado-ensayo.json"), JSON.stringify(resultado, null, 2) + "\n");
  console.log(resultado.todoOk ? "ENSAYO OK" : "ENSAYO CON FALLOS");
  if (!resultado.todoOk) process.exitCode = 1;
}

main().catch(async (e) => { console.error(e); await parar(); process.exitCode = 1; });
