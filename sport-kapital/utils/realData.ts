// utils/realData.ts
// Tipos compartidos para el calendario/fichajes reales (pestaña "Real").
// Formas livianas y serializables — no guardamos la respuesta cruda de la
// API en el store, solo lo que la UI necesita, para no inflar MMKV.

export interface RealFixtureLite {
  fixtureId: number;
  dateISO: string;
  statusShort: string;   // 'NS' (por jugar) | 'FT' (finalizado) | en vivo, etc.
  competition: string;
  opponentName: string;
  isHome: boolean;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface RealTransferLite {
  playerName: string;
  dateISO: string;
  type: string | null;
  direction: 'IN' | 'OUT';
  otherTeamName: string;
}

/**
 * Partido real de una liga, con AMBOS lados resueltos. Es la pieza que alimenta
 * la cartelera del inicio y la pestaña de partidos: trae los dos equipos (con
 * su id de token interno cuando existe), el marcador y el estado en vivo.
 */
export interface LeagueFixtureLite {
  fixtureId: number;
  dateISO: string;
  statusShort: string;     // 'NS' | '1H' | 'HT' | '2H' | 'FT' | …
  elapsed: number | null;  // minuto en vivo según el reloj oficial
  round: string;           // p. ej. "Regular Season - 22"
  homeName: string;
  awayName: string;
  homeTeamId?: string;     // id interno del token, si el equipo está tokenizado
  awayTeamId?: string;
  goalsHome: number | null;
  goalsAway: number | null;
}

export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
export const UPCOMING_STATUSES = new Set(['NS', 'TBD', 'PST']);
export const LIVE_STATUSES_SET = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);

export function isLive(statusShort: string): boolean { return LIVE_STATUSES_SET.has(statusShort); }
export function isFinished(statusShort: string): boolean { return FINISHED_STATUSES.has(statusShort); }
