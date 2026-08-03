// app/mundial.tsx
// Apartado dedicado al Mundial 2026: cuenta regresiva a los dos partidos que
// faltan (tercer puesto y gran final) y el camino completo al título —
// octavos, cuartos, semifinales, tercer puesto y final — en un solo lugar,
// con diseño propio (no mezclado con LaLiga/Liga Nacional en la pestaña Real).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { GlitchText } from '@/components/GlitchText';
import { CyberBackground } from '@/components/CyberBackground';
import { TeamBadge } from '@/components/TeamBadge';
import {
  buildSchedule, mundialFixtures, resolveSide, matchPhase, liveMinute, seededResult,
  type Fixture,
} from '@/data/schedule';
import { startRealEngineLazy } from '@/utils/realMatchEngine';
import { fmtDate } from './(tabs)/real';
import { tap } from '@/utils/haptics';
import { t, tComp } from '@/utils/i18n';

// Resultado "efectivo" de un partido del Mundial: el de los datos si ya venía
// jugado; si no, el que la app simuló en vivo (guardado en mundialResults); y
// si ya pasó su horario pero la app no lo simuló, uno determinístico estable.
// Devuelve null si el partido todavía no terminó.
function effectiveResult(
  fx: Fixture,
  results: Record<string, [number, number]>,
  nowMs: number,
): [number, number] | null {
  if (fx.finished && fx.scoreHome != null && fx.scoreAway != null) return [fx.scoreHome, fx.scoreAway];
  if (results[fx.id]) return results[fx.id];
  if (matchPhase(fx.dateMs, nowMs) === 'done') return seededResult(fx);
  return null;
}

