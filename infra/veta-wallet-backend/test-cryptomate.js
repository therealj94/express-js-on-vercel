/**
 * test-cryptomate.js — Diagnóstico definitivo
 * Ejecutar: npx babel-node test-cryptomate.js
 */

import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const API_KEY = process.env.CRYPTOMATE_API_KEY;
if (!API_KEY) { console.error("❌  CRYPTOMATE_API_KEY no está en .env"); process.exit(1); }

const cm = axios.create({
  baseURL: "https://api.cryptomate.me",
  headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
});

async function get(path) {
  try {
    const { data } = await cm.get(path);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: err.response?.status, data: err.response?.data };
  }
}

async function post(label, payload) {
  process.stdout.write(`\n[${label}] `);
  try {
    const { data, status } = await cm.post("/management/clients", payload);
    console.log(`✅  ${status} — id: ${data.id}`);
    return { ok: true, data };
  } catch (err) {
    const s = err.response?.status;
    const d = err.response?.data;
    console.log(`❌  ${s} — ${d?.message}`);
    console.log(`   trace: ${d?.trace_id}`);
    return { ok: false };
  }
}

async function main() {
  const ts = Date.now();
  const addr = { street_line_1: "123 Main Street", city: "San Francisco", postal_code: "94102", state: "USA-CA", country: "USA" };
  const colAddr = { street_line_1: "Calle 93 11-28", city: "Bogota", postal_code: "110221", state: "COL-DC", country: "COL" };

  console.log("\n── Cuenta ─────────────────────────────────────────────────────");
  const company = await get("/management/companies");
  console.log(company.ok ? JSON.stringify(company.data, null, 2) : `❌ ${company.status}`);

  const prod = await get("/management/contracted-product");
  console.log("\nContrato:", JSON.stringify(prod.data));

  console.log("\n── Tests ──────────────────────────────────────────────────────");

  // Test A: mínimo absoluto — solo campos base sin address ni flags
  await post("A mínimo (solo nombre/email/teléfono)", {
    phone_country_code: 1,
    phone_number: 4155551234,
    first_name: "John",
    last_name: "Doe",
    email: `john.a.${ts}@example.com`,
  });

  // Test B: mínimo + address USA
  await post("B mínimo + address USA", {
    phone_country_code: 1,
    phone_number: 4155551235,
    first_name: "John",
    last_name: "Doe",
    email: `john.b.${ts}@example.com`,
    address: addr,
  });

  // Test C: enterprise_cards: true + address USA
  await post("C enterprise_cards:true + address USA", {
    phone_country_code: 1,
    phone_number: 4155551236,
    first_name: "John",
    last_name: "Doe",
    email: `john.c.${ts}@example.com`,
    address: addr,
    enterprise_cards: true,
  });

  // Test D: enterprise_cards: true + address COL
  await post("D enterprise_cards:true + address COL", {
    phone_country_code: 57,
    phone_number: 3001234567,
    first_name: "Carlos",
    last_name: "Rodriguez",
    email: `carlos.d.${ts}@mailinator.com`,
    address: colAddr,
    enterprise_cards: true,
  });

  // Test E: mínimo absoluto SIN address — qué error da?
  await post("E sin address ni flags — ¿pasa o falla?", {
    phone_country_code: 57,
    phone_number: 3009876543,
    first_name: "Maria",
    last_name: "Lopez",
    email: `maria.e.${ts}@mailinator.com`,
    birth_date: "1995-06-20",
  });

  console.log("\n── fin ────────────────────────────────────────────────────────\n");
}

main().catch(console.error);
