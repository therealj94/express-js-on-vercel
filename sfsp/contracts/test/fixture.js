"use strict";
// Fixture sintético completo. Todos los parámetros (quórums, límites, TTL) son
// valores de prueba: ningún número aquí es una recomendación económica.
const H = require("./helpers");

const Legal = { UNCLASSIFIED: 0, UNDER_REVIEW: 1, CLASSIFIED: 2, RESTRICTED_BY_LAW: 3 };
const Admission = { DRAFT: 0, REVIEW: 1, APPROVED: 2, REJECTED: 3, WITHDRAWN: 4 };
const Trading = { NOT_LISTED: 0, LISTED: 1, SUSPENDED: 2, DELISTED: 3 };
const Transferability = { FREE: 0, RESTRICTED: 1, FROZEN: 2 };
const Redemption = { NONE: 0, AVAILABLE: 1, SUSPENDED: 2 };
const Visibility = { VISIBLE_TO_HOLDER: 0, HIDDEN_FROM_CATALOG: 1 };
const Profile = { LEGACY_REGISTERED: 0, SFSP_ENFORCED: 1, CUSTODIAL_ACCOUNTING: 2 };
const Kind = { NATIVE: 0, CONTRACT: 1, OFFCHAIN_RECORD: 2 };
const Risk = { SIN_EVALUAR: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5 };
const Report = { NONE: 0, CURRENT: 1, DUE: 2, LATE: 3, WARNING: 4 };
const Supply = { UNKNOWN: 0, CHAIN_TOTALSUPPLY: 1, REGISTRY: 2, CUSTODIAL_LEDGER: 3 };
const Axis = { LEGAL: 0, ADMISSION: 1, TRADING: 2, TRANSFERABILITY: 3, REDEMPTION: 4, VISIBILITY: 5 };

const CODE = {
  ALLOW: 0,
  DENY_POLICY: 1,
  DENY_ELIGIBILITY: 2,
  DENY_JURISDICTION: 3,
  DENY_ASSET_STATE: 4,
  DENY_AUTHORIZATION: 5,
  DENY_LIMIT: 6,
  REVIEW_REQUIRED: 7,
  UNKNOWN_SOURCE: 8,
  BLOCKED_DECISION: 9,
};

const ASSET_NEW = H.b32("SFSP:SEC:ISS1:S1");
const ASSET_OLD = H.b32("SFSP:LEGACY:ISS1:S0");
// H15 · la bóveda de efectivo también tiene activo: `TreasuryReleased` lo lleva.
const ASSET_CASH = H.b32("SFSP:CASH:NATIVE:TEST");

function passport(assetId, opts) {
  const o = opts || {};
  return {
    assetId,
    issuerId: H.b32("iss_fixture_0001"),
    legalInstrumentId: H.b32("legal_fixture_1"),
    economicType: H.b32("EQUITY"),
    legalClass: o.legalClass !== undefined ? o.legalClass : H.b32("SECURITY_TEST"),
    jurisdiction: o.jurisdiction !== undefined ? o.jurisdiction : H.b32("JUR_TEST"),
    implementationProfile: o.profile !== undefined ? o.profile : Profile.SFSP_ENFORCED,
    assetKind: Kind.CONTRACT,
    enforcement: {
      transferRestrictions: o.transferRestrictions !== undefined ? o.transferRestrictions : true,
      freeze: o.freeze !== undefined ? o.freeze : true,
      forcedTransfer: o.forcedTransfer !== undefined ? o.forcedTransfer : true,
      pause: true,
      directTransferBypass: o.directTransferBypass !== undefined ? o.directTransferBypass : false,
      notesRef: H.b32("notes_ref_hash"),
    },
    settlementLocation: { chainId: 31337, contractAddress: H.ZERO_ADDR, codehash: H.ZERO32 },
    unit: H.b32("UNIT"),
    decimalsKnown: o.decimalsKnown !== undefined ? o.decimalsKnown : true,
    decimals: o.decimalsKnown === false ? 0 : 6,
    rightsTemplateId: H.b32("rights_tpl"),
    rightsTemplateVersion: H.b32("v1"),
    documentRoot: H.b32("doc_root"),
    reportStatus: Report.CURRENT,
    risk: { level: Risk.SIN_EVALUAR, methodologyVersion: H.ZERO32, evaluatedAt: 0 },
    transferPolicyId: H.b32("pol_transfer_1"),
    redemptionPolicyId: H.ZERO32,
    listingPolicyId: H.b32("pol_listing_1"),
    supplySource: Supply.CHAIN_TOTALSUPPLY,
    status: {
      legal: o.legal !== undefined ? o.legal : Legal.CLASSIFIED,
      admission: o.admission !== undefined ? o.admission : Admission.APPROVED,
      trading: o.trading !== undefined ? o.trading : Trading.LISTED,
      transferability: o.transferability !== undefined ? o.transferability : Transferability.RESTRICTED,
      redemption: Redemption.NONE,
      visibility: Visibility.VISIBLE_TO_HOLDER,
    },
  };
}

function policy(o) {
  const p = o || {};
  return {
    configured: true,
    actionAllowed: p.actionAllowed !== undefined ? p.actionAllowed : true,
    requiresHumanReview: !!p.requiresHumanReview,
    requiresAuthorization: !!p.requiresAuthorization,
    requiresDecimalsKnown: p.requiresDecimalsKnown !== undefined ? p.requiresDecimalsKnown : true,
    jurisdictionAllowlist: !!p.jurisdictionAllowlist,
    requiredPurpose: p.requiredPurpose || H.ZERO32,
    maxAmount: p.maxAmount || 0,
    version: 0,
  };
}

