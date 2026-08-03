// utils/matchEngine.ts
// Motor de mercado y partidos en vivo.
//
// Principio de liquidez: el precio se mueve por flujo de capital ENTRE los dos tokens
// del partido. Cada evento transfiere un porcentaje del rival al beneficiado
// (suma cero dentro del enfrentamiento): si un equipo sube, el otro baja.
//
// - Ticks base cada 5-7 s: micro-movimientos + nueva vela.
// - Partidos: 90 minutos simulados (~1.4 s por minuto). Eventos con probabilidad
//   por minuto: gol, tiro al arco, falta, tarjeta amarilla/roja, córner.
// - Noticias de mercado cada 50-90 s que también mueven precios con flujo hacia/desde un rival.

import type { Team, Candle, League } from '@/data/teams';
import { t, tName } from './i18n';

export type MatchEventKind = 'GOL' | 'TIRO' | 'FALTA' | 'AMARILLA' | 'ROJA' | 'CORNER' | 'INICIO' | 'DESCANSO' | 'FINAL';

export interface MatchEvent {
  id: string;
  minute: number;
  kind: MatchEventKind;
  teamId: string;        // equipo protagonista
  text: string;
  impact: number;        // % aplicado al protagonista (el rival recibe el opuesto)
  ts: number;
}

// Estadísticas en vivo de un equipo en un partido REAL (de api-football):
// alimentan el panel "estadísticas del partido" estilo plataforma deportiva.
export interface LiveTeamStats {
  shotsOn: number;      // tiros al arco
  shotsOff: number;     // tiros afuera
  shotsTotal: number;   // tiros totales
  corners: number;
  fouls: number;
  offsides: number;
  saves: number;        // atajadas del arquero
  yellows: number;
  reds: number;
}

export interface LiveMatch {
  id: string;
  league: League;
  homeId: string;
  awayId: string;
  minute: number;
  scoreHome: number;
  scoreAway: number;
  status: 'LIVE' | 'HT' | 'FT';
  events: MatchEvent[];
  startedAt: number;
  source: 'SIM' | 'REAL';
  // posesión de la pelota en % (solo partidos reales, de las estadísticas
  // oficiales). Si no está disponible, no se muestra la barra.
  possHome?: number;
  possAway?: number;
  // estadísticas oficiales completas (solo partidos reales).
  statsHome?: LiveTeamStats;
  statsAway?: LiveTeamStats;
}

export function isRealMatch(m: Pick<LiveMatch, 'source' | 'id'>): boolean {
  return m.source === 'REAL' || m.id.startsWith('real-');
}

export interface NewsItem {
  id: string;
  headline: string;
  body: string;
  teamId: string;
  rivalId?: string;
  impact: number;
  ts: number;
  source: 'PARTIDO' | 'MERCADO';
  // Marca explícita de "esta noticia es un gol a favor de teamId" — la usan
  // el sonido de gol y la notificación de sistema. Antes se detectaba
  // buscando el texto "GOL" dentro del titular, lo que se rompía en inglés
  // ("GOAL" no contiene "GOL") y no era robusto entre motores (sim/real).
  isGoal?: boolean;
}

export interface PriceMove { id: string; pct: number }

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

// Impacto por evento (% del precio, transferido desde/hacia el rival).
// Exportado para que realMatchEngine.ts use exactamente los mismos valores
// cuando sintetiza estos eventos a partir de estadísticas oficiales.
export const IMPACT: Record<MatchEventKind, number> = {
  GOL: 3.2, TIRO: 0.35, FALTA: -0.12, AMARILLA: -0.45, ROJA: -1.9, CORNER: 0.18,
  INICIO: 0, DESCANSO: 0, FINAL: 0,
};

// Probabilidad por minuto simulado
const PROB: [MatchEventKind, number][] = [
  ['GOL', 0.035], ['TIRO', 0.13], ['FALTA', 0.11], ['AMARILLA', 0.04], ['ROJA', 0.005], ['CORNER', 0.09],
];

function eventText(kind: MatchEventKind, team: Team, minute: number): string {
  const vars = { team: tName(team), min: minute };
  switch (kind) {
    case 'GOL': return t('ev.gol', vars);
    case 'TIRO': return t('ev.tiro', vars);
    case 'FALTA': return t('ev.falta', vars);
    case 'AMARILLA': return t('ev.amarilla', vars);
    case 'ROJA': return t('ev.roja', vars);
    case 'CORNER': return t('ev.corner', vars);
    case 'INICIO': return t('ev.inicio');
    case 'DESCANSO': return t('ev.descanso');
    case 'FINAL': return t('ev.final');
  }
}

