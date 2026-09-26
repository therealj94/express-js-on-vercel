"use strict";
/* SFSP-150 · Red cerrada (v0.3 §2.1): la lista que consulta el filtro de Besu.
 *
 * Besu 26.x ya no trae permisos de cuentas por contrato (retirados en 25.6.0).
 * El complemento `sfsp/red/filtro-besu/` llama a `transactionAllowed` con la
 * MISMA codificación que usaba la opción retirada; aquí se prueba la lógica del
 * contrato y esa codificación byte a byte. Todo es sintético y en memoria. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");

const ACCION = H.b32("SET_NETWORK_PERMISSION");
const ALCANCE = H.b32("SFSP:NET:ADMISSION");
const ETIQUETA = H.keccak256(Buffer.from("SFSP.NETWORK_PERMISSIONS.CHANGES.v1", "utf8"));
const TIPO_CAMBIOS =
  "tuple(bytes32 kind,address subject,bool granted,bytes32 assetId,bytes4 selector,uint64 untilBlock,bytes32 reasonCode)[]";
const K = {
  DEPLOYER: H.b32("DEPLOYER"),
  ASSET: H.b32("ASSET_CONTRACT"),
  LEGACY: H.b32("LEGACY_TRANSITIONAL"),
  SYSTEM: H.b32("SYSTEM_TARGET"),
  SYSFN: H.b32("SYSTEM_FUNCTION"),
};
const ASSET_RED = H.b32("SFSP:SEC:NET:S1");
const ASSET_HEREDADO = H.b32("SFSP:LEGACY:NET:S0");
const SIN_SELECTOR = "0x00000000";
const TRANSFER = "0xa9059cbb";

const { network } = require("hardhat");
const P = network.provider;

let seq = 0;
function cambio(o) {
  return {
    kind: o.kind,
    subject: o.subject,
    granted: o.granted !== undefined ? o.granted : true,
    assetId: o.assetId || H.ZERO32,
    selector: o.selector || SIN_SELECTOR,
    untilBlock: String(o.untilBlock || 0),
    reasonCode: o.reasonCode !== undefined ? o.reasonCode : H.b32("ACTA_PRUEBA"),
  };
}
const aTupla = (c) => [c.kind, c.subject, c.granted, c.assetId, c.selector, c.untilBlock, c.reasonCode];
function raizCambios(cs) {
  return H.keccak256(H.defaultAbiCoder.encode(["bytes32", TIPO_CAMBIOS], [ETIQUETA, cs.map(aTupla)]));
}

/** Orden SET_NETWORK_PERMISSION: payload, digest y (salvo que se pida) quórum y espera. */
async function orden(f, np, cs, o) {
  const opt = o || {};
  const ts = await H.now();
  const amplia = cs.some((c) => c.granted);
  seq += 1;
  const p = await OA.orden({
    verifyingContract: np.address,
    action: ACCION,
    assetId: ALCANCE,
    amount: String(cs.length),
    amountSecondary: amplia ? "1" : "0",
    nonce: H.b32("op_red_" + seq),
    expiry: ts + 3 * 3600,
    evidenceRoot: opt.raiz || raizCambios(cs),
  });
  const d = OA.digestDe(p);
  if (!opt.sinAprobar) await OA.aprobar(f, d, opt.etiqueta || ACCION, opt.quienes);
  if (amplia && !opt.sinEspera) await H.increaseTime(F.GOV.timelockDelay + 1);
  return { p, d };
}
async function aplicar(f, np, cs, o) {
  const { p, d } = await orden(f, np, cs, o);
  return await np.send("applyChanges", [OA.tupla(p), d, cs.map(aTupla)], (o && o.desde) || f.board);
}

async function permitido(np, sender, target, payload) {
  return await np.call("transactionAllowed", [sender, target, 0, 0, 21000, payload || "0x"]);
}
async function codehash(addr) {
  return H.keccak256(await P.send("eth_getCode", [addr, "latest"]));
}
async function minar(n) {
  for (let i = 0; i < n; i++) await P.send("evm_mine", []);
}
async function bloque() {
  return Number(await P.send("eth_blockNumber", []));
}

