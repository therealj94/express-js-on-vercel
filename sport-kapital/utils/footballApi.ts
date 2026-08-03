// utils/footballApi.ts
// Cliente mínimo de api-football.com (v3.football.api-sports.io). Todas las
// funciones son "a prueba de fallos": ante cualquier error de red, clave
// inválida o cuota agotada, devuelven null en vez de lanzar — el motor de
// partidos reales simplemente se salta ese ciclo y sigue con la simulación.

const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.EXPO_PUBLIC_API_FOOTBALL_KEY;
const TIMEOUT_MS = 10_000;

export interface ApiFixtureStatus {
  long: string;
  short: string; // 'NS' | '1H' | 'HT' | '2H' | 'ET' | 'FT' | 'AET' | 'PEN' | 'PST' | 'CANC' | ...
  elapsed: number | null;
}

export interface ApiFixture {
  fixture: { id: number; date: string; status: ApiFixtureStatus };
  league: { id: number; name: string; season: number };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
}

export interface ApiEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  type: string;   // 'Goal' | 'Card' | 'Subst' | 'Var'
  detail: string; // 'Normal Goal' | 'Own Goal' | 'Penalty' | 'Yellow Card' | 'Red Card' | ...
}

export const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);

let lastErrorLoggedAt = 0;
function logOnce(msg: string, detail?: unknown) {
  // evita saturar la consola si la API falla de forma sostenida
  const now = Date.now();
  if (now - lastErrorLoggedAt > 30_000) {
    lastErrorLoggedAt = now;
    console.warn(`[footballApi] ${msg}`, detail ?? '');
  }
}

async function apiGet<T>(path: string): Promise<T[] | null> {
  if (!API_KEY) {
    logOnce('EXPO_PUBLIC_API_FOOTBALL_KEY no está configurada; datos en vivo desactivados.');
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'x-apisports-key': API_KEY },
      signal: controller.signal,
    });
    if (!res.ok) {
      logOnce(`HTTP ${res.status} en ${path}`);
      return null;
    }
    const json = await res.json();
    if (json.errors && Array.isArray(json.errors) ? json.errors.length > 0 : Object.keys(json.errors ?? {}).length > 0) {
      logOnce(`Error de la API en ${path}`, json.errors);
      return null;
    }
    return Array.isArray(json.response) ? (json.response as T[]) : null;
  } catch (err) {
    logOnce(`Fallo de red en ${path}`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Todos los partidos en vivo, de cualquier liga (1 sola llamada). */
export async function fetchLiveFixtures(): Promise<ApiFixture[] | null> {
  return apiGet<ApiFixture>('/fixtures?live=all');
}

/** Eventos (goles, tarjetas) de un partido puntual. */
export async function fetchFixtureEvents(fixtureId: number): Promise<ApiEvent[] | null> {
  return apiGet<ApiEvent>(`/fixtures/events?fixture=${fixtureId}`);
}

/**
 * Estado fresco (minuto real, status) de un partido puntual. Se usa para
 * llevar el minuto en pantalla desde el reloj oficial del partido en vez de
 * calcularlo con el reloj del dispositivo (que puede estar muy desfasado si
 * la app detecta el partido varios minutos después de que arrancó).
 */
export async function fetchFixtureById(fixtureId: number): Promise<ApiFixture[] | null> {
  return apiGet<ApiFixture>(`/fixtures?id=${fixtureId}`);
}

export interface ApiStatEntry { type: string; value: number | string | null }
export interface ApiTeamStatistics { team: { id: number; name: string }; statistics: ApiStatEntry[] }

/** Estadísticas acumuladas (tiros, faltas, córners…) de un partido puntual. */
export async function fetchFixtureStatistics(fixtureId: number): Promise<ApiTeamStatistics[] | null> {
  return apiGet<ApiTeamStatistics>(`/fixtures/statistics?fixture=${fixtureId}`);
}

/** Próximos partidos (hoy) para un equipo puntual — usado para avisos de "juega hoy". */
export async function fetchTodayFixturesForTeam(apiTeamId: number): Promise<ApiFixture[] | null> {
  const today = new Date().toISOString().slice(0, 10);
  return apiGet<ApiFixture>(`/fixtures?team=${apiTeamId}&date=${today}`);
}

/** Partidos de un equipo en un rango de fechas (resultados recientes + calendario próximo). */
export async function fetchTeamFixturesRange(apiTeamId: number, fromISO: string, toISO: string): Promise<ApiFixture[] | null> {
  return apiGet<ApiFixture>(`/fixtures?team=${apiTeamId}&from=${fromISO}&to=${toISO}`);
}

export interface ApiTransfer {
  player: { id: number; name: string };
  update: string;
  transfers: {
    date: string;
    type: string | null;
    teams: {
      in: { id: number; name: string } | null;
      out: { id: number; name: string } | null;
    };
  }[];
}

/** Fichajes recientes de un equipo (entradas y salidas). */
export async function fetchTeamTransfers(apiTeamId: number): Promise<ApiTransfer[] | null> {
  return apiGet<ApiTransfer>(`/transfers?team=${apiTeamId}`);
}

/**
 * Todos los partidos de una LIGA en un rango de fechas — una sola llamada trae
 * la jornada completa de todos sus equipos. Es muchísimo más barato en cuota
 * que pedir el calendario equipo por equipo (4 llamadas para toda la app en vez
 * de una por cada club).
 */
export async function fetchLeagueFixtures(
  leagueId: number, season: number, fromISO: string, toISO: string,
): Promise<ApiFixture[] | null> {
  return apiGet<ApiFixture>(`/fixtures?league=${leagueId}&season=${season}&from=${fromISO}&to=${toISO}`);
}

// ---------- alineaciones ----------
export interface ApiLineupPlayer {
  player: { id: number | null; name: string; number: number | null; pos: string | null; grid: string | null };
}
export interface ApiLineup {
  team: { id: number; name: string };
  formation: string | null;
  coach: { id: number | null; name: string | null } | null;
  startXI: ApiLineupPlayer[];
  substitutes: ApiLineupPlayer[];
}

/** Alineaciones confirmadas de un partido (formación, once inicial y suplentes). */
export async function fetchFixtureLineups(fixtureId: number): Promise<ApiLineup[] | null> {
  return apiGet<ApiLineup>(`/fixtures/lineups?fixture=${fixtureId}`);
}

export function isApiConfigured(): boolean {
  return !!API_KEY;
}
