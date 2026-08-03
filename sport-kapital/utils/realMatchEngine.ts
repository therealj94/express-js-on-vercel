// utils/realMatchEngine.ts
// Motor de partidos REALES: consulta api-football.com y mueve el precio de
// tus tokens según resultados oficiales, de dos formas:
//
//   1. DERBI (dos de tus equipos mapeados juegan entre sí): tarjeta de
//      "partido en vivo" completa, minuto a minuto, con el mismo mecanismo
//      de liquidez cero-suma que el motor simulado — lo que gana un token lo
//      pierde exactamente su rival.
//   2. PARTIDO EXTERNO (uno de tus equipos juega contra un rival que no es
//      un token de la app): no hay tarjeta de partido (no hay escudo/token
//      del rival que mostrar), pero el resultado real SÍ mueve el precio de
//      tu token — sube con goles a favor, baja con goles en contra y
//      tarjetas propias — y se avisa por noticias. No es cero-suma porque no
//      hay un segundo token del que tomar la liquidez.
//
// Cada ciclo de sondeo (cada POLL_EVENTS_INTERVAL_MS) hace 3 llamadas por
// partido en seguimiento: el estado del fixture (para el minuto real),
// los eventos oficiales (goles, tarjetas) y las estadísticas acumuladas
// (tiros a puerta, faltas, córners) — estas últimas se comparan contra el
// último sondeo para sintetizar eventos TIRO/FALTA/CORNER equivalentes a
// los del motor simulado, ya que la API no los expone como "eventos"
// puntuales, solo como contadores acumulados.
//
// Diseñado para ser muy económico en cuota (plan gratis = 100 req/día):
//   - Revisa partidos en vivo cada CHECK_LIVE_INTERVAL_MS (30 min por
//     defecto) con UNA sola llamada a /fixtures?live=all → ~48 req/día.
//   - Solo cuando detecta un partido en vivo de un equipo mapeado, empieza a
//     sondear cada POLL_EVENTS_INTERVAL_MS (4 min): fixture + eventos +
//     estadísticas (3 llamadas). Con 1-2 partidos reales en seguimiento a la
//     vez (lo normal: solo hay Mundial en ciertas fechas) esto se mantiene
//     muy por debajo de la cuota gratuita.
//   - Si algo falla (sin red, key inválida, cuota agotada), no lanza
//     excepción: se salta el ciclo y el mercado simulado sigue solo.
//
// Ajusta los intervalos si tienes un plan de pago con más cuota.

import {
  fetchLiveFixtures, fetchFixtureEvents, fetchFixtureById, fetchFixtureStatistics,
  isApiConfigured, LIVE_STATUSES, type ApiFixture, type ApiEvent, type ApiStatEntry,
} from './footballApi';
import { mappedApiTeamIds, internalIdForApiTeam } from '@/data/teamApiMapping';
import type { Team, League } from '@/data/teams';
import type { LiveMatch, NewsItem, PriceMove, MatchEvent, MatchEventKind } from './matchEngine';
import { IMPACT } from './matchEngine';
import { t, tName } from './i18n';

// Con plan de pago (más llamadas disponibles) sondeamos mucho más seguido para
// que los datos en vivo (goles, tarjetas, minuto, marcador) lleguen rápido.
const CHECK_LIVE_INTERVAL_MS = 8 * 60_000;   // busca partidos en vivo cada 8 min
const POLL_EVENTS_INTERVAL_MS = 20_000;      // sondea el partido en curso cada 20 s
const LIVE_TICK_MS = 7_000;                  // "latido" local del partido en vivo (tiros/faltas/córners)
const GOAL_PCT = 3.2;
const RED_CARD_PCT = -1.9;
const YELLOW_CARD_PCT = -0.45;
const RESULT_SETTLE_PCT = 1.6;
const MAX_STAT_EVENTS_PER_POLL = 6; // evita ráfagas de eventos si un sondeo se salta varios minutos

// Probabilidad por "latido" (cada LIVE_TICK_MS) de generar cada evento de
// textura mientras el partido está EN VIVO. La API no transmite tiros/faltas/
// córners como eventos puntuales en tiempo real (solo goles y tarjetas, más
// estadísticas acumuladas), así que los generamos localmente para que el precio
// se mueva de forma continua durante el partido — los GOLES, TARJETAS, minuto y
// marcador siguen siendo 100% reales de la API.
// Con "latido" cada 7 s, un partido en vivo (~90 min reales) tiene ~770 ticks.
// Estas probabilidades por tick dan ~23 tiros, ~19 faltas y ~12 córners por
// partido (un poco más vivo que el motor simulado, sin inundar de eventos).
const TICK_PROB: [MatchEventKind, number][] = [
  ['TIRO', 0.03], ['FALTA', 0.025], ['CORNER', 0.015],
];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const r2 = (n: number) => Math.round(n * 100) / 100;
const jitter = () => 0.85 + Math.random() * 0.3;

export interface RealEndedMatch {
  id: string; league: League;
  homeShort: string; awayShort: string;
  homeColor: string; homeColor2: string; awayColor: string; awayColor2: string;
  scoreHome: number; scoreAway: number;
}

