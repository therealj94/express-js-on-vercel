"use strict";
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");

describe("SFSPAssetRegistry · pasaporte y cinco ejes", function () {
  let f;
  beforeEach(async function () { f = await F.deployAll(); });

  it("positivo: registra un activo y conserva los seis ejes por separado", async function () {
    const lc = await f.registry.call("lifecycleOf", [f.ASSET_NEW]);
    assert.equal(lc.legal, F.Legal.CLASSIFIED);
    assert.equal(lc.admission, F.Admission.APPROVED);
    assert.equal(lc.trading, F.Trading.LISTED);
    assert.equal(lc.transferability, F.Transferability.RESTRICTED);
    assert.equal(lc.visibility, F.Visibility.VISIBLE_TO_HOLDER);
  });

  it("positivo: DELISTED no oculta del catálogo ni toca la transferibilidad (regla 6)", async function () {
    await f.registry.send("setLifecycleAxis", [f.ASSET_NEW, F.Axis.TRADING, F.Trading.DELISTED], f.board);
    const lc = await f.registry.call("lifecycleOf", [f.ASSET_NEW]);
    assert.equal(lc.trading, F.Trading.DELISTED);
    assert.equal(lc.visibility, F.Visibility.VISIBLE_TO_HOLDER);
    assert.equal(lc.transferability, F.Transferability.RESTRICTED);
  });

  it("negativo: un legacy registrado no puede declarar que impone restricciones", async function () {
    const p = F.passport(H.b32("SFSP:LEGACY:X:1"), {
      profile: F.Profile.LEGACY_REGISTERED,
      directTransferBypass: true,
      transferRestrictions: true,
    });
    await H.expectRevert(f.registry.send("registerAsset", [p], f.board), "InvalidPassport");
  });

  it("negativo: un legacy sin directTransferBypass declarado se rechaza", async function () {
    const p = F.passport(H.b32("SFSP:LEGACY:X:2"), {
      profile: F.Profile.LEGACY_REGISTERED,
      directTransferBypass: false,
      transferRestrictions: false,
    });
    await H.expectRevert(f.registry.send("registerAsset", [p], f.board), "InvalidPassport");
  });

  it("positivo: registrar un legacy guarda el bypass y no le añade capacidades", async function () {
    const id = H.b32("SFSP:LEGACY:X:3");
    const p = F.passport(id, {
      profile: F.Profile.LEGACY_REGISTERED,
      directTransferBypass: true,
      transferRestrictions: false,
      freeze: false,
      forcedTransfer: false,
    });
    await f.registry.send("registerAsset", [p], f.board);
    const scope = await f.registry.call("enforcementOf", [id]);
    assert.equal(scope.directTransferBypass, true);
    assert.equal(scope.transferRestrictions, false);
    assert.equal(scope.forcedTransfer, false);
  });

  it("negativo: decimals desconocido no se sustituye por 18", async function () {
    const id = H.b32("SFSP:COM:X:4");
    await f.registry.send("registerAsset", [F.passport(id, { decimalsKnown: false })], f.board);
    const d = await f.registry.call("decimalsOf", [id]);
    assert.equal(d[0], false);
    assert.equal(d[1], 0);
  });

  it("positivo: PolicyUpdated sube la versión y conserva la anterior", async function () {
    const before = await f.registry.call("policyVersionOf", [f.ASSET_NEW]);
    await f.registry.send("updatePolicy", [f.ASSET_NEW, H.b32("TRANSFER"), H.b32("pol_transfer_2")], f.board);
    const after = await f.registry.call("policyVersionOf", [f.ASSET_NEW]);
    assert.equal(Number(after) - Number(before), 1);
  });

  it("negativo: fijar riesgo sin metodología firmada revierte", async function () {
    await H.expectRevert(
      f.registry.send("setRisk", [f.ASSET_NEW, F.Risk.R3, H.ZERO32], f.board),
      "InvalidPassport"
    );
    await f.registry.send("setRisk", [f.ASSET_NEW, F.Risk.R3, H.b32("meth_v1")], f.board);
    const p = await f.registry.call("passportOf", [f.ASSET_NEW]);
    assert.equal(p.risk.level, F.Risk.R3);
  });

  it("negativo: publicar divulgación sin hash revierte", async function () {
    await H.expectRevert(
      f.registry.send("publishDisclosure", [f.ASSET_NEW, H.ZERO32, 0, F.Report.CURRENT], f.board),
      "InvalidPassport"
    );
  });
});