function useCountdown(targetMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = targetMs - now;
  const isLive = diff <= 0;
  const abs = Math.max(0, diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1_000);
  return { days, hours, minutes, seconds, isLive };
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

export default function MundialScreen() {
  const insets = useSafeAreaInsets();
  const teams = useStore((s) => s.teams);
  // arranque perezoso del motor de partidos reales (ver real.tsx): se activa
  // al entrar aquí en vez de en el arranque de la app.
  useEffect(() => { startRealEngineLazy(); }, []);
  const mundialResults = useStore((s) => s.mundialResults);
  const schedule = useMemo(() => buildSchedule(Date.now()), []);
  const fixtures = useMemo(() => mundialFixtures(schedule), [schedule]);
  // "lo que falta" = partidos sin resultado efectivo todavía (por jugar, o en
  // vivo/por abrir en la última hora). El resto ya tiene marcador.
  const upcoming = useMemo(
    () => fixtures.filter((f) => effectiveResult(f, mundialResults, Date.now()) == null),
    [fixtures, mundialResults],
  );

  // agrupa el cuadro en orden cronológico por ronda (octavos, cuartos, semifinal…)
  const rounds = useMemo(() => {
    const out: { round: string; items: Fixture[] }[] = [];
    for (const fx of fixtures) {
      const round = tComp(fx.competition);
      const last = out[out.length - 1];
      if (last && last.round === round) last.items.push(fx);
      else out.push({ round, items: [fx] });
    }
    return out;
  }, [fixtures]);

  return (
    <View style={styles.container}>
      <CyberBackground variant="subtle" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: spacing.xl, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => { tap(); router.back(); }} style={styles.back}>
            <Icon name="chevron-left" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTrophyWrap}>
            <Icon name="trophy" size={40} color={colors.gold} />
          </View>
          <GlitchText style={styles.heroTitle}>{t('mundial.title')}</GlitchText>
          <Text style={styles.heroSub}>{t('mundial.subtitle')}</Text>
        </View>

        {upcoming.length > 0 && (
          <>
            <SectionLabel icon="bolt" text={t('mundial.remaining')} />
            {upcoming.map((fx) => <CountdownCard key={fx.id} fx={fx} teams={teams} />)}
          </>
        )}

        <SectionLabel icon="layers" text={t('mundial.bracket')} />
        {rounds.map((r) => (
          <View key={r.round} style={styles.roundBlock}>
            <Text style={styles.roundLabel}>{r.round}</Text>
            {r.items.map((fx) => <BracketRow key={fx.id} fx={fx} teams={teams} />)}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SectionLabel({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) {
  return (
    <View style={styles.sectionRow}>
      <Icon name={icon} size={16} color={colors.gold} />
      <Text style={styles.sectionTxt}>{text}</Text>
    </View>
  );
}

function CountdownCard({ fx, teams }: { fx: Fixture; teams: ReturnType<typeof useStore.getState>['teams'] }) {
  const home = resolveSide(fx.home, teams);
  const away = resolveSide(fx.away, teams);
  const cd = useCountdown(fx.dateMs);
  // partido en vivo simulado para este fixture (si ya arrancó), del store
  const liveMatch = useStore((s) => s.matches.find((m) => m.id === `sched-${fx.id}`));
  if (!home || !away) return null;

  const phase = matchPhase(fx.dateMs);
  const isLive = phase === 'live';
  const isPre = phase === 'pre';       // dentro de la última hora: se abre para operar
  const minute = liveMatch ? liveMatch.minute : liveMinute(fx.dateMs);
  const scoreH = liveMatch?.scoreHome ?? 0;
  const scoreA = liveMatch?.scoreAway ?? 0;
  const homeId = fx.home.kind === 'team' ? fx.home.teamId : undefined;

  // en vivo: abre el detalle del partido. Por abrir (última hora): abre el
  // equipo local para operar de una. Más lejos: no navega (solo cuenta atrás).
  const onPress = () => {
    tap();
    if (isLive && liveMatch) router.push(`/match/${liveMatch.id}`);
    else if (homeId) router.push(`/team/${homeId}`);
  };
  const pressable = isLive || isPre;

  return (
    <Animated.View entering={FadeInDown.duration(350)}>
      <Pressable
        onPress={onPress}
        disabled={!pressable}
        style={[styles.countCard, isLive && styles.countCardLive, isPre && styles.countCardPre]}
      >
        <View style={styles.countHeader}>
          <Text style={styles.countComp}>{tComp(fx.competition)}</Text>
          {isLive
            ? <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillTxt}>{`${t('common.live')} ${minute}'`}</Text></View>
            : isPre
              ? <View style={styles.openPill}><Text style={styles.openPillTxt}>{t('mundial.openToTrade')}</Text></View>
              : <Text style={styles.countDate}>{fmtDate(fx.dateMs)}</Text>}
        </View>

        <View style={styles.countTeams}>
          <View style={styles.countSide}>
            <TeamBadge short={home.short} color={home.color} color2={home.color2} size={44} />
            <Text style={styles.countName} numberOfLines={1}>{home.name}</Text>
          </View>
          {isLive
            ? <Text style={styles.countScore}>{scoreH} - {scoreA}</Text>
            : <Text style={styles.countVs}>{t('mundial.vs')}</Text>}
          <View style={styles.countSide}>
            <TeamBadge short={away.short} color={away.color} color2={away.color2} size={44} />
            <Text style={styles.countName} numberOfLines={1}>{away.name}</Text>
          </View>
        </View>

        {!isLive && (
          <View style={styles.countdownRow}>
            <TimeBlock value={cd.days} label={t('mundial.days')} />
            <Text style={styles.countdownColon}>:</Text>
            <TimeBlock value={cd.hours} label={t('mundial.hours')} />
            <Text style={styles.countdownColon}>:</Text>
            <TimeBlock value={cd.minutes} label={t('mundial.minutes')} />
            <Text style={styles.countdownColon}>:</Text>
            <TimeBlock value={cd.seconds} label={t('mundial.seconds')} />
          </View>
        )}

        {(isLive || isPre) && (
          <Text style={styles.tapHint}>
            {isLive ? t('mundial.tapMatch') : t('mundial.tapTrade')}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.timeBlock}>
      <Text style={styles.timeValue}>{pad2(value)}</Text>
      <Text style={styles.timeLabel}>{label}</Text>
    </View>
  );
}

function BracketRow({ fx, teams }: { fx: Fixture; teams: ReturnType<typeof useStore.getState>['teams'] }) {
  const home = resolveSide(fx.home, teams);
  const away = resolveSide(fx.away, teams);
  const mundialResults = useStore((s) => s.mundialResults);
  if (!home || !away) return null;
  const tbd = (s: typeof home) => s.external && s.price <= 0;
  const result = effectiveResult(fx, mundialResults, Date.now());

  return (
    <View style={styles.bracketRow}>
      <BracketSide side={home} score={result?.[0]} tbd={tbd(home)} />
      <Text style={styles.bracketDash}>—</Text>
      <BracketSide side={away} score={result?.[1]} tbd={tbd(away)} right />
      {!result && <Text style={styles.bracketDate}>{fmtDate(fx.dateMs)}</Text>}
    </View>
  );
}

function BracketSide({ side, score, tbd, right }: { side: NonNullable<ReturnType<typeof resolveSide>>; score?: number; tbd?: boolean; right?: boolean }) {
  return (
    <View style={[styles.bracketSide, right && { flexDirection: 'row-reverse' }]}>
      <TeamBadge short={side.short} color={side.color} color2={side.color2} size={26} />
      <Text style={[styles.bracketName, tbd && styles.bracketNameTbd, right && { textAlign: 'right' }]} numberOfLines={1}>
        {tbd ? t('real.tbd') : side.name}
      </Text>
      {score != null && <Text style={styles.bracketScore}>{score}</Text>}
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },

  hero: { alignItems: 'center', paddingVertical: 18 },
  heroTrophyWrap: {
    width: 76, height: 76, borderRadius: 24, backgroundColor: colors.goldDim, borderWidth: 1.5, borderColor: colors.gold,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  heroTitle: { color: colors.text, fontSize: font.size['2xl'], fontFamily: font.family.heading, textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center' },
  heroSub: { color: colors.textSecondary, fontSize: font.size.sm, textAlign: 'center', marginTop: 6, paddingHorizontal: 20, lineHeight: 19 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 12 },
  sectionTxt: { color: colors.gold, fontSize: font.size.md, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1 },

  countCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.gold,
    padding: 16, marginBottom: 14,
  },
  countCardLive: { borderColor: colors.loss, shadowColor: colors.loss, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  countCardPre: { borderColor: colors.profit, shadowColor: colors.profit, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  countHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  countComp: { color: colors.textSecondary, fontSize: font.size.xs, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  countDate: { color: colors.gold, fontSize: font.size.xs, fontWeight: '800' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,60,60,0.14)', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.loss },
  livePillTxt: { color: colors.loss, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  openPill: { backgroundColor: colors.profitDim, borderRadius: radius.full, borderWidth: 1, borderColor: colors.profit, paddingHorizontal: 8, paddingVertical: 3 },
  openPillTxt: { color: colors.profit, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  countTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  countSide: { flex: 1, alignItems: 'center', gap: 6 },
  countName: { color: colors.text, fontSize: font.size.sm, fontWeight: '800', textAlign: 'center' },
  countVs: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '800', marginHorizontal: 8 },
  countScore: { color: colors.text, fontSize: font.size['2xl'], fontWeight: '900', letterSpacing: 1, marginHorizontal: 8 },
  tapHint: { color: colors.textTertiary, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4 },

  countdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  timeBlock: { alignItems: 'center', minWidth: 44 },
  timeValue: { color: colors.gold, fontSize: font.size.xl, fontFamily: font.family.heading, letterSpacing: 0.5 },
  timeLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  countdownColon: { color: colors.gold, fontSize: font.size.xl, fontFamily: font.family.heading, marginBottom: 14 },

  roundBlock: { marginBottom: 18 },
  roundLabel: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  bracketRow: {
    backgroundColor: colors.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6,
  },
  bracketSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  bracketName: { color: colors.text, fontSize: font.size.sm, fontWeight: '700', flexShrink: 1 },
  bracketNameTbd: { color: colors.textTertiary, fontStyle: 'italic', fontWeight: '600' },
  bracketScore: { color: colors.text, fontSize: font.size.md, fontWeight: '900', marginHorizontal: 4 },
  bracketDash: { color: colors.textTertiary, fontSize: font.size.sm, fontWeight: '700' },
  bracketDate: { color: colors.gold, fontSize: 10, fontWeight: '800', width: '100%', textAlign: 'center', marginTop: 2 },
}));
