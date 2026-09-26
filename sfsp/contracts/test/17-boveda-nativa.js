"use strict";
/* SFSP-410 §4 · Bóveda sellada de la moneda nativa (ORIGEN).
 * Emitir = liberar desde la bóveda a un usuario; quemar = devolver a la bóveda.
 * En la prueba la bóveda usa el activo ASSET_NEW del fixture para reutilizar sus
 * políticas de elegibilidad; en el despliegue real lleva el assetId de ORIGEN. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");

const DIA = 86400;
const GENESIS = 10n ** 24n;
const ETH = 10n ** 18n;

async function saldo(addr) {
  const { network } = require("hardhat");
  return BigInt(await network.provider.send("eth_getBalance", [addr, "latest"]));
}

async function fondear(f, v, amount, from) {
  await v.sendValue("absorb", [H.b32("CONSOLIDACION")], from || f.board, amount);
}

async function ordenLiberar(f, v, destination, amount, nonce) {
  const p = await OA.orden({
    verifyingContract: v.address,
    action: H.b32("RELEASE_NATIVE"),
    assetId: f.ASSET_NEW,
    destination,
    amount: String(amount),
    nonce,
    evidenceRoot: H.b32("acta_liberacion"),
  });
  return { p, tupla: OA.tupla(p), digest: OA.digestDe(p) };
}

async function fijarCupo(f, v, perPeriod, maxPerOp) {
  const ts = await H.now();
  const period = DIA, validUntil = ts + 30 * DIA, docRoot = H.b32("acta_cupo");
  const terms = await v.call("budgetTermsRoot", [period, validUntil, docRoot]);
  const p = await OA.orden({
    verifyingContract: v.address,
    action: H.b32("SET_RELEASE_BUDGET"),
    assetId: f.ASSET_NEW,
    amount: String(perPeriod),
    amountSecondary: String(maxPerOp),
    nonce: H.b32("cupo_nativo"),
    expiry: ts + 3 * 3600,
    evidenceRoot: terms,
  });
  const d = OA.digestDe(p);
  await OA.aprobar(f, d, H.b32("SET_RELEASE_BUDGET"));
  await H.increaseTime(F.GOV.timelockDelay + 1);
  await v.send("setReleaseBudget", [OA.tupla(p), d, period, validUntil, docRoot], f.board);
}

describe("SFSP-410 · bóveda sellada de ORIGEN (moneda nativa)", function () {
  let f, v;
  beforeEach(async function () {
    f = await F.deployAll();
    v = await H.deploy("SFSPNativeVault", [f.board, f.governance.address, f.engine.address, f.ASSET_NEW, String(GENESIS)], f.board);
    await v.send("grantRole", [await v.call("ISSUER"), f.board], f.board);
    await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), v.address], f.board);
    await fondear(f, v, 100n * ETH);
  });

  it("positivo: devolver a la bóveda la sella y cuenta como absorbido", async function () {
    assert.equal(BigInt((await v.call("vaultBalance")).toString()), 100n * ETH);
    assert.equal(BigInt((await v.call("totalAbsorbed")).toString()), 100n * ETH);
  });

  it("positivo: circulante = génesis − bóveda − cuentas internas fuera de la bóveda", async function () {
    await v.send("setInternalAccount", [f.treasury, true, H.b32("TESORERIA")], f.board);
    const esperado = GENESIS - 100n * ETH - (await saldo(f.treasury));
    assert.equal(BigInt((await v.call("circulating")).toString()), esperado);
  });

  it("positivo: liberar con orden de gobierno (doble control) paga al usuario", async function () {
    const antes = await saldo(f.alice);
    const o = await ordenLiberar(f, v, f.alice, 5n * ETH, H.b32("lib_1"));
    await OA.aprobar(f, o.digest, H.b32("RELEASE_NATIVE"));
    await v.send("release", [o.tupla, o.digest], f.board);
    assert.equal((await saldo(f.alice)) - antes, 5n * ETH);
    assert.equal(BigInt((await v.call("vaultBalance")).toString()), 95n * ETH);
  });

  it("negativo: sin quórum no se libera", async function () {
    const o = await ordenLiberar(f, v, f.alice, ETH, H.b32("lib_2"));
    await f.governance.send("proposeAuthorization", [o.digest, H.b32("RELEASE_NATIVE")], f.signers[0]);
    await H.expectRevert(v.send("release", [o.tupla, o.digest], f.board), "ReleaseNotAuthorized");
  });

  it("negativo: la orden aprobada se gasta y no libera dos veces", async function () {
    const o = await ordenLiberar(f, v, f.alice, ETH, H.b32("lib_3"));
    await OA.aprobar(f, o.digest, H.b32("RELEASE_NATIVE"));
    await v.send("release", [o.tupla, o.digest], f.board);
    await H.expectRevert(v.send("release", [o.tupla, o.digest], f.board));
  });

  it("negativo: nunca hacia una cuenta interna (sacarlo para guardarlo en otro cajón)", async function () {
    await v.send("setInternalAccount", [f.treasury, true, H.b32("TESORERIA")], f.board);
    const o = await ordenLiberar(f, v, f.treasury, ETH, H.b32("lib_4"));
    await OA.aprobar(f, o.digest, H.b32("RELEASE_NATIVE"));
    await H.expectRevert(v.send("release", [o.tupla, o.digest], f.board), "ReleaseToInternalAccount");
  });

  it("negativo: un destino no elegible no recibe", async function () {
    const o = await ordenLiberar(f, v, f.mallory, ETH, H.b32("lib_5"));
    await OA.aprobar(f, o.digest, H.b32("RELEASE_NATIVE"));
    await H.expectRevert(v.send("release", [o.tupla, o.digest], f.board), "ReleaseRejected");
  });

  it("positivo: cupo aprobado con espera; libera bajo demanda y respeta los topes", async function () {
    await fijarCupo(f, v, 10n * ETH, 4n * ETH);
    await v.send("releaseOnDemand", [f.alice, String(4n * ETH), H.b32("pago_1"), H.b32("recibo")], f.board);
    await v.send("releaseOnDemand", [f.bob, String(4n * ETH), H.b32("pago_2"), H.b32("recibo")], f.board);
    await H.expectRevert(
      v.send("releaseOnDemand", [f.bob, String(5n * ETH), H.b32("pago_3"), H.b32("recibo")], f.board),
      "BudgetOperationTooLarge"
    );
    await H.expectRevert(
      v.send("releaseOnDemand", [f.bob, String(3n * ETH), H.b32("pago_4"), H.b32("recibo")], f.board),
      "BudgetPeriodExceeded"
    );
    await H.expectRevert(
      v.send("releaseOnDemand", [f.alice, String(ETH), H.b32("pago_1"), H.b32("recibo")], f.board),
      "OperationReplay"
    );
  });

  it("negativo: sin cupo, con pausa o revocado, no hay liberación bajo demanda", async function () {
    await H.expectRevert(
      v.send("releaseOnDemand", [f.alice, String(ETH), H.b32("p_a"), H.b32("r")], f.board),
      "BudgetNotSet"
    );
    await fijarCupo(f, v, 10n * ETH, 4n * ETH);
    await f.governance.send("emergencyPause", [H.b32("INCIDENTE"), 3600], f.signers[0]);
    await H.expectRevert(v.send("releaseOnDemand", [f.alice, String(ETH), H.b32("p_b"), H.b32("r")], f.board), "Paused");
    await H.increaseTime(3601);
    await v.send("revokeReleaseBudget", [H.b32("SOSPECHA")], f.signers[1]);
    await H.expectRevert(v.send("releaseOnDemand", [f.alice, String(ETH), H.b32("p_c"), H.b32("r")], f.board), "BudgetNotSet");
  });

  it("negativo: no existe retiro de administrador; sólo ISSUER ejecuta las salidas", async function () {
    const abi = (await require("hardhat").artifacts.readArtifact("SFSPNativeVault")).abi;
    const salidas = abi.filter((x) => x.type === "function" && x.stateMutability !== "view" && x.stateMutability !== "pure").map((x) => x.name).sort();
    assert.deepEqual(salidas, [
      "absorb", "grantRole", "release", "releaseOnDemand", "revokeReleaseBudget", "revokeRole", "setInternalAccount", "setReleaseBudget",
    ]);
    await fijarCupo(f, v, 10n * ETH, 4n * ETH);
    await H.expectRevert(
      v.send("releaseOnDemand", [f.alice, String(ETH), H.b32("p_x"), H.b32("r")], f.alice),
      "Unauthorized"
    );
  });
});
