/* LA TARJETA SIN PRECIO: guion, jamás un precio inventado.
 *
 *   node --test pruebas/probar-tarjeta-sin-precio.mjs
 *
 * getMyCard y el historial de la tarjeta convierten a ORIGEN lo que CryptoMate
 * da en dólares. Cuando el oráculo no tenía dato (feeds caídos más de 10 min)
 * caían a `OG_TOKEN_PRICE_USD || 1`: 1 USD por ORIGEN en vez del gramin
 * (~2,57), y 100 USD salían como 100 ORIGEN — 2,57 veces lo que hay. Con
 * OG_TOKEN_PRICE_USD=0,01 (la decisión vieja) serían 257 veces. SFSP v0.3
 * §10.5 y el plan (C5): sin dato fresco, guion. Las apps ya pintan «—» cuando
 * el campo viene null.
 *
 * Se prueba EL archivo: las dos funciones se sacan de cardController.js y se
 * ejecutan con dobles, sin Express, sin Mongo y sin red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE = fs.readFileSync(path.join(RAIZ, "controller", "cardController.js"), "utf8");

function sacar(nombre, deps) {
  const i = FUENTE.indexOf(`export const ${nombre} = async`);
  assert.ok(i > -1, `no encontré ${nombre} en cardController.js`);
  const j = FUENTE.indexOf("\nexport const", i + 10);
  const trozo = FUENTE.slice(i, j).replace(/^export /, "");
  const nombres = Object.keys(deps);
  return new Function(...nombres, `${trozo}\nreturn ${nombre};`)(...nombres.map((n) => deps[n]));
}

function respuesta() {
  const r = { codigo: 200, cuerpo: null };
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (c) => { r.cuerpo = c; return r; };
  return r;
}

const silencio = { log() {}, error() {}, warn() {} };
const tarjeta = { cryptomateCardId: "cm1", status: "ACTIVE", save: async () => {} };

function dobles({ precio, env = {}, rutas }) {
  return {
    getAuthUser: async () => ({ _id: "u1", phone_country_code: null, phone_number: null }),
    Card: { findOne: async () => tarjeta },
    cryptomateClient: {
      get: async (ruta) => {
        for (const [trozo, dar] of Object.entries(rutas)) {
          if (ruta.includes(trozo)) {
            if (dar instanceof Error) throw dar;
            return { data: dar };
          }
        }
        throw new Error(`ruta sin doble: ${ruta}`);
      },
    },
    getOrigenPriceUsd: async () => {
      if (precio instanceof Error) throw precio;
      return precio;
    },
    process: { env },
    console: silencio,
  };
}

const sinPrecio = Object.assign(new Error("PRECIO_NO_DISPONIBLE"), { code: "PRECIO_NO_DISPONIBLE" });
const RUTAS_TARJETA = {
  "/virtual-balances": { available_credit: 100 },
  "/cards/virtual-cards/cm1": {
    id: "cm1", card_holder_name: "X", last4: "0000", status: "ACTIVE",
    daily_limit: 500, weekly_limit: 1000, monthly_limit: 2000,
  },
};

test("getMyCard sin precio: saldo, límites y precio en null, nunca a 1 USD", async () => {
  for (const env of [{}, { OG_TOKEN_PRICE_USD: "0.01" }, { OG_TOKEN_PRICE_USD: "1" }]) {
    const getMyCard = sacar("getMyCard", dobles({ precio: sinPrecio, env, rutas: RUTAS_TARJETA }));
    const res = respuesta();
    await getMyCard({}, res);
    assert.equal(res.codigo, 200, JSON.stringify(res.cuerpo));
    const c = res.cuerpo;
    const que = `con ${JSON.stringify(env)}: ${JSON.stringify(c)}`;
    assert.equal(c.availableOrigen, null, `saldo inventado ${que}`);
    assert.equal(c.ogTokenPrice, null, que);
    assert.equal(c.dailyLimit, null, que);
    assert.equal(c.weeklyLimit, null, que);
    assert.equal(c.monthlyLimit, null, que);
    // El resto de la tarjeta sigue llegando: sólo lo que depende del precio va con guion.
    assert.equal(c.last4, "0000");
    assert.equal(c.status, "ACTIVE");
  }
});

test("getMyCard con precio: convierte con el gramin", async () => {
  const getMyCard = sacar("getMyCard", dobles({ precio: 2.5, rutas: RUTAS_TARJETA }));
  const res = respuesta();
  await getMyCard({}, res);
  const c = res.cuerpo;
  assert.equal(c.availableOrigen, 40);
  assert.equal(c.ogTokenPrice, 2.5);
  assert.equal(c.dailyLimit, 200);
  assert.equal(c.weeklyLimit, 400);
  assert.equal(c.monthlyLimit, 800);
});

test("getMyCard sin saldo del emisor: availableOrigen null aunque haya precio", async () => {
  const rutas = { ...RUTAS_TARJETA, "/virtual-balances": new Error("caido") };
  const getMyCard = sacar("getMyCard", dobles({ precio: 2.5, rutas }));
  const res = respuesta();
  await getMyCard({}, res);
  assert.equal(res.cuerpo.availableOrigen, null);
  assert.equal(res.cuerpo.ogTokenPrice, 2.5);
});

const RUTAS_MOVS = {
  "/cards/transactions/search-transactions": {
    data: [{ id: "t1", amount: 10, created_at: "2026-09-26", merchant_name: "Tienda", status: "APPROVED" }],
    total: 1,
  },
};
const peticionMovs = { query: {} };

test("historial sin precio: origenAmount null (guion) y el monto en USD intacto", async () => {
  for (const env of [{}, { OG_TOKEN_PRICE_USD: "0.01" }]) {
    const getCardTransactions = sacar("getCardTransactions", dobles({ precio: sinPrecio, env, rutas: RUTAS_MOVS }));
    const res = respuesta();
    await getCardTransactions(peticionMovs, res);
    assert.equal(res.codigo, 200, JSON.stringify(res.cuerpo));
    const [tx] = res.cuerpo.transactions;
    assert.equal(tx.origenAmount, null, `monto inventado con ${JSON.stringify(env)}: ${JSON.stringify(tx)}`);
    assert.equal(tx.amount, 10);
    assert.equal(res.cuerpo.ogTokenPrice, null);
  }
});

test("historial con precio: convierte con el gramin", async () => {
  const getCardTransactions = sacar("getCardTransactions", dobles({ precio: 2.5, rutas: RUTAS_MOVS }));
  const res = respuesta();
  await getCardTransactions(peticionMovs, res);
  assert.equal(res.cuerpo.transactions[0].origenAmount, 4);
  assert.equal(res.cuerpo.ogTokenPrice, 2.5);
});

test("historial vacío (NOT_FOUND): sin el precio de 1 escrito a mano", async () => {
  const noHay = Object.assign(new Error("404"), { response: { status: 404, data: { code: "NOT_FOUND" } } });
  const getCardTransactions = sacar(
    "getCardTransactions",
    dobles({ precio: 2.5, rutas: { "/cards/transactions/search-transactions": noHay } }),
  );
  const res = respuesta();
  await getCardTransactions(peticionMovs, res);
  assert.deepEqual(res.cuerpo.transactions, []);
  assert.notEqual(res.cuerpo.ogTokenPrice, 1);
});

test("cardController ya no tiene precio de reserva", () => {
  const codigo = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/OG_TOKEN_PRICE_USD/.test(codigo), "OG_TOKEN_PRICE_USD sigue en cardController.js");
  assert.ok(!/ogTokenPrice:\s*1\b/.test(codigo), "queda un ogTokenPrice: 1 escrito a mano");
});
