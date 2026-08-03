// app/fixture/[id].tsx
// Ficha completa de un partido REAL (por su id de api-football). Sirve para
// cualquier partido: por jugar, en vivo o terminado — a diferencia de
// /match/[id], que solo existe mientras el motor sigue un partido en vivo.
//
// Trae del servidor los datos oficiales del encuentro (marcador, eventos,
// estadísticas y alineaciones) y ofrece operar los tokens de ambos equipos.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { TeamBadge } from '@/components/TeamBadge';
import { Icon, type IconName } from '@/components/Icon';
import { Lineups } from '@/components/Lineups';
import { allFixtures } from '@/utils/leagueFixtures';
import { LEAGUE_API } from '@/data/leagues';
import { isLive, isFinished } from '@/utils/realData';
import {
  fetchFixtureById, fetchFixtureEvents, fetchFixtureStatistics,
  type ApiEvent, type ApiTeamStatistics,
} from '@/utils/footballApi';
import { tap } from '@/utils/haptics';
import { t, tName, getLang, WEEKDAYS_I18N, MONTHS_I18N } from '@/utils/i18n';

type Tab = 'summary' | 'stats' | 'lineups';

const pad = (n: number) => n.toString().padStart(2, '0');

/** Estadísticas que mostramos y su etiqueta traducida. */
const STAT_KEYS: { api: string; key: string }[] = [
  { api: 'Ball Possession', key: 'stat.possession' },
  { api: 'Total Shots', key: 'stat.shotsTotal' },
  { api: 'Shots on Goal', key: 'stat.shotsOn' },
  { api: 'Shots off Goal', key: 'stat.shotsOff' },
  { api: 'Corner Kicks', key: 'stat.corners' },
  { api: 'Fouls', key: 'stat.fouls' },
  { api: 'Offsides', key: 'stat.offsides' },
  { api: 'Goalkeeper Saves', key: 'stat.saves' },
  { api: 'Yellow Cards', key: 'stat.yellows' },
  { api: 'Red Cards', key: 'stat.reds' },
];

const EVENT_ICON = (type: string, detail: string): IconName => {
  if (type === 'Goal') return 'target';
  if (type === 'Card') return detail.includes('Red') ? 'close' : 'alert';
  if (type === 'subst') return 'layers';
  return 'bolt';
};

function numOf(v: number | string | null): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return parseInt(v.replace('%', ''), 10) || 0;
}