const ACTIONS = ["MINT", "TRANSFER_OUT", "TRANSFER_IN", "SETTLE", "REDEEM", "MIGRATION_CLAIM"];

// Parámetros de gobierno del fixture: sintéticos, no recomendados.
const GOV = { threshold: 2, upgradeThreshold: 3, timelockDelay: 3600, maxPause: 86400 };

async function deployAll() {
  const acc = await H.accounts();
  const board = acc[0];
  const signers = [acc[1], acc[2], acc[3]].slice().sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  const treasury = acc[4];
  const alice = acc[5];
  const bob = acc[6];
  const mallory = acc[7]; // sin subjectRef: fuente desconocida, no "denegado por política"

  const registry = await H.deploy("SFSPAssetRegistry", [board], board);
  const governance = await H.deploy(
    "SFSPGovernanceController",
    [board, signers, GOV.threshold, GOV.upgradeThreshold, GOV.timelockDelay, GOV.maxPause],
    board
  );
  const identity = await H.deploy("SFSPIdentityAdapter", [board], board);
  const engine = await H.deploy(
    "SFSPEligibilityEngine",
    [board, registry.address, identity.address, governance.address],
    board
  );
  const assetNew = await H.deploy(
    "SFSPRegulatedAsset",
    [board, ASSET_NEW, registry.address, engine.address, identity.address, governance.address, true],
    board
  );
  const assetOld = await H.deploy(
    "SFSPRegulatedAsset",
    [board, ASSET_OLD, registry.address, engine.address, identity.address, governance.address, true],
    board
  );
  const issuance = await H.deploy("SFSPIssuanceController", [board, governance.address], board);
  const vault = await H.deploy("SFSPCashVault", [board, ASSET_CASH], board);
  const settlement = await H.deploy(
    "SFSPSettlementEngine",
    [board, vault.address, engine.address, identity.address, governance.address],
    board
  );
  const migration = await H.deploy("SFSPMigrationRegistry", [board, registry.address], board);
  const fee = await H.deploy("SFSPFeeController", [board], board);

  // --- roles (cada contrato tiene su propia tabla: no hay rol global)
  await registry.send("grantRole", [await registry.call("TECH_OPS"), board], board);
  await registry.send("grantRole", [await registry.call("AUDITOR"), board], board);
  await identity.send("grantRole", [await identity.call("ATTESTOR"), board], board);
  await engine.send("grantRole", [await engine.call("TECH_OPS"), board], board);
  await issuance.send("grantRole", [await issuance.call("ISSUER"), board], board);
  await settlement.send("grantRole", [await settlement.call("TECH_OPS"), board], board);
  await migration.send("grantRole", [await migration.call("ATTESTOR"), board], board);
  for (const a of [assetNew, assetOld]) {
    await a.send("grantRole", [await a.call("TECH_OPS"), board], board);
    await a.send("grantRole", [await a.call("ISSUER"), board], board);
  }
  // Los EJECUTORES consumen aprobaciones ligadas al contenido en gobierno. Cada
  // uno necesita el rol TECH_OPS del propio gobierno para poder gastarlas; el
  // rol sólo permite GASTAR una aprobación que ya alcanzó quórum, nunca crearla.
  for (const ejecutor of [assetNew, assetOld, issuance, settlement]) {
    await governance.send("grantRole", [await governance.call("TECH_OPS"), ejecutor.address], board);
  }

  // --- catálogo
  await registry.send("registerAsset", [passport(ASSET_NEW)], board);
  await registry.send("registerAsset", [passport(ASSET_OLD)], board);

  // --- políticas por acción para AMBOS activos: ninguna clase "pasa automáticamente"
  for (const assetId of [ASSET_NEW, ASSET_OLD]) {
    for (const action of ACTIONS) {
      await engine.send("setPolicy", [assetId, H.b32(action), policy({})], board);
    }
  }

  // --- identidad: referencias opacas, nunca datos personales
  await identity.send("bindSubjectRef", [treasury, H.b32("subj_treasury")], board);
  await identity.send("bindSubjectRef", [alice, H.b32("subj_alice")], board);
  await identity.send("bindSubjectRef", [bob, H.b32("subj_bob")], board);

  // --- cableado
  await assetNew.send("setIssuanceController", [issuance.address], board);
  await assetNew.send("setSettlementEngine", [settlement.address], board);
  await assetNew.send("setMigrationRegistry", [migration.address], board);
  // El activo viejo es un fixture: el board actúa de controlador de emisión para
  // sembrar tenencias previas a la migración. No representa una ruta de producción.
  await assetOld.send("setIssuanceController", [board], board);
  await assetOld.send("setMigrationRegistry", [migration.address], board);
  await vault.send("setSettlementEngine", [settlement.address], board);
  await issuance.send("registerAssetContract", [ASSET_NEW, assetNew.address], board);
  await issuance.send("registerAssetContract", [ASSET_OLD, assetOld.address], board);
  // H05 · el contrato canónico de cada activo lo declara el órgano, no el
  // operador que liquida.
  await settlement.send("registerCanonicalAsset", [ASSET_NEW, assetNew.address], board);

  return {
    acc, board, signers, treasury, alice, bob, mallory,
    registry, governance, identity, engine, assetNew, assetOld,
    issuance, vault, settlement, migration, fee,
    ASSET_NEW, ASSET_OLD, ASSET_CASH, GOV,
  };
}

module.exports = {
  deployAll, passport, policy, ACTIONS,
  Legal, Admission, Trading, Transferability, Redemption, Visibility,
  Profile, Kind, Risk, Report, Supply, Axis, CODE,
  ASSET_NEW, ASSET_OLD, ASSET_CASH, GOV,
};
