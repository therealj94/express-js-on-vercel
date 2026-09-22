"use strict";
// Fixture sintético completo. Todos los parámetros (quórums, límites, TTL) son
// valores de prueba: ningún número aquí es una recomendación económica.
const H = require("./helpers");
const OA = require("./orden-autorizada");

/* H16 · las direcciones ya no guardan la referencia del sujeto, sino un
   COMPROMISO POR PROPÓSITO: keccak256(ETIQUETA, subjectRef, purpose, salt). El
   `salt` es secreto y propio de cada par (sujeto, propósito); por eso dos
   direcciones del mismo sujeto dadas de alta en propósitos distintos guardan
   valores sin relación observable. Aquí es sintético, como todo el fixture. */
const COMMITMENT_TAG = H.keccak256(Buffer.from("SFSP.SUBJECT.COMMITMENT.v1", "utf8"));
const PURPOSE_BASE = H.b32("BASE");

const SUBJ = {
  treasury: H.b32("subj_treasury"),
  alice: H.b32("subj_alice"),
  bob: H.b32("subj_bob"),
};
const SALT = {
  treasury: H.b32("salt_treasury_sintetico"),
  alice: H.b32("salt_alice_sintetico"),
  bob: H.b32("salt_bob_sintetico"),
};

function compromiso(subjectRef, purpose, salt) {
  return H.keccak256(
    H.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "bytes32"],
      [COMMITMENT_TAG, subjectRef, purpose, salt],
    ),
  );
}

/* P03/§12.5 · `SET_POLICY`. Fijar una política dejó de ser un `send` con rol y
   pasó a exigir doble control: se construye el payload del §12.1 con la versión
   anterior, la nueva y el compromiso del CONTENIDO, se hace aprobar por dos
   firmantes distintos del proponente, y el motor lo recalcula y lo consume. */
const POLICY_SCOPE_ENGINE = H.b32("SFSP:GOV:ELIGIBILITY_POLICY");
const POLICY_SCOPE_PASSPORT = H.b32("SFSP:GOV:PASSPORT_POLICY");

let _seqNonce = 0;
function nonceUnico(tag) {
  _seqNonce += 1;
  return H.b32("n_" + String(tag).slice(0, 18) + "_" + _seqNonce);
}

function digestPolitica(policyAction, p) {
  return H.keccak256(
    H.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bool", "bool", "bool", "bool", "bool", "bytes32", "uint256"],
      [
        POLICY_SCOPE_ENGINE,
        policyAction,
        p.actionAllowed,
        p.requiresHumanReview,
        p.requiresAuthorization,
        p.requiresDecimalsKnown,
        p.jurisdictionAllowlist,
        p.requiredPurpose,
        String(p.maxAmount),
      ],
    ),
  );
}

/** Fija una política de elegibilidad con doble control real. */
async function fijarPolitica(f, assetId, policyAction, pol, tag) {
  const actual = await f.engine.call("policyOf", [assetId, policyAction]);
  const previa = Number(actual.version);
  const payload = await OA.orden({
    verifyingContract: f.engine.address,
    action: H.b32("SET_POLICY"),
    assetId,
    amount: String(previa),
    amountSecondary: String(previa + 1),
    nonce: nonceUnico(tag || "pol"),
    evidenceRoot: digestPolitica(policyAction, pol),
  });
  const d = OA.digestDe(payload);
  await OA.aprobar(f, d, H.b32("SET_POLICY"));
  return await f.engine.send("setPolicy", [assetId, policyAction, pol, OA.tupla(payload), d], f.board);
}

