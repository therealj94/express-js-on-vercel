// data/schedule.ts
// Calendario propio de la app (~1 mes y medio): resultados recientes + partidos
// por venir del Mundial 2026 (fase final), LaLiga (pretemporada + inicio 26/27)
// y la Liga Nacional de Honduras (Apertura 2026). Es autónomo — no depende de
// ninguna API externa, así que la pestaña "Real" siempre tiene contenido.
//
// Cada partido enfrenta dos "lados": puede ser un equipo con token en la app
// (kind:'team') o un rival SIN token (kind:'external'). A los rivales sin token
// se les asigna una CATEGORÍA (tier) y un PRECIO POR TOKEN, para que en el
// calendario igual se vea cuánto "valdría" ese equipo.
import type { League, Tier, Team } from '@/data/teams';
import { tName, tNameEs } from '@/utils/i18n';

export interface ExternalOpponent {
  kind: 'external';
  name: string;
  short: string;
  tier: Tier;
  tokenPrice: number;
  color: string;
  color2: string;
}
export interface TeamOpponent {
  kind: 'team';
  teamId: string;
}
export type OpponentRef = TeamOpponent | ExternalOpponent;

export interface Fixture {
  id: string;
  competition: string;
  league: League;
  dateMs: number;
  home: OpponentRef;
  away: OpponentRef;
  finished: boolean;
  scoreHome?: number;
  scoreAway?: number;
}

// ---------- rivales sin token (se les asigna categoría + precio) ----------
const EXTERNALS: Record<string, Omit<ExternalOpponent, 'kind'>> = {
  // Mundial (Categoría A)
  egy: { name: 'Egipto', short: 'EGY', tier: 1, tokenPrice: 62, color: '#C8102E', color2: '#FFFFFF' },
  col: { name: 'Colombia', short: 'COL', tier: 1, tokenPrice: 74, color: '#FCD116', color2: '#003893' },
  tbd: { name: 'Por definir', short: '—', tier: 1, tokenPrice: 0, color: '#2A2A3A', color2: '#3A3A4A' },
  // LaLiga / amistosos europeos (Categoría A/B)
  mil: { name: 'AC Milan', short: 'MIL', tier: 1, tokenPrice: 120, color: '#FB090B', color2: '#0A0A0A' },
  juv: { name: 'Juventus', short: 'JUV', tier: 1, tokenPrice: 118, color: '#0A0A0A', color2: '#FFFFFF' },
  com: { name: 'Como', short: 'COM', tier: 2, tokenPrice: 60, color: '#005CA9', color2: '#FFFFFF' },
  ovi: { name: 'Real Oviedo', short: 'OVI', tier: 2, tokenPrice: 51, color: '#005BAB', color2: '#FFFFFF' },
  lev: { name: 'Levante', short: 'LEV', tier: 2, tokenPrice: 52, color: '#003DA5', color2: '#B4053B' },
  osa: { name: 'Osasuna', short: 'OSA', tier: 2, tokenPrice: 60, color: '#0A346F', color2: '#D91A21' },
  get: { name: 'Getafe', short: 'GET', tier: 2, tokenPrice: 58, color: '#005999', color2: '#FFFFFF' },
  cel: { name: 'Celta de Vigo', short: 'CEL', tier: 2, tokenPrice: 62, color: '#8AC3EE', color2: '#E4022E' },
  // Liga Nacional de Honduras (Categoría C)
  gen: { name: 'Génesis PN', short: 'GEN', tier: 3, tokenPrice: 20, color: '#E30613', color2: '#FFD100' },
  vic: { name: 'CD Victoria', short: 'VIC', tier: 3, tokenPrice: 17, color: '#E2001A', color2: '#0A0A0A' },
};

// ---------- partidos ----------
// Dos formas de fechar un partido:
//   - `day` (offset relativo a "hoy", negativo = pasado): para contenido de
//     relleno que siempre debe verse "próximo" sin importar cuándo se abra
//     la app (amistosos, arranque de LaLiga, Apertura de Honduras).
//   - `date` (fecha fija [año, mes 1-indexado, día]): para partidos atados a
//     un calendario real que NO debe correrse — el Mundial 2026 en curso.
//     Si se da `date`, tiene prioridad sobre `day`.
interface Raw {
  comp: string;
  league: League;
  day?: number;
  date?: [number, number, number];
  hour: number;
  home: string;   // id de equipo de la app, o 'x:<clave>' para rival externo
  away: string;
  score?: [number, number];
}

