/* bin/comprobar-recarga.mjs cotiza el ORIGEN como el backend.
 *
 *   node --test pruebas/probar-comprobar-recarga.mjs
 *
 * El comprobador de recargas (herramienta de soporte, sólo lee) existe para
 * que la cifra en ORIGEN que ve soporte sea LA MISMA que ve la persona en su
 * app. Tenía el modo `fijo` por omisión y caía a 0,01 USD por ORIGEN: una
 * tarjeta con 100 USD salía como 10.000 ORIGEN mientras la app enseñaba
 * ~38,9. Desde el 26-sep el backend (lib/origenPrice.js) usa el gramin por
 * omisión, `fijo` sólo con OG_PRECIO_MODO=fijo y OG_ORIGEN_USD, y los
 * 0,01 USD son la comisión, no el precio.
 *
 * Se ejecuta el script de verdad en un proceso hijo con un fetch fingido
 * (--import): sin red, sin CryptoMate y sin cadena.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "recarga-"));
const FALSO = path.join(DIR, "fetch-falso.mjs");
fs.writeFileSync(
  FALSO,
  `const cfg = JSON.parse(process.env.FALSO_CFG || "{}");
const r = (cuerpo) => ({ ok: true, status: 200, json: async () => cuerpo });
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("api.cryptomate.me")) {
    if (u.endsWith("/cards/virtual-cards/list"))
      return r([{ id: "c1", last4: "1234", card_holder_name: "Prueba", status: "ACTIVE", meta: {} }]);
    if (u.endsWith("/virtual-balances")) return r({ available_credit: 100 });
    if (u.endsWith("/top-up")) return r([]);
  }
  if (u.includes("/mercados")) {
    if (cfg.ordenex == null) throw new Error("sin red");
    return r([{ referencia: { origenUsd: cfg.ordenex } }]);
  }
  if (u.includes("coingecko")) {
    if (cfg.coingecko == null) throw new Error("sin red");
    return r({ "pax-gold": { usd: cfg.coingecko }, "kinesis-silver": { usd: 52 } });
  }
  if (u.includes("gold-api")) {
    if (cfg.goldapi == null) throw new Error("sin red");
    return r({ price: cfg.goldapi });
  }
  throw new Error("red prohibida en la prueba: " + u);
};
`,
);

function correr(cfg, env = {}) {
  const r = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(FALSO).href, path.join("bin", "comprobar-recarga.mjs"), "1234"],
    {
      cwd: RAIZ,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, CRYPTOMATE_API_KEY: "prueba", FALSO_CFG: JSON.stringify(cfg), ...env },
      encoding: "utf8",
      timeout: 60000,
    },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout;
}

// 100 USD con el oro a 4.400: 100 / (4400 / 31,1035 / 55) = 38,8794 ORIGEN.
const GRAMIN_4400 = "38.8794";

test("sin OG_PRECIO_MODO: el gramin, no 0,01 USD fijo", () => {
  const out = correr({ goldapi: 4400 });
  assert.match(out, new RegExp(`en ORIGEN\\s+: ${GRAMIN_4400}`), out);
  assert.doesNotMatch(out, /10000\.0000|0\.010000|· fijo/, out);
});

test("modo oro con OG_ORIGEN_USD=0,01 puesta: se ignora, como en el backend", () => {
  const out = correr({ ordenex: 2.5 }, { OG_PRECIO_MODO: "oro", OG_ORIGEN_USD: "0.01" });
  assert.match(out, /en ORIGEN\s+: 40\.0000/, out);
  assert.doesNotMatch(out, /10000\.0000/, out);
});

test("Ordenex caído: el oráculo único lee el spot de Londres (gold-api)", () => {
  const out = correr({ goldapi: 4400 });
  assert.match(out, new RegExp(`en ORIGEN\\s+: ${GRAMIN_4400}`), out);
});

test("modo fijo pedido expresamente, con OG_ORIGEN_USD", () => {
  const out = correr({}, { OG_PRECIO_MODO: "fijo", OG_ORIGEN_USD: "2.5" });
  assert.match(out, /en ORIGEN\s+: 40\.0000\s+\(a 2\.500000 USD por ORIGEN · fijo/, out);
});

test("modo fijo sin OG_ORIGEN_USD: se dice que no hay precio, no 0,01", () => {
  const out = correr({ goldapi: 4400 }, { OG_PRECIO_MODO: "fijo" });
  assert.match(out, /NO se pudo leer el precio de ORIGEN/, out);
  assert.doesNotMatch(out, /en ORIGEN\s+:/, out);
});

test("sin ninguna fuente: se dice que no hay precio, sin cifra en ORIGEN", () => {
  const out = correr({});
  assert.match(out, /NO se pudo leer el precio de ORIGEN/, out);
  assert.doesNotMatch(out, /en ORIGEN\s+:/, out);
  assert.match(out, /saldo de la tarjeta : \$100\.00/, out);
});

test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));
