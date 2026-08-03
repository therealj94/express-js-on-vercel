// data/teams.ts
// Tokens de equipos en tres mercados, con datos reales al 12 de julio de 2026:
// - Mundial 2026 (cuartos ya jugados; semifinales: Francia vs España y Argentina vs Inglaterra)
// - LaLiga 2025/26 (Barcelona campeón, título 29)
// - Liga Nacional de Honduras (Motagua campeón del Clausura 2026, Olimpia campeón del Apertura 2025)

export type League = 'MUNDIAL' | 'LALIGA' | 'HONDURAS';

/**
 * Categoría de valoración del token, según el nivel del equipo. Es la base de
 * precio: cuando dos tokens de un enfrentamiento REAL se cruzan (ver
 * utils/realMatchEngine.ts), el flujo de liquidez es siempre cero-suma dentro
 * del partido, sin importar la categoría — pero la categoría fija el rango de
 * precio base y el prestigio del token.
 */
export type Tier = 1 | 2 | 3;

export const LEAGUE_TIER: Record<League, Tier> = {
  MUNDIAL: 1,
  LALIGA: 2,
  HONDURAS: 3,
};

export const TIER_LABEL: Record<Tier, string> = {
  1: 'Categoría A · Élite Mundial',
  2: 'Categoría B · Liga Profesional',
  3: 'Categoría C · Liga Regional',
};

export const TIER_SHORT: Record<Tier, string> = { 1: 'Cat A', 2: 'Cat B', 3: 'Cat C' };

export const TIER_RANGE: Record<Tier, { min: number; max: number }> = {
  1: { min: 55, max: 160 },
  2: { min: 50, max: 170 },
  3: { min: 15, max: 55 },
};

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

export interface TeamSeed {
  id: string;
  name: string;
  short: string;         // abreviatura tipo ticker (3-4 letras)
  league: League;
  country: string;
  basePrice: number;
  color: string;
  color2: string;
  // estadísticas de la campaña actual
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  note: string;          // contexto real
}

export interface Team extends TeamSeed {
  tier: Tier;
  currentPrice: number;
  priceChange: number;      // % de la sesión
  candles: Candle[];        // velas base (1m simulado)
  volume24h: number;
  liquidity: number;        // pool de liquidez del token
  formTrend: 'up' | 'down' | 'flat';
  sentiment: 'alcista' | 'bajista' | 'neutral';
}

