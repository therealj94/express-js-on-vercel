#!/usr/bin/env node
/**
 * test-balance.js
 * Verifica end-to-end que el saldo de la tarjeta se lee correctamente.
 * 
 * Uso:
 *   node scripts/test-balance.js <JWT_TOKEN>
 * 
 * Obtén el token abriendo DevTools en la app → Application → Cookies → token
 */

import axios from "axios";

const BASE = process.env.API_URL || "https://vetawallet-1a2e38ac52b1.herokuapp.com";
const TOKEN = process.argv[2];

if (!TOKEN) {
  console.error("❌  Uso: node scripts/test-balance.js <JWT_TOKEN>");
  process.exit(1);
}

const api = axios.create({
  baseURL: BASE,
  headers: { Authorization: `Bearer ${TOKEN}` },
});

async function run() {
  console.log("🔍  Conectando a:", BASE, "\n");

  // 1. GET /cards/my-card
  console.log("── TEST 1: GET /cards/my-card ──────────────────────────");
  try {
    const { data } = await api.get("/cards/my-card");
    console.log("✅  Status:", data.status);
    console.log("    last4:", data.last4);
    console.log("    topUpAddress:", data.topUpAddress ?? "(no guardado aún)");
    console.log("    topUpBlockchain:", data.topUpBlockchain);
    console.log("    ogTokenPrice:", data.ogTokenPrice);
    console.log("    availableOrigen:", data.availableOrigen);

    if (data.availableOrigen === null || data.availableOrigen === undefined) {
      console.warn("⚠️   availableOrigen es null — CryptoMate no devolvió available_credit");
    } else if (data.availableOrigen === 0) {
      console.warn("⚠️   availableOrigen es 0 — la tarjeta no tiene saldo o CryptoMate aún no procesó el top-up");
    } else {
      console.log("✅  Saldo OK:", data.availableOrigen.toFixed(4), "ORIGEN");
    }
  } catch (e) {
    console.error("❌  my-card falló:", e.response?.data || e.message);
  }

  // 2. GET /cards/transactions
  console.log("\n── TEST 2: GET /cards/transactions ─────────────────────");
  try {
    const { data } = await api.get("/cards/transactions?page=1&limit=5");
    console.log("✅  Total transacciones:", data.total);
    if (data.transactions?.length) {
      const tx = data.transactions[0];
      console.log("    Última tx:", tx.merchant, "|", tx.origenAmount?.toFixed(4), "ORIGEN |", tx.status);
    } else {
      console.log("    Sin transacciones todavía");
    }
  } catch (e) {
    console.error("❌  transactions falló:", e.response?.data || e.message);
  }

  // 3. GET /cards/top-up-wallets
  console.log("\n── TEST 3: GET /cards/top-up-wallets ───────────────────");
  try {
    const { data } = await api.get("/cards/top-up-wallets");
    const wallets = data.wallets || data;
    const polygon = Array.isArray(wallets) ? wallets.find(w => w.blockchain === "POLYGON") : null;
    if (polygon) {
      console.log("✅  Wallet Polygon:", polygon.address);
      console.log("    Tokens:", polygon.tokens?.map(t => t.symbol || t).join(", "));
    } else {
      console.warn("⚠️   No se encontró wallet POLYGON");
      console.log("    Wallets:", JSON.stringify(wallets, null, 2));
    }
  } catch (e) {
    console.error("❌  top-up-wallets falló:", e.response?.data || e.message);
  }

  // 4. Precio ORIGEN
  console.log("\n── TEST 4: GET /cards/origen-price ─────────────────────");
  try {
    const { data } = await api.get("/cards/origen-price");
    console.log("✅  1 ORIGEN =", data.priceUsd ?? data.price ?? data, "USD");
  } catch (e) {
    console.error("❌  origen-price falló:", e.response?.data || e.message);
  }

  console.log("\n─────────────────────────────────────────────────────────");
  console.log("💡  Si availableOrigen = 0, revisa los logs de Heroku:");
  console.log("    heroku logs --tail --app vetawallet | grep getMyCard");
}

run();
