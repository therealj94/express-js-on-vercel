// utils/leagueFixtures.ts
// Trae la cartelera REAL de cada liga (una sola llamada por liga) y la guarda
// en el store. Es la fuente de verdad de "qué se juega" en toda la app: la
// cartelera del inicio, la pestaña de partidos y el calendario de cada equipo
// salen todos de acá.
//
// Coste en cuota: 4 llamadas por refresco (una por liga) para TODAS las ligas y
// todos los equipos — antes se pedía equipo por equipo (2 por club), que con 70
// clubes eran 140 llamadas y varios minutos de espera.
import { fetchLeagueFixtures, isApiConfigured, type ApiFixture } from './footballApi';
import { LEAGUE_API, LEAGUE_ORDER } from '@/data/leagues';
import { internalIdForApiTeam } from '@/data/teamApiMapping';
import { useStore } from '@/store/useStore';
import type { LeagueFixtureLite } from './realData';
import type { League } from '@/data/teams';

const STALE_MS = 30 * 60_000;      // media hora: la cartelera cambia poco
const SPACING_MS = 1200;           // respiro entre ligas para no golpear el rate limit
const DAYS_BACK = 7;
const DAYS_FORWARD = 21;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function toLite(fixtures: ApiFixture[]): LeagueFixtureLite[] {
  return fixtures
    .map((f) => ({
      fixtureId: f.fixture.id,
      dateISO: f.fixture.date,
      statusShort: f.fixture.status.short,
      elapsed: f.fixture.status.elapsed,
      round: (f.league as { round?: string }).round ?? '',
      homeName: f.teams.home.name,
      awayName: f.teams.away.name,
      homeTeamId: internalIdForApiTeam(f.teams.home.id),
      awayTeamId: internalIdForApiTeam(f.teams.away.id),
      goalsHome: f.goals.home,
      goalsAway: f.goals.away,
    }))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

/**
 * Refresca la cartelera de todas las ligas si el caché está vencido (o si
 * `force`). A prueba de fallos: si una liga falla, las demás siguen.
 */
export async function refreshLeagueFixtures(force = false): Promise<void> {
  if (!isApiConfigured()) return;
  const s = useStore.getState();
  if (!force && Date.now() - s.leagueFixturesAt < STALE_MS) return;
  if (s.isFetchingFixtures) return;

  useStore.getState().setIsFetchingFixtures(true);
  try {
    const from = isoDate(-DAYS_BACK);
    const to = isoDate(DAYS_FORWARD);
    for (const league of LEAGUE_ORDER) {
      const api = LEAGUE_API[league];
      const res = await fetchLeagueFixtures(api.id, api.season, from, to);
      if (res) useStore.getState().setLeagueFixtures(league, toLite(res));
      await sleep(SPACING_MS);
    }
    useStore.getState().setLeagueFixturesAt(Date.now());
  } finally {
    useStore.getState().setIsFetchingFixtures(false);
  }
}

/** Todos los partidos cacheados, de todas las ligas, con su liga adjunta. */
export function allFixtures(byLeague: Record<string, LeagueFixtureLite[]>): (LeagueFixtureLite & { league: League })[] {
  const out: (LeagueFixtureLite & { league: League })[] = [];
  for (const league of LEAGUE_ORDER) {
    for (const fx of byLeague[league] ?? []) out.push({ ...fx, league });
  }
  return out;
}

/** Partidos de un equipo tokenizado (por su id interno), en orden cronológico. */
export function fixturesForTeam(
  byLeague: Record<string, LeagueFixtureLite[]>, teamId: string,
): (LeagueFixtureLite & { league: League })[] {
  return allFixtures(byLeague)
    .filter((f) => f.homeTeamId === teamId || f.awayTeamId === teamId)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}
