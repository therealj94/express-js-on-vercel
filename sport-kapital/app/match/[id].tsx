// app/match/[id].tsx
// Partido en vivo: marcador con minuto, precios de ambos tokens en tiempo real
// y el feed de eventos con el impacto que cada uno tuvo en el mercado.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd, pct } from '@/utils/format';
import { TeamBadge } from '@/components/TeamBadge';
import { PriceFlash } from '@/components/PriceFlash';
import { Icon, IconName } from '@/components/Icon';
import { Panel } from '@/components/Panel';

import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { isRealMatch, type MatchEventKind, type LiveMatch } from '@/utils/matchEngine';
import { pokeRealEngine } from '@/utils/realMatchEngine';

const EVENT_ICON: Record<MatchEventKind, IconName> = {
  GOL: 'target', TIRO: 'bolt', FALTA: 'alert', AMARILLA: 'alert', ROJA: 'close',
  CORNER: 'flame', INICIO: 'clock', DESCANSO: 'clock', FINAL: 'check-circle',
};
const EVENT_COLOR = (): Record<MatchEventKind, string> => ({
  GOL: colors.profit, TIRO: colors.blue, FALTA: colors.textSecondary, AMARILLA: colors.gold,
  ROJA: colors.loss, CORNER: colors.purple, INICIO: colors.textSecondary, DESCANSO: colors.textSecondary, FINAL: colors.text,
});

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = useStore((s) => s.matches.find((m) => m.id === id));
  const home = useStore((s) => s.teams.find((t) => t.id === match?.homeId));
  const away = useStore((s) => s.teams.find((t) => t.id === match?.awayId));

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(0.25, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!match || !home || !away) {
    return (
      <View style={styles.container}>
        <Text style={styles.missing}>{t('match.gone')}</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}><Text style={styles.backLinkTxt}>{t('match.back')}</Text></Pressable>
      </View>
    );
  }

  const live = match.status !== 'FT';
  const real = isRealMatch(match);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (!real) return;
    setRefreshing(true);
    tap();
    try { await pokeRealEngine(); } catch { /* no-op */ }
    setRefreshing(false);
  }, [real]);

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => { tap(); router.back(); }} style={styles.back}><Icon name="chevron-left" size={20} color={colors.text} /></Pressable>
        <Text style={styles.topTitle}>{t(`league.${match.league}`)}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={real
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />
          : undefined}
      >
        {/* Marcador */}
        <Panel style={styles.scoreCard} glow cut={14}>
          <View style={styles.statusRow}>
            {live && <Animated.View style={[styles.dot, dotStyle]} />}
            <Text style={[styles.statusTxt, !live && { color: colors.textTertiary }]}>
              {match.status === 'FT' ? t('common.final') : match.status === 'HT' ? t('match.halftime') : t('match.minuteLbl', { n: match.minute })}
            </Text>
            {real ? (
              <View style={styles.realBadge}><Text style={styles.realBadgeTxt}>{t('match.realData')}</Text></View>
            ) : (
              <View style={styles.simBadge}><Text style={styles.simBadgeTxt}>{t('match.simData')}</Text></View>
            )}
          </View>

          <View style={styles.scoreRow}>
            <TeamSide teamId={home.id} />
            <Text style={styles.score} numberOfLines={1} adjustsFontSizeToFit>{match.scoreHome} - {match.scoreAway}</Text>
            <TeamSide teamId={away.id} />
          </View>

          <PossessionBar match={match} homeShort={home.short} awayShort={away.short} homeColor={home.color} awayColor={away.color} />

          <Text style={styles.liquidityNote}>{t('match.liquidityNote')}</Text>
          {real && live && <Text style={styles.refreshHint}>{t('match.pullRefresh')}</Text>}
        </Panel>

        {/* Estadísticas oficiales completas (solo partidos reales) */}
        {match.statsHome && match.statsAway && (
          <>
            <Text style={styles.section}>{t('match.liveStats')}</Text>
            <View style={styles.statsPanel}>
              <View style={styles.statsHead}>
                <Text style={[styles.statsHeadTeam, { color: home.color === '#FFFFFF' ? colors.text : home.color }]}>{home.short}</Text>
                <Text style={styles.statsHeadMid}>{t('match.official')}</Text>
                <Text style={[styles.statsHeadTeam, { color: away.color === '#FFFFFF' ? colors.text : away.color, textAlign: 'right' }]}>{away.short}</Text>
              </View>
              <StatRow label={t('stat.shotsOn')} h={match.statsHome.shotsOn} a={match.statsAway.shotsOn} hc={home.color} ac={away.color} />
              <StatRow label={t('stat.shotsTotal')} h={match.statsHome.shotsTotal} a={match.statsAway.shotsTotal} hc={home.color} ac={away.color} />
              <StatRow label={t('stat.shotsOff')} h={match.statsHome.shotsOff} a={match.statsAway.shotsOff} hc={home.color} ac={away.color} />
              <StatRow label={t('stat.corners')} h={match.statsHome.corners} a={match.statsAway.corners} hc={home.color} ac={away.color} />
              <StatRow label={t('stat.fouls')} h={match.statsHome.fouls} a={match.statsAway.fouls} hc={home.color} ac={away.color} />
              <StatRow label={t('stat.offsides')} h={match.statsHome.offsides} a={match.statsAway.offsides} hc={home.color} ac={away.color} />
              <StatRow label={t('stat.saves')} h={match.statsHome.saves} a={match.statsAway.saves} hc={home.color} ac={away.color} />
              <StatRow label={t('stat.yellows')} h={match.statsHome.yellows} a={match.statsAway.yellows} hc={colors.gold} ac={colors.gold} />
              <StatRow label={t('stat.reds')} h={match.statsHome.reds} a={match.statsAway.reds} hc={colors.loss} ac={colors.loss} />
            </View>
          </>
        )}

        {/* Feed de eventos */}
        <Text style={styles.section}>{t('match.liveFeed')}</Text>
        <View style={{ paddingHorizontal: spacing.xl }}>
          {match.events.map((e, i) => {
            const team = e.teamId === home.id ? home : away;
            const evColor = EVENT_COLOR()[e.kind];
            return (
              <Animated.View key={e.id} entering={i < 6 ? FadeInDown.delay(i * 40) : undefined} style={styles.eventRow}>
                <View style={[styles.eventIcon, { borderColor: evColor }]}>
                  <Icon name={EVENT_ICON[e.kind]} size={15} color={evColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTxt}>{e.text}</Text>
                  <Text style={styles.eventMeta}>{team.short} · min {e.minute}</Text>
                </View>
                {e.impact !== 0 && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.eventImpact, { color: e.impact >= 0 ? colors.profit : colors.loss }]}>{pct(e.impact)}</Text>
                    <Text style={[styles.eventImpactRival, { color: e.impact >= 0 ? colors.loss : colors.profit }]}>{t('match.rival', { v: pct(-e.impact) })}</Text>
                  </View>
                )}
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// Fila de estadística comparada, estilo SofaScore: valores a los lados y una
// barra dividida proporcional en el medio. Resalta al que domina la métrica.
function StatRow({ label, h, a, hc, ac }: { label: string; h: number; a: number; hc: string; ac: string }) {
  const total = h + a;
  const hFlex = total > 0 ? h : 1;
  const aFlex = total > 0 ? a : 1;
  const safeH = hc === '#FFFFFF' ? colors.textSecondary : hc;
  const safeA = ac === '#FFFFFF' ? colors.textSecondary : ac;
  return (
    <View style={styles.statRow}>
      <View style={styles.statTop}>
        <Text style={[styles.statVal, h >= a && h > 0 && { color: colors.text }]}>{h}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statVal, a >= h && a > 0 && { color: colors.text }, { textAlign: 'right' }]}>{a}</Text>
      </View>
      <View style={styles.statBar}>
        <View style={[styles.statSeg, { flex: hFlex, backgroundColor: safeH, opacity: total > 0 ? 0.9 : 0.15 }]} />
        <View style={{ width: 3 }} />
        <View style={[styles.statSeg, { flex: aFlex, backgroundColor: safeA, opacity: total > 0 ? 0.9 : 0.15 }]} />
      </View>
    </View>
  );
}

