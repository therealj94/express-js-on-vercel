// utils/leaderboard.ts
// Ranking de traders simulado (mundial y regional). Usa nombres de usuario
// generados de forma determinista — nunca nombres reales — por privacidad.

export type Region = 'centroamerica' | 'caribe' | 'norteamerica' | 'sudamerica';

const REGION_BY_COUNTRY: Record<string, Region> = {
  HN: 'centroamerica', GT: 'centroamerica', SV: 'centroamerica', CR: 'centroamerica', NI: 'centroamerica', PA: 'centroamerica',
  MX: 'norteamerica', US: 'norteamerica',
  DO: 'caribe',
  CO: 'sudamerica', VE: 'sudamerica', EC: 'sudamerica', PE: 'sudamerica', BO: 'sudamerica', CL: 'sudamerica', AR: 'sudamerica', PY: 'sudamerica', UY: 'sudamerica', BR: 'sudamerica',
};

export const REGION_LABEL: Record<Region, string> = {
  centroamerica: 'Centroamérica', caribe: 'El Caribe', norteamerica: 'Norteamérica', sudamerica: 'Sudamérica',
};

const REGION_COUNTRIES: Record<Region, string[]> = {
  centroamerica: ['HN', 'GT', 'SV', 'CR', 'NI', 'PA'],
  caribe: ['DO'],
  norteamerica: ['MX', 'US'],
  sudamerica: ['CO', 'VE', 'EC', 'PE', 'BO', 'CL', 'AR', 'PY', 'UY', 'BR'],
};

export function regionForCountry(code: string): Region {
  return REGION_BY_COUNTRY[code] ?? 'centroamerica';
}

export interface LeaderboardEntry {
  id: string;
  handle: string;
  countryCode: string;
  equity: number;
  roiPct: number;
  isYou?: boolean;
}

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function hashStr(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

const ADJ = ['Halcón', 'Cóndor', 'Tigre', 'Puma', 'Lobo', 'Fénix', 'Jaguar', 'Águila', 'Dragón', 'Pantera', 'Cobra', 'Toro', 'Rayo', 'Tiburón', 'Coyote', 'Quetzal'];
const NOUN = ['Trader', 'Kapital', 'Bolsa', 'Cripto', 'Fintech', 'Bull', 'Bear', 'Alpha', 'Wolf', 'Capital'];

function makeHandle(rnd: () => number): string {
  const a = ADJ[Math.floor(rnd() * ADJ.length)];
  const n = NOUN[Math.floor(rnd() * NOUN.length)];
  const num = Math.floor(rnd() * 900 + 100);
  return `${a}${n}${num}`;
}

const WELCOME_BONUS_REF = 500;

function genPool(seedKey: string, count: number, countryCodes: string[], maxEquity: number): LeaderboardEntry[] {
  const rnd = seededRandom(hashStr(seedKey));
  const out: LeaderboardEntry[] = [];
  for (let i = 0; i < count; i++) {
    const countryCode = countryCodes[Math.floor(rnd() * countryCodes.length)];
    // curva sesgada: la mayoría cerca del bono inicial, pocos con rendimientos altos
    const equity = Math.round(WELCOME_BONUS_REF * (0.55 + rnd() * rnd() * (maxEquity / WELCOME_BONUS_REF - 0.55) * 3));
    const roiPct = ((equity - WELCOME_BONUS_REF) / WELCOME_BONUS_REF) * 100;
    out.push({ id: `bot-${seedKey}-${i}`, handle: makeHandle(rnd), countryCode, equity, roiPct });
  }
  return out;
}

export function buildGlobalPool(): LeaderboardEntry[] {
  const all = Object.values(REGION_COUNTRIES).flat();
  return genPool('global', 28, all, 9000);
}

export function buildRegionalPool(region: Region): LeaderboardEntry[] {
  return genPool(`region-${region}`, 16, REGION_COUNTRIES[region], 4500);
}

/** Inserta al usuario real en el pool y devuelve la lista ordenada por patrimonio + su puesto. */
export function withYou(pool: LeaderboardEntry[], you: LeaderboardEntry): { entries: LeaderboardEntry[]; rank: number } {
  const entries = [...pool, you].sort((a, b) => b.equity - a.equity);
  const rank = entries.findIndex((e) => e.isYou) + 1;
  return { entries, rank };
}
