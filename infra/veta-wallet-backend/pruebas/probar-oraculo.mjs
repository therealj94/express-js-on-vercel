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

// Un fetch fingido: el spot de Londres (gold-api) y el fijo de la LBMA
// contestan lo que se les diga; null es «sin red».
const fetchFingido = (spot, lbma = null) => `
  globalThis.fetch = async (url) => {
    var cuerpo = String(url).includes('lbma') ? ${JSON.stringify(lbma)} : ${JSON.stringify(spot)};
    if (cuerpo === null) throw new Error('sin red');
    return { ok: true, json: async () => cuerpo };
  };`;
const hoy = new Date().toISOString().slice(0, 10);

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

test("una lectura con una sola pata no borra el oro bueno de hace segundos", async () => {
  // Antes la lectura a medias sustituía la caché entera: sin oro 30 s y la
  // wallet contestaba PRECIO_NO_DISPONIBLE en depósitos y canjes.
  let t = 0;
  let resp = { oro: 4400, plata: 52 };
  const o = oraculo.crearOraculo({ fuentes: [{ nombre: "f", leer: async () => resp }], ahora: () => t });
  await o.metales();
  t += 31_000;
  resp = { oro: null, plata: 53 };
  const m = await o.metales();
  assert.equal(m.oro, 4400);
  assert.equal(m.plata, 53);
  assert.equal(m.enOro, 0);
  assert.equal(m.enPlata, 31_000);
  assert.equal(m.en, 0, "`en` es la hora de la pata más vieja que se sirve");
  assert.ok(Math.abs((await o.precioOrigenUsd()) - 4400 / 31.1035 / 55) < 1e-12);
  // El oro conservado caduca a los 10 min de SU lectura.
  t = 10 * 60_000;
  assert.equal((await o.metales()).oro, null);
  assert.equal(await o.precioOrigenUsd(), null);
});

test("origenPrice por omisión: el gramin del spot de Londres, dentro del fijo LBMA", () => {
  const out = correr(
    `${fetchFingido({ price: 4400 }, [{ d: hoy, v: [4380, 0, 0] }])}
     require('./lib/origenPrice').default().then(p=>console.log(String(p)))`,
  );
  assert.ok(Math.abs(Number(out) - 4400 / 31.1035 / 55) < 1e-12, out);
});

test("un spot que se aparta más del 5 % del fijo LBMA se descarta: sin precio", () => {
  const out = correr(
    `${fetchFingido({ price: 5000 }, [{ d: hoy, v: [4300, 0, 0] }])}
     require('./lib/origenPrice').default().then(()=>console.log('SI')).catch(e=>console.log(e.code))`,
  );
  assert.equal(out, "PRECIO_NO_DISPONIBLE");
});

test("sin la LBMA el spot de Londres se sirve igual (rotulado sin-fijo)", async () => {
  let t = Date.now();
  const o = oraculo.crearOraculo({
    fuentes: [{ nombre: "londres-spot", leer: async () => ({ oro: 4400, plata: 52 }) }],
    fijo: async () => null,
    ahora: () => t,
  });
  assert.equal((await o.metales()).oro, 4400);
  assert.equal(o.historial()[0].londres.oro, "sin-fijo");
});

test("la guarda de Londres: fijo vigente acepta dentro del 5 % y descarta fuera", async () => {
  const t = Date.parse(hoy);
  let spot = 4400;
  const o = oraculo.crearOraculo({
    fuentes: [{ nombre: "londres-spot", leer: async () => ({ oro: spot, plata: null }) }],
    fijo: async (m) => (m === "oro" ? { valor: 4300, dia: t } : null),
    ahora: () => t,
  });
  assert.equal((await o.metales()).oro, 4400);
  assert.equal(o.historial()[0].londres.oro, "dentro");
  const o2 = oraculo.crearOraculo({
    fuentes: [{ nombre: "londres-spot", leer: async () => ({ oro: 4600, plata: null }) }],
    fijo: async () => ({ valor: 4300, dia: t }),
    ahora: () => t,
  });
  assert.equal(await o2.metales(), null);
  assert.equal(o2.descartados()[0].metal, "oro");
  // Un fijo de hace más de 5 días no sirve de guarda.
  const o3 = oraculo.crearOraculo({
    fuentes: [{ nombre: "londres-spot", leer: async () => ({ oro: 4600, plata: null }) }],
    fijo: async () => ({ valor: 4300, dia: t - 6 * 86_400_000 }),
    ahora: () => t,
  });
  assert.equal((await o3.metales()).oro, 4600);
});

test("el oráculo ya no lee CoinGecko ni ningún token como precio del oro", () => {
  const codigo = fs.readFileSync(path.join(RAIZ, "lib", "oraculo.js"), "utf8");
  assert.ok(!/coingecko|pax-gold|kinesis/i.test(codigo.replace(/^\/\/.*$/gm, "")), "quedó una fuente que no es Londres");
});

test("sin ninguna fuente: PRECIO_NO_DISPONIBLE, no un precio inventado", () => {
  const out = correr(
    `${fetchFingido(null, null)}
     require('./lib/origenPrice').default().then(()=>console.log('SI')).catch(e=>console.log(e.code))`,
  );
  assert.equal(out, "PRECIO_NO_DISPONIBLE");
});