export interface RealEngineCallbacks {
  getTeams: () => Team[];
  applyMoves: (moves: PriceMove[], pushCandle: boolean) => void;
  onMatchUpdate: (m: LiveMatch) => void;
  onNews: (n: NewsItem) => void;
  // un partido real terminó: para guardarlo en "partidos pasados".
  onRealMatchEnded?: (m: RealEndedMatch) => void;
}

interface EventImpact { targetIsEventTeam: boolean; pct: number }

function computeImpact(ev: ApiEvent): EventImpact | null {
  if (ev.type === 'Goal') {
    if (ev.detail === 'Missed Penalty') return null;
    // el autogol lo dispara un jugador del equipo que lo sufre; el beneficio es para el rival
    return ev.detail === 'Own Goal' ? { targetIsEventTeam: false, pct: GOAL_PCT } : { targetIsEventTeam: true, pct: GOAL_PCT };
  }
  if (ev.type === 'Card') {
    // detección robusta: la API usa 'Red Card', 'Yellow Card' y a veces
    // 'Second Yellow card' (que es expulsión). Cualquier variante con "Red" o
    // "Second Yellow" cuenta como roja; el resto de tarjetas, como amarilla.
    const d = (ev.detail || '').toLowerCase();
    if (d.includes('red') || d.includes('second yellow')) return { targetIsEventTeam: true, pct: RED_CARD_PCT };
    if (d.includes('yellow')) return { targetIsEventTeam: true, pct: YELLOW_CARD_PCT };
  }
  return null;
}

function eventKey(ev: ApiEvent): string {
  return `${ev.time.elapsed}-${ev.time.extra ?? 0}-${ev.type}-${ev.detail}-${ev.team.id}-${ev.player.name ?? ''}`;
}

// ---------------------------------------------------------------------
// Estadísticas acumuladas → eventos sintéticos (tiros, faltas, córners).
// La API solo da contadores totales por equipo, no eventos puntuales, así
// que cada sondeo compara contra el conteo anterior y genera un evento por
// cada unidad de aumento (con tope MAX_STAT_EVENTS_PER_POLL para evitar
// ráfagas si un sondeo se salta varios minutos de partido).
// ---------------------------------------------------------------------

// Snapshot COMPLETO de estadísticas oficiales de un equipo (api-football):
// todo lo que la API expone del partido, para el panel en vivo y para mover
// el precio con los deltas reales entre sondeos.
interface StatSnapshot {
  shotsOn: number;      // Shots on Goal
  shotsOff: number;     // Shots off Goal
  shotsTotal: number;   // Total Shots
  fouls: number;
  corners: number;
  offsides: number;
  saves: number;        // Goalkeeper Saves
}

function toNum(v: number | string | null): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
  return 0;
}

function readSnapshot(stats: ApiStatEntry[]): StatSnapshot {
  const find = (type: string) => stats.find((s) => s.type === type)?.value ?? null;
  return {
    shotsOn: toNum(find('Shots on Goal')),
    shotsOff: toNum(find('Shots off Goal')),
    shotsTotal: toNum(find('Total Shots')),
    fouls: toNum(find('Fouls')),
    corners: toNum(find('Corner Kicks')),
    offsides: toNum(find('Offsides')),
    saves: toNum(find('Goalkeeper Saves')),
  };
}

