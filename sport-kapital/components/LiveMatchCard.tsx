// components/LiveMatchCard.tsx
// Tarjeta de partido en vivo: marcador, minuto con pulso, precios de ambos tokens moviéndose.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { colors, font, radius, themedSheet, type Palette } from '@/theme/tokens';
import { usd, pct } from '@/utils/format';
import { TeamBadge } from '@/components/TeamBadge';
import { PriceFlash } from '@/components/PriceFlash';
import { useStore } from '@/store/useStore';

import { tap } from '@/utils/haptics';
import { t } from '@/utils/i18n';
import { isRealMatch, type LiveMatch } from '@/utils/matchEngine';

export function LiveMatchCard({ match }: { match: LiveMatch }) {
  const home = useStore((s) => s.teams.find((t) => t.id === match.homeId));
  const away = useStore((s) => s.teams.find((t) => t.id === match.awayId));
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(0.25, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!home || !away) return null;
  const live = match.status !== 'FT';
  const isReal = isRealMatch(match);

  return (
    <Pressable onPress={() => { tap(); router.push(`/match/${match.id}`); }} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.liveRow}>
          {live && <Animated.View style={[styles.dot, dotStyle]} />}
          <Text style={[styles.liveTxt, !live && { color: colors.textTertiary }]}>
            {match.status === 'FT' ? t('common.final') : match.status === 'HT' ? t('match.halftime') : `${match.minute}'`}
          </Text>
          {isReal ? (
            <View style={styles.realBadge}>
              <Text style={styles.realBadgeTxt}>{t('match.realData')}</Text>
            </View>
          ) : (
            <View style={styles.simBadge}>
              <Text style={styles.simBadgeTxt}>{t('match.simData')}</Text>
            </View>
          )}
        </View>
        <Text style={styles.league}>{t(`league.${match.league}`)}</Text>
      </View>

      <View style={styles.row}>
        <Side team={home} />
        <View style={styles.scoreBox}>
          <Text style={styles.score}>{match.scoreHome} - {match.scoreAway}</Text>
        </View>
        <Side team={away} right />
      </View>
    </Pressable>
  );
}

function Side({ team, right }: { team: NonNullable<ReturnType<typeof useStore.getState>['teams'][number]>; right?: boolean }) {
  const up = team.priceChange >= 0;
  return (
    <View style={[styles.side, right && { alignItems: 'flex-end' }]}>
      <TeamBadge short={team.short} color={team.color} color2={team.color2} size={38} />
      <Text style={styles.teamName} numberOfLines={1}>{team.short}</Text>
      <PriceFlash value={team.currentPrice} format={usd} style={styles.price} />
      <Text style={[styles.pctTxt, { color: up ? colors.profit : colors.loss }]}>{pct(team.priceChange)}</Text>
    </View>
  );
}

const styles = themedSheet((colors: Palette) => StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.borderStrong, marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.loss },
  liveTxt: { color: colors.loss, fontSize: font.size.xs, fontWeight: '800', letterSpacing: 1 },
  realBadge: { backgroundColor: colors.profitDim, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.profit, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  realBadgeTxt: { color: colors.profit, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, fontFamily: font.family.bodyBold },
  simBadge: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  simBadgeTxt: { color: colors.textTertiary, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, fontFamily: font.family.bodyBold },
  league: { color: colors.textTertiary, fontSize: font.size.xs, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { alignItems: 'flex-start', width: 96, gap: 2 },
  teamName: { color: colors.text, fontSize: font.size.sm, fontWeight: '800', marginTop: 2 },
  price: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  pctTxt: { fontSize: font.size.xs, fontWeight: '700' },
  scoreBox: { flex: 1, alignItems: 'center' },
  score: { color: colors.text, fontSize: font.size['3xl'], fontWeight: '900', letterSpacing: 1 },
}));
