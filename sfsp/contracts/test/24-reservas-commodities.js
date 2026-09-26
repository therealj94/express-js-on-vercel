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
const V = require("./v03");

const DIA = 86400;
const E18 = C.E18;
const LOT = { NINGUNO: 0, RECIBIDO: 1, VERIFICADO: 2, ASIGNADO: 3, PARCIAL: 4, BLOQUEADO: 5, LIBERADO: 6 };
const RED = { NINGUNO: 0, SOLICITADA: 1, ELEGIBLE: 2, EN_COLA: 3, BLOQUEADA: 4, LIQUIDADA: 5, ENTREGADA: 6, CANCELADA: 7, VENCIDA: 8 };
const CH = { ORIGEN: 0, ENVIO: 1, PRESENCIAL: 2 };
// SFSP-140 §3.2 · el MÓDULO del que depende la custodia (no el tipo de licencia).
const CUSTODIA_G = H.b32("MOD_CUSTODIA_CLIENTES");
const LIC_G = H.b32("LIC_G_TEST");
const PA = H.b32("PA");

// Barra de 1 kg a 999,9: onzas finas = mg × ppm × 1e13 / 311035 (31,1035 g por onza).
const KG_MG = 1_000_000n;
const PUREZA = 999_900n;
const OZ_KG = (KG_MG * PUREZA * 10n ** 13n) / 311035n;

// Vigencia máxima de atestación de PRUEBA (la real la fija la Junta, v0.3 §18).
const VIGENCIA_MAX = 90 * DIA;

async function montar(o) {
  const op = o || {};
  const f = await F.deployAll();
  const acc = f.acc;
  const x = { f, board: f.board, pubA: acc[9], pubB: acc[10], auditor: acc[12], custA: acc[13], custB: acc[14], custInt: acc[15], fondeador: acc[16], custA2: acc[18] };
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

  // El motor gasta órdenes de gobierno (apertura de canales físicos).
  await f.governance.send("grantRole", [await f.governance.call("TECH_OPS"), x.r.address], x.board);
  // SFSP-120 §0.3 regla 3 · colocar exige RELEASE y SUBSCRIBE. Entorno de
  // suscripción sintético: PA PERMITIDO, base de colocación con licencia plena
  // (el alcance de la oferta exenta se prueba en 21 y 28) y residencia en PA de
  // los adquirentes de estas pruebas (ruta privada: `colocar` trae el contexto).
  await f.engine.send("grantRole", [await f.engine.call("SUBSCRIPTION_EXECUTOR"), x.r.address], x.board);
  await V.entornoSuscripcion(f, [C.ASSET_AUKA, C.ASSET_AGKA], { base: "ICL", dias: 365 });
  for (const d of [f.alice, f.bob]) await V.altaResidencia(f, d, PA);
  if (!op.sinVigenciaMaxima) await x.r.send("setAttestationValidityLimit", [VIGENCIA_MAX], x.board);
  return x;
}

/** Digest de la orden de gobierno que abre un canal físico (SFSPReserveEngine.setChannel). */
async function digestCanal(x, assetId, canal, minUnits, licRef) {
  const cfg = await x.r.call("channelOf", [assetId, canal]);
  return H.keccak256(H.defaultAbiCoder.encode(
    ["bytes32", "uint256", "address", "bytes32", "uint8", "uint256", "bytes32", "bytes32", "uint32"],
    [H.b32("OPEN_PHYSICAL_CHANNEL"), await H.chainId(), x.r.address, assetId, canal, String(minUnits), licRef, H.b32("LICENCIA_OTORGADA"), Number(cfg.openings)],
  ));
}

/** Abre un canal físico con el REGISTRO de licencias real: el número es el de
 *  otorgamiento de `licId` y la orden de gobierno se aprueba y se gasta. */
async function abrirConRegistro(x, lic, licId, assetId, canal, minUnits) {
  const numero = (await lic.call("licenseOf", [licId])).grant.number;
  const OA = require("./orden-autorizada");
  await OA.aprobar(x.f, await digestCanal(x, assetId, canal, minUnits, numero), H.b32("OPEN_PHYSICAL_CHANNEL"));
  return x.r.send("setChannel", [assetId, canal, true, String(minUnits), 0, numero], x.board);
}

/** Abre un canal físico como manda el v0.3 §9.3: licencia vigente, su número y
 *  una orden de gobierno aprobada con la etiqueta OPEN_PHYSICAL_CHANNEL. */