export default function FixtureScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fixtureId = Number(id) || null;
  const teams = useStore((s) => s.teams);
  const leagueFixtures = useStore((s) => s.leagueFixtures);

  const [tab, setTab] = useState<Tab>('summary');
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  const [stats, setStats] = useState<ApiTeamStatistics[] | null>(null);
  const [liveInfo, setLiveInfo] = useState<{ status: string; elapsed: number | null; gh: number | null; ga: number | null; homeName: string; awayName: string; dateISO: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // base instantánea: lo que ya está en el caché de la cartelera
  const cached = useMemo(
    () => allFixtures(leagueFixtures).find((f) => f.fixtureId === fixtureId),
    [leagueFixtures, fixtureId],
  );

  const load = useCallback(async () => {
    if (fixtureId == null) return;
    const [info, ev, st] = await Promise.all([
      fetchFixtureById(fixtureId),
      fetchFixtureEvents(fixtureId),
      fetchFixtureStatistics(fixtureId),
    ]);
    const f = info?.[0];
    if (f) {
      // los nombres vienen también de la API: así la ficha funciona aunque el
      // partido no esté en el caché de la cartelera (link directo, liga ajena…).
      setLiveInfo({
        status: f.fixture.status.short, elapsed: f.fixture.status.elapsed,
        gh: f.goals.home, ga: f.goals.away,
        homeName: f.teams.home.name, awayName: f.teams.away.name, dateISO: f.fixture.date,
      });
    }
    setEvents(ev);
    setStats(st);
  }, [fixtureId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); tap();
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const homeTeam = cached?.homeTeamId ? teams.find((x) => x.id === cached.homeTeamId) : undefined;
  const awayTeam = cached?.awayTeamId ? teams.find((x) => x.id === cached.awayTeamId) : undefined;

  const status = liveInfo?.status ?? cached?.statusShort ?? 'NS';
  const elapsed = liveInfo?.elapsed ?? cached?.elapsed ?? null;
  const gh = liveInfo?.gh ?? cached?.goalsHome ?? null;
  const ga = liveInfo?.ga ?? cached?.goalsAway ?? null;
  const live = isLive(status);
  const done = isFinished(status);

  const homeName = homeTeam ? tName(homeTeam) : (cached?.homeName ?? liveInfo?.homeName ?? '—');
  const awayName = awayTeam ? tName(awayTeam) : (cached?.awayName ?? liveInfo?.awayName ?? '—');
  const initials = (n: string) => n.replace(/[^A-Za-zÀ-ÿ ]/g, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '—';

  const kickoffISO = cached?.dateISO ?? liveInfo?.dateISO ?? null;
  const kickoff = kickoffISO ? new Date(kickoffISO) : null;
  const lang = getLang();
  const dateTxt = kickoff
    ? `${WEEKDAYS_I18N[lang][kickoff.getDay()]} ${pad(kickoff.getDate())} ${MONTHS_I18N[lang][kickoff.getMonth()]} · ${pad(kickoff.getHours())}:${pad(kickoff.getMinutes())}`
    : '';

  const statRows = useMemo(() => {
    if (!stats || stats.length < 2) return [];
    const find = (side: ApiTeamStatistics, apiKey: string) => side.statistics.find((x) => x.type === apiKey)?.value ?? null;
    return STAT_KEYS.map(({ api, key }) => ({
      label: t(key),
      h: numOf(find(stats[0], api)),
      a: numOf(find(stats[1], api)),
      pctStyle: api === 'Ball Possession',
    })).filter((r) => r.h > 0 || r.a > 0);
  }, [stats]);

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => { tap(); router.back(); }} style={styles.back} hitSlop={8}>
          <Icon name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {cached ? LEAGUE_API[cached.league].label : t('fixture.title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />}
      >
        {/* cabecera con ambos equipos y el marcador */}
        <Animated.View entering={FadeInDown.duration(320)} style={styles.head}>
          <Pressable
            style={styles.side}
            onPress={() => { if (homeTeam) { tap(); router.push(`/team/${homeTeam.id}`); } }}
          >
            <TeamBadge short={homeTeam?.short ?? initials(homeName)} color={homeTeam?.color ?? '#3A4150'} color2={homeTeam?.color2 ?? '#252B36'} size={54} />
            <Text style={styles.sideName} numberOfLines={2}>{homeName}</Text>
          </Pressable>

          <View style={styles.center}>
            {live && (
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillTxt}>{status === 'HT' ? 'HT' : `${elapsed ?? 0}'`}</Text>
              </View>
            )}
            {live || done ? (
              <Text style={styles.score}>{gh ?? 0} - {ga ?? 0}</Text>
            ) : (
              <Text style={styles.kickoffTime}>{kickoff ? `${pad(kickoff.getHours())}:${pad(kickoff.getMinutes())}` : '—'}</Text>
            )}
            <Text style={styles.statusLine}>
              {done ? t('common.final') : live ? t('common.live') : dateTxt}
            </Text>
          </View>

          <Pressable
            style={styles.side}
            onPress={() => { if (awayTeam) { tap(); router.push(`/team/${awayTeam.id}`); } }}
          >
            <TeamBadge short={awayTeam?.short ?? initials(awayName)} color={awayTeam?.color ?? '#3A4150'} color2={awayTeam?.color2 ?? '#252B36'} size={54} />
            <Text style={styles.sideName} numberOfLines={2}>{awayName}</Text>
          </Pressable>
        </Animated.View>

        {/* operar los tokens del partido */}
        {(homeTeam || awayTeam) && (
          <View style={styles.tradeRow}>
            {homeTeam && (
              <Pressable onPress={() => { tap(); router.push(`/trade/${homeTeam.id}?side=BUY`); }} style={styles.tradeBtn}>
                <Text style={styles.tradeTxt}>{t('dash.trade', { s: homeTeam.short })}</Text>
              </Pressable>
            )}
            {awayTeam && (
              <Pressable onPress={() => { tap(); router.push(`/trade/${awayTeam.id}?side=BUY`); }} style={styles.tradeBtn}>
                <Text style={styles.tradeTxt}>{t('dash.trade', { s: awayTeam.short })}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.tabsRow}>
          {(['summary', 'stats', 'lineups'] as Tab[]).map((k) => (
            <Pressable key={k} onPress={() => { tap(); setTab(k); }} style={[styles.tabBtn, tab === k && styles.tabBtnOn]}>
              <Text style={[styles.tabTxt, tab === k && styles.tabTxtOn]}>{t(`match.tab.${k}`)}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: spacing.xl, paddingTop: 14 }}>
          {loading && <ActivityIndicator color={colors.gold} style={{ marginVertical: 30 }} />}
          {!loading && !cached && !liveInfo && <Text style={styles.empty}>{t('fixture.unavailable')}</Text>}

          {!loading && tab === 'summary' && (
            events && events.length > 0 ? (
              <View style={styles.timeline}>
                {events.map((e, i) => {
                  const isHomeSide = cached?.homeName === e.team.name;
                  return (
                    <Animated.View key={i} entering={FadeInDown.delay(Math.min(i, 8) * 35)} style={styles.evRow}>
                      <Text style={styles.evMin}>{e.time.elapsed}{e.time.extra ? `+${e.time.extra}` : ''}'</Text>
                      <View style={[styles.evIcon, { borderColor: e.type === 'Goal' ? colors.profit : colors.border }]}>
                        <Icon name={EVENT_ICON(e.type, e.detail)} size={13} color={e.type === 'Goal' ? colors.profit : colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.evPlayer} numberOfLines={1}>{e.player.name ?? e.detail}</Text>
                        <Text style={styles.evMeta} numberOfLines={1}>{e.team.name} · {e.detail}</Text>
                      </View>
                      <View style={[styles.evSide, isHomeSide ? styles.evSideHome : styles.evSideAway]} />
                    </Animated.View>
                  );
                })}
              </View>
            ) : <Text style={styles.empty}>{t('fixture.noEvents')}</Text>
          )}

          {!loading && tab === 'stats' && (
            statRows.length > 0 ? (
              <View style={styles.statsBox}>
                {statRows.map((r, i) => {
                  const total = r.h + r.a;
                  return (
                    <View key={i} style={styles.statRow}>
                      <View style={styles.statTop}>
                        <Text style={[styles.statVal, r.h >= r.a && styles.statValOn]}>{r.h}{r.pctStyle ? '%' : ''}</Text>
                        <Text style={styles.statLabel}>{r.label}</Text>
                        <Text style={[styles.statVal, r.a >= r.h && styles.statValOn, { textAlign: 'right' }]}>{r.a}{r.pctStyle ? '%' : ''}</Text>
                      </View>
                      <View style={styles.statBar}>
                        <View style={[styles.statSeg, { flex: total > 0 ? r.h : 1, backgroundColor: colors.blue }]} />
                        <View style={{ width: 3 }} />
                        <View style={[styles.statSeg, { flex: total > 0 ? r.a : 1, backgroundColor: colors.gold }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : <Text style={styles.empty}>{t('match.noStats')}</Text>
          )}

          {!loading && tab === 'lineups' && (
            <Lineups fixtureId={fixtureId} homeColor={homeTeam?.color ?? colors.blue} awayColor={awayTeam?.color ?? colors.gold} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: font.size.sm, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.xl, paddingTop: 10, paddingBottom: 18 },
  side: { flex: 1, alignItems: 'center', gap: 8 },
  sideName: { color: colors.text, fontSize: font.size.sm, fontWeight: '800', textAlign: 'center' },
  center: { alignItems: 'center', gap: 6, paddingHorizontal: 10, minWidth: 96 },
  score: { color: colors.text, fontSize: font.size['3xl'] ?? 34, fontFamily: font.family.heading, letterSpacing: 1 },
  kickoffTime: { color: colors.text, fontSize: font.size['2xl'], fontFamily: font.family.heading },
  statusLine: { color: colors.textTertiary, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.lossDim, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.loss },
  livePillTxt: { color: colors.loss, fontSize: 10, fontWeight: '900' },
  tradeRow: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.xl },
  tradeBtn: { flex: 1, backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  tradeTxt: { color: colors.gold, fontSize: font.size.sm, fontWeight: '900', letterSpacing: 0.5 },
  tabsRow: { flexDirection: 'row', marginHorizontal: spacing.xl, marginTop: 16, backgroundColor: colors.bgCard, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.full, alignItems: 'center' },
  tabBtnOn: { backgroundColor: colors.gold },
  tabTxt: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '800', textTransform: 'uppercase' },
  tabTxtOn: { color: '#14000F' },
  empty: { color: colors.textSecondary, fontSize: font.size.sm, textAlign: 'center', paddingVertical: 40, lineHeight: 20 },
  timeline: { gap: 2 },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  evMin: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '900', width: 34 },
  evIcon: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  evPlayer: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  evMeta: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  evSide: { width: 3, height: 24, borderRadius: 2 },
  evSideHome: { backgroundColor: colors.blue },
  evSideAway: { backgroundColor: colors.gold },
  statsBox: { gap: 14 },
  statRow: { gap: 6 },
  statTop: { flexDirection: 'row', alignItems: 'center' },
  statVal: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '800', width: 46 },
  statValOn: { color: colors.text },
  statLabel: { flex: 1, color: colors.textTertiary, fontSize: font.size.xs, textAlign: 'center', fontWeight: '600' },
  statBar: { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden' },
  statSeg: { height: 5, borderRadius: 3, opacity: 0.9 },
}));