/** Posesión de la pelota en % (viene como "55%" o número). null si no está. */
function readPossession(stats: ApiStatEntry[]): number | null {
  const v = stats.find((s) => s.type === 'Ball Possession')?.value ?? null;
  if (typeof v === 'string') { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return null;
}

/** Genera (hasta un tope) los MatchEvent REALES por el aumento de un contador oficial entre dos sondeos. */
function statDeltaEvents(kind: MatchEventKind, delta: number, team: Team, minute: number, cap = MAX_STAT_EVENTS_PER_POLL): MatchEvent[] {
  const count = Math.max(0, Math.min(delta, cap));
  const out: MatchEvent[] = [];
  for (let i = 0; i < count; i++) {
    const impact = r2(IMPACT[kind] * jitter());
    const text = kind === 'TIRO' ? t('ev.tiro', { team: tName(team), min: minute })
      : kind === 'FALTA' ? t('ev.falta', { team: tName(team), min: minute })
      : t('ev.corner', { team: tName(team), min: minute });
    out.push({ id: uid(), minute, kind, teamId: team.id, text, impact, ts: Date.now() });
  }
  return out;
}

/** Convierte el snapshot oficial en las estadísticas que se pintan en pantalla. */
function toLiveStats(snap: StatSnapshot, yellows: number, reds: number): import('./matchEngine').LiveTeamStats {
  return {
    shotsOn: snap.shotsOn, shotsOff: snap.shotsOff, shotsTotal: snap.shotsTotal,
    corners: snap.corners, fouls: snap.fouls, offsides: snap.offsides, saves: snap.saves,
    yellows, reds,
  };
}

/**
 * Backfill REAL del feed: al detectar un partido ya empezado (o al reabrir la
 * app), reconstruye tiros/faltas/córners desde los TOTALES oficiales de la API,
 * repartiendo los minutos a lo largo de lo ya jugado. Es historia (no mueve el
 * precio) pero deja el feed completo y fiel a los números reales del partido.
 */
function backfillFromTotals(team: Team, snap: StatSnapshot, upToMinute: number): MatchEvent[] {
  const out: MatchEvent[] = [];
  const emit = (kind: MatchEventKind, total: number, cap: number) => {
    const n = Math.min(total, cap);
    for (let i = 0; i < n; i++) {
      const minute = Math.max(1, Math.round((upToMinute * (i + 1)) / (n + 1)));
      const text = kind === 'TIRO' ? t('ev.tiro', { team: tName(team), min: minute })
        : kind === 'FALTA' ? t('ev.falta', { team: tName(team), min: minute })
        : t('ev.corner', { team: tName(team), min: minute });
      out.push({ id: uid(), minute, kind, teamId: team.id, text, impact: r2(IMPACT[kind] * jitter()), ts: Date.now() });
    }
  };
  emit('TIRO', snap.shotsOn, 8);
  emit('CORNER', snap.corners, 6);
  emit('FALTA', snap.fouls, 8);
  return out;
}

interface TrackedDerby {
  fixtureId: number;
  liveMatchId: string;
  homeInternalId: string;
  awayInternalId: string;
  homeApiId: number;
  awayApiId: number;
  league: League;
  startedAt: number;
  seenEventKeys: Set<string>;
  lastScoreHome: number;
  lastScoreAway: number;
  events: MatchEvent[];
  lastStats: Map<string, StatSnapshot>; // por id interno de equipo
  knownMinute: number;
  knownStatus: 'LIVE' | 'HT' | 'FT';
  possHome?: number;   // posesión de la pelota en % (de estadísticas oficiales)
  possAway?: number;
  statHome?: StatSnapshot;   // último snapshot oficial (para el panel en vivo)
  statAway?: StatSnapshot;
  cards: { hY: number; hR: number; aY: number; aR: number };  // tarjetas contadas de eventos reales
}

interface TrackedSolo {
  fixtureId: number;
  internalId: string;    // el equipo mapeado (nuestro token)
  apiTeamId: number;     // su id real en api-football
  opponentName: string;  // solo para el texto de las noticias
  startedAt: number;
  seenEventKeys: Set<string>;
  goalsFor: number;
  goalsAgainst: number;
  lastStats: StatSnapshot | null;   // null hasta el primer sondeo (fija la base)
  knownMinute: number;
  knownStatus: 'LIVE' | 'HT' | 'FT';
}

export class RealMatchEngine {
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private eventTimers = new Map<number, ReturnType<typeof setInterval>>();
  private derbies = new Map<number, TrackedDerby>();
  private solos = new Map<number, TrackedSolo>();
  private running = false;

  constructor(private cb: RealEngineCallbacks) {}

  start() {
    if (!isApiConfigured() || this.running) return;
    this.running = true;
    // toda comprobación en vivo es a prueba de fallos; además atrapamos el
    // rechazo de la promesa flotante para que nunca escape como excepción.
    const kick = () => { this.checkLive().catch((e) => console.warn('[realEngine] checkLive', e)); };
    kick();
    this.liveTimer = setInterval(kick, CHECK_LIVE_INTERVAL_MS);
    // latido local: mueve el precio con tiros/faltas/córners mientras hay un
    // partido en vivo (la API no transmite esos eventos en tiempo real).
    this.tickTimer = setInterval(() => this.tickLive(), LIVE_TICK_MS);
  }

  stop() {
    this.running = false;
    if (this.liveTimer) clearInterval(this.liveTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.liveTimer = null;
    this.tickTimer = null;
    for (const t of this.eventTimers.values()) clearInterval(t);
    this.eventTimers.clear();
    this.derbies.clear();
    this.solos.clear();
  }

  /** Fuerza un sondeo inmediato de todos los partidos en curso (para el
   *  "deslizar para actualizar" en la pantalla del partido). Si no hay ninguno
   *  en seguimiento todavía, busca partidos en vivo. A prueba de fallos. */
  async pokeNow(): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const id of this.derbies.keys()) jobs.push(this.pollDerby(id).catch(() => {}));
    for (const id of this.solos.keys()) jobs.push(this.pollSolo(id).catch(() => {}));
    if (jobs.length === 0) jobs.push(this.checkLive().catch(() => {}));
    await Promise.all(jobs);
  }

  // ---------------------------------------------------------------------
  // "Latido" local del partido en vivo: micro-flujo de mercado entre los dos
  // tokens mientras el partido está EN VIVO, para que el precio respire de
  // forma continua entre sondeos. NO agrega eventos al feed — el feed es 100%
  // real: goles y tarjetas de la API como eventos puntuales, y tiros/faltas/
  // córners por los DELTAS de las estadísticas oficiales en cada sondeo.
  // ---------------------------------------------------------------------
  private tickLive() {
    const teams = this.cb.getTeams();
    if (teams.length < 2) return;

    for (const tm of this.derbies.values()) {
      if (tm.knownStatus !== 'LIVE') continue;
      const home = teams.find((t) => t.id === tm.homeInternalId);
      const away = teams.find((t) => t.id === tm.awayInternalId);
      if (!home || !away) continue;
      for (const [kind, prob] of TICK_PROB) {
        if (Math.random() >= prob) continue;
        const towardHome = Math.random() < 0.5;
        const team = towardHome ? home : away;
        const rival = towardHome ? away : home;
        // mitad del impacto normal: es respiración de mercado, no un evento
        const impact = r2(IMPACT[kind] * jitter() * 0.5);
        this.cb.applyMoves([{ id: team.id, pct: impact }, { id: rival.id, pct: r2(-impact) }], false);
      }
    }

    for (const tm of this.solos.values()) {
      if (tm.knownStatus !== 'LIVE') continue;
      const team = teams.find((t) => t.id === tm.internalId);
      if (!team) continue;
      for (const [kind, prob] of TICK_PROB) {
        if (Math.random() >= prob) continue;
        const impact = r2(IMPACT[kind] * jitter() * 0.5);
        this.cb.applyMoves([{ id: tm.internalId, pct: impact }], false);
      }
    }
  }

  private async checkLive() {
    if (mappedApiTeamIds().length < 1) return; // ningún equipo mapeado todavía
    const fixtures = await fetchLiveFixtures();
    if (!fixtures) return;

    const liveFixtureIds = new Set(
      fixtures.filter((f) => LIVE_STATUSES.has(f.fixture.status.short)).map((f) => f.fixture.id)
    );

    for (const fx of fixtures) {
      if (!LIVE_STATUSES.has(fx.fixture.status.short)) continue;
      if (this.derbies.has(fx.fixture.id) || this.solos.has(fx.fixture.id)) continue;

      const homeInternalId = internalIdForApiTeam(fx.teams.home.id);
      const awayInternalId = internalIdForApiTeam(fx.teams.away.id);
      if (!homeInternalId && !awayInternalId) continue; // ninguno de los dos es un token nuestro

      if (homeInternalId && awayInternalId) {
        this.beginDerbyTracking(fx, homeInternalId, awayInternalId);
      } else {
        const internalId = (homeInternalId ?? awayInternalId) as string;
        const isHome = Boolean(homeInternalId);
        const apiTeamId = isHome ? fx.teams.home.id : fx.teams.away.id;
        const opponentName = isHome ? fx.teams.away.name : fx.teams.home.name;
        this.beginSoloTracking(fx, internalId, apiTeamId, opponentName);
      }
    }

    for (const fixtureId of Array.from(this.derbies.keys())) {
      if (!liveFixtureIds.has(fixtureId)) await this.finishDerbyTracking(fixtureId);
    }
    for (const fixtureId of Array.from(this.solos.keys())) {
      if (!liveFixtureIds.has(fixtureId)) this.finishSoloTracking(fixtureId);
    }
  }

  // ---------------------------------------------------------------------
  // DERBI: dos tokens de la app se enfrentan — cero-suma entre ambos.
  // ---------------------------------------------------------------------

  private beginDerbyTracking(fx: ApiFixture, homeInternalId: string, awayInternalId: string) {
    const teams = this.cb.getTeams();
    const home = teams.find((t) => t.id === homeInternalId);
    const away = teams.find((t) => t.id === awayInternalId);
    if (!home || !away) return;

    const liveMatchId = `real-${fx.fixture.id}`;
    const elapsed = fx.fixture.status.elapsed ?? 0;
    // feed inicial: solo el saque — si el partido ya está empezado, el primer
    // sondeo de estadísticas reconstruye el feed desde los TOTALES OFICIALES
    // (backfillFromTotals), así todo lo listado sale de datos reales.
    const inicio: MatchEvent = { id: uid(), minute: 0, kind: 'INICIO', teamId: home.id, text: t('ev.inicio'), impact: 0, ts: Date.now() };
    const tm: TrackedDerby = {
      fixtureId: fx.fixture.id, liveMatchId, homeInternalId, awayInternalId,
      homeApiId: fx.teams.home.id, awayApiId: fx.teams.away.id,
      league: home.league, startedAt: Date.now(),
      seenEventKeys: new Set(), lastScoreHome: 0, lastScoreAway: 0, events: [inicio],
      lastStats: new Map(), knownMinute: elapsed, knownStatus: 'LIVE',
      cards: { hY: 0, hR: 0, aY: 0, aR: 0 },
    };
    this.derbies.set(fx.fixture.id, tm);

    this.cb.onMatchUpdate({
      id: liveMatchId, league: home.league, homeId: home.id, awayId: away.id,
      minute: tm.knownMinute, scoreHome: 0, scoreAway: 0, status: 'LIVE',
      events: tm.events,
      startedAt: Date.now(),
      source: 'REAL',
    });

    this.cb.onNews({
      id: uid(), source: 'PARTIDO', teamId: home.id, rivalId: away.id, impact: 0, ts: Date.now(),
      headline: t('ng.realKickoffH', { home: tName(home), away: tName(away) }),
      body: t('ng.realKickoffB'),
    });

    const timer = setInterval(() => this.pollDerby(fx.fixture.id), POLL_EVENTS_INTERVAL_MS);
    this.eventTimers.set(fx.fixture.id, timer);
    this.pollDerby(fx.fixture.id);
  }

  private async pollDerby(fixtureId: number) {
    const tm = this.derbies.get(fixtureId);
    if (!tm) return;

    const [fixtures, events, stats] = await Promise.all([
      fetchFixtureById(fixtureId),
      fetchFixtureEvents(fixtureId),
      fetchFixtureStatistics(fixtureId),
    ]);

    const teams = this.cb.getTeams();
    const home = teams.find((t) => t.id === tm.homeInternalId);
    const away = teams.find((t) => t.id === tm.awayInternalId);
    if (!home || !away) return;

    // Minuto y estado reales del partido (evita depender del reloj del dispositivo).
    const fx = fixtures?.[0];
    if (fx) {
      if (fx.fixture.status.elapsed != null) tm.knownMinute = fx.fixture.status.elapsed;
      tm.knownStatus = fx.fixture.status.short === 'HT' ? 'HT' : fx.fixture.status.short === 'FT' ? 'FT' : 'LIVE';
    }

    let scoreHome = 0;
    let scoreAway = 0;

    if (events) {
      for (const ev of events) {
        const isHomeEventTeam = ev.team.id === tm.homeApiId;

        if (ev.type === 'Goal' && ev.detail !== 'Missed Penalty') {
          const scoringIsHome = ev.detail === 'Own Goal' ? !isHomeEventTeam : isHomeEventTeam;
          if (scoringIsHome) scoreHome++; else scoreAway++;
        }

        const key = eventKey(ev);
        if (tm.seenEventKeys.has(key)) continue;
        tm.seenEventKeys.add(key);

        const info = computeImpact(ev);
        if (!info) continue;

        const eventTeamInternalId = isHomeEventTeam ? home.id : away.id;
        const rivalInternalId = isHomeEventTeam ? away.id : home.id;
        const primaryId = info.targetIsEventTeam ? eventTeamInternalId : rivalInternalId;
        const rivalId = info.targetIsEventTeam ? rivalInternalId : eventTeamInternalId;

        this.cb.applyMoves([{ id: primaryId, pct: info.pct }, { id: rivalId, pct: r2(-info.pct) }], false);

        const detail = (ev.detail || '').toLowerCase();
        const kind = ev.type === 'Goal' ? 'GOL'
          : (detail.includes('red') || detail.includes('second yellow')) ? 'ROJA' : 'AMARILLA';
        // conteo de tarjetas por lado (para el panel de estadísticas en vivo)
        if (kind === 'ROJA') { if (isHomeEventTeam) tm.cards.hR++; else tm.cards.aR++; }
        else if (kind === 'AMARILLA') { if (isHomeEventTeam) tm.cards.hY++; else tm.cards.aY++; }
        const matchEvent: MatchEvent = {
          id: uid(), minute: ev.time.elapsed, kind, teamId: primaryId,
          text: `${ev.type === 'Goal' ? t('ev.golLabel') : ev.detail}${ev.player.name ? ` — ${ev.player.name}` : ''} (${ev.time.elapsed}')`,
          impact: info.pct, ts: Date.now(),
        };
        tm.events.unshift(matchEvent);
        if (tm.events.length > 40) tm.events.pop();

        if (ev.type === 'Goal') {
          const scorerTeam = teams.find((t) => t.id === primaryId);
          const rivalTeam = teams.find((t) => t.id === rivalId);
          if (scorerTeam && rivalTeam) {
            this.cb.onNews({
              id: uid(), source: 'PARTIDO', teamId: primaryId, rivalId, impact: info.pct, ts: Date.now(),
              isGoal: true,
              headline: t('ng.realGolH', { team: tName(scorerTeam), pct: `${info.pct > 0 ? '+' : ''}${info.pct}` }),
              body: t('ng.realGolB', { rival: tName(rivalTeam) }),
            });
          }
        } else if (kind === 'ROJA') {
          const cardTeam = teams.find((t) => t.id === primaryId);
          const rivalTeam = teams.find((t) => t.id === rivalId);
          if (cardTeam && rivalTeam) {
            this.cb.onNews({
              id: uid(), source: 'PARTIDO', teamId: primaryId, rivalId, impact: info.pct, ts: Date.now(),
              headline: t('ng.rojaH', { team: tName(cardTeam), min: ev.time.elapsed, pct: info.pct }),
              body: t('ng.rojaB', { team: tName(cardTeam), rival: tName(rivalTeam) }),
            });
          }
        }
      }
      tm.lastScoreHome = scoreHome;
      tm.lastScoreAway = scoreAway;
    }

    // ESTADÍSTICAS OFICIALES COMPLETAS: posesión, tiros (al arco/afuera/
    // totales), córners, faltas, offsides y atajadas. Todo del API. Los DELTAS
    // entre sondeos generan eventos reales en el feed y mueven el precio; en
    // el primer sondeo de un partido ya empezado, los TOTALES reconstruyen el
    // feed (backfill real, sin mover el precio).
    if (stats) {
      for (const side of stats) {
        const isHome = side.team.id === tm.homeApiId;
        const isAway = side.team.id === tm.awayApiId;
        if (!isHome && !isAway) continue;
        const team = isHome ? home : away;
        const rival = isHome ? away : home;

        const poss = readPossession(side.statistics);
        if (poss != null) { if (isHome) tm.possHome = poss; else tm.possAway = poss; }

        const snap = readSnapshot(side.statistics);
        if (isHome) tm.statHome = snap; else tm.statAway = snap;

        const prev = tm.lastStats.get(team.id);
        tm.lastStats.set(team.id, snap);

        if (!prev) {
          // primer sondeo: si el partido ya está andando, reconstruye el feed
          // desde los totales oficiales (historia — no mueve el precio).
          if (tm.knownMinute > 3) {
            for (const ev of backfillFromTotals(team, snap, tm.knownMinute)) tm.events.push(ev);
          }
          continue;
        }

        // deltas reales desde el último sondeo → eventos + movimiento de precio
        const newEvents: MatchEvent[] = [
          ...statDeltaEvents('TIRO', snap.shotsOn - prev.shotsOn, team, tm.knownMinute),
          ...statDeltaEvents('CORNER', snap.corners - prev.corners, team, tm.knownMinute),
          ...statDeltaEvents('FALTA', snap.fouls - prev.fouls, team, tm.knownMinute),
        ];
        for (const ev of newEvents) {
          tm.events.unshift(ev);
          this.cb.applyMoves([{ id: team.id, pct: ev.impact }, { id: rival.id, pct: r2(-ev.impact) }], false);
        }
        // detalles menores que también mueven el precio (sin ensuciar el feed):
        // offside resta un poco al equipo; una atajada suma al que ataja.
        const dOff = Math.min(Math.max(0, snap.offsides - prev.offsides), 2);
        const dSav = Math.min(Math.max(0, snap.saves - prev.saves), 3);
        if (dOff > 0) this.cb.applyMoves([{ id: team.id, pct: r2(-0.1 * dOff) }, { id: rival.id, pct: r2(0.1 * dOff) }], false);
        if (dSav > 0) this.cb.applyMoves([{ id: team.id, pct: r2(0.12 * dSav) }, { id: rival.id, pct: r2(-0.12 * dSav) }], false);
      }
    }

    // feed en orden cronológico (minuto más reciente arriba)
    tm.events.sort((a, b) => (b.minute - a.minute) || (b.ts - a.ts));
    if (tm.events.length > 48) tm.events = tm.events.slice(0, 48);

    this.cb.onMatchUpdate({
      id: tm.liveMatchId, league: tm.league, homeId: home.id, awayId: away.id,
      minute: tm.knownMinute, scoreHome: tm.lastScoreHome, scoreAway: tm.lastScoreAway,
      status: tm.knownStatus, events: tm.events, startedAt: tm.startedAt,
      source: 'REAL', possHome: tm.possHome, possAway: tm.possAway,
      statsHome: tm.statHome ? toLiveStats(tm.statHome, tm.cards.hY, tm.cards.hR) : undefined,
      statsAway: tm.statAway ? toLiveStats(tm.statAway, tm.cards.aY, tm.cards.aR) : undefined,
    });
  }

  private async finishDerbyTracking(fixtureId: number) {
    const tm = this.derbies.get(fixtureId);
    if (!tm) return;
    const timer = this.eventTimers.get(fixtureId);
    if (timer) clearInterval(timer);
    this.eventTimers.delete(fixtureId);
    this.derbies.delete(fixtureId);

    const teams = this.cb.getTeams();
    const home = teams.find((t) => t.id === tm.homeInternalId);
    const away = teams.find((t) => t.id === tm.awayInternalId);
    if (!home || !away) return;

    let settle = 0;
    let winner = '';
    if (tm.lastScoreHome > tm.lastScoreAway) { settle = RESULT_SETTLE_PCT; winner = tName(home); this.cb.applyMoves([{ id: home.id, pct: settle }, { id: away.id, pct: -settle }], false); }
    else if (tm.lastScoreAway > tm.lastScoreHome) { settle = RESULT_SETTLE_PCT; winner = tName(away); this.cb.applyMoves([{ id: away.id, pct: settle }, { id: home.id, pct: -settle }], false); }

    tm.events.unshift({ id: uid(), minute: 90, kind: 'FINAL', teamId: home.id, text: t('ev.final'), impact: 0, ts: Date.now() });
    this.cb.onMatchUpdate({
      id: tm.liveMatchId, league: tm.league, homeId: home.id, awayId: away.id,
      minute: 90, scoreHome: tm.lastScoreHome, scoreAway: tm.lastScoreAway, status: 'FT',
      events: tm.events, startedAt: tm.startedAt,
      source: 'REAL',
    });
    this.cb.onNews({
      id: uid(), source: 'PARTIDO', teamId: home.id, rivalId: away.id, impact: settle, ts: Date.now(),
      headline: t('ng.realFinalH', { home: tName(home), sh: tm.lastScoreHome, sa: tm.lastScoreAway, away: tName(away) }),
      body: winner ? t('ng.realFinalW', { winner }) : t('ng.realFinalD'),
    });

    // guarda el partido real terminado para "partidos pasados".
    this.cb.onRealMatchEnded?.({
      id: `real-${fixtureId}`, league: tm.league,
      homeShort: home.short, awayShort: away.short,
      homeColor: home.color, homeColor2: home.color2, awayColor: away.color, awayColor2: away.color2,
      scoreHome: tm.lastScoreHome, scoreAway: tm.lastScoreAway,
    });
  }

  // ---------------------------------------------------------------------
  // PARTIDO EXTERNO: uno de nuestros tokens juega contra un rival sin
  // token. No hay tarjeta de "partido en vivo" (no hay escudo del rival
  // que mostrar), pero el resultado real sí mueve el precio de nuestro
  // token — no es cero-suma, no hay de dónde "quitarle" al rival.
  // ---------------------------------------------------------------------

  private beginSoloTracking(fx: ApiFixture, internalId: string, apiTeamId: number, opponentName: string) {
    const team = this.cb.getTeams().find((t) => t.id === internalId);
    if (!team) return;

    const tm: TrackedSolo = {
      fixtureId: fx.fixture.id, internalId, apiTeamId, opponentName,
      startedAt: Date.now(), seenEventKeys: new Set(), goalsFor: 0, goalsAgainst: 0,
      lastStats: null, knownMinute: fx.fixture.status.elapsed ?? 0,
      knownStatus: 'LIVE',
    };
    this.solos.set(fx.fixture.id, tm);

    this.cb.onNews({
      id: uid(), source: 'PARTIDO', teamId: internalId, impact: 0, ts: Date.now(),
      headline: t('ng.realSoloH', { team: tName(team), opponent: opponentName }),
      body: t('ng.realSoloB', { opponent: opponentName, team: tName(team) }),
    });

    const timer = setInterval(() => this.pollSolo(fx.fixture.id), POLL_EVENTS_INTERVAL_MS);
    this.eventTimers.set(fx.fixture.id, timer);
    this.pollSolo(fx.fixture.id);
  }

  private async pollSolo(fixtureId: number) {
    const tm = this.solos.get(fixtureId);
    if (!tm) return;

    const [fixtures, events, stats] = await Promise.all([
      fetchFixtureById(fixtureId),
      fetchFixtureEvents(fixtureId),
      fetchFixtureStatistics(fixtureId),
    ]);

    const team = this.cb.getTeams().find((t) => t.id === tm.internalId);
    if (!team) return;

    const fx = fixtures?.[0];
    if (fx?.fixture.status.elapsed != null) tm.knownMinute = fx.fixture.status.elapsed;
    if (fx) tm.knownStatus = fx.fixture.status.short === 'HT' ? 'HT' : fx.fixture.status.short === 'FT' ? 'FT' : 'LIVE';

    if (events) {
      for (const ev of events) {
        const key = eventKey(ev);
        if (tm.seenEventKeys.has(key)) continue;
        tm.seenEventKeys.add(key);

        const committedByUs = ev.team.id === tm.apiTeamId;

        if (ev.type === 'Goal' && ev.detail !== 'Missed Penalty') {
          // gol a favor: gol normal nuestro, o autogol del rival.
          // gol en contra: gol normal del rival, o autogol nuestro.
          const isOwnGoal = ev.detail === 'Own Goal';
          const favorsUs = isOwnGoal ? !committedByUs : committedByUs;
          const pct = favorsUs ? GOAL_PCT : -GOAL_PCT;
          if (favorsUs) tm.goalsFor++; else tm.goalsAgainst++;

          this.cb.applyMoves([{ id: tm.internalId, pct }], false);
          this.cb.onNews({
            id: uid(), source: 'PARTIDO', teamId: tm.internalId, impact: pct, ts: Date.now(),
            isGoal: favorsUs,
            headline: favorsUs ? t('ng.realGolSoloH', { team: tName(team), pct: `${pct}` }) : t('ng.realGolConH', { team: tName(team), pct: `${Math.abs(pct)}` }),
            body: t('ng.realSoloEventB', { opponent: tm.opponentName }),
          });
          continue;
        }

        // tarjetas: solo modelamos las que recibe nuestro propio equipo
        // (no acreditamos ventaja por tarjetas al rival — simplificación).
        if (ev.type === 'Card' && committedByUs) {
          const d = (ev.detail || '').toLowerCase();
          const pct = (d.includes('red') || d.includes('second yellow')) ? RED_CARD_PCT : d.includes('yellow') ? YELLOW_CARD_PCT : null;
          if (pct == null) continue;
          this.cb.applyMoves([{ id: tm.internalId, pct }], false);
        }
      }
    }

    // Deltas REALES de las estadísticas oficiales de nuestro equipo → mueven
    // el precio (el primer sondeo solo fija la base, sin salto).
    if (stats) {
      const mine = stats.find((s) => s.team.id === tm.apiTeamId);
      if (mine) {
        const snap = readSnapshot(mine.statistics);
        const prev = tm.lastStats;
        tm.lastStats = snap;
        if (prev) {
          const deltas: [MatchEventKind, number][] = [
            ['TIRO', snap.shotsOn - prev.shotsOn],
            ['CORNER', snap.corners - prev.corners],
            ['FALTA', snap.fouls - prev.fouls],
          ];
          for (const [kind, delta] of deltas) {
            const n = Math.min(Math.max(0, delta), MAX_STAT_EVENTS_PER_POLL);
            for (let i = 0; i < n; i++) {
              this.cb.applyMoves([{ id: tm.internalId, pct: r2(IMPACT[kind] * jitter()) }], false);
            }
          }
        }
      }
    }
  }

  private finishSoloTracking(fixtureId: number) {
    const tm = this.solos.get(fixtureId);
    if (!tm) return;
    const timer = this.eventTimers.get(fixtureId);
    if (timer) clearInterval(timer);
    this.eventTimers.delete(fixtureId);
    this.solos.delete(fixtureId);

    const team = this.cb.getTeams().find((t) => t.id === tm.internalId);
    if (!team) return;

    let settle = 0;
    if (tm.goalsFor > tm.goalsAgainst) settle = RESULT_SETTLE_PCT;
    else if (tm.goalsAgainst > tm.goalsFor) settle = -RESULT_SETTLE_PCT;
    if (settle !== 0) this.cb.applyMoves([{ id: tm.internalId, pct: settle }], false);

    this.cb.onNews({
      id: uid(), source: 'PARTIDO', teamId: tm.internalId, impact: settle, ts: Date.now(),
      headline: t('ng.realFinalSoloH', { team: tName(team), gf: tm.goalsFor, ga: tm.goalsAgainst, opponent: tm.opponentName }),
      body: settle > 0 ? t('ng.realFinalSoloW', { team: tName(team) })
        : settle < 0 ? t('ng.realFinalSoloL', { team: tName(team) })
        : t('ng.realFinalSoloD', { team: tName(team) }),
    });
  }
}