const RAW: Raw[] = [
  // ===== MUNDIAL 2026 — fase final =====
  // Fechas fijas del calendario real del torneo (no se recalculan según
  // cuándo se abra la app): octavos ~2/7, cuartos 9-10/7, semifinales
  // 14-15/7, gran final 19/7. Así el estado (jugado / en curso / por jugar)
  // siempre refleja la fecha real de hoy en vez de "siempre en 2 días".
  { comp: 'Mundial 2026 · Octavos', league: 'MUNDIAL', date: [2026, 7, 2], hour: 18, home: 'arg', away: 'x:egy', score: [3, 2] },
  { comp: 'Mundial 2026 · Octavos', league: 'MUNDIAL', date: [2026, 7, 3], hour: 20, home: 'sui', away: 'x:col', score: [1, 1] },
  { comp: 'Mundial 2026 · Cuartos', league: 'MUNDIAL', date: [2026, 7, 9], hour: 15, home: 'fra', away: 'mar', score: [2, 0] },
  { comp: 'Mundial 2026 · Cuartos', league: 'MUNDIAL', date: [2026, 7, 9], hour: 19, home: 'esp', away: 'bel', score: [2, 0] },
  { comp: 'Mundial 2026 · Cuartos', league: 'MUNDIAL', date: [2026, 7, 10], hour: 15, home: 'arg', away: 'sui', score: [1, 0] },
  { comp: 'Mundial 2026 · Cuartos', league: 'MUNDIAL', date: [2026, 7, 10], hour: 19, home: 'eng', away: 'nor', score: [2, 1] },
  { comp: 'Mundial 2026 · Semifinal', league: 'MUNDIAL', date: [2026, 7, 14], hour: 19, home: 'fra', away: 'esp', score: [1, 2] },
  { comp: 'Mundial 2026 · Semifinal', league: 'MUNDIAL', date: [2026, 7, 15], hour: 19, home: 'arg', away: 'eng', score: [3, 1] },
  { comp: 'Mundial 2026 · Tercer puesto', league: 'MUNDIAL', date: [2026, 7, 18], hour: 15, home: 'eng', away: 'fra' },
  // Final a la 1 pm hora local (el horario real de una final del Mundial 2026
  // vista desde Centroamérica: 3 pm ET). Antes estaba a las 18 y el countdown
  // mostraba "faltan 7 horas" a media mañana — se sentía mal.
  { comp: 'Mundial 2026 · Gran Final', league: 'MUNDIAL', date: [2026, 7, 19], hour: 13, home: 'arg', away: 'esp' },

  // ===== LALIGA — pretemporada + arranque 26/27 =====
  { comp: 'Amistoso de pretemporada', league: 'LALIGA', day: -5, hour: 12, home: 'rma', away: 'x:mil', score: [2, 2] },
  { comp: 'Amistoso de pretemporada', league: 'LALIGA', day: -4, hour: 12, home: 'bar', away: 'x:com', score: [3, 1] },
  { comp: 'Amistoso de pretemporada', league: 'LALIGA', day: 8, hour: 13, home: 'atm', away: 'x:juv' },
  { comp: 'Amistoso de pretemporada', league: 'LALIGA', day: 10, hour: 13, home: 'ath', away: 'x:ovi' },
  { comp: 'LaLiga 26/27 · Jornada 1', league: 'LALIGA', day: 34, hour: 16, home: 'bar', away: 'x:lev' },
  { comp: 'LaLiga 26/27 · Jornada 1', league: 'LALIGA', day: 34, hour: 19, home: 'rma', away: 'x:osa' },
  { comp: 'LaLiga 26/27 · Jornada 1', league: 'LALIGA', day: 35, hour: 16, home: 'atm', away: 'x:get' },
  { comp: 'LaLiga 26/27 · Jornada 1', league: 'LALIGA', day: 35, hour: 19, home: 'sev', away: 'x:cel' },
  { comp: 'LaLiga 26/27 · Jornada 1', league: 'LALIGA', day: 36, hour: 18, home: 'bet', away: 'vil' },
  { comp: 'LaLiga 26/27 · Jornada 1', league: 'LALIGA', day: 36, hour: 20, home: 'rso', away: 'ath' },
  { comp: 'LaLiga 26/27 · Jornada 2', league: 'LALIGA', day: 41, hour: 19, home: 'vil', away: 'rma' },
  { comp: 'LaLiga 26/27 · Jornada 2', league: 'LALIGA', day: 42, hour: 21, home: 'atm', away: 'bar' },

  // ===== LIGA NACIONAL DE HONDURAS — Apertura 2026 =====
  { comp: 'Amistoso', league: 'HONDURAS', day: -3, hour: 20, home: 'oli', away: 'x:gen', score: [2, 0] },
  { comp: 'Apertura 2026 · Jornada 1', league: 'HONDURAS', day: 20, hour: 19, home: 'oli', away: 'x:vic' },
  { comp: 'Apertura 2026 · Jornada 1', league: 'HONDURAS', day: 20, hour: 21, home: 'mot', away: 'x:gen' },
  { comp: 'Apertura 2026 · Jornada 1', league: 'HONDURAS', day: 21, hour: 19, home: 'mar_h', away: 'pla' },
  { comp: 'Apertura 2026 · Jornada 1', league: 'HONDURAS', day: 21, hour: 21, home: 'res', away: 'ola' },
  { comp: 'Apertura 2026 · Jornada 1', league: 'HONDURAS', day: 22, hour: 19, home: 'upn', away: 'jut' },
  { comp: 'Apertura 2026 · Jornada 2', league: 'HONDURAS', day: 27, hour: 20, home: 'oli', away: 'mot' },
  { comp: 'Apertura 2026 · Jornada 2', league: 'HONDURAS', day: 28, hour: 19, home: 'mar_h', away: 'res' },
];

