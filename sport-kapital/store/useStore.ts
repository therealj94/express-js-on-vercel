// store/useStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildTeams, type Team, type Candle, type League } from '@/data/teams';
import { setCurrentTheme, type ThemeKey } from '@/theme/palettes';
import { setCurrentLang, t, type Lang } from '@/utils/i18n';
import type { LiveMatch, NewsItem, PriceMove } from '@/utils/matchEngine';
import type { RealFixtureLite, RealTransferLite } from '@/utils/realData';

export type MusicMode = 'off' | 'track2';

// Cuenta REAL: bono de bienvenida de 50 USDT. Cuenta de PRÁCTICA: 1.000 USDT
// de prueba, totalmente separados — lo que pase en una no toca a la otra.
export const WELCOME_BONUS = 50;
export const PRACTICE_START = 1000;
export const TRADE_FEE = 0.01;   // 1% — se cobra sobre el subtotal, tanto en compra como en venta
const MAX_CANDLES = 220;

// AsyncStorage (async) en vez de MMKV: es lo que Expo Go trae incluido, y
// zustand/persist maneja la hidratación asíncrona sin cambios en el resto de
// la app (la bandera `hydrated` ya cubría la espera).

export interface UserAccount {
  name: string;
  email: string;
  country: string;   // código ISO del país LATAM
  phone: string;
  birthDate: string;  // ISO yyyy-mm-dd
  ageConfirmed: boolean; // confirmación explícita de mayoría de edad (18+)
}

export interface Position {
  teamId: string;
  shares: number;
  avgBuyPrice: number;
  realizedPnl: number;   // PnL acumulado de ventas parciales de esta posición
  openedAt: number;
}

export interface Transaction {
  id: string;
  type: 'BUY' | 'SELL';
  teamId: string;
  teamName: string;
  shares: number;
  price: number;
  fee: number;
  total: number;
  pnl?: number;          // solo en ventas
  timestamp: number;
}

export interface GoalAlertPayload {
  id: string;
  teamId: string;
  teamName: string;
  ticker: string;
  pct: number;
  color: string;
  color2: string;
}

export interface WalletTx {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'BONUS' | 'TRADE';
  method?: string;
  amount: number;
  reference: string;
  timestamp: number;
}

export interface PastRealMatch {
  id: string;                 // basado en el fixture id de api-football
  league: League;
  competition?: string;
  homeShort: string; awayShort: string;
  homeColor: string; homeColor2: string;
  awayColor: string; awayColor2: string;
  scoreHome: number; scoreAway: number;
  endedAt: number;
}

// Cuenta (real o práctica): el "libro" completo de dinero y posiciones.
// La cuenta ACTIVA vive en los campos de siempre (balance, positions, …) para
// que toda la UI siga funcionando sin cambios; la INACTIVA se guarda en
// `otherLedger` y se intercambia atómica al cambiar de modo.
export interface Ledger {
  balance: number;
  realizedTotal: number;
  positions: Position[];
  transactions: Transaction[];
}

export type AccountMode = 'REAL' | 'PRACTICE';

export const freshPracticeLedger = (): Ledger => ({
  balance: PRACTICE_START, realizedTotal: 0, positions: [], transactions: [],
});

interface State {
  hydrated: boolean;
  busy: boolean;         // acción en curso (compra, venta, depósito, retiro...): bloquea doble tap
  registered: boolean;
  uid: string | null;     // id de Firebase Auth si la cuenta está respaldada en la nube
  user: UserAccount | null;
  alias: string | null;  // nombre público que se muestra en la app en vez del real, por privacidad
  onboarded: boolean;
  riskAccepted: boolean;
  riskAcceptedAt?: number;
  tutorialsSeen: Record<string, boolean>;
  soundMuted: boolean;   // botón maestro de sonido (música + efectos)
  musicMode: MusicMode;  // pista de fondo de la app
  goalSoundOn: boolean;  // sonido de gol para posiciones abiertas (ajuste del perfil)
  themeKey: ThemeKey;    // tema visual de la app (4 opciones)
  language: Lang;        // idioma de la app (es/en)
  goalAlert: GoalAlertPayload | null;  // aviso en pantalla del último gol propio (no se persiste)
  onbStep: number;       // paso actual del onboarding — sobrevive al remount por cambio de tema (no se persiste)
  notifAsked: boolean;   // ya se le pidió permiso de notificaciones (en onboarding, o con el aviso de bienvenida a cuentas existentes) — para no volver a preguntar solo
  biometricEnabled: boolean; // Face ID / huella para entrar a la app (ajuste del perfil)

