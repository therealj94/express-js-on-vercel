"use strict";
/* SFSP-410 / SFSP-700 · El padrón que construye sfsp/migracion-410 lo acepta
 * SFSPMigrationRegistry tal cual.
 *
 * Todo es SINTÉTICO: cuentas de hardhat y direcciones inventadas de relleno.
 * Se importa la MISMA biblioteca que usa construir-padron.mjs (no una copia),
 * así que si el formato de hoja o de árbol divergiera del contrato, esta prueba
 * falla. Cubre:
 *   · hoja byte a byte = leafOf del contrato; raíz = helpers.merkleTree;
 *   · un claim con la prueba del constructor se acepta (árbol impar y de 1 hoja);
 *   · quien no está en el padrón, o está con otras unidades, no reclama (BadProof);
 *   · una cuenta interna que el constructor excluye no reclama aunque tenga saldo;
 *   · reserva por ranura: la regla keccak(abi.encode(dir, 0)) y la SEGUNDA raíz
 *     diferida (cerrar M1, abrir M2 sobre el mismo origen) sin doble derecho. */
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const F = require("./fixture");
const H = require("./helpers");
const OA = require("./orden-autorizada");

const LIB = pathToFileURL(join(__dirname, "..", "..", "migracion-410", "lib", "comun.mjs")).href;
const MODE = { FROZEN_SNAPSHOT: 0, SURRENDER_ON_CLAIM: 1 };
const RATIO = [1, 1];

const CLAIM_TYPES = {
  MigrationClaim: [
    { name: "migrationId", type: "bytes32" },
    { name: "beneficiary", type: "address" },
    { name: "oldUnits", type: "uint256" },
    { name: "ratioNum", type: "uint256" },
    { name: "ratioDen", type: "uint256" },
    { name: "sourceChainId", type: "uint256" },
    { name: "targetChainId", type: "uint256" },
    { name: "registry", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "expiry", type: "uint64" },
  ],
};

// Relleno sintético (no son direcciones de nadie).
const RELLENO = ["0x00000000000000000000000000000000000a11ce", "0x0000000000000000000000000000000000000b0b", "0x000000000000000000000000000000000000dead"];
const E18 = 10n ** 18n;