export const TEAM_SEEDS: TeamSeed[] = [
  // ============ MUNDIAL 2026 — estado real del torneo ============
  { id: 'fra', name: 'Francia', short: 'FRA', league: 'MUNDIAL', country: 'Francia', basePrice: 148, color: '#1D3D8F', color2: '#E1000F',
    played: 6, wins: 5, draws: 1, losses: 0, goalsFor: 15, goalsAgainst: 4,
    note: 'En semifinales. Venció 2-0 a Marruecos; Mbappé suma 8 goles en el torneo y 20 históricos.' },
  { id: 'esp', name: 'España', short: 'ESP', league: 'MUNDIAL', country: 'España', basePrice: 152, color: '#B8860B', color2: '#AA151B',
    played: 6, wins: 6, draws: 0, losses: 0, goalsFor: 17, goalsAgainst: 3,
    note: 'En semifinales tras vencer 2-0 a Bélgica con goles de Fabián Ruiz y Merino. Yamal en nivel histórico.' },
  { id: 'arg', name: 'Argentina', short: 'ARG', league: 'MUNDIAL', country: 'Argentina', basePrice: 145, color: '#5FA8D3', color2: '#FFFFFF',
    played: 6, wins: 5, draws: 1, losses: 0, goalsFor: 13, goalsAgainst: 5,
    note: 'Campeón defensor. Venció 1-0 a Suiza en cuartos; disputa la semifinal ante Inglaterra.' },
  { id: 'sui', name: 'Suiza', short: 'SUI', league: 'MUNDIAL', country: 'Suiza', basePrice: 96, color: '#D52B1E', color2: '#FFFFFF',
    played: 6, wins: 3, draws: 2, losses: 1, goalsFor: 8, goalsAgainst: 5,
    note: 'Cayó 1-0 ante Argentina en cuartos tras eliminar a Colombia en penales. Fin de su Mundial.' },
  { id: 'eng', name: 'Inglaterra', short: 'ENG', league: 'MUNDIAL', country: 'Inglaterra', basePrice: 132, color: '#FFFFFF', color2: '#CE1124',
    played: 6, wins: 5, draws: 1, losses: 0, goalsFor: 13, goalsAgainst: 4,
    note: 'Venció 2-1 a Noruega en cuartos; jugará la semifinal contra Argentina.' },
  { id: 'nor', name: 'Noruega', short: 'NOR', league: 'MUNDIAL', country: 'Noruega', basePrice: 104, color: '#BA0C2F', color2: '#00205B',
    played: 6, wins: 4, draws: 0, losses: 2, goalsFor: 14, goalsAgainst: 8,
    note: 'La revelación del torneo con Haaland, eliminada 2-1 por Inglaterra en cuartos.' },
  { id: 'mar', name: 'Marruecos', short: 'MAR', league: 'MUNDIAL', country: 'Marruecos', basePrice: 62, color: '#C1272D', color2: '#006233',
    played: 6, wins: 4, draws: 1, losses: 1, goalsFor: 9, goalsAgainst: 6,
    note: 'Eliminado en cuartos ante Francia (0-2). Último africano en despedirse del torneo.' },
  { id: 'bel', name: 'Bélgica', short: 'BEL', league: 'MUNDIAL', country: 'Bélgica', basePrice: 58, color: '#2D2926', color2: '#FDDA24',
    played: 6, wins: 3, draws: 2, losses: 1, goalsFor: 10, goalsAgainst: 8,
    note: 'Eliminada en cuartos ante España (0-2) en el adiós del estadio de Los Ángeles.' },

  // ============ LALIGA 2025/26 — tabla final real ============
  { id: 'bar', name: 'FC Barcelona', short: 'BAR', league: 'LALIGA', country: 'España', basePrice: 168, color: '#A50044', color2: '#004D98',
    played: 38, wins: 28, draws: 6, losses: 4, goalsFor: 92, goalsAgainst: 34,
    note: 'Campeón de LaLiga 2025/26 (título 29). Sentenció en la jornada 35 ganando 2-0 al Real Madrid.' },
  { id: 'rma', name: 'Real Madrid', short: 'RMA', league: 'LALIGA', country: 'España', basePrice: 158, color: '#FEBE10', color2: '#00529F',
    played: 38, wins: 26, draws: 7, losses: 5, goalsFor: 84, goalsAgainst: 38,
    note: 'Subcampeón. Mbappé Pichichi con 25 goles en la temporada.' },
  { id: 'atm', name: 'Atlético de Madrid', short: 'ATM', league: 'LALIGA', country: 'España', basePrice: 118, color: '#CB3524', color2: '#262E62',
    played: 38, wins: 23, draws: 8, losses: 7, goalsFor: 70, goalsAgainst: 35,
    note: 'Tercero de LaLiga y clasificado a Champions League 2026/27.' },
  { id: 'ath', name: 'Athletic Club', short: 'ATH', league: 'LALIGA', country: 'España', basePrice: 88, color: '#EE2523', color2: '#FFFFFF',
    played: 38, wins: 19, draws: 10, losses: 9, goalsFor: 58, goalsAgainst: 41,
    note: 'Clasificado a Champions League por la vía de LaLiga.' },
  { id: 'bet', name: 'Real Betis', short: 'BET', league: 'LALIGA', country: 'España', basePrice: 76, color: '#00954C', color2: '#FFFFFF',
    played: 38, wins: 17, draws: 11, losses: 10, goalsFor: 55, goalsAgainst: 45,
    note: 'Entró a Champions gracias a la plaza extra de España por coeficiente UEFA.' },
  { id: 'rso', name: 'Real Sociedad', short: 'RSO', league: 'LALIGA', country: 'España', basePrice: 72, color: '#0067B1', color2: '#FFFFFF',
    played: 38, wins: 16, draws: 11, losses: 11, goalsFor: 51, goalsAgainst: 42,
    note: 'Campeón de la Copa del Rey 2026.' },
  { id: 'vil', name: 'Villarreal', short: 'VIL', league: 'LALIGA', country: 'España', basePrice: 70, color: '#FFE667', color2: '#005187',
    played: 38, wins: 16, draws: 10, losses: 12, goalsFor: 56, goalsAgainst: 48,
    note: 'Temporada sólida peleando puestos europeos hasta el final.' },
  { id: 'sev', name: 'Sevilla', short: 'SEV', league: 'LALIGA', country: 'España', basePrice: 54, color: '#F43333', color2: '#FFFFFF',
    played: 38, wins: 12, draws: 11, losses: 15, goalsFor: 44, goalsAgainst: 50,
    note: 'Campaña de reconstrucción en la mitad de la tabla.' },

  // ============ LIGA NACIONAL DE HONDURAS — temporada 2025/26 real ============
  { id: 'mot', name: 'FC Motagua', short: 'MOT', league: 'HONDURAS', country: 'Honduras', basePrice: 46, color: '#0A2A5E', color2: '#FFFFFF',
    played: 22, wins: 13, draws: 5, losses: 4, goalsFor: 38, goalsAgainst: 20,
    note: 'Campeón del Clausura 2026 (copa 20) al vencer a Marathón 4-2 en penales, con Javier López como DT.' },
  { id: 'oli', name: 'CD Olimpia', short: 'OLI', league: 'HONDURAS', country: 'Honduras', basePrice: 52, color: '#FFFFFF', color2: '#D40000',
    played: 22, wins: 14, draws: 4, losses: 4, goalsFor: 42, goalsAgainst: 18,
    note: 'Campeón del Apertura 2025 y máximo ganador histórico con 40 títulos de Liga Nacional.' },
  { id: 'mar_h', name: 'CD Marathón', short: 'MTH', league: 'HONDURAS', country: 'Honduras', basePrice: 38, color: '#00753B', color2: '#FFFFFF',
    played: 22, wins: 12, draws: 6, losses: 4, goalsFor: 36, goalsAgainst: 22,
    note: 'Subcampeón del Clausura 2026, su segunda final consecutiva perdida con Pablo Lavallén.' },
  { id: 'res', name: 'Real España', short: 'RES', league: 'HONDURAS', country: 'Honduras', basePrice: 32, color: '#FDBA12', color2: '#000000',
    played: 22, wins: 9, draws: 7, losses: 6, goalsFor: 30, goalsAgainst: 26,
    note: 'La Máquina peleó zona de triangulares durante todo el Clausura 2026.' },
  { id: 'pla', name: 'CD Platense', short: 'PLA', league: 'HONDURAS', country: 'Honduras', basePrice: 24, color: '#00641E', color2: '#FFFFFF',
    played: 22, wins: 9, draws: 6, losses: 7, goalsFor: 27, goalsAgainst: 25,
    note: 'El Tiburón, entre los mejores de la tabla acumulada 2025/26.' },
  { id: 'ola', name: 'Olancho FC', short: 'OLA', league: 'HONDURAS', country: 'Honduras', basePrice: 22, color: '#B01C2E', color2: '#FFFFFF',
    played: 22, wins: 8, draws: 6, losses: 8, goalsFor: 26, goalsAgainst: 27,
    note: 'Los Potros consolidados en la primera división hondureña.' },
  { id: 'upn', name: 'Lobos UPNFM', short: 'UPN', league: 'HONDURAS', country: 'Honduras', basePrice: 18, color: '#5B2A86', color2: '#FFFFFF',
    played: 22, wins: 7, draws: 6, losses: 9, goalsFor: 24, goalsAgainst: 29,
    note: 'Le quitó el liderato a Motagua en la última jornada de la fase regular.' },
  { id: 'jut', name: 'Juticalpa FC', short: 'JUT', league: 'HONDURAS', country: 'Honduras', basePrice: 15, color: '#C8102E', color2: '#FFD100',
    played: 22, wins: 6, draws: 5, losses: 11, goalsFor: 21, goalsAgainst: 32,
    note: 'El Canechero luchando por consolidarse en la máxima categoría.' },
];