  balance: number;
  realizedTotal: number;       // PnL realizado histórico
  teams: Team[];
  positions: Position[];
  transactions: Transaction[];
  walletTxs: WalletTx[];
  matches: LiveMatch[];
  news: NewsItem[];

  // pestaña "Real": calendario y fichajes de api-football.com, cacheados
  // por equipo interno (datos públicos de mercado, no ligados a la cuenta).
  realFixtures: Record<string, RealFixtureLite[]>;
  realTransfers: Record<string, RealTransferLite[]>;
  realDataFetchedAt: number;
  isFetchingReal: boolean;

  // resultados finales de los partidos del Mundial que la app simuló en vivo
  // (tercer puesto, gran final): fixtureId -> [golesLocal, golesVisita]. Quedan
  // guardados para que el cuadro los muestre aunque el partido en vivo ya se
  // haya retirado de la lista de "en vivo".
  mundialResults: Record<string, [number, number]>;

  // partidos REALES (api-football) que ya terminaron mientras la app estuvo
  // abierta, para mostrarlos en "resultados" de la pestaña Real.
  pastRealMatches: PastRealMatch[];

  // cuenta activa ('REAL' por defecto) y el libro de la cuenta inactiva.
  accountMode: AccountMode;
  otherLedger: Ledger;
  setAccountMode: (m: AccountMode) => void;

  setHydrated: (v: boolean) => void;
  setBusy: (v: boolean) => void;
  register: (u: UserAccount) => void;
  setAlias: (name: string) => void;
  completeOnboarding: () => void;
  claimBonus: () => void;
  acceptRisk: () => void;
  markTutorial: (key: string) => void;
  setSoundMuted: (v: boolean) => void;
  setMusicMode: (m: MusicMode) => void;
  setGoalSoundOn: (v: boolean) => void;
  setTheme: (k: ThemeKey) => void;
  setLanguage: (l: Lang) => void;
  setGoalAlert: (a: GoalAlertPayload | null) => void;
  setOnbStep: (n: number) => void;
  setNotifAsked: () => void;
  setBiometricEnabled: (v: boolean) => void;
  resetAll: () => void;
  setUid: (uid: string | null) => void;
  /** Aplica un snapshot traído de la nube (login en un dispositivo nuevo). */
  hydrateFromCloud: (snapshot: Record<string, unknown>) => void;

  loadMarket: () => void;
  applyMoves: (moves: PriceMove[], pushCandle: boolean) => void;
  setMatch: (m: LiveMatch) => void;
  pushNews: (n: NewsItem) => void;

  setRealFixtures: (teamId: string, list: RealFixtureLite[]) => void;
  setRealTransfers: (teamId: string, list: RealTransferLite[]) => void;
  setRealDataFetchedAt: (ts: number) => void;
  setIsFetchingReal: (v: boolean) => void;
  setMundialResult: (fixtureId: string, home: number, away: number) => void;
  addPastRealMatch: (m: PastRealMatch) => void;

  buy: (teamId: string, shares: number) => { ok: boolean; msg: string };
  sell: (teamId: string, shares: number) => { ok: boolean; msg: string; pnl?: number };

