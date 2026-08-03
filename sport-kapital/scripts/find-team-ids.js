#!/usr/bin/env node
// scripts/find-team-ids.js
// Busca en api-football.com el ID real de cada equipo de data/teams.ts y
// muestra un bloque listo para pegar en data/teamApiMapping.ts.
//
// Uso:
//   1. Asegúrate de tener EXPO_PUBLIC_API_FOOTBALL_KEY en tu .env (o pásala
//      como variable de entorno al correr el script).
//   2. node scripts/find-team-ids.js
//
// El plan gratuito de api-football.com limita las peticiones por minuto, así
// que este script espera varios segundos entre cada consulta. Los equipos ya
// confirmados en una corrida anterior (KNOWN_IDS) no se vuelven a consultar.

const fs = require('fs');
const path = require('path');

function loadEnvKey() {
  if (process.env.EXPO_PUBLIC_API_FOOTBALL_KEY) return process.env.EXPO_PUBLIC_API_FOOTBALL_KEY;
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('EXPO_PUBLIC_API_FOOTBALL_KEY='));
    if (line) return line.split('=')[1].trim();
  }
  return null;
}

const API_KEY = loadEnvKey();
const BASE = 'https://v3.football.api-sports.io';

// Ya confirmados en una corrida anterior (respuesta real de la API) — no se
// vuelven a consultar, para no gastar cuota ni tiempo de más.
const KNOWN_IDS = {
  fra: 2, esp: 9, arg: 26, sui: 15, eng: 10, nor: 1090, mar: 31, bel: 1,
  bar: 529, atm: 530, ath: 531,
};

// id interno -> { nombre a buscar, es selección nacional }
const TEAMS = [
  ['fra', 'France', true],
  ['esp', 'Spain', true],
  ['arg', 'Argentina', true],
  ['sui', 'Switzerland', true],
  ['eng', 'England', true],
  ['nor', 'Norway', true],
  ['mar', 'Morocco', true],
  ['bel', 'Belgium', true],
  ['bar', 'Barcelona', false],
  ['rma', 'Real Madrid', false],
  ['atm', 'Atletico Madrid', false],
  ['ath', 'Athletic Club', false],
  ['bet', 'Real Betis', false],
  ['rso', 'Real Sociedad', false],
  ['vil', 'Villarreal', false],
  ['sev', 'Sevilla', false],
  ['mot', 'Motagua', false],
  ['oli', 'Olimpia', false],
  ['mar_h', 'Marathon', false],
  ['res', 'Real Espana', false],
  ['pla', 'Platense', false],
  ['ola', 'Olancho', false],
  ['upn', 'UPNFM', false],
  ['jut', 'Juticalpa', false],
];

const PAUSE_MS = 7000; // el plan gratuito limita peticiones por minuto

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function searchTeam(name) {
  const res = await fetch(`${BASE}/teams?search=${encodeURIComponent(name)}`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.response || [];
}

async function searchTeamWithRetry(name) {
  try {
    return await searchTeam(name);
  } catch (err) {
    if (String(err.message).includes('rateLimit')) {
      console.log('   (límite de tasa, esperando 15s extra y reintentando una vez...)');
      await sleep(15000);
      return await searchTeam(name);
    }
    throw err;
  }
}

async function checkStatus() {
  const res = await fetch(`${BASE}/status`, { headers: { 'x-apisports-key': API_KEY } });
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    console.error('❌ La API rechazó la key:', JSON.stringify(json.errors));
    return false;
  }
  const acc = json.response;
  console.log('✅ Conexión OK con api-football.com');
  if (acc?.subscription) console.log(`   Plan: ${acc.subscription.plan} · activo: ${acc.subscription.active}`);
  if (acc?.requests) console.log(`   Requests hoy: ${acc.requests.current} / ${acc.requests.limit_day}\n`);
  return true;
}

async function main() {
  if (!API_KEY) {
    console.error('No encontré EXPO_PUBLIC_API_FOOTBALL_KEY. Ponla en .env o como variable de entorno.');
    process.exit(1);
  }

  const ok = await checkStatus();
  if (!ok) process.exit(1);

  const pending = TEAMS.filter(([id]) => !(id in KNOWN_IDS));
  console.log(`Ya confirmados: ${Object.keys(KNOWN_IDS).length}. Consultando ${pending.length} equipos restantes (pausa de ${PAUSE_MS / 1000}s entre cada uno, esto tarda unos minutos)...\n`);

  const picks = { ...KNOWN_IDS };

  for (let i = 0; i < pending.length; i++) {
    const [internalId, searchName, national] = pending[i];
    try {
      const results = await searchTeamWithRetry(searchName);
      if (results.length === 0) {
        console.log(`❌ ${internalId} (${searchName}): sin resultados`);
      } else {
        const best = national
          ? results.find((r) => r.team.national) || results[0]
          : results[0];
        picks[internalId] = best.team.id;
        console.log(`✅ ${internalId} (${searchName}) -> id ${best.team.id} · "${best.team.name}"${best.team.national ? ' [selección]' : ''}`);
        if (results.length > 1) {
          console.log('   otras coincidencias:', results.slice(0, 5).map((r) => `${r.team.id}=${r.team.name}`).join(', '));
        }
      }
    } catch (err) {
      console.log(`⚠️  ${internalId} (${searchName}): error — ${err.message}`);
    }

    if (i < pending.length - 1) await sleep(PAUSE_MS);
  }

  console.log('\n\n---- Pega esto en data/teamApiMapping.ts (reemplaza apiTeamId: null por el número) ----\n');
  for (const [internalId, , national] of TEAMS) {
    const id = picks[internalId];
    console.log(`  ${internalId}: { apiTeamId: ${id ?? 'null'}, national: ${national} },`);
  }
}

main();
