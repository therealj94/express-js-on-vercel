"use strict";
/* SFSP v0.3 §9 · Motor de reservas y commodities (SFSPReserveEngine).
 * Lotes, atestaciones que vencen solas, capacidad de COLOCACIÓN, cobertura
 * contra lo colocado, no doble cómputo, concentración por custodio y redención
 * (bloqueo → elegibilidad → cola → liquidación con quema → entrega).
 * Los límites y diferenciales de estas pruebas son sintéticos, no recomendados. */
const assert = require("node:assert/strict");
const F = require("./fixture");
const H = require("./helpers");
const C = require("./commodities");

const DIA = 86400;
const E18 = C.E18;
const LOT = { NINGUNO: 0, RECIBIDO: 1, VERIFICADO: 2, ASIGNADO: 3, PARCIAL: 4, BLOQUEADO: 5, LIBERADO: 6 };
const RED = { NINGUNO: 0, SOLICITADA: 1, ELEGIBLE: 2, EN_COLA: 3, BLOQUEADA: 4, LIQUIDADA: 5, ENTREGADA: 6, CANCELADA: 7, VENCIDA: 8 };
const CH = { ORIGEN: 0, ENVIO: 1, PRESENCIAL: 2 };
const CUSTODIA_G = H.b32("CUSTODIA_CLASE_G");

// Barra de 1 kg a 999,9: onzas finas = mg × ppm × 1e13 / 311035 (31,1035 g por onza).
const KG_MG = 1_000_000n;
const PUREZA = 999_900n;
const OZ_KG = (KG_MG * PUREZA * 10n ** 13n) / 311035n;

async function montar() {
  const f = await F.deployAll();
  const acc = f.acc;
  const x = { f, board: f.board, pubA: acc[9], pubB: acc[10], auditor: acc[12], custA: acc[13], custB: acc[14], custInt: acc[15], fondeador: acc[16] };
  x.o = await C.oraculo(x.board, x.pubA, x.pubB);
  x.r = await H.deploy("SFSPReserveEngine", [x.board, f.governance.address, f.engine.address, x.o.address], x.board);
  for (const rol of ["TECH_OPS", "ISSUER"]) await x.r.send("grantRole", [await x.r.call(rol), x.board], x.board);
  await x.r.send("grantRole", [await x.r.call("AUDITOR"), x.auditor], x.board);
  await x.r.send("grantRole", [await x.r.call("TECH_OPS"), x.fondeador], x.board);
  x.gate = await H.deploy("SFSPCompuertaLicenciaDePrueba", [], x.board);

  x.auka = await H.deploy("SFSPTokenCommodityDePrueba", [], x.board);
  await x.auka.send("setReserveEngine", [x.r.address], x.board);
  x.agka = await H.deploy("SFSPTokenCommodityDePrueba", [], x.board);
  await x.agka.send("setReserveEngine", [x.r.address], x.board);

  await C.registrarActivo(f, C.ASSET_AUKA);
  await C.registrarActivo(f, C.ASSET_AGKA);
  await x.r.send("configureAsset", [C.ASSET_AUKA, C.XAU, x.auka.address, f.treasury, String(E18), true], x.board);
  await x.r.send("configureAsset", [C.ASSET_AGKA, C.XAG, x.agka.address, f.treasury, String(E18), false], x.board);
  // v0.3 §9.4: se acuña por anticipado a tesorería, SIN metal.
  await x.auka.send("mintToTreasury", [f.treasury, String(1000n * E18)], x.board);
  await x.agka.send("mintToTreasury", [f.treasury, String(1000n * E18)], x.board);

  await x.r.send("registerCustodian", [H.b32("CUST_A"), x.custA, false, H.b32("JUR_A")], x.board);
  await x.r.send("registerCustodian", [H.b32("CUST_B"), x.custB, false, H.b32("JUR_B")], x.board);
  await x.r.send("registerCustodian", [H.b32("CUST_ORDENEX"), x.custInt, true, H.b32("JUR_PROSPERA")], x.board);
  return x;
}

