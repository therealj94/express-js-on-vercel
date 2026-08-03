// data/teams.ts
// Tokens de equipos de cuatro ligas reales, con datos de la temporada en curso:
// - LaLiga (España)
// - Brasileirão Série A (Brasil)
// - MLS (Estados Unidos)
// - Liga Nacional (Honduras)

export type League = 'LALIGA' | 'BRASIL' | 'ESTADOS_UNIDOS' | 'HONDURAS';

/**
 * Categoría de valoración del token, según el nivel del equipo. Es la base de
 * precio: cuando dos tokens de un enfrentamiento REAL se cruzan (ver
 * utils/realMatchEngine.ts), el flujo de liquidez es siempre cero-suma dentro
 * del partido, sin importar la categoría — pero la categoría fija el rango de
 * precio base y el prestigio del token.
 */
export type Tier = 1 | 2 | 3;

export const LEAGUE_TIER: Record<League, Tier> = {
  LALIGA: 1,
  BRASIL: 1,
  ESTADOS_UNIDOS: 2,
  HONDURAS: 3,
};

export const TIER_LABEL: Record<Tier, string> = {
  1: 'Categoría A · Élite Global',
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
  // ============ Brasileirão Série A 2026 — tabla real ============
  { id: 'palmeira', name: 'Palmeiras', short: 'PAL', league: 'BRASIL', country: 'Brasil', basePrice: 170, color: '#006437', color2: '#FFFFFF',
    played: 21, wins: 14, draws: 5, losses: 2, goalsFor: 38, goalsAgainst: 16,
    note: '1° lugar con 47 pts (14V-5E-2D), temporada 2026.' },
  { id: 'flamengo', name: 'Flamengo', short: 'FLA', league: 'BRASIL', country: 'Brasil', basePrice: 164, color: '#C8102E', color2: '#000000',
    played: 20, wins: 11, draws: 6, losses: 3, goalsFor: 37, goalsAgainst: 18,
    note: '2° lugar con 39 pts (11V-6E-3D), temporada 2026.' },
  { id: 'atle_para', name: 'Athletico Paranaense', short: 'AP', league: 'BRASIL', country: 'Brasil', basePrice: 157, color: '#000000', color2: '#DA291C',
    played: 21, wins: 11, draws: 4, losses: 6, goalsFor: 28, goalsAgainst: 19,
    note: '3° lugar con 37 pts (11V-4E-6D), temporada 2026.' },
  { id: 'fluminen', name: 'Fluminense', short: 'FLU', league: 'BRASIL', country: 'Brasil', basePrice: 151, color: '#7A1531', color2: '#006437',
    played: 21, wins: 9, draws: 7, losses: 5, goalsFor: 30, goalsAgainst: 25,
    note: '4° lugar con 34 pts (9V-7E-5D), temporada 2026.' },
  { id: 'bahia', name: 'Bahia', short: 'BAH', league: 'BRASIL', country: 'Brasil', basePrice: 145, color: '#0038A8', color2: '#C8102E',
    played: 21, wins: 8, draws: 8, losses: 5, goalsFor: 29, goalsAgainst: 25,
    note: '5° lugar con 32 pts (8V-8E-5D), temporada 2026.' },
  { id: 'rb_brag', name: 'RB Bragantino', short: 'RB', league: 'BRASIL', country: 'Brasil', basePrice: 138, color: '#DA291C', color2: '#FFFFFF',
    played: 20, wins: 9, draws: 4, losses: 7, goalsFor: 26, goalsAgainst: 20,
    note: '6° lugar con 31 pts (9V-4E-7D), temporada 2026.' },
  { id: 'cruzeiro', name: 'Cruzeiro', short: 'CRU', league: 'BRASIL', country: 'Brasil', basePrice: 132, color: '#003399', color2: '#FFFFFF',
    played: 21, wins: 8, draws: 6, losses: 7, goalsFor: 27, goalsAgainst: 30,
    note: '7° lugar con 30 pts (8V-6E-7D), temporada 2026.' },
  { id: 'botafogo', name: 'Botafogo', short: 'BOT', league: 'BRASIL', country: 'Brasil', basePrice: 126, color: '#000000', color2: '#FFFFFF',
    played: 20, wins: 8, draws: 5, losses: 7, goalsFor: 34, goalsAgainst: 32,
    note: '8° lugar con 29 pts (8V-5E-7D), temporada 2026.' },
  { id: 'corinthi', name: 'Corinthians', short: 'COR', league: 'BRASIL', country: 'Brasil', basePrice: 119, color: '#000000', color2: '#FFFFFF',
    played: 21, wins: 7, draws: 8, losses: 6, goalsFor: 22, goalsAgainst: 20,
    note: '9° lugar con 29 pts (7V-8E-6D), temporada 2026.' },
  { id: 'atletico', name: 'Atlético-MG', short: 'ATL', league: 'BRASIL', country: 'Brasil', basePrice: 113, color: '#000000', color2: '#FFFFFF',
    played: 20, wins: 8, draws: 4, losses: 8, goalsFor: 25, goalsAgainst: 25,
    note: '10° lugar con 28 pts (8V-4E-8D), temporada 2026.' },
  { id: 'coritiba', name: 'Coritiba', short: 'COR2', league: 'BRASIL', country: 'Brasil', basePrice: 107, color: '#00693C', color2: '#FFFFFF',
    played: 21, wins: 7, draws: 6, losses: 8, goalsFor: 25, goalsAgainst: 28,
    note: '11° lugar con 27 pts (7V-6E-8D), temporada 2026.' },
  { id: 'sao_paul', name: 'São Paulo', short: 'SP', league: 'BRASIL', country: 'Brasil', basePrice: 101, color: '#C8102E', color2: '#000000',
    played: 20, wins: 7, draws: 5, losses: 8, goalsFor: 25, goalsAgainst: 23,
    note: '12° lugar con 26 pts (7V-5E-8D), temporada 2026.' },
  { id: 'vitoria', name: 'Vitória', short: 'VIT', league: 'BRASIL', country: 'Brasil', basePrice: 94, color: '#C8102E', color2: '#000000',
    played: 21, wins: 7, draws: 5, losses: 9, goalsFor: 22, goalsAgainst: 31,
    note: '13° lugar con 26 pts (7V-5E-9D), temporada 2026.' },
  { id: 'mirassol', name: 'Mirassol', short: 'MIR', league: 'BRASIL', country: 'Brasil', basePrice: 88, color: '#FFD100', color2: '#00693C',
    played: 20, wins: 6, draws: 5, losses: 9, goalsFor: 23, goalsAgainst: 27,
    note: '14° lugar con 23 pts (6V-5E-9D), temporada 2026.' },
  { id: 'santos', name: 'Santos', short: 'SAN', league: 'BRASIL', country: 'Brasil', basePrice: 82, color: '#000000', color2: '#FFFFFF',
    played: 20, wins: 5, draws: 7, losses: 8, goalsFor: 29, goalsAgainst: 33,
    note: '15° lugar con 22 pts (5V-7E-8D), temporada 2026.' },
  { id: 'internac', name: 'Internacional', short: 'INT', league: 'BRASIL', country: 'Brasil', basePrice: 75, color: '#C8102E', color2: '#FFFFFF',
    played: 21, wins: 5, draws: 7, losses: 9, goalsFor: 23, goalsAgainst: 27,
    note: '16° lugar con 22 pts (5V-7E-9D), temporada 2026.' },
  { id: 'gremio', name: 'Grêmio', short: 'GRE', league: 'BRASIL', country: 'Brasil', basePrice: 69, color: '#0038A8', color2: '#000000',
    played: 20, wins: 5, draws: 7, losses: 8, goalsFor: 22, goalsAgainst: 26,
    note: '17° lugar con 22 pts (5V-7E-8D), temporada 2026.' },
  { id: 'vasc_gama', name: 'Vasco da Gama', short: 'VG', league: 'BRASIL', country: 'Brasil', basePrice: 63, color: '#000000', color2: '#FFFFFF',
    played: 20, wins: 5, draws: 6, losses: 9, goalsFor: 23, goalsAgainst: 31,
    note: '18° lugar con 21 pts (5V-6E-9D), temporada 2026.' },
  { id: 'remo', name: 'Remo', short: 'REM', league: 'BRASIL', country: 'Brasil', basePrice: 56, color: '#0038A8', color2: '#C8102E',
    played: 21, wins: 5, draws: 6, losses: 10, goalsFor: 24, goalsAgainst: 34,
    note: '19° lugar con 21 pts (5V-6E-10D), temporada 2026.' },
  { id: 'chap_b', name: 'Chapecoense', short: 'CB', league: 'BRASIL', country: 'Brasil', basePrice: 50, color: '#00693C', color2: '#FFFFFF',
    played: 20, wins: 1, draws: 7, losses: 12, goalsFor: 19, goalsAgainst: 41,
    note: '20° lugar con 10 pts (1V-7E-12D), temporada 2026.' },
  // ============ MLS 2026 — tabla real (Este + Oeste) ============
  { id: 'vanc_whit', name: 'Vancouver Whitecaps', short: 'VW', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 55, color: '#00245D', color2: '#8BC4E9',
    played: 17, wins: 10, draws: 4, losses: 3, goalsFor: 38, goalsAgainst: 17,
    note: '1° lugar con 34 pts (10V-4E-3D), temporada 2026.' },
  { id: 'los_ange', name: 'Los Angeles FC', short: 'LA', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 54, color: '#000000', color2: '#C39E6D',
    played: 19, wins: 10, draws: 4, losses: 5, goalsFor: 35, goalsAgainst: 19,
    note: '2° lugar con 34 pts (10V-4E-5D), temporada 2026.' },
  { id: 'san_jose_eart', name: 'San Jose Earthquakes', short: 'SJE', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 52, color: '#0072CE', color2: '#000000',
    played: 18, wins: 10, draws: 3, losses: 5, goalsFor: 37, goalsAgainst: 24,
    note: '3° lugar con 33 pts (10V-3E-5D), temporada 2026.' },
  { id: 'hous_dyna', name: 'Houston Dynamo', short: 'HD', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 51, color: '#F68712', color2: '#000000',
    played: 17, wins: 9, draws: 2, losses: 6, goalsFor: 25, goalsAgainst: 24,
    note: '4° lugar con 29 pts (9V-2E-6D), temporada 2026.' },
  { id: 'real_salt_lake', name: 'Real Salt Lake', short: 'RSL', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 49, color: '#B30838', color2: '#002B5C',
    played: 17, wins: 8, draws: 3, losses: 6, goalsFor: 29, goalsAgainst: 25,
    note: '5° lugar con 27 pts (8V-3E-6D), temporada 2026.' },
  { id: 'dallas', name: 'FC Dallas', short: 'DAL', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 48, color: '#E4002B', color2: '#0C2340',
    played: 18, wins: 7, draws: 6, losses: 5, goalsFor: 32, goalsAgainst: 25,
    note: '6° lugar con 27 pts (7V-6E-5D), temporada 2026.' },
  { id: 'st_loui_city', name: 'St. Louis City', short: 'SLC', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 47, color: '#DA291C', color2: '#001E62',
    played: 18, wins: 7, draws: 5, losses: 6, goalsFor: 24, goalsAgainst: 24,
    note: '7° lugar con 26 pts (7V-5E-6D), temporada 2026.' },
  { id: 'port_timb', name: 'Portland Timbers', short: 'PT', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 45, color: '#004812', color2: '#EFE939',
    played: 18, wins: 7, draws: 3, losses: 8, goalsFor: 33, goalsAgainst: 33,
    note: '8° lugar con 24 pts (7V-3E-8D), temporada 2026.' },
  { id: 'seat_soun', name: 'Seattle Sounders', short: 'SS', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 44, color: '#5D9741', color2: '#005595',
    played: 17, wins: 7, draws: 3, losses: 7, goalsFor: 20, goalsAgainst: 22,
    note: '9° lugar con 24 pts (7V-3E-7D), temporada 2026.' },
  { id: 'minn_unit', name: 'Minnesota United FC', short: 'MU', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 43, color: '#8CD2F4', color2: '#1A1A1A',
    played: 18, wins: 6, draws: 6, losses: 6, goalsFor: 20, goalsAgainst: 25,
    note: '10° lugar con 24 pts (6V-6E-6D), temporada 2026.' },
  { id: 'colo_rapi', name: 'Colorado Rapids', short: 'CR', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 41, color: '#8B1E3F', color2: '#960A2B',
    played: 18, wins: 7, draws: 1, losses: 10, goalsFor: 27, goalsAgainst: 25,
    note: '11° lugar con 22 pts (7V-1E-10D), temporada 2026.' },
  { id: 'los_ange_gala', name: 'Los Angeles Galaxy', short: 'LAG', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 40, color: '#00245D', color2: '#FFD200',
    played: 19, wins: 5, draws: 7, losses: 7, goalsFor: 24, goalsAgainst: 29,
    note: '12° lugar con 22 pts (5V-7E-7D), temporada 2026.' },
  { id: 'san_dieg', name: 'San Diego', short: 'SD', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 38, color: '#5EC1E8', color2: '#0C2340',
    played: 18, wins: 5, draws: 6, losses: 7, goalsFor: 32, goalsAgainst: 29,
    note: '13° lugar con 21 pts (5V-6E-7D), temporada 2026.' },
  { id: 'austin', name: 'Austin', short: 'AUS', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 37, color: '#00B140', color2: '#1F2937',
    played: 18, wins: 4, draws: 5, losses: 9, goalsFor: 22, goalsAgainst: 36,
    note: '14° lugar con 17 pts (4V-5E-9D), temporada 2026.' },
  { id: 'spor_kans_city', name: 'Sporting Kansas City', short: 'SKC', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 36, color: '#93B1D7', color2: '#002F65',
    played: 18, wins: 4, draws: 2, losses: 12, goalsFor: 18, goalsAgainst: 46,
    note: '15° lugar con 14 pts (4V-2E-12D), temporada 2026.' },
  { id: 'nashvill', name: 'Nashville SC', short: 'NAS', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 55, color: '#ECE83A', color2: '#1D284C',
    played: 18, wins: 12, draws: 4, losses: 2, goalsFor: 35, goalsAgainst: 14,
    note: '1° lugar con 40 pts (12V-4E-2D), temporada 2026.' },
  { id: 'inte_miam', name: 'Inter Miami', short: 'IM', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 54, color: '#F7B5CD', color2: '#000000',
    played: 18, wins: 11, draws: 5, losses: 2, goalsFor: 45, goalsAgainst: 32,
    note: '2° lugar con 38 pts (11V-5E-2D), temporada 2026.' },
  { id: 'new_engl_revo', name: 'New England Revolution', short: 'NER', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 52, color: '#0A2351', color2: '#C8102E',
    played: 17, wins: 9, draws: 3, losses: 5, goalsFor: 28, goalsAgainst: 21,
    note: '3° lugar con 30 pts (9V-3E-5D), temporada 2026.' },
  { id: 'chic_fire', name: 'Chicago Fire', short: 'CF', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 51, color: '#9A3324', color2: '#0F1B5F',
    played: 17, wins: 9, draws: 2, losses: 6, goalsFor: 32, goalsAgainst: 23,
    note: '4° lugar con 29 pts (9V-2E-6D), temporada 2026.' },
  { id: 'new_york_city', name: 'New York City FC', short: 'NYC', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 49, color: '#6CADDF', color2: '#003087',
    played: 18, wins: 7, draws: 5, losses: 6, goalsFor: 31, goalsAgainst: 24,
    note: '5° lugar con 26 pts (7V-5E-6D), temporada 2026.' },
  { id: 'cincinna', name: 'FC Cincinnati', short: 'CIN', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 48, color: '#003087', color2: '#F15A22',
    played: 18, wins: 7, draws: 5, losses: 6, goalsFor: 45, goalsAgainst: 44,
    note: '6° lugar con 26 pts (7V-5E-6D), temporada 2026.' },
  { id: 'charlott', name: 'Charlotte', short: 'CHA', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 47, color: '#1A85C8', color2: '#000000',
    played: 18, wins: 7, draws: 4, losses: 7, goalsFor: 29, goalsAgainst: 27,
    note: '7° lugar con 25 pts (7V-4E-7D), temporada 2026.' },
  { id: 'new_york_red_b', name: 'New York Red Bulls', short: 'NYRB', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 45, color: '#ED1E36', color2: '#001B5E',
    played: 18, wins: 7, draws: 4, losses: 7, goalsFor: 29, goalsAgainst: 39,
    note: '8° lugar con 25 pts (7V-4E-7D), temporada 2026.' },
  { id: 'dc_unit', name: 'DC United', short: 'DU', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 44, color: '#000000', color2: '#EE143C',
    played: 18, wins: 5, draws: 8, losses: 5, goalsFor: 26, goalsAgainst: 29,
    note: '9° lugar con 23 pts (5V-8E-5D), temporada 2026.' },
  { id: 'orla_city', name: 'Orlando City SC', short: 'OC', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 43, color: '#633492', color2: '#F2B0C9',
    played: 18, wins: 6, draws: 2, losses: 10, goalsFor: 30, goalsAgainst: 47,
    note: '10° lugar con 20 pts (6V-2E-10D), temporada 2026.' },
  { id: 'colu_crew', name: 'Columbus Crew', short: 'CC', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 41, color: '#FEDD00', color2: '#000000',
    played: 18, wins: 5, draws: 5, losses: 8, goalsFor: 26, goalsAgainst: 28,
    note: '11° lugar con 20 pts (5V-5E-8D), temporada 2026.' },
  { id: 'toronto', name: 'Toronto FC', short: 'TOR', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 40, color: '#B10E1E', color2: '#000000',
    played: 18, wins: 3, draws: 8, losses: 7, goalsFor: 24, goalsAgainst: 32,
    note: '12° lugar con 17 pts (3V-8E-7D), temporada 2026.' },
  { id: 'phil_unio', name: 'Philadelphia Union', short: 'PU', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 38, color: '#0C2340', color2: '#B19257',
    played: 18, wins: 4, draws: 4, losses: 10, goalsFor: 25, goalsAgainst: 33,
    note: '13° lugar con 16 pts (4V-4E-10D), temporada 2026.' },
  { id: 'montreal', name: 'CF Montreal', short: 'MON', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 37, color: '#000000', color2: '#0033A0',
    played: 18, wins: 4, draws: 4, losses: 10, goalsFor: 24, goalsAgainst: 35,
    note: '14° lugar con 16 pts (4V-4E-10D), temporada 2026.' },
  { id: 'atla_unit', name: 'Atlanta United FC', short: 'AU', league: 'ESTADOS_UNIDOS', country: 'Estados Unidos', basePrice: 36, color: '#80000A', color2: '#A29061',
    played: 18, wins: 3, draws: 3, losses: 12, goalsFor: 19, goalsAgainst: 33,
    note: '15° lugar con 12 pts (3V-3E-12D), temporada 2026.' },
  // ============ Liga Nacional de Honduras — clubes adicionales ============
  { id: 'gnesis', name: 'Génesis', short: 'GNE', league: 'HONDURAS', country: 'Honduras', basePrice: 43, color: '#7A1531', color2: '#FFD100',
    played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0,
    note: '4° lugar con 3 pts (1V-0E-0D), temporada 2026.' },
  { id: 'estr_roja', name: 'Estrella Roja', short: 'ER', league: 'HONDURAS', country: 'Honduras', basePrice: 35, color: '#C8102E', color2: '#000000',
    played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 1,
    note: '6° lugar con 0 pts (0V-0E-1D), temporada 2026.' },
  { id: 'atlt_chol', name: 'Atlético Choloma', short: 'AC', league: 'HONDURAS', country: 'Honduras', basePrice: 31, color: '#0038A8', color2: '#FFFFFF',
    played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 2,
    note: '7° lugar con 0 pts (0V-0E-1D), temporada 2026.' },
  { id: 'atle_inde', name: 'Atletico Independiente', short: 'AI', league: 'HONDURAS', country: 'Honduras', basePrice: 15, color: '#000000', color2: '#C8102E',
    played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
    note: '11° lugar con 0 pts (0V-0E-0D), temporada 2026.' },
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
  LALIGA: 'LaLiga',
  BRASIL: 'Brasileirão',
  ESTADOS_UNIDOS: 'MLS',
  HONDURAS: 'Liga Nacional',
};

/** Rival natural dentro de la liga (para flujo de liquidez en noticias). */
export function leagueRival(teams: Team[], id: string): Team | undefined {
  const t = teams.find((x) => x.id === id);
  if (!t) return undefined;
  const pool = teams.filter((x) => x.league === t.league && x.id !== id);
  return pool[hashId(id) % pool.length];
}