// Titulares de mercado (fuera de partidos) — el rival de liga absorbe/entrega parte del flujo
const MARKET_NEWS: { h: (tm: Team) => string; b: (tm: Team) => string; impact: () => number }[] = [
  { h: (tm) => t('mn.1h', { team: tName(tm) }), b: (tm) => t('mn.1b', { team: tName(tm) }), impact: () => 1.6 + Math.random() * 1.4 },
  { h: (tm) => t('mn.2h', { team: tName(tm) }), b: (tm) => t('mn.2b', { team: tName(tm) }), impact: () => -(1.4 + Math.random() * 1.5) },
  { h: (tm) => t('mn.3h', { team: tName(tm) }), b: (tm) => t('mn.3b', { team: tName(tm) }), impact: () => 1.0 + Math.random() * 1.0 },
  { h: (tm) => t('mn.4h', { team: tName(tm) }), b: (tm) => t('mn.4b', { team: tName(tm) }), impact: () => -(0.8 + Math.random() * 1.0) },
  { h: (tm) => t('mn.5h', { team: tName(tm) }), b: (tm) => t('mn.5b', { team: tName(tm) }), impact: () => 0.9 + Math.random() * 0.9 },
];

export interface EngineCallbacks {
  getTeams: () => Team[];
  applyMoves: (moves: PriceMove[], pushCandle: boolean) => void;
  onMatchUpdate: (m: LiveMatch) => void;
  onNews: (n: NewsItem) => void;
}

export class MarketEngine {
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private matchTimer: ReturnType<typeof setInterval> | null = null;
  private newsTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  private matches: LiveMatch[] = [];
  private running = false;