async function abrirCanalFisico(x, assetId, canal, minUnits, o) {
  const opts = o || {};
  if (!opts.sinCompuerta) {
    await x.r.send("setLicenseGate", [x.gate.address], x.board);
    await x.gate.send("set", [CUSTODIA_G, true], x.board);
    await x.gate.send("setNumber", [CUSTODIA_G, LIC_G], x.board);
  }
  const d = await digestCanal(x, assetId, canal, minUnits, LIC_G);
  const OA = require("./orden-autorizada");
  await OA.aprobar(x.f, d, H.b32("OPEN_PHYSICAL_CHANNEL"));
  return x.r.send("setChannel", [assetId, canal, true, String(minUnits), 0, LIC_G], x.board);
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
async function loteListo(x, lotId, assetId, custodian, attestor, metal, cert, dias, grossMg) {
  await x.r.send("registerLot", [intake(lotId, assetId, custodian, metal || C.XAU, cert || "cert_" + lotId, grossMg)], x.board);
  await atestar(x, lotId, attestor, dias);
  const k = await x.r.call("concentrationLimits");
  if (!k.set) await x.r.send("setConcentrationLimits", [10000, 10000, 0], x.board);
  await x.r.send("assignLot", [H.b32(lotId)], x.board);
}

/** Coloca con el contexto de suscripción del adquirente (residencia en PA).
 *  La atestación de residencia dura una hora en el fixture y algunas pruebas
 *  adelantan días: se renueva antes de colocar. */
async function colocar(x, assetId, to, unidades, op, pais) {
  const country = pais || PA;
  const salt = V.salResidencia(to);
  const c = await x.f.engine.call("residenceCommitment", [country, salt]);
  if (await x.f.identity.call("isCommitmentBound", [to, await x.f.engine.call("PURPOSE_RESIDENCE"), c])) {
    await V.acreditar(x.f, c, await x.f.engine.call("PURPOSE_RESIDENCE"));
  }
  const ctx = V.ctxSuscripcion({ country, salt });
  return x.r.send("place", [assetId, to, String(unidades), H.b32(op), ctx], x.board);
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
      const c = await x.r.call("custodyOf", [C.ASSET_AUKA, H.b32("CUST_B")]);
      assert.equal(c.custodianOz.toString(), String(OZ_KG));
      assert.equal(c.totalOz.toString(), String(2n * OZ_KG));
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

    it("negativo (SFSP-120 §0.3): un residente de un país SOLO_ENTRANTE no recibe una colocación aunque haya capacidad", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      const carol = f.acc[11];
      await f.identity.send("bindPurposeCommitment", [carol, F.PURPOSE_BASE, F.compromiso(H.b32("subj_carol"), F.PURPOSE_BASE, H.b32("salt_carol"))], x.board);
      await V.altaResidencia(f, carol, H.b32("HN"));
      // RELEASE (capacidad) la dejaría pasar; SUBSCRIBE no.
      assert.equal(Number((await f.engine.call("evaluateOperation", [carol, C.ASSET_AUKA, H.b32("RELEASE"), String(E18), H.ZERO32])).result), F.CODE.ALLOW);
      const msg = await V.revertCon(colocar(x, C.ASSET_AUKA, carol, E18, "op_hn", H.b32("HN")), f.engine, "SubscriptionRejected");
      assert.ok(msg.includes(H.b32("COUNTRY_INBOUND_ONLY").slice(2)));
      assert.equal((await x.auka.call("balanceOf", [carol])).toString(), "0");
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(OZ_KG), "no consume capacidad");
      // Sin el rol de ejecutor en el motor, ninguna colocación pasa (falla cerrada).
      await f.engine.send("revokeRole", [await f.engine.call("SUBSCRIPTION_EXECUTOR"), x.r.address], x.board);
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.alice, E18, "op_sin_rol"), "Unauthorized");
    });

    it("adversario (lote comprometido vencido + lote nuevo): la colocación no supera lo cubierto menos lo colocado", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA, C.XAU, "c1", 2);
      await colocar(x, C.ASSET_AUKA, f.alice, 20n * E18, "op1");
      await H.increaseTime(3 * DIA); // L1 vence con 20 oz comprometidas
      await loteListo(x, "L2", C.ASSET_AUKA, "CUST_B", x.custB, C.XAU, "c2", 30);
      const cov = await x.r.call("coverage", [C.ASSET_AUKA]);
      assert.equal(cov.coveredOz.toString(), String(OZ_KG));
      assert.equal(cov.obligationsOz.toString(), String(20n * E18));
      // El libre de L2 son 32,15 oz, pero sólo 12,15 quedan sin obligación.
      const margen = OZ_KG - 20n * E18;
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(margen));
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.bob, 32n * E18, "op2"), "PlacementCapacityExceeded");
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.bob, 13n * E18, "op3"), "PlacementCapacityExceeded");
      await colocar(x, C.ASSET_AUKA, f.bob, 12n * E18, "op4");
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), true, "lo colocado nunca excede lo verificado");
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
      await abrirCanalFisico(x, C.ASSET_AUKA, CH.ENVIO, E18);
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
      await abrirCanalFisico(x, C.ASSET_AUKA, CH.PRESENCIAL, E18);
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
      await abrirCanalFisico(x, C.ASSET_AUKA, CH.PRESENCIAL, E18);
      const { id } = await pedir(x, C.ASSET_AUKA, 3n * E18, CH.PRESENCIAL, f.alice);
      await hastaBloqueada(x, id, "L1", (await H.now()) + DIA);
      const rec = await x.r.send("confirmDelivery", [id], x.custA);
      const est = C.eventos(x.r, rec, "RedemptionUpdated").map((e) => Number(e.newState));
      assert.deepEqual(est, [RED.LIQUIDADA, RED.ENTREGADA]);
      assert.equal((await x.auka.call("totalSupply")).toString(), String(997n * E18));
    });

    it("adversario: si la licencia deja de estar vigente, el canal físico se cierra solo", async function () {
      await abrirCanalFisico(x, C.ASSET_AUKA, CH.ENVIO, E18);
      await x.gate.send("set", [CUSTODIA_G, false], x.board);
      await H.expectRevert(x.r.send("requestRedemption", [C.ASSET_AUKA, String(E18), CH.ENVIO], f.alice), H.b32("LICENCIA_NO_OTORGADA"));
    });
  });

  describe("compuerta REAL: SFSPLicenseRegistry como ILicenseGate (SFSP v0.3 §6)", function () {
    const LIC_G = H.b32("LIC_AUCORP_CUSTODIA_G");
    async function registroReal(disponibilidad) {
      await V.desplegarLicencias(f);
      await V.licenciaVigente(f, LIC_G, V.terminos(V.TIT.AU_CORP, V.TIPO.CUSTODIA_G, { operator: V.OPER.ORDENEX }));
      await V.declararModulo(f, V.modulo(CUSTODIA_G, [[V.TIT.AU_CORP, V.TIPO.CUSTODIA_G]], disponibilidad));
      await x.r.send("setLicenseGate", [f.lic.address], x.board);
    }

    it("positivo: con la licencia Clase G VIGENTE y el módulo DISPONIBLE, el canal físico abre con el registro real", async function () {
      await registroReal(V.AV.DISPONIBLE);
      assert.equal(await f.lic.call("isModuleEnabled", [CUSTODIA_G]), true);
      // Abrir sigue exigiendo la orden de gobierno con el número de la licencia (T-300-28).
      await abrirConRegistro(x, f.lic, LIC_G, C.ASSET_AUKA, CH.ENVIO, E18);
      assert.equal((await x.r.call("channelOf", [C.ASSET_AUKA, CH.ENVIO])).open, true);
    });

    it("negativo: USO_INTERNO, PROXIMAMENTE o un módulo no declarado NO habilitan una función de cara al cliente, y responden con código, no con un revert crudo", async function () {
      await V.desplegarLicencias(f);
      await x.r.send("setLicenseGate", [f.lic.address], x.board);
      // Módulo no declarado: false, no revierte.
      assert.equal(await f.lic.call("isModuleEnabled", [CUSTODIA_G]), false);
      await H.expectRevert(
        x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, H.b32("LIC")], x.board),
        H.b32("LICENCIA_NO_OTORGADA"),
      );
      await V.licenciaVigente(f, LIC_G, V.terminos(V.TIT.AU_CORP, V.TIPO.CUSTODIA_G));
      for (const d of [V.AV.USO_INTERNO, V.AV.PROXIMAMENTE]) {
        await V.declararModulo(f, V.modulo(CUSTODIA_G, [[V.TIT.AU_CORP, V.TIPO.CUSTODIA_G]], d));
        assert.equal(await f.lic.call("isModuleEnabled", [CUSTODIA_G]), false, "disponibilidad " + d);
        await H.expectRevert(
          x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, H.b32("LIC")], x.board),
          H.b32("LICENCIA_NO_OTORGADA"),
        );
      }
      await V.declararModulo(f, V.modulo(CUSTODIA_G, [[V.TIT.AU_CORP, V.TIPO.CUSTODIA_G]], V.AV.BETA));
      assert.equal(await f.lic.call("isModuleEnabled", [CUSTODIA_G]), true, "BETA habilita");
    });

    it("positivo: un lote de custodia interna se asigna con el registro real y las vistas de capacidad no revierten", async function () {
      await registroReal(V.AV.DISPONIBLE);
      await x.r.send("setConcentrationLimits", [10000, 10000, 0], x.board);
      await x.r.send("registerLot", [intake("LI", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "ci")], x.board);
      await atestar(x, "LI", x.custInt);
      await x.r.send("auditVerifyLot", [H.b32("LI"), (await H.now()) + 10 * DIA], x.auditor);
      await x.r.send("assignLot", [H.b32("LI")], x.board);
      assert.equal(await x.r.call("isLotValid", [H.b32("LI")]), true);
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(OZ_KG));
      await colocar(x, C.ASSET_AUKA, f.alice, E18, "op_int");
      assert.equal((await x.auka.call("balanceOf", [f.alice])).toString(), String(E18));
    });
  });

  describe("AGKA · liquidación permanente en ORIGEN con el ratio del oráculo", function () {
    beforeEach(async function () {
      await loteListo(x, "LA", C.ASSET_AGKA, "CUST_A", x.custA, C.XAG, "ca");
      await colocar(x, C.ASSET_AGKA, f.alice, 10n * E18, "opa");
      await x.r.send("setChannel", [C.ASSET_AGKA, CH.ORIGEN, true, 0, 50, H.ZERO32], x.board);
      await x.r.sendValue("fundOrigenSettlement", [], x.fondeador, 100n * E18);
    });

    it("negativo: AGKA no abre canales físicos, ni con licencia ni con orden", async function () {
      await H.expectRevert(abrirCanalFisico(x, C.ASSET_AGKA, CH.ENVIO, E18), H.b32("PHYSICAL_NOT_ALLOWED"));
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
  describe("revisión 26-sep · custodios, vigencia, tope de lotes, concentración, cobertura medida, compuerta y un token por activo", function () {
    it("negativo: sin vigencia máxima de atestación fijada no se atesta (BLOCKED_DECISION)", async function () {
      const y = await montar({ sinVigenciaMaxima: true });
      await y.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_A", C.XAU, "c1")], y.board);
      const msg = await H.expectRevert(atestar(y, "L1", y.custA), "Blocked(9");
      assert.ok(msg.includes(H.b32("ATTESTATION_MAX_NOT_SET")));
      await V.revertCon(y.r.send("setAttestationValidityLimit", [VIGENCIA_MAX], f.mallory), y.r, "Unauthorized");
      const rec = await y.r.send("setAttestationValidityLimit", [VIGENCIA_MAX], y.board);
      assert.equal(Number(C.eventos(y.r, rec, "AttestationValidityLimitSet")[0].maxValiditySeconds), VIGENCIA_MAX);
      await atestar(y, "L1", y.custA);
    });

    it("adversario (atestación a cien años): una vigencia mayor que el máximo se rechaza", async function () {
      await x.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_A", C.XAU, "c1")], x.board);
      const t = await H.now();
      const cien = t + 100 * 365 * DIA;
      await H.expectRevert(
        x.r.send("attestLot", [H.b32("L1"), H.b32("ev"), cien, H.b32("pol"), cien], x.custA),
        H.b32("VALIDITY_TOO_LONG"),
      );
      await atestar(x, "L1", x.custA, 90);
    });

    it("adversario (custodio comprometido): la Junta lo suspende y sus lotes dejan de contar aunque estén comprometidos", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await colocar(x, C.ASSET_AUKA, f.alice, 20n * E18, "op1");
      await H.expectRevert(x.r.send("retireLot", [H.b32("L1"), H.b32("SALIDA")], x.board), H.b32("LOT_COMMITTED"));
      await V.revertCon(x.r.send("updateCustodian", [H.b32("CUST_A"), x.custA, true, H.b32("INSOLVENCIA")], f.mallory), x.r, "Unauthorized");
      const rec = await x.r.send("updateCustodian", [H.b32("CUST_A"), x.custA, true, H.b32("INSOLVENCIA")], x.board);
      const ev = C.eventos(x.r, rec, "CustodianUpdated")[0];
      assert.equal(ev.suspended, true);
      assert.equal(ev.reasonCode, H.b32("INSOLVENCIA"));
      // Sin esperar a que venza la atestación: el lote sale del cómputo en el acto.
      assert.equal(await x.r.call("isLotValid", [H.b32("L1")]), false);
      const cov = await x.r.call("coverage", [C.ASSET_AUKA]);
      assert.equal(cov.coveredOz.toString(), "0");
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), false, "la prueba de reservas lo muestra");
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.bob, E18, "op2"), "CoverageDeficit");
      // Re-atestar no lo rehabilita: sólo la Junta.
      await atestar(x, "L1", x.custA);
      assert.equal(await x.r.call("isLotValid", [H.b32("L1")]), false);
      await x.r.send("updateCustodian", [H.b32("CUST_A"), x.custA, false, H.b32("REHABILITADO")], x.board);
      assert.equal(await x.r.call("isLotValid", [H.b32("L1")]), true);
      await colocar(x, C.ASSET_AUKA, f.bob, E18, "op2");
    });

    it("positivo: la Junta rota la llave del atestador; la anterior ya no atesta ni confirma entregas", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      const rot = await x.r.send("updateCustodian", [H.b32("CUST_A"), x.custA2, false, H.b32("ROTACION_LLAVE")], x.board);
      // Sin vista `custodianOf` (EIP-170): el dato está completo en el evento.
      assert.equal(C.eventos(x.r, rot, "CustodianUpdated")[0].attestor.toLowerCase(), x.custA2.toLowerCase());
      await H.expectRevert(atestar(x, "L1", x.custA), "NotCustodianAttestor");
      await atestar(x, "L1", x.custA2);
      await colocar(x, C.ASSET_AUKA, f.alice, 5n * E18, "op1");
      await abrirCanalFisico(x, C.ASSET_AUKA, CH.PRESENCIAL, E18);
      const { id } = await pedir(x, C.ASSET_AUKA, 2n * E18, CH.PRESENCIAL, f.alice);
      await hastaBloqueada(x, id, "L1", (await H.now()) + DIA);
      await H.expectRevert(x.r.send("confirmDelivery", [id], x.custA), "NotCustodianAttestor");
      await x.r.send("confirmDelivery", [id], x.custA2);
      await H.expectRevert(
        x.r.send("updateCustodian", [H.b32("CUST_X"), x.custA2, false, H.b32("R")], x.board),
        H.b32("CUSTODIAN"),
      );
    });

    it("adversario (tope agotado por historial): un lote LIBERADO deja su hueco; el tope cuenta sólo los activos", async function () {
      for (let i = 0; i < 64; i++) {
        await x.r.send("registerLot", [intake("T" + i, C.ASSET_AUKA, "CUST_A", C.XAU, "t" + i)], x.board);
      }
      await H.expectRevert(
        x.r.send("registerLot", [intake("NUEVO", C.ASSET_AUKA, "CUST_A", C.XAU, "nuevo")], x.board),
        H.b32("TOO_MANY_LOTS"),
      );
      for (let i = 0; i < 64; i++) await x.r.send("retireLot", [H.b32("T" + i), H.b32("SALIDA")], x.board);
      assert.equal((await x.r.call("lotsOf", [C.ASSET_AUKA])).length, 0);
      // La historia no se pierde: el lote sigue legible y su certificado sigue usado.
      assert.equal(Number((await x.r.call("lotOf", [H.b32("T7")])).state), LOT.LIBERADO);
      await H.expectRevert(x.r.send("registerLot", [intake("T7B", C.ASSET_AUKA, "CUST_A", C.XAU, "t7")], x.board), H.b32("CERT_ALREADY_USED"));
      await x.r.send("registerLot", [intake("NUEVO", C.ASSET_AUKA, "CUST_A", C.XAU, "nuevo")], x.board);
      const activos = await x.r.call("lotsOf", [C.ASSET_AUKA]);
      assert.equal(activos.length, 1);
      assert.equal(activos[0], H.b32("NUEVO"));
    });

    it("adversario (metales mezclados): la plata de AGKA no diluye la cuota del custodio interno sobre el oro de AUKA", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      // Seis lotes de plata de 30 kg para AGKA, mitad en A y mitad en B.
      for (let i = 0; i < 3; i++) {
        await loteListo(x, "PA" + i, C.ASSET_AGKA, "CUST_A", x.custA, C.XAG, "pa" + i, 30, 30_000_000n);
        await loteListo(x, "PB" + i, C.ASSET_AGKA, "CUST_B", x.custB, C.XAG, "pb" + i, 30, 30_000_000n);
      }
      // Límites de PRUEBA: 60 % independiente, 20 % interno, desde 1 oz.
      await x.r.send("setConcentrationLimits", [6000, 2000, String(E18)], x.board);
      // Ordenex quiere custodiar TODO el oro de AUKA: 100 % de ese metal, no un 6 %.
      await x.r.send("registerLot", [intake("GI", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "gi", 12_000_000n)], x.board);
      await atestar(x, "GI", x.custInt);
      await x.r.send("auditVerifyLot", [H.b32("GI"), (await H.now()) + 10 * DIA], x.auditor);
      await H.expectRevert(x.r.send("assignLot", [H.b32("GI")], x.board), "ConcentrationExceeded");
      const plata = await x.r.call("custodyOf", [C.ASSET_AGKA, H.b32("CUST_A")]);
      assert.equal(BigInt(plata.custodianOz) * 2n, BigInt(plata.totalOz), "A y B, mitad y mitad de la plata");
    });

    it("adversario (lote vencido en el denominador): un lote que ya no cuenta no infla el total", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await loteListo(x, "A1", C.ASSET_AUKA, "CUST_A", x.custA, C.XAU, "a1", 2);
      await loteListo(x, "B1", C.ASSET_AUKA, "CUST_B", x.custB, C.XAU, "b1", 30);
      // Límites de PRUEBA: 100 % independiente (fuera de esta prueba), 34 % interno.
      await x.r.send("setConcentrationLimits", [10000, 3400, 0], x.board);
      await H.increaseTime(3 * DIA); // A1 vence
      await x.r.send("registerLot", [intake("I1", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "i1")], x.board);
      await atestar(x, "I1", x.custInt);
      await x.r.send("auditVerifyLot", [H.b32("I1"), (await H.now()) + 10 * DIA], x.auditor);
      // Con A1 en el total sería 1/3 (33 %); sobre el metal vigente es 1/2.
      const msg = await H.expectRevert(x.r.send("assignLot", [H.b32("I1")], x.board), "ConcentrationExceeded");
      assert.ok(msg.includes("5000"), msg);
      const c = await x.r.call("custodyOf", [C.ASSET_AUKA, H.b32("CUST_B")]);
      assert.equal(c.totalOz.toString(), String(OZ_KG), "sólo B1 cuenta");
    });

    it("adversario (cuota excedida después de asignar): place() no coloca contra el custodio que ya supera su límite", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await loteListo(x, "A1", C.ASSET_AUKA, "CUST_A", x.custA);
      await loteListo(x, "B1", C.ASSET_AUKA, "CUST_B", x.custB);
      await x.r.send("setConcentrationLimits", [10000, 3400, 0], x.board);
      await x.r.send("registerLot", [intake("I1", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "i1")], x.board);
      await atestar(x, "I1", x.custInt);
      await x.r.send("auditVerifyLot", [H.b32("I1"), (await H.now()) + 10 * DIA], x.auditor);
      await x.r.send("assignLot", [H.b32("I1")], x.board); // 1/3 ≤ 34 %
      // Sale el metal de los independientes: la custodia interna pasa al 100 %.
      await x.r.send("retireLot", [H.b32("A1"), H.b32("SALIDA")], x.board);
      await x.r.send("retireLot", [H.b32("B1"), H.b32("SALIDA")], x.board);
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), true, "el metal sigue ahí");
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), "0");
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.alice, E18, "op1"), "PlacementCapacityExceeded");
      // Entra metal independiente y la cuota vuelve bajo el límite.
      await loteListo(x, "A2", C.ASSET_AUKA, "CUST_A", x.custA, C.XAU, "a2");
      await loteListo(x, "B2", C.ASSET_AUKA, "CUST_B", x.custB, C.XAU, "b2");
      await colocar(x, C.ASSET_AUKA, f.alice, 90n * E18, "op1");
    });

    it("T-300-20: la tesorería no transfiere a un tercero sin RELEASE (token de prueba)", async function () {
      await H.expectRevert(x.auka.send("transfer", [f.bob, String(E18)], f.treasury), "tesoreria sin RELEASE");
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await colocar(x, C.ASSET_AUKA, f.alice, E18, "op1");
      await x.auka.send("transfer", [f.bob, String(E18)], f.alice);
    });

    it("adversario (unidades fuera de place()): la cobertura mide la tesorería real y la capacidad no se infla", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await colocar(x, C.ASSET_AUKA, f.alice, 20n * E18, "op1");
      // 2 unidades llegan a un tercero sin RELEASE (migración o integración que no cumple).
      await x.auka.send("mintDirect", [f.bob, String(2n * E18)], x.board);
      let cov = await x.r.call("coverage", [C.ASSET_AUKA]);
      assert.equal(cov.unitsPlaced.toString(), String(22n * E18), "medido: suministro menos tesorería");
      assert.equal(cov.unitsInTreasury.toString(), String(980n * E18), "saldo real de la tesorería");
      assert.equal(cov.obligationsOz.toString(), String(22n * E18));
      assert.equal((await x.r.call("assetOf", [C.ASSET_AUKA])).unitsPlaced.toString(), String(20n * E18), "el libro del motor no lo vio");
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(OZ_KG - 22n * E18));
      // Bob redime sus 2 en ORIGEN: el libro baja a 18, pero Alice sigue con 20.
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ORIGEN, true, 0, 50, H.ZERO32], x.board);
      await x.r.sendValue("fundOrigenSettlement", [], x.board, 3500n * E18);
      const { id } = await pedir(x, C.ASSET_AUKA, 2n * E18, CH.ORIGEN, f.bob);
      await hastaBloqueada(x, id);
      await x.r.send("settleInOrigen", [id], x.board);
      cov = await x.r.call("coverage", [C.ASSET_AUKA]);
      assert.equal(cov.unitsPlaced.toString(), String(20n * E18));
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(OZ_KG - 20n * E18));
      // Con el cómputo deducido la capacidad subía a 14,15 y 14 más dejaban 34 unidades contra 32,15 oz.
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.bob, 14n * E18, "op2"), "PlacementCapacityExceeded");
      await colocar(x, C.ASSET_AUKA, f.bob, 12n * E18, "op3");
      const terceros = BigInt(await x.auka.call("balanceOf", [f.alice])) + BigInt(await x.auka.call("balanceOf", [f.bob]));
      assert.ok(terceros * 1n <= OZ_KG, "unidades en terceros " + terceros + " contra " + OZ_KG);
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), true);
    });

    it("positivo: SFSPLicenseRegistry es la compuerta real; la custodia interna se habilita y la cobertura se lee", async function () {
      await V.desplegarLicencias(f);
      const LIC = H.b32("LIC_AU_CUSTODIA_G_SINT");
      await V.licenciaVigente(f, LIC, V.terminos(V.TIT.AU_CORP, V.TIPO.CUSTODIA_G, { operator: V.OPER.ORDENEX }));
      // DISPONIBLE: USO_INTERNO no habilita el canal físico de cara al cliente
      // que se abre más abajo (ver «negativo: USO_INTERNO, PROXIMAMENTE…»).
      await V.declararModulo(f, V.modulo(CUSTODIA_G, [[V.TIT.AU_CORP, V.TIPO.CUSTODIA_G]], V.AV.DISPONIBLE));
      assert.equal(await f.lic.call("isModuleEnabled", [CUSTODIA_G]), true);
      assert.equal(await f.lic.call("isModuleEnabled", [H.b32("MOD_NO_DECLARADO")]), false);
      await x.r.send("setLicenseGate", [f.lic.address], x.board);
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await x.r.send("registerLot", [intake("LI", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "ci")], x.board);
      await atestar(x, "LI", x.custInt);
      await x.r.send("auditVerifyLot", [H.b32("LI"), (await H.now()) + 10 * DIA], x.auditor);
      await x.r.send("assignLot", [H.b32("LI")], x.board);
      assert.equal((await x.r.call("coverage", [C.ASSET_AUKA])).coveredOz.toString(), String(2n * OZ_KG));
      await colocar(x, C.ASSET_AUKA, f.alice, 40n * E18, "op1");
      await abrirConRegistro(x, f.lic, LIC, C.ASSET_AUKA, CH.ENVIO, E18);
      // La licencia se suspende: la custodia interna deja de contar, sin revertir lecturas.
      await V.transicion(f, LIC, V.LS.VIGENTE, V.LS.SUSPENDIDA);
      assert.equal(await x.r.call("isLotValid", [H.b32("LI")]), false);
      assert.equal((await x.r.call("coverage", [C.ASSET_AUKA])).coveredOz.toString(), String(OZ_KG));
      await x.r.send("publishCoverage", [C.ASSET_AUKA], f.mallory);
    });

    it("adversario: una compuerta que no implementa la interfaz cuenta como licencia no otorgada; la cobertura no revierte", async function () {
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await x.r.send("registerLot", [intake("LI", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "ci")], x.board);
      await atestar(x, "LI", x.custInt);
      await x.r.send("auditVerifyLot", [H.b32("LI"), (await H.now()) + 10 * DIA], x.auditor);
      await x.r.send("assignLot", [H.b32("LI")], x.board);
      // La Junta apunta a un contrato sin `isModuleEnabled` (aquí, el oráculo).
      await x.r.send("setLicenseGate", [x.o.address], x.board);
      const cov = await x.r.call("coverage", [C.ASSET_AUKA]);
      assert.equal(cov.coveredOz.toString(), String(OZ_KG), "sólo cuenta el lote independiente");
      await x.r.send("publishCoverage", [C.ASSET_AUKA], f.mallory);
      await colocar(x, C.ASSET_AUKA, f.alice, E18, "op1");
      await H.expectRevert(
        x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, H.b32("LIC")], x.board),
        H.b32("LICENCIA_NO_OTORGADA"),
      );
    });

    it("adversario (doble cómputo por configuración): un token, un activo; corregir sólo mientras el activo está vacío", async function () {
      const OTRO = H.b32("SFSP:COM:AGKA:FISICO");
      await H.expectRevert(
        x.r.send("configureAsset", [OTRO, C.XAG, x.agka.address, f.treasury, String(E18), true], x.board),
        H.b32("TOKEN_ALREADY_CONFIGURED"),
      );
      assert.equal(await x.r.call("assetOfToken", [x.agka.address]), C.ASSET_AGKA);
      // Un activo nuevo mal configurado (tesorería equivocada) se corrige mientras está vacío.
      const t3 = await H.deploy("SFSPTokenCommodityDePrueba", [], x.board);
      const t4 = await H.deploy("SFSPTokenCommodityDePrueba", [], x.board);
      const NUEVO = H.b32("SFSP:COM:AUKA:NUEVO");
      await x.r.send("configureAsset", [NUEVO, C.XAU, t3.address, f.bob, String(E18), true], x.board);
      await x.r.send("configureAsset", [NUEVO, C.XAU, t3.address, f.treasury, String(E18), true], x.board);
      assert.equal((await x.r.call("assetOf", [NUEVO])).treasuryWallet.toLowerCase(), f.treasury.toLowerCase());
      await x.r.send("configureAsset", [NUEVO, C.XAU, t4.address, f.treasury, String(E18), true], x.board);
      assert.equal(await x.r.call("assetOfToken", [t3.address]), H.ZERO32, "el token anterior queda libre");
      assert.equal(await x.r.call("assetOfToken", [t4.address]), NUEVO);
      // Con un canal fijado o con un lote, ya no.
      await x.r.send("setChannel", [NUEVO, CH.ORIGEN, false, 0, 0, H.ZERO32], x.board);
      await H.expectRevert(
        x.r.send("configureAsset", [NUEVO, C.XAU, t4.address, f.treasury, String(E18), true], x.board),
        H.b32("ALREADY_CONFIGURED"),
      );
      await x.r.send("registerLot", [intake("L1", C.ASSET_AUKA, "CUST_A", C.XAU, "c1")], x.board);
      await H.expectRevert(
        x.r.send("configureAsset", [C.ASSET_AUKA, C.XAU, x.auka.address, f.bob, String(E18), true], x.board),
        H.b32("ALREADY_CONFIGURED"),
      );
    });
  });

  describe("SFSP-120 §0.3 · colocar es suscribir: RELEASE y además SUBSCRIBE sobre el adquirente", function () {
    it("negativo (T-120-21, T-120-25): con capacidad y RELEASE en ALLOW, un residente SOLO_ENTRANTE no recibe", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      const carol = f.acc[11];
      await f.identity.send("bindPurposeCommitment", [carol, F.PURPOSE_BASE, F.compromiso(H.b32("subj_carol"), F.PURPOSE_BASE, H.b32("salt_carol"))], x.board);
      await V.acreditarResidencia(f, carol, H.b32("HN"), "carol");
      const release = await f.engine.call("evaluateOperation", [carol, C.ASSET_AUKA, H.b32("RELEASE"), String(E18), H.ZERO32]);
      assert.equal(Number(release.result), F.CODE.ALLOW, "RELEASE solo no bastaba: era el hueco");
      await V.revertCon(colocar(x, C.ASSET_AUKA, carol, E18, "op_carol"), f.engine, "SubscriptionRejected");
      assert.equal((await x.auka.call("balanceOf", [carol])).toString(), "0");
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(OZ_KG), "la capacidad no se tocó");
    });

    it("negativo: sin el rol de ejecutor en el motor de elegibilidad, el motor de reservas no coloca", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await f.engine.send("revokeRole", [await f.engine.call("SUBSCRIPTION_EXECUTOR"), x.r.address], x.board);
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.alice, E18, "op_sin_rol"), "Unauthorized");
    });
  });

  describe("C8 · la cobertura cuenta lo que está FUERA de la tesorería (T-300-20 detectado)", function () {
    it("adversario: una salida directa desde la tesorería cuenta como colocada, cae el invariante y se detiene la colocación", async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await colocar(x, C.ASSET_AUKA, f.alice, 10n * E18, "op1");
      // 40 AUKA llegan a bob sin pasar por `place` (sin capacidad). El token de
      // prueba ya no deja a la tesorería transferir sin RELEASE (T-300-20), así
      // que la fuga se simula con una acuñación directa a un tercero: la tesorería
      // no baja, pero lo que está FUERA de ella sí sube.
      await x.auka.send("mintDirect", [f.bob, String(40n * E18)], x.board);
      const c = await x.r.call("coverage", [C.ASSET_AUKA]);
      assert.equal(c.unitsPlaced.toString(), String(50n * E18), "lo que está en manos de terceros, no sólo lo colocado");
      assert.equal(c.unitsInTreasury.toString(), String(990n * E18), "el saldo real de la tesorería, no una resta");
      assert.equal(await x.r.call("invariantHolds", [C.ASSET_AUKA]), false, "32,14 oz no cubren 50 unidades");
      const rec = await x.r.send("publishCoverage", [C.ASSET_AUKA], f.mallory);
      assert.equal(C.eventos(x.r, rec, "CoveragePublished")[0].unitsPlaced.toString(), String(50n * E18));
      await H.expectRevert(colocar(x, C.ASSET_AUKA, f.alice, E18, "op2"), "CoverageDeficit");
    });
  });

  describe("concentración: el límite de la custodia interna es una decisión aparte (v0.3 §18)", function () {
    it("negativo (T-300-27): sin límite interno, un lote de Ordenex no se asigna ni suma; los independientes sí", async function () {
      // Límite independiente fijado; el interno en null (0).
      await x.r.send("setConcentrationLimits", [6000, 0, String(40n * E18)], x.board);
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await loteListo(x, "L2", C.ASSET_AUKA, "CUST_B", x.custB, C.XAU, "c2");
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(2n * OZ_KG));
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await x.r.send("registerLot", [intake("LI", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "ci")], x.board);
      await atestar(x, "LI", x.custInt);
      await x.r.send("auditVerifyLot", [H.b32("LI"), (await H.now()) + 10 * DIA], x.auditor);
      const msg = await H.expectRevert(x.r.send("assignLot", [H.b32("LI")], x.board), "Blocked(9");
      assert.ok(msg.includes(H.b32("INTERNAL_CONCENTRATION_NOT_SET")));
      // Con el límite interno fijado por la Junta, se asigna y suma.
      await x.r.send("setConcentrationLimits", [6000, 4000, String(40n * E18)], x.board);
      await x.r.send("assignLot", [H.b32("LI")], x.board);
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(3n * OZ_KG));
      // Si la Junta vuelve a dejarlo en null, el lote interno deja de contar solo.
      await x.r.send("setConcentrationLimits", [6000, 0, String(40n * E18)], x.board);
      assert.equal(await x.r.call("isLotValid", [H.b32("LI")]), false);
      assert.equal((await x.r.call("placementCapacityOz", [C.ASSET_AUKA])).toString(), String(2n * OZ_KG));
    });
  });

  describe("canales físicos: se abren sólo por orden de gobierno con el número de la licencia (T-300-28)", function () {
    beforeEach(async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await x.r.send("setLicenseGate", [x.gate.address], x.board);
      await x.gate.send("set", [CUSTODIA_G, true], x.board);
      await x.gate.send("setNumber", [CUSTODIA_G, LIC_G], x.board);
    });

    it("negativo: con la licencia vigente pero sin orden de gobierno, la Junta sola no abre el canal", async function () {
      const msg = await H.expectRevert(
        x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, LIC_G], x.board),
        "Rejected",
      );
      assert.ok(msg.includes(H.b32("GOVERNANCE_ORDER_REQUIRED")));
    });

    it("negativo: con un número que no es el de la licencia del módulo, no abre (ni con orden)", async function () {
      const falso = H.b32("LIC_INVENTADA");
      const OA = require("./orden-autorizada");
      await OA.aprobar(f, await digestCanal(x, C.ASSET_AUKA, CH.ENVIO, E18, falso), H.b32("OPEN_PHYSICAL_CHANNEL"));
      const msg = await H.expectRevert(
        x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, falso], x.board),
        "Rejected",
      );
      assert.ok(msg.includes(H.b32("LICENSE_NUMBER")));
    });

    it("positivo: con la orden aprobada abre; la orden se gasta y reabrir exige otra", async function () {
      await abrirCanalFisico(x, C.ASSET_AUKA, CH.ENVIO, E18, { sinCompuerta: true });
      const cfg = await x.r.call("channelOf", [C.ASSET_AUKA, CH.ENVIO]);
      assert.equal(cfg.open, true);
      assert.equal(cfg.licenseRef, LIC_G);
      assert.equal(Number(cfg.openings), 1);
      // Cerrar no necesita orden (reduce poder); reabrir, sí, y otra distinta.
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, false, String(E18), 0, LIC_G], x.board);
      await H.expectRevert(x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, LIC_G], x.board), "Rejected");
      await abrirCanalFisico(x, C.ASSET_AUKA, CH.ENVIO, E18, { sinCompuerta: true });
      assert.equal(Number((await x.r.call("channelOf", [C.ASSET_AUKA, CH.ENVIO])).openings), 2);
    });
  });

  describe("fase 2 punto 1 · el registro de licencias es la compuerta real del motor", function () {
    it("positivo: con LIC_AUCORP_CUSTODIA_G VIGENTE y MOD_CUSTODIA_CLIENTES declarado, el motor asigna custodia interna y abre el canal", async function () {
      const lic = f.lic; // el registro que ya cablea el motor de elegibilidad
      const LIC_ID = H.b32("LIC_AUCORP_CUSTODIA_G");
      const t = V.terminos(V.TIT.AU_CORP, V.TIPO.CUSTODIA_G, { operator: V.OPER.ORDENEX });
      await V.licenciaVigente(f, LIC_ID, t, 30);
      await V.declararModulo(f, V.modulo(CUSTODIA_G, [[V.TIT.AU_CORP, V.TIPO.CUSTODIA_G]], V.AV.DISPONIBLE, H.b32("LICENCIA_OTORGADA")));
      assert.equal(await lic.call("isModuleEnabled", [CUSTODIA_G]), true);
      const numero = (await lic.call("licenseOf", [LIC_ID])).grant.number;
      assert.equal(await lic.call("moduleHasLicenseNumber", [CUSTODIA_G, numero]), true);
      assert.equal(await lic.call("moduleHasLicenseNumber", [CUSTODIA_G, H.b32("OTRO")]), false);

      await x.r.send("setLicenseGate", [lic.address], x.board);
      await x.r.send("setConcentrationLimits", [10000, 10000, 0], x.board);
      await x.r.send("registerLot", [intake("LI", C.ASSET_AUKA, "CUST_ORDENEX", C.XAU, "ci")], x.board);
      await atestar(x, "LI", x.custInt);
      await x.r.send("auditVerifyLot", [H.b32("LI"), (await H.now()) + 10 * DIA], x.auditor);
      // Antes revertía: el registro no tenía la función que el motor consultaba.
      await x.r.send("assignLot", [H.b32("LI")], x.board);
      assert.equal(await x.r.call("isLotValid", [H.b32("LI")]), true);

      const OA = require("./orden-autorizada");
      await OA.aprobar(f, await digestCanal(x, C.ASSET_AUKA, CH.ENVIO, E18, numero), H.b32("OPEN_PHYSICAL_CHANNEL"));
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ENVIO, true, String(E18), 0, numero], x.board);
      assert.equal((await x.r.call("channelOf", [C.ASSET_AUKA, CH.ENVIO])).open, true);

      // Si la licencia se suspende, el módulo se cierra y el lote interno deja de contar.
      await V.transicion(f, LIC_ID, V.LS.VIGENTE, V.LS.SUSPENDIDA, V.SIN_OTORGAMIENTO, H.b32("LICENCIA_SUSPENDIDA"));
      assert.equal(await x.r.call("isLotValid", [H.b32("LI")]), false);
    });
  });

  describe("Apéndice A/B · toda transición de la redención lleva su código de motivo", function () {
    beforeEach(async function () {
      await loteListo(x, "L1", C.ASSET_AUKA, "CUST_A", x.custA);
      await colocar(x, C.ASSET_AUKA, f.alice, 20n * E18, "op1");
      await x.r.send("setChannel", [C.ASSET_AUKA, CH.ORIGEN, true, 0, 50, H.ZERO32], x.board);
    });

    const motivos = (rec) => C.eventos(x.r, rec, "RedemptionUpdated").map((e) => [Number(e.newState), e.reasonCode]);

    it("positivo: la cancelación del tenedor, la de operación y la inelegibilidad se distinguen", async function () {
      const a = await pedir(x, C.ASSET_AUKA, E18, CH.ORIGEN, f.alice);
      assert.deepEqual(motivos(a.rec), [[RED.SOLICITADA, H.b32("SOLICITUD_TENEDOR")]]);
      assert.deepEqual(motivos(await x.r.send("cancelRedemption", [a.id], f.alice)), [[RED.CANCELADA, H.b32("CANCELACION_TENEDOR")]]);
      const b = await pedir(x, C.ASSET_AUKA, E18, CH.ORIGEN, f.alice);
      assert.deepEqual(motivos(await x.r.send("cancelRedemption", [b.id], x.board)), [[RED.CANCELADA, H.b32("CANCELACION_OPERACION")]]);
      // alice deja de ser elegible para REDEEM: la cancelación lleva el código del motor.
      const c = await pedir(x, C.ASSET_AUKA, E18, CH.ORIGEN, f.alice);
      await F.fijarPolitica(f, C.ASSET_AUKA, H.b32("REDEEM"), F.policy({ actionAllowed: false }), "redeem_no");
      assert.deepEqual(motivos(await x.r.send("verifyEligibility", [c.id], x.board)), [[RED.CANCELADA, H.b32("POLICY_FORBIDS_ACTION")]]);
    });

    it("positivo: la incomparecencia se registra como VENCIMIENTO_PLAZO", async function () {
      await abrirCanalFisico(x, C.ASSET_AUKA, CH.PRESENCIAL, E18);
      const { id } = await pedir(x, C.ASSET_AUKA, 2n * E18, CH.PRESENCIAL, f.alice);
      await hastaBloqueada(x, id, "L1", (await H.now()) + DIA);
      await H.increaseTime(DIA + 10);
      assert.deepEqual(motivos(await x.r.send("expireNoShow", [id], f.mallory)), [[RED.VENCIDA, H.b32("VENCIMIENTO_PLAZO")]]);
    });
  });
});