/** Codificación EXACTA de Besu (TransactionSmartContractPermissioningController,
 *  26.7.1): selector ‖ sender ‖ to ‖ value ‖ gasPrice ‖ gasLimit ‖ 192 ‖ len ‖
 *  payload ‖ relleno de (32 − len mod 32) bytes (32 si len es múltiplo de 32). */
function calldataBesu(sender, to, value, gasPrice, gasLimit, payloadHex) {
  const sel = H.keccak256(Buffer.from("transactionAllowed(address,address,uint256,uint256,uint256,bytes)", "utf8")).slice(0, 10);
  const pal = (x) => BigInt(x).toString(16).padStart(64, "0");
  const dir = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const cuerpo = payloadHex.replace(/^0x/, "");
  const len = cuerpo.length / 2;
  const relleno = "00".repeat(32 - (len % 32));
  return sel + dir(sender) + dir(to) + pal(value) + pal(gasPrice) + pal(gasLimit) + pal(192) + pal(len) + cuerpo + relleno;
}

describe("SFSP-150 · red cerrada: SFSPNetworkPermissions", function () {
  let f, np, heredado, deployer, extrano;

  beforeEach(async function () {
    f = await F.deployAll();
    np = await H.deploy("SFSPNetworkPermissions", [f.board, f.governance.address, f.registry.address], f.board);
    await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), np.address], f.board);
    const acc = await H.accounts();
    deployer = acc[9];
    extrano = f.mallory;
    heredado = await H.deploy("SFSPHeredadoDePrueba", [f.alice, "1000"], f.board);

    // Pasaporte del conforme: nombra el contrato y su codehash real.
    const pc = F.passport(ASSET_RED);
    pc.settlementLocation = { chainId: 31337, contractAddress: f.assetNew.address, codehash: await codehash(f.assetNew.address) };
    await f.registry.send("registerAsset", [pc], f.board);
    // Pasaporte del heredado en registro transitorio: perfil LEGACY con bypass declarado.
    const ph = F.passport(ASSET_HEREDADO, { profile: F.Profile.LEGACY_REGISTERED, directTransferBypass: true, transferRestrictions: false });
    ph.settlementLocation = { chainId: 31337, contractAddress: heredado.address, codehash: await codehash(heredado.address) };
    await f.registry.send("registerAsset", [ph], f.board);
  });

  // ---------------------------------------------------------------- nivel 1
  it("T-150-01 · una cuenta fuera de la lista no despliega; con alta sí; con baja otra vez no", async function () {
    assert.equal(await permitido(np, deployer, H.ZERO_ADDR, "0x6080"), false);
    await aplicar(f, np, [cambio({ kind: K.DEPLOYER, subject: deployer })]);
    assert.equal(await permitido(np, deployer, H.ZERO_ADDR, "0x6080"), true);
    assert.equal(await permitido(np, extrano, H.ZERO_ADDR, "0x6080"), false, "otra cuenta sigue sin poder");
    await aplicar(f, np, [cambio({ kind: K.DEPLOYER, subject: deployer, granted: false })]);
    assert.equal(await permitido(np, deployer, H.ZERO_ADDR, "0x6080"), false);
  });

  // ---------------------------------------------------------------- nivel 2
  it("T-150-02 · un ERC-20 heredado fuera del catálogo no admite transacciones", async function () {
    const data = TRANSFER + H.defaultAbiCoder.encode(["address", "uint256"], [f.bob, 1]).slice(2);
    assert.equal(await permitido(np, f.alice, heredado.address, data), false);
    assert.equal(await permitido(np, f.alice, heredado.address, "0x"), false, "ni siquiera sin datos: tiene código");
  });

  it("T-150-03 · un conforme cuyo codehash no coincide con el pasaporte no se admite, y si cambia deja de admitirse", async function () {
    // Pasaporte con codehash falso.
    const otro = H.b32("SFSP:SEC:NET:MAL");
    const pm = F.passport(otro);
    pm.settlementLocation = { chainId: 31337, contractAddress: f.assetOld.address, codehash: H.b32("no_es_el_codigo") };
    await f.registry.send("registerAsset", [pm], f.board);
    const c = cambio({ kind: K.ASSET, subject: f.assetOld.address, assetId: otro });
    const { p, d } = await orden(f, np, [c]);
    const err = await np.call("applyChanges", [OA.tupla(p), d, [aTupla(c)]], f.board).then(() => "sin error", (e) => String(e.message));
    const esperado = np.iface.encodeErrorResult("InvalidChange", [0, H.b32("CODEHASH")]);
    assert.ok(err.includes(esperado.slice(2, 40)) || err.includes("InvalidChange"), err);
    await H.expectRevert(np.send("applyChanges", [OA.tupla(p), d, [aTupla(c)]], f.board), H.b32("CODEHASH"));
    assert.equal(await permitido(np, f.alice, f.assetOld.address, TRANSFER), false);

    // El bueno se admite y opera…
    await aplicar(f, np, [cambio({ kind: K.ASSET, subject: f.assetNew.address, assetId: ASSET_RED })]);
    assert.equal(await permitido(np, f.alice, f.assetNew.address, TRANSFER), true);
    // …y si su código cambiara (aquí se fuerza en la cadena de prueba), deja de admitirse.
    await P.send("hardhat_setCode", [f.assetNew.address, "0x6001600155"]);
    assert.equal(await permitido(np, f.alice, f.assetNew.address, TRANSFER), false);
  });

  it("T-150-03 · un activo sin clase, con perfil heredado o de otra dirección no entra como conforme", async function () {
    const sinClase = H.b32("SFSP:SEC:NET:SINCLASE");
    const psc = F.passport(sinClase, { legalClass: H.ZERO32 });
    psc.settlementLocation = { chainId: 31337, contractAddress: f.assetOld.address, codehash: await codehash(f.assetOld.address) };
    await f.registry.send("registerAsset", [psc], f.board);
    for (const c of [
      cambio({ kind: K.ASSET, subject: heredado.address, assetId: ASSET_HEREDADO }), // perfil heredado
      cambio({ kind: K.ASSET, subject: f.assetOld.address, assetId: sinClase }), // sin clase
      cambio({ kind: K.ASSET, subject: f.assetOld.address, assetId: ASSET_RED }), // el pasaporte nombra otro contrato
      cambio({ kind: K.ASSET, subject: f.assetOld.address, assetId: H.b32("NO_REGISTRADO") }),
      cambio({ kind: K.LEGACY, subject: f.assetNew.address, assetId: ASSET_RED, untilBlock: 10 ** 6 }), // conforme como heredado
    ]) {
      const { p, d } = await orden(f, np, [c]);
      await H.expectRevert(np.send("applyChanges", [OA.tupla(p), d, [aTupla(c)]], f.board), "InvalidChange");
      // La aprobación NO se gastó: el ejecutor revirtió entero.
      assert.equal(await f.governance.call("isAuthorizationApproved", [d]), true);
    }
    assert.equal(await permitido(np, f.alice, f.assetOld.address, TRANSFER), false);
  });

  it("T-150-04 · el heredado en registro transitorio opera hasta su bloque de corte; el conforme sigue", async function () {
    const corte = (await bloque()) + 20;
    await aplicar(f, np, [
      cambio({ kind: K.LEGACY, subject: heredado.address, assetId: ASSET_HEREDADO, untilBlock: corte }),
      cambio({ kind: K.ASSET, subject: f.assetNew.address, assetId: ASSET_RED }),
    ]);
    assert.ok((await bloque()) < corte);
    assert.equal(await permitido(np, f.alice, heredado.address, TRANSFER), true);
    await minar(corte - (await bloque()));
    assert.equal(await bloque(), corte);
    // La consulta de eth_call en «latest» corre con block.number = corte: ya no admite.
    assert.equal(await permitido(np, f.alice, heredado.address, TRANSFER), false);
    assert.equal(await permitido(np, f.alice, f.assetNew.address, TRANSFER), true);
  });

  it("T-150-04 · un corte en el pasado se rechaza al dar de alta", async function () {
    const cs = [cambio({ kind: K.LEGACY, subject: heredado.address, assetId: ASSET_HEREDADO, untilBlock: 1 })];
    const { p, d } = await orden(f, np, cs);
    await H.expectRevert(np.send("applyChanges", [OA.tupla(p), d, cs.map(aTupla)], f.board), H.b32("CUTOFF_PAST"));
  });

  it("T-150-05 · ORIGEN nativo a una cuenta sin código sigue funcionando con el filtro", async function () {
    assert.equal(await permitido(np, f.alice, f.bob, "0x"), true);
    const nueva = "0x" + "ab".repeat(20);
    assert.equal(await permitido(np, f.alice, nueva, "0x"), true, "una cuenta que aún no existe también");
    // Con datos, no: una EOA no ejecuta nada y los datos sólo servirían para disfrazar.
    assert.equal(await permitido(np, f.alice, f.bob, "0x1234"), false);
    // Delegación EIP-7702 (0xef0100‖dirección): tiene código y no pasa como nativa.
    await P.send("hardhat_setCode", [f.bob, "0xef0100" + heredado.address.slice(2)]);
    assert.equal(await permitido(np, f.alice, f.bob, "0x"), false);
    // Las cuentas del fixture son las mismas en todas las pruebas: se deja como estaba.
    await P.send("hardhat_setCode", [f.bob, "0x"]);
  });

  it("gobierno y la propia lista son siempre alcanzables y no se pueden dar de baja", async function () {
    assert.equal(await permitido(np, extrano, f.governance.address, "0x12345678"), true);
    assert.equal(await permitido(np, extrano, np.address, "0x12345678"), true);
    const cs = [cambio({ kind: K.SYSTEM, subject: f.governance.address, granted: false })];
    const { p, d } = await orden(f, np, cs);
    await H.expectRevert(np.send("applyChanges", [OA.tupla(p), d, cs.map(aTupla)], f.board), H.b32("ALWAYS_ALLOWED"));
  });

  it("destino de sistema entero y función de sistema concreta", async function () {
    await aplicar(f, np, [
      cambio({ kind: K.SYSTEM, subject: f.issuance.address }),
      cambio({ kind: K.SYSFN, subject: f.settlement.address, selector: "0x12345678" }),
    ]);
    assert.equal(await permitido(np, extrano, f.issuance.address, "0xdeadbeef"), true);
    assert.equal(await permitido(np, extrano, f.settlement.address, "0x12345678aabb"), true);
    assert.equal(await permitido(np, extrano, f.settlement.address, "0x87654321"), false, "otra función no");
    assert.equal(await permitido(np, extrano, f.settlement.address, "0x1234"), false, "menos de 4 bytes no");
    assert.equal(await np.call("isSystemFunction", [f.settlement.address, "0x12345678"]), true);
    // Baja del destino entero: tiene que nombrar su clase.
    const mal = [cambio({ kind: K.ASSET, subject: f.issuance.address, granted: false })];
    const o1 = await orden(f, np, mal);
    await H.expectRevert(np.send("applyChanges", [OA.tupla(o1.p), o1.d, mal.map(aTupla)], f.board), H.b32("KIND_MISMATCH"));
    await aplicar(f, np, [cambio({ kind: K.SYSTEM, subject: f.issuance.address, granted: false })]);
    assert.equal(await permitido(np, extrano, f.issuance.address, "0xdeadbeef"), false);
  });

  // ---------------------------------------------------------------- gobierno
  it("T-150-06 · un cambio con una sola llave se rechaza, y nadie fuera de TECH_OPS/Junta ejecuta", async function () {
    const cs = [cambio({ kind: K.DEPLOYER, subject: deployer })];
    // Propone uno y aprueba uno: quórum 2 no alcanzado.
    const { p, d } = await orden(f, np, cs, { quienes: { propone: f.signers[0], aprueban: [f.signers[1]] } });
    await H.expectRevert(np.send("applyChanges", [OA.tupla(p), d, cs.map(aTupla)], f.board), "NotAuthorized");
    assert.equal(await np.call("isDeployer", [deployer]), false);
    // Una llave cualquiera no puede ejecutar ni siquiera una orden aprobada.
    const ok = await orden(f, np, cs);
    await H.expectRevert(np.send("applyChanges", [OA.tupla(ok.p), ok.d, cs.map(aTupla)], extrano), "Unauthorized");
    // Ni con la etiqueta de otra acción (lo que vieron los firmantes era otra cosa).
    const otra = await orden(f, np, cs, { etiqueta: H.b32("SET_POLICY") });
    await H.expectRevert(np.send("applyChanges", [OA.tupla(otra.p), otra.d, cs.map(aTupla)], f.board), "AuthorizationActionMismatch");
  });

  it("T-150-06 · ampliar espera el timelock; restringir no espera pero sí exige quórum", async function () {
    const cs = [cambio({ kind: K.DEPLOYER, subject: deployer })];
    const { p, d } = await orden(f, np, cs, { sinEspera: true });
    await H.expectRevert(np.send("applyChanges", [OA.tupla(p), d, cs.map(aTupla)], f.board), "WaitPending");
    await H.increaseTime(F.GOV.timelockDelay + 1);
    await np.send("applyChanges", [OA.tupla(p), d, cs.map(aTupla)], f.board);
    // La misma aprobación no se reutiliza.
    await H.expectRevert(np.send("applyChanges", [OA.tupla(p), d, cs.map(aTupla)], f.board), "NotAuthorized");
    // Baja sin esperar.
    await aplicar(f, np, [cambio({ kind: K.DEPLOYER, subject: deployer, granted: false })], { sinEspera: true });
    assert.equal(await np.call("isDeployer", [deployer]), false);
  });

  it("T-150-06 · el contenido ejecutado tiene que ser el aprobado (lista, conteo y bandera de ampliación)", async function () {
    const aprobado = [cambio({ kind: K.DEPLOYER, subject: deployer })];
    const { p, d } = await orden(f, np, aprobado);
    const otro = [cambio({ kind: K.DEPLOYER, subject: extrano })];
    await H.expectRevert(np.send("applyChanges", [OA.tupla(p), d, otro.map(aTupla)], f.board), H.b32("CONTENT"));
    assert.equal(await np.call("isDeployer", [extrano]), false);
    // Con el contenido aprobado, sí.
    await np.send("applyChanges", [OA.tupla(p), d, aprobado.map(aTupla)], f.board);
    assert.equal(await np.call("isDeployer", [deployer]), true);
  });

  it("T-150-07 · todo cambio emite NetworkPermissionChanged con motivo y operación; sin motivo no hay cambio", async function () {
    const cs = [
      cambio({ kind: K.DEPLOYER, subject: deployer, reasonCode: H.b32("ACTA_D07") }),
      cambio({ kind: K.SYSFN, subject: f.settlement.address, selector: "0x12345678", reasonCode: H.b32("ACTA_SIS") }),
    ];
    const { p, d } = await orden(f, np, cs);
    const rc = await np.send("applyChanges", [OA.tupla(p), d, cs.map(aTupla)], f.board);
    const evs = rc.logs.filter((l) => l.address.toLowerCase() === np.address.toLowerCase()).map((l) => np.iface.parseLog(l));
    const ch = evs.filter((e) => e.name === "NetworkPermissionChanged");
    assert.equal(ch.length, 2);
    assert.equal(ch[0].args.subject.toLowerCase(), deployer.toLowerCase());
    assert.equal(ch[0].args.permissionKind, K.DEPLOYER);
    assert.equal(ch[0].args.granted, true);
    assert.equal(ch[0].args.reasonCode, H.b32("ACTA_D07"));
    assert.equal(ch[0].args.operationId, p.nonce);
    // SYSTEM_FUNCTION lleva el selector en los 4 últimos bytes.
    assert.equal(ch[1].args.permissionKind, K.SYSFN.slice(0, 58) + "12345678");
    assert.equal(await np.call("kindOf", [K.SYSFN, "0x12345678"]), ch[1].args.permissionKind);

    const sinMotivo = [cambio({ kind: K.DEPLOYER, subject: extrano, reasonCode: H.ZERO32 })];
    const o2 = await orden(f, np, sinMotivo);
    await H.expectRevert(np.send("applyChanges", [OA.tupla(o2.p), o2.d, sinMotivo.map(aTupla)], f.board), H.b32("REASON_REQUIRED"));
  });

  it("baja por exclusión permanente del registro: cualquiera la ejecuta, y sólo si el registro ya excluyó", async function () {
    await aplicar(f, np, [cambio({ kind: K.ASSET, subject: f.assetNew.address, assetId: ASSET_RED })]);
    await H.expectRevert(np.send("purgeExcluded", [f.assetNew.address], extrano), "NotExcluded");
    await f.registry.send("declarePermanentExclusion", [ASSET_RED, H.b32("evidencia_exclusion")], f.board);
    const rc = await np.send("purgeExcluded", [f.assetNew.address], extrano);
    const ev = rc.logs.map((l) => np.iface.parseLog(l)).find((e) => e.name === "NetworkPermissionChanged");
    assert.equal(ev.args.granted, false);
    assert.equal(ev.args.reasonCode, H.b32("REGISTRY_EXCLUDED"));
    assert.equal(await permitido(np, f.alice, f.assetNew.address, TRANSFER), false);
    // Un activo excluido no se puede volver a admitir.
    const cs = [cambio({ kind: K.ASSET, subject: f.assetNew.address, assetId: ASSET_RED })];
    const o = await orden(f, np, cs);
    await H.expectRevert(np.send("applyChanges", [OA.tupla(o.p), o.d, cs.map(aTupla)], f.board), H.b32("EXCLUDED"));
  });

  // ---------------------------------------------------------------- nodo
  it("la codificación exacta de Besu (con su relleno) devuelve el bool de 32 bytes que el nodo espera", async function () {
    await aplicar(f, np, [cambio({ kind: K.ASSET, subject: f.assetNew.address, assetId: ASSET_RED })]);
    const casos = [
      [f.alice, f.assetNew.address, TRANSFER + "00".repeat(64), true], // 68 bytes
      [f.alice, heredado.address, TRANSFER + "00".repeat(28), false], // 32 bytes: relleno completo de 32
      [f.alice, f.bob, "0x", true], // nativa, 0 bytes
      [deployer, H.ZERO_ADDR, "0x6080604052", false], // creación sin permiso
    ];
    for (const [s, t, pl, esperado] of casos) {
      const ret = await P.send("eth_call", [{ to: np.address, data: calldataBesu(s, t, 5, 93e9, 90000, pl) }, "latest"]);
      assert.equal(ret.length, 66, "32 bytes exactos");
      assert.equal(ret, "0x" + (esperado ? "1" : "0").padStart(64, "0"), "caso " + t + " " + pl);
    }
  });

  it("transactionAllowed es barato en el peor camino y no escribe estado", async function () {
    await aplicar(f, np, [cambio({ kind: K.ASSET, subject: f.assetNew.address, assetId: ASSET_RED })]);
    const peores = [
      [f.alice, f.assetNew.address, TRANSFER], // SLOAD destino + SLOAD codehash + EXTCODEHASH
      [f.alice, heredado.address, TRANSFER + "00".repeat(64)], // no admitido: función de sistema + EXTCODESIZE
      [f.alice, f.bob, "0x"],
    ];
    for (const [s, t, pl] of peores) {
      const data = np.iface.encodeFunctionData("transactionAllowed", [s, t, 0, 0, 0, pl]);
      const gas = Number(await P.send("eth_estimateGas", [{ to: np.address, data }]));
      assert.ok(gas < 21000 + 15000, "gas " + gas + " (incluye los 21000 base y el calldata)");
    }
    const abi = np.abi.filter((x) => x.type === "function" && x.name === "transactionAllowed")[0];
    assert.equal(abi.stateMutability, "view");
    assert.deepEqual(abi.inputs.map((i) => i.type), ["address", "address", "uint256", "uint256", "uint256", "bytes"]);
    assert.deepEqual(abi.outputs.map((i) => i.type), ["bool"]);
  });

  it("nadie de fuera puede llenar estado: las únicas escrituras son de gobierno o de borrado", async function () {
    const escritoras = np.abi
      .filter((x) => x.type === "function" && x.stateMutability !== "view" && x.stateMutability !== "pure")
      .map((x) => x.name)
      .sort();
    assert.deepEqual(escritoras, ["applyChanges", "grantRole", "purgeExcluded", "revokeRole"]);
    for (const [fn, args, frag] of [
      ["grantRole", [await np.call("TECH_OPS"), extrano], "Unauthorized"],
      ["purgeExcluded", [heredado.address], "NotExcluded"],
    ]) {
      await H.expectRevert(np.send(fn, args, extrano), frag);
    }
  });
});
