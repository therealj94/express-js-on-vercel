// data/leagues.ts
// Identificadores reales de cada liga en api-football.com, confirmados contra
// la API (/leagues). Con esto la app pide la jornada COMPLETA de una liga en
// una sola llamada, en vez de preguntar equipo por equipo.
import type { League } from '@/data/teams';

export interface LeagueApi {
  id: number;
  season: number;
  /** Nombre corto para encabezados de sección. */
  label: string;
  country: string;
}

export const LEAGUE_API: Record<League, LeagueApi> = {
  LALIGA: { id: 140, season: 2026, label: 'LaLiga', country: 'España' },
  BRASIL: { id: 71, season: 2026, label: 'Brasileirão', country: 'Brasil' },
  ESTADOS_UNIDOS: { id: 253, season: 2026, label: 'MLS', country: 'Estados Unidos' },
  HONDURAS: { id: 234, season: 2026, label: 'Liga Nacional', country: 'Honduras' },
};

/** Orden en el que se muestran las ligas en la app. */
export const LEAGUE_ORDER: League[] = ['LALIGA', 'BRASIL', 'ESTADOS_UNIDOS', 'HONDURAS'];

export function leagueFromApiId(apiLeagueId: number): League | undefined {
  return LEAGUE_ORDER.find((l) => LEAGUE_API[l].id === apiLeagueId);
}