function PossessionBar({ match, homeShort, awayShort, homeColor, awayColor }: {
  match: LiveMatch; homeShort: string; awayShort: string; homeColor: string; awayColor: string;
}) {
  if (match.possHome == null || match.possAway == null) return null;
  const total = match.possHome + match.possAway || 1;
  const hp = Math.round((match.possHome / total) * 100);
  const ap = 100 - hp;
  return (
    <View style={styles.possWrap}>
      <View style={styles.possHeader}>
        <Text style={styles.possLabel}>{t('match.possession')}</Text>
      </View>
      <View style={styles.possRow}>
        <Text style={[styles.possPct, { color: homeColor }]}>{hp}%</Text>
        <View style={styles.possBar}>
          <View style={[styles.possSeg, { flex: hp, backgroundColor: homeColor }]} />
          <View style={[styles.possSeg, { flex: ap, backgroundColor: awayColor }]} />
        </View>
        <Text style={[styles.possPct, { color: awayColor }]}>{ap}%</Text>
      </View>
      <View style={styles.possRow}>
        <Text style={styles.possTeam}>{homeShort}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.possTeam}>{awayShort}</Text>
      </View>
    </View>
  );
}

function TeamSide({ teamId }: { teamId: string }) {
  const team = useStore((s) => s.teams.find((t) => t.id === teamId));
  if (!team) return null;
  const up = team.priceChange >= 0;
  return (
    <Pressable onPress={() => { tap(); router.push(`/team/${team.id}`); }} style={styles.side}>
      <TeamBadge short={team.short} color={team.color} color2={team.color2} size={48} />
      <Text style={styles.sideName} numberOfLines={1}>{team.short}</Text>
      <PriceFlash value={team.currentPrice} format={usd} style={styles.sidePrice} />
      <Text style={[styles.sidePct, { color: up ? colors.profit : colors.loss }]}>{pct(team.priceChange)}</Text>
      <View style={styles.tradeBtn}><Text style={styles.tradeBtnTxt}>{t('match.trade')}</Text></View>
    </Pressable>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  missing: { color: colors.textSecondary, textAlign: 'center', marginTop: 140, fontSize: font.size.md, paddingHorizontal: 40 },
  backLink: { alignSelf: 'center', marginTop: 16, padding: 10 },
  backLinkTxt: { color: colors.gold, fontWeight: '800' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.text, fontSize: font.size.md, fontFamily: font.family.headingBold, textTransform: 'uppercase' },
  scoreCard: { marginHorizontal: spacing.xl, marginTop: 8, padding: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.loss },
  statusTxt: { color: colors.loss, fontSize: font.size.xs, fontWeight: '800', letterSpacing: 1.5 },
  realBadge: { backgroundColor: colors.profitDim, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.profit, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4 },
  realBadgeTxt: { color: colors.profit, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, fontFamily: font.family.bodyBold },
  simBadge: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4 },
  simBadgeTxt: { color: colors.textTertiary, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, fontFamily: font.family.bodyBold },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  score: { color: colors.text, fontSize: 38, letterSpacing: 1, fontFamily: font.family.heading, textAlign: 'center', paddingHorizontal: 6, flexShrink: 0 },
  side: { alignItems: 'center', flex: 1, minWidth: 0, gap: 3 },
  sideName: { color: colors.text, fontSize: font.size.sm, fontWeight: '800', marginTop: 4 },
  sidePrice: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  sidePct: { fontSize: font.size.xs, fontWeight: '700' },
  tradeBtn: { backgroundColor: colors.goldDim, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 5, marginTop: 5, borderWidth: 1, borderColor: colors.gold },
  tradeBtnTxt: { color: colors.gold, fontSize: font.size.xs, fontWeight: '800' },
  liquidityNote: { color: colors.textTertiary, fontSize: font.size.xs, textAlign: 'center', marginTop: 14, lineHeight: 17 },
  refreshHint: { color: colors.textTertiary, fontSize: 10, textAlign: 'center', marginTop: 6, fontWeight: '600' },
  // panel de estadísticas oficiales
  statsPanel: {
    marginHorizontal: spacing.xl, backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: 14,
  },
  statsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statsHeadTeam: { fontSize: font.size.sm, fontWeight: '900', letterSpacing: 1, width: 52 },
  statsHeadMid: { color: colors.textTertiary, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  statRow: { marginBottom: 10 },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  statVal: { color: colors.textTertiary, fontSize: font.size.sm, fontWeight: '800', width: 40 },
  statLabel: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statBar: { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden' },
  statSeg: { height: '100%', borderRadius: 3 },
  // posesión de la pelota
  possWrap: { marginTop: 16, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  possHeader: { alignItems: 'center', marginBottom: 8 },
  possLabel: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  possRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  possPct: { fontSize: font.size.sm, fontWeight: '900', minWidth: 40 },
  possBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.bgElevated },
  possSeg: { height: '100%' },
  possTeam: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '700' },
  section: { color: colors.text, fontSize: font.size.md, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: spacing.xl, marginTop: 20, marginBottom: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  eventIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated },
  eventTxt: { color: colors.text, fontSize: font.size.sm, fontWeight: '600', lineHeight: 19 },
  eventMeta: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 2, fontWeight: '600' },
  eventImpact: { fontSize: font.size.sm, fontWeight: '800' },
  eventImpactRival: { fontSize: font.size.xs, fontWeight: '600', marginTop: 1 },
}));