describe("SFSP-700 · padrón de migración-410 aceptado por SFSPMigrationRegistry", function () {
  let C, f, expiry;

  before(async function () {
    C = await import(LIB);
  });

  beforeEach(async function () {
    f = await F.deployAll();
    expiry = (await H.now()) + 3600;
    // Saldos viejos con 18 decimales y un wei suelto, como en los tokens reales.
    await f.assetOld.send("mintFromIssuance", [f.alice, String(5n * E18 + 1n), H.b32("op_18_a")], f.board);
    await f.assetOld.send("mintFromIssuance", [f.bob, String(4n * E18), H.b32("op_18_b")], f.board);
    await f.assetOld.send("mintFromIssuance", [f.treasury, String(7n * E18), H.b32("op_18_t")], f.board);
  });

  const migId = (t) => C.idMigracion("SINTETICO", "0x0000000000000000000000000000000000000001", t).bytes32;

  async function abrir(id, raiz, s0) {
    await f.migration.send(
      "openMigration",
      [id, MODE.SURRENDER_ON_CLAIM, f.assetOld.address, f.assetNew.address, raiz, RATIO[0], RATIO[1], expiry, String(s0)],
      f.board,
    );
  }

  async function firmar(c) {
    const cid = await H.chainId();
    return await H.signTypedData(f.board, { name: "SFSPMigrationRegistry", version: "draft-0.3", chainId: cid, verifyingContract: f.migration.address }, CLAIM_TYPES, "MigrationClaim", {
      migrationId: c.migrationId, beneficiary: c.beneficiary, oldUnits: String(c.oldUnits), ratioNum: String(RATIO[0]), ratioDen: String(RATIO[1]),
      sourceChainId: String(cid), targetChainId: String(cid), registry: f.migration.address, nonce: c.nonce, expiry: String(c.expiry),
    });
  }

  /** Claim completo: firma del atestador + orden aprobada por gobierno. */
  async function reclamar(id, raiz, beneficiary, oldUnits, proof, nonceTag) {
    const c = { migrationId: id, beneficiary, oldUnits: String(oldUnits), nonce: H.b32(nonceTag), expiry };
    const p = await OA.orden({
      verifyingContract: f.migration.address, action: H.b32("MIGRATION_CLAIM"), assetId: f.ASSET_OLD,
      destination: beneficiary, amount: String(oldUnits), nonce: c.nonce, evidenceRoot: raiz,
    });
    const d = OA.digestDe(p);
    await OA.aprobar(f, d, H.b32("MIGRATION_CLAIM"));
    return await f.migration.send("claim", [c, proof, await firmar(c), OA.tupla(p), d], f.board);
  }

  it("formato: la hoja del constructor es byte a byte leafOf del contrato, y el árbol el de helpers", async function () {
    const id = migId(1);
    const casos = [[f.alice, 5n * E18 + 1n], [f.bob, 4n * E18], [RELLENO[0], 1n], [RELLENO[1], 10n ** 30n], [RELLENO[2], 3n * E18 + 1n]];
    for (const [a, u] of casos) {
      assert.equal(C.hojaMigracion(id, a, u), await f.migration.call("leafOf", [id, a, String(u)]));
      assert.equal(C.hojaMigracion(id, a, u), H.merkleLeaf(id, a, String(u)));
    }
    const t = C.construirArbol(casos.map(([address, oldUnits]) => ({ address, oldUnits })), id);
    assert.equal(t.raiz, H.merkleTree(t.entradas.map((e) => e.hoja)).root, "misma raíz que helpers.merkleTree en el mismo orden");
    for (const e of t.entradas) assert.deepEqual(e.prueba, H.merkleProof(H.merkleTree(t.entradas.map((x) => x.hoja)), e.indice));
    // Reproducible: el orden de entrada no cambia la raíz.
    const t2 = C.construirArbol(casos.slice().reverse().map(([address, oldUnits]) => ({ address, oldUnits })), id);
    assert.equal(t2.raiz, t.raiz);
  });

  it("positivo: con la raíz y las pruebas del constructor (árbol impar) reclaman los listados", async function () {
    const id = migId(2);
    const t = C.construirArbol([
      { address: f.alice, oldUnits: 5n * E18 + 1n }, { address: f.bob, oldUnits: 4n * E18 },
      { address: RELLENO[0], oldUnits: 1n }, { address: RELLENO[1], oldUnits: 2n }, { address: RELLENO[2], oldUnits: 3n },
    ], id);
    await abrir(id, t.raiz, 9n * E18 + 7n);
    for (const quien of [f.alice, f.bob]) {
      const e = t.entradas.find((x) => x.address === quien);
      assert.ok(C.verificarPrueba(e.prueba, t.raiz, e.hoja));
      await reclamar(id, t.raiz, quien, e.oldUnits, e.prueba, "n18_" + quien.slice(2, 8));
      assert.equal((await f.assetNew.call("balanceOf", [quien])).toString(), e.oldUnits.toString());
    }
    const r = await f.migration.call("reconcile", [id]);
    assert.equal(r[5], true, "S0 = A + N + P");
  });

  it("positivo: un padrón de una sola persona (prueba vacía) también se acepta", async function () {
    const id = migId(3);
    const t = C.construirArbol([{ address: f.bob, oldUnits: 4n * E18 }], id);
    assert.deepEqual(t.entradas[0].prueba, []);
    await abrir(id, t.raiz, 4n * E18);
    await reclamar(id, t.raiz, f.bob, 4n * E18, [], "n18_uno");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), String(4n * E18));
  });

  it("negativo: quien no está en el padrón, o pide otras unidades, no reclama", async function () {
    const id = migId(4);
    const t = C.construirArbol([{ address: f.alice, oldUnits: 5n * E18 + 1n }, { address: f.bob, oldUnits: 4n * E18 }], id);
    await abrir(id, t.raiz, 9n * E18 + 1n);
    const pa = t.entradas.find((x) => x.address === f.alice).prueba;
    await f.assetOld.send("mintFromIssuance", [f.bob, "1", H.b32("op_18_extra")], f.board);
    // bob con la prueba de alice y sus propias unidades: no.
    await H.expectRevert(reclamar(id, t.raiz, f.bob, 4n * E18, pa, "n18_x1"), "BadProof");
    // alice pidiendo 1 wei de más: no.
    await H.expectRevert(reclamar(id, t.raiz, f.alice, 5n * E18, pa, "n18_x2"), "BadProof");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), "0");
  });

  it("negativo: una cuenta interna que el constructor excluye no reclama aunque tenga saldo", async function () {
    const id = migId(5);
    const internas = new Map([[f.treasury.toLowerCase(), ["interna sintética"]]]);
    const { beneficiarios, excluidos } = C.separarInternas([
      { address: f.alice.toLowerCase(), oldUnits: 5n * E18 + 1n },
      { address: f.treasury.toLowerCase(), oldUnits: 7n * E18 },
      { address: f.bob.toLowerCase(), oldUnits: 4n * E18 },
    ], internas);
    assert.equal(excluidos.length, 1);
    assert.equal(excluidos[0].address, f.treasury.toLowerCase());
    const t = C.construirArbol(beneficiarios, id);
    await abrir(id, t.raiz, 9n * E18 + 1n);
    // Ni con la prueba de otro ni con prueba vacía.
    for (const [k, pr] of [[0, t.entradas[0].prueba], [1, t.entradas[1].prueba], [2, []]]) {
      await H.expectRevert(reclamar(id, t.raiz, f.treasury, 7n * E18, pr, "n18_int" + k), "BadProof");
    }
    assert.equal((await f.assetOld.call("balanceOf", [f.treasury])).toString(), String(7n * E18), "no se le quemó nada");
    assert.equal((await f.assetNew.call("balanceOf", [f.treasury])).toString(), "0");
  });

  it("reserva por ranura: la dirección prueba su ranura y reclama en una SEGUNDA raíz, sin doble derecho", async function () {
    const id1 = migId(6), id2 = migId(7);
    // bob «no tiene dirección conocida»: sólo se conoce su ranura de saldo.
    const ranura = C.ranuraDeSaldo(f.bob, 0);
    const huella = C.huellaDeRanura(ranura);
    assert.ok(C.direccionCorrespondeAClave(f.bob, "ranura:" + ranura));
    assert.ok(C.direccionCorrespondeAClave(f.bob, "huella:" + huella));
    assert.ok(!C.direccionCorrespondeAClave(f.alice, "ranura:" + ranura));
    // Un permiso (allowance, ranura 1 anidada) nunca pasa la regla de saldo.
    const permiso = H.keccak256(H.defaultAbiCoder.encode(["address", "bytes32"], [f.alice, H.keccak256(H.defaultAbiCoder.encode(["address", "uint256"], [f.bob, 1]))]));
    assert.ok(!C.direccionCorrespondeAClave(f.bob, "ranura:" + permiso));

    // M1: sólo alice; la reserva de bob va en una raíz aparte que NO entra en openMigration.
    const t1 = C.construirArbol([{ address: f.alice, oldUnits: 5n * E18 + 1n }], id1);
    const raizReserva = C.hojaReserva(id1, "ranura:" + ranura, 4n * E18);
    assert.notEqual(raizReserva, t1.raiz);
    await abrir(id1, t1.raiz, 5n * E18 + 1n);
    await reclamar(id1, t1.raiz, f.alice, 5n * E18 + 1n, [], "n18_m1a");
    // Con la migración abierta, bob no puede reclamar en M1: no está en su raíz.
    await H.expectRevert(reclamar(id1, t1.raiz, f.bob, 4n * E18, [], "n18_m1b"), "BadProof");

    // M2 sobre el mismo origen: no se puede abrir con M1 abierta…
    const t2 = C.construirArbol([{ address: f.alice, oldUnits: 5n * E18 + 1n }, { address: f.bob, oldUnits: 4n * E18 }], id2);
    await H.expectRevert(abrir(id2, t2.raiz, 9n * E18 + 1n), "SourceAlreadyMigrating");
    // …se cierra M1 (cerrar no extingue derechos) y se abre M2 con lo no reclamado + lo resuelto.
    await f.migration.send("closeMigration", [id1, H.b32("SEGUNDA_RAIZ_RESERVA")], f.board);
    await abrir(id2, t2.raiz, 9n * E18 + 1n);
    const eb = t2.entradas.find((x) => x.address === f.bob);
    await reclamar(id2, t2.raiz, f.bob, 4n * E18, eb.prueba, "n18_m2b");
    assert.equal((await f.assetNew.call("balanceOf", [f.bob])).toString(), String(4n * E18));
    // alice ya reclamó en M1: el nullifier es global por (origen, titular).
    await f.assetOld.send("mintFromIssuance", [f.alice, String(5n * E18 + 1n), H.b32("op_18_a2")], f.board);
    const ea = t2.entradas.find((x) => x.address === f.alice);
    await H.expectRevert(reclamar(id2, t2.raiz, f.alice, 5n * E18 + 1n, ea.prueba, "n18_m2a"), "NullifierUsed");
  });
});
