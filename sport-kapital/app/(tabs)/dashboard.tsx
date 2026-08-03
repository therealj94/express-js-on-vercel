// app/(tabs)/dashboard.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore, selectPortfolioValue, selectUnrealized, selectEquity } from '@/store/useStore';
import { isRealMatch } from '@/utils/matchEngine';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { usd, pct, timeAgo } from '@/utils/format';
import { TeamCard } from '@/components/TeamCard';
import { LiveMatchCard } from '@/components/LiveMatchCard';
import { MundialFeature } from '@/components/MundialFeature';
import { PriceFlash } from '@/components/PriceFlash';
import { Icon, IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { Panel } from '@/components/Panel';
import { GlitchText } from '@/components/GlitchText';
import { TutorialOverlay, useTutorial, HelpButton } from '@/components/TutorialOverlay';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { ensureNotificationPermission } from '@/utils/notifications';
import { useBallRefresh, ballRefreshControl } from '@/components/BallRefresh';

const TUTORIAL = () => [
  { icon: 'wallet' as IconName, title: t('tut.d1t'), body: t('tut.d1b'), accent: colors.gold },
  { icon: 'bolt' as IconName, title: t('tut.d2t'), body: t('tut.d2b'), accent: colors.profit },
  { icon: 'candle' as IconName, title: t('tut.d3t'), body: t('tut.d3b'), accent: colors.blue },
  { icon: 'pie' as IconName, title: t('tut.d4t'), body: t('tut.d4b'), accent: colors.purple },
];

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const user = useStore((s) => s.user);
  const alias = useStore((s) => s.alias);
  const teams = useStore((s) => s.teams);
  const balance = useStore((s) => s.balance);
  const realized = useStore((s) => s.realizedTotal);
  const matches = useStore((s) => s.matches);
  const news = useStore((s) => s.news);
  const soundMuted = useStore((s) => s.soundMuted);
  const setSoundMuted = useStore((s) => s.setSoundMuted);
  const unrealized = useStore(selectUnrealized);
  const portValue = useStore(selectPortfolioValue);
  const equity = useStore(selectEquity);
  const tut = useTutorial('dashboard');
  const refresh = useBallRefresh();
  const notifAsked = useStore((s) => s.notifAsked);
  const setNotifAsked = useStore((s) => s.setNotifAsked);
  // se lee solo una vez al montar: cuentas nuevas ya pasan por el paso de
  // notificaciones del onboarding (notifAsked ya queda true), así que este
  // aviso solo aparece para cuentas existentes que nunca lo vieron.
  const [notifPromptVisible, setNotifPromptVisible] = useState(() => !notifAsked);

  const acceptNotifPrompt = () => { ensureNotificationPermission(); setNotifAsked(); setNotifPromptVisible(false); };
  const dismissNotifPrompt = () => { setNotifAsked(); setNotifPromptVisible(false); };

  const accountMode = useStore((s) => s.accountMode);
  const setAccountMode = useStore((s) => s.setAccountMode);
  const realFixtures = useStore((s) => s.realFixtures);
  const isPractice = accountMode === 'PRACTICE';

  // partidos REALES de hoy/mañana de nuestros tokens (del caché diario de la
  // API): la cartelera real del día, para que la app viva de fútbol real.
  const todayReal = useMemo(() => {
    const now = Date.now();
    const seen = new Set<number>();
    const out: { teamId: string; fx: import('@/utils/realData').RealFixtureLite }[] = [];
    for (const [teamId, list] of Object.entries(realFixtures)) {
      for (const fx of list ?? []) {
        const ts = Date.parse(fx.dateISO);
        if (!Number.isFinite(ts) || ts < now - 2 * 3600_000 || ts > now + 36 * 3600_000) continue;
        if (seen.has(fx.fixtureId)) continue;
        seen.add(fx.fixtureId);
        out.push({ teamId, fx });
      }
    }
    return out.sort((a, b) => Date.parse(a.fx.dateISO) - Date.parse(b.fx.dateISO)).slice(0, 4);
  }, [realFixtures]);

  const sorted = useMemo(() => [...teams].sort((a, b) => b.priceChange - a.priceChange), [teams]);
  const gainers = sorted.slice(0, 3);
  const losers = sorted.slice(-3).reverse();
  // Tres mundos SEPARADOS para que la principal se vea ordenada:
  //  - reales: partidos reales del día (api-football) → arriba, protagonistas.
  //  - Mundial: los partidos del torneo (id 'sched-…') → van en su tarjeta
  //    premium propia (MundialFeature), no en esta lista.
  //  - simulación: el mercado de práctica (relleno) → sección aparte, al fondo.
  const { realLive, simLive } = useMemo(() => {
    const live = matches.filter((m) => m.status !== 'FT' && !m.id.startsWith('sched-'));
    return {
      realLive: live.filter(isRealMatch).slice(0, 3),
      simLive: live.filter((m) => !isRealMatch(m)).slice(0, 2),
    };
  }, [matches]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 30, paddingHorizontal: spacing.xl }} showsVerticalScrollIndicator={false} refreshControl={ballRefreshControl(refresh)}>
        <View style={styles.brandRow}>
          <Pressable onPress={() => { tap(); router.push('/profile'); }} style={styles.brandLeft}>
            <Logo size={34} />
            <View>
              <Text style={styles.hello}>{t('dash.hello', { name: alias || user?.name.split(' ')[0] || 'trader' })}</Text>
              <GlitchText style={styles.brand}>SPORT KAPITAL</GlitchText>
            </View>
          </Pressable>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => { tap(); setSoundMuted(!soundMuted); }}
              style={styles.soundBtn}
              hitSlop={8}
            >
              <Icon name={soundMuted ? 'sound-off' : 'sound-on'} size={17} color={soundMuted ? colors.textTertiary : colors.gold} />
            </Pressable>
            <HelpButton onPress={tut.open} />
          </View>
        </View>

        {isFocused ? (
          <>
            {/* selector de cuenta: REAL (por defecto) / PRÁCTICA — dos libros
                totalmente separados que nunca se mezclan */}
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => { if (isPractice) { tap(); setAccountMode('REAL'); } }}
                style={[styles.modeChip, !isPractice && styles.modeChipOnReal]}
              >
                <Text style={[styles.modeTxt, !isPractice && styles.modeTxtOnReal]}>{t('dash.modeReal')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (!isPractice) { tap(); setAccountMode('PRACTICE'); } }}
                style={[styles.modeChip, isPractice && styles.modeChipOnPractice]}
              >
                <Text style={[styles.modeTxt, isPractice && styles.modeTxtOnPractice]}>{t('dash.modePractice')}</Text>
              </Pressable>
            </View>

            <Animated.View entering={FadeInDown.duration(400)}>
              <Panel style={styles.equityCard} glow cut={14}>
                {isPractice && (
                  <View style={styles.practiceBadge}>
                    <Text style={styles.practiceBadgeTxt}>{t('dash.practiceFunds')}</Text>
                  </View>
                )}
                <Text style={styles.equityLabel}>{t('dash.equity')}</Text>
                <PriceFlash value={equity} format={usd} style={styles.equityValue} />
                <View style={styles.equityRow}>
                  <Col label={t('common.available')} value={usd(balance)} />
                  <Col label={t('dash.inPositions')} value={usd(portValue)} />
                </View>
                <View style={styles.pnlRow}>
                  <PnlChip label={t('dash.pnlUnreal')} value={unrealized} />
                  <PnlChip label={t('dash.pnlReal')} value={realized} />
                </View>
              </Panel>
            </Animated.View>

            {/* Mundial 2026: tarjeta premium destacada (próximo partido / Final). */}
            <MundialFeature />

            {/* Partidos REALES en vivo (api-football) — protagonistas. */}
            {realLive.length > 0 && (
              <>
                <Section title={t('dash.realLive')} icon="globe" color={colors.profit} />
                {realLive.map((m) => <LiveMatchCard key={m.id} match={m} />)}
              </>
            )}

            {/* Cartelera REAL del día: partidos de hoy de nuestros tokens */}
            {todayReal.length > 0 && (
              <>
                <Section title={t('dash.todayReal')} icon="calendar" color={colors.blue} />
                {todayReal.map(({ teamId, fx }) => {
                  const team = teams.find((tm) => tm.id === teamId);
                  if (!team) return null;
                  const d = new Date(fx.dateISO);
                  const hm = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                  return (
                    <Pressable key={fx.fixtureId} onPress={() => { tap(); router.push(`/team/${teamId}`); }} style={styles.todayRow}>
                      <View style={styles.todayTime}><Text style={styles.todayTimeTxt}>{hm}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.todayMatch} numberOfLines={1}>
                          {fx.isHome ? `${team.short} vs ${fx.opponentName}` : `${fx.opponentName} vs ${team.short}`}
                        </Text>
                        <Text style={styles.todayComp} numberOfLines={1}>{fx.competition}</Text>
                      </View>
                      <View style={styles.todayTrade}><Text style={styles.todayTradeTxt}>{t('mundial.tradeSide', { s: team.short })}</Text></View>
                    </Pressable>
                  );
                })}
              </>
            )}

            <Section title={t('dash.gainers')} icon="arrow-up-right" color={colors.profit} />
            {gainers.map((t) => <TeamCard key={t.id} team={t} />)}

            <Section title={t('dash.losers')} icon="arrow-down-right" color={colors.loss} />
            {losers.map((t) => <TeamCard key={t.id} team={t} />)}

            {/* Simulación: SOLO visible en modo práctica — en la cuenta real la
                app vive de partidos reales, sin contenido demostrativo. */}
            {isPractice && simLive.length > 0 && (
              <>
                <Section title={t('dash.simPractice')} icon="bolt" color={colors.textTertiary} />
                <Text style={styles.simNote}>{t('dash.simPracticeNote')}</Text>
                {simLive.map((m) => <LiveMatchCard key={m.id} match={m} />)}
              </>
            )}

            <Section title={t('dash.latestNews')} icon="news" />
            {news.length === 0 ? (
              <View style={styles.empty}>
                <Icon name="news" size={24} color={colors.textTertiary} />
                <Text style={styles.emptyTxt}>{t('dash.emptyNews')}</Text>
              </View>
            ) : (
              news.slice(0, 3).map((n) => (
                <Pressable key={n.id} onPress={() => { tap(); router.push('/(tabs)/news'); }} style={styles.newsRow}>
                  <View style={[styles.newsBar, { backgroundColor: n.impact >= 0 ? colors.profit : colors.loss }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.newsHead} numberOfLines={2}>{n.headline}</Text>
                    <Text style={styles.newsTime}>{timeAgo(n.ts)}</Text>
                  </View>
                  {n.impact !== 0 && (
                    <Text style={[styles.newsImpact, { color: n.impact >= 0 ? colors.profit : colors.loss }]}>{pct(n.impact)}</Text>
                  )}
                </Pressable>
              ))
            )}
          </>
        ) : (
          <View style={{ height: 500 }} />
        )}
      </ScrollView>

      <TutorialOverlay title={t('tut.welcome')} steps={TUTORIAL()} visible={tut.visible} onClose={tut.close} />
      <ConfirmDialog
        visible={notifPromptVisible}
        icon="bell"
        title={t('onb.notifT')}
        message={t('onb.notifB')}
        confirmLabel={t('onb.notifEnable')}
        cancelLabel={t('onb.notifSkip')}
        onConfirm={acceptNotifPrompt}
        onCancel={dismissNotifPrompt}
      />
    </View>
  );
}

