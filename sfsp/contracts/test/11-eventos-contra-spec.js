"use strict";
/* H15 · compuerta mecánica: el ABI compilado contra `spec/eventos.json`.
 *
 * `spec/PENDIENTE-CONTRATOS-EVENTOS.md` dejaba esta comprobación anotada para
 * este lote. Hasta ahora había dos tablas escritas a mano —una en Solidity y
 * otra en el indexador— y nada obligaba a que coincidieran; escribir una tercera
 * a mano en una prueba habría repetido el mismo error. Por eso la prueba lee el
 * JSON, que es la fuente única, y compara campo a campo, tipo a tipo e
 * `indexed` a `indexed` contra el artefacto que produce el compilador.
 *
 * Un evento del §3 todavía sin contrato (`implementadoEnContratos: false`) no se
 * comprueba: no existe quien lo emita. Cuando se escriba, su firma tendrá que ser
 * exactamente la del JSON y esta prueba lo exigirá sola. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const hre = require("hardhat");

const RUTA = path.join(__dirname, "..", "..", "spec", "eventos.json");
const SPEC = JSON.parse(fs.readFileSync(RUTA, "utf8"));

// El JSON nombra al emisor sin el prefijo del proyecto.
const CONTRATO = {
  AssetRegistry: "SFSPAssetRegistry",
  GovernanceController: "SFSPGovernanceController",
  IssuanceController: "SFSPIssuanceController",
  RegulatedAsset: "SFSPRegulatedAsset",
  CashVault: "SFSPCashVault",
  SettlementEngine: "SFSPSettlementEngine",
  MigrationRegistry: "SFSPMigrationRegistry",
  DidRegistry: "SFSPDidRegistry",
  NativeVault: "SFSPNativeVault",
  // SFSP v0.3 fase 2 · 4, 5 y 6. El §3 del contrato interno nombra dos módulos
  // lógicos (ReserveEngine y CommodityEngine); los implementa un solo contrato.
  OracleRegistry: "SFSPOracleRegistry",
  ReserveEngine: "SFSPReserveEngine",
  CommodityEngine: "SFSPReserveEngine",
  TreasuryDesk: "SFSPTreasuryDesk",
  // SFSP v0.3 fase 2 · registro de licencias y motor de elegibilidad.
  LicenseRegistry: "SFSPLicenseRegistry",
  EligibilityEngine: "SFSPEligibilityEngine",
  // SFSP-150 · red cerrada.
  NetworkAdmission: "SFSPNetworkPermissions",
};

describe("H15 · el ABI compilado coincide con spec/eventos.json", function () {
  const implementados = SPEC.eventos.filter((e) => e.implementadoEnContratos === true);

  it("H15 positivo: hay eventos implementados que comprobar (una lista vacía no es un verde)", function () {
    assert.ok(implementados.length >= 10, "se esperaban al menos diez eventos implementados");
  });

  for (const ev of implementados) {
    it("H15 positivo: " + ev.nombre + " en " + ev.emisor + " coincide campo a campo", async function () {
      const nombreContrato = CONTRATO[ev.emisor];
      assert.ok(nombreContrato, "emisor sin contrato conocido: " + ev.emisor);
      const art = await hre.artifacts.readArtifact(nombreContrato);
      const abi = art.abi.find((x) => x.type === "event" && x.name === ev.nombre);
      assert.ok(abi, ev.nombre + " no existe en el ABI de " + nombreContrato);

      assert.deepEqual(
        abi.inputs.map((i) => i.name),
        ev.campos.map((c) => c.nombre),
        ev.nombre + ": el orden o los nombres de los campos no coinciden con la fuente única",
      );
      assert.deepEqual(
        abi.inputs.map((i) => i.type),
        ev.campos.map((c) => c.tipo),
        ev.nombre + ": los tipos no coinciden",
      );
      assert.deepEqual(
        abi.inputs.map((i) => !!i.indexed),
        ev.campos.map((c) => !!c.indexado),
        ev.nombre + ": los campos indexados no coinciden",
      );
    });
  }

  it("H15 negativo: un alias retirado no vuelve a aparecer en ningún ABI", async function () {
    // `UnitsMinted` se retiró y su nombre no se reutiliza para otro significado.
    for (const alias of Object.keys(SPEC.aliasesRetirados || {})) {
      for (const nombre of Object.values(CONTRATO)) {
        const art = await hre.artifacts.readArtifact(nombre);
        const hay = art.abi.find((x) => x.type === "event" && x.name === alias);
        assert.equal(hay, undefined, "el alias retirado " + alias + " reaparece en " + nombre);
      }
    }
  });

  it("H15 negativo: ningún evento del JSON supera tres campos indexados", function () {
    for (const ev of SPEC.eventos) {
      const n = ev.campos.filter((c) => c.indexado).length;
      assert.ok(n <= 3, ev.nombre + " declara " + n + " campos indexados y Solidity admite tres");
    }
  });

  // ESTADOS-Y-EVENTOS.md §B repetía a mano los recuentos del JSON y se quedó
  // atrás dos versiones. Ahora esta prueba los lee del documento y los compara.
  it("H15 · ESTADOS-Y-EVENTOS §B: la tabla del Apéndice B y los recuentos coinciden con el JSON", function () {
    const doc = fs.readFileSync(path.join(__dirname, "..", "..", "spec", "ESTADOS-Y-EVENTOS.md"), "utf8");
    const b = doc.slice(doc.indexOf("## B ·"), doc.indexOf("## C ·"));
    assert.ok(b.length > 0, "no se encuentra la sección B");
    const porNombre = new Map(SPEC.eventos.map((e) => [e.nombre, e]));
    const nombres = new Set();
    let filas = 0;
    for (const linea of b.split("\n")) {
      const m = /^\| (\d+) \| [^|]+ \| `([A-Za-z]+)`[^|]* \| ([^|]+) \|$/.exec(linea);
      if (!m) continue;
      filas++;
      const ev = porNombre.get(m[2]);
      assert.ok(ev, "fila " + m[1] + ": " + m[2] + " no está en eventos.json");
      const conContrato = m[3].trim().startsWith("✅");
      assert.equal(conContrato, ev.implementadoEnContratos === true, "fila " + m[1] + ": " + m[2] + " dice «" + m[3].trim() + "»");
      nombres.add(m[2]);
    }
    assert.equal(filas, 28, "el Apéndice B tiene 28 filas");
    const con = [...nombres].filter((n) => porNombre.get(n).implementadoEnContratos === true).length;
    const ap = /de esos (\d+), \*\*(\d+)\*\* los emite un contrato y \*\*(\d+)\*\*/.exec(b);
    assert.ok(ap, "falta el recuento del Apéndice B");
    assert.deepEqual([+ap[1], +ap[2], +ap[3]], [nombres.size, con, nombres.size - con]);
    const tot = /Total en `eventos\.json` \(([^)]+)\): \*\*(\d+) eventos\*\*, (\d+) con contrato y (\d+) sin contrato/.exec(b);
    assert.ok(tot, "falta el total de eventos.json");
    const impl = SPEC.eventos.filter((e) => e.implementadoEnContratos === true).length;
    assert.deepEqual([tot[1], +tot[2], +tot[3], +tot[4]], [SPEC.version, SPEC.eventos.length, impl, SPEC.eventos.length - impl]);
    assert.ok(doc.includes("| Estado | `" + SPEC.version + "` |"), "la cabecera no está en " + SPEC.version);
  });
});