function intake(lotId, assetId, custodian, metal, cert, grossMg, ppm) {
  return {
    lotId: H.b32(lotId),
    assetId,
    custodianId: H.b32(custodian),
    vault: H.b32("VAULT_" + custodian),
    jurisdiction: H.b32("JUR_" + custodian),
    metal,
    grossWeightMg: String(grossMg || KG_MG),
    purityPpm: String(ppm || PUREZA),
    assayCertHash: H.keccak256(Buffer.from(cert, "utf8")),
  };
}

async function atestar(x, lotId, attestor, dias) {
  const t = await H.now();
  const hasta = t + (dias || 30) * DIA;
  return x.r.send("attestLot", [H.b32(lotId), H.b32("ev_" + lotId), hasta, H.b32("poliza_" + lotId), hasta], attestor);
}

/** Lote registrado, atestado y asignado. Fija límites de concentración de prueba si faltan. */
async function loteListo(x, lotId, assetId, custodian, attestor, metal, cert, dias) {
  await x.r.send("registerLot", [intake(lotId, assetId, custodian, metal || C.XAU, cert || "cert_" + lotId)], x.board);
  await atestar(x, lotId, attestor, dias);
  const k = await x.r.call("concentrationLimits");
  if (!k.set) await x.r.send("setConcentrationLimits", [10000, 10000, 0], x.board);
  await x.r.send("assignLot", [H.b32(lotId)], x.board);
}

async function colocar(x, assetId, to, unidades, op) {
  return x.r.send("place", [assetId, to, String(unidades), H.b32(op)], x.board);
}

async function pedir(x, assetId, unidades, canal, holder) {
  const rec = await x.r.send("requestRedemption", [assetId, String(unidades), canal], holder);
  return { rec, id: C.eventos(x.r, rec, "RedemptionUpdated")[0].redemptionId };
}

async function hastaBloqueada(x, id, lotId, plazo) {
  await x.r.send("verifyEligibility", [id], x.board);
  await x.r.send("enqueue", [id], x.board);
  return x.r.send("blockForSettlement", [id, lotId ? H.b32(lotId) : H.ZERO32, plazo || 0], x.board);
}

