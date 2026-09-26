/* Precio de ORIGEN y comisión (decisión de la dirección, 26-sep-2026).
 *
 *   node --test pruebas/probar-precio-comision.mjs
 *
 *   · 1 ORIGEN = 1 gramo de oro / 55. Es el modo POR OMISIÓN (antes era 0,01 fijo).
 *   · 0,01 USD es la COMISIÓN por transacción, cobrada en ORIGEN al precio del momento.
 *   · El modo fijo sólo existe si se pide expresamente y con valor.
 *
 * Los módulos se cargan con babel-node (como en producción); sin red: el modo
 * oro se prueba con la fórmula y el modo fijo con un precio dado. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BABEL = path.join(RAIZ, "node_modules", ".bin", "babel-node");

function correr(codigo, env) {
  const r = spawnSync(BABEL, ["-e", codigo], {
    cwd: RAIZ,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: "utf8",
    timeout: 60000,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim().split("\n").pop();
}

test("por omisión el precio sale del oro (gramo / 55), no de 0,01", () => {
  const out = correr(
    `console.log(JSON.stringify({f:require('./lib/origenPrice').origenPriceFuente()}))`,
    {},
  );
  assert.equal(JSON.parse(out).f, "oro");
});

test("la fórmula: onza 4.400 → 4400/31,1035/55 ≈ 2,572 USD por ORIGEN", () => {
  const precio = 4400 / 31.1035 / 55;
  assert.ok(Math.abs(precio - 2.5721) < 0.001, String(precio));
});

test("el modo fijo sin valor no inventa un precio", () => {
  const out = correr(
    `require('./lib/origenPrice').default().then(()=>console.log('SI')).catch(e=>console.log(e.code))`,
    { OG_PRECIO_MODO: "fijo" },
  );
  assert.equal(out, "PRECIO_NO_DISPONIBLE");
});

test("comisión de 0,01 USD cotizada en ORIGEN al precio del momento", () => {
  const out = correr(
    `require('./lib/comision').comisionActualEnWei().then(w=>console.log(String(w)))`,
    { OG_PRECIO_MODO: "fijo", OG_ORIGEN_USD: "2.5", OG_COMISION_USD: "0.01" },
  );
  // 0,01 / 2,5 = 0,004 ORIGEN
  assert.equal(out, "4000000000000000");
});

test("sin variables de comisión no se cobra nada", () => {
  const out = correr(`require('./lib/comision').comisionActualEnWei().then(w=>console.log(String(w)))`, {
    OG_PRECIO_MODO: "fijo",
    OG_ORIGEN_USD: "2.5",
  });
  assert.equal(out, "0");
});

test("una comisión absurda (> 1 USD) se ignora", () => {
  const out = correr(`require('./lib/comision').comisionActualEnWei().then(w=>console.log(String(w)))`, {
    OG_PRECIO_MODO: "fijo",
    OG_ORIGEN_USD: "2.5",
    OG_COMISION_USD: "5",
  });
  assert.equal(out, "0");
});