// ---------- generación determinista de velas ----------
function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

const CANDLE_MS = 60_000; // vela base = 1 minuto simulado

export function genCandles(seed: TeamSeed, n = 160): Candle[] {
  const rnd = seededRandom(hashId(seed.id));
  const out: Candle[] = [];
  let price = seed.basePrice * (0.9 + rnd() * 0.1);
  const now = Date.now();
  for (let i = n; i > 0; i--) {
    const t = now - i * CANDLE_MS;
    const vol = 0.006 + rnd() * 0.014;
    const drift = (rnd() - 0.485) * price * vol * 2;
    const o = price;
    const c = Math.max(seed.basePrice * 0.45, o + drift);
    const h = Math.max(o, c) * (1 + rnd() * vol * 0.7);
    const l = Math.min(o, c) * (1 - rnd() * vol * 0.7);
    const v = Math.round(seed.basePrice * (8 + rnd() * 40));
    out.push({ t, o: r2(o), h: r2(h), l: r2(l), c: r2(c), v });
    price = c;
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildTeams(): Team[] {
  return TEAM_SEEDS.map((seed) => {
    const candles = genCandles(seed);
    const currentPrice = candles[candles.length - 1].c;
    const sessionOpen = candles[Math.max(0, candles.length - 60)].o;
    const priceChange = r2(((currentPrice - sessionOpen) / sessionOpen) * 100);
    const rnd = seededRandom(hashId(seed.id) + 7);
    return {
      ...seed,
      tier: LEAGUE_TIER[seed.league],
      currentPrice,
      priceChange,
      candles,
      volume24h: Math.round(seed.basePrice * (600 + rnd() * 3000)),
      liquidity: Math.round(seed.basePrice * (20000 + rnd() * 60000)),
      formTrend: priceChange > 0.8 ? 'up' : priceChange < -0.8 ? 'down' : 'flat',
      sentiment: priceChange > 0.8 ? 'alcista' : priceChange < -0.8 ? 'bajista' : 'neutral',
    };
  });
}

export const LEAGUE_LABEL: Record<League, string> = {
  MUNDIAL: 'Mundial 2026',
  LALIGA: 'LaLiga 25/26',
  HONDURAS: 'Liga Nacional',
};

/** Rival natural dentro de la liga (para flujo de liquidez en noticias). */
export function leagueRival(teams: Team[], id: string): Team | undefined {
  const t = teams.find((x) => x.id === id);
  if (!t) return undefined;
  const pool = teams.filter((x) => x.league === t.league && x.id !== id);
  return pool[hashId(id) % pool.length];
}
