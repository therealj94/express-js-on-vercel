// components/MundialFeature.tsx
// Tarjeta PREMIUM del Mundial 2026 para la pantalla principal: destaca el
// próximo partido del torneo (p. ej. la Gran Final) con cuenta regresiva, o el
// marcador en vivo si ya arrancó. Es el "gancho" del inicio — separado del
// mercado simulado y de los partidos reales del día. Toca → apartado /mundial.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useStore } from '@/store/useStore';
import { colors, font, radius, spacing, themedSheet, type Palette } from '@/theme/tokens';
import { Icon } from '@/components/Icon';
import { TeamBadge } from '@/components/TeamBadge';
import {
  buildSchedule, mundialFixtures, resolveSide, matchPhase, liveMinute, seededResult,
  type Fixture,
} from '@/data/schedule';
import { tap } from '@/utils/haptics';
import { t, tComp } from '@/utils/i18n';

const pad2 = (n: number) => n.toString().padStart(2, '0');

function hasResult(fx: Fixture, results: Record<string, [number, number]>, now: number): boolean {
  if (fx.finished) return true;
  if (results[fx.id]) return true;
  return matchPhase(fx.dateMs, now) === 'done';
}

export function MundialFeature() {
  const teams = useStore((s) => s.teams);
  const mundialResults = useStore((s) => s.mundialResults);
  const liveM = useStore((s) => s.matches);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const schedule = useMemo(() => buildSchedule(Date.now()), []);
  const next = useMemo(
    () => mundialFixtures(schedule).find((f) => !hasResult(f, mundialResults, now)) ?? null,
    [schedule, mundialResults, now],
  );

  const home = next ? resolveSide(next.home, teams) : null;
  const away = next ? resolveSide(next.away, teams) : null;
  if (!next || !home || !away) return null;

  const phase = matchPhase(next.dateMs, now);
  const live = liveM.find((m) => m.id === `sched-${next.id}`);
  const isLive = phase === 'live';
  const isPre = phase === 'pre';
  const minute = live ? live.minute : liveMinute(next.dateMs, now);
  const scoreH = live?.scoreHome ?? 0;
  const scoreA = live?.scoreAway ?? 0;

  const diff = Math.max(0, next.dateMs - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1_000);

  return (
    <Pressable onPress={() => { tap(); router.push('/mundial'); }} style={styles.card}>
      <View style={styles.glowEdge} />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.trophyWrap}><Icon name="trophy" size={16} color={colors.gold} /></View>
          <Text style={styles.brand}>{t('mundial.title')}</Text>
        </View>
        {isLive
          ? <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillTxt}>{`${t('common.live')} ${minute}'`}</Text></View>
          : isPre
            ? <View style={styles.openPill}><Text style={styles.openPillTxt}>{t('mundial.openToTrade')}</Text></View>
            : <Icon name="chevron-right" size={18} color={colors.gold} />}
      </View>

      <Text style={styles.comp}>{tComp(next.competition)}</Text>

      <View style={styles.teamsRow}>
        {/* cada selección es tocable: abre su pantalla de token (gráfico + operar) */}
        <Pressable
          style={styles.side}
          onPress={() => { if (home.teamId) { tap(); router.push(`/team/${home.teamId}`); } }}
        >
          <TeamBadge short={home.short} color={home.color} color2={home.color2} size={46} />
          <Text style={styles.teamName} numberOfLines={1}>{home.name}</Text>
        </Pressable>
        {isLive
          ? <Text style={styles.score}>{scoreH} - {scoreA}</Text>
          : <Text style={styles.vs}>{t('mundial.vs')}</Text>}
        <Pressable
          style={styles.side}
          onPress={() => { if (away.teamId) { tap(); router.push(`/team/${away.teamId}`); } }}
        >
          <TeamBadge short={away.short} color={away.color} color2={away.color2} size={46} />
          <Text style={styles.teamName} numberOfLines={1}>{away.name}</Text>
        </Pressable>
      </View>

      {!isLive && (
        <View style={styles.cdRow}>
          <Block v={days} l={t('mundial.days')} />
          <Text style={styles.colon}>:</Text>
          <Block v={hours} l={t('mundial.hours')} />
          <Text style={styles.colon}>:</Text>
          <Block v={mins} l={t('mundial.minutes')} />
          <Text style={styles.colon}>:</Text>
          <Block v={secs} l={t('mundial.seconds')} />
        </View>
      )}

      {/* Compra directa SIEMPRE disponible: la gente puede posicionarse antes,
          durante la última hora o con el partido en vivo, con un toque. */}
      {home.teamId && away.teamId && (
        <View style={styles.tradeRow}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); tap(); router.push(`/trade/${home.teamId}?side=BUY`); }}
            style={styles.tradeBtn}
          >
            <Text style={styles.tradeBtnTxt}>{t('mundial.tradeSide', { s: home.short })}</Text>
          </Pressable>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); tap(); router.push(`/trade/${away.teamId}?side=BUY`); }}
            style={styles.tradeBtn}
          >
            <Text style={styles.tradeBtnTxt}>{t('mundial.tradeSide', { s: away.short })}</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

function Block({ v, l }: { v: number; l: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockV}>{pad2(v)}</Text>
      <Text style={styles.blockL}>{l}</Text>
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.gold,
    padding: 16, marginBottom: 8, overflow: 'hidden',
    shadowColor: colors.gold, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  glowEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.gold, opacity: 0.85 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trophyWrap: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  brand: { color: colors.text, fontSize: font.size.sm, fontFamily: font.family.headingBold, textTransform: 'uppercase', letterSpacing: 1.5 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,60,60,0.14)', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.loss },
  livePillTxt: { color: colors.loss, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  openPill: { backgroundColor: colors.profitDim, borderRadius: radius.full, borderWidth: 1, borderColor: colors.profit, paddingHorizontal: 8, paddingVertical: 3 },
  openPillTxt: { color: colors.profit, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  comp: { color: colors.gold, fontSize: font.size.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  side: { flex: 1, alignItems: 'center', gap: 6, minWidth: 0 },
  teamName: { color: colors.text, fontSize: font.size.sm, fontWeight: '800', textAlign: 'center' },
  vs: { color: colors.textTertiary, fontSize: font.size.sm, fontWeight: '800', marginHorizontal: 8 },
  score: { color: colors.text, fontSize: font.size['2xl'], fontWeight: '900', letterSpacing: 1, marginHorizontal: 8 },
  cdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  tradeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tradeBtn: {
    flex: 1, backgroundColor: colors.goldDim, borderWidth: 1, borderColor: colors.gold,
    borderRadius: radius.md, paddingVertical: 9, alignItems: 'center',
  },
  tradeBtnTxt: { color: colors.gold, fontSize: font.size.sm, fontWeight: '900', letterSpacing: 0.5 },
  block: { alignItems: 'center', minWidth: 42 },
  blockV: { color: colors.gold, fontSize: font.size.xl, fontFamily: font.family.heading, letterSpacing: 0.5 },
  blockL: { color: colors.textTertiary, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  colon: { color: colors.gold, fontSize: font.size.xl, fontFamily: font.family.heading, marginBottom: 14 },
}));