  constructor(private cb: EngineCallbacks) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.loopTicks();
    this.loopNews();
    this.scheduleNextMatch(4000); // primer partido a los ~4 s de abrir
    this.matchTimer = setInterval(() => { this.stepMatches(); }, 4000); // 1 min simulado
  }

  stop() {
    this.running = false;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.newsTimer) clearTimeout(this.newsTimer);
    if (this.scheduleTimer) clearTimeout(this.scheduleTimer);
    if (this.matchTimer) clearInterval(this.matchTimer);
    this.tickTimer = this.newsTimer = this.scheduleTimer = null;
    this.matchTimer = null;
  }

  getMatches() { return this.matches; }

  // ---------- ticks base: respiración del mercado ----------
  private loopTicks() {
    if (!this.running) return;
    this.tickTimer = setTimeout(() => {
      const teams = this.cb.getTeams();
      const inMatch = new Set(this.matches.filter((m) => m.status !== 'FT').flatMap((m) => [m.homeId, m.awayId]));
      const moves: PriceMove[] = teams.map((t) => {
        // fuera de partido: reversión suave a la media + ruido
        const base = t.basePrice;
        const noise = (Math.random() - 0.5) * (inMatch.has(t.id) ? 0.25 : 0.45);
        const reversion = ((base - t.currentPrice) / base) * 1.6;
        return { id: t.id, pct: r2(noise + reversion) };
      });
      this.cb.applyMoves(moves, true); // cada tick cierra una vela nueva
      this.loopTicks();
    }, 5000 + Math.random() * 2000);
  }

  // ---------- partidos en vivo ----------
  private scheduleNextMatch(delay?: number) {
    if (!this.running) return;
    this.scheduleTimer = setTimeout(() => {
      this.startMatch();
      this.scheduleNextMatch();
    }, delay ?? 35_000 + Math.random() * 35_000);
  }

  private startMatch() {
    const teams = this.cb.getTeams();
    const active = this.matches.filter((m) => m.status !== 'FT');
    if (active.length >= 2 || teams.length < 2) return;

    const busy = new Set(active.flatMap((m) => [m.homeId, m.awayId]));
    const leagues: League[] = ['LALIGA', 'HONDURAS', 'BRASIL', 'ESTADOS_UNIDOS'];
    const league = pick(leagues);
    const pool = teams.filter((t) => t.league === league && !busy.has(t.id));
    if (pool.length < 2) return;

    const home = pick(pool);
    const away = pick(pool.filter((t) => t.id !== home.id));
    const match: LiveMatch = {
      id: uid(), league, homeId: home.id, awayId: away.id,
      minute: 0, scoreHome: 0, scoreAway: 0, status: 'LIVE',
      events: [{ id: uid(), minute: 0, kind: 'INICIO', teamId: home.id, text: eventText('INICIO', home, 0), impact: 0, ts: Date.now() }],
      startedAt: Date.now(),
      source: 'SIM',
    };
    this.matches = [match, ...this.matches].slice(0, 6);
    this.cb.onMatchUpdate(match);
    this.cb.onNews({
      id: uid(), source: 'PARTIDO', teamId: home.id, rivalId: away.id, impact: 0, ts: Date.now(),
      headline: t('ng.kickoffH', { home: tName(home), away: tName(away) }),
      body: t('ng.kickoffB', { league: leagueLabel(league) }),
    });
  }

  private stepMatches() {
    const teams = this.cb.getTeams();
    for (const m of this.matches) {
      if (m.status === 'FT') continue;
      m.minute += 1;

      if (m.minute === 45 && m.status === 'LIVE') {
        m.status = 'HT';
        m.events.unshift({ id: uid(), minute: 45, kind: 'DESCANSO', teamId: m.homeId, text: 'Descanso.', impact: 0, ts: Date.now() });
        this.cb.onMatchUpdate({ ...m });
        continue;
      }
      if (m.status === 'HT') {
        if (m.minute >= 48) m.status = 'LIVE'; // pausa breve de medio tiempo
        else { this.cb.onMatchUpdate({ ...m }); continue; }
      }
      if (m.minute >= 90) {
        this.finishMatch(m, teams);
        continue;
      }

      // eventos del minuto
      for (const [kind, prob] of PROB) {
        if (Math.random() < prob) {
          const isHome = Math.random() < 0.5;
          const teamId = isHome ? m.homeId : m.awayId;
          const rivalId = isHome ? m.awayId : m.homeId;
          const team = teams.find((t) => t.id === teamId);
          const rival = teams.find((t) => t.id === rivalId);
          if (!team || !rival) continue;

          let impact = IMPACT[kind] * (0.85 + Math.random() * 0.3);
          if (kind === 'GOL') {
            if (isHome) m.scoreHome += 1; else m.scoreAway += 1;
          }
          impact = r2(impact);

          const ev: MatchEvent = { id: uid(), minute: m.minute, kind, teamId, text: eventText(kind, team, m.minute), impact, ts: Date.now() };
          m.events.unshift(ev);
          if (m.events.length > 40) m.events.pop();

          // TRANSFERENCIA DE LIQUIDEZ: el rival recibe el impacto opuesto
          this.cb.applyMoves([{ id: teamId, pct: impact }, { id: rivalId, pct: r2(-impact) }], false);

          if (kind === 'GOL' || kind === 'ROJA') {
            this.cb.onNews({
              id: uid(), source: 'PARTIDO', teamId, rivalId, impact, ts: Date.now(),
              isGoal: kind === 'GOL',
              headline: kind === 'GOL'
                ? t('ng.golH', { team: tName(team), min: m.minute, pct: `${impact > 0 ? '+' : ''}${impact}` })
                : t('ng.rojaH', { team: tName(team), min: m.minute, pct: impact }),
              body: kind === 'GOL'
                ? t('ng.golB', { team: tName(team), score: `${m.homeId === teamId ? m.scoreHome : m.scoreAway}-${m.homeId === teamId ? m.scoreAway : m.scoreHome}`, rival: tName(rival) })
                : t('ng.rojaB', { team: tName(team), rival: tName(rival) }),
            });
          }
        }
      }
      this.cb.onMatchUpdate({ ...m });
    }
    this.matches = this.matches.filter((m) => m.status !== 'FT' || Date.now() - m.startedAt < 5 * 60_000);
  }

  private finishMatch(m: LiveMatch, teams: Team[]) {
    m.status = 'FT';
    const home = teams.find((t) => t.id === m.homeId);
    const away = teams.find((t) => t.id === m.awayId);
    if (!home || !away) return;

    // liquidación final: el ganador absorbe un último flujo del perdedor
    let settle = 0;
    let winner = '';
    if (m.scoreHome > m.scoreAway) { settle = 1.6; winner = tName(home); this.cb.applyMoves([{ id: m.homeId, pct: settle }, { id: m.awayId, pct: -settle }], false); }
    else if (m.scoreAway > m.scoreHome) { settle = 1.6; winner = tName(away); this.cb.applyMoves([{ id: m.awayId, pct: settle }, { id: m.homeId, pct: -settle }], false); }

    m.events.unshift({ id: uid(), minute: 90, kind: 'FINAL', teamId: m.homeId, text: t('ev.final'), impact: 0, ts: Date.now() });
    this.cb.onMatchUpdate({ ...m });
    this.cb.onNews({
      id: uid(), source: 'PARTIDO', teamId: m.homeId, rivalId: m.awayId, impact: settle, ts: Date.now(),
      headline: t('ng.finalH', { home: tName(home), sh: m.scoreHome, sa: m.scoreAway, away: tName(away) }),
      body: winner ? t('ng.finalW', { winner }) : t('ng.finalD'),
    });
  }


  // ---------- noticias de mercado ----------
  private loopNews() {
    if (!this.running) return;
    this.newsTimer = setTimeout(() => {
      const teams = this.cb.getTeams();
      if (teams.length) {
        const team = pick(teams);
        const rivals = teams.filter((t) => t.league === team.league && t.id !== team.id);
        const rival = rivals.length ? pick(rivals) : undefined;
        const tpl = pick(MARKET_NEWS);
        const impact = r2(tpl.impact());
        // la mitad del impacto fluye desde/hacia el rival de liga
        const moves: PriceMove[] = [{ id: team.id, pct: impact }];
        if (rival) moves.push({ id: rival.id, pct: r2(-impact * 0.5) });
        this.cb.applyMoves(moves, false);
        this.cb.onNews({
          id: uid(), source: 'MERCADO', teamId: team.id, rivalId: rival?.id, impact, ts: Date.now(),
          headline: tpl.h(team), body: tpl.b(team),
        });
      }
      this.loopNews();
    }, 50_000 + Math.random() * 40_000);
  }
}

function leagueLabel(l: League) {
  return t(`league.${l}`);
}