/** Verdadero si al menos un equipo tiene apiTeamId asignado. */
export function realDataAvailable(): boolean {
  return isApiConfigured() && mappedApiTeamIds().length >= 1;
}

// ---------------------------------------------------------------------
// Arranque DIFERIDO (lazy) del motor real.
//
// El motor de partidos reales hace llamadas de red a api-football.com. En
// algunos dispositivos concretos, arrancarlo durante el arranque de la app
// provocaba un cierre nativo (fuera del alcance de cualquier try/catch de JS).
// Como es una función SECUNDARIA, ya no se arranca al abrir la app: se activa
// solo la primera vez que el usuario entra a una sección de partidos reales
// (pestaña "Real" o "Mundial 2026"). Así el arranque de la app queda limpio en
// todos los teléfonos, y el motor —una vez activado— sigue corriendo para toda
// la app (los goles reales mueven precios aunque estés en el dashboard).
// Es idempotente: llamarlo muchas veces arranca el motor una sola vez.
// ---------------------------------------------------------------------

let singleton: RealMatchEngine | null = null;
let started = false;

function teamShortFor(teams: Team[], id: string): string | undefined {
  return teams.find((t) => t.id === id)?.short;
}

/**
 * Arranca el motor de partidos reales una sola vez. Toma las callbacks del
 * store directamente (import perezoso para evitar dependencias circulares).
 */
