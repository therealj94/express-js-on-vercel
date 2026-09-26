/* El oráculo único de oro y plata (lib/oraculo.js) visto desde la wallet.
 *
 *   node --test pruebas/probar-oraculo.mjs
 *
 *   · lib/oraculo.js es el MISMO archivo, byte a byte, que el de Ordenex
 *     (infra/ordenex-api/lib/oraculo.js). Si divergen, falla: dos oráculos son
 *     dos precios de ORIGEN. La batería completa del oráculo (caché, edad
 *     máxima, respaldo, historial) vive en ordenex-api/pruebas/probar-oraculo.mjs;
 *     aquí se repite lo esencial para que la wallet no dependa de otra carpeta.
 *   · lib/origenPrice.js consume el oráculo: el gramin por omisión, y sin dato
 *     fresco PRECIO_NO_DISPONIBLE, nunca un número inventado.
 *
 * Sin red: el fetch global se sustituye dentro del proceso hijo. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BABEL = path.join(RAIZ, "node_modules", ".bin", "babel-node");
const requerir = createRequire(path.join(RAIZ, "package.json"));
const oraculo = requerir("./lib/oraculo.js");

function correr(codigo, env = {}) {
  const r = spawnSync(BABEL, ["-e", codigo], {
    cwd: RAIZ,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: "utf8",
    timeout: 60000,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim().split("\n").pop();
}

// Un fetch fingido: CoinGecko contesta lo que se le diga, gold-api igual.
const fetchFingido = (cg, ga) => `
  globalThis.fetch = async (url) => {
    var cuerpo = String(url).includes('coingecko') ? ${JSON.stringify(cg)} : ${JSON.stringify(ga)};
    if (cuerpo === null) throw new Error('sin red');
    return { ok: true, json: async () => cuerpo };
  };`;

test("las dos copias del oráculo son idénticas byte a byte", () => {
  const aqui = fs.readFileSync(path.join(RAIZ, "lib", "oraculo.js"));
  const otra = path.resolve(RAIZ, "..", "ordenex-api", "lib", "oraculo.js");
  assert.ok(fs.existsSync(otra), `falta ${otra}`);
  assert.equal(
    Buffer.compare(aqui, fs.readFileSync(otra)),
    0,
    "lib/oraculo.js diverge entre veta-wallet-backend y ordenex-api: copie el bueno sobre el otro",
  );
});

test("la aritmética: gramin = gramo/55 y 1 AUKA = 1.710,69 gramin", () => {
  assert.equal(oraculo.ONZA_EN_GRAMOS, 31.1035);
  assert.equal(oraculo.GRAMOS_POR_ORIGEN, 55);
  assert.ok(Math.abs(oraculo.GRAMIN_POR_ONZA - 1710.6925) < 1e-9);
  assert.equal(oraculo.FRESCO_MS, 30_000);
  assert.equal(oraculo.EDAD_MAXIMA_MS, 600_000);
});

test("caché de 30 s, edad máxima de 10 min y después null", async () => {
  let t = 0;
  let resp = { oro: 4400, plata: 52 };
  const o = oraculo.crearOraculo({ fuentes: [{ nombre: "f", leer: async () => resp }], ahora: () => t });
  assert.equal((await o.metales()).oro, 4400);
  resp = null;
  t += 9 * 60_000;
  assert.equal((await o.metales()).oro, 4400);
  t += 61_000;
  assert.equal(await o.metales(), null);
  assert.equal(await o.precioOrigenUsd(), null);
  assert.equal(o.historial().length, 1);
});

test("origenPrice por omisión: el gramin que da el oráculo", () => {
  const out = correr(
    `${fetchFingido({ "pax-gold": { usd: 4400 }, "kinesis-silver": { usd: 52 } }, null)}
     require('./lib/origenPrice').default().then(p=>console.log(String(p)))`,
  );
  assert.ok(Math.abs(Number(out) - 4400 / 31.1035 / 55) < 1e-12, out);
});

test("origenPrice usa el respaldo cuando CoinGecko no llega", () => {
  const out = correr(
    `${fetchFingido(null, { price: 4500 })}
     require('./lib/origenPrice').default().then(p=>console.log(String(p)))`,
  );
  assert.ok(Math.abs(Number(out) - 4500 / 31.1035 / 55) < 1e-12, out);
});

test("sin ninguna fuente: PRECIO_NO_DISPONIBLE, no un precio inventado", () => {
  const out = correr(
    `${fetchFingido(null, null)}
     require('./lib/origenPrice').default().then(()=>console.log('SI')).catch(e=>console.log(e.code))`,
  );
  assert.equal(out, "PRECIO_NO_DISPONIBLE");
});