  deposit: (amount: number, method: string) => void;
  withdraw: (amountUSDT: number, feeUSDT: number, reference: string) => { ok: boolean; msg: string };
}

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      hydrated: false,
      busy: false,
      registered: false,
      uid: null,
      user: null,
      alias: null,
      onboarded: false,
      riskAccepted: false,
      tutorialsSeen: {},
      soundMuted: false,
      musicMode: 'track2',
      goalSoundOn: true,
      themeKey: 'neon',
      language: 'es',
      goalAlert: null,
      onbStep: 0,
      notifAsked: false,
      biometricEnabled: false,
      balance: 0,
      realizedTotal: 0,
      teams: [],
      positions: [],
      transactions: [],
      walletTxs: [],
      matches: [],
      news: [],
      realFixtures: {},
      realTransfers: {},
      realDataFetchedAt: 0,
      isFetchingReal: false,
      mundialResults: {},
      pastRealMatches: [],
      accountMode: 'REAL',
      otherLedger: freshPracticeLedger(),

      // Cambio de cuenta: intercambio atómico del libro activo con el inactivo.
      // Así toda la UI (dashboard, cartera, trade, billetera) sigue leyendo los
      // mismos campos y SIEMPRE ve la cuenta activa, sin tocar pantalla por
      // pantalla — y las dos cuentas jamás se mezclan.
      setAccountMode: (m) =>
        set((s) => {
          if (m === s.accountMode) return {};
          return {
            accountMode: m,
            balance: s.otherLedger.balance,
            realizedTotal: s.otherLedger.realizedTotal,
            positions: s.otherLedger.positions,
            transactions: s.otherLedger.transactions,
            otherLedger: {
              balance: s.balance, realizedTotal: s.realizedTotal,
              positions: s.positions, transactions: s.transactions,
            },
          };
        }),

      setHydrated: (v) => set({ hydrated: v }),
      setBusy: (v) => set({ busy: v }),
      register: (u) => set({ registered: true, user: u }),
      setAlias: (name) => set({ alias: name.trim().slice(0, 24) || null }),
      completeOnboarding: () => set({ onboarded: true }),
      setUid: (uid) => set({ uid }),
      // login desde la nube: lo respaldado es SIEMPRE la cuenta real, así que
      // se entra en modo REAL con una cuenta de práctica nueva.
      hydrateFromCloud: (snapshot) => set({ registered: true, accountMode: 'REAL', otherLedger: freshPracticeLedger(), ...snapshot }),

      claimBonus: () => {
        if (get().walletTxs.some((w) => w.type === 'BONUS')) return;
        set((s) => ({
          balance: s.balance + WELCOME_BONUS,
          walletTxs: [{ id: uid(), type: 'BONUS' as const, amount: WELCOME_BONUS, reference: t('store.welcomeBonus'), timestamp: Date.now() }, ...s.walletTxs],
        }));
      },

      acceptRisk: () => set({ riskAccepted: true, riskAcceptedAt: Date.now() }),
      markTutorial: (key) => set((s) => ({ tutorialsSeen: { ...s.tutorialsSeen, [key]: true } })),
      setSoundMuted: (v) => set({ soundMuted: v }),
      setMusicMode: (m) => set({ musicMode: m }),
      setGoalSoundOn: (v) => set({ goalSoundOn: v }),
      setTheme: (k) => { setCurrentTheme(k); set({ themeKey: k }); },
      setLanguage: (l) => { setCurrentLang(l); set({ language: l }); },
      setGoalAlert: (a) => set({ goalAlert: a }),
      setOnbStep: (n) => set({ onbStep: n }),
      setNotifAsked: () => set({ notifAsked: true }),
      setBiometricEnabled: (v) => set({ biometricEnabled: v }),

      resetAll: () =>
        set({
          registered: false, uid: null, user: null, alias: null, onboarded: false, riskAccepted: false, riskAcceptedAt: undefined,
          tutorialsSeen: {}, balance: 0, realizedTotal: 0, positions: [], transactions: [], walletTxs: [],
          matches: [], news: [], teams: buildTeams(), notifAsked: false, mundialResults: {}, pastRealMatches: [],
          accountMode: 'REAL', otherLedger: freshPracticeLedger(),
        }),

      loadMarket: () => {
        // el mercado siempre arranca fresco (las velas no se persisten para no inflar MMKV)
        set({ teams: buildTeams() });
      },

      applyMoves: (moves, pushCandle) =>
        set((s) => ({
          teams: s.teams.map((t) => {
            const mv = moves.find((m) => m.id === t.id);
            const pct = mv?.pct ?? 0;
            const newPrice = Math.max(t.basePrice * 0.35, r2(t.currentPrice * (1 + pct / 100)));
            let candles = t.candles;
            if (pushCandle) {
              const last = candles[candles.length - 1];
              const o = last.c;
              const c = newPrice;
              const spread = Math.abs(c - o) * 0.4 + t.currentPrice * 0.0012;
              const candle: Candle = {
                t: Date.now(), o,
                h: r2(Math.max(o, c) + Math.random() * spread),
                l: r2(Math.min(o, c) - Math.random() * spread),
                c, v: Math.round(t.basePrice * (5 + Math.random() * 30) * (1 + Math.abs(pct))),
              };
              candles = [...candles.slice(-(MAX_CANDLES - 1)), candle];
            } else if (pct !== 0) {
              // evento intra-vela: actualiza el cierre/máx/mín de la vela actual
              const last = { ...candles[candles.length - 1] };
              last.c = newPrice;
              last.h = Math.max(last.h, newPrice);
              last.l = Math.min(last.l, newPrice);
              last.v += Math.round(t.basePrice * Math.abs(pct) * 8);
              candles = [...candles.slice(0, -1), last];
            }
            const open = candles[Math.max(0, candles.length - 60)].o;
            const change = r2(((newPrice - open) / open) * 100);
            return {
              ...t, currentPrice: newPrice, candles, priceChange: change,
              formTrend: change > 0.8 ? 'up' : change < -0.8 ? 'down' : 'flat',
              sentiment: change > 0.8 ? 'alcista' : change < -0.8 ? 'bajista' : 'neutral',
            };
          }),
        })),

      setMatch: (m) =>
        set((s) => {
          const rest = s.matches.filter((x) => x.id !== m.id);
          return { matches: [m, ...rest].slice(0, 6) };
        }),

      pushNews: (n) => set((s) => ({ news: [n, ...s.news].slice(0, 60) })),

      setRealFixtures: (teamId, list) => set((s) => ({ realFixtures: { ...s.realFixtures, [teamId]: list } })),
      setRealTransfers: (teamId, list) => set((s) => ({ realTransfers: { ...s.realTransfers, [teamId]: list } })),
      setRealDataFetchedAt: (ts) => set({ realDataFetchedAt: ts }),
      setIsFetchingReal: (v) => set({ isFetchingReal: v }),
      setMundialResult: (fixtureId, home, away) =>
        set((s) => ({ mundialResults: { ...s.mundialResults, [fixtureId]: [home, away] } })),
      addPastRealMatch: (m) =>
        set((s) => ({
          // dedup por id (no repetir el mismo fixture) y guardamos los últimos 30
          pastRealMatches: [m, ...s.pastRealMatches.filter((x) => x.id !== m.id)].slice(0, 30),
        })),

      buy: (teamId, sharesInput) => {
        const s = get();
        const team = s.teams.find((t) => t.id === teamId);
        if (!team) return { ok: false, msg: t('store.teamNotFound') };
        if (sharesInput <= 0) return { ok: false, msg: t('store.invalidAmount') };

        let shares = sharesInput;
        let cost = team.currentPrice * shares;
        let fee = cost * TRADE_FEE;
        let total = cost + fee;
        // tolera un margen mínimo de redondeo (ej. el botón "MAX" reserva la
        // comisión con un .toFixed intermedio que puede quedar una fracción
        // de centavo por encima del saldo real) — si cae dentro de ese
        // margen, se ajusta la compra al saldo exacto disponible en vez de
        // rechazarla.
        if (total > s.balance && total <= s.balance + 0.01) {
          total = s.balance;
          cost = total / (1 + TRADE_FEE);
          fee = total - cost;
          shares = cost / team.currentPrice;
        }
        if (total > s.balance) return { ok: false, msg: t('store.insufBalance') };

        const existing = s.positions.find((p) => p.teamId === teamId);
        const positions = existing
          ? s.positions.map((p) =>
              p.teamId === teamId
                ? { ...p, shares: p.shares + shares, avgBuyPrice: (p.avgBuyPrice * p.shares + cost) / (p.shares + shares) }
                : p
            )
          : [...s.positions, { teamId, shares, avgBuyPrice: team.currentPrice, realizedPnl: 0, openedAt: Date.now() }];

        const tx: Transaction = { id: uid(), type: 'BUY', teamId, teamName: team.name, shares, price: team.currentPrice, fee, total, timestamp: Date.now() };
        set({
          balance: r2(s.balance - total),
          positions,
          transactions: [tx, ...s.transactions].slice(0, 100),
          // la billetera es SOLO de la cuenta real: en práctica no se registra
          walletTxs: s.accountMode === 'REAL'
            ? [{ id: uid(), type: 'TRADE' as const, amount: -total, reference: t('store.buyRef', { ticker: team.short }), timestamp: Date.now() }, ...s.walletTxs].slice(0, 100)
            : s.walletTxs,
        });
        return { ok: true, msg: t('store.positionOpened', { n: shares.toFixed(4), team: team.name }) };
      },

      sell: (teamId, sharesInput) => {
        const s = get();
        const team = s.teams.find((t) => t.id === teamId);
        const pos = s.positions.find((p) => p.teamId === teamId);
        if (!team || !pos) return { ok: false, msg: t('store.noPosition') };
        // tolera un margen mínimo de redondeo (ej. el botón "MAX" convierte
        // tokens a USDT y de vuelta, y el .toFixed intermedio puede quedar
        // una fracción de centavo por encima de lo que en verdad tienes) —
        // si cae dentro de ese margen, se vende la posición completa exacta
        // en vez de rechazar la venta por "no tienes tantos tokens".
        const shares = sharesInput > pos.shares && sharesInput <= pos.shares + 0.001 ? pos.shares : sharesInput;
        if (shares <= 0 || shares > pos.shares) return { ok: false, msg: t('store.notEnoughTokens') };

        const gross = team.currentPrice * shares;
        const fee = gross * TRADE_FEE;
        const net = gross - fee;
        // P&L realizado = lo que recibo (neto de comisión de venta) menos lo que
        // realmente me costó la posición, INCLUYENDO la comisión de compra que
        // pagué al abrirla (proporcional a las acciones que vendo). Antes se
        // omitía la comisión de compra, así que el "P&L realizado" no coincidía
        // con el cambio real del saldo. Ahora sí: realizedTotal == Δsaldo.
        const costBasis = pos.avgBuyPrice * shares;      // costo puro de los tokens
        const buyFeePortion = costBasis * TRADE_FEE;     // comisión de compra proporcional
        const pnl = r2(net - costBasis - buyFeePortion);
        const remaining = pos.shares - shares;
        const positions = remaining <= 0.0001
          ? s.positions.filter((p) => p.teamId !== teamId)
          : s.positions.map((p) => (p.teamId === teamId ? { ...p, shares: remaining, realizedPnl: r2(p.realizedPnl + pnl) } : p));

        const tx: Transaction = { id: uid(), type: 'SELL', teamId, teamName: team.name, shares, price: team.currentPrice, fee, total: net, pnl, timestamp: Date.now() };
        set({
          balance: r2(s.balance + net),
          realizedTotal: r2(s.realizedTotal + pnl),
          positions,
          transactions: [tx, ...s.transactions].slice(0, 100),
          walletTxs: s.accountMode === 'REAL'
            ? [{ id: uid(), type: 'TRADE' as const, amount: net, reference: t('store.sellRef', { ticker: team.short }), timestamp: Date.now() }, ...s.walletTxs].slice(0, 100)
            : s.walletTxs,
        });
        return { ok: true, msg: t('store.positionClosed', { v: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` }), pnl };
      },

      deposit: (amount, method) =>
        set((s) => ({
          balance: r2(s.balance + amount),
          walletTxs: s.accountMode === 'REAL'
            ? [{ id: uid(), type: 'DEPOSIT' as const, method, amount, reference: method, timestamp: Date.now() }, ...s.walletTxs].slice(0, 100)
            : s.walletTxs,
        })),

      withdraw: (amountUSDT, feeUSDT, reference) => {
        const s = get();
        const total = amountUSDT + feeUSDT;
        if (total > s.balance) return { ok: false, msg: t('store.insufWithFee') };
        set({
          balance: r2(s.balance - total),
          walletTxs: s.accountMode === 'REAL'
            ? [{ id: uid(), type: 'WITHDRAW' as const, amount: -total, reference, timestamp: Date.now() }, ...s.walletTxs].slice(0, 100)
            : s.walletTxs,
        });
        return { ok: true, msg: t('store.withdrawOk') };
      },
    }),
    {
      name: 'sport-kapital-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Subir este número cuando cambie el formato de lo guardado. `migrate`
      // limpia el estado de versiones anteriores para que ACTUALIZAR la app
      // (no solo instalarla de cero) nunca crashee por datos viejos: un equipo
      // que ya no existe, un modo de música retirado, un tema inválido, etc.
      // Sin esto, un teléfono con una cuenta de una versión anterior podía
      // cerrarse al arrancar mientras que una instalación limpia funcionaba.
      version: 3,
      migrate: (persisted: unknown, _fromVersion: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted as any;
        const s = persisted as Record<string, any>;
        try {
          // v3: cuentas separadas real/práctica — datos viejos pasan a ser la
          // cuenta REAL activa y se crea la de práctica desde cero.
          if (s.accountMode !== 'REAL' && s.accountMode !== 'PRACTICE') s.accountMode = 'REAL';
          if (!s.otherLedger || typeof s.otherLedger !== 'object') s.otherLedger = freshPracticeLedger();
          // modo de música: valores retirados ('track1','track3','random') → 'track2'
          if (s.musicMode !== 'off' && s.musicMode !== 'track2') s.musicMode = 'track2';
          // tema/idioma: si el valor guardado ya no es válido, al default
          if (!['neon', 'pro', 'light', 'vivid'].includes(s.themeKey)) s.themeKey = 'neon';
          if (s.language !== 'es' && s.language !== 'en') s.language = 'es';
          // posiciones que apuntan a equipos que ya no existen en esta versión:
          // se descartan para no romper el render (el dashboard/portafolio asume
          // que cada posición tiene su equipo vivo para poder valuarla).
          const validIds = new Set(buildTeams().map((tm) => tm.id));
          if (Array.isArray(s.positions)) {
            s.positions = s.positions.filter((p: any) => p && typeof p === 'object' && validIds.has(p.teamId));
          }
          // el historial de transacciones guarda su propio teamName, así que no
          // necesita el equipo vivo — no se filtra para no borrar historial.
        } catch {
          /* ante cualquier duda, devolvemos lo que había: mejor eso que crashear */
        }
        return s;
      },
      partialize: (s) => ({
        registered: s.registered,
        uid: s.uid,
        user: s.user,
        alias: s.alias,
        onboarded: s.onboarded,
        riskAccepted: s.riskAccepted,
        riskAcceptedAt: s.riskAcceptedAt,
        tutorialsSeen: s.tutorialsSeen,
        soundMuted: s.soundMuted,
        musicMode: s.musicMode,
        goalSoundOn: s.goalSoundOn,
        themeKey: s.themeKey,
        language: s.language,
        notifAsked: s.notifAsked,
        biometricEnabled: s.biometricEnabled,
        balance: s.balance,
        realizedTotal: s.realizedTotal,
        positions: s.positions,
        transactions: s.transactions,
        walletTxs: s.walletTxs,
        realFixtures: s.realFixtures,
        realTransfers: s.realTransfers,
        realDataFetchedAt: s.realDataFetchedAt,
        mundialResults: s.mundialResults,
        pastRealMatches: s.pastRealMatches,
        accountMode: s.accountMode,
        otherLedger: s.otherLedger,
      }),
      onRehydrateStorage: () => (state) => {
        // sincroniza el tema y el idioma persistidos con sus módulos ANTES de
        // que la app se marque lista, para que el primer render ya salga bien.
        if (state) {
          setCurrentTheme(state.themeKey);
          setCurrentLang(state.language);
          state.setHydrated(true);
        }
      },
    }
  )
);

// ---------- selectores ----------
export const selectPortfolioValue = (s: State) =>
  s.positions.reduce((acc, p) => {
    const t = s.teams.find((x) => x.id === p.teamId);
    return acc + (t ? t.currentPrice * p.shares : 0);
  }, 0);

export const selectInvested = (s: State) =>
  s.positions.reduce((acc, p) => acc + p.avgBuyPrice * p.shares, 0);

export const selectUnrealized = (s: State) => selectPortfolioValue(s) - selectInvested(s);

export const selectEquity = (s: State) => s.balance + selectPortfolioValue(s);

export const selectPositionsDetailed = (s: State) =>
  s.positions.map((p) => {
    const team = s.teams.find((t) => t.id === p.teamId);
    const price = team?.currentPrice ?? p.avgBuyPrice;
    const value = price * p.shares;
    const cost = p.avgBuyPrice * p.shares;
    const unrealized = value - cost;
    const unrealizedPct = cost > 0 ? (unrealized / cost) * 100 : 0;
    return { ...p, team, price, value, cost, unrealized, unrealizedPct };
  });