export function startRealEngineLazy(): void {
  if (started) return;
  started = true;
  try {
    // require perezoso: evita cualquier ciclo de import a nivel de módulo.
    const { useStore } = require('../store/useStore');
    singleton = new RealMatchEngine({
      getTeams: () => useStore.getState().teams,
      applyMoves: (moves: PriceMove[], pushCandle: boolean) => useStore.getState().applyMoves(moves, pushCandle),
      onMatchUpdate: (m: LiveMatch) => useStore.getState().setMatch(m),
      onNews: (n: NewsItem) => useStore.getState().pushNews(n),
      onRealMatchEnded: (m: RealEndedMatch) => {
        const store = useStore.getState();
        store.addPastRealMatch({ ...m, competition: undefined, endedAt: Date.now() });
      },
    });
    singleton.start();
  } catch (err) {
    console.warn('[realEngine] no se pudo arrancar (lazy)', err);
    started = false;
  }
}

/** Detiene el motor real (si estaba corriendo) y permite volver a arrancarlo. */
export function stopRealEngineLazy(): void {
  try { singleton?.stop(); } catch { /* no-op */ }
  singleton = null;
  started = false;
}

/**
 * Fuerza una actualización inmediata del/los partido(s) real(es) en curso, sin
 * esperar al próximo sondeo. Lo usa el "deslizar para actualizar" de la pantalla
 * del partido. Arranca el motor si aún no estaba activo. A prueba de fallos.
 */
export async function pokeRealEngine(): Promise<void> {
  if (!started) startRealEngineLazy();
  try { await singleton?.pokeNow(); } catch { /* no-op */ }
}