describe("SFSP v0.3 §9 · motor de reservas y commodities (SFSPReserveEngine)", function () {
  let x, f;
  beforeEach(async function () {
    x = await montar();
    f = x.f;
  });

  describe("lotes y atestaciones", function () {
    it("positivo: peso bruto y pureza por separado; las onzas finas se derivan en cadena", async function () {
      const rec = await x.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_A", C.XAU, "c1")], x.board);
      const l = await x.r.call("lotOf", [H.b32("L1")]);
      assert.equal(l.grossWeightMg.toString(), String(KG_MG));
      assert.equal(l.purityPpm.toString(), String(PUREZA));
      assert.equal(l.fineOz.toString(), String(OZ_KG));
      assert.equal(Number(l.state), LOT.RECIBIDO);
      const ev = C.eventos(x.r, rec, "MetalLotRegistered")[0];
      assert.equal(ev.fineOunces.toString(), String(OZ_KG));
    });

    it("negativo: lote incompleto, custodio desconocido o metal distinto se rechazan en el ingreso", async function () {
      const malo = intake("L1", C.ASSET_AUKA, "CUST_A", C.XAU, "c1");
      malo.purityPpm = "0";
      await H.expectRevert(x.r.send("registerLot", [malo], x.board), H.b32("LOT_INCOMPLETE"));
      await H.expectRevert(x.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_X", C.XAU, "c1")], x.board), "InvalidInput");
      await H.expectRevert(x.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_A", C.XAG, "c1")], x.board), "InvalidInput");
    });

    it("adversario (doble cómputo): el mismo certificado no respalda dos lotes, ni el mismo lote dos activos", async function () {
      await x.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_A", C.XAU, "c1")], x.board);
      // Mismo certificado, otro identificador de lote.
      await H.expectRevert(x.r.send("registerLot", [intake("L2", C.ASSET_AUKA, "CUST_A", C.XAU, "c1")], x.board), "InvalidInput");
      // Mismo lote hacia otro destino.
      await H.expectRevert(x.r.send("registerLot", [intake("L1", C.ASSET_AGKA, "CUST_A", C.XAG, "c9")], x.board), "InvalidInput");
      const l = await x.r.call("lotOf", [H.b32("L1")]);
      assert.equal(l.assetId, C.ASSET_AUKA, "una onza, un destino");
    });

    it("negativo: sólo el atestador del custodio atesta; al atestar emite ReserveAttested y pasa a VERIFICADO", async function () {
      await x.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_A", C.XAU, "c1")], x.board);
      await H.expectRevert(atestar(x, "L1", x.custB), "NotCustodianAttestor");
      const rec = await atestar(x, "L1", x.custA);
      const ev = C.eventos(x.r, rec, "ReserveAttested")[0];
      assert.equal(ev.reserveAssetId, H.b32("L1"));
      assert.equal(ev.assetId, C.ASSET_AUKA);
      assert.equal(Number((await x.r.call("lotOf", [H.b32("L1")])).state), LOT.VERIFICADO);
    });

    it("adversario (lote vencido): la atestación vence sola, la capacidad cae y la colocación se detiene", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA, C.XAU, "c1", 2);
      await colocar(x, C.ASSET_AUKA, f.alice, 10n * E18, "op1");
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), true);
      await H.increaseTime(3 * DIA);
      // Sin ninguna transacción: el lote ya no cuenta.
      assert.equal(await x.r.call("isLotValid", [H.b32("L1")]), false);
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), "0");
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), false);
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.bob, E18, "op2"), "CoverageDeficit");
      const rec = await x.r.send("expireLot", [H.b32("L1")], f.mallory);
      assert.equal(C.eventos(x.r, rec, "ReserveExpired").length, 1);
      await H.expectRevert(x.r.send("expireLot", [H.b32("L1")], f.mallory), H.b32("NOT_EXPIRED"));
      // Una atestación nueva restablece el reconocimiento.
      await atestar(x, "L1", x.custA);
      await colocar(x, C.ASSET_AUKA, f.bob, E18, "op2");
    });
  });

  describe("concentración por custodio", function () {
    it("negativo: sin límite de concentración fijado no se asigna ningún lote (BLOCKED_DECISION)", async function () {
      await x.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_A", C.XAU, "c1")], x.board);
      await atestar(x, "L1", x.custA);
      const msg = await H.expectRevert(x.r.send("assignLot", [H.b32("L1")], x.board), "Blocked(9");
      assert.ok(msg.includes(H.b32("CONCENTRATION_NOT_SET")));
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), "0");
    });

    it("adversario: un custodio no supera su límite sobre el total custodiado", async function () {
      // Límites de PRUEBA: 60 % independiente, 20 % interno, desde 40 oz.
      await x.r.send("setConcentrationLimits", [6000, 2000, String(40n * E18)], x.board);
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA, C.XAU, "c1");
      await x.r.send("registerLot", [intake("L2", C.ASSET_AUKA, "CUST_A", C.XAU, "c2")], x.board);
      await atestar(x, "L2", x.custA);
      await H.expectRevert(x.r.send("assignLot", [H.b32("L2")], x.board), "ConcentrationExceeded");
      await loteListo(x, "L3", C.ASSET_AUKA, "CUST_B", x.custB, C.XAU, "c3");
      assert.equal((await x.r.call("custodianAssignedOz", [H.b32("CUST_B")])).toString(), String(OZ_KG));
    });

    it("negativo: la custodia interna exige licencia Clase G, verificación del auditor y su propio límite", async function () {
      await x.r.send("setConcentrationLimits", [6000, 2000, String(40n * E18)], x.board);
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA, C.XAU, "c1");
      await loteListo(x, "L2", C.ASSET_AUKA, "CUST_B", x.custB, C.XAU, "c2");
      await x.r.send("registerLot", [intake("LI", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "ci")], x.board);
      await atestar(x, "LI", x.custInt);
      await H.expectRevert(x.r.send("assignLot", [H.b32("LI")], x.board), H.b32("LICENCIA_NO_OTORGADA"));
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await H.expectRevert(x.r.send("assignLot", [H.b32("LI")], x.board), "Rejected");
      await x.r.send("auditVerifyLot", [H.b32("LI"), (await H.now()) + 10 * DIA], x.auditor);
      // 1/3 del total supera el 20 % de prueba para la custodia interna.
      await H.expectRevert(x.r.send("assignLot", [H.b32("LI")], x.board), "ConcentrationExceeded");
    });
  });

  describe("colocación y cobertura (v0.3 §9.4)", function () {
    it("adversario (colocación sin capacidad): acuñado en tesorería no es capacidad; sin metal no se coloca", async function () {
      assert.equal((await x.auka.call("totalSupply")).toString(), String(1000n * E18));
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.alice, E18, "op1"), "PlacementCapacityExceeded");
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.alice, 33n * E18, "op1"), "PlacementCapacityExceeded");
      const rec = await colocar(x, C.ASSET_AUKA, f.alice, 32n * E18, "op1");
      const ev = C.eventos(x.r, rec, "UnitsPlaced")[0];
      assert.equal(ev.amount.toString(), String(32n * E18));
      assert.equal((await x.auka.call("balanceOf", [f.alice])).toString(), String(32n * E18));
      assert.equal(Number((await x.r.call("lotOf", [H.b32("L1")])).state), LOT.PARCIAL);
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(OZ_KG - 32n * E18));
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.bob, E18, "op2"), "PlacementCapacityExceeded");
    });

    it("negativo: no se coloca a la propia tesorería, a un sujeto sin alta, ni se repite la operación", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.treasury, E18, "op1"), "InvalidInput");
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.mallory, E18, "op1"), "Rejected");
      await colocar(x, C.ASSET_AUKA, f.alice, E18, "op1");
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.alice, E18, "op1"), "OperationReplay");
    });

    it("positivo: la cobertura se publica contra lo COLOCADO y la tesorería se reporta aparte", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await colocar(x, C.ASSET_AUKA, f.alice, 10n * E18, "op1");
      const rec = await x.r.send("publishCoverage", [C.ASSET_AUKA], f.mallory);
      const ev = C.eventos(x.r, rec, "CoveragePublished")[0];
      assert.equal(ev.fineOuncesAssigned.toString(), String(OZ_KG));
      assert.equal(ev.unitsPlaced.toString(), String(10n * E18));
      assert.equal(ev.unitsInTreasury.toString(), String(990n * E18));
      assert.ok(Number(ev.attestedAt) > 0);
    });
  });

  describe("redención (v0.3 §9.3)", function () {
    beforeEach(async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await colocar(x, C.ASSET_AUKA, f.alice, 20n * E18, "op1");
    });

    it("negativo: sin canal fijado la redención es BLOCKED_DECISION", async function () {
      await H.expectRevert(x.r.send("requestRedemption", [C.ASSET_AUKA, String(E18), CH.ORIGEN], f.alice), "Blocked(9");
    });

    it("positivo: liquidación en ORIGEN, 1 AUKA = 1.710,6925 ORIGEN menos el diferencial publicado", async function () {
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ORIGEN, true, 0, 50, H.ZERO32], x.board); // 0,5 % de PRUEBA
      await x.r.sendValue("fundOrigenSettlement", [], x.fondeador, 3500n * E18);
      const { id } = await pedir(x, C.ASSET_AUKA, 2n * E18, CH.ORIGEN, f.alice);
      // Bloqueo en el acto: las unidades pedidas ya no se mueven.
      await H.expectRevert(x.auka.send("transfer", [f.bob, String(19n * E18)], f.alice), "saldo libre");
      await hastaBloqueada(x, id);
      const antes = await C.saldo(f.alice);
      const rec = await x.r.send("settleInOrigen", [id], x.board);
      const pago = ((2n * 17106925n * E18) / 10000n) * 9950n / 10000n;
      assert.equal((await C.saldo(f.alice)) - antes, pago);
      const est = C.eventos(x.r, rec, "RedemptionUpdated").map((e) => Number(e.newState));
      assert.deepEqual(est, [RED.LIQUIDADA, RED.ENTREGADA], "quema y entrega en la misma transacción");
      assert.equal((await x.auka.call("totalSupply")).toString(), String(998n * E18));
      const a = await x.r.call("assetOf", [C.ASSET_AUKA]);
      assert.equal(a.unitsPlaced.toString(), String(18n * E18));
      // El metal se queda y vuelve a ser capacidad.
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(OZ_KG - 18n * E18));
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), true);
    });

    it("negativo: la tesorería no redime y la cola respeta el orden de llegada", async function () {
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ORIGEN, true, 0, 50, H.ZERO32], x.board);
      await H.expectRevert(x.r.send("requestRedemption", [C.ASSET_AUKA, String(E18), CH.ORIGEN], f.treasury), "InvalidInput");
      const a = await pedir(x, C.ASSET_AUKA, E18, CH.ORIGEN, f.alice);
      const b = await pedir(x, C.ASSET_AUKA, E18, CH.ORIGEN, f.alice);
      for (const id of [a.id, b.id]) {
        await x.r.send("verifyEligibility", [id], x.board);
        await x.r.send("enqueue", [id], x.board);
      }
      await H.expectRevert(x.r.send("blockForSettlement", [b.id, H.ZERO32, 0], x.board), "QueueOrder");
      await x.r.send("cancelRedemption", [a.id], f.alice);
      await x.r.send("blockForSettlement", [b.id, H.ZERO32, 0], x.board);
    });

    it("negativo: los canales físicos siguen cerrados sin licencia Clase G; ORIGEN sigue disponible", async function () {
      await H.expectRevert(
        x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(32n * E18), 0, H.b32("LIC")], x.board),
        H.b32("LICENCIA_NO_OTORGADA"),
      );
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, false, String(32n * E18), 0, H.ZERO32], x.board);
      await H.expectRevert(x.r.send("requestRedemption", [C.ASSET_AUKA, String(E18), CH.ENVIO], f.alice), H.b32("LICENCIA_NO_OTORGADA"));
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ORIGEN, true, 0, 50, H.ZERO32], x.board);
      await pedir(x, C.ASSET_AUKA, E18, CH.ORIGEN, f.alice);
    });

    it("adversario (quema después de entrega): no se confirma una entrega de envío sin quema previa", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, H.b32("LIC_G_TEST")], x.board);
      const { id } = await pedir(x, C.ASSET_AUKA, 5n * E18, CH.ENVIO, f.alice);
      await hastaBloqueada(x, id, "L1");
      assert.equal(Number((await x.r.call("lotOf", [H.b32("L1")])).state), LOT.BLOQUEADO);
      await H.expectRevert(x.r.send("confirmDelivery", [id], x.custA), "InvalidTransition");
      await H.expectRevert(x.r.send("confirmDelivery", [id], x.custB), "NotCustodianAttestor");
      await x.r.send("settleShipment", [id], x.board);
      assert.equal((await x.auka.call("totalSupply")).toString(), String(995n * E18), "quemado antes de entregar");
      // Entre la quema y la entrega la obligación figura en el invariante.
      let a = await x.r.call("assetOf", [C.ASSET_AUKA]);
      assert.equal(a.ozPendingDelivery.toString(), String(5n * E18));
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), true);
      const rec = await x.r.send("confirmDelivery", [id], x.custA);
      assert.equal(Number(C.eventos(x.r, rec, "RedemptionUpdated")[0].newState), RED.ENTREGADA);
      a = await x.r.call("assetOf", [C.ASSET_AUKA]);
      assert.equal(a.ozPendingDelivery.toString(), "0");
      const l = await x.r.call("lotOf", [H.b32("L1")]);
      assert.equal(l.ozDelivered.toString(), String(5n * E18));
      assert.equal(Number(l.state), LOT.PARCIAL);
      await H.expectRevert(x.r.send("cancelRedemption", [id], f.alice), "InvalidTransition");
    });

    it("positivo: retiro presencial; sin comparecencia vence SIN quemar y el metal vuelve a respaldar", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.PRESENCIAL, true, String(E18), 0, H.b32("LIC_G_TEST")], x.board);
      const { id } = await pedir(x, C.ASSET_AUKA, 3n * E18, CH.PRESENCIAL, f.alice);
      await hastaBloqueada(x, id, "L1", (await H.now()) + DIA);
      await H.expectRevert(x.r.send("expireNoShow", [id], f.mallory), H.b32("NOT_EXPIRED"));
      await H.increaseTime(DIA + 10);
      await H.expectRevert(x.r.send("confirmDelivery", [id], x.custA), H.b32("DEADLINE_PASSED"));
      await x.r.send("expireNoShow", [id], f.mallory);
      assert.equal(Number((await x.r.call("redemptionOf", [id])).state), RED.VENCIDA);
      assert.equal((await x.auka.call("totalSupply")).toString(), String(1000n * E18), "nadie pierde sus tokens por no acudir");
      assert.equal((await x.auka.call("lockedOf", [f.alice])).toString(), "0");
      const l = await x.r.call("lotOf", [H.b32("L1")]);
      assert.equal(l.ozLocked.toString(), "0");
      assert.equal(l.ozCommitted.toString(), String(20n * E18));
    });

    it("positivo: retiro presencial con comparecencia: quema y entrega a la vez", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.PRESENCIAL, true, String(E18), 0, H.b32("LIC_G_TEST")], x.board);
      const { id } = await pedir(x, C.ASSET_AUKA, 3n * E18, CH.PRESENCIAL, f.alice);
      await hastaBloqueada(x, id, "L1", (await H.now()) + DIA);
      const rec = await x.r.send("confirmDelivery", [id], x.custA);
      const est = C.eventos(x.r, rec, "RedemptionUpdated").map((e) => Number(e.newState));
      assert.deepEqual(est, [RED.LIQUIDADA, RED.ENTREGADA]);
      assert.equal((await x.auka.call("totalSupply")).toString(), String(997n * E18));
    });

    it("adversario: si la licencia deja de estar vigente, el canal físico se cierra solo", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, H.b32("LIC_G_TEST")], x.board);
      await x.gate.send("set", [CUSTODIA_G, false], x.board);
      await H.expectRevert(x.r.send("requestRedemption", [C.ASSET_AUKA, String(E18), CH.ENVIO], f.alice), H.b32("LICENCIA_NO_OTORGADA"));
    });
  });

  describe("AGKA · liquidación permanente en ORIGEN con el ratio del oráculo", function () {
    beforeEach(async function () {
      await loteListo(x, "LA", C.ASSET_AGKA, "CUST_A", x.custA, C.XAG, "ca");
      await colocar(x, C.ASSET_AGKA, f.alice, 10n * E18, "opa");
      await x.r.send("setChannel", [C.ASSET_AGKA, CH.ORIGEN, true, 0, 50, H.ZERO32], x.board);
      await x.r.sendValue("fundOrigenSettlement", [], x.fondeador, 100n * E18);
    });

    it("negativo: AGKA no abre canales físicos, ni con licencia", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await H.expectRevert(
        x.r.send("setChannel", [C.ASSET_AGKA, CH.ENVIO, true, String(E18), 0, H.b32("LIC")], x.board),
        H.b32("PHYSICAL_NOT_ALLOWED"),
      );
    });

    it("adversario (oráculo viejo): con la lectura vencida no se liquida; con lectura fresca, por el ratio", async function () {
      const { id } = await pedir(x, C.ASSET_AGKA, 4n * E18, CH.ORIGEN, f.alice);
      await hastaBloqueada(x, id);
      await H.increaseTime(C.EDAD + 5);
      await H.expectRevert(x.r.send("settleInOrigen", [id], x.board), "OracleNotFresh");
      assert.equal(Number((await x.r.call("redemptionOf", [id])).state), RED.BLOQUEADA);
      await C.publicarAmbos(x.o, x.pubA, x.pubB, C.ORO, C.PLATA);
      const antes = await C.saldo(f.alice);
      await x.r.send("settleInOrigen", [id], x.board);
      const bruto = (4n * E18 * C.PLATA * 17106925n) / (C.ORO * 10000n);
      assert.equal((await C.saldo(f.alice)) - antes, (bruto * 9950n) / 10000n);
    });
  });
});
