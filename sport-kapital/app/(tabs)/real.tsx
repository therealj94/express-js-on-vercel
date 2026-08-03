// app/(tabs)/real.tsx
// Pestaña "Real": calendario propio de la app (próximos partidos + resultados
// recientes del Mundial 2026, LaLiga y Liga Nacional) y los tokens por
// categoría. Funciona sin API — el calendario vive en data/schedule.ts. Los
// rivales sin token se muestran con su categoría y un precio por token asignado.
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { startRealEngineLazy } from '@/utils/realMatchEngine';
import { refreshRealData } from '@/utils/realDataFetcher';
import { router } from 'expo-router';
import { useStore, type PastRealMatch } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd } from '@/utils/format';
import { Icon, IconName } from '@/components/Icon';
import { GlitchText } from '@/components/GlitchText';
import { CyberBackground } from '@/components/CyberBackground';
import { TeamBadge } from '@/components/TeamBadge';
import { TeamCard } from '@/components/TeamCard';
import { type Team, type Tier } from '@/data/teams';
import {
  buildSchedule, upcomingFixtures, recentResults, mundialFixtures, resolveSide,
  type Fixture, type OpponentRef, type Side,
} from '@/data/schedule';
import { tap } from '@/utils/haptics';
import { t, tComp, getLang, WEEKDAYS_I18N } from '@/utils/i18n';
import { useBallRefresh, ballRefreshControl } from '@/components/BallRefresh';

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (sameDay(d, now)) return `${t('common.today')} ${hm}`;
  if (sameDay(d, tomorrow)) return `${t('common.tomorrow')} ${hm}`;
  return `${WEEKDAYS_I18N[getLang()][d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${hm}`;
}

export default function RealTab() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const teams = useStore((s) => s.teams);
  const refresh = useBallRefresh();

  // Arranque perezoso de lo que toca la RED: el motor de partidos reales y la
  // descarga del calendario real se activan la primera vez que se abre esta
  // pestaña, no en el arranque de la app (donde, en ciertos dispositivos,
  // causaban un cierre nativo). Ambas son idempotentes/cacheadas.
  useEffect(() => {
    startRealEngineLazy();
    refreshRealData();
  }, []);

  // el calendario se ancla a "ahora" para que los próximos siempre se vean próximos.
  const schedule = useMemo(() => buildSchedule(Date.now()), []);
  // el Mundial 2026 vive en su propio apartado (/mundial) — aquí solo LaLiga y Liga Nacional.
  const upcoming = useMemo(() => upcomingFixtures(schedule).filter((f) => f.league !== 'MUNDIAL').slice(0, 16), [schedule]);
  const results = useMemo(() => recentResults(schedule).filter((f) => f.league !== 'MUNDIAL').slice(0, 10), [schedule]);
  const pastReal = useStore((s) => s.pastRealMatches);
  const nextMundial = useMemo(() => mundialFixtures(schedule).find((f) => !f.finished) ?? null, [schedule]);

  const orderedTeams = useMemo(
    () => [...teams].sort((a, b) => (a.tier - b.tier) || (b.currentPrice - a.currentPrice)),
    [teams]
  );

  return (
    <View style={styles.container}>
      <CyberBackground variant="subtle" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: spacing.xl, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={ballRefreshControl(refresh)}
      >
        <View style={styles.header}>
          <Icon name="globe" size={20} color={colors.blue} />
          <GlitchText style={styles.title}>REAL</GlitchText>
        </View>
        <Text style={styles.subtitle}>
          {t('real.subtitle')}
        </Text>

        <MundialBanner fx={nextMundial} teams={teams} />

        <SectionTitle icon="calendar" label={t('real.upcoming')} />
        {upcoming.length === 0
          ? <EmptyRow text={t('real.noUpcoming')} />
          : upcoming.map((fx) => <FixtureCard key={fx.id} fx={fx} teams={teams} />)}

        <SectionTitle icon="trophy" label={t('real.results')} />
        {pastReal.map((m) => <PastRealCard key={m.id} m={m} />)}
        {results.length === 0 && pastReal.length === 0
          ? <EmptyRow text={t('real.noResults')} />
          : results.map((fx) => <FixtureCard key={fx.id} fx={fx} teams={teams} />)}

        <SectionTitle icon="candle" label={t('real.tokens')} />
        {isFocused && orderedTeams.map((t) => <TeamCard key={t.id} team={t} />)}
      </ScrollView>
    </View>
  );
}

const SectionTitle = ({ icon, label }: { icon: IconName; label: string }) => (
  <View style={styles.sectionRow}>
    <Icon name={icon} size={16} color={colors.text} />
    <Text style={styles.sectionTxt}>{label}</Text>
  </View>
);

const EmptyRow = ({ text }: { text: string }) => (
  <View style={styles.emptyRow}><Text style={styles.emptyRowTxt}>{text}</Text></View>
);