const Col = ({ label, value }: { label: string; value: string }) => (
  <View style={{ flex: 1 }}>
    <Text style={styles.small}>{label}</Text>
    <Text style={styles.medium}>{value}</Text>
  </View>
);

const PnlChip = ({ label, value }: { label: string; value: number }) => (
  <View style={[styles.pnlChip, { backgroundColor: value >= 0 ? colors.profitDim : colors.lossDim }]}>
    <Text style={styles.pnlLabel}>{label}</Text>
    <Text style={[styles.pnlValue, { color: value >= 0 ? colors.profit : colors.loss }]}>
      {value >= 0 ? '+' : ''}{usd(value)}
    </Text>
  </View>
);

const Section = ({ title, icon, color }: { title: string; icon?: IconName; color?: string }) => (
  <View style={styles.sectionRow}>
    {icon && <Icon name={icon} size={17} color={color ?? colors.text} />}
    <Text style={styles.section}>{title}</Text>
  </View>
);

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  soundBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  hello: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: '600' },
  brand: { color: colors.text, fontSize: font.size.lg, letterSpacing: 2, marginTop: 2, fontFamily: font.family.headingBold },
  equityCard: { padding: 22 },
  equityLabel: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '600', letterSpacing: 1.5 },
  equityValue: { color: colors.text, fontSize: font.size['4xl'], marginTop: 8, letterSpacing: -1, fontFamily: font.family.heading },
  equityRow: { flexDirection: 'row', marginTop: 18, gap: 12 },
  small: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '600' },
  medium: { color: colors.text, fontSize: font.size.md, fontWeight: '700', marginTop: 3 },
  pnlRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  pnlChip: { flex: 1, borderRadius: radius.md, padding: 10 },
  pnlLabel: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '600' },
  pnlValue: { fontSize: font.size.md, fontWeight: '800', marginTop: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 30, marginBottom: 16 },
  section: { color: colors.text, fontSize: font.size.md, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1 },
  empty: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 10 },
  emptyTxt: { color: colors.textSecondary, fontSize: font.size.sm, textAlign: 'center', lineHeight: 20 },
  simNote: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: -6, marginBottom: 10, lineHeight: 16 },
  // selector de cuenta real/práctica
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modeChipOnReal: { backgroundColor: colors.profitDim, borderColor: colors.profit },
  modeChipOnPractice: { backgroundColor: colors.goldDim, borderColor: colors.gold },
  modeTxt: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  modeTxtOnReal: { color: colors.profit },
  modeTxtOnPractice: { color: colors.gold },
  practiceBadge: { alignSelf: 'flex-start', backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  practiceBadgeTxt: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  // cartelera real del día
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  todayTime: { backgroundColor: colors.blueDim, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 5 },
  todayTimeTxt: { color: colors.blue, fontSize: font.size.xs, fontWeight: '900' },
  todayMatch: { color: colors.text, fontSize: font.size.sm, fontWeight: '800' },
  todayComp: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 2, fontWeight: '600' },
  todayTrade: { backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6 },
  todayTradeTxt: { color: colors.gold, fontSize: font.size.xs, fontWeight: '900' },
  newsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8, gap: 12 },
  newsBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  newsHead: { color: colors.text, fontSize: font.size.sm, fontWeight: '600', lineHeight: 19 },
  newsTime: { color: colors.textTertiary, fontSize: font.size.xs, marginTop: 3 },
  newsImpact: { fontSize: font.size.sm, fontWeight: '800' },
}));