/** Cambia una política del PASAPORTE (registro) con doble control real. */
async function actualizarPoliticaPasaporte(f, assetId, policyKind, newPolicyId, tag) {
  const previa = Number(await f.registry.call("policyVersionOf", [assetId]));
  const contenido = H.keccak256(
    H.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32"],
      [POLICY_SCOPE_PASSPORT, policyKind, newPolicyId],
    ),
  );
  const payload = await OA.orden({
    verifyingContract: f.registry.address,
    action: H.b32("SET_POLICY"),
    assetId,
    amount: String(previa),
    amountSecondary: String(previa + 1),
    nonce: nonceUnico(tag || "pas"),
    evidenceRoot: contenido,
  });
  const d = OA.digestDe(payload);
  await OA.aprobar(f, d, H.b32("SET_POLICY"));
  return await f.registry.send(
    "updatePolicy",
    [assetId, policyKind, newPolicyId, OA.tupla(payload), d],
    f.board,
  );
}

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
  // CUATRO firmantes, no tres. Con tres y un quórum de upgrade de tres, la
  // separación de funciones hacía inejecutable la propia acción: el proponente no
  // cuenta como aprobador, así que quedaban dos aprobadores posibles para un
  // quórum de tres. El número de firmantes es un parámetro del fixture, no una
  // recomendación; lo que la prueba exige es que el quórum se pueda alcanzar SIN
  // que nadie cuente dos veces.
  const signers = [acc[1], acc[2], acc[3], acc[8]].slice().sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  const treasury = acc[4];
  const alice = acc[5];
  const bob = acc[6];
  const mallory = acc[7]; // sin alta en ningún propósito: fuente desconocida, no "denegado por política"

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
  // P03 · se suman el registro, el motor de elegibilidad y el registro de
  // migraciones: los tres ejecutan ahora acciones del §12.5 (SET_POLICY sobre el
  // pasaporte, SET_POLICY sobre la elegibilidad y MIGRATION_CLAIM) y por tanto
  // tienen que poder GASTAR la aprobación que ya alcanzó quórum.
  for (const ejecutor of [assetNew, assetOld, issuance, settlement, registry, engine, migration]) {
    await governance.send("grantRole", [await governance.call("TECH_OPS"), ejecutor.address], board);
  }
  // Cableado de gobierno en las piezas que lo reciben después del despliegue.
  await registry.send("setGovernanceController", [governance.address], board);
  await migration.send("setGovernanceController", [governance.address], board);

  // --- catálogo
  await registry.send("registerAsset", [passport(ASSET_NEW)], board);
  await registry.send("registerAsset", [passport(ASSET_OLD)], board);

  // --- políticas por acción para AMBOS activos: ninguna clase "pasa automáticamente".
  //     Cada una con su doble control (P03/§12.5): quien propone no aprueba.
  const fParcial = { engine, registry, governance, signers, board };
  for (const assetId of [ASSET_NEW, ASSET_OLD]) {
    for (const action of ACTIONS) {
      await fijarPolitica(fParcial, assetId, H.b32(action), policy({}), "base");
    }
  }

  // --- identidad: compromisos POR PROPÓSITO, nunca la referencia del sujeto y
  //     nunca datos personales. `mallory` queda sin alta a propósito.
  for (const [quien, dir] of [["treasury", treasury], ["alice", alice], ["bob", bob]]) {
    await identity.send(
      "bindPurposeCommitment",
      [dir, PURPOSE_BASE, compromiso(SUBJ[quien], PURPOSE_BASE, SALT[quien])],
      board,
    );
  }

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
    SUBJ, SALT, PURPOSE_BASE,
    issuance, vault, settlement, migration, fee,
    ASSET_NEW, ASSET_OLD, ASSET_CASH, GOV,
  };
}

/** Registra una attestation firmada. Existe para que las pruebas que recorren
 *  los logs puedan hacerlo sobre el caso REAL, con attestations dentro, y no
 *  sobre un contrato al que nadie ha atestado nada todavía. */
const ATT_TYPES = {
  Attestation: [
    { name: "attestationId", type: "bytes32" },
    { name: "subjectCommitment", type: "bytes32" },
    { name: "purpose", type: "bytes32" },
    { name: "claimsRoot", type: "bytes32" },
    { name: "validFrom", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "policyVersion", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
};

async function atestar(f, o) {
  const opts = o || {};
  const cid = await H.chainId();
  const ts = await H.now();
  const att = {
    attestationId: opts.attestationId || H.b32("att_log"),
    subjectCommitment: opts.subjectCommitment,
    purpose: opts.purpose,
    claimsRoot: H.b32("claims_root"),
    validFrom: ts - 10,
    validUntil: ts + 3600,
    policyVersion: H.b32("pol_v1"),
  };
  const domain = {
    name: "SFSPIdentityAdapter",
    version: "draft-0.3",
    chainId: cid,
    verifyingContract: f.identity.address,
  };
  const message = Object.assign({}, att, {
    validFrom: String(att.validFrom),
    validUntil: String(att.validUntil),
    chainId: String(cid),
    verifyingContract: f.identity.address,
  });
  const sig = await H.signTypedData(f.board, domain, ATT_TYPES, "Attestation", message);
  await f.identity.send("recordAttestation", [att, sig], f.board);
  return att;
}

module.exports = {
  deployAll, passport, policy, ACTIONS,
  compromiso, atestar, fijarPolitica, actualizarPoliticaPasaporte, digestPolitica, nonceUnico,
  SUBJ, SALT, PURPOSE_BASE, COMMITMENT_TAG,
  Legal, Admission, Trading, Transferability, Redemption, Visibility,
  Profile, Kind, Risk, Report, Supply, Axis, CODE,
  ASSET_NEW, ASSET_OLD, ASSET_CASH, GOV,
};
