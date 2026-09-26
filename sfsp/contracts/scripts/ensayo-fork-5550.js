#!/usr/bin/env node
"use strict";
/* ENSAYO GENERAL de SFSP-410 sobre una BIFURCACIÓN LOCAL de la cadena 5550.
 *
 *   node scripts/ensayo-fork-5550.js \
 *        --foto   <tenedores-clasificados.json>   (foto de tenedores, fuera del repo)
 *        --censo  <censo-ondk.json>               (censo ONDK, fuera del repo)
 *        --salida <carpeta>                        (resultados; por defecto $TMPDIR/sfsp410-ensayo)
 *        [--bloque <n>]                            (por defecto: último bloque de la 5550)
 *
 * Qué hace:
 *   0. Levanta un relé JSON-RPC de SÓLO LECTURA (scripts/relay-solo-lectura.js)
 *      hacia el RPC público y bifurca la 5550 en la red Hardhat EN PROCESO
 *      (`hardhat_reset` con `forking`), con chainId 5550, hardfork "merge"
 *      (Paris) y el límite de gas por bloque de la cadena real. hardhat.config.js
 *      no se toca. Nada sale de esta máquina salvo lecturas: el relé rechaza todo
 *      método de escritura, y el propio ensayo lo comprueba al final.
 *   1. Escribe un archivo de parámetros SINTETICO (a partir de la plantilla) y
 *      despliega con scripts/desplegar-sfsp410.js, el MISMO código que se usará
 *      en la red real.
 *   2. Fase de gobierno: los firmantes sintéticos proponen y aprueban cada orden
 *      que el despliegue dejó preparada; TECH_OPS las ejecuta (las de cupo, tras
 *      la espera del timelock).
 *   3. (a) suplanta las cuentas internas (las 6 grandes de ORIGEN y el resto) y
 *      mueve su ORIGEN a la bóveda con `absorb` — SÓLO en la bifurcación;
 *      (b) comprueba circulating() contra la suma de saldos de los tenedores que
 *      no son cuentas internas (usuarios + desconocidos pequeños) de la foto;
 *      (c) libera ORIGEN bajo demanda a un usuario real dentro del cupo;
 *      (d) acuña ONDK nuevo bajo demanda a un usuario real de ONDK;
 *      (e) comprueba que acuñar o liberar hacia una cuenta interna revierte.
 *
 * Identidad: las direcciones de la bifurcación no tienen alta en el adaptador de
 * identidad (que es nuevo). El ensayo da de alta COMPROMISOS SINTÉTICOS para las
 * direcciones que usa. En producción cada alta es una atestación Genesis ID real.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { keccak256 } = require("@ethersproject/keccak256");
const { defaultAbiCoder } = require("@ethersproject/abi");
const { toUtf8Bytes } = require("@ethersproject/strings");
const { getAddress } = require("@ethersproject/address");

const RAIZ = path.join(__dirname, "..");
const RPC_5550 = "https://rpc.ordenglobal-rpc.com/";
const PLANTILLA = path.join(RAIZ, "..", "deploy", "sfsp410", "parametros.plantilla.json");
const E18 = 10n ** 18n;
const ZERO32 = "0x" + "00".repeat(32);

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--foto") a.foto = argv[++i];
    else if (k === "--censo") a.censo = argv[++i];
    else if (k === "--salida") a.salida = argv[++i];
    else if (k === "--bloque") a.bloque = Number(argv[++i]);
    else throw new Error("argumento desconocido: " + k);
  }
  if (!a.foto || !a.censo) throw new Error("faltan --foto y --censo (datos fuera del repositorio)");
  a.salida = path.resolve(a.salida || path.join(os.tmpdir(), "sfsp410-ensayo"));
  return a;
}

const fmt = (wei, dec = 18) => {
  const neg = wei < 0n;
  const w = neg ? -wei : wei;
  const ent = w / 10n ** BigInt(dec);
  const fr = (w % 10n ** BigInt(dec)).toString().padStart(dec, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + ent.toString() + (fr ? "." + fr : "");
};
const corto = (a) => a.slice(0, 6) + "…" + a.slice(-4);

async function main() {
  const A = args(process.argv.slice(2));
  fs.mkdirSync(A.salida, { recursive: true });
  process.chdir(RAIZ);
  process.env.HARDHAT_NETWORK = "hardhat";

  const { arrancarRelay } = require("./relay-solo-lectura");
  const Dp = require("./desplegar-sfsp410");
  const hre = require("hardhat");

  // ------------------------------------------------------------ 0. bifurcación
  const relay = await arrancarRelay(RPC_5550);
  const remoto = async (method, params = []) => {
    const r = await fetch(relay.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  };
  const chainRemoto = Number(BigInt(await remoto("eth_chainId")));
  if (chainRemoto !== 5550) throw new Error("el RPC no es la 5550: " + chainRemoto);
  const bloqueFork = A.bloque || Number(BigInt(await remoto("eth_blockNumber")));
  const cab = await remoto("eth_getBlockByNumber", ["0x" + bloqueFork.toString(16), false]);
  const cliente = await remoto("web3_clientVersion");

  // La red Hardhat EN PROCESO se reconfigura aquí, antes de crear el proveedor:
  // chainId 5550 (las órdenes quedan atadas al chainId real), historia de
  // hardforks para 5550 (Paris desde el bloque 0) y el límite de gas de la cadena.
  const cfg = hre.config.networks.hardhat;
  cfg.chainId = 5550;
  cfg.hardfork = "merge";
  cfg.blockGasLimit = Number(BigInt(cab.gasLimit));
  cfg.chains.set(5550, { hardforkHistory: new Map([["merge", 0]]) });
  const prov = hre.network.provider;
  const rpc = (method, params = []) => prov.request({ method, params });
  await rpc("hardhat_reset", [{ forking: { jsonRpcUrl: relay.url, blockNumber: bloqueFork } }]);
  const chainLocal = Number(BigInt(await rpc("eth_chainId")));
  const cliLocal = await rpc("web3_clientVersion");
  console.log(`Bifurcación local de la 5550 en el bloque ${bloqueFork} (${cliente}) · chainId local ${chainLocal} · ${cliLocal}`);

  // Las cuentas sintéticas de Hardhat nacen con 10 000 "ETH" que en la 5550 no
  // existen: se les devuelve su saldo REAL de la 5550 (0) para que la suma de
  // saldos siga siendo exactamente la del génesis. Sin gas: precio 0 (baseFee 0).
  const cuentas = (await rpc("eth_accounts")).map(getAddress);
  for (const c of cuentas) {
    const real = await remoto("eth_getBalance", [c, "0x" + bloqueFork.toString(16)]);
    await rpc("hardhat_setBalance", [c, real]);
  }

  // ------------------------------------------------------------ 1. parámetros SINTETICOS
  const P = JSON.parse(fs.readFileSync(PLANTILLA, "utf8"));
  const tsFork = BigInt(cab.timestamp);
  const ahora = BigInt((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp);
  const [desplegador, f1, f2, f3, f4, junta, techOps, emisor, atestador, atestadorMig, auditor] = cuentas;
  const firmantes = [f1, f2, f3, f4].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  const GOV = { quorum: 2, quorumUpgrade: 3, timelock: 3600, maxPausa: 86400, vigencia: 3 * 3600 };
  const pas = (unit) => ({
    issuerId: "SINTETICO:EMISOR", legalInstrumentId: "SINTETICO:INSTRUMENTO", economicType: "SINTETICO",
    legalClass: "SINTETICO:CLASE", jurisdiction: "SINTETICO:JUR", unit,
    rightsTemplateId: "SINTETICO:DERECHOS", rightsTemplateVersion: "v0", documentRoot: "SINTETICO:DOC",
    transferPolicyId: "SINTETICO:TRANSFER", redemptionPolicyId: "SINTETICO:REDENCION", listingPolicyId: "SINTETICO:LISTADO",
    capacidades: { freeze: true, forcedTransfer: true },
    estado: { legal: "CLASSIFIED", admission: "APPROVED", trading: "NOT_LISTED", transferability: "RESTRICTED", redemption: "NONE" },
  });
  const pol = (acciones) => ({
    acciones, requiresHumanReview: false, requiresAuthorization: false, jurisdictionAllowlist: false,
    jurisdiccionesPermitidas: [], requiredPurpose: "NINGUNO", maxAmount: "0",
  });
  const cupo = (perPeriod, maxOp, doc) => ({
    perPeriod: (BigInt(perPeriod) * E18).toString(), period: 86400, maxPerOperation: (BigInt(maxOp) * E18).toString(),
    validUntil: Number(ahora + 30n * 86400n), termsDocRoot: doc,
  });
  const LIM = { ONDK: 555_000_000n, AUKA: 55_000_000n, IBS: 500_000_000n, HARV: 1_000_000_000_000n };
  const S = {
    ...P,
    _estado: "SINTETICO — valores inventados para el ensayo en bifurcación local. NO son una propuesta ni una decisión de la Junta. Nunca van a red real (el script lo impide).",
    sintetico: true,
    red: { ...P.red, genesisHash: (await rpc("eth_getBlockByNumber", ["0x0", false])).hash },
    desplegador,
    gobierno: { ...P.gobierno, firmantes, quorum: GOV.quorum, quorumUpgrade: GOV.quorumUpgrade, timelockSegundos: GOV.timelock, pausaMaximaSegundos: GOV.maxPausa, vigenciaOrdenesSegundos: GOV.vigencia },
    roles: { ...P.roles, junta, techOps, emisor, atestador, atestadorMigracion: atestadorMig, auditor },
    origen: { ...P.origen, pasaporte: pas("ORIGEN"), politicaElegibilidad: pol(["MINT"]), cupoLiberacion: cupo(1000, 100, "SINTETICO:ACTA:CUPO:ORIGEN") },
    activos: P.activos.map((a) => ({
      ...a,
      erc20Interop: true,
      limites: { outstandingLimit: (LIM[a.simbolo] * E18).toString(), cumulativeCap: (LIM[a.simbolo] * E18).toString() },
      cupoEmision: typeof a.cupoEmision === "object" ? cupo(10_000, 1_000, `SINTETICO:ACTA:CUPO:${a.simbolo}`) : a.cupoEmision,
      pasaporte: pas(a.simbolo),
      politicaElegibilidad: pol(a.politicaElegibilidad.acciones),
    })),
    // Las direcciones reales no viven en el repositorio público: se leen de un
    // archivo externo (CUENTAS_INTERNAS=<ruta>) con la forma de `cuentasInternas`.
    cuentasInternas: {
      ...P.cuentasInternas,
      ...(process.env.CUENTAS_INTERNAS ? JSON.parse(fs.readFileSync(process.env.CUENTAS_INTERNAS, "utf8")) : {}),
      confirmadaPorActa: true,
      _confirmadaNota: "SINTETICO: en el ensayo se da por confirmada; en real exige el acta de D25.",
    },
  };
  const rutaParametros = path.join(A.salida, "parametros.SINTETICO.json");
  fs.writeFileSync(rutaParametros, JSON.stringify(S, null, 2));

  // ------------------------------------------------------------ 2. despliegue
  console.log("\n== DESPLIEGUE (mismo script que la red real) ==");
  const reg = await Dp.desplegar({ prov, rutaParametros, real: false, modo: "proceso", salida: path.join(A.salida, "despliegue-ensayo.json"), log: console.log });

  // Contexto propio del ensayo (gas por paso).
  const ctx = Dp.crearContexto(prov, { from: techOps, gasPrecioCero: true, topeGas: (BigInt(cab.gasLimit) * 95n) / 100n });
  const K = (nombre, address) => new Dp.Contrato(ctx, nombre, address, Dp.leerArtefacto(nombre).abi);
  const gov = K("SFSPGovernanceController", reg.contratos.SFSPGovernanceController.address);
  const vault = K("SFSPNativeVault", reg.origen.boveda);
  const issuance = K("SFSPIssuanceController", reg.contratos.SFSPIssuanceController.address);
  const engine = K("SFSPEligibilityEngine", reg.contratos.SFSPEligibilityEngine.address);
  const identity = K("SFSPIdentityAdapter", reg.contratos.SFSPIdentityAdapter.address);
  const ondk = K("SFSPRegulatedAsset", reg.activos.ONDK.contrato);
  const bal = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]));
  const resultado = {
    aviso: "ENSAYO EN BIFURCACIÓN LOCAL. Ningún dato de este archivo existe en la 5550.",
    bifurcacion: { bloque: bloqueFork, hash: cab.hash, fecha: new Date(Number(tsFork) * 1000).toISOString(), clienteRemoto: cliente, chainIdLocal: chainLocal, gasLimitBloque: Number(BigInt(cab.gasLimit)) },
    despliegue: { archivo: "despliegue-ensayo.json", gas: reg.gas, parametrosSha256: reg.parametros.sha256, desplegadorSinRoles: reg.desplegadorSinRoles },
    pasos: {},
  };

  // ------------------------------------------------------------ 3. gobierno
  console.log("\n== GOBIERNO: proponer, aprobar, esperar, ejecutar ==");
  ctx.paso = "gobierno-proponer-aprobar";
  for (const o of reg.ordenesDeGobierno) {
    await gov.send("proposeAuthorization", [o.digest, Dp.b32(o.accionGobierno)], { from: firmantes[0] });
    await gov.send("approveAuthorization", [o.digest], { from: firmantes[1] });
    await gov.send("approveAuthorization", [o.digest], { from: firmantes[2] });
  }
  const ejecutar = async (o) => {
    const t = Dp.tupla(o.payload);
    if (o.tipo === "SET_POLICY") {
      const g = o.argumentos;
      return engine.send("setPolicy", [g.assetId, g.policyAction, g.policy, t, o.digest], { from: techOps });
    }
    const g = o.argumentos;
    const c = o.tipo === "SET_MINT_BUDGET" ? issuance : vault;
    return c.send(o.funcion, [t, o.digest, g.period, g.validUntil, g.termsDocRoot], { from: techOps });
  };
  ctx.paso = "gobierno-ejecutar-politicas";
  for (const o of reg.ordenesDeGobierno.filter((x) => !x.esperaTimelock)) await ejecutar(o);
  // Un cupo NO se puede fijar antes de la espera (R5): se comprueba.
  const cupoOrigen = reg.ordenesDeGobierno.find((x) => x.tipo === "SET_RELEASE_BUDGET");
  let antesDeEspera = null;
  try {
    await ejecutar(cupoOrigen);
  } catch (e) {
    antesDeEspera = /BudgetWaitPending/.test(e.message) ? "BudgetWaitPending" : e.message.slice(0, 120);
  }
  await rpc("evm_increaseTime", [GOV.timelock + 1]);
  await rpc("evm_mine", []);
  ctx.paso = "gobierno-ejecutar-cupos";
  for (const o of reg.ordenesDeGobierno.filter((x) => x.esperaTimelock)) await ejecutar(o);
  resultado.pasos.gobierno = {
    ordenes: reg.ordenesDeGobierno.length,
    politicas: reg.ordenesDeGobierno.filter((x) => x.tipo === "SET_POLICY").length,
    cupos: reg.ordenesDeGobierno.filter((x) => x.esperaTimelock).map((x) => x.simbolo),
    cupoAntesDeLaEspera: antesDeEspera,
    cupoOrigen: (await vault.call("releaseBudget")).perPeriod.toString(),
    cupoONDK: (await issuance.call("mintBudgetOf", [reg.activos.ONDK.assetId])).perPeriod.toString(),
  };
  console.log(`  ${resultado.pasos.gobierno.ordenes} órdenes aprobadas y ejecutadas; cupo antes de la espera → ${antesDeEspera}`);

  // ------------------------------------------------------------ 4. circulante antes
  const foto = JSON.parse(fs.readFileSync(A.foto, "utf8"));
  const censo = JSON.parse(fs.readFileSync(A.censo, "utf8"));
  const origenFoto = foto.activos.find((x) => x.asset === "ORIGEN");
  const internas = new Set(S.cuentasInternas.lista.map((c) => c.direccion.toLowerCase()));
  const tenedores = origenFoto.holders.filter((h) => /^0x[0-9a-f]{40}$/i.test(h.address));
  const noInternos = tenedores.filter((h) => !internas.has(h.address.toLowerCase()));
  const sumaVivo = async (lista) => {
    let s = 0n;
    for (const h of lista) s += await bal(h.address);
    return s;
  };
  const porClaseFoto = {};
  const porClaseVivo = {};
  for (const h of noInternos) {
    porClaseFoto[h.clase] = (porClaseFoto[h.clase] || 0n) + BigInt(h.balanceRaw);
    porClaseVivo[h.clase] = (porClaseVivo[h.clase] || 0n) + (await bal(h.address));
  }
  const esperadoVivo = await sumaVivo(noInternos);
  const esperadoFoto = noInternos.reduce((s, h) => s + BigInt(h.balanceRaw), 0n);
  const circAntes = BigInt((await vault.call("circulating")).toString());
  const internoAntes = BigInt((await vault.call("internalOutsideVault")).toString());
  const genesis = BigInt(reg.origen.genesisSupply);
  // Cuadre total: toda la 5550 = tenedores de la foto (la foto sumaba exactamente el génesis).
  const sumaTodos = await sumaVivo(tenedores);
  resultado.pasos.circulanteAntes = {
    circulating: fmt(circAntes),
    internasFueraDeBoveda: fmt(internoAntes),
    esperadoNoInternosVivo: fmt(esperadoVivo),
    esperadoNoInternosFoto270224: fmt(esperadoFoto),
    porClaseVivo: Object.fromEntries(Object.entries(porClaseVivo).map(([k, v]) => [k, fmt(v)])),
    cuadra: circAntes === esperadoVivo,
    sumaTodosLosTenedoresFoto: fmt(sumaTodos),
    tenedoresFotoCubrenGenesis: sumaTodos === genesis,
  };
  console.log(`\n== CIRCULANTE ANTES DE CONSOLIDAR ==\n  circulating() = ${fmt(circAntes)} ORIGEN · esperado (no internos, vivo) = ${fmt(esperadoVivo)} · ${circAntes === esperadoVivo ? "CUADRA" : "NO CUADRA"}`);

  // ------------------------------------------------------------ 5. (a) consolidar en la bóveda
  console.log("\n== (a) CONSOLIDAR: las cuentas internas devuelven su ORIGEN a la bóveda (SÓLO EN LA BIFURCACIÓN) ==");
  ctx.paso = "a-absorb";
  const absorbidos = [];
  for (const c of S.cuentasInternas.lista) {
    const a = getAddress(c.direccion);
    const b = await bal(a);
    if (b === 0n) continue;
    await rpc("hardhat_impersonateAccount", [a]);
    const rec = await vault.send("absorb", [Dp.b32("CONSOLIDACION_SFSP410")], { from: a, value: b });
    await rpc("hardhat_stopImpersonatingAccount", [a]);
    absorbidos.push({ direccion: corto(a), grupo: c.grupo, monto: fmt(b), gas: Number(BigInt(rec.gasUsed)) });
  }
  const vb = BigInt((await vault.call("vaultBalance")).toString());
  const circDespues = BigInt((await vault.call("circulating")).toString());
  const internoDespues = BigInt((await vault.call("internalOutsideVault")).toString());
  resultado.pasos.a_consolidacion = {
    cuentasConSaldo: absorbidos.length,
    boveda: fmt(vb),
    totalAbsorbed: fmt(BigInt((await vault.call("totalAbsorbed")).toString())),
    internasFueraDeBoveda: fmt(internoDespues),
    gasPorAbsorb: absorbidos.length ? Math.round(absorbidos.reduce((s, x) => s + x.gas, 0) / absorbidos.length) : 0,
    detalle: absorbidos,
  };
  console.log(`  ${absorbidos.length} cuentas · bóveda = ${fmt(vb)} ORIGEN · internas fuera = ${fmt(internoDespues)}`);

  // ------------------------------------------------------------ 6. (b) verificación
  const esperadoVivo2 = await sumaVivo(noInternos);
  resultado.pasos.b_verificacion = {
    circulating: fmt(circDespues),
    esperado: fmt(esperadoVivo2),
    cuadra: circDespues === esperadoVivo2,
    identidad: "genesis = boveda + internas fuera + circulante",
    identidadCuadra: genesis === vb + internoDespues + circDespues,
    igualQueAntes: circDespues === circAntes,
    usuariosFoto: fmt(porClaseFoto.USUARIO || 0n),
    desconocidosPequenosFoto: fmt(porClaseFoto.DESCONOCIDO || 0n),
  };
  console.log(`== (b) circulating() = ${fmt(circDespues)} · usuarios ${fmt(porClaseFoto.USUARIO || 0n)} + desconocidos pequeños ${fmt(porClaseFoto.DESCONOCIDO || 0n)} · ${circDespues === esperadoVivo2 ? "CUADRA" : "NO CUADRA"} · génesis = bóveda + internas + circulante: ${resultado.pasos.b_verificacion.identidadCuadra}`);

  // ------------------------------------------------------------ 7. identidad sintética
  const TAG = keccak256(toUtf8Bytes("SFSP.SUBJECT.COMMITMENT.v1"));
  const compromiso = (quien) =>
    keccak256(defaultAbiCoder.encode(["bytes32", "bytes32", "bytes32", "bytes32"], [TAG, Dp.b32("SINT:" + quien.slice(2, 20)), Dp.b32("BASE"), keccak256(toUtf8Bytes("SAL-SINTETICA-" + quien))]));
  const usuariosOrigen = noInternos.filter((h) => h.clase === "USUARIO").sort((x, y) => (BigInt(y.balanceRaw) > BigInt(x.balanceRaw) ? 1 : -1));
  const pendientes = new Set(Object.keys(S.cuentasInternas._pendientesDeClasificar || {}).map((k) => k.toLowerCase()));
  const usuariosOndk = censo.tenedores
    .filter((t) => t.clase === "USUARIO" && /^0x[0-9a-f]{40}$/i.test(t.address) && !internas.has(t.address.toLowerCase()) && !pendientes.has(t.address.toLowerCase()))
    .sort((x, y) => (BigInt(y.ondkRaw) > BigInt(x.ondkRaw) ? 1 : -1));
  const uOrigen = getAddress(usuariosOrigen[0].address);
  const uOrigenSinAlta = getAddress(usuariosOrigen[1].address);
  const uOndk = getAddress(usuariosOndk.find((t) => t.address.toLowerCase() !== uOrigen.toLowerCase()).address);
  const internaOndk = getAddress("0x3c27ce23403f3ed2ade089b5d52bf191de27791a");
  ctx.paso = "identidad-sintetica";
  for (const u of [uOrigen, uOndk, internaOndk]) {
    await identity.send("bindPurposeCommitment", [u, Dp.b32("BASE"), compromiso(u)], { from: atestador });
  }

  // ------------------------------------------------------------ 8. (c) liberar ORIGEN bajo demanda
  console.log("\n== (c) releaseOnDemand a un usuario real, dentro del cupo ==");
  const LIB = 50n * E18;
  const antesU = await bal(uOrigen);
  ctx.paso = "c-releaseOnDemand";
  const recLib = await vault.send("releaseOnDemand", [uOrigen, LIB.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ORIGEN:1")), keccak256(toUtf8Bytes("ENSAYO:RECIBO:1"))], { from: emisor });
  const circLib = BigInt((await vault.call("circulating")).toString());
  const neg = async (fn, nombre) => {
    try {
      await fn();
    } catch (e) {
      if (e.message.includes(nombre)) return nombre;
      return "OTRO: " + e.message.slice(0, 160);
    }
    return "NO REVIRTIO";
  };
  ctx.paso = "c-negativos";
  resultado.pasos.c_liberacion = {
    usuario: corto(uOrigen),
    monto: fmt(LIB),
    saldoAntes: fmt(antesU),
    saldoDespues: fmt(await bal(uOrigen)),
    gas: Number(BigInt(recLib.gasUsed)),
    circulanteSube: fmt(circLib - circDespues),
    cuadra: circLib - circDespues === LIB && (await bal(uOrigen)) - antesU === LIB,
    cupoRestante: fmt(BigInt((await vault.call("budgetRemaining")).toString())),
    negativos: {
      mismoPagoDosVeces: await neg(() => vault.send("releaseOnDemand", [uOrigen, E18.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ORIGEN:1")), ZERO32], { from: emisor }), "OperationReplay"),
      porEncimaDelMaximoPorOperacion: await neg(() => vault.send("releaseOnDemand", [uOrigen, (101n * E18).toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ORIGEN:2")), ZERO32], { from: emisor }), "BudgetOperationTooLarge"),
      usuarioSinAlta: await neg(() => vault.send("releaseOnDemand", [uOrigenSinAlta, E18.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ORIGEN:3")), ZERO32], { from: emisor }), "ReleaseRejected"),
      haciaCuentaInterna: await neg(() => vault.send("releaseOnDemand", [getAddress("0xef9885d2443345c982bcfebd7683fcb34bedcb45"), E18.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ORIGEN:4")), ZERO32], { from: emisor }), "ReleaseToInternalAccount"),
      noEmisor: await neg(() => vault.send("releaseOnDemand", [uOrigen, E18.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ORIGEN:5")), ZERO32], { from: techOps }), "Unauthorized"),
    },
  };
  console.log(`  +${fmt(LIB)} ORIGEN a ${corto(uOrigen)} · circulante +${fmt(circLib - circDespues)} · gas ${resultado.pasos.c_liberacion.gas}`);

  // ------------------------------------------------------------ 9. (d) acuñar ONDK nuevo bajo demanda
  console.log("\n== (d) mintOnDemand de ONDK (SFSP) a un usuario real de ONDK ==");
  const ACU = 250n * E18;
  ctx.paso = "d-mintOnDemand";
  const recMint = await issuance.send("mintOnDemand", [reg.activos.ONDK.assetId, uOndk, ACU.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ONDK:1")), keccak256(toUtf8Bytes("ENSAYO:RECIBO:ONDK:1"))], { from: emisor });
  const ts = BigInt((await ondk.call("totalSupply")).toString());
  const bu = BigInt((await ondk.call("balanceOf", [uOndk])).toString());
  resultado.pasos.d_emision = {
    usuario: corto(uOndk),
    monto: fmt(ACU),
    gas: Number(BigInt(recMint.gasUsed)),
    totalSupply: fmt(ts),
    saldoUsuario: fmt(bu),
    totalSupplyIgualSaldosUsuarios: ts === bu,
    cupoRestante: fmt(BigInt((await issuance.call("budgetRemaining", [reg.activos.ONDK.assetId])).toString())),
    ondkViejoIntacto: "el contrato ONDK viejo no se toca; su migración (D26) va aparte",
  };
  console.log(`  +${fmt(ACU)} ONDK a ${corto(uOndk)} · totalSupply = ${fmt(ts)} = saldo del usuario · gas ${resultado.pasos.d_emision.gas}`);

  // ------------------------------------------------------------ 10. (e) nunca a una cuenta interna
  console.log("\n== (e) acuñar hacia una cuenta interna revierte ==");
  ctx.paso = "e-negativos";
  resultado.pasos.e_internas = {
    cuentaInterna: corto(internaOndk),
    nota: "la cuenta interna tiene alta de identidad sintética: aun siendo 'elegible', R1 la rechaza",
    mintOnDemandHaciaInterna: await neg(() => issuance.send("mintOnDemand", [reg.activos.ONDK.assetId, internaOndk, E18.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ONDK:INT")), ZERO32], { from: emisor }), "MintToInternalAccount"),
    releaseOnDemandHaciaInterna: await neg(() => vault.send("releaseOnDemand", [internaOndk, E18.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ORIGEN:INT")), ZERO32], { from: emisor }), "ReleaseToInternalAccount"),
    desmarcarInternaSinJunta: await neg(() => issuance.send("setInternalAccount", [internaOndk, false, Dp.b32("ENSAYO")], { from: techOps }), "InternalAccountUnflagNeedsBoard"),
    totalSupplySigue: fmt(BigInt((await ondk.call("totalSupply")).toString())),
  };
  // Cortar el cupo: un solo firmante, al instante (R6).
  ctx.paso = "e-corte-cupo";
  await issuance.send("revokeMintBudget", [reg.activos.ONDK.assetId, Dp.b32("ENSAYO_CORTE")], { from: firmantes[3] });
  resultado.pasos.e_internas.trasCorteDeUnFirmante = await neg(
    () => issuance.send("mintOnDemand", [reg.activos.ONDK.assetId, uOndk, E18.toString(), keccak256(toUtf8Bytes("ENSAYO:PAGO:ONDK:2")), ZERO32], { from: emisor }),
    "BudgetNotSet",
  );
  for (const [k, v] of Object.entries(resultado.pasos.e_internas)) console.log(`  ${k}: ${v}`);

  // ------------------------------------------------------------ 11. cierre
  const gasPorPaso = {};
  for (const t of ctx.txs) gasPorPaso[t.paso] = (gasPorPaso[t.paso] || { tx: 0, gas: 0 }), (gasPorPaso[t.paso].tx += 1), (gasPorPaso[t.paso].gas += t.gasUsed);
  resultado.gasEnsayoPorPaso = gasPorPaso;
  resultado.gasDesplieguePorPaso = reg.gas.porPaso;
  // Prueba de la barrera: una escritura hacia la 5550 se rechaza en el relé.
  let barrera;
  try {
    await remoto("eth_sendRawTransaction", ["0x00"]);
    barrera = "NO BLOQUEADA";
  } catch (e) {
    barrera = /bloqueado/.test(e.message) ? "BLOQUEADA en el relé" : e.message;
  }
  resultado.relay = { reenviadasSoloLectura: relay.contadores.reenviadas, bloqueadas: relay.contadores.bloqueadas, porMetodo: relay.contadores.porMetodo, pruebaEscritura: barrera };
  resultado.todoCuadra =
    resultado.pasos.circulanteAntes.cuadra && resultado.pasos.b_verificacion.cuadra && resultado.pasos.b_verificacion.identidadCuadra &&
    resultado.pasos.c_liberacion.cuadra && resultado.pasos.d_emision.totalSupplyIgualSaldosUsuarios &&
    Object.values(resultado.pasos.c_liberacion.negativos).every((v) => !/^OTRO|NO REVIRTIO/.test(v)) &&
    ["mintOnDemandHaciaInterna", "releaseOnDemandHaciaInterna", "desmarcarInternaSinJunta", "trasCorteDeUnFirmante"].every((k) => !/^OTRO|NO REVIRTIO/.test(resultado.pasos.e_internas[k])) &&
    reg.desplegadorSinRoles === true;
  fs.writeFileSync(path.join(A.salida, "ensayo-resultado.json"), JSON.stringify(resultado, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log(`\nRelé: ${relay.contadores.reenviadas} lecturas reenviadas, escritura de prueba: ${barrera}`);
  console.log(`RESULTADO: ${resultado.todoCuadra ? "TODO CUADRA" : "HAY FALLOS"} · ${path.join(A.salida, "ensayo-resultado.json")}`);
  await relay.cerrar();
  if (!resultado.todoCuadra) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