function PastRealCard({ m }: { m: PastRealMatch }) {
  return (
    <View style={styles.pastCard}>
      <View style={styles.pastHeader}>
        <Text style={styles.pastComp}>{t(`league.${m.league}`)}</Text>
        <View style={styles.pastRealBadge}><Text style={styles.pastRealBadgeTxt}>{t('match.realData')}</Text></View>
      </View>
      <View style={styles.pastRow}>
        <View style={styles.pastSide}>
          <TeamBadge short={m.homeShort} color={m.homeColor} color2={m.homeColor2} size={28} />
          <Text style={styles.pastShort}>{m.homeShort}</Text>
        </View>
        <Text style={styles.pastScore}>{m.scoreHome} - {m.scoreAway}</Text>
        <View style={[styles.pastSide, { justifyContent: 'flex-end' }]}>
          <Text style={styles.pastShort}>{m.awayShort}</Text>
          <TeamBadge short={m.awayShort} color={m.awayColor} color2={m.awayColor2} size={28} />
        </View>
      </View>
    </View>
  );
}

function MundialBanner({ fx, teams }: { fx: Fixture | null; teams: Team[] }) {
  const go = () => { tap(); router.push('/mundial'); };
  const home = fx ? resolveSide(fx.home, teams) : null;
  const away = fx ? resolveSide(fx.away, teams) : null;
  return (
    <Pressable onPress={go} style={styles.mundialBanner}>
      <View style={styles.mundialBadge}>
        <Icon name="trophy" size={22} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.mundialTitle}>{t('real.mundialTitle')}</Text>
        <Text style={styles.mundialSub} numberOfLines={1}>
          {fx && home && away
            ? `${tComp(fx.competition)} · ${fmtDate(fx.dateMs)} · ${home.name} vs ${away.name}`
            : t('real.mundialSub')}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.gold} />
    </Pressable>
  );
}

function FixtureCard({ fx, teams }: { fx: Fixture; teams: Team[] }) {
  const home = resolveSide(fx.home, teams);
  const away = resolveSide(fx.away, teams);
  if (!home || !away) return null;

  return (
    <View style={styles.matchCard}>
      <View style={styles.matchMeta}>
        <Text style={styles.matchComp} numberOfLines={1}>{tComp(fx.competition)}</Text>
        {fx.finished
          ? <View style={styles.finalPill}><Text style={styles.finalTxt}>{t('common.final')}</Text></View>
          : <Text style={styles.matchDate}>{fmtDate(fx.dateMs)}</Text>}
      </View>
      <SideRow side={home} score={fx.finished ? fx.scoreHome : undefined} />
      <SideRow side={away} score={fx.finished ? fx.scoreAway : undefined} />
    </View>
  );
}

function SideRow({ side, score }: { side: Side; score?: number }) {
  const tbd = side.external && side.price <= 0; // finalista aún por definir
  const go = () => { if (side.teamId) { tap(); router.push(`/team/${side.teamId}`); } };
  return (
    <Pressable onPress={go} disabled={!side.teamId} style={styles.sideRow}>
      <TeamBadge short={side.short} color={side.color} color2={side.color2} size={30} />
      <Text style={[styles.sideName, tbd && styles.sideNameTbd]} numberOfLines={1}>{tbd ? t('real.tbd') : side.name}</Text>
      {tbd ? null : side.external
        ? <View style={styles.catPill}><Text style={styles.catTxt}>{t(`tier.s${side.tier}`)}</Text></View>
        : <View style={styles.tokenDot} />}
      {!tbd && <Text style={styles.sidePrice}>{usd(side.price)}</Text>}
      {score != null && <Text style={styles.sideScore}>{score}</Text>}
    </Pressable>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { color: colors.text, fontSize: font.size.lg, letterSpacing: 2, fontFamily: font.family.headingBold },
  subtitle: { color: colors.textSecondary, fontSize: font.size.sm, lineHeight: 19, marginBottom: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, marginBottom: 14 },
  sectionTxt: { color: colors.text, fontSize: font.size.md, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1 },
  emptyRow: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  emptyRowTxt: { color: colors.textTertiary, fontSize: font.size.sm, fontWeight: '600' },
  pastCard: { backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.profit, padding: 12, marginBottom: 8 },
  pastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pastComp: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  pastRealBadge: { backgroundColor: colors.profitDim, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.profit, paddingHorizontal: 6, paddingVertical: 1 },
  pastRealBadgeTxt: { color: colors.profit, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  pastRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pastShort: { color: colors.text, fontSize: font.size.sm, fontWeight: '800' },
  pastScore: { color: colors.text, fontSize: font.size.lg, fontWeight: '900', letterSpacing: 1, marginHorizontal: 10 },

  matchCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  matchMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  matchComp: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '700', letterSpacing: 0.3, flex: 1, marginRight: 8 },
  matchDate: { color: colors.blue, fontSize: font.size.xs, fontWeight: '800' },
  finalPill: { backgroundColor: colors.bgCardHover, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.border },
  finalTxt: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  sideName: { color: colors.text, fontSize: font.size.sm, fontWeight: '700', flex: 1 },
  sideNameTbd: { color: colors.textTertiary, fontStyle: 'italic', fontWeight: '600' },
  catPill: { backgroundColor: colors.goldDim, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.gold },
  catTxt: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  tokenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.profit },
  sidePrice: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '700', minWidth: 66, textAlign: 'right' },
  sideScore: { color: colors.text, fontSize: font.size.md, fontWeight: '900', minWidth: 20, textAlign: 'right' },

  mundialBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginBottom: 4,
    backgroundColor: colors.goldDim, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.gold,
    padding: 14,
  },
  mundialBadge: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gold },
  mundialTitle: { color: colors.gold, fontSize: font.size.md, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1 },
  mundialSub: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '600', marginTop: 2 },
}));