function parseSide(token: string): OpponentRef {
  if (token.startsWith('x:')) {
    const key = token.slice(2);
    const ext = EXTERNALS[key];
    return { kind: 'external', ...ext };
  }
  return { kind: 'team', teamId: token };
}

function atOffset(nowMs: number, day: number, hour: number): number {
  const d = new Date(nowMs);
  d.setDate(d.getDate() + day);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function atFixed(y: number, m: number, day: number, hour: number): number {
  return new Date(y, m - 1, day, hour, 0, 0, 0).getTime();
}

function fixtureDateMs(r: Raw, nowMs: number): number {
  if (r.date) return atFixed(r.date[0], r.date[1], r.date[2], r.hour);
  return atOffset(nowMs, r.day ?? 0, r.hour);
}

/** Construye el calendario completo. Los partidos con `date` fija (Mundial) se
 *  anclan al calendario real; el resto se ancla a "ahora" (los próximos
 *  siempre se ven próximos). */
export function buildSchedule(nowMs: number = Date.now()): Fixture[] {
  return RAW.map((r, i) => ({
    id: `fx-${i}`,
    competition: r.comp,
    league: r.league,
    dateMs: fixtureDateMs(r, nowMs),
    home: parseSide(r.home),
    away: parseSide(r.away),
    finished: r.score != null,
    scoreHome: r.score?.[0],
    scoreAway: r.score?.[1],
  }));
}

/** Próximos (por jugar), ordenados del más cercano al más lejano. */
export function upcomingFixtures(all: Fixture[], nowMs: number = Date.now()): Fixture[] {
  return all.filter((f) => !f.finished && f.dateMs >= nowMs - 3 * 3600_000).sort((a, b) => a.dateMs - b.dateMs);
}

/** Resultados recientes (ya jugados), del más reciente al más antiguo. */
export function recentResults(all: Fixture[]): Fixture[] {
  return all.filter((f) => f.finished).sort((a, b) => b.dateMs - a.dateMs);
}

/** Todos los partidos del Mundial 2026 (octavos → final), en orden cronológico. */
export function mundialFixtures(all: Fixture[]): Fixture[] {
  return all.filter((f) => f.league === 'MUNDIAL').sort((a, b) => a.dateMs - b.dateMs);
}

// ---------- fase en vivo de un partido (para el Mundial simulado) ----------
// El Mundial 2026 de la app es ficticio, así que sus partidos por jugar (tercer
// puesto, gran final) los simula la propia app atados a su horario:
//   - 'scheduled': falta más de 1 h → solo cuenta regresiva.
//   - 'pre':       dentro de la última hora antes del inicio → "se abre" para
//                  operar, con la cuenta regresiva al saque.
//   - 'live':      del saque hasta ~105 min después → partido en vivo (minuto en
//                  tiempo real, precios moviéndose).
//   - 'done':      terminado → resultado final.
export const MATCH_PRE_OPEN_MS = 60 * 60 * 1000;   // se abre 1 h antes
export const MATCH_PLAY_MS = 105 * 60 * 1000;      // ~105 min reales (90 + descanso)
export type MatchPhase = 'scheduled' | 'pre' | 'live' | 'done';

export function matchPhase(dateMs: number, nowMs: number = Date.now()): MatchPhase {
  if (nowMs < dateMs - MATCH_PRE_OPEN_MS) return 'scheduled';
  if (nowMs < dateMs) return 'pre';
  if (nowMs < dateMs + MATCH_PLAY_MS) return 'live';
  return 'done';
}

/** Minuto en vivo (0–90) a partir del tiempo real transcurrido desde el saque. */
export function liveMinute(dateMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.min(90, Math.floor((nowMs - dateMs) / 60_000)));
}

/** Resultado determinístico (estable por partido) para un partido del Mundial
 *  que ya "ocurrió" pero que la app no llegó a simular en vivo (app cerrada).
 *  Así el cuadro siempre muestra un marcador coherente. */
export function seededResult(fx: Pick<Fixture, 'id' | 'competition'>): [number, number] {
  let h = 0;
  const s = `${fx.id}|${fx.competition}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  let a = h % 4;              // 0–3
  let b = Math.floor(h / 7) % 4;
  if (a === b) a = (a + 1) % 4 === b ? a + 2 : a + 1; // knockouts: evita empate
  return [a, b];
}

// ---------- "lado" resuelto de un partido, listo para pintar en pantalla ----------
export interface Side { teamId?: string; name: string; short: string; color: string; color2: string; price: number; tier: Tier; external: boolean }

export function resolveSide(ref: OpponentRef, teams: Team[]): Side | null {
  if (ref.kind === 'team') {
    const t = teams.find((x) => x.id === ref.teamId);
    if (!t) return null;
    return { teamId: t.id, name: tName(t), short: t.short, color: t.color, color2: t.color2, price: t.currentPrice, tier: t.tier, external: false };
  }
  return { name: tNameEs(ref.name), short: ref.short, color: ref.color, color2: ref.color2, price: ref.tokenPrice, tier: ref.tier, external: true };
}
