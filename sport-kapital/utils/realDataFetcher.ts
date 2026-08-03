// utils/realDataFetcher.ts
// Refresca en segundo plano el calendario y los fichajes reales de cada
// equipo mapeado, y los guarda en el store (pestaña "Real").
//
// Muy cuidadoso con la cuota del plan gratis de api-football.com:
//   - 2 llamadas por equipo (fixtures + transfers).
//   - 7s de pausa entre cada llamada (el plan gratis limita peticiones por
//     minuto — lo confirmamos empíricamente al mapear los equipos).
//   - Solo se repite si el caché tiene más de REAL_DATA_STALE_MS de viejo,
//     y los resultados se guardan en el store para sobrevivir a cerrar la app.
//   - Actualiza el store equipo por equipo, así la pestaña Real se va
//     llenando progresivamente en vez de esperar a que termine todo.
import { fetchTeamFixturesRange, fetchTeamTransfers, isApiConfigured, type ApiFixture, type ApiTransfer } from './footballApi';
import { TEAM_API_MAPPING } from '@/data/teamApiMapping';
import { useStore } from '@/store/useStore';
import type { RealFixtureLite, RealTransferLite } from './realData';

// con los 24 equipos ya mapeados, un refresco completo son 48 peticiones
// (2 por equipo); sumado a las ~48/día del motor de partidos en vivo, un
// ciclo de 24h dejaría casi sin margen la cuota diaria del plan gratis
// (~100/día) — por eso cada 48h en vez de 24h.
const REAL_DATA_STALE_MS = 48 * 60 * 60_000; // 48h
const FETCH_SPACING_MS = 7000;
const DAYS_BACK = 14;
const DAYS_FORWARD = 14;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function toLiteFixtures(fixtures: ApiFixture[], apiTeamId: number): RealFixtureLite[] {
  return fixtures.map((f) => {
    const isHome = f.teams.home.id === apiTeamId;
    return {
      fixtureId: f.fixture.id,
      dateISO: f.fixture.date,
      statusShort: f.fixture.status.short,
      competition: f.league.name,
      opponentName: isHome ? f.teams.away.name : f.teams.home.name,
      isHome,
      goalsFor: isHome ? f.goals.home : f.goals.away,
      goalsAgainst: isHome ? f.goals.away : f.goals.home,
    };
  }).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

function toLiteTransfers(transfers: ApiTransfer[], apiTeamId: number): RealTransferLite[] {
  const out: RealTransferLite[] = [];
  for (const rec of transfers) {
    for (const t of rec.transfers) {
      const isIn = t.teams.in?.id === apiTeamId;
      const isOut = t.teams.out?.id === apiTeamId;
      if (!isIn && !isOut) continue;
      const otherTeam = isIn ? t.teams.out : t.teams.in;
      out.push({
        playerName: rec.player.name,
        dateISO: t.date,
        type: t.type,
        direction: isIn ? 'IN' : 'OUT',
        otherTeamName: otherTeam?.name ?? '—',
      });
    }
  }
  return out.sort((a, b) => b.dateISO.localeCompare(a.dateISO)).slice(0, 8);
}

/**
 * Refresca el caché de calendario/fichajes si está vencido (o si `force` es
 * true). Se puede llamar tanto al arrancar la app como desde un botón de
 * "actualizar" manual en la pestaña Real.
 */
export async function refreshRealData(force = false): Promise<void> {
  if (!isApiConfigured()) return;
  const store = useStore.getState();
  if (!force && Date.now() - store.realDataFetchedAt < REAL_DATA_STALE_MS) return;
  if (store.isFetchingReal) return;

  const mappedEntries = Object.entries(TEAM_API_MAPPING).filter(([, m]) => m.apiTeamId != null);
  if (mappedEntries.length === 0) return;

  useStore.getState().setIsFetchingReal(true);
  try {
    const from = isoDate(-DAYS_BACK);
    const to = isoDate(DAYS_FORWARD);

    for (const [internalId, mapping] of mappedEntries) {
      const apiTeamId = mapping.apiTeamId as number;

      const fixtures = await fetchTeamFixturesRange(apiTeamId, from, to);
      if (fixtures) useStore.getState().setRealFixtures(internalId, toLiteFixtures(fixtures, apiTeamId));
      await sleep(FETCH_SPACING_MS);

      const transfers = await fetchTeamTransfers(apiTeamId);
      if (transfers) useStore.getState().setRealTransfers(internalId, toLiteTransfers(transfers, apiTeamId));
      await sleep(FETCH_SPACING_MS);
    }

    useStore.getState().setRealDataFetchedAt(Date.now());
  } finally {
    useStore.getState().setIsFetchingReal(false);
  }
}
