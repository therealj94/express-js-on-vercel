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

export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
export const UPCOMING_STATUSES = new Set(['NS', 'TBD', 'PST']);
